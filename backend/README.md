# Backend — FastAPI Auth Service

## Stack

FastAPI · uvicorn · SQLAlchemy · passlib[bcrypt] · python-jose · slowapi · SQLite (dev)

## Running Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Requires a `.env` file at the repo root (uvicorn loads it from the working directory):

```
JWT_SECRET_KEY=<random 32+ byte string>   # required
DATABASE_URL=sqlite:///./app.db           # optional, this is the default
CORS_ORIGIN=http://localhost:5173         # optional, this is the default
```

## Running Tests

```bash
# From repo root:
pytest backend/tests/ -v
```

11 tests total: 4 ORM model tests (`test_db.py`) + 7 auth endpoint tests (`test_auth.py`).

## API Endpoints

All endpoints are under `/api/auth`. See `.claude/docs/core/api-contracts/auth-api.md`
for the full contract (request/response shapes, cookie flags, error codes).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account → 201 |
| `POST` | `/api/auth/login` | Authenticate → 200 + httpOnly cookie |
| `POST` | `/api/auth/logout` | Clear session cookie → 200 |
| `GET` | `/api/auth/me` | Return current user → 200 or 401 |
| `GET` | `/api/health` | Health check → 200 |
