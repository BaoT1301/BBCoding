# Long-term fix 04 — Stricter tool input validation with actionable hints

**Priority:** P2 (prevents agent-authoring bugs from masquerading as service bugs).
**Target:** any MCP tool wrapper the team owns that surfaces a `grep`-style or `include`-style parameter. If `grep`/`glob` are provided by the host IDE, this fix belongs in the MCP Context Manager's own tool schemas and in the steering docs.

**Related errors:**
- `grep-no-files-to-search-include-syntax.md`
- `grep-regex-parse-error.md`

---

## Problem

Two of the four error reports are about the **agent** constructing malformed inputs:

1. `include: "*.ts,*.tsx"` — the agent used comma-separated extensions; the tool expected a single brace-expansion glob `"*.{ts,tsx}"`. Tool responded `numFiles: 0` and exited. No hint that the input was malformed.
2. `pattern: "from ['\"@/bridge/supabase|from ['\"].*bridge/supabase"` — the agent hand-rolled a regex with mixed quoting, opened a character class, never closed it. Tool responded with `regex parse error: unclosed character class`. The error message was clear but could have been caught earlier with a lint pass.

Both are classic LLM-authored regex/glob mistakes. They happen repeatedly and waste an investigation each time.

---

## Goal

Make the MCP tool surface self-defending against the three or four mistakes that come up weekly, and self-documenting when they do.

---

## Design

### 1. Tighten tool JSON Schemas

For any tool that accepts an `include` parameter, document and validate the shape. Example for a hypothetical `grep_files` tool:

```jsonc
{
  "name": "grep_files",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pattern": {
        "type": "string",
        "description": "ECMAScript regex. Examples: 'function\\s+\\w+', '\\bTODO\\b'. Use '\\[' not '[' unless you intend a character class."
      },
      "path": { "type": "string" },
      "include": {
        "type": "string",
        "description": "Single glob. For multiple extensions use brace-expansion: '*.{ts,tsx,js}'. Do NOT use comma-separated globs ('*.ts,*.tsx' is wrong).",
        "pattern": "^[^,]*$"   // rejects "*.ts,*.tsx" at the schema layer
      }
    },
    "required": ["pattern", "path"]
  }
}
```

The `pattern: "^[^,]*$"` on `include` fails fast on the exact mistake in the error report, with a validator message pointing at the fix.

### 2. Pre-flight regex validation with a helpful error

Before handing a regex to the engine, compile it inside a `try/catch` and rewrite the error message to include a suggestion:

```ts
try {
  return new RegExp(pattern);
} catch (err) {
  const msg = (err as Error).message;
  let hint = "";
  if (/character class/i.test(msg)) {
    hint = " Hint: escape '[' as '\\[', or use [\\'\"] to match both quote characters.";
  } else if (/unterminated group/i.test(msg)) {
    hint = " Hint: count your parentheses — one '(' per ')'.";
  }
  throw new ToolInputError(
    `Invalid regex: ${msg}${hint}\nPattern: ${pattern}`
  );
}
```

The engine's raw `regex parse error: unclosed character class` stays in the payload; the hint is appended. No behavioural change, just a better error surface.

### 3. Glob sanity check

Wrap the globber with a pre-check that catches the two most common authoring mistakes:

```ts
function validateGlob(glob: string): void {
  if (glob.includes(",") && !glob.includes("{")) {
    throw new ToolInputError(
      `Comma in glob without brace-expansion: "${glob}". ` +
      `Use "{ext1,ext2}" instead, e.g. "*.{ts,tsx}".`
    );
  }
  if (glob.startsWith("/") || /^[A-Za-z]:[/\\\\]/.test(glob)) {
    throw new ToolInputError(
      `Absolute paths are not valid globs: "${glob}". ` +
      `Use a pattern relative to the workspace, e.g. "src/**/*.ts".`
    );
  }
}
```

### 4. "When empty, explain why"

When a `grep`-style tool legitimately returns zero matches, include a `searchedFiles` count in the response. If that count is zero, emit a `reason` field:

```jsonc
{
  "numFiles": 0,
  "numMatches": 0,
  "searchedFiles": 0,
  "reason": "no files matched the `include` glob \"*.ts,*.tsx\" — did you mean \"*.{ts,tsx}\"?"
}
```

The agent receives a machine-parseable explanation alongside the empty result, eliminating the "why is this empty" investigation loop seen in the error reports.

### 5. Publish a tool-authoring cheat sheet

New file: `docs/TOOLS-CHEATSHEET.md`. One page. Covers:

- Glob syntax: `*.{ts,tsx}` ✓, `*.ts,*.tsx` ✗, `**/*.py` for recursive, `!node_modules/**` for exclusions.
- Regex quoting: use character classes `[\'"]` for either-quote, escape brackets `\[` when literal, prefer substring matches over fancy alternations.
- Path conventions: relative to workspace root unless explicitly absolute.
- How to discover schema: reference `get_tool_schema` or the `toolsByServer` map returned by `activate`.

Pin it in `.agents/skills/` as steering for any agent that drives these tools.

---

## Tests

`src/__tests__/tool-input-validation.test.ts`

| Case                                              | Expected                                                    |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `include: "*.ts,*.tsx"`                           | Rejected with hint pointing at brace-expansion              |
| `include: "*.{ts,tsx}"`                           | Accepted                                                    |
| `pattern: "[a-z"` (unclosed class)                | Error contains hint about `\[`                              |
| `pattern: "(foo"` (unterminated group)            | Error contains parens hint                                  |
| Zero results with non-zero `searchedFiles`        | No `reason` field (legitimate empty)                        |
| Zero results with zero `searchedFiles`            | `reason` field set                                          |
| Absolute path in `include`                        | Rejected                                                    |

---

## Rollout

Can ship independently of FIX-01/02/03. Order the items by risk:

1. Cheat sheet (`docs/TOOLS-CHEATSHEET.md`) — zero code risk.
2. Pre-flight regex and glob validation — drop-in, same response shape.
3. Schema tightening — semver-relevant if other consumers depend on the schemas; gate behind a minor version bump.
4. `searchedFiles` + `reason` fields — additive, backwards compatible.

### Estimated effort
- Cheat sheet: 1–2 hours.
- Validation helpers + tests: 0.5 day.
- Schema edits per tool: trivial, one line each.
- Total: 1 day.

---

## Non-goals

- Teaching the LLM to write correct regexes. That's not this project's job; the validator just turns "wrong" into "wrong, here's the fix."
- Automatic regex repair (e.g. auto-escape `[` when class is unterminated). Too risky; changes user intent.
- Replacing the host IDE's `grep` tool. If `grep` is not owned by this service, document these conventions in the agent steering files instead and consider contributing the pre-flight validator upstream.
