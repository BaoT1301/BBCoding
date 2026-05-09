# Local Context: MCP Context Manager

## Service Overview

The **MCP Context Manager** is an isolated internal developer tool that provides real-time code structure analysis and dependency tracking for the host repository. It runs as a standalone Node.js service within the Docker network and is never exposed to the public internet.

**Purpose**: Maintain a live dependency graph of Python and TypeScript source code to enable AI-powered code analysis, impact analysis, and visual exploration of code relationships.

**Isolation Level**: Completely detached from production application. No shared code, no shared types, no shared utilities.

---

## Tech Stack

### Runtime & Language
- **Runtime**: Node.js 20 (Alpine Linux in Docker)
- **Language**: TypeScript 5.9.3 (compiled to ES2022 JavaScript)
- **Module System**: ES Modules (NodeNext)

### Core Dependencies

**Graph Management**:
- **graphology** (^0.26.0): Multi-directed graph data structure for dependency tracking
- Stores nodes (files, functions, classes, variables) and edges (imports, calls, reads, writes)

**AST Parsing**:
- **tree-sitter** (^0.25.0): Incremental parsing library for syntax tree generation
- **tree-sitter-python** (^0.25.0): Python grammar for tree-sitter
- Provides accurate symbol extraction and relationship detection
- **TypeScript Compiler API** (`typescript` in devDependencies): Used at runtime by the TypeScript parser (`ts.createSourceFile`) for full AST walking — extracts functions, classes, methods, call relationships, variable reads/writes at parity with the Python parser

**File Watching**:
- **chokidar** (^4.0.3): Cross-platform file system watcher
- Monitors paths derived from `PYTHON_WATCH_GLOBS` and `TS_WATCH_GLOBS` env vars (defaults: `backend/`, `frontend/src/`, `services/`)
- Also watches `cluster-config.json` for hot-reload
- Debounced updates (200ms per file, 500ms batch flush)

**File Globbing**:
- **fast-glob** (^3.3.3): Fast file pattern matching for initial indexing
- Excludes: `node_modules`, `.git`, `dist`, `venv`, `__pycache__`

**MCP Protocol**:
- **@modelcontextprotocol/sdk** (^1.18.0): Model Context Protocol implementation
- Exposes 15 MCP tools via stdio transport

**Schema Validation**:
- **zod** (^3.25.76): TypeScript-first schema validation for MCP tool parameters

### Development Dependencies
- **tsx** (^4.20.6): TypeScript execution for development mode
- **eslint** (^9.38.0): Code linting
- **@types/node** (^24.6.0): Node.js type definitions
- **vitest** (^2.1.8): Unit test runner for TypeScript

---

## Architecture

### Component Hierarchy

