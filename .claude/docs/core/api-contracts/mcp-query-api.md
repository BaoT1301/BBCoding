# API Contract: MCP Advanced Query API

**Version:** 3.0
**Service:** `services/mcp-context-manager`
**Created:** 2026-05-01
**Updated:** 2026-05-02
**Sprint:** MCP Advanced Query API — Sprint 3

---

## Overview

The MCP Advanced Query API exposes analytical query tools as both MCP tools (stdio) and HTTP endpoints (port 3001). Sprint 1 introduced 4 core query tools. Sprint 2 added 4 more (hotspots, module coupling, class hierarchy, symbol search). Sprint 3 adds 3 new analytical tools (circular dependencies, complexity metrics, change risk) and a graph persistence layer for faster restarts.

All HTTP endpoints are wrapped with:
- **Timeout**: 5s default via `withTimeout()` + `AbortController`
- **Retry**: 2 retries on `QueryTimeoutError`, 500ms backoff
- **HTTP 504**: Returned when all retries exhausted

---

## Standard Error Response

All endpoints use a consistent error response schema:

```json
{
  "error": "Human-readable error message",
  "code": "TIMEOUT | INVALID_PARAMS | NOT_FOUND",
  "retryable": true
}
```

| Code | HTTP Status | Retryable | Description |
|------|-------------|-----------|-------------|
| `TIMEOUT` | 504 | `true` | Query exceeded timeout after all retries |
| `INVALID_PARAMS` | 400 | `false` | Missing or invalid request parameters |
| `NOT_FOUND` | 404 | `false` | Target symbol or file not found in graph |

---

## Standard Node Shape (HTTP Response)

All HTTP responses apply `transformNode()` which renames `kind` to `type` for frontend compatibility:

```json
{
  "id": "func:module:name",
  "type": "function",
  "label": "name",
  "filePath": "src/module.py",
  "qualifiedName": "module.name",
  "metadata": {
    "language": "python",
    "rangeStart": { "line": 1, "column": 1 },
    "rangeEnd": { "line": 10, "column": 1 }
  }
}
```

---

## Sprint 1 Endpoints

### 1. Get Callers (Reverse Call Graph)

**GET** `/api/mcp/callers/:functionName`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `functionName` | path | yes | — | Target function name |
| `file_path` | query | no | — | File path to disambiguate |
| `max_depth` | query | no | 3 | Transitive depth (1–10) |
| `max_results` | query | no | 100 | Max callers returned (1–500) |

**POST** `/api/mcp/callers`

```json
{
  "function_name": "create_app",
  "file_path": "backend/app/main.py",
  "max_depth": 3,
  "max_results": 100
}
```

**Response (200):**

```json
{
  "target": { "id": "...", "type": "function", "label": "create_app", "filePath": "..." },
  "callers": [
    { "node": { "id": "...", "type": "function", "label": "...", ... }, "depth": 1, "callEdge": { ... } },
    { "node": { ... }, "depth": 2, "callEdge": { ... } }
  ],
  "truncated": false
}
```

---

### 2. Get Call Chain (Directed Subgraph)

**GET** `/api/mcp/call-chain/:functionName`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `functionName` | path | yes | — | Root function name |
| `file_path` | query | no | — | File path to disambiguate |
| `direction` | query | no | `both` | `upstream`, `downstream`, or `both` |
| `max_depth` | query | no | 5 | Traversal depth (1–10) |
| `max_nodes` | query | no | 200 | Max nodes in subgraph (1–500) |

**POST** `/api/mcp/call-chain`

```json
{
  "function_name": "create_app",
  "direction": "both",
  "max_depth": 5,
  "max_nodes": 200
}
```

**Response (200):**

```json
{
  "root": { "id": "...", "type": "function", "label": "create_app", ... },
  "chain": {
    "nodes": [ ... ],
    "edges": [ ... ]
  },
  "truncated": false
}
```

---

### 3. Get Dead Code

**GET** `/api/mcp/dead-code`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `file_pattern` | query | no | — | Glob pattern (e.g., `backend/**`) |
| `language` | query | no | — | `python` or `typescript` |
| `kind` | query | no | — | `function` or `class` |
| `max_results` | query | no | 100 | Max results (1–500) |

