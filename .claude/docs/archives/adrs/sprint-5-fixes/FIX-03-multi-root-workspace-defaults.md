# Long-term fix 03 — Multi-root workspace defaults (drop the `frontend/src` monorepo assumption)

**Priority:** P2 (reduces template drift; unblocks new host projects out of the box).
**Target files:**
- `.tools/mcp-context-manager/services/mcp-context-manager/src/watcher/file-watcher.ts`
- `.tools/mcp-context-manager/services/mcp-context-manager/src/indexer/incremental-indexer.ts`
- `.tools/mcp-context-manager/services/mcp-context-manager/src/utils/glob-utils.ts`
- `.tools/mcp-context-manager/services/mcp-context-manager/cluster-config.json`
- `.tools/mcp-context-manager/docker-compose.mcp.yml`

**Related errors:** all four. Indirectly causes the alias-resolution bug (FIX-01) and made the original cluster-config confusion worse.

---

## Problem

The service ships with defaults baked for a three-folder monorepo (`backend/`, `frontend/src/`, `services/`). They leak into seven places:

| Location                                                     | Leak                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `file-watcher.ts: DEFAULT_WATCH_DIRS`                        | `["backend", "frontend/src", "services"]`               |
| `incremental-indexer.ts: resolveTypeScriptImport`            | Hardcoded `@/*` → `frontend/src/*` (FIX-01)             |
| `incremental-indexer.ts: resolvePythonModule`                | Extra fallback under `backend/`                         |
| `services/.../cluster-config.json` (service-local template)  | `src/`, `tests/` clusters                               |
| `docker-compose.mcp.yml`                                     | Read-only overlay that mounts the template config over the workspace config |
| Docs examples (`SETUP.md`, `cluster-config.README.md`)       | `backend/`, `frontend/src/`, `services/`                |
| Tests                                                        | Reinforce the above by asserting defaults               |

When this repo was adopted, we hit every single one. Cluster bucketing broke (FIX'd ad-hoc by editing the service-local config), scanning was fine only because fallbacks happened to kick in, but edge resolution silently failed.

---

## Goal

Make the service **layout-agnostic** by default. A fresh clone should index any workspace without needing the user to know that `frontend/src` was a template artefact.

---

## Design

### 1. Replace `DEFAULT_WATCH_DIRS` with workspace-wide defaults

```diff
- const DEFAULT_WATCH_DIRS = ["backend", "frontend/src", "services"];
+ const DEFAULT_WATCH_DIRS = ["."];
```

`resolveWatchPaths` already derives concrete watch directories from `PYTHON_WATCH_GLOBS` / `TS_WATCH_GLOBS` when those are set. The default (workspace-wide) glob `**/*.{ts,tsx,js,jsx}` + `**/*.py` already covers everything `DEFAULT_IGNORE_PATTERNS` allows, so watching the workspace root is the natural default. This also stops the watcher from silently missing directories that aren't in the hardcoded list.

Perf cost: negligible — chokidar with the default ignores already walks the tree efficiently; the ignored patterns (`node_modules`, `dist`, etc.) are the hot path.

### 2. Remove the `backend/` fallback in `resolvePythonModule`

Keep only the workspace-relative attempts:

```diff
  const candidates = [
    path.join(this.workspaceRoot, `${modulePath}.py`),
    path.join(this.workspaceRoot, modulePath, "__init__.py"),
-   path.join(this.workspaceRoot, "backend", `${modulePath}.py`),
-   path.join(this.workspaceRoot, "backend", modulePath, "__init__.py"),
  ].map(normalize);
```

Projects that genuinely use `backend/` as a Python source root can set `PYTHONPATH`-style behaviour via a new env var (see FIX-01's tsconfig resolver story — a Python equivalent could read `pyproject.toml [tool.setuptools.packages]` or `[project].src-layout`. Out of scope for v1).

### 3. Reset the service-local `cluster-config.json` to a generic template

```json
{
  "clusters": [
    { "id": "root", "path": "./", "label": "Workspace", "color": "#4A90D9" }
  ]
}
```

Single catch-all cluster. Host projects define their real clusters in the **workspace-root** `cluster-config.json`. This removes the trap where the service-local config silently overrides the workspace config via the compose overlay mount.

### 4. Make the compose overlay conditional

```diff
    volumes:
      - ${WORKSPACE_PATH:-.}:/project:ro
-     - ./services/mcp-context-manager/cluster-config.json:/project/cluster-config.json:ro
+     # Only mount the template cluster-config when the host workspace doesn't
+     # have its own. The indexer already looks for /project/cluster-config.json;
+     # if the host workspace provides one, the compose mount above suffices.
+     # Users running nested-template layouts (WORKSPACE_PATH=../..) can opt in
+     # by uncommenting the line below OR by placing a cluster-config.json at
+     # their workspace root.
+     # - ./services/mcp-context-manager/cluster-config.json:/project/cluster-config.json:ro
```

Accompanying code change: `cluster-config-loader.ts` already falls back sensibly when the config file is missing. Verify it also emits a single warning (not a crash) when both the overlay and the workspace file are absent, and defaults to one `root` cluster so the UI has something to render.

### 5. Update docs

Rewrite the "Default behaviour" section of `docs/SETUP.md`:

- A fresh clone indexes the entire workspace (`.`) using the default TS/Python globs and the 13 `WATCH_IGNORES` entries.
- Place a `cluster-config.json` at your workspace root to label groups in the UI. Without it, everything lands in a single "Workspace" cluster.
- TypeScript path aliases come from the nearest ancestor `tsconfig*.json` (assumes FIX-01 shipped).

### 6. Update tests

`fresh-clone-defaults.test.ts` and `indexer-env-globs.test.ts` assert `["backend", "frontend/src", "services"]`. Update to assert workspace-wide defaults. Add a regression test: *"on an arbitrary layout (no `backend/`, no `frontend/src/`), the indexer still finds all TS files under the workspace root."*

---

## Rollout

1. Change the watcher defaults and Python fallbacks.
2. Flip the service-local `cluster-config.json` to the generic template.
3. Comment out the overlay mount in `docker-compose.mcp.yml` (keep as documentation).
4. Update tests.
5. Update `docs/SETUP.md`, `docs/NEW-PROJECT.md`, `cluster-config.README.md`.
6. Release note: "Service no longer assumes a `backend/ frontend/src/ services/` layout. See the migration guide."

### Migration for existing installs

Users whose repos rely on the `frontend/src` magic will see their `@/*` edges stop resolving (already broken here, but potentially working elsewhere). Migration:
- Add `@/*` to `compilerOptions.paths` in the tsconfig that governs that tree.
- Run `./mcp.sh down && rm services/.../.mcp-cache/graph-snapshot.json && ./mcp.sh up`.

### Estimated effort
- Code: ~100 LOC.
- Tests: ~150 LOC (mostly updates).
- Docs: ~200 lines.
- Total: 0.5–1 day.

---

## Why it's worth doing after FIX-01

FIX-01 fixes the TS alias side. FIX-03 fixes everything else that shares the same monorepo-template assumption. Doing FIX-01 without FIX-03 leaves five other landmines for the next project that adopts this service. Doing FIX-03 first would paper over the tsconfig bug with env vars and never actually solve it. Sequence: FIX-01 → FIX-02 → FIX-03.
