# MCP Tool Error: grep — Regex Parse Error (unclosed character class)

**Date:** 2026-05-13T12:42
**Tool:** `grep`
**Operation:** Find all consumers of `bridge/supabase.ts`

## Call Parameters

```json
{
  "pattern": "from ['\"@/bridge/supabase|from ['\"].*bridge/supabase",
  "path": "extension/src",
  "include": "*.{ts,tsx}",
  "output_mode": "content"
}
```

## Error

```
Failed to parse the tool use: The tool arguments failed validation:
Invalid regex 'from ['\"@/bridge/supabase|from ['\"].*bridge/supabase':
regex parse error:
    (?:from ['\"@/bridge/supabase|from ['\"].*bridge/supabase)
            ^
error: unclosed character class
```

## Root Cause

The regex contained `['\"` which opens a character class `[` but the alternation `|` inside the outer group caused the parser to treat the `[` as unclosed. Single-quoted characters inside a JSON string passed to the regex engine were not escaped correctly.

## Workaround Applied

Simplified the pattern to a plain substring match with no character classes:

```json
{
  "pattern": "bridge/supabase",
  "path": "extension/src",
  "include": "*.{ts,tsx}",
  "output_mode": "content"
}
```

This returned all 8 consumer files correctly.

## Fix Needed

When constructing grep patterns that need to match quote characters, either:
- Use a simpler substring pattern and filter results manually, or
- Escape brackets: `\[` instead of `[` when not intending a character class.