**POST** `/api/mcp/dead-code`

```json
{
  "file_pattern": "backend/**",
  "language": "python",
  "kind": "function",
  "max_results": 50
}
```

**Response (200):**

```json
{
  "deadSymbols": [
    { "node": { "id": "...", "label": "unused_helper", "kind": "function", ... }, "definedIn": "src/utils.ts" }
  ],
  "totalScanned": 42,
  "truncated": false
}
```

**Exclusions:** Entry points (`main`, `bootstrap`, `__init__`) and test files (paths containing test segments or spec patterns) are excluded heuristically.

---

### 4. Get Impact Analysis

**GET** `/api/mcp/impact/:filePath`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `filePath` | path | yes | — | Source file path (URL-encoded) |
| `max_depth` | query | no | 3 | Import chain depth (1–5) |
| `max_files` | query | no | 100 | Max affected files (1–500) |

**POST** `/api/mcp/impact`

```json
{
  "file_path": "backend/app/database.py",
  "max_depth": 3,
  "max_files": 100
}
```

**Response (200):**

```json
{
  "sourceFile": "backend/app/database.py",
  "affectedFiles": [
    { "filePath": "backend/app/main.py", "depth": 1, "impactType": "direct" },
    { "filePath": "backend/app/routers/users.py", "depth": 2, "impactType": "transitive" }
  ],
  "affectedSymbols": [
    { "id": "...", "type": "function", "label": "create_app", ... }
  ],
  "riskScore": 0.65,
  "suggestedTestFiles": ["backend/tests/test_database.py"],
  "truncated": false
}
```

**Risk Score Formula:** `min(1.0, affectedFiles.length * 0.3 + affectedSymbols.length * 0.1)`

---

## Sprint 2 Endpoints

### 5. Get Hotspots

**GET** `/api/mcp/hotspots`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `file_pattern` | query | no | — | Glob pattern to filter files |
| `language` | query | no | — | `python` or `typescript` |
| `kind` | query | no | — | `function` or `class` |
| `max_results` | query | no | 20 | Max results (1–500) |

**POST** `/api/mcp/hotspots`

```json
{
  "file_pattern": "backend/**",
  "language": "python",
  "kind": "function",
  "max_results": 20
}
```

---

### 6. Get Module Coupling

**GET** `/api/mcp/coupling/:filePathA/:filePathB`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `filePathA` | path | yes | — | First file path |
| `filePathB` | path | yes | — | Second file path |

**POST** `/api/mcp/coupling`

```json
{
  "file_path_a": "src/a.py",
  "file_path_b": "src/b.py"
}
```

---

### 7. Get Class Hierarchy

**GET** `/api/mcp/class-hierarchy/:className`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `className` | path | yes | — | Target class name |
| `file_path` | query | no | — | File path to disambiguate |
| `direction` | query | no | `both` | `ancestors`, `descendants`, or `both` |
| `max_depth` | query | no | 5 | Traversal depth (1–10) |

**POST** `/api/mcp/class-hierarchy`

```json
{
  "class_name": "BaseModel",
  "direction": "descendants",
  "max_depth": 5
}
```

---

### 8. Search Symbols

**GET** `/api/mcp/search`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `query` | query | yes | — | Search string (fuzzy match) |
| `kind` | query | no | — | `function`, `class`, or `file` |
| `language` | query | no | — | `python` or `typescript` |
| `file_pattern` | query | no | — | Glob pattern to filter files |
| `max_results` | query | no | 50 | Max results (1–500) |

**POST** `/api/mcp/search`

```json
{
  "query": "create_app",
  "kind": "function",
  "language": "python",
  "max_results": 50
}
```

---

## Sprint 3 Endpoints

### 9. Get Circular Dependencies

Detects circular import chains in the codebase using iterative DFS-based cycle detection on the file-level import graph. Uses file extension inference for language filtering (avoids known `upsertFileResult` language attribute issue).

**GET** `/api/mcp/circular-deps`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `file_pattern` | query | no | — | Glob pattern to filter files |
| `language` | query | no | — | `python` or `typescript` |
| `max_cycles` | query | no | 50 | Max cycles to return (1–200) |
| `max_depth` | query | no | 20 | Max DFS depth (1–50) |

