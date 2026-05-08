# MCP Globe Extensions — API Contract Addendum

**Version:** 1.3  
**Generated:** 2026-05-01  
**Track:** Backend Track 1 — MCP Context Manager Enhancements (Sprint 8, Bug-Fix)  
**Status:** Implemented  
**Previous Version:** 1.2 (Phase 2, Sprint 2)

---

## Overview

This document describes the new endpoints and extended response fields added to the MCP Context Manager HTTP API to support the 3D Globe Visualizer. All changes are **additive** — no existing endpoints or response fields are modified or removed.

---

## Changelog

### v1.3 (Sprint 8, Bug-Fix Micro-Sprint)

1. **New SSE event type: `indexing-progress`** — Emitted during initial file indexing to report real-time progress. Payload: `{ current: number, total: number, timestamp: number }`. Broadcast to all connected SSE clients.
2. **New SSE event type: `indexing-complete`** — Emitted once after initial indexing finishes. Payload: `{ indexedFiles: number, timestamp: number }`. Broadcast to all connected SSE clients.
3. **Late-connecting client support** — If a client connects to the SSE endpoint after indexing has already completed, the server immediately sends an `indexing-complete` event after the `connected` event. This ensures the frontend can dismiss loading screens regardless of connection timing.

### v1.2 (Phase 2, Sprint 2)

1. **New edge field: `isCrossCluster`** — Boolean on each edge in the graph export response. `true` when source and target nodes belong to different clusters, `false` otherwise.
2. **New response field: `clusterMeta`** — Array of `Cluster` objects in the graph export response. Allows the frontend to render multiple globes without a separate `/api/mcp/clusters` call.
3. **SSE `file-change` events extended with cluster info:**
   - `file-updated` events now include `clusterIds: string[]` (deduplicated cluster IDs of affected files).
   - `file-deleted` events now include `clusterId: string` (cluster ID of the deleted file).
   - `file-created` events now include `clusterIds: string[]` (deduplicated cluster IDs of new files).
4. **Default `maxNodes`/`maxEdges` limits removed** — The graph export endpoint now defaults to returning the full graph (`Infinity`). Query parameters still accepted for client-side limiting. The frontend LOD system handles rendering performance.
5. **Issue #1 fix** — SSE `file-updated` events now include actual file paths instead of an empty array.

### v1.1 (Phase 1)

- Initial globe extensions: `lat`, `lng`, `clusterId` on graph nodes.
- New `/api/mcp/clusters` endpoint.
- New `/api/mcp/events` SSE endpoint.

---

## New Endpoints

### 1. Get Cluster Configuration

**Endpoint:** `GET /api/mcp/clusters`

**Description:** Returns the current cluster configuration used for geographic grouping of files on the globe.

**Authentication:** None (internal service, same as existing endpoints).

**Response Schema:**

```json
{
  "clusters": [
    {
      "id": "string (unique cluster identifier)",
      "path": "string (relative path prefix, e.g. 'backend/')",
      "label": "string (display name)",
      "color": "string (hex color, e.g. '#4A90E2')"
    }
  ]
}
```

**Example Response:**

```json
{
  "clusters": [
    { "id": "backend", "path": "backend/", "label": "Backend Services", "color": "#4A90E2" },
    { "id": "frontend", "path": "frontend/", "label": "Frontend Application", "color": "#E24A4A" },
    { "id": "mcp-services", "path": "services/", "label": "MCP Services", "color": "#4AE290" }
  ]
}
```

---

### 2. Server-Sent Events (SSE) Stream

**Endpoint:** `GET /api/mcp/events`

**Description:** Opens a long-lived SSE connection for real-time file change notifications.

**Response Headers:**
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

**Event Types:**

#### `connected`
Sent immediately on connection.
```
event: connected
data: {"timestamp": 1714500000000}
```

#### `file-change`
Sent when files are updated or deleted.
```
event: file-change
data: {"type": "file-updated", "filePaths": ["backend/app/main.py"], "timestamp": 1714500001000}
```

```
event: file-change
data: {"type": "file-deleted", "filePath": "backend/app/old.py", "timestamp": 1714500002000}
```

#### `keepalive`
Sent every 30 seconds to keep the connection alive.
```
event: keepalive
data: {"timestamp": 1714500030000}
```

#### `indexing-progress` (v1.3)
Sent during initial file indexing to report progress. Emitted for each batch of files processed.
```
event: indexing-progress
data: {"current": 42, "total": 150, "timestamp": 1714500001500}
```

**IndexingProgressEvent Schema:**
```typescript
interface IndexingProgressEvent {
  current: number;    // Number of files indexed so far
  total: number;      // Total number of files to index
  timestamp: number;  // Unix epoch milliseconds
}
```

#### `indexing-complete` (v1.3)
Sent once after initial indexing finishes. Also sent immediately to late-connecting clients (after the `connected` event) if indexing has already completed.
```
event: indexing-complete
data: {"indexedFiles": 150, "timestamp": 1714500002000}
```

**IndexingCompleteEvent Schema:**
```typescript
interface IndexingCompleteEvent {
  indexedFiles: number;  // Total number of files that were indexed
  timestamp: number;     // Unix epoch milliseconds
}
```

**Late-Connecting Client Behavior:** If a client connects after indexing has finished, the server sends `connected` followed immediately by `indexing-complete`. If indexing is still in progress, the client receives `indexing-progress` events as they occur, followed by `indexing-complete` when done.

