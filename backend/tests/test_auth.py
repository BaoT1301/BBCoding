import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

# StaticPool ensures all sessions share one in-memory connection so
# create_all() and request handlers see the same SQLite database.
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


def _override_get_db():
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_limiter():
    yield
    from app.limiter import limiter
    limiter._storage.reset()


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def test_register_success(client):
    res = client.post("/api/auth/register", json={"email": "user@test.com", "password": "password123"})
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == "user@test.com"
    assert "id" in body


def test_register_duplicate(client):
    res = client.post("/api/auth/register", json={"email": "user@test.com", "password": "password123"})
    assert res.status_code == 409
    assert res.json()["detail"] == "Email already registered"


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_correct_sets_cookie(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "password123", "remember_me": False},
    )
    assert res.status_code == 200
    assert res.json() == {"email": "user@test.com"}
    assert "access_token" in client.cookies


def test_login_wrong_password_returns_401(client):
    res = client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "wrongpassword", "remember_me": False},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


# ---------------------------------------------------------------------------
# /me
# ---------------------------------------------------------------------------

def test_login_then_me_returns_user(client):
    client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "password123", "remember_me": False},
    )
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    data = me.json()
    assert data["email"] == "user@test.com"
    assert "id" in data


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

def test_logout_then_me_returns_401(client):
    client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "password123", "remember_me": False},
    )
    logout = client.post("/api/auth/logout")
    assert logout.status_code == 200
    assert logout.json() == {"message": "Logged out"}
    # httpx removes the cookie when Max-Age=0 is received; /me must now 401
    me = client.get("/api/auth/me")
    assert me.status_code == 401


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def test_rate_limit_on_sixth_login_attempt(client):
    # 5 allowed attempts (all return 401 for wrong password)
    for _ in range(5):
        client.post(
            "/api/auth/login",
            json={"email": "user@test.com", "password": "wrongpassword", "remember_me": False},
        )
    # 6th attempt must be rate-limited
    res = client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "wrongpassword", "remember_me": False},
    )
    assert res.status_code == 429
    assert res.json()["detail"] == "Too many attempts. Try again later."
