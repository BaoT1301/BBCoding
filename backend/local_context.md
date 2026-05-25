# Backend Local Context

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | FastAPI | >=0.111.0 |
| Server | uvicorn[standard] | >=0.29.0 |
| ORM | SQLAlchemy | >=2.0.0 |
| Auth | python-jose[cryptography], passlib[bcrypt] | latest |
| Rate Limiting | slowapi | >=0.1.9 |
| Validation | pydantic[email] | >=2.7.0 |
| Database | SQLite (dev) via `DATABASE_URL` env var | — |

## Project Layout

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app factory, CORS, startup
│   ├── database.py      # SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── models.py        # User ORM model
│   ├── schemas.py       # Pydantic: UserCreate, UserOut, LoginRequest, TokenData
│   ├── auth.py          # JWT creation/decoding, bcrypt, get_current_user
│   ├── limiter.py       # slowapi Limiter singleton (rate limiting)
│   └── routers/
│       └── auth.py      # /register /login /logout /me endpoints
├── tests/
│   ├── __init__.py
│   ├── conftest.py      # Sets JWT_SECRET_KEY for test environment
│   ├── test_db.py       # 4 ORM model tests
│   └── test_auth.py     # 7 auth endpoint tests
├── Dockerfile
├── requirements.txt
├── .env.example
└── local_context.md
```

## Test Runner

`pytest` — run from repo root: `pytest backend/tests/`

## Constraints

- All secrets (`JWT_SECRET_KEY`, `DATABASE_URL`, `CORS_ORIGIN`) come from `.env` only — never hardcoded.
- Auth transport: httpOnly cookie named `access_token` (JWT HS256).
- Database defaults to SQLite for local dev; switch to Postgres via `DATABASE_URL` env var.
- API contract is the single source of truth: `.claude/docs/core/api-contracts/auth-api.md`.

## Test Notes

- The test suite overrides `get_db` with a `StaticPool` in-memory SQLite connection.
  Without `StaticPool`, each `SessionLocal()` call opens a separate `:memory:` database,
  causing `create_all()` and the dependency to hit different databases. This is
  test infrastructure only — production uses the real engine from `DATABASE_URL`.
- `on_event("startup")` in `main.py` is deprecated in favour of FastAPI `lifespan`
  handlers. Not a blocker; candidate for a future cleanup sprint.
