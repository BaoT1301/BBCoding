# Instruction: Upstream sprint-2.0-mcp-fixes to the mcp-context-manager Template

**For:** `product_architect`
**Date:** 2026-05-14
**Source of truth:** This repo's already-patched service at `.tools/mcp-context-manager/services/mcp-context-manager/`
**Target:** The upstream mcp-context-manager template repository

---

## Context

All six fixes (FIX-01 through FIX-05b) from `sprint-2.0-mcp-fixes` have been implemented, tested (433 passing, 0 regressions), and documented in this repo. The upstream template still has the original broken defaults. This instruction tells you exactly what to port and where.

The sprint review is at `.tools/mcp-context-manager/.claude/docs/reviews/2026-05-14-sprint-2.0-mcp-fixes.md`. The per-fix design specs are in this folder (`FIX-01` through `FIX-05`). The already-working code is the reference implementation — read it, don't re-derive it.

---

## What to Port (in order)

### 1. FIX-01 — tsconfig-aware alias resolver

**New file to copy:**
- `src/indexer/tsconfig-resolver.ts` → template verbatim

**Modified file — `src/indexer/incremental-indexer.ts`:**
- Constructor: add `this.tsconfigResolver = new TsconfigResolver(this.workspaceRoot)`
- `buildInitialGraph`: add `await this.tsconfigResolver.discover()` at the top
- Replace the `if (importValue.startsWith("@/"))` hardcode with `this.tsconfigResolver` lookup
- Extract `resolveCandidate(basePath)` private helper
- Add `TS_LEGACY_FRONTEND_ALIAS` env var guard for the old hardcode

**Modified file — `src/server.ts`:**
- Add chokidar watcher for `**/tsconfig*.json` → calls `indexer.tsconfigResolver.invalidate(filePath)`

**New test file to copy:**
- `src/__tests__/tsconfig-alias-resolver.test.ts` → template verbatim

---

### 2. FIX-02 — Unresolved import diagnostics

**Modified file — `src/types/schema.ts`:**
- Add `ImportResolution` tagged union
- Add `UnresolvedImportEntry` interface
- Add `unresolvedImports?: UnresolvedImportEntry[]` to `FileParseResult`

**Modified file — `src/indexer/incremental-indexer.ts`:**
- Add `resolveTypeScriptImportTagged()` returning `ImportResolution`
- Update `resolveImports()` to populate `parseResult.unresolvedImports`
- Add structured log at end of `buildInitialGraph`

**Modified file — `src/graph/graph-store.ts`:**
- Add `unresolvedImportsByFile` Map
- Update `upsertFileResult` and `removeFileData`
- Add `getUnresolvedImports(filePattern?)` and `getUnresolvedSummary()` public methods

**Modified file — `src/api.ts`:**
- Extend `handleDiag()` with `importResolution` block and degraded-ratio logic
- Add `handleGetUnresolvedImports()` handler
- Register `GET /api/v1/mcp/unresolved_imports` route

**New test file to copy:**
- `src/__tests__/unresolved-imports.test.ts` → template verbatim

---

### 3. FIX-03 — Layout-agnostic defaults

**Modified file — `src/watcher/file-watcher.ts`:**
- `DEFAULT_WATCH_DIRS`: `["backend", "frontend/src", "services"]` → `["."]`

**Modified file — `src/indexer/incremental-indexer.ts`:**
- `resolvePythonModule`: remove the two `backend/` fallback candidates

**Modified file — `src/server.ts`:**
- `resolveWorkspaceRoot()`: remove `hasBackend && hasFrontend` heuristic; replace with `WORKSPACE_ROOT` env → `process.cwd()`

**Modified file — `services/mcp-context-manager/cluster-config.json`:**
- Replace project-specific clusters with the single generic template:
  ```json
  { "clusters": [{ "id": "root", "path": "./", "label": "Workspace", "color": "#4A90D9" }] }
  ```

**Modified file — `docker-compose.mcp.yml`:**
- Comment out the `cluster-config.json` overlay mount line with an explanatory comment