**POST** `/api/mcp/circular-deps`

```json
{
  "file_pattern": "backend/**",
  "language": "python",
  "max_cycles": 50,
  "max_depth": 20
}
```

**Response (200):**

```json
{
  "cycles": [
    { "chain": ["src/a.py", "src/b.py", "src/a.py"], "length": 2 },
    { "chain": ["src/x.py", "src/y.py", "src/z.py", "src/x.py"], "length": 3 }
  ],
  "totalFilesScanned": 42,
  "truncated": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cycles` | `Array<{ chain: string[], length: number }>` | Detected circular import chains. `chain` is an ordered array of file paths forming the cycle (first element repeated at end). `length` is the number of unique files in the cycle. |
| `totalFilesScanned` | `number` | Total file nodes evaluated during DFS |
| `truncated` | `boolean` | `true` if `max_cycles` limit was reached |

---

### 10. Get Complexity Metrics

Computes per-symbol complexity metrics: fan-in (inbound edges), fan-out (outbound edges), and max call-chain depth via BFS (capped at 10 levels). Skips `module`, `external`, and `variable` node kinds.

**GET** `/api/mcp/complexity`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `file_path` | query | no | — | Glob pattern to filter by file path |
| `kind` | query | no | — | `function`, `class`, or `file` |
| `language` | query | no | — | `python` or `typescript` |
| `sort_by` | query | no | `total` | `fan_in`, `fan_out`, `depth`, or `total` |
| `max_results` | query | no | 100 | Max results (1–500) |

**POST** `/api/mcp/complexity`

```json
{
  "file_path": "backend/**",
  "kind": "function",
  "language": "python",
  "sort_by": "fan_out",
  "max_results": 50
}
```

**Response (200):**

