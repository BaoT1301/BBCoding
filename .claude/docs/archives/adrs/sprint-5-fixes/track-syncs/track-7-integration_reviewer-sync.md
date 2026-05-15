# State Sync Draft — Track 7: Integration Review

**Persona:** integration_reviewer
**Sprint:** sprint-2.0-mcp-fixes
**Date:** 2026-05-14
**Status:** COMPLETE — all cross-track contracts PASS

---

## Verdict: APPROVED ✅

No contract mismatches found. All six feature tracks compose correctly.

---

## Cross-Track Contract Audit

### 1. Track 1 × Track 2: TsconfigResolver instantiation order vs resolveImports

**Claim:** `TsconfigResolver` is instantiated before `resolveImports` is called, and `unresolvedImports` is populated using the tagged `ImportResolution` type from Track 2 (not a separate ad-hoc mechanism).

**Evidence:**
- `TsconfigResolver` is instantiated in `IncrementalIndexer` constructor: `this.tsconfigResolver = new TsconfigResolver(this.workspaceRoot)` — before any file processing.
- `discover()` is called at the top of `buildInitialGraph`, before the file loop.
- `resolveImports` delegates to `resolveTypeScriptImportTagged`, which calls `this.tsconfigResolver.findNearestTsconfig` and `this.tsconfigResolver.resolveAlias`.
- `ImportResolution` tagged union (`resolved | skipped-external | unresolved-relative | unresolved-alias | unresolved-unknown`) is defined once in `src/types/schema.ts` and imported by both `incremental-indexer.ts` and `graph-store.ts`.
- `unresolvedImports` on `FileParseResult` is populated from the same `ImportResolution` discriminant — no parallel ad-hoc mechanism exists.

**Result:** ✅ PASS

---

### 2. Track 2 × Track 5: /api/v1/diag field collisions and degraded OR logic

**Claim:** `/api/v1/diag` has exactly one `importResolution` block (Track 2) and one `memory` block (Track 5), with no field name collisions. `degraded` is a single top-level boolean that ORs both degradation conditions.

**Evidence (from `handleDiag()` in `src/api.ts`):**

Response shape:
```json
{
  "workspaceRoot": "...",
  "resolvedPythonGlobs": [...],
  "resolvedTsGlobs": [...],
  "resolvedIgnores": [...],
  "fileCount": { "total": N, "python": N, "ts": N },
  "clusterHits": { ... },
  "importResolution": {
    "resolvedEdges": N,
    "unresolvedSpecifiers": N,
    "skippedExternals": N,
    "topUnresolvedReasons": { ... }
  },
  "memory": {
    "rssMb": N,
    "heapUsedMb": N,
    "heapTotalMb": N,
    "heapLimitMb": N,
    "external": N,
    "degraded": bool
  },
  "degraded": bool,
  "reasons": [...]
}
```

- Exactly one `importResolution` block. Exactly one `memory` block. No field name collision.
- Top-level `degraded` = `this.degradedState.degraded || degradedReasons.length > this.degradedState.reasons.length || memoryDegraded`
  - `this.degradedState.degraded` trips on `indexed 0 files` (set by `server.ts` after indexing)
  - `degradedReasons` grows when `unresolvedSpecifiers > 10 && ratio > 0.25` (Track 2 condition)
  - `memoryDegraded` trips when `heapUsedMb / heapLimitMb > 0.85` (Track 5 condition)
- All three conditions are ORed into the single top-level `degraded` boolean.

**Result:** ✅ PASS

---

### 3. Track 3 × Track 1: No remaining hardcoded layout assumptions

**Claim:** Removing the `backend/` Python fallback (Track 3) and removing the `frontend/src` TS alias hardcode (Track 1) leave no remaining hardcoded layout assumptions in `incremental-indexer.ts` or `server.ts`.

**Evidence:**

`src/server.ts` — `resolveWorkspaceRoot()`:
```ts
function resolveWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  return process.cwd();
}
```
No directory-walk heuristic. No `hasBackend && hasFrontend` check.