```
server.ts (Bootstrap)
├── ClusterConfigLoader (cluster/)
│   ├── getClusters() → ClusterConfig[]
│   ├── getClusterForFile(filePath) → ClusterConfig | undefined (longest prefix match)
│   └── watches cluster-config.json via Chokidar (hot-reload within 500ms)
├── GeographicMapper (geographic-mapper.ts)
│   └── mapFileToCoordinates(filePath, clusterConfig) → { lat, lng } (deterministic recursive subdivision)
├── GraphPersistence (graph/graph-persistence.ts)
│   ├── saveSnapshot(graphStore, snapshotPath) → void (atomic temp-file + rename)
│   ├── loadSnapshot(snapshotPath) → SnapshotData | null (graceful fallback on error)
│   ├── resolveSnapshotPath(workspaceRoot) → string (respects GRAPH_SNAPSHOT_DIR env var)
│   └── createDebouncedSave(graphStore, snapshotPath, intervalMs) → debounced save function
├── IncrementalIndexer (indexer/)
│   ├── parsePythonFile() → FileParseResult
│   ├── parseTypeScriptFile() → FileParseResult
│   ├── resolveImports() → string[]
│   ├── processChanges() → { reparsed, dependents }
│   ├── buildInitialGraph(onProgress?) → void
│   └── buildDeltaGraph(snapshotFileHashes) → { reused, reparsed, deleted }
├── GraphStore (graph/)
│   ├── upsertFileResult() → void
│   ├── getFunctionContext(signal?) → { root, neighborhood, relatedFiles }
│   ├── getFileDependents(signal?) → { file, dependents, summary }
│   ├── getSymbolReferences(signal?) → { symbol, references }
│   ├── exportDependencyGraph(signal?) → { graph, meta }
│   ├── getCallers(functionName, filePath?, maxDepth?, maxResults?, signal?) → { target, callers, truncated }
│   ├── getCallChain(functionName, filePath?, direction?, maxDepth?, maxNodes?, signal?) → { root, chain, truncated }
│   ├── getDeadCode(filePattern?, language?, kind?, maxResults?, signal?) → { deadSymbols, totalScanned, truncated }
│   ├── getImpactAnalysis(filePath, maxDepth?, maxFiles?, signal?) → { sourceFile, affectedFiles, affectedSymbols, riskScore, suggestedTestFiles, truncated }
│   ├── getModuleCoupling(filePathA, filePathB, maxDepth?, signal?) → { filePathA, filePathB, sharedImports, sharedSymbols, directEdges, transitiveEdges, couplingScore, truncated }
│   ├── getHotspots(topN?, kind?, language?, filePattern?, includeEdgeTypes?, signal?) → { hotspots, totalSymbolsScanned, truncated }
│   ├── getClassHierarchy(className, filePath?, direction?, maxDepth?, signal?) → { root, ancestors, descendants, hierarchy, truncated }
│   ├── searchSymbols(query, kind?, language?, filePattern?, useRegex?, maxResults?) → { results, totalMatches, truncated }
│   ├── getCircularDependencies(filePattern?, language?, maxCycles?, maxDepth?, signal?) → { cycles, totalFilesScanned, truncated }
│   ├── getComplexityMetrics(filePath?, kind?, language?, sortBy?, maxResults?, signal?) → { metrics, totalScanned, truncated }
│   ├── getChangeRisk(changedFiles, maxDepth?, maxFiles?, signal?) → { changedFiles, aggregateRiskScore, affectedFiles, suggestedTestFiles, hotspotOverlap, truncated }
│   ├── getFileHashes() → Record<string, string>
│   ├── exportGraph() → graphology export serialization
│   └── importFromSnapshot(graphologyExport, fileHashes) → void (rebuilds internal lookup maps)
├── LiveFileWatcher (watcher/)
│   ├── start() → void
│   ├── schedule() → void (debounced)
│   ├── stop() → void
│   └── onDelete callback → invoked on file unlink
├── HttpApiServer (api.ts)
│   ├── start() → void (port 3001)
│   ├── handleRequest() → ApiResponse
│   ├── executeQuery(handler, timeout?) → wraps with timeout + retry + error formatting
│   ├── broadcastSSE(event, data) → void
│   ├── GET /api/mcp/clusters → cluster config
│   ├── GET /api/mcp/events → SSE stream (connected, file-change, keepalive)
│   └── stop() → void
├── QueryGuards (utils/query-guards.ts)
│   ├── withTimeout<T>(fn, ms) → Promise<T> (AbortController-based, default 5000ms)
│   ├── withRetry<T>(fn, maxRetries, backoffMs) → Promise<T> (retries on QueryTimeoutError)
│   ├── paginate(items, limit, offset) → paginated slice
│   ├── parsePaginationParams(params) → { limit, offset }
│   ├── QueryTimeoutError, InvalidParamsError, NotFoundError
│   └── buildErrorResponse(error) → { error, code, retryable }
└── MCP Tools (tools/)
    ├── get_function_context
    ├── get_file_dependents
    ├── get_symbol_references
    ├── export_dependency_graph
    ├── get_callers
    ├── get_call_chain
    ├── get_dead_code
    ├── get_impact_analysis
    ├── get_module_coupling
    ├── get_hotspots
    ├── get_class_hierarchy
    ├── search_symbols
    ├── get_circular_dependencies
    ├── get_complexity_metrics
    └── get_change_risk
```

### Data Flow

```
File Change (Chokidar)
  ↓
LiveFileWatcher.schedule()
  ↓ (200ms debounce)
LiveFileWatcher.scheduleFlush()
  ↓ (500ms batch)
IncrementalIndexer.processChanges()
  ↓
parsePythonFile() / parseTypeScriptFile()
  ↓
FileParseResult { symbols, relations, imports }
  ↓
GraphStore.upsertFileResult()
  ↓
Graphology Graph (nodes + edges)
  ↓
MCP Tools / HTTP API / SSE Broadcast
  ↓
Backend Proxy / MCP UI
```

### SSE Data Flow

```
File Change (Chokidar)
  ↓
LiveFileWatcher.onUpdate / onDelete callback
  ↓
HttpApiServer.broadcastSSE("file-change", { type, filePaths, clusterIds, timestamp })
  ↓
Nginx proxy (proxy_buffering off, proxy_read_timeout 3600s)
  ↓
Browser EventSource (exponential backoff reconnection)
```

**SSE Event Fields (Phase 2):**
- `file-created` / `file-updated` events include `clusterIds: string[]` (deduplicated cluster IDs of affected files)
- `file-deleted` events include `clusterId: string` (cluster of the deleted file)

---

## Local Architectural Constraints

### 1. Zero Authentication
- **Rule**: This is an isolated internal tool. **NEVER** implement Clerk JWTs, API access keys, or any authentication mechanism.
- **Rationale**: Service runs in Docker network, not exposed to public internet.
- **Enforcement**: No auth middleware, no token validation, no user context.

### 2. Native HTTP API (No Express.js)
- **Rule**: Use **native Node.js `http` module** for HTTP server. **NO Express.js**.
- **Rationale**: Minimal dependencies, faster startup, lower memory footprint.
- **Implementation**: `http.createServer()` with manual routing in `api.ts`.

### 3. Schema Compatibility
- **Rule**: HTTP API responses must match frontend Zod schemas exactly.
- **Transformation**: Backend `GraphNode` → Frontend `Node` (rename `kind` to `type`).
- **Validation**: Frontend expects `{ nodes: [], edges: [] }` at top level, not nested in `graph` object.

