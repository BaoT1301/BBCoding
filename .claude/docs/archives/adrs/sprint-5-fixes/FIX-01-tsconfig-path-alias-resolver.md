# Long-term fix 01 — tsconfig-aware TypeScript path-alias resolver

**Priority:** P0 (blocks dependency analysis for any project that uses `@/*` aliases, including this repo's `extension/` tree and most modern TS codebases).
**Target file:** `.tools/mcp-context-manager/services/mcp-context-manager/src/indexer/incremental-indexer.ts`
**Related errors:**
- `graph-index-empty-extension-dir.md`
- `get_file_dependents-cancelled.md` (downstream symptom)

---

## Problem

`resolveTypeScriptImport` hardcodes the `@/*` path alias to `<workspaceRoot>/frontend/src/*`:

```ts
// incremental-indexer.ts (current, lines ~230–250)
private async resolveTypeScriptImport(currentFile: string, importValue: string): Promise<string | null> {
  if (!importValue) return null;
  if (!importValue.startsWith(".") && !importValue.startsWith("@/")) return null;

  let basePath: string;
  if (importValue.startsWith("@/")) {
    basePath = path.join(this.workspaceRoot, "frontend", "src", importValue.slice(2));
  } else {
    basePath = path.resolve(path.dirname(currentFile), importValue);
  }
  // …candidate expansion…
}
```

This assumes a single monorepo layout (`frontend/src/*`). In this repository:

| tsconfig location      | Declared alias      | Resolves to                         |
| ---------------------- | ------------------- | ----------------------------------- |
| `extension/tsconfig.json`    | `@/*` → `src/*`     | `extension/src/*`                   |
| `collab-guard/tsconfig.json` | (none declared)     | n/a                                 |
| (hardcoded in indexer) | `@/*` → `frontend/src/*` | `<workspace>/frontend/src/*` ❌ |

Every `import … from "@/bridge/supabase"` in `extension/src/**` resolves to a nonexistent path, `exists()` returns `false`, and no import edge is emitted. Relative imports still work, which is why `extension/supabase/functions/**` (all `./foo` imports) has 47 edges while `extension/src/**` has zero incoming edges for alias-only targets.

Direct consequences:
- `get_file_dependents`, `get_impact_analysis`, `get_callers`, `get_call_chain`, `get_module_coupling`, `get_change_risk` all return empty or misleading results for alias-importing files.
- The "empty extension/" observation in the error reports is an edge-resolution bug, not a file-indexing bug — the file nodes exist, the edges don't.
- Any downstream consumer of the graph (`/api/v1/mcp/graph`, the UI's graph view, cross-cluster analysis) underreports coupling.

---

## Goal

Resolve TypeScript/JavaScript imports using the **nearest ancestor `tsconfig*.json`** of the importing file, honouring `compilerOptions.baseUrl` and `compilerOptions.paths`. Fall back to the current relative-import behaviour when no tsconfig declares a matching alias.

This is the same algorithm the TS compiler, Vite, esbuild, webpack, and Jest use. It's the single canonical source of truth for TS path resolution.

---

## Design

### New module: `src/indexer/tsconfig-resolver.ts`

Responsibilities:
1. Discover `tsconfig*.json` files within the workspace (respecting `WATCH_IGNORES`).
2. Parse them permissively — tsconfigs may contain JSONC (comments, trailing commas), and often use `extends`. Use `jsonc-parser` (already widely used in the Node ecosystem, zero native deps) or write a small JSONC-tolerant parser. `extends` resolution can be recursive with a visited set to prevent cycles.
3. Expose `findNearestTsconfig(filePath: string): TsconfigEntry | null` — walks up the directory tree from `filePath` and returns the deepest `tsconfig` whose `include` covers the file (or the deepest one found if `include` is absent).
4. Expose `resolveAlias(tsconfig: TsconfigEntry, importValue: string): string | null` — applies `compilerOptions.paths` against `compilerOptions.baseUrl`, anchored at the tsconfig's directory. Supports the `"@/*"` → `["src/*"]` case and the `"*"` wildcard pattern that TS's spec defines.
5. Cache parsed tsconfigs; invalidate when the file-watcher reports a change to any `tsconfig*.json`.

`TsconfigEntry` shape:

```ts
export interface TsconfigEntry {
  /** Absolute directory of the tsconfig file. */
  dir: string;
  /** Absolute path of the tsconfig file itself. */
  configPath: string;
  /** Absolute baseUrl, resolved against `dir`. Defaults to `dir` when baseUrl is absent. */
  baseUrl: string;
  /** Path aliases, with values pre-resolved to absolute paths. */
  paths: Record<string, string[]>;
  /** Absolute glob patterns from `include`, or null if not specified. */
  include: string[] | null;
  /** Absolute glob patterns from `exclude`. */
  exclude: string[];
}
```

### Wiring into the indexer

```ts
// incremental-indexer.ts
import { TsconfigResolver } from "./tsconfig-resolver.js";

export class IncrementalIndexer {
  private readonly tsconfigResolver: TsconfigResolver;
  // …

  constructor(workspaceRoot: string, graphStore: GraphStore) {
    this.workspaceRoot = normalize(workspaceRoot);
    this.graphStore = graphStore;
    this.tsconfigResolver = new TsconfigResolver(this.workspaceRoot);
  }

  async buildInitialGraph(/* … */) {
    await this.tsconfigResolver.discover();
    // … existing logic unchanged
  }

  private async resolveTypeScriptImport(currentFile: string, importValue: string): Promise<string | null> {
    if (!importValue) return null;

    // Relative imports — unchanged.
    if (importValue.startsWith(".")) {
      return this.resolveCandidate(path.resolve(path.dirname(currentFile), importValue));
    }

    // Bare specifiers like `react`, `zod`, or absolute URLs — skip.
    // (node_modules resolution is out of scope; those edges point to externals.)
    if (!/^[@~]/.test(importValue) && !importValue.startsWith("/")) {
      return null;
    }

    // Alias resolution via tsconfig paths.
    const tsconfig = this.tsconfigResolver.findNearestTsconfig(currentFile);
    if (tsconfig) {
      const aliasResolved = this.tsconfigResolver.resolveAlias(tsconfig, importValue);
      if (aliasResolved) {
        return this.resolveCandidate(aliasResolved);
      }
    }

    return null;
  }

  private async resolveCandidate(basePath: string): Promise<string | null> {
    const candidates: string[] = [normalize(basePath)];
    for (const ext of TS_IMPORT_EXTENSIONS) candidates.push(`${normalize(basePath)}${ext}`);
    for (const ext of TS_IMPORT_EXTENSIONS) candidates.push(normalize(path.join(basePath, `index${ext}`)));
    for (const candidate of candidates) {
      if (await this.exists(candidate)) return candidate;
    }
    return null;
  }
}
```

### Path-alias matching algorithm

Mirror the TS spec (`tsconfig.json` reference, "Path mapping"):

1. Sort aliases longest-prefix-first so `@/components/*` beats `@/*`.
2. For each alias pattern:
   - Exact match (no `*`): if `importValue === pattern`, try each mapping value.
   - Wildcard match: split on `*`, match prefix/suffix, capture the substitution. Substitute into each mapping value's `*` slot.
3. Each resulting mapping is resolved against the tsconfig's `baseUrl` (which itself is anchored at the tsconfig dir). Return the first candidate whose file exists on disk.

Edge cases to cover:
- **Missing baseUrl.** TS 4.1+ allows `paths` without `baseUrl`; treat baseUrl as the tsconfig's own dir.
- **`extends`.** Resolve inherited `compilerOptions.paths`/`baseUrl`. Nearest config wins, but merge base keys that the child doesn't override. Use a visited-paths set to break cycles.
- **Monorepo project references.** A tsconfig may list `references: [{ path: "../other" }]`. Not required for v1 — alias resolution is scoped to the file's nearest tsconfig — but discovery should still see referenced configs because files in them also need nearest-tsconfig lookup.
- **`include`/`exclude` filtering.** When deciding "nearest tsconfig," prefer the deepest one whose `include` globs match the file. If none match but a tsconfig exists above, use it (falls back to the directory-ancestor rule).

### Discovery

Use `fast-glob` (already a dependency) with:

```ts
const tsconfigFiles = await fg(["**/tsconfig*.json"], {
  cwd: workspaceRoot,
  absolute: true,
  onlyFiles: true,
  ignore: resolveIgnorePatterns(),
});
```

Keep `WATCH_IGNORES` honoured so `node_modules`, `dist`, etc. don't generate spurious configs.

### Watcher integration

`file-watcher.ts` already reports file events. Extend the handler in `server.ts` to detect `tsconfig*.json` changes and call `tsconfigResolver.invalidate(filePath)`. On change, re-parse just that config and rebuild its derived `baseUrl`/`paths`. A full re-index isn't required — the next `processChanges` call picks up new resolution automatically for any file that gets re-parsed. Optionally, trigger re-resolution of dependents of any file previously declared in the changed tsconfig's `include` tree, so edges catch up without waiting for a source edit.

---

## Tests

New file: `src/__tests__/tsconfig-alias-resolver.test.ts`

Table-driven cases:

| Scenario                                                | Expected                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `extension/tsconfig.json` declares `@/*` → `src/*`      | `@/bridge/supabase` from `extension/src/ui/foo.ts` resolves to `extension/src/bridge/supabase.ts` |
| No tsconfig in tree                                     | Bare `@/…` specifier returns `null` (no edge emitted), relative imports still work |
| Two nested tsconfigs (`workspace/tsconfig.json` + `extension/tsconfig.json`) | `extension/src/...` uses `extension/tsconfig`, workspace files use workspace config |
| Alias with wildcard suffix: `"@lib/*": ["packages/lib/*"]` | `@lib/utils` resolves under `packages/lib/utils.*`                        |
| Exact alias (no `*`): `"@config": ["src/config.ts"]`    | `@config` resolves to `src/config.ts`                                     |
| `extends` chain                                         | Parent `paths` honoured when child omits them                             |
| tsconfig JSONC with comments + trailing commas          | Parses cleanly                                                            |
| Circular `extends`                                      | Does not hang; logs a warning and uses the last successfully parsed config |
| `WATCH_IGNORES` excludes a tsconfig                     | That config is not discovered                                             |

Update existing tests:
- `issue4-absolute-paths.test.ts` — add an extension-style alias case.
- `cross-cluster-edges.test.ts` — add a case where the edge only exists because the alias resolved.

---

## Migration / backwards compatibility

Remove the hardcoded `frontend/src` branch entirely. A project that previously relied on the magic (and didn't have a tsconfig declaring `@/*` → `frontend/src/*`) will see those edges disappear; adding a one-line alias to their tsconfig restores parity and makes the behaviour explicit. Document this in `CHANGELOG.md` and `docs/SETUP.md`.

The graph snapshot format doesn't change. Old snapshots are still loadable; on the next incremental pass, stale-resolved edges get replaced naturally.

One safety net during rollout: introduce an env var `TS_LEGACY_FRONTEND_ALIAS=1` that re-enables the old behaviour for one release, for projects that can't update their tsconfig immediately. Default off.

---

## Rollout steps

1. Implement `tsconfig-resolver.ts` + unit tests.
2. Wire into `incremental-indexer.ts`. Remove hardcoded `frontend/src` branch.
3. Add file-watcher hook for `tsconfig*.json` changes.
4. Regenerate graph snapshot locally: `rm .tools/mcp-context-manager/services/mcp-context-manager/.mcp-cache/graph-snapshot.json` and restart the container.
5. Validate by calling `get_file_dependents` on `extension/src/bridge/supabase.ts` — expect the 8 consumers that `grep` currently finds.
6. Update `docs/SETUP.md` and `docs/TROUBLESHOOTING.md` with a new section: "TypeScript path aliases are read from the nearest tsconfig. If your imports aren't resolving, verify `compilerOptions.paths`."
7. Changelog entry under "breaking changes" noting the `frontend/src` hardcode removal.

---

## Estimated effort

- Core resolver: ~200 LOC + ~300 LOC tests.
- Indexer wiring: ~30 LOC.
- Watcher wiring: ~20 LOC.
- Docs: ~100 lines.
- Total: 1–2 days for a careful implementation with property-based tests for the alias matcher.