`src/indexer/incremental-indexer.ts` — `resolvePythonModule()`:
```ts
const candidates = [
  path.join(this.workspaceRoot, `${modulePath}.py`),
  path.join(this.workspaceRoot, modulePath, "__init__.py"),
].map(normalize);
```
No `backend/` fallback candidates.

`resolveTypeScriptImportTagged()`: The `@/` alias branch uses `this.tsconfigResolver` exclusively. The legacy `frontend/src` hardcode is gated behind `TS_LEGACY_FRONTEND_ALIAS === "1"` (default off).

**Result:** ✅ PASS

---

### 4. Track 4 × Track 2: ToolInputError vs unresolved-import error shape consistency

**Claim:** `ToolInputError` (Track 4) and the unresolved-import error path (Track 2) use consistent error shapes in MCP tool responses.

**Evidence:**

Track 4 error shape (via `toolInputErrorResponse` in `src/api.ts`):
```json
{ "error": "<message>", "code": "INVALID_PARAMS", "retryable": false }
```

Track 2 unresolved-import path: `resolveImports` populates `parseResult.unresolvedImports` — this is a **data field**, not an MCP error response. It surfaces through `GET /api/v1/mcp/unresolved_imports` as structured data (`{ totalFiles, totalSpecifiers, entries, truncated }`), not as an error response.

The `handleGetUnresolvedImports` handler uses `toolInputErrorResponse` for bad glob input (consistent with Track 4). There is no separate error shape for unresolved imports — they are data, not errors.

No shape inconsistency exists between the two tracks.

**Result:** ✅ PASS

---

### 5. Track 5 × Track 6: setReady wiring in warm and cold paths; smoke test polls /api/ready

**Claim:** `setReady(true)` is called after `buildInitialGraph` completes in both the warm-snapshot and cold-index paths, and the smoke test in Track 6 correctly polls `/api/ready`.

**Evidence (from `src/server.ts` bootstrap):**

```ts
// Mark not-ready before indexing begins
if (httpApi) httpApi.setReady(false);

if (snapshot) {
  // WARM PATH
  graphStore.importFromSnapshot(snapshot.graph, snapshot.fileHashes);
  const delta = await indexer.buildDeltaGraph(snapshot.fileHashes);
  initial = { indexedFiles: delta.reused + delta.reparsed };
} else {
  // COLD PATH
  initial = await indexer.buildInitialGraph(...);
}

// Mark ready after indexing completes (both warm and cold paths)
if (httpApi) httpApi.setReady(true);
```

`setReady(false)` is called before the `if (snapshot)` branch — covers both paths.
`setReady(true)` is called after the `if/else` block — covers both paths.

Track 6 sync doc confirms: "Extended `mcp-sh-smoke.test.ts`: added cold-start case that deletes `.mcp-cache/graph-snapshot.json`, calls `./mcp.sh up`, polls `/api/ready` until `200` or 90s timeout."

**Result:** ✅ PASS

---

## Full Test Suite Output

```
Test Files  3 failed (pre-existing) | 42 passed (45)
      Tests  3 failed (pre-existing) | 433 passed | 1 skipped (437)
```

**Pre-existing failures (all 3 unrelated to this sprint):**
- `bootstrap-fresh-clone.test.ts` — `DEFAULT_IGNORE_PATTERNS` missing `mcp-context-*` exclude
- `fresh-clone-defaults.test.ts` — same
- `indexer-env-globs.test.ts` — same

These failures predate sprint-2.0-mcp-fixes and are out of scope for all six feature tracks.

**No regressions introduced by this sprint.**

---

## API Contract Files — No Updates Required

All changes in this sprint were additive:
- `/api/v1/diag` gained `importResolution` and `memory` blocks (no existing fields changed)
- `/api/v1/mcp/unresolved_imports` is a new endpoint (no conflict)
- `/api/ready` is a new endpoint (no conflict)
- Tool response shapes gained optional `reason` field (additive)

The existing `mcp-diag-api.md` contract should be updated by the Knowledge Manager (Track 8) to document the new `importResolution` and `memory` blocks, as noted in the Track 2 and Track 5 sync docs.

---

## Ripple Effect Assessment

No contract mismatches found. No issues to route to `issues.md`. Track 7 is COMPLETE.
