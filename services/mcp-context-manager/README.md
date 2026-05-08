# MCP Context Manager

A standalone [Model Context Protocol](https://modelcontextprotocol.io/) server that maintains a live dependency graph of your codebase. It parses Python and TypeScript files using Tree-sitter, tracks imports/calls/reads/writes in a Graphology graph, and exposes 15 MCP tools for AI-powered code analysis.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Context Manager                        │
│                                                             │
│  server.ts (Bootstrap — supports --stdio-only mode)         │
│    ├── ClusterConfigLoader    (cluster-config.json watcher) │
│    ├── GeographicMapper       (file → lat/lng coordinates)  │
│    ├── GraphPersistence       (snapshot save/load)          │
│    ├── IncrementalIndexer     (AST parsing + graph build)   │
│    │     ├── PythonParser     (tree-sitter)                 │
│    │     └── TypeScriptParser (TS compiler API)             │
│    ├── GraphStore             (Graphology multi-digraph)     │
│    ├── LiveFileWatcher        (Chokidar, debounced)         │
│    ├── HttpApiServer          (native http, port 3001)      │
│    │     └── SSE endpoint     (/api/v1/mcp/events)          │
│    └── MCP Tools (15)         (stdio transport)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
# 1. Start MCP services (Docker)
./mcp.sh up

# 2. Verify health
curl http://localhost:3001/api/health
# → {"status":"ok"}

# 3. Configure your AI tool (see docs/SETUP.md for details)
#    Kiro: .kiro/settings/mcp.json already configured
#    Claude Desktop: copy kiro-config.template.json
```

For detailed setup instructions, see [`docs/SETUP.md`](docs/SETUP.md).

---

## MCP Tools

| # | Tool | Description |
|---|------|-------------|
| 1 | `get_function_context` | Graph neighborhood around a function (callers, callees, related files) |
| 2 | `get_file_dependents` | Files that import or are imported by a given file |
| 3 | `get_symbol_references` | All references (reads, writes, calls) to a symbol |
| 4 | `export_dependency_graph` | Export graph slice for visualization (repo/file/symbol scope) |
| 5 | `get_callers` | Reverse call graph — who calls this function? |
| 6 | `get_call_chain` | Full upstream/downstream call chain as a subgraph |
| 7 | `get_dead_code` | Functions/classes with zero inbound edges |
| 8 | `get_impact_analysis` | Transitive closure of files affected by a change |
| 9 | `get_module_coupling` | Coupling score between two files |
| 10 | `get_hotspots` | Top-N most-referenced symbols (highest fan-in) |
| 11 | `get_class_hierarchy` | Inheritance tree (ancestors + descendants) |
| 12 | `search_symbols` | Fuzzy/regex search across all symbols |
| 13 | `get_circular_dependencies` | Detect import cycles |
| 14 | `get_complexity_metrics` | Complexity scoring for functions/classes |
| 15 | `get_change_risk` | Risk assessment for a set of changed files |

---

## Documentation

| Guide | Description |
|-------|-------------|
| [`docs/API.md`](docs/API.md) | Complete HTTP API reference (all 32 REST endpoints) |
| [`docs/TOOLS.md`](docs/TOOLS.md) | MCP tools reference (all 15 tools, parameters, examples) |
| [`docs/SETUP.md`](docs/SETUP.md) | Docker setup, WORKSPACE_PATH, environment variables, verification |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Troubleshooting guide (Docker, ports, indexing, AI connectivity) |
| [`docs/CLUSTER-CONFIG.md`](docs/CLUSTER-CONFIG.md) | cluster-config.json schema, examples, geographic mapping algorithm |
| [`docs/SSE.md`](docs/SSE.md) | Real-time SSE events, data flow, client examples |
| [`docs/TESTING-WITH-AI.md`](docs/TESTING-WITH-AI.md) | Configure Kiro, Claude Desktop, Cursor; test queries |
| [`docs/NEW-PROJECT.md`](docs/NEW-PROJECT.md) | Add MCP to a new project (Next.js, Django, etc.) |
| [`openapi.yaml`](openapi.yaml) | OpenAPI 3.1.0 spec for all 32+ HTTP endpoints |

---

## Development

```bash
cd services/mcp-context-manager

# Install dependencies
npm install

# Run in dev mode (hot reload via tsx)
npm run dev

# Build TypeScript
npm run build

# Run tests (296 tests across 31 files)
npm run test

# Lint
npm run lint
```

### Project Structure

```
src/
├── server.ts                 # Bootstrap (--stdio-only flag)
├── api.ts                    # HTTP API (native http module, SSE)
├── geographic-mapper.ts      # File path → lat/lng mapping
├── cluster/                  # Cluster config loader + hot-reload
├── graph/
│   ├── graph-store.ts        # Graphology graph + query methods
│   └── graph-persistence.ts  # Snapshot save/load (atomic writes)
├── indexer/                   # Incremental file indexing
├── parsers/                   # Python (tree-sitter) + TypeScript (compiler API)
├── tools/                     # MCP tool definitions (15 tools)
├── types/                     # TypeScript type definitions
├── utils/                     # Query guards (timeout, retry, pagination)
├── watcher/                   # Chokidar file watcher
└── __tests__/                 # 296 unit tests (Vitest)
```

---

## Key Design Decisions

- **Zero authentication** — internal tool, Docker-network only
- **Native HTTP** — no Express.js; minimal deps, fast startup
- **Read-only volumes** — never writes to source code
- **Incremental updates** — only re-parses changed files + dependents
- **Graph snapshots** — persists to disk for sub-second restarts
- **`--stdio-only` mode** — skips HTTP server when invoked by AI tools via `docker exec`

---

## License

Part of the host repository. See root [LICENSE](../../LICENSE).
