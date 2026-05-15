# State Sync Draft — Track 3: FIX-03 Multi-Root Workspace Defaults

**Sprint:** sprint-2.0-mcp-fixes
**Track:** 3
**Persona:** internal_tooling_engineer
**Date:** 2026-05-14
**Status:** COMPLETE

---

## Summary

Removed all hardcoded monorepo layout assumptions (`backend/`, `frontend/src/`, `services/`) from the watcher defaults, Python resolver fallbacks, service-local cluster config, and compose overlay. The service is now layout-agnostic out of the box.

---

## Changes Made

### 1. `src/watcher/file-watcher.ts`
- `DEFAULT_WATCH_DIRS` changed from `["backend", "frontend/src", "services"]` to `["."]`
- Effect: watcher now covers the entire workspace root by default, not a hardcoded monorepo layout

### 2. `src/indexer/incremental-indexer.ts`
- `resolvePythonModule`: removed the two `backend/` fallback candidates
- Remaining candidates: `{workspaceRoot}/{module}.py` and `{workspaceRoot}/{module}/__init__.py`
- Effect: Python import resolution no longer assumes a `backend/` subdirectory

### 3. `services/mcp-context-manager/cluster-config.json`
- Replaced project-specific collab-guard clusters with a single generic template:
  ```json
  { "clusters": [{ "id": "root", "path": "./", "label": "Workspace", "color": "#4A90D9" }] }
  ```
- Effect: fresh clones get a sensible single-cluster default instead of collab-guard-specific config

### 4. `docker-compose.mcp.yml`
- Commented out the `./services/mcp-context-manager/cluster-config.json:/project/cluster-config.json:ro` overlay line
- Added explanatory comment pointing to the opt-in pattern for custom configs
- Effect: compose no longer injects a service-specific cluster config by default

### 5. `src/server.ts`
- `resolveWorkspaceRoot()`: removed the `hasBackend && hasFrontend` directory-walk heuristic
- Simplified to: `WORKSPACE_ROOT` env var → `process.cwd()`
- Removed unused `import fs from "node:fs"` (was only used by the removed heuristic)
- Effect: workspace root detection is explicit and predictable; no silent layout sniffing

---

## Test Changes

### Updated
- `src/__tests__/indexer-env-globs.test.ts`: updated `resolveWatchPaths` default assertion from `["/workspace/backend", "/workspace/frontend/src", "/workspace/services"]` to `["/workspace"]`

### Added
- `src/__tests__/arbitrary-layout.test.ts`: 2 regression tests
  1. `resolveWatchPaths` defaults to workspace root (no `backend/` or `frontend/src/`)
  2. `IncrementalIndexer.buildInitialGraph()` indexes all TS files in an arbitrary layout (`apps/web/src/`, `packages/utils/src/`, `scripts/`)
- `src/__tests__/fixtures/arbitrary-layout/`: 4 TS fixture files across the arbitrary layout

---

## Test Results

**Baseline:** 4 failed | 391 passed (395 total)
**Post-flight:** 3 failed | 394 passed (397 total)

Net: +3 passing tests, 0 new failures introduced.

The 3 remaining failures are pre-existing (missing `**/services/mcp-context-*/**` in `DEFAULT_IGNORE_PATTERNS`) and are out of scope for this track.

---

## Required Updates to Downstream Docs (for Knowledge Manager)

### `services/mcp-context-manager/README.md`
- Update "Default behaviour" section: watcher now covers `.` (workspace root) instead of `backend/`, `frontend/src/`, `services/`
- Add migration note: users relying on the old monorepo defaults should set `PYTHON_WATCH_GLOBS` and `TS_WATCH_GLOBS` explicitly, or set `WORKSPACE_ROOT` to their monorepo root

### `services/mcp-context-manager/.claude/local_context.md`
- **File Patterns → Watch Paths**: update default from `backend/`, `frontend/src/`, `services/` to `.` (workspace root)
- **File Patterns → Python Import Resolution**: remove the `backend/` fallback from the documented candidates
- **Environment Variables → `WORKSPACE_ROOT`**: update default description — remove "Auto-detected by walking up from `cwd` to find `backend/` and `frontend/`"; replace with "Defaults to `process.cwd()` if unset"
- **Docker Configuration → Docker Compose**: remove the `cluster-config.json` overlay line from the example compose snippet (it is now commented out)
- **Known Limitations**: remove "hardcoded layout assumptions" if listed; add note that layout is now fully configurable via env vars

### `docs/SETUP.md`
- Add "Default behaviour" section: workspace-wide indexing from `.` (no layout assumptions)
- Add migration note for users upgrading from a version that assumed `backend/`+`frontend/src/` layout

### `docs/TROUBLESHOOTING.md`
- Add entry: "Indexer finds no files after upgrade" → set `WORKSPACE_ROOT` explicitly or verify `PYTHON_WATCH_GLOBS`/`TS_WATCH_GLOBS`

---

## Ripple Effect Assessment

- `ClusterConfigLoader`: handles single-cluster format correctly (no schema change required — `clusters` array with 1 entry is valid)
- `resolveTypeScriptImport`: unaffected (Track 1 handles TS alias side)
- No API contract changes — no fields added, removed, or renamed
- No new dependencies introduced
