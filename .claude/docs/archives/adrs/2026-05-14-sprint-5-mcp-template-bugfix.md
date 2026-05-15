# ADR: Sprint 5 — MCP Template Bugfix (2026-05-14)

**Sprint ID:** sprint-5-mcp-template-bugfix
**Approach:** D — Port all 6 fixes + doc/config updates in one sprint
**Decision:** Approach D chosen because the code was already written and tested in a sibling repo; this sprint was a porting exercise, not a design sprint.

---

## What Broke

Four incident reports filed in `mcp-error/` identified the root causes:

1. **Hardcoded `@/* → frontend/src/*` alias (FIX-01):** Every `get_file_dependents` / `get_impact_analysis` call returned empty results for alias-importing files. The resolver assumed a single monorepo layout.
2. **Silent import resolution failures (FIX-02):** Unresolved imports were silently dropped. No diagnostic surface existed to identify which files had broken dependency edges.
3. **Monorepo-specific defaults (FIX-03):** `DEFAULT_WATCH_DIRS = ["backend", "frontend/src", "services"]` caused the indexer to report 0 files on any non-monorepo workspace. The `resolveWorkspaceRoot()` heuristic also assumed `backend/` and `frontend/` directories.
4. **No input validation on tool globs/regex (FIX-04):** Comma-separated globs and invalid regex patterns caused silent zero-result responses with no actionable feedback, leading to agent error loops.
5. **Fragile cold-start healthcheck + OOM risk (FIX-05a):** Docker healthcheck polled `/api/health` (liveness) instead of a readiness probe, causing containers to be marked healthy before indexing completed. Memory limit was 512 MB — insufficient for large workspaces.
6. **No snapshot staleness guard (FIX-05b):** Stale snapshots from weeks-old index runs were loaded silently, serving outdated graph data.

---

## What Was Fixed

**FIX-01 — tsconfig-aware Alias Resolver (Track 1, internal_tooling_engineer):**
Created `TsconfigResolver` class that discovers all `tsconfig*.json` files under the workspace root, resolves `compilerOptions.paths` aliases using nearest-ancestor matching, follows `extends` chains with a cycle guard, and supports JSONC (comments + trailing commas) without new dependencies. The old `@/* → frontend/src/*` hardcode is gated behind `TS_LEGACY_FRONTEND_ALIAS=1` (default off). +15 tests.

**FIX-02 — Unresolved Import Diagnostics (Track 2, backend_engineer):**
Added `ImportResolution` tagged union (`resolved | skipped-external | unresolved-relative | unresolved-alias | unresolved-unknown`) as the single source of truth. Unresolved imports are now stored per-file in `GraphStore` and surfaced via a new `GET /api/v1/mcp/unresolved_imports` endpoint and an `importResolution` block in `/api/v1/diag`. Degraded when ratio > 25% with n > 10. +24 tests.

**FIX-03 — Layout-Agnostic Defaults (Track 3, internal_tooling_engineer):**
`DEFAULT_WATCH_DIRS` changed from `["backend", "frontend/src", "services"]` to `["."]`. Removed `backend/` fallback from Python import resolution. Simplified `resolveWorkspaceRoot()` to `WORKSPACE_ROOT` env → `process.cwd()`. Replaced project-specific `cluster-config.json` with a single-cluster generic template. Commented out the cluster-config overlay mount in `docker-compose.mcp.yml`. +3 tests (one previously-failing assertion now passes).

**FIX-04 — Tool Input Validation & Actionable Hints (Track 4, backend_engineer):**
Added `ToolInputError` class, `validateGlob()` (rejects comma-without-braces, absolute paths), and `validateRegex()` (hints for unclosed class / unterminated group). Wired into all 6 tool handlers that accept `file_pattern` or `pattern`. Zero-result responses include a `reason` field when a pattern matched no files. +24 tests.

**FIX-05a — Readiness Probe + Memory Hardening (Track 5, devops_qa_engineer):**
Added `GET /api/ready` endpoint (200 when ready, 503 while indexing). Extended `/api/v1/diag` with a `memory` block. Docker healthcheck switched to `/api/ready` with `interval: 5s`, `retries: 12`, `start_period: 60s`. Memory limit raised from 512 MB to 1536 MB. `NODE_OPTIONS=--max-old-space-size=1024` added to Dockerfile and compose. +8 tests.

**FIX-05b — Snapshot Lifecycle (Track 5, devops_qa_engineer):**
Added `cleanupTempSnapshots()` (deletes `.tmp.*` siblings) and `isSnapshotStale()` (mtime check against `GRAPH_SNAPSHOT_MAX_AGE`, default 7 days). Bootstrap now cleans up temp files, skips stale snapshots, and logs load stats. +7 tests.

**Track 6 — UX Polish + Doc Updates (knowledge_manager):**
README path portability note, `mcp.sh up` 90-second `/api/ready` poll with "✓ Graph ready — N files indexed" output, `mcp.sh doctor` pre-check of `/api/ready`, `mcp-deploy.sh` health URL updated, sprint artifact cleanup in `mcp-context-ui/`.

---

