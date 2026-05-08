# Dev Intelligence Stack

## What is the Dev Intelligence Stack?

The **Dev Intelligence Stack** is a portable AI development layer that transforms any repository into an AI-navigable codebase. It combines three components:

1. **`.claude/` directory** — Personas, rules, knowledge routing, and orchestration protocols
2. **MCP services** — Live AST graph and dependency analysis (runs in Docker)
3. **`CLAUDE.md`** — The root dispatcher that bootstraps AI tools into the system

Together, these form a self-contained "developer brain" that any AI tool (Claude Desktop, Cursor, Kiro) can consume to deeply understand your codebase structure, enforce team standards, and execute complex multi-file tasks with guardrails.

---

## Components

### 1. Personas (`.claude/personas/`)

Seven specialized AI agents, each confined to a specific domain:

| Persona | Domain | Scope |
|---------|--------|-------|
| `product_architect` | Planning & decomposition | Epic backlog, sprint generation |
| `frontend_architect` | Frontend domain (stack per `local_context`) | The frontend domain as mapped in `CLAUDE.md` (e.g., `/frontend`) |
| `backend_engineer` | Backend domain (stack per `local_context`) | The backend domain as mapped in `CLAUDE.md` (e.g., `/backend`) |
| `internal_tooling_engineer` | Developer tooling | Internal tooling directories as mapped in `CLAUDE.md` (e.g., `/services`) |
| `devops_qa_engineer` | Infrastructure & QA | Scripts, Docker, CI |
| `integration_reviewer` | Cross-service validation | Git diffs, contracts |
| `knowledge_manager` | Documentation & archival | `.claude/docs/` curation |

### 2. Rules (`.claude/rules/`)

- **`01-global-master-rules.md`** — Universal guardrails: no secret leakage, atomic commits, TDD enforcement, circuit breaker (anti-looping), blast radius checks, state sync drafts.
- **`02-knowledge-routing.md`** — Strict file routing protocol: where specs, tasks, reviews, archives, and issues must be written.

### 3. Multi-Agent Workflow (`.claude/MULTI_AGENTS_WORKFLOW.md`)

The orchestration protocol defining:
- 6-phase rolling horizon workflow (Plan → Execute → Review → Sync → Bug-Fix → Roll)
- Sprint math (max 6 feature tracks + 2 admin tracks)
- Context isolation (fresh chat per track)
- Integration review gates between sprints

### 4. MCP Context Manager (`services/mcp-context-manager/`)

A live AST graph service that:
- Parses Python and TypeScript files using Tree-sitter
- Maintains an in-memory dependency graph (graphology)
- Exposes 15 MCP tools via stdio transport (function context, callers, dead code, impact analysis, etc.)
- Serves an HTTP API on port 3001 for the visualization UI
- Watches files and updates incrementally (200ms debounce)

### 5. MCP Context UI (`services/mcp-context-ui/`)

A standalone React visualization portal that:
- Renders the dependency graph as an interactive 3D globe
- Shows real-time file changes via SSE
- Provides cluster-based geographic mapping of code modules
- Runs on port 8080, depends only on the MCP Context Manager

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI Tool (Claude / Cursor / Kiro)             │
│                                                                 │
│  Reads: CLAUDE.md → .claude/rules/ → .claude/personas/          │
│  Uses:  MCP tools via stdio (docker exec)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ stdio (docker exec)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              MCP Context Manager (mcp-context-manager:3001)      │
│                                                                 │
│  • Live AST graph of entire codebase                            │
│  • 15 query tools: callers, impact, dead code, coupling...      │
│  • File watcher with incremental re-parsing                     │
│  • Graph snapshot persistence for fast startup                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              MCP Context UI (mcp-context-ui:8080)                │
│                                                                 │
│  • 3D globe visualization of code clusters                      │
│  • Real-time SSE updates on file changes                        │
│  • Interactive dependency exploration                           │
└─────────────────────────────────────────────────────────────────┘
```

**Connection flow:**
1. AI tool reads `CLAUDE.md` to discover the `.claude/` context system
2. AI tool loads rules and adopts a persona based on the task domain
3. AI tool invokes MCP tools via `docker exec -i mcp-context-manager node dist/server.js --stdio-only`
4. MCP tools query the live graph and return structured JSON responses
5. AI tool uses graph intelligence to make informed code changes

---

## Portability

This stack is **project-agnostic**. Any repository can adopt it:

1. **Copy `.claude/`** — Adapt personas to your team's domains, update rules to your standards
2. **Add MCP services** — Drop in `docker-compose.mcp.yml` and configure file watch paths
3. **Create `CLAUDE.md`** — Point AI tools to your local context files
4. **Configure your AI tool** — Add the MCP server config (see Getting Started below)

The MCP services require only read-only access to your source code. They never modify files, never access the network, and never store sensitive data.

---

## Getting Started

### Quick Start (MCP Services)

```bash
# Start the MCP dev intelligence layer
./mcp.sh up

# Verify services are healthy
./mcp.sh status

# View the graph visualization
open http://localhost:8080
```

### AI Tool Configuration

Configure your AI tool to connect to the MCP Context Manager:

```json
{
  "mcpServers": {
    "codebase-graph": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-context-manager", "node", "dist/server.js", "--stdio-only"]
    }
  }
}
```

### Full Documentation

- **New project setup:** [`services/mcp-context-manager/docs/NEW-PROJECT.md`](../services/mcp-context-manager/docs/NEW-PROJECT.md)
- **Testing with AI tools:** [`services/mcp-context-manager/docs/TESTING-WITH-AI.md`](../services/mcp-context-manager/docs/TESTING-WITH-AI.md)
- **MCP service architecture:** [`services/mcp-context-manager/README.md`](../services/mcp-context-manager/README.md)
- **Infrastructure overview:** [`.claude/docs/architecture/infrastructure.md`](.claude/docs/architecture/infrastructure.md)