### 4. Read-Only File Access
- **Rule**: Service has **read-only** access to source code directories.
- **Docker Volumes**: All volumes mounted with `:ro` flag.
- **Enforcement**: No file writes, no file modifications, only reads and parsing.

### 5. Absolute Isolation
- **Rule**: **NEVER** import or reference code from `backend/`, `frontend/`, or other services.
- **Rationale**: This is a standalone microservice with its own dependencies.
- **Enforcement**: All code lives in `services/mcp-context-manager/src/`.

### 6. Incremental Updates Only
- **Rule**: On file change, only re-parse changed files and their direct dependents.
- **Rationale**: Full re-indexing is expensive (200+ files).
- **Implementation**: `GraphStore.getDirectDependents()` + `IncrementalIndexer.processChanges()`.

### 7. Graceful Shutdown
- **Rule**: Handle `SIGINT` and `SIGTERM` signals to stop watcher and HTTP server gracefully.
- **Implementation**: `process.on('SIGINT', shutdown)` in `server.ts`.

---

## API Contracts

### API Versioning

**Current Version:** v1  
**Prefix Pattern:** `/api/v1/mcp/*`  
**Backward Compatibility:** Legacy `/api/mcp/*` paths return HTTP 301 → `/api/v1/mcp/*` (query strings preserved)  
**Exception:** SSE endpoint (`/api/mcp/events`) serves directly on both paths (EventSource cannot follow redirects)  
**Health Alias:** `GET /api/health` always returns 200 (no redirect)  
**OpenAPI Spec:** `services/mcp-context-manager/openapi.yaml` (OpenAPI 3.1.0, documents all 32+ endpoints)

### HTTP API (Port 3001)

**Base URL**: `http://mcp-context-manager:3001` (Docker network)

**CORS**: Enabled for all origins (`Access-Control-Allow-Origin: *`)

**Response Format**: JSON with `{ nodes: [], edges: [] }` at top level

**Endpoints**:
1. `GET /api/v1/health` → `{ status: "ok" }` or `{ status: "degraded", reasons: string[] }` (also available at `/api/health` as alias; always HTTP 200)
2. `GET /api/v1/mcp/graph?scope=repo&max_nodes=2000&max_edges=4000`
3. `GET /api/v1/mcp/function/:functionName?file_path=...&max_hops=2`
4. `POST /api/v1/mcp/function` (body: `{ function_name, file_path, max_hops }`)
5. `GET /api/v1/mcp/file/:filePath/dependents?direction=incoming&depth=1`
6. `POST /api/v1/mcp/dependents` (body: `{ file_path, direction, depth }`)
7. `GET /api/v1/mcp/symbol/:symbolName/references?include_calls=true`
8. `POST /api/v1/mcp/references` (body: `{ symbol_qualified_name, include_calls }`)
9. `GET /api/v1/mcp/clusters` → `{ clusters: [{ id, path, label, color }] }`
10. `GET /api/v1/mcp/events` → SSE stream (events: `connected`, `file-change`, `keepalive`)
11. `GET /api/v1/mcp/callers/:functionName?file_path=...&max_depth=3&max_results=100`
12. `POST /api/v1/mcp/callers` (body: `{ function_name, file_path, max_depth, max_results }`)
13. `GET /api/v1/mcp/call-chain/:functionName?direction=both&max_depth=5&max_nodes=200`
14. `POST /api/v1/mcp/call-chain` (body: `{ function_name, file_path, direction, max_depth, max_nodes }`)
15. `GET /api/v1/mcp/dead-code?file_pattern=...&language=python&kind=function&max_results=100`
16. `POST /api/v1/mcp/dead-code` (body: `{ file_pattern, language, kind, max_results }`)
17. `GET /api/v1/mcp/impact/:filePath?max_depth=3&max_files=100`
18. `POST /api/v1/mcp/impact` (body: `{ file_path, max_depth, max_files }`)
19. `GET /api/v1/mcp/coupling/:filePathA/:filePathB?max_depth=2`
20. `POST /api/v1/mcp/coupling` (body: `{ file_path_a, file_path_b, max_depth }`)
21. `GET /api/v1/mcp/hotspots?top_n=20&kind=function&language=python&file_pattern=backend/**`
22. `POST /api/v1/mcp/hotspots` (body: `{ top_n, kind, language, file_pattern, include_edge_types }`)
23. `GET /api/v1/mcp/class-hierarchy/:className?file_path=...&direction=both&max_depth=5`
24. `POST /api/v1/mcp/class-hierarchy` (body: `{ class_name, file_path, direction, max_depth }`)
25. `GET /api/v1/mcp/search?query=...&kind=...&language=...&file_pattern=...&use_regex=...&max_results=...`
26. `POST /api/v1/mcp/search` (body: `{ query, kind, language, file_pattern, use_regex, max_results }`)
27. `GET /api/v1/mcp/circular-deps?file_pattern=...&language=...&max_cycles=50&max_depth=20`
28. `POST /api/v1/mcp/circular-deps` (body: `{ file_pattern, language, max_cycles, max_depth }`)
29. `GET /api/v1/mcp/complexity?file_path=...&kind=function&language=python&sort_by=total&max_results=100`
30. `POST /api/v1/mcp/complexity` (body: `{ file_path, kind, language, sort_by, max_results }`)
31. `GET /api/v1/mcp/change-risk?changed_files=file1,file2&max_depth=3&max_files=100`
32. `POST /api/v1/mcp/change-risk` (body: `{ changed_files: string[], max_depth, max_files }`)
33. `GET /api/v1/diag` → diagnostics snapshot (workspaceRoot, globs, ignores, fileCount, clusterHits, degraded, reasons)

