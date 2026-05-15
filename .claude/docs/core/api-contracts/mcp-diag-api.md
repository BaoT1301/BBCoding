# API Contract: MCP Diagnostics Endpoint

**Version:** 1.2
**Service:** `services/mcp-context-manager`
**Created:** 2026-05-08
**Sprint:** Sprint 3 — Fresh-Clone Bootstrap Bug-Fix (Track 3)
**Last Updated:** 2026-05-14 — Sprint 5 (FIX-02 importResolution, FIX-05a memory + readiness)
**Author:** `internal_tooling_engineer`

---

## Overview

The `/api/v1/diag` endpoint exposes a read-only diagnostics snapshot of the
running MCP Context Manager instance. It is intended for operator tooling
(`./mcp.sh doctor`), CI health checks, and debugging fresh-clone bootstrap
failures. It does **not** replace `/api/v1/health` — health remains the
liveness probe; diag is the detailed inspection surface.

---

## Endpoint

### `GET /api/v1/diag`

**Authentication:** None (Zero Auth — internal tool only)
**Request body:** None
**Query parameters:** None

---

## Response Schema

**HTTP 200** — always returned (even when the service is degraded; consumers
inspect the JSON body, not the status code, to determine health).

```json
{
  "workspaceRoot": "/workspace",
  "resolvedPythonGlobs": ["**/*.py"],
  "resolvedTsGlobs": ["**/*.{ts,tsx,js,jsx}"],
  "resolvedIgnores": [
    "**/node_modules/**",
    "**/dist/**",
    "..."
  ],
  "fileCount": {
    "total": 42,
    "python": 10,
    "ts": 32
  },
  "clusterHits": {
    "frontend": 18,
    "backend": 10,
    "services": 14
  },
  "importResolution": {
    "resolvedEdges": 120,
    "unresolvedSpecifiers": 3,
    "skippedExternals": 0,
    "topUnresolvedReasons": { "missing-file": 2, "alias-no-tsconfig": 1 }
  },
  "memory": {
    "rssMb": 210,
    "heapUsedMb": 145,
    "heapTotalMb": 180,
    "heapLimitMb": 1024,
    "external": 12,
    "degraded": false
  },
  "degraded": false,
  "reasons": []
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `workspaceRoot` | `string` | Absolute path to the workspace root as resolved by the server |
| `resolvedPythonGlobs` | `string[]` | Active Python glob patterns (from `PYTHON_WATCH_GLOBS` or defaults) |
| `resolvedTsGlobs` | `string[]` | Active TypeScript glob patterns (from `TS_WATCH_GLOBS` or defaults) |
| `resolvedIgnores` | `string[]` | Active ignore patterns (from `WATCH_IGNORES` or defaults) |
| `fileCount.total` | `number` | Total number of indexed files |
| `fileCount.python` | `number` | Number of indexed Python files |
| `fileCount.ts` | `number` | Number of indexed TypeScript/JavaScript files |
| `clusterHits` | `Record<string, number>` | Map of cluster ID → count of indexed files whose path starts with that cluster's path prefix. Clusters with 0 hits are omitted. |
| `degraded` | `boolean` | `true` when the service is running but in a degraded state |
| `reasons` | `string[]` | Human-readable reasons for degradation (empty when `degraded: false`) |
| `importResolution.resolvedEdges` | `number` | Count of import specifiers successfully resolved to a file node |
| `importResolution.unresolvedSpecifiers` | `number` | Count of imports that could not be resolved |
| `importResolution.skippedExternals` | `number` | Bare specifiers (node_modules) intentionally skipped |
| `importResolution.topUnresolvedReasons` | `Record<string, number>` | Breakdown of unresolved imports by reason code |
| `memory.rssMb` | `number` | Resident set size in MB |
| `memory.heapUsedMb` | `number` | V8 heap used in MB |
| `memory.heapTotalMb` | `number` | V8 heap total in MB |
| `memory.heapLimitMb` | `number` | V8 heap limit in MB (from `--max-old-space-size`) |
| `memory.external` | `number` | External memory (Buffers, etc.) in MB |
| `memory.degraded` | `boolean` | `true` when `heapUsedMb / heapLimitMb > 0.85` |

### Degraded Conditions

| Condition | `degraded` | `reasons` entry |
|-----------|-----------|-----------------|
| Initial index returned 0 files | `true` | `"indexed 0 files"` |
| `unresolvedSpecifiers > 10` AND ratio > 25% | `true` | `"high-unresolved-import-ratio"` |
| `heapUsedMb / heapLimitMb > 0.85` | `true` | `"high-heap-usage"` |

All conditions are OR'd into the single top-level `degraded` boolean.

---

## Example Responses

### Healthy

```json
{
  "workspaceRoot": "/workspace",
  "resolvedPythonGlobs": ["**/*.py"],
  "resolvedTsGlobs": ["**/*.{ts,tsx,js,jsx}"],
  "resolvedIgnores": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/.git/**",
    "**/.venv/**",
    "**/venv/**",
    "**/__pycache__/**",
    "**/.tools/mcp-context-*/**",
    "**/services/mcp-context-*/**",
    "**/.kiro/**",
    "**/.claude/**"
  ],
  "fileCount": {
    "total": 42,
    "python": 10,
    "ts": 32
  },
  "clusterHits": {
    "frontend": 18,
    "backend": 10,
    "services": 14
  },
  "importResolution": {
    "resolvedEdges": 178,
    "unresolvedSpecifiers": 0,
    "skippedExternals": 42,
    "topUnresolvedReasons": {}
  },
  "memory": {
    "rssMb": 210,
    "heapUsedMb": 145,
    "heapTotalMb": 180,
    "heapLimitMb": 1024,
    "external": 12,
    "degraded": false
  },
  "degraded": false,
  "reasons": []
}
```

### Degraded (0 files indexed)

```json
{
  "workspaceRoot": "/workspace",
  "resolvedPythonGlobs": ["**/*.py"],
  "resolvedTsGlobs": ["**/*.{ts,tsx,js,jsx}"],
  "resolvedIgnores": ["**/node_modules/**", "..."],
  "fileCount": {
    "total": 0,
    "python": 0,
    "ts": 0
  },
  "clusterHits": {},
  "degraded": true,
  "reasons": ["indexed 0 files"]
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| `200` | Always returned. Inspect `degraded` field for health state. |

The endpoint does **not** return 4xx or 5xx under normal operation. If the
HTTP server itself is unreachable, that is a container-level failure handled
by Docker's healthcheck on `/api/ready`.

---

## Readiness Probe

### `GET /api/ready`

Decoupled from liveness. Returns readiness state of the graph index.

| State | HTTP | Body |
|-------|------|------|
| Graph built | `200` | `{ "ready": true }` |
| Still indexing | `503` | `{ "ready": false, "reason": "indexing" }` |

Use `/api/ready` for Docker healthchecks and `mcp.sh up` polling.
Use `/api/health` (always `200 { "status": "ok" }`) for liveness probes only.

---

## Unresolved Imports Endpoint

### `GET /api/v1/mcp/unresolved_imports`

Returns files with unresolved import specifiers. Useful for diagnosing empty dependency results.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `file_pattern` | glob | *(all)* | Filter by file path glob |
| `limit` | number | `200` | Max entries returned (max 1000) |
| `reason` | string | *(all)* | Filter by reason code (e.g. `alias-no-tsconfig`) |

**Response:**

```json
{
  "totalFiles": 2,
  "totalSpecifiers": 3,
  "entries": [
    {
      "filePath": "src/components/Button.tsx",
      "specifier": "@ui/theme",
      "reason": "alias-no-tsconfig"
    }
  ],
  "truncated": false
}
```

---

## Implementation Notes

- `fileCount` is sourced from `GraphStore.getIndexedFilePaths()` — counts file
  nodes by language attribute.
- `clusterHits` is computed by iterating indexed file paths and matching each
  against the cluster config's prefix list (longest-prefix match via
  `ClusterConfigLoader.getClusterForFile()`).
- `resolvedPythonGlobs` and `resolvedTsGlobs` are sourced from
  `resolveGlobPatterns()` in `indexer/incremental-indexer.ts`.
- `resolvedIgnores` is sourced from `resolveIgnorePatterns()` in
  `utils/glob-utils.ts`.
- `workspaceRoot` is the value resolved by `resolveWorkspaceRoot()` in
  `server.ts` and passed into `HttpApiServer` at construction time.

---

## Consumers

| Consumer | Usage |
|----------|-------|
| `./mcp.sh doctor` | Calls this endpoint, pretty-prints result, exits non-zero on `degraded: true` or `fileCount.total === 0` |
| CI health checks | Can poll this endpoint after `./mcp.sh up` to verify indexing succeeded |
| Operator debugging | Manual `curl http://localhost:3001/api/v1/diag \| jq` |

---

## Related Contracts

- [`mcp-query-api.md`](./mcp-query-api.md) — Amendment: `/api/v1/health` degraded-health schema (see amendment section in that file)
- [`mcp-globe-extensions.md`](./mcp-globe-extensions.md) — Cluster config schema reference
