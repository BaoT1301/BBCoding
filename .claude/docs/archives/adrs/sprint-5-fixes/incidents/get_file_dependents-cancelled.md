# MCP Tool Error: get_file_dependents — Tool execution cancelled

**Date:** 2026-05-13T12:42
**Tool:** `get_file_dependents`
**Operation:** Incoming dependency lookup for `extension/src/bridge/supabase.ts`

## Call Parameters

```json
{
  "file_path": "extension/src/bridge/supabase.ts",
  "direction": "incoming",
  "depth": 2
}
```

## Error

```
Tool use was cancelled by the user
```

## Context

Called in parallel with `grep` to find all consumers of `bridge/supabase.ts`. The tool call was cancelled mid-execution (likely a timeout or environment interrupt). The parallel `grep` call also failed due to a regex parse error (see `grep-regex-parse-error.md`).

## Workaround Applied

Fell back to a manual `grep` with a corrected regex pattern:

```
pattern: "bridge/supabase"
path: extension/src/
include: *.{ts,tsx}
```

This successfully returned 8 consumer files.

## Suspected Root Cause

The MCP context-manager graph index does not have the `extension/` directory indexed. Both `get_file_dependents` and `get_impact_analysis` returned empty results for all `extension/src/` paths. The cancellation may be a side-effect of the tool timing out on an empty graph traversal.

## Reproduction Steps

1. Run `get_file_dependents` with `file_path: "extension/src/bridge/supabase.ts"`
2. Observe cancellation or empty result

## Fix Needed

Index the `extension/` directory in the MCP context-manager graph so that file-level dependency tools (`get_file_dependents`, `get_impact_analysis`, `get_callers`, `get_call_chain`) return meaningful results for this project.