**FileChangeEvent Schema:**
```typescript
interface FileChangeEvent {
  type: "file-created" | "file-updated" | "file-deleted";
  filePath?: string;      // Present for single-file events (delete)
  filePaths?: string[];   // Present for batch events (update, create)
  clusterId?: string;     // Present for single-file events (delete) — v1.2
  clusterIds?: string[];  // Present for batch events (update, create) — v1.2
  timestamp: number;      // Unix epoch milliseconds
}
```

---

## Extended Response Fields

### Graph Export (`GET /api/mcp/graph`)

Nodes that have a `filePath` are now augmented with three additional optional fields:

| Field | Type | Description |
|-------|------|-------------|
| `lat` | `number` | Latitude coordinate ∈ [-90, 90] |
| `lng` | `number` | Longitude coordinate ∈ [-180, 180] |
| `clusterId` | `string` | ID of the cluster this file belongs to |

**Extended Node Schema:**

```json
{
  "id": "file:backend/app/main.py",
  "type": "file",
  "label": "main.py",
  "filePath": "backend/app/main.py",
  "qualifiedName": "backend/app/main.py",
  "metadata": { "language": "python" },
  "lat": 15.0,
  "lng": -60.0,
  "clusterId": "backend"
}
```

**Backward Compatibility:** These fields are additive. Existing frontend Zod schemas use `.optional()` for unknown fields, and extra fields are ignored by default. No breaking change.

---

## Extended Edge Fields (v1.2)

### Graph Export (`GET /api/mcp/graph`)

Edges in the graph export response are now augmented with one additional field:

| Field | Type | Description |
|-------|------|-------------|
| `isCrossCluster` | `boolean` | `true` if source and target nodes belong to different clusters |

**Extended Edge Schema:**

```json
{
  "source": "file:backend/app/main.py",
  "target": "file:services/mcp-context-manager/src/server.ts",
  "type": "imports",
  "metadata": { "weight": 1, "filePath": "backend/app/main.py" },
  "isCrossCluster": true
}
```

**Logic:** For each edge, the source node's `clusterId` and target node's `clusterId` are compared. If they differ (and both are present), `isCrossCluster` is `true`. Otherwise `false`.

---

## Cluster Metadata in Graph Response (v1.2)

### Graph Export (`GET /api/mcp/graph`)

The graph export response now includes a `clusterMeta` field containing the current cluster configuration:

```json
{
  "nodes": [...],
  "edges": [...],
  "meta": {...},
  "clusterMeta": [
    { "id": "backend", "path": "backend/", "label": "Backend Services", "color": "#4A90E2" },
    { "id": "frontend", "path": "frontend/", "label": "Frontend Application", "color": "#E24A4A" },
    { "id": "mcp-services", "path": "services/", "label": "MCP Services", "color": "#4AE290" }
  ]
}
```

**Purpose:** Allows the frontend to render multiple globes from a single API call without needing a separate `/api/mcp/clusters` request during initial load.

---

## Default Limit Removal (v1.2)

### Graph Export (`GET /api/mcp/graph`)

The default `maxNodes` and `maxEdges` limits have been changed from `2000`/`4000` to `Infinity` (no limit). The query parameters `max_nodes` and `max_edges` are still accepted for client-side limiting when needed.

| Parameter | Previous Default | New Default |
|-----------|-----------------|-------------|
| `max_nodes` / `maxNodes` | 2000 | Infinity (full graph) |
| `max_edges` / `maxEdges` | 4000 | Infinity (full graph) |

**Rationale:** The frontend LOD system handles rendering performance. Server-side truncation was causing incomplete graph data.

---

## Indexing Scope Extension

The indexer now scans `services/**/*.{ts,tsx,js,jsx}` in addition to the existing patterns:
- `backend/**/*.py`
- `frontend/src/**/*.{ts,tsx,js,jsx}`

The file watcher now monitors the `services/` directory for live changes.

---

## Configuration

### `cluster-config.json`

Located at the workspace root (or mounted at `/workspace/cluster-config.json` in Docker).

**Schema (validated with Zod):**
```json
{
  "clusters": [
    {
      "id": "string (required, non-empty)",
      "path": "string (required, relative path — no leading /)",
      "label": "string (required, non-empty)",
      "color": "string (required, hex format #RRGGBB)"
    }
  ]
}
```

**Hot Reload:** The config file is watched with Chokidar. Changes are picked up within 500ms.

**Fallback:** On invalid config, the system falls back to a single default cluster: `{ id: "root", path: "", label: "Root", color: "#4A90E2" }`.

---

## Impact Assessment

| Existing Endpoint | Impact |
|---|---|
| `GET /api/mcp/graph` | Extended (new optional fields on nodes v1.1, new `isCrossCluster` on edges v1.2, new `clusterMeta` in response v1.2, default limits removed v1.2) — NOT breaking |
| `GET /api/mcp/events` (SSE) | Extended (new `clusterId`/`clusterIds` fields on file-change events v1.2, new `indexing-progress` and `indexing-complete` event types v1.3, late-client `indexing-complete` delivery v1.3) — NOT breaking |
| `GET /api/mcp/function/:name` | Unchanged |
| `GET /api/mcp/file/:path/dependents` | Unchanged |
| `GET /api/mcp/symbol/:name/references` | Unchanged |
| `GET /api/health` | Unchanged |
| All POST variants | Unchanged |

---

**End of API Contract Addendum**