## Test Counts

| Milestone | Passed | Failed | Total |
|-----------|--------|--------|-------|
| Baseline (pre-sprint) | 358 | 2 | 360 |
| Post-Track 1 | 373 | 2 | 375 |
| Post-Track 2 | 397 | 2 | 399 |
| Post-Track 3 | 399 | 2 | 401 |
| Post-Track 4 | 423 | 2 | 425 |
| Post-Track 5 | 438 | 2 | 440 |
| Final (Track 7 verified) | **438** | **2** | **440** |

The 2 remaining failures are pre-existing `DEFAULT_IGNORE_PATTERNS` assertions in `fresh-clone-defaults.test.ts` and `indexer-env-globs.test.ts` — a test/implementation disagreement predating this sprint (see Pre-existing Issues below).

---

## Files Changed

**`services/mcp-context-manager/src/`**
- `indexer/tsconfig-resolver.ts` — NEW
- `indexer/incremental-indexer.ts` — TsconfigResolver wiring, tagged resolution, layout-agnostic defaults
- `server.ts` — tsconfig watcher, setReady wiring, snapshot lifecycle, simplified workspace root
- `api.ts` — /api/ready, memory block, importResolution block, unresolved_imports route, input validation helpers
- `graph/graph-store.ts` — unresolvedImportsByFile map, getUnresolvedImports, getUnresolvedSummary
- `graph/graph-persistence.ts` — cleanupTempSnapshots, isSnapshotStale
- `types/schema.ts` — ImportResolution union, UnresolvedImportEntry, FileParseResult.unresolvedImports
- `utils/tool-input-error.ts` — NEW
- `utils/glob-utils.ts` — validateGlob, validateRegex
- `watcher/file-watcher.ts` — DEFAULT_WATCH_DIRS → ["."]

**`services/mcp-context-manager/src/__tests__/`**
- `tsconfig-alias-resolver.test.ts` — NEW (+13)
- `unresolved-imports.test.ts` — NEW (+24)
- `arbitrary-layout.test.ts` — NEW (+2)
- `tool-input-validation.test.ts` — NEW (+24)
- `healthcheck-payload.test.ts` — NEW (+4)
- `diag-memory.test.ts` — NEW (+4)
- `snapshot-staleness.test.ts` — NEW (+7)
- `issue4-absolute-paths.test.ts` — extended (+1)
- `cross-cluster-edges.test.ts` — extended (+1)
- `indexer-env-globs.test.ts` — updated default assertion

**`services/mcp-context-manager/src/__tests__/fixtures/`**
- `arbitrary-layout/` — NEW (4 fixture files)

**`services/mcp-context-manager/docs/`**
- `TOOLS-CHEATSHEET.md` — NEW
- `OPERATIONS.md` — NEW

**Root / compose**
- `docker-compose.mcp.yml` — healthcheck URL, interval, retries, start_period, memory 1536M, NODE_OPTIONS, cluster-config overlay commented out
- `services/mcp-context-manager/Dockerfile` — ENV NODE_OPTIONS
- `services/mcp-context-manager/cluster-config.json` — generic single-cluster template
- `mcp.sh` — /api/ready poll in up, /api/ready pre-check in doctor
- `mcp-deploy.sh` — HEALTH_URL → /api/ready, HEALTH_TIMEOUT → 90
- `README.md` — path portability note, watch defaults, memory cap, /api/ready mention
- `.env.mcp.example` — path portability comment
- `.env.mcp` — TS_WATCH_GLOBS comment updated

**Deleted (sprint artifacts)**
- `services/mcp-context-ui/SCHEMA-FIX.md`
- `services/mcp-context-ui/VERIFICATION.md`
- `services/mcp-context-ui/verify-schema-fix.sh`

---

## Lessons Learned

1. **Hardcoded layout assumptions are the #1 template adoption blocker.** Any path that assumes `backend/`, `frontend/src/`, or `services/` will silently fail for every adopter with a different structure.
2. **Silent failures waste more time than loud failures.** Dropped imports with no diagnostic output caused hours of debugging. Observable failures with reason codes resolve in minutes.
3. **Cold-start memory sizing must be tested in CI, not discovered in production.** 512 MB was insufficient for workspaces with 200+ files. The 1536 MB limit with a V8 heap cap is the correct default.
4. **Input validation with hints prevents agent error loops.** Without actionable error messages, AI agents retry the same malformed query repeatedly.

---

## Pre-existing Issues Carried Forward

Two test failures predate this sprint and were not introduced by any track:

| File | Test | Root Cause |
|------|------|------------|
| `fresh-clone-defaults.test.ts` | DEFAULT_IGNORE_PATTERNS includes mcp-context-* | Test expects `**/services/mcp-context-*/**` in `DEFAULT_IGNORE_PATTERNS`; implementation intentionally omits it to avoid blocking the service's own source when this repo is the indexed workspace |
| `indexer-env-globs.test.ts` | DEFAULT_IGNORE_PATTERNS includes mcp-context-* | Same root cause |

Resolution: update the tests to match the intentional design, or add a conditional guard. Deferred to a future sprint.
