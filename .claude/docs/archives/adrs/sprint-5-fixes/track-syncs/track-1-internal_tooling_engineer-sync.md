# State Sync Draft — Track 1 FIX-01
**Persona:** internal_tooling_engineer  
**Sprint:** sprint-2.0-mcp-fixes  
**Date:** 2026-05-14  
**Status:** COMPLETE

---

## Summary

Replaced the hardcoded `@/* → frontend/src/*` alias in `resolveTypeScriptImport` with a nearest-ancestor `tsconfig*.json` resolver. This was the P0 blocker causing every `get_file_dependents` / `get_impact_analysis` call to return empty results for alias-importing files.

---

## Files Changed

| File | Change |
|------|--------|
| `src/indexer/tsconfig-resolver.ts` | **NEW** — `TsconfigResolver` class |
| `src/indexer/incremental-indexer.ts` | Wired `TsconfigResolver`; replaced alias branch; extracted `resolveCandidate` |
| `src/server.ts` | Added chokidar watcher for `**/tsconfig*.json` → `invalidate()` |
| `src/__tests__/tsconfig-alias-resolver.test.ts` | **NEW** — 12 table-driven tests |
| `src/__tests__/issue4-absolute-paths.test.ts` | Extended with extension-style alias case (test 7) |
| `src/__tests__/cross-cluster-edges.test.ts` | Extended with alias-resolved cross-cluster edge case |

---

## Test Results

| | Count |
|---|---|
| Baseline (pre-Track 1) | 357 passed, 3 failed |
| Post-flight (post-Track 1) | **371 passed, 3 failed** |
| New tests added | **14** |
| Pre-existing failures (unchanged) | bootstrap-fresh-clone, fresh-clone-defaults, indexer-env-globs |

---

## 1. Required README.md Updates

**File:** `services/mcp-context-manager/README.md`

Add a new section under "Import Resolution":

```
### TypeScript Path Aliases

The indexer automatically discovers all `tsconfig*.json` files under the workspace root
(honouring `WATCH_IGNORES`) and resolves `compilerOptions.paths` aliases at index time.

- Nearest-ancestor config wins (deepest directory match).
- `tsconfig.json` is preferred over variant names (e.g. `tsconfig.base.json`) when both
  are in the same directory.
- `extends` chains are followed with a cycle guard.
- JSONC (comments + trailing commas) is supported without extra dependencies.
- Set `TS_LEGACY_FRONTEND_ALIAS=1` to re-enable the old `@/* → frontend/src/*` hardcode
  for one-release backwards compatibility (default: off).
```

---

## 2. Required local_context.md Updates

**File:** `.tools/mcp-context-manager/.claude/local_context.md`

### Section: "Import Resolution → TypeScript"

Replace:
> Resolves alias imports: `@/components` → `frontend/src/components`

With:
> Resolves alias imports via nearest-ancestor `tsconfig*.json` `compilerOptions.paths`.
> Falls back to `TS_LEGACY_FRONTEND_ALIAS=1` env var for the old `frontend/src` hardcode.

### Section: "Known Limitations"

Remove:
> (implicit) hardcoded `@/* → frontend/src/*` alias

Add:
> TypeScript alias resolution requires a `tsconfig.json` with `compilerOptions.paths` in
> the workspace. Files with aliases but no tsconfig will have those imports unresolved
> (they will appear as unresolved in Track 2 diagnostics).

### Section: "Environment Variables → Optional"

Add:
```
- **`TS_LEGACY_FRONTEND_ALIAS`**: Set to `1` to re-enable the legacy `@/* → frontend/src/*`
  alias hardcode. Default: off. Intended for one-release migration window only.
```

---

## 3. Required infrastructure.md / deployment script Updates

**File:** `.claude/docs/architecture/infrastructure.md`

No structural changes required. The `TsconfigResolver` is an internal component of
`IncrementalIndexer` with no new ports, volumes, or external dependencies.

**Deployment scripts (`mcp.sh`, `redeploy.sh`):** No changes required.

---

## 4. Ripple Effect Assessment

- `resolveTypeScriptImport` signature unchanged — no downstream API contract altered.
- `FileParseResult` shape unchanged — no `GraphStore` or schema changes.
- `IncrementalIndexer` constructor signature unchanged — no callers broken.
- `tsconfigResolver` field is `readonly` and public — accessible to `server.ts` for
  watcher invalidation without exposing internals.
- The `resolveCandidate` private helper consolidates candidate-expansion logic previously
  duplicated between the relative and alias branches.

---

## 5. Docs/SETUP.md Additions (for Knowledge Manager)

Add to `docs/SETUP.md` under a new "TypeScript path aliases" section:

```markdown
## TypeScript Path Aliases

The MCP Context Manager automatically resolves TypeScript path aliases defined in
`tsconfig.json` (or any `tsconfig*.json`) via `compilerOptions.paths`.

**How it works:**
1. On startup, all `tsconfig*.json` files under the workspace root are discovered.
2. For each TypeScript import, the nearest ancestor `tsconfig.json` is found.
3. `compilerOptions.paths` entries are matched (longest-prefix-first, per TS spec).
4. The resolved path is used to build the dependency edge.

**Migration from the old hardcode:**
If your project relied on the implicit `@/* → frontend/src/*` mapping, set
`TS_LEGACY_FRONTEND_ALIAS=1` in your environment for one release, then add the
explicit mapping to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "@/*": ["frontend/src/*"] }
  }
}
```
```

---

## 6. No New Dependencies

No new npm packages were added. The JSONC stripper is ~30 lines of inline code.
`fast-glob` (already a dependency) is used for tsconfig discovery.
`chokidar` (already a dependency) is used for tsconfig watcher invalidation.
