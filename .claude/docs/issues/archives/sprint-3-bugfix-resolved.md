# Resolved Issues — Sprint 3 Bug-Fix (2026-05-08)

Issues resolved during Sprint 3 — Fresh-Clone Bootstrap Bug-Fix.

---

## Defect #1: `.env.mcp` not loaded by Docker Compose

**Root cause:** `docker-compose.mcp.yml` had no `env_file:` directive, so `WORKSPACE_PATH` and other user-defined vars never reached the container.

**Resolution (Track 1):** Added `env_file: .env.mcp` (required: false) to the `mcp-context-manager` service. The explicit `environment:` block (`WORKSPACE_ROOT`, `HTTP_PORT`) is preserved above the env_file merge so those values always win.

---

## Defect #2: No `.env.mcp` auto-copy on fresh clone

**Root cause:** Users had to manually copy `.env.mcp.example` → `.env.mcp` before running `mcp.sh up`, with no guidance if they forgot.

**Resolution (Track 1):** `mcp.sh up` now auto-copies `.env.mcp.example` → `.env.mcp` on first run and prints `✓ Created .env.mcp from .env.mcp.example`. `validate_workspace()` exits with a clear error if `WORKSPACE_PATH` doesn't resolve.

---

## Defect #3: Brace-expansion glob patterns destroyed by naive comma-splitter

**Root cause:** `resolveGlobPatterns()` used `.split(",")` which split `**/*.{ts,tsx,js,jsx}` into four broken fragments.

**Resolution (Track 2):** Replaced with `splitCsvRespectingBraces()` — splits only on commas at depth 0 relative to `{...}`. Extracted to `src/utils/glob-utils.ts` and used in both the indexer and file watcher.

---

## Defect #4: Default glob patterns too opinionated for generic layouts

**Root cause:** Defaults (`backend/**/*.py`, `frontend/src/**/*.{ts,tsx,js,jsx}`, `services/**/*.{ts,tsx,js,jsx}`) only matched the original chuchube-emails layout.

**Resolution (Track 2):** Changed defaults to workspace-wide (`**/*.py`, `**/*.{ts,tsx,js,jsx}`). Added 14-entry hardcoded exclude list with `WATCH_IGNORES` override.

---

## Defect #5: No diagnostics endpoint — impossible to debug indexing issues

**Root cause:** No way to inspect resolved workspace, globs, ignores, or file counts without reading container logs.

**Resolution (Track 3):** Added `GET /api/v1/diag` returning full diagnostics snapshot. Added startup banner logging the same. Added `./mcp.sh doctor` CLI wrapper (Track 4).

---

## Defect #6: `/api/v1/health` returned `ok` even when 0 files indexed

**Root cause:** Health endpoint had no awareness of indexing state — a misconfigured workspace looked healthy.

**Resolution (Track 3):** `/api/v1/health` now returns `{ status: "degraded", reasons: ["indexed 0 files"] }` when initial index is empty. HTTP 200 always (container stays healthy in Docker's view).

---

## Defect #7: No integration test for nested-template layout

**Root cause:** The `collab-guard` tree shape (`.tools/mcp-context-manager/` inside workspace) was never exercised end-to-end.

**Resolution (Track 5):** Added `bootstrap-fresh-clone.test.ts` with 4 tests covering the collab-guard fixture tree. 356 tests / 37 files green.

---

*Archived by `knowledge_manager` on 2026-05-08.*