**Graph Export Extensions (Phase 1 & Phase 2):**
- `GET /api/mcp/graph` nodes now include optional `lat`, `lng`, `clusterId` fields when geographic mapping is active
- `GET /api/mcp/graph` edges now include `isCrossCluster: boolean` field (Phase 2)
- `GET /api/mcp/graph` response now includes `clusterMeta: Cluster[]` field (Phase 2)
- Default `maxNodes`/`maxEdges` changed from `2000`/`4000` to `Infinity` — frontend LOD handles performance (Phase 2)

**Query Endpoints (Sprint 1 — Endpoints 11–18, Sprint 2 — Endpoints 19–26):**
- All query endpoints (callers, call-chain, dead-code, impact, coupling, hotspots, class-hierarchy, search) are wrapped with `executeQuery()` providing:
  - **Timeout**: 5-second default per query via `withTimeout()` + `AbortController`
  - **Retry**: 2 retries on `QueryTimeoutError` with 500ms backoff via `withRetry()`
  - **HTTP 504**: Returned when all retries are exhausted
- **Standard Error Response Schema**: `{ error: string, code: "TIMEOUT" | "INVALID_PARAMS" | "NOT_FOUND", retryable: boolean }`
- **Pagination utilities** (`paginate`, `parsePaginationParams`) are available but not currently wired into query endpoints — query tools use their own `maxResults`/`maxFiles`/`maxNodes` parameters for result limiting

### MCP Tools (Stdio Transport)

**Transport**: `StdioServerTransport` (stdin/stdout)

**Tools**:
1. `get_function_context(function_name, file_path?, max_hops?, include_edge_types?, max_nodes?)`
2. `get_file_dependents(file_path, direction?, depth?, max_files?)`
3. `get_symbol_references(symbol_qualified_name, include_reads?, include_writes?, include_calls?, max_results?)`
4. `export_dependency_graph(scope, file_path?, symbol_qualified_name?, max_nodes?, max_edges?)`
5. `get_callers(function_name, file_path?, max_depth?, max_results?)`
6. `get_call_chain(function_name, file_path?, direction?, max_depth?, max_nodes?)`
7. `get_dead_code(file_pattern?, language?, kind?, max_results?)`
8. `get_impact_analysis(file_path, max_depth?, max_files?)`
9. `get_module_coupling(file_path_a, file_path_b, max_depth?)`
10. `get_hotspots(top_n?, kind?, language?, file_pattern?, include_edge_types?)`
11. `get_class_hierarchy(class_name, file_path?, direction?, max_depth?)`
12. `search_symbols(query, kind?, language?, file_pattern?, use_regex?, max_results?)`
13. `get_circular_dependencies(file_pattern?, language?, max_cycles?, max_depth?)`
14. `get_complexity_metrics(file_path?, kind?, language?, sort_by?, max_results?)`
15. `get_change_risk(changed_files, max_depth?, max_files?)`

