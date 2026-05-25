# API Contract: Authentication Service

**Version:** 1.0  
**Status:** APPROVED — do not alter without `integration_reviewer` sign-off  
**Date:** 2026-05-24  
**Owner:** Product Architect  
**Consumers:** `/frontend` (React SPA)  
**Producer:** `/backend` (FastAPI)

---

## Transport & Auth Mechanism

- **Base URL:** `/api/auth`
- **Auth mechanism:** httpOnly cookie named `access_token` (JWT, HS256)
  - Default session: `maxAge = 86400` (1 day)
  - Remember-me session: `maxAge = 2592000` (30 days)
  - Cookie flags: `HttpOnly=true`, `SameSite=Lax`, `Secure=true` (dev: `Secure=false`)
- **CORS:** Allow origin `http://localhost:5173` (Vite dev) with `allow_credentials=True`
- All request/response bodies are `application/json`

---

## Endpoints

### `POST /api/auth/register`

Create a new user account.

**Request body:**
```json
{
  "email": "string (valid email, max 255 chars)",
  "password": "string (min 8 chars)"
}
```

**Responses:**

| Status | Body | When |
|--------|------|------|
| 201 | `{ "id": "string (uuid)", "email": "string" }` | Account created |
| 409 | `{ "detail": "Email already registered" }` | Duplicate email |
| 422 | FastAPI validation error schema | Malformed body |

**Side effects:** None (no email sent — email verification out of scope).

---

### `POST /api/auth/login`

Authenticate and receive a session cookie.

**Request body:**
```json
{
  "email": "string",
  "password": "string",
  "remember_me": "boolean"
}
```

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ "email": "string" }` | Success — also sets `access_token` cookie |
| 401 | `{ "detail": "Invalid credentials" }` | Wrong email or password |
| 429 | `{ "detail": "Too many attempts. Try again later." }` | Rate limit hit (5 req/min per IP) |
| 422 | FastAPI validation error schema | Malformed body |

**Cookie set on success:**
```
Set-Cookie: access_token=<JWT>; Path=/; HttpOnly; SameSite=Lax; Max-Age=<86400|2592000>
```

---

### `POST /api/auth/logout`

Clear the session cookie.

**Request body:** None required.

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ "message": "Logged out" }` | Always (idempotent) |

**Cookie cleared on response:**
```
Set-Cookie: access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

---

### `GET /api/auth/me`

Return the currently authenticated user. Used by the frontend to rehydrate auth state on page load.

**Request:** Cookie `access_token` must be present and valid.

**Responses:**

| Status | Body | When |
|--------|------|------|
| 200 | `{ "id": "string (uuid)", "email": "string" }` | Valid token |
| 401 | `{ "detail": "Not authenticated" }` | Missing or expired token |

---

## JWT Payload Schema

```json
{
  "sub": "string (user uuid)",
  "email": "string",
  "exp": "integer (unix timestamp)"
}
```

Secret key sourced from env var `JWT_SECRET_KEY`. Never hardcoded.

---

## Database Schema

**Table: `users`**

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT (UUID v4) | PRIMARY KEY |
| `email` | TEXT | UNIQUE, NOT NULL, indexed |
| `hashed_password` | TEXT | NOT NULL |
| `created_at` | DATETIME | NOT NULL, default now() |

---

## Environment Variables (Backend)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET_KEY` | Yes | Random 32+ byte secret for signing JWTs |
| `JWT_ALGORITHM` | No | Default: `HS256` |
| `DATABASE_URL` | No | Default: `sqlite:///./app.db` |
| `CORS_ORIGIN` | No | Default: `http://localhost:5173` |

---

## Error Shape (all errors)

All error responses follow FastAPI's standard shape:
```json
{ "detail": "human-readable message" }
```

The frontend must key on HTTP status codes, not message strings.
