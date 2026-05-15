# MCP Tool Error: get_impact_analysis / get_file_dependents — Empty Results (extension/ not indexed)

**Date:** 2026-05-13T12:42
**Tools:** `get_impact_analysis`, `get_file_dependents`
**Operation:** Ripple-effect analysis for `extension/src/bridge/supabase.ts` and `extension/src/bridge/supabase.test.ts`

## Calls Made

```json
// Call 1
{ "tool": "get_impact_analysis", "file_path": "extension/src/bridge/supabase.ts", "max_depth": 3 }

// Call 2
{ "tool": "get_impact_analysis", "file_path": "extension/src/bridge/supabase.test.ts", "max_depth": 2 }
```

## Response (both calls)

```json
{
  "sourceFile": "extension/src/bridge/supabase.ts",
  "affectedFiles": [],
  "affectedSymbols": [],
  "riskScore": 0,
  "suggestedTestFiles": [],
  "truncated": false
}
```

```json
{
  "sourceFile": "extension/src/bridge/supabase.test.ts",
  "affectedFiles": [],
  "affectedSymbols": [],
  "riskScore": 0,
  "suggestedTestFiles": [],
  "truncated": false
}
```

## Root Cause

The MCP context-manager graph index does not include the `extension/` directory. The graph is empty for all paths under `extension/src/`. This was also noted by the `integration_reviewer` in `track-A1-integration_reviewer-sync.md`:

> "The MCP context-manager graph index did not have the extension files indexed (both `get_impact_analysis` and `get_file_dependents` returned empty results for both schema files). Ripple-effect analysis was performed via grep-based consumer discovery."

## Impact

The following tools are non-functional for the `extension/` project:
- `get_impact_analysis`
- `get_file_dependents`
- `get_callers`
- `get_call_chain`
- `get_function_context`
- `get_complexity_metrics`
- `get_hotspots`
- `search_symbols` (returns no results for extension/ symbols)

## Workaround Applied

Manual grep-based consumer discovery across `extension/src/**/*.{ts,tsx}`.

## Fix Needed

Re-index the `extension/` directory in the MCP context-manager. Likely requires updating the cluster config or workspace mount to include `extension/` as a source root. Check `services/mcp-context-manager/cluster-config.json` for the `roots` or `include` paths and add `extension/src`.

---

## Recurrence — 2026-05-13T12:51 (Track A1 re-evaluation)

Same empty results on both `get_file_dependents` and `get_impact_analysis` for `extension/src/bridge/supabase.ts`. Graph index still not populated for `extension/`. Workaround: shell `grep -rn` across `extension/src/`.