**Response Format**: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`

---

## Graph Schema

### Node Types
- `file`: Source files (e.g., `backend/app/main.py`)
- `module`: Python modules (e.g., `app.main`)
- `function`: Functions and methods (e.g., `create_app`)
- `class`: Class definitions (e.g., `UserService`)
- `variable`: Variables and constants (e.g., `DATABASE_URL`)
- `external`: External symbols from libraries (e.g., `fastapi.FastAPI`)

### Edge Types
- `imports`: File imports another file
- `defines`: File defines a symbol (function, class, variable)
- `calls`: Function calls another function
- `instantiates`: Code instantiates a class
- `reads`: Code reads a variable
- `writes`: Code writes to a variable
- `references`: Generic reference (fallback)
- `exports`: Module exports a symbol
- `inherits`: Class inherits from another class (source = child, target = parent; emitted by both Python and TypeScript parsers; confidence 0.9)

### Node Attributes
```typescript
interface GraphNode {
  id: string;              // e.g., "file:backend/app/main.py"
  label: string;           // e.g., "main.py"
  kind: SymbolKind;        // "file" | "function" | "class" | "variable" | "module" | "external"
  language: Language;      // "python" | "typescript"
  filePath?: string;       // e.g., "backend/app/main.py"
  qualifiedName?: string;  // e.g., "app.main.create_app"
  rangeStart?: { line: number; column: number };
  rangeEnd?: { line: number; column: number };
}
```

### Edge Attributes
```typescript
interface GraphEdge {
  id: string;              // e.g., "edge:calls:func1->func2:file.py:abc123"
  source: string;          // Node ID
  target: string;          // Node ID
  type: EdgeType;          // "imports" | "calls" | "reads" | "writes" | etc.
  weight: number;          // Confidence score (0.0 - 1.0)
  filePath: string;        // File where relationship occurs
}
```

---

## File Patterns

### Python Files
- **Pattern**: `**/*.py` *(configurable via `PYTHON_WATCH_GLOBS`)*
- **Excludes**: `**/node_modules/**`, `**/.git/**`, `**/dist/**`, `**/venv/**`, `**/__pycache__/**`, plus 9 more via `WATCH_IGNORES`
- **Parser**: `parsers/python-parser.ts` (Tree-sitter)
- **Emits**: `imports`, `defines`, `calls`, `reads`, `writes`, `references`, `inherits` (class base classes, including multiple inheritance)

### TypeScript Files
- **Pattern**: `**/*.{ts,tsx,js,jsx}` *(configurable via `TS_WATCH_GLOBS`)*
- **Excludes**: Same as Python (14-entry built-in list, overridable via `WATCH_IGNORES`)
- **Parser**: `parsers/typescript-parser.ts` (Tree-sitter)
- **Emits**: `imports`, `defines`, `calls`, `reads`, `writes`, `references`, `exports`, `inherits` (`extends` and `implements` clauses)
- **Watch Paths**: Derived from `TS_WATCH_GLOBS` (default: workspace-wide)

### Import Resolution

**Python**:
- Converts `app.main` → `backend/app/main.py` or `backend/app/main/__init__.py`
- Searches: `{workspace_root}/{module_path}.py`, `{workspace_root}/backend/{module_path}.py`

**TypeScript**:
- Resolves relative imports: `./utils` → `frontend/src/utils.ts` or `frontend/src/utils/index.ts`
- Resolves alias imports: `@/components` → `frontend/src/components`
- Tries extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`

---

## Performance Characteristics

### Startup
- **Initial Indexing**: ~5-10 seconds for 200+ files (full index), <1 second with valid snapshot + delta
- **Graph Build**: ~1-2 seconds
- **HTTP Server**: <1 second

### Memory
- **Typical Usage**: 100-250 MB (increases with full graph export after limit removal)
- **Docker Limit**: 512 MB
- **Graph Size**: ~1-2 MB per 100 files

### Update Latency
- **File Change Detection**: 200ms debounce per file
- **Batch Flush**: 500ms debounce
- **Re-parsing**: <100ms per file
- **Dependent Updates**: <500ms for 5-10 dependents

### Query Performance
- **Function Context**: <50ms for 2 hops, 150 nodes
- **File Dependents**: <20ms for depth 1, 200 files
- **Symbol References**: <30ms for 300 references
- **Export Graph**: <100ms for 2000 nodes, 4000 edges

---

## Environment Variables

### Required
- **`WORKSPACE_ROOT`**: Absolute path to repository root (e.g., `/workspace`)
  - Default: Auto-detected by walking up from `cwd` to find `backend/` and `frontend/`
  - Docker: Set to `/workspace` in docker-compose.yml

### Optional
- **`HTTP_PORT`**: HTTP API server port (default: `3001`)
- **`GRAPH_SNAPSHOT_DIR`**: Override directory for graph snapshot file. If unset, defaults to `{WORKSPACE_ROOT}/.mcp-cache/` (or `/tmp/.mcp-cache/` when `WORKSPACE_ROOT=/workspace` in Docker).
- **`PYTHON_WATCH_GLOBS`**: Comma-separated glob patterns for Python files to index and watch.
  - Default: `**/*.py` (workspace-wide)
  - Example: `PYTHON_WATCH_GLOBS=myapp/**/*.py,tests/**/*.py`
- **`TS_WATCH_GLOBS`**: Comma-separated glob patterns for TypeScript/JavaScript files to index and watch.
  - Default: `**/*.{ts,tsx,js,jsx}` (workspace-wide)
  - Example: `TS_WATCH_GLOBS=src/**/*.{ts,tsx},packages/**/*.{ts,tsx}`
- **`WATCH_IGNORES`**: Comma-separated glob patterns to exclude from indexing and watching.
  - Default: 14-entry list (node_modules, dist, build, .next, .turbo, coverage, .git, .venv, venv, __pycache__, .tools/mcp-context-*, services/mcp-context-*, .kiro, .claude)
  - Example: `WATCH_IGNORES=custom/**,other/**`

---

## Docker Configuration

### Dockerfile (Multi-Stage Build)

**Stage 1: Builder**
- Base: `node:20-alpine`
- Install: `python3`, `make`, `g++` (for native modules)
- Copy: `package.json`, `package-lock.json`, `src/`, `tsconfig.json`
- Build: `npm ci && npm run build`

**Stage 2: Production**
- Base: `node:20-alpine`
- Install: `python3`, `make`, `g++`, `wget` (for healthcheck)
- Copy: `node_modules/` and `dist/` from builder
- Expose: Port 3001
- Health Check: `wget -qO /dev/null http://localhost:3001/api/health`
- CMD: `npm start` (runs `node dist/server.js`)

### Docker Compose

