import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User


@pytest.fixture(scope="module")
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def test_user_table_exists(db_session):
    result = db_session.execute(
        __import__("sqlalchemy").text("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    ).fetchone()
    assert result is not None, "users table was not created"


def test_create_and_query_user(db_session):
    user_id = str(uuid.uuid4())
    user = User(id=user_id, email="test@example.com", hashed_password="hashed_pw_value")
    db_session.add(user)
    db_session.commit()

    fetched = db_session.query(User).filter_by(email="test@example.com").first()
    assert fetched is not None
    assert fetched.id == user_id
    assert fetched.email == "test@example.com"
    assert fetched.hashed_password == "hashed_pw_value"
    assert fetched.created_at is not None


def test_user_email_unique_constraint(db_session):
    from sqlalchemy.exc import IntegrityError
    db_session.add(User(id=str(uuid.uuid4()), email="dupe@example.com", hashed_password="pw1"))
    db_session.commit()

    db_session.add(User(id=str(uuid.uuid4()), email="dupe@example.com", hashed_password="pw2"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_user_id_defaults_to_uuid(db_session):
    user = User(email="auto-id@example.com", hashed_password="pw")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    assert user.id is not None
    uuid.UUID(user.id)  # raises ValueError if not a valid UUID
