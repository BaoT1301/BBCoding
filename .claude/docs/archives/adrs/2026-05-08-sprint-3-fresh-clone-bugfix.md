# ADR: Sprint 3 — Fresh-Clone Bootstrap Bug-Fix

**Date:** 2026-05-08
**Sprint:** Sprint 3 — Fresh-Clone Bootstrap Bug-Fix
**Status:** Accepted

## Decision

Seven defects surfaced by a fresh-clone dry-run on the `collab-guard` nested-template layout were resolved in a single bug-fix micro-sprint: (1) Docker Compose now loads `.env.mcp` via `env_file:` and `mcp.sh` auto-copies `.env.mcp.example` → `.env.mcp` on first run, with `validate_workspace()` catching bad `WORKSPACE_PATH` before containers start; (2) the indexer's comma-splitter was replaced with a brace-aware implementation, default glob patterns changed from opinionated paths (`backend/**/*.py`, `frontend/src/**/*.{ts,tsx,js,jsx}`) to workspace-wide (`**/*.py`, `**/*.{ts,tsx,js,jsx}`), and a 14-entry hardcoded exclude list was added with a `WATCH_IGNORES` override; (3) a `GET /api/v1/diag` endpoint and `./mcp.sh doctor` CLI wrapper were added to expose resolved workspace, globs, ignores, file counts, and degraded state; (4) `/api/v1/health` now returns `{ status: "degraded", reasons: [...] }` when the initial index is empty while keeping HTTP 200 so the container stays healthy; and (5) a vitest integration test on the `collab-guard` fixture tree (nested `.tools/mcp-context-manager/` + `collab-guard/src/` + `extension/`) confirms end-to-end correctness with 356 tests green across 37 files.
