# Frontend Local Context

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Build tool | Vite |
| Language | TypeScript (strict) |
| Routing | React Router v6 |
| HTTP client | axios (`withCredentials: true`) |
| Test runner | vitest + @testing-library/react |

## Directory Layout

```
src/
├── api/
│   └── instance.ts        # Single axios instance — all API calls go here
├── context/
│   └── AuthContext.tsx    # Auth state: user, loading, refreshUser, clearUser
├── components/
│   └── ProtectedRoute.tsx # Route guard: redirects unauthenticated users to /login
├── pages/
│   ├── LoginPage.tsx       # Public — email/password/remember-me form
│   ├── RegisterPage.tsx    # Public — registration form
│   └── DashboardPage.tsx   # Protected — welcome + logout
├── __tests__/             # Unit tests (vitest)
└── App.tsx                # BrowserRouter + route definitions, top-level loading spinner
```

## Constraints

- **All API calls must go through `src/api/instance.ts`.** Never import axios directly or create a second instance.
- **No token storage in JS.** Auth is cookie-based (httpOnly). Never read or write `document.cookie` or localStorage for auth.
- **No `any` types.** Strict TypeScript throughout.
- **Auth state is in `AuthContext` only.** Do not duplicate user state in component-local state.

## API Contract

The frontend consumes the contract at `.claude/docs/core/api-contracts/auth-api.md`.

Key shapes:
- `GET /api/auth/me` → `{ id: string, email: string }` (200) or 401
- `POST /api/auth/login` → `{ email: string }` (200) + sets httpOnly cookie
- `POST /api/auth/logout` → `{ message: string }` (200) + clears cookie
- `POST /api/auth/register` → `{ id: string, email: string }` (201) or 409

> The 401 interceptor in `instance.ts` skips the redirect when
> `location.pathname === '/login'` so login-error messages render inline correctly.

## Test Runner

```bash
npm test          # vitest (watch mode)
npm run build     # tsc -b && vite build (type + bundle check)
```
