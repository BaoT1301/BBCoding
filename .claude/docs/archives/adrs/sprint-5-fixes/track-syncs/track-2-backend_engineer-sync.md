# State Sync Draft — Track 2 (FIX-02)

**Track:** 2 — Surface Unresolved Imports as Observable Diagnostics
**Persona:** `backend_engineer`
**Date:** 2026-05-14
**Status:** COMPLETE
**Test delta:** 371 → 392 passed (+21 new, all green). 3 pre-existing failures unchanged.

---

## Summary of Changes

### Files Modified

| File | Change |
|------|--------|
| `src/types/schema.ts` | Added `ImportResolution` tagged union, `UnresolvedImportEntry` interface, `unresolvedImports?` field on `FileParseResult` |
| `src/indexer/incremental-indexer.ts` | Added `resolveTypeScriptImportTagged()` returning `ImportResolution`, `buildCandidates()` helper, updated `resolveImports()` to populate `parseResult.unresolvedImports`, added structured log at end of `buildInitialGraph` |
| `src/graph/graph-store.ts` | Added `unresolvedImportsByFile` Map, updated `upsertFileResult` and `removeFileData`, added `getUnresolvedImports(filePattern?)` and `getUnresolvedSummary()` public methods, added private `makeGlobMatcher()` helper |
| `src/api.ts` | Extended `handleDiag()` with `importResolution` block and degraded-ratio logic; added `handleGetUnresolvedImports()` handler; registered `GET /api/v1/mcp/unresolved_imports` route |
| `src/__tests__/unresolved-imports.test.ts` | New test file — 21 tests covering all FIX-02 cases |

---

## Required README.md Updates

In `services/mcp-context-manager/README.md`, add under **MCP Tools**:

```
### get_unresolved_imports
GET /api/v1/mcp/unresolved_imports?file_pattern=&limit=&reason=

Returns files with unresolved import specifiers. Useful for diagnosing empty
dependency results. Response: { totalFiles, totalSpecifiers, entries, truncated }.
```

Add under **Diagnostics (`/api/v1/diag`)**:

```
New field `importResolution`:
  - resolvedEdges: number of successfully resolved import edges
  - unresolvedSpecifiers: count of imports that could not be resolved
  - skippedExternals: bare specifiers (node_modules) that were intentionally skipped
  - topUnresolvedReasons: breakdown by reason code

`degraded` now also trips when unresolvedSpecifiers / (unresolvedSpecifiers + resolvedEdges) > 0.25
AND unresolvedSpecifiers > 10. Reason added: "high-unresolved-import-ratio".
```

---

## Required local_context.md Updates

In `.tools/mcp-context-manager/.claude/local_context.md`, under **Key Files**:

- `src/types/schema.ts` — now exports `ImportResolution` tagged union and `UnresolvedImportEntry`
- `src/graph/graph-store.ts` — now exposes `getUnresolvedImports()` and `getUnresolvedSummary()`

Under **Known Limitations**, remove or update:

> "Unresolved imports are silently dropped" — **RESOLVED by FIX-02**. Unresolved imports are now classified, stored per-file, and surfaced via `/api/v1/mcp/unresolved_imports` and `/api/v1/diag`.

---

## Required infrastructure.md Updates

No infrastructure changes. No new dependencies. No deployment script changes.

---

## API Contract Update Required

The `/api/v1/diag` response shape has changed (additive). The Knowledge Manager should update
`.tools/mcp-context-manager/.claude/docs/core/api-contracts/mcp-diag-api.md` to add:

```diff
+ "importResolution": {
+   "resolvedEdges": 178,
+   "unresolvedSpecifiers": 42,
+   "skippedExternals": 612,
+   "topUnresolvedReasons": { "alias-no-match": 38, "missing-file": 4 }
+ },
```

And update the degraded conditions table:

| Condition | `degraded` | `reasons` entry |
|-----------|-----------|-----------------|
| Initial index returned 0 files | `true` | `"indexed 0 files"` |
| unresolvedSpecifiers > 10 AND ratio > 25% | `true` | `"high-unresolved-import-ratio"` |

---

## Ripple Effect Assessment

- `/api/v1/diag` response gains new fields (additive — backwards-compatible). ✅
- No existing field types changed or removed. ✅
- `resolveTypeScriptImport` signature unchanged (still returns `string | null`). ✅
- `FileParseResult.unresolvedImports` is optional — no existing callers break. ✅
- `GraphStore.upsertFileResult` signature unchanged. ✅
- New `GET /api/v1/mcp/unresolved_imports` route does not conflict with any existing route. ✅

---

## Test Output (Post-flight)

```
Test Files  3 failed | 37 passed (40)
      Tests  3 failed | 392 passed (395)
```

The 3 failures are pre-existing (bootstrap-fresh-clone, fresh-clone-defaults, indexer-env-globs —
all about DEFAULT_IGNORE_PATTERNS, unrelated to Track 2). All 21 new Track 2 tests pass.