**New test file to copy:**
- `src/__tests__/arbitrary-layout.test.ts` → template verbatim (plus `src/__tests__/fixtures/arbitrary-layout/`)

---

### 4. FIX-04 — Tool input validation

**New files to copy verbatim:**
- `src/utils/tool-input-error.ts`
- `src/__tests__/tool-input-validation.test.ts`
- `docs/TOOLS-CHEATSHEET.md`

**Modified file — `src/utils/glob-utils.ts`:**
- Add `validateGlob(glob: string): void`
- Add `validateRegex(pattern: string): RegExp`

**Modified file — `src/api.ts`:**
- Add `toolInputErrorResponse()` helper
- Add `zeroFilesReason()` helper
- Wire `validateGlob` / `validateRegex` at the top of every tool handler that accepts `file_pattern` or `pattern`
- Add `reason` field to zero-result responses

---

### 5. FIX-05a — Readiness endpoint and memory diagnostics

**Modified file — `src/api.ts`:**
- Add `setReady(flag: boolean)` / `isReady()` on `HttpApiServer`
- Add `GET /api/ready` handler (503 while indexing, 200 when ready)
- Extend `handleDiag()` with `memory` block and `memoryDegraded` condition

**Modified file — `src/server.ts`:**
- Call `httpApi.setReady(false)` before indexing
- Call `httpApi.setReady(true)` after both warm and cold paths complete

**Modified file — `docker-compose.mcp.yml`:**
- Switch healthcheck `test` URL from `/api/health` to `/api/ready`
- Set `interval: 5s`, `timeout: 5s`, `retries: 12`, `start_period: 60s`
- Add `NODE_OPTIONS=--max-old-space-size=1024` to environment
- Add `deploy.resources.limits.memory: 1536M`

**Modified file — `services/mcp-context-manager/Dockerfile`:**
- Add `ENV NODE_OPTIONS="--max-old-space-size=1024"` in production stage

**New test files to copy:**
- `src/__tests__/healthcheck-payload.test.ts`
- `src/__tests__/diag-memory.test.ts`

---

### 6. FIX-05b — Snapshot lifecycle

**Modified file — `src/graph/graph-persistence.ts`:**
- Add `cleanupTempSnapshots(snapshotPath: string): Promise<void>`
- Add `isSnapshotStale(snapshotPath: string, maxAgeDays: number): Promise<boolean>`

**Modified file — `src/server.ts`:**
- Before `loadSnapshot`: call `cleanupTempSnapshots`, read `GRAPH_SNAPSHOT_MAX_AGE` env (default `"7"`), skip snapshot if stale
- After snapshot load: emit `[graph-store] loaded snapshot: X nodes, Y edges, Z KB, age N min`

**New test file to copy:**
- `src/__tests__/snapshot-staleness.test.ts` → template verbatim

**New doc file to copy:**
- `docs/OPERATIONS.md` → template verbatim

---

## Verification

After porting all six fixes, run inside the template's `services/mcp-context-manager/`:

```bash
npm test
```

Expected: all tests pass, 0 regressions. The three pre-existing failures (`bootstrap-fresh-clone`, `fresh-clone-defaults`, `indexer-env-globs`) about `DEFAULT_IGNORE_PATTERNS` are known and pre-date this sprint — do not count them as regressions.

Then:

```bash
./mcp.sh down && ./mcp.sh up
curl http://localhost:3001/api/ready        # → {"ready":true}
curl http://localhost:3001/api/v1/diag | jq '.degraded'  # → false
curl http://localhost:3001/api/v1/mcp/unresolved_imports | jq '.totalSpecifiers'
```

---

## What NOT to port

- Any collab-guard, extension, or Supabase-specific code — this is a generic template fix only.
- The `active_task.md` sprint file — that's internal to this repo's workflow.
- The `.claude/docs/reviews/` and `.claude/docs/issues/archives/` sprint artifacts — those are repo-specific history.