**Compose File:** `docker-compose.mcp.yml` (isolated from the main production `docker-compose.yml`)

```yaml
mcp-context-manager:
  build:
    context: .
    dockerfile: services/mcp-context-manager/Dockerfile
  container_name: mcp-context-manager
  environment:
    - WORKSPACE_ROOT=/workspace
    - HTTP_PORT=3001
  volumes:
    - ./backend:/workspace/backend:ro
    - ./frontend:/workspace/frontend:ro
    - ./services:/workspace/services:ro
    - ./services/mcp-context-manager/cluster-config.json:/workspace/cluster-config.json:ro
  healthcheck:
    test: ["CMD", "wget", "-qO", "/dev/null", "http://localhost:3001/api/health"]
    interval: 30s
    timeout: 5s
    retries: 3
  deploy:
    resources:
      limits:
        memory: 512M
  networks:
    - mcp-network
```

### `--stdio-only` Mode

When AI tools (Claude Desktop, Kiro, Cursor) invoke the MCP server via `docker exec`, they pass the `--stdio-only` flag:

```bash
docker exec -i mcp-context-manager node /app/dist/server.js --stdio-only
```

**Behavior:** When `--stdio-only` is passed, the server skips HTTP server startup and only initializes the MCP stdio transport. This allows the service to operate as a pure MCP tool provider without binding to port 3001. The HTTP server continues running independently in the main container process for the MCP Context UI and health checks.

### Configuration Files

- **`cluster-config.json`**: Defines cluster groupings for geographic mapping. Located at workspace root, mounted as read-only volume. Watched by `ClusterConfigLoader` for hot-reload.

---

## Operational Constraints

### 1. No Database
- **Rule**: All data is in-memory. No PostgreSQL, no Redis, no file-based storage.
- **Rationale**: Graph is rebuilt on every restart (5-10 seconds).
- **Future**: Consider persisting graph to disk for faster startup.

### 2. No External Network Access
- **Rule**: Service does not make outbound HTTP requests.
- **Rationale**: Only reads local files and serves HTTP API.

### 3. No Logging to Database
- **Rule**: All logs go to stderr (captured by Docker).
- **Format**: `[live-context-manager] message` or `[http-api] message`.

### 4. No Background Jobs
- **Rule**: No cron jobs, no scheduled tasks, no background workers.
- **Rationale**: File watcher handles all updates reactively.

### 5. No State Persistence
- **Rule**: Service persists a graph snapshot to disk for faster startup. On restart, loads from snapshot + incremental delta for changed files. Falls back to full re-index if snapshot is missing or corrupt.
- **Snapshot Path**: `{GRAPH_SNAPSHOT_DIR}/graph-snapshot.json` (default: `.mcp-cache/` or `/tmp/.mcp-cache/` in Docker)
- **Atomic Writes**: Uses temp-file + rename pattern to prevent corruption.
- **Debounced Saves**: Snapshot saved after initial indexing and on file changes (5s debounce).

---

## Integration Points

### 1. MCP UI
- **Location**: `services/mcp-context-ui/`
- **Purpose**: Standalone React UI for graph visualization
- **Communication**: Queries MCP Context Manager HTTP API directly (no backend proxy)
- **Port**: 8080 (exposed to host)

### 2. Docker Network
- **Network Name**: `mcp-network` (defined in `docker-compose.mcp.yml`)
- **Service Name**: `mcp-context-manager`
- **Internal URL**: `http://mcp-context-manager:3001`

### 3. AI Tool Integration (stdio)
- **Transport**: `docker exec -i mcp-context-manager node /app/dist/server.js --stdio-only`
- **Protocol**: MCP stdio (stdin/stdout JSON-RPC)
- **Consumers**: Claude Desktop, Kiro, Cursor (configured via their respective MCP config files)

---

## Error Handling

### Parsing Errors
- **Strategy**: Log to stderr, continue with partial results
- **Example**: `[live-context-manager] parse error in file.py: SyntaxError`
- **Impact**: File is skipped, graph may be incomplete

### File System Errors
- **Strategy**: Log to stderr, retry on next change
- **Example**: `[live-context-manager] failed to read file.py: ENOENT`
- **Impact**: File is not indexed until next change

### HTTP Errors
- **Strategy**: Return 500 with JSON error message
- **Example**: `{ "error": "Internal server error" }`
- **Logging**: `[http-api] error handling request: Error: ...`

### MCP Tool Errors
- **Strategy**: Return error in MCP response format
- **Example**: `{ content: [{ type: "text", text: "Error: ..." }] }`

---

## Testing Strategy

