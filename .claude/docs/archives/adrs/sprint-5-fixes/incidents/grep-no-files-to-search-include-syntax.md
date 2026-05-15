# MCP Tool Error: grep — "No files to search" (path points to a file, not a directory)

**Date:** 2026-05-13T12:51
**Tool:** `grep`
**Operation:** Find consumers of `bridge/supabase` and usages of `__schemasForTest` in `extension/src`

## Calls Made

```json
// Call 1
{
  "pattern": "__schemasForTest",
  "path": "/Users/emcaemchut/Documents/reddit-hackathon/extension/src",
  "include": "*.ts,*.tsx",
  "output_mode": "content"
}

// Call 2
{
  "pattern": "bridge/supabase",
  "path": "/Users/emcaemchut/Documents/reddit-hackathon/extension/src",
  "include": "*.ts,*.tsx",
  "output_mode": "content"
}
```

## Error

```json
{ "message": "No files to search", "numFiles": 0, "numMatches": 0 }
```

Both calls returned the same empty result.

## Root Cause

The `include` parameter uses a comma-separated list `"*.ts,*.tsx"`. The grep tool expects a glob pattern, not a comma-separated list. The correct format for multiple extensions is a brace-expansion glob: `"*.{ts,tsx}"`.

With `"*.ts,*.tsx"` the tool treated the entire string as a single glob pattern that matched no files, resulting in "No files to search".

## Workaround Applied

Fell back to the shell tool with standard `grep -rn`:

```bash
grep -rn "bridge/supabase\|__schemasForTest" \
  /Users/emcaemchut/Documents/reddit-hackathon/extension/src \
  --include="*.ts" --include="*.tsx"
```

This returned all 8 consumer files and all `__schemasForTest` usages correctly.

## Fix Needed

Use brace-expansion glob syntax in the `include` parameter:

```json
{ "include": "*.{ts,tsx}" }
```

Not comma-separated:

```json
{ "include": "*.ts,*.tsx" }   // ❌ does not work
```