```json
{
  "metrics": [
    {
      "node": {
        "id": "func:module:create_app",
        "type": "function",
        "label": "create_app",
        "filePath": "backend/app/main.py",
        "qualifiedName": "main.create_app",
        "metadata": {
          "language": "python",
          "rangeStart": { "line": 10, "column": 1 },
          "rangeEnd": { "line": 45, "column": 1 }
        }
      },
      "fanIn": 5,
      "fanOut": 3,
      "maxDepth": 2,
      "totalComplexity": 10
    }
  ],
  "totalScanned": 42,
  "truncated": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `metrics` | `Array<{ node, fanIn, fanOut, maxDepth, totalComplexity }>` | Per-symbol complexity data. `node` uses the standard transformed node shape (`kind` renamed to `type`). |
| `metrics[].fanIn` | `number` | Count of inbound edges to this symbol |
| `metrics[].fanOut` | `number` | Count of outbound edges from this symbol |
| `metrics[].maxDepth` | `number` | Max call-chain depth via BFS (capped at 10) |
| `metrics[].totalComplexity` | `number` | `fanIn + fanOut + maxDepth` |
| `totalScanned` | `number` | Total symbol nodes evaluated |
| `truncated` | `boolean` | `true` if `max_results` limit was reached |

**Complexity Formula:** `totalComplexity = fanIn + fanOut + maxDepth`

---

### 11. Get Change Risk

Given a set of changed file paths (e.g., from a git diff), predicts which tests should run and which areas of the codebase are highest risk. Builds on the existing `getImpactAnalysis` traversal logic but accepts multiple files and aggregates risk scores. Cross-references affected symbols with the top-20 hotspots.

**GET** `/api/mcp/change-risk`

| Parameter | Location | Required | Default | Description |
|-----------|----------|----------|---------|-------------|
| `changed_files` | query | yes | — | Comma-separated file paths |
| `max_depth` | query | no | 3 | Import chain depth (1–5) |
| `max_files` | query | no | 100 | Max affected files (1–500) |

**POST** `/api/mcp/change-risk`

```json
{
  "changed_files": ["backend/app/database.py", "backend/app/models/user.py"],
  "max_depth": 3,
  "max_files": 100
}
```

**Response (200):**

```json
{
  "changedFiles": ["backend/app/database.py", "backend/app/models/user.py"],
  "aggregateRiskScore": 0.72,
  "affectedFiles": [
    {
      "filePath": "backend/app/main.py",
      "depth": 1,
      "impactType": "direct",
      "riskContribution": 0.5
    },
    {
      "filePath": "backend/app/routers/users.py",
      "depth": 2,
      "impactType": "transitive",
      "riskContribution": 0.5
    }
  ],
  "suggestedTestFiles": [
    "backend/tests/test_database.py",
    "backend/tests/test_users.py"
  ],
  "hotspotOverlap": [
    {
      "node": {
        "id": "func:database:get_db",
        "type": "function",
        "label": "get_db",
        "filePath": "backend/app/database.py",
        "qualifiedName": "database.get_db",
        "metadata": { "language": "python", "rangeStart": { "line": 1, "column": 1 }, "rangeEnd": { "line": 5, "column": 1 } }
      },
      "fanIn": 12
    }
  ],
  "truncated": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `changedFiles` | `string[]` | Echo of the input changed file paths |
| `aggregateRiskScore` | `number` | 0.0–1.0. `min(1.0, avg of per-file risk scores)` |
| `affectedFiles` | `Array<{ filePath, depth, impactType, riskContribution }>` | Deduplicated affected files across all changed files. `riskContribution` is the fraction of changed files that affect this file (0.0–1.0). |
| `affectedFiles[].impactType` | `"direct" \| "transitive"` | Whether the file directly imports a changed file or is transitively affected |
| `suggestedTestFiles` | `string[]` | Deduplicated test/spec files in the blast radius |
| `hotspotOverlap` | `Array<{ node, fanIn }>` | High-fan-in symbols (from top-20 hotspots) that are in the blast radius. `node` uses the standard transformed node shape. |
| `truncated` | `boolean` | `true` if `max_files` limit was reached |

---

## Graph Persistence (Sprint 3 — Internal Infrastructure)

Sprint 3 introduced disk-based graph snapshot persistence for faster cold starts. This is purely internal infrastructure — no new API endpoints are exposed for persistence.

### Snapshot Format

The graph is serialized to a JSON file with a metadata envelope:

```json
{
  "version": 1,
  "createdAt": "2026-05-02T12:00:00.000Z",
  "fileCount": 150,
  "nodeCount": 1200,
  "edgeCount": 3400,
  "fileHashes": {
    "src/main.py": "a1b2c3d4...",
    "src/utils.ts": "e5f6g7h8..."
  },
  "graph": { "nodes": [...], "edges": [...], "attributes": {} }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | `1` | Schema version for forward compatibility |
| `createdAt` | `string` | ISO-8601 timestamp of snapshot creation |
| `fileCount` | `number` | Number of indexed files |
| `nodeCount` | `number` | Total graph nodes |
| `edgeCount` | `number` | Total graph edges |
| `fileHashes` | `Record<string, string>` | Map of `filePath` to content hash for delta detection |
| `graph` | `object` | Raw graphology `graph.export()` serialization |

### Snapshot Behavior

- **Save triggers:** After initial indexing completes, and after file watcher updates (debounced, max once per 5 seconds).
- **Write strategy:** Atomic temp-file + rename pattern to prevent corruption.
- **Load on startup:** If a valid snapshot exists, the graph is imported and only changed files (by hash comparison) are re-parsed via `buildDeltaGraph()`.
- **Graceful degradation:** Corrupt, missing, or version-mismatched snapshots are silently skipped — falls back to full `buildInitialGraph()`.

### Environment Variable

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GRAPH_SNAPSHOT_DIR` | No | Auto-resolved | Override directory for the snapshot file. If unset, defaults to `{WORKSPACE_ROOT}/.mcp-cache/` (or `/tmp/.mcp-cache/` when `WORKSPACE_ROOT=/workspace` in Docker). |

### Default Snapshot Path

- **Local development:** `{WORKSPACE_ROOT}/.mcp-cache/graph-snapshot.json`
- **Docker:** `/tmp/.mcp-cache/graph-snapshot.json` (writable without volume changes; ephemeral across container recreation)

---

## MCP Tool Equivalents

All endpoints are also available as MCP tools via stdio transport:

### Sprint 1 Tools

| MCP Tool | Parameters |
|----------|-----------|
| `get_callers` | `function_name` (required), `file_path?`, `max_depth?`, `max_results?` |
| `get_call_chain` | `function_name` (required), `file_path?`, `direction?`, `max_depth?`, `max_nodes?` |
| `get_dead_code` | `file_pattern?`, `language?`, `kind?`, `max_results?` |
| `get_impact_analysis` | `file_path` (required), `max_depth?`, `max_files?` |

### Sprint 2 Tools

| MCP Tool | Parameters |
|----------|-----------|
| `get_hotspots` | `file_pattern?`, `language?`, `kind?`, `max_results?` |
| `get_module_coupling` | `file_path_a` (required), `file_path_b` (required) |
| `get_class_hierarchy` | `class_name` (required), `file_path?`, `direction?`, `max_depth?` |
| `search_symbols` | `query` (required), `kind?`, `language?`, `file_pattern?`, `max_results?` |

### Sprint 3 Tools

| MCP Tool | Parameters |
|----------|-----------|
| `get_circular_dependencies` | `file_pattern?`, `language?`, `max_cycles?` (default 50, max 200), `max_depth?` (default 20, max 50) |
| `get_complexity_metrics` | `file_path?`, `kind?`, `language?`, `sort_by?` (default `"total"`), `max_results?` (default 100, max 500) |
| `get_change_risk` | `changed_files` (required, array, 1–50 items), `max_depth?` (default 3, max 5), `max_files?` (default 100, max 500) |

**Total MCP Tools:** 11 (4 Sprint 1 + 4 Sprint 2 + 3 Sprint 3)

> **Note:** The MCP server also registers additional utility tools (graph export, function context, file dependents, symbol references) that are not part of the Advanced Query API contract. The total `server.tool()` count may be higher than 11.

---

## Schema Compatibility

No existing schemas were modified in Sprint 3:
- `FileParseResult` — unchanged
- `SymbolDefinition` — unchanged
- `GraphNode` / `GraphEdge` — unchanged
- `GraphExport` — unchanged

New Sprint 3 endpoints use existing types in their responses. No new runtime dependencies were added.

---

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-05-01 | v1.0 — Initial contract, Sprint 1 query tools (callers, call chain, dead code, impact analysis) | Knowledge Manager |
| 2026-05-02 | v3.0 — Sprint 3 endpoints (circular deps, complexity metrics, change risk), graph persistence documentation, Sprint 2 endpoint stubs, fixed missing change-risk route registration (Issue #15) | DevOps & QA Engineer |


---

## Amendment: Degraded Health Status (Sprint 3 Track 3)

**Date:** 2026-05-08
**Author:** `internal_tooling_engineer`

### `/api/v1/health` — Degraded Response

When the initial index completes with 0 files indexed, `/api/v1/health` returns
a degraded response body. The HTTP status code remains **200** so Docker's
healthcheck (`wget -qO /dev/null http://localhost:3001/api/health`) continues to
pass and the container stays in the `healthy` state. Consumers must inspect the
JSON body to detect degradation.

**Healthy response (unchanged):**
```json
{ "status": "ok" }
```

**Degraded response (new):**
```json
{
  "status": "degraded",
  "reasons": ["indexed 0 files"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok" \| "degraded"` | `"ok"` when healthy; `"degraded"` when one or more conditions are met |
| `reasons` | `string[]` | Present only when `status === "degraded"`. Lists human-readable degradation reasons. |

**Degraded conditions:**

| Condition | `reasons` entry |
|-----------|-----------------|
| Initial index returned 0 files | `"indexed 0 files"` |

The `reasons` array is additive — future sprints may append new conditions
without breaking existing consumers that only check `status`.

### Legacy `/api/health` alias

The legacy `/api/health` alias continues to return `{ "status": "ok" }` always
(no degraded state). It is used exclusively by Docker's healthcheck and must
not be changed. Consumers that need degraded-state awareness must use
`/api/v1/health`.

### Related

- Full diagnostics (globs, file counts, cluster hits): `GET /api/v1/diag`
  — see [`mcp-diag-api.md`](./mcp-diag-api.md)