### Current State
- **Unit Tests**: Vitest (356 tests across 37 test files)
- **Test Files**:
  - `src/__tests__/geographic-mapper.test.ts` (10 tests)
  - `src/__tests__/cluster-config-loader.test.ts` (15 tests)
  - `src/__tests__/cross-cluster-edges.test.ts` (7 tests — Phase 2)
  - `src/__tests__/file-watcher.test.ts` (7 tests)
  - `src/__tests__/issue4-absolute-paths.test.ts` (6 tests — Phase 2 regression)
  - `src/__tests__/indexing-sse-events.test.ts` (6 tests)
  - `src/__tests__/typescript-parser.test.ts` (24 tests — Sprint 1 Track 1 + 2 inherits tests from Sprint 2 Track 3)
  - `src/__tests__/query-guards.test.ts` (33 tests — Sprint 1 Track 2)
  - `src/__tests__/get-callers.test.ts` (8 tests — Sprint 1 Track 3)
  - `src/__tests__/get-call-chain.test.ts` (10 tests — Sprint 1 Track 4)
  - `src/__tests__/get-dead-code.test.ts` (11 tests — Sprint 1 Track 5)
  - `src/__tests__/get-impact-analysis.test.ts` (8 tests — Sprint 1 Track 6)
  - `src/__tests__/get-module-coupling.test.ts` (7 tests — Sprint 2 Track 1)
  - `src/__tests__/get-hotspots.test.ts` (9 tests — Sprint 2 Track 2)
  - `src/__tests__/get-class-hierarchy.test.ts` (8 tests — Sprint 2 Track 3)
  - `src/__tests__/python-parser-inherits.test.ts` (2 tests — Sprint 2 Track 3)
  - `src/__tests__/search-symbols.test.ts` (11 tests — Sprint 2 Track 4)
  - `src/__tests__/properties/cluster-assignment.property.test.ts` (4 tests)
  - `src/__tests__/properties/cluster-config.property.test.ts` (6 tests)
  - `src/__tests__/properties/error-handling.property.test.ts` (15 tests)
  - `src/__tests__/properties/file-filtering.property.test.ts` (3 tests)
  - `src/__tests__/properties/geographic-mapper.property.test.ts` (7 tests)
  - `src/__tests__/properties/performance.property.test.ts` (10 tests)
  - `src/__tests__/properties/sse-events.property.test.ts` (7 tests)
  - `src/__tests__/properties/sse-keepalive.property.test.ts` (9 tests)
  - `src/__tests__/properties/symbol-extraction.property.test.ts` (5 tests)
  - `src/__tests__/graph-persistence.test.ts` (14 tests — Sprint 3 Track 1)
  - `src/__tests__/get-circular-dependencies.test.ts` (7 tests — Sprint 3 Track 2)
  - `src/__tests__/get-complexity-metrics.test.ts` (8 tests — Sprint 3 Track 3)
  - `src/__tests__/get-change-risk.test.ts` (8 tests — Sprint 3 Track 4)
  - `src/__tests__/api-versioning.test.ts` (11 tests — Sprint 4 Track 1: versioned endpoints, 301 redirects, query string preservation)
- **Integration Tests**: None (to be added)
- **Manual Testing**: Via `curl` and Docker logs
- **Run Tests**: `npm run test` (runs `vitest run`)

### Recommended Tests
1. **Parser Tests**: Verify symbol extraction for Python/TypeScript
2. **Graph Tests**: Verify node/edge CRUD operations
3. **Indexer Tests**: Verify import resolution and incremental updates
4. **API Tests**: Verify HTTP endpoints return correct schema
5. **Watcher Tests**: Verify file change detection and debouncing

### Test Framework
- **Vitest**: Fast unit test runner for TypeScript
- **Supertest**: HTTP endpoint testing
- **Mock FS**: Mock file system for parser tests

---

## Monitoring & Observability

### Health Checks
- **Docker**: `wget -qO /dev/null http://localhost:3001/api/health` every 30s
- **HTTP**: `GET /api/health` returns `{ status: "ok" }`

### Logs
- **Format**: `[component] message`
- **Components**: `live-context-manager`, `http-api`
- **Destination**: stderr (captured by Docker)

### Metrics (Future)
- **Graph Size**: Node count, edge count
- **Parse Time**: Average time per file
- **Update Latency**: Time from file change to graph update
- **Query Performance**: P50, P95, P99 for each endpoint

---

## Security Considerations

### 1. No Public Exposure
- **Rule**: Service is **NEVER** exposed to public internet.
- **Enforcement**: No port mapping in docker-compose.yml (only internal port 3001).

### 2. Read-Only File Access
- **Rule**: All source code volumes mounted with `:ro` flag.
- **Enforcement**: Docker volume configuration.

### 3. No Sensitive Data
- **Rule**: Service only processes source code structure, not secrets or credentials.
- **Validation**: Parsers extract symbols and relationships, not string literals or comments.

### 4. No Authentication
- **Rule**: Service has **NO** authentication. Backend proxy handles auth.
- **Rationale**: Service is internal-only, not user-facing.

---

## Future Enhancements

### Short-Term (Next 3 Months)
1. **Metrics**: Expose Prometheus metrics for monitoring
2. **More Edge Types**: Add `implements`, `decorates`

### Medium-Term (Next 6 Months)
1. **Incremental Parsing**: Only parse changed functions/classes
2. **Type Resolution**: Resolve TypeScript types and Python type hints
3. **Cross-Language**: Track Python-TypeScript dependencies (e.g., API contracts)
4. **Graph Analytics**: Compute cyclomatic complexity, coupling, cohesion

