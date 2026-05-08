# How to Configure Clusters via cluster-config.json

## Overview

The 3D Codebase Globe Visualizer groups repository files into visual clusters, each rendered as a separate globe. Cluster definitions are stored in `services/mcp-context-manager/cluster-config.json` and are validated at load time using Zod schemas. The configuration supports hot reload — changes are detected automatically without restarting the service.

---

## Schema Reference

Each cluster entry must conform to the following schema:

| Field   | Type   | Constraints                                      | Description                                      |
|---------|--------|--------------------------------------------------|--------------------------------------------------|
| `id`    | string | Non-empty (`min(1)`)                             | Unique identifier for the cluster                |
| `path`  | string | Must be relative (no leading `/`)                | Directory path prefix used to assign files       |
| `label` | string | Non-empty (`min(1)`)                             | Human-readable display name shown in the UI      |
| `color` | string | Hex color matching `^#[0-9A-Fa-f]{6}$`           | Globe color in `#RRGGBB` format                  |

The top-level schema requires:

```json
{
  "clusters": [ /* at least 1 cluster entry */ ]
}
```

Validation is enforced by the `ClusterConfigSchema` Zod object in `cluster-config-loader.ts`.

---

## Adding/Removing Clusters

### Adding a Cluster

Append a new object to the `clusters` array:

```json
{
  "clusters": [
    { "id": "backend", "path": "backend/", "label": "Backend Services", "color": "#4A90E2" },
    { "id": "frontend", "path": "frontend/", "label": "Frontend Application", "color": "#E24A4A" },
    { "id": "mcp-services", "path": "services/", "label": "MCP Services", "color": "#4AE290" },
    { "id": "docs", "path": "docs/", "label": "Documentation", "color": "#F5A623" }
  ]
}
```

### Removing a Cluster

Delete the entry from the array. Files previously assigned to that cluster will fall back to the default "Root" cluster (id: `root`, color: `#4A90E2`).

### File Assignment Logic

Files are assigned to the cluster with the **longest matching path prefix**. For example, given clusters with paths `services/` and `services/mcp-context-ui/`, a file at `services/mcp-context-ui/src/App.tsx` matches the more specific `services/mcp-context-ui/` cluster.

---

## Hot Reload Behavior

The `ClusterConfigLoader` uses [chokidar](https://github.com/paulmillr/chokidar) to watch `cluster-config.json` for changes:

- **Stability threshold:** 300ms (waits for the file write to stabilize before reloading)
- **Poll interval:** 50ms
- **Effective reload time:** ~500ms after saving the file (300ms stability + parsing overhead)

When a change is detected:
1. The file is re-read synchronously.
2. JSON is parsed and validated against `ClusterConfigSchema`.
3. Each cluster path is checked to ensure it is relative.
4. On success, the in-memory cluster list is replaced.
5. On failure (invalid JSON, schema violation, absolute path), the previous valid configuration is retained and an error is logged.

No service restart is required. The next graph export or file-change event will use the updated clusters.

---

## Validation Rules

The loader enforces these rules at load time:

1. **At least one cluster** must be defined (empty arrays are rejected).
2. **`id` must be non-empty** — blank strings fail validation.
3. **`label` must be non-empty** — blank strings fail validation.
4. **`color` must be a valid 6-digit hex** — e.g., `#4A90E2`. Shorthand (`#FFF`) and 8-digit hex (`#4A90E2FF`) are rejected.
5. **`path` must be relative** — paths starting with `/` throw an error.
6. **Valid JSON** — syntax errors cause the loader to fall back to the default cluster.

If validation fails, the service logs the error and falls back to a single default cluster:

```json
{ "id": "root", "path": "", "label": "Root", "color": "#4A90E2" }
```

---

## Examples

### Minimal Configuration (Single Cluster)

```json
{
  "clusters": [
    { "id": "monorepo", "path": "", "label": "Entire Repository", "color": "#7B68EE" }
  ]
}
```

### Multi-Cluster Configuration

```json
{
  "clusters": [
    { "id": "backend", "path": "backend/", "label": "Backend Services", "color": "#4A90E2" },
    { "id": "frontend", "path": "frontend/", "label": "Frontend Application", "color": "#E24A4A" },
    { "id": "mcp-services", "path": "services/", "label": "MCP Services", "color": "#4AE290" },
    { "id": "infra", "path": "infrastructure/", "label": "Infrastructure", "color": "#F5A623" },
    { "id": "docs", "path": "docs/", "label": "Documentation", "color": "#9013FE" }
  ]
}
```

---

## Common Mistakes

| Mistake | Example | Fix |
|---------|---------|-----|
| Absolute path | `"/backend/"` | Use relative: `"backend/"` |
| Invalid hex color | `"#FFF"`, `"blue"`, `"4A90E2"` | Use full 6-digit hex with `#`: `"#4A90E2"` |
| Empty `id` | `""` | Provide a meaningful identifier |
| Empty `label` | `""` | Provide a display name |
| Empty clusters array | `{ "clusters": [] }` | Include at least one cluster |
| Trailing comma in JSON | `{ "id": "x", }` | Remove trailing commas (invalid JSON) |
| Duplicate IDs | Two clusters with `"id": "backend"` | Use unique IDs (not enforced by schema but causes UI confusion) |
