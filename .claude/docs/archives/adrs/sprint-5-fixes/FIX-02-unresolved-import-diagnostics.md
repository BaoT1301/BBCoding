# Long-term fix 02 — Surface unresolved imports instead of silently dropping them

**Priority:** P1 (reduces time-to-diagnose every future resolver regression by orders of magnitude).
**Target files:**
- `.tools/mcp-context-manager/services/mcp-context-manager/src/indexer/incremental-indexer.ts`
- `.tools/mcp-context-manager/services/mcp-context-manager/src/api.ts` (diag endpoint)
- `.tools/mcp-context-manager/services/mcp-context-manager/src/graph/graph-store.ts`

**Related errors:** `graph-index-empty-extension-dir.md`, `get_file_dependents-cancelled.md`

---

## Problem

Today, `resolveTypeScriptImport` silently returns `null` for any import it can't resolve. There is no log line, no counter, no diag field, no graph metadata. Consumers (agents, humans, the UI) see empty dependency results and have no way to tell whether:

- the file is genuinely uncoupled,
- the import target file doesn't exist,
- the specifier is a bare module (`react`, `zod`) and deliberately skipped,
- the resolver has a bug (as it did with the `@/*` hardcode).

This is exactly what bit the `integration_reviewer` agent in the error reports: it fell back to a manual `grep` after seeing empty results, without any signal from the service explaining why.

---

## Goal

Make unresolved imports observable without blowing up the graph with noise. Three complementary surfaces:

1. **Diag counter** — top-level aggregate in `/api/v1/diag`.
2. **Per-file diagnostics** — small array of unresolved specifiers stored alongside each `FileParseResult`, returned via a new `get_unresolved_imports` tool.
3. **Structured log** — one line at the end of the initial index summarizing unresolved imports, with a DEBUG-level stream for per-specifier details.

---

## Design

### Classify import outcomes

Extend `resolveTypeScriptImport` (and the Python equivalent) to return a tagged result rather than `string | null`:

```ts
type ImportResolution =
  | { kind: "resolved"; filePath: string }
  | { kind: "skipped-external"; specifier: string }          // "react", "zod", node: protocol
  | { kind: "unresolved-relative"; specifier: string; searched: string[] }
  | { kind: "unresolved-alias"; specifier: string; tsconfig: string | null; searched: string[] }
  | { kind: "unresolved-unknown"; specifier: string };
```

`skipped-external` is the single "expected zero" bucket; everything else in the `unresolved-*` family is a real miss that deserves attention.

### Store per-file diagnostics

Add an optional field on `FileParseResult`:

```ts
interface FileParseResult {
  // …existing fields…
  unresolvedImports?: Array<{
    specifier: string;
    reason: "missing-file" | "alias-no-match" | "alias-no-tsconfig" | "other";
    searched?: string[];
  }>;
}
```

`GraphStore.upsertFileResult` persists this alongside the file hash. It's bounded data (usually 0–3 entries per file) so the snapshot size impact is negligible.

### Expose as a tool

New MCP tool `get_unresolved_imports` in `api.ts`:

```
GET /api/v1/mcp/unresolved_imports
  ?file_pattern=<glob>   # optional
  &limit=<int>           # default 200, cap 1000
  &reason=<enum>         # optional filter

→ {
    "totalFiles": 14,
    "totalSpecifiers": 27,
    "entries": [
      {
        "filePath": "extension/src/ui/bootstrap.ts",
        "unresolved": [
          { "specifier": "@/bridge/supabase", "reason": "alias-no-match", "tsconfig": "extension/tsconfig.json" }
        ]
      }
    ],
    "truncated": false
  }
```

Schema matches the existing tool naming conventions (`snake_case`, `file_pattern`, `limit`, `truncated`).

### Roll up in `/api/v1/diag`

Extend the diag payload:

```diff
{
  "workspaceRoot": "/project",
  "resolvedPythonGlobs": [ … ],
  "resolvedTsGlobs": [ … ],
  "resolvedIgnores": [ … ],
  "fileCount": { "total": 136, "python": 0, "ts": 136 },
  "clusterHits": { … },
+ "importResolution": {
+   "resolvedEdges": 178,
+   "unresolvedSpecifiers": 42,
+   "skippedExternals": 612,
+   "topUnresolvedReasons": { "alias-no-match": 38, "missing-file": 4 }
+ },
+ "degraded": false,
  "reasons": []
}
```

Add a degradation reason when `unresolvedSpecifiers / (unresolvedSpecifiers + resolvedEdges) > 0.25` with more than 10 unresolved. That threshold flags "your resolver is probably broken" without firing on small projects with one legitimate odd import.

### Logging

At the end of `buildInitialGraph`:

```
[live-context-manager] indexed 136 files
[live-context-manager] import resolution: 178 resolved, 42 unresolved (38 alias, 4 missing), 612 externals skipped
[live-context-manager] ⚠ 38 unresolved aliases — run GET /api/v1/mcp/unresolved_imports for details
```

The warning line only prints when unresolved > 0. DEBUG log level dumps the full list (gated by `LOG_LEVEL=debug`).

### UI hook (optional, phase 2)

The MCP Context UI could badge files with unresolved imports. Nodes with `unresolvedImports.length > 0` get a small warning dot; hover shows the list. Defer until the API exists.

---

## Tests

New: `src/__tests__/unresolved-imports.test.ts`

| Case                                                       | Expected                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Relative import to a file that doesn't exist               | Reason `missing-file`, entry stored on the file, counter incremented            |
| Alias specifier with no matching tsconfig path             | Reason `alias-no-match`                                                         |
| Alias specifier but no tsconfig in tree                    | Reason `alias-no-tsconfig`                                                      |
| Bare specifier like `react`                                | Classified as `skipped-external`, no diagnostic stored                          |
| Mix of resolved + unresolved in one file                   | `resolvedImports` and `unresolvedImports` both populated correctly              |
| `/api/v1/diag` reflects counters                           | `importResolution.unresolvedSpecifiers` matches aggregate                       |
| `/api/v1/mcp/unresolved_imports` honours `file_pattern`    | Returns only matching files                                                     |
| Degraded flag triggers at >25% unresolved with n>10        | `degraded: true`, `reasons` includes `"high-unresolved-import-ratio"`           |

---

## Rollout

1. Add `ImportResolution` type and update `resolveImports` to return it.
2. Store diagnostics in `GraphStore`.
3. Extend `/api/v1/diag` payload (backwards-compatible — new field).
4. Add `GET /api/v1/mcp/unresolved_imports` endpoint + MCP tool registration.
5. Update logging at index end.
6. Document in `docs/TOOLS.md` and `docs/TROUBLESHOOTING.md` with a recipe: "Empty dependency results? Check `/api/v1/mcp/unresolved_imports`."

### Estimated effort
- Implementation: ~250 LOC.
- Tests: ~200 LOC.
- Docs: ~50 lines.
- Total: 1 day.

---

## Why this earns its keep

If FIX-01 had shipped alone and the tsconfig parser had a bug for some exotic alias shape, you'd be right back in the "empty results, no idea why" trap. This fix converts a silent failure into a loud one, permanently. Every future resolver regression (TS 5.x features, project references, `paths` wildcards with suffixes) becomes a one-line observation on `/api/v1/diag` rather than an archaeological dig through `grep` output.