### Long-Term (Next 12 Months)
1. **More Languages**: Add Go, Rust, Java, C++
2. **Code Search**: Full-text search across codebase
3. **AI Integration**: Use graph for code generation and refactoring

---

## Known Limitations

1. **Limited Languages**: Only Python and TypeScript supported
2. **No Type Resolution**: Does not resolve TypeScript types or Python type hints
3. **No Cross-Language**: Does not track Python-TypeScript dependencies
4. **No External Deps**: Does not parse external libraries (node_modules, venv)
5. **No Incremental Parsing**: Re-parses entire file on change (not just changed functions)
6. **No Distributed**: Single-node service, not horizontally scalable

---

## Troubleshooting Checklist

### Service Not Starting
- [ ] Check Docker logs: `docker compose -f docker-compose.mcp.yml logs mcp-context-manager`
- [ ] Verify `WORKSPACE_ROOT` is set: `docker exec mcp-context-manager env | grep WORKSPACE_ROOT`
- [ ] Verify volumes are mounted: `docker exec mcp-context-manager ls -la /workspace/`
- [ ] Check for native module build errors in logs

### Service Shows "indexed 0 files"
- [ ] Verify `WORKSPACE_ROOT=/workspace` in docker-compose.mcp.yml
- [ ] Verify volumes are mounted correctly
- [ ] Check file patterns match actual files: `docker exec mcp-context-manager find /workspace/backend -name "*.py" | head`

### MCP Endpoints Timeout (504)
- [ ] Check MCP logs for slow queries
- [ ] Reduce `max_nodes` and `max_edges` parameters
- [ ] Check Docker memory usage: `docker stats mcp-context-manager`

### File Changes Not Detected
- [ ] Verify file is in watched directory (`backend/**/*.py`, `frontend/src/**/*.{ts,tsx,js,jsx}`, or `services/**/*.{ts,tsx,js,jsx}`)
- [ ] Check watcher logs: `docker compose -f docker-compose.mcp.yml logs mcp-context-manager | grep watcher`
- [ ] Restart MCP service: `docker compose -f docker-compose.mcp.yml restart mcp-context-manager`

---

## Dependencies Rationale

### Why Graphology?
- **Multi-directed graph**: Supports multiple edges between same nodes (e.g., function calls same function twice)
- **Efficient queries**: Fast neighbor traversal, subgraph extraction
- **TypeScript support**: First-class TypeScript types
- **No database**: In-memory, no external dependencies

### Why Tree-sitter?
- **Incremental parsing**: Can re-parse only changed portions (future optimization)
- **Error recovery**: Continues parsing even with syntax errors
- **Language support**: 40+ languages available
- **Performance**: Written in C, very fast

### Why Chokidar?
- **Cross-platform**: Works on macOS, Linux, Windows
- **Efficient**: Uses native file system events (fsevents, inotify)
- **Debouncing**: Built-in support for debouncing rapid changes
- **Stable**: Battle-tested in Webpack, Vite, Parcel

### Why Native HTTP?
- **Minimal dependencies**: No Express.js, no middleware bloat
- **Faster startup**: <1 second vs 2-3 seconds with Express
- **Lower memory**: ~50 MB less memory usage
- **Simpler**: No middleware chain, no routing complexity

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run linter: `npm run lint`
- [ ] Build TypeScript: `npm run build`
- [ ] Test locally: `npm run dev`
- [ ] Verify Docker build: `docker compose -f docker-compose.mcp.yml build mcp-context-manager`

### Deployment
- [ ] Stop old container: `docker compose -f docker-compose.mcp.yml stop mcp-context-manager`
- [ ] Build new image: `docker compose -f docker-compose.mcp.yml build mcp-context-manager`
- [ ] Start new container: `docker compose -f docker-compose.mcp.yml up -d mcp-context-manager`
- [ ] Verify health: `docker compose -f docker-compose.mcp.yml ps mcp-context-manager`
- [ ] Check logs: `docker compose -f docker-compose.mcp.yml logs -f mcp-context-manager`

### Post-Deployment
- [ ] Verify indexing: `docker compose -f docker-compose.mcp.yml logs mcp-context-manager | grep "indexed"`
- [ ] Test health endpoint: `curl http://localhost:3001/api/health`
- [ ] Test graph endpoint: `curl "http://localhost:3001/api/mcp/graph?scope=repo&max_nodes=10"`
- [ ] Monitor memory: `docker stats mcp-context-manager`

---

## Contact & Support

For issues or questions about the MCP Context Manager:
1. Check this local context document
2. Review logs: `./mcp.sh logs`
3. Check the [Troubleshooting Checklist](#troubleshooting-checklist)
4. Open an issue in the project repository
5. Contact the Internal Tooling Engineer

---

## Document Maintenance

**Last Updated**: 2026-05-05 (MCP Documentation Portal — Sprint 4 state sync)
**Maintained By**: Knowledge Manager
**Review Frequency**: After major changes to MCP service
**Related Documents**:
- `services/mcp-context-manager/README.md` (user-facing documentation)
- `docs/architecture/infrastructure.md` (overall system architecture)
- `.claude/rules/01-global-master-rules.md` (global development rules)
