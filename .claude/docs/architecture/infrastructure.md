# MCP Services — Infrastructure Reference

## Overview

The MCP (Model Context Protocol) services are **developer tooling** for
AI-assisted code analysis. They run in their own Docker Compose file with a
dedicated bridge network, fully independent from any application stack.

- **Compose file:** `docker-compose.mcp.yml`
- **Management script:** `./mcp.sh`
- **Network:** `mcp-network` (bridge, isolated)

---

## Services

| Service | Container | Host Port | Purpose |
|---------|-----------|-----------|---------|
| MCP Context Manager | `mcp-context-manager` | 3001 | Live file monitoring, AST parsing, dependency graph, MCP stdio server |
| MCP Context UI | `mcp-context-ui` | 8080 | Graph visualisation portal |

Both containers have Docker health checks. `mcp-context-ui` depends on
`mcp-context-manager` reaching `healthy` before it starts.

---

## Environment Variables

All variables are optional; defaults are shown. See `.env.mcp.example` for
the full annotated reference.

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKSPACE_PATH` | `.` | Host path mounted as `/project` inside the container |
| `HTTP_PORT` | `3001` | Port the Context Manager HTTP API listens on |
| `GRAPH_SNAPSHOT_DIR` | *(internal)* | Override snapshot persistence directory |
| `PYTHON_WATCH_GLOBS` | `**/*.py` | Glob for Python files (workspace-wide) |
| `TS_WATCH_GLOBS` | `**/*.{ts,tsx,js,jsx}` | Glob for TS/JS files (workspace-wide) |
| `WATCH_IGNORES` | *(14-entry built-in list)* | Comma-separated globs to exclude from indexing and watching (brace-expansion safe). Defaults cover `node_modules`, `dist`, `build`, `.next`, `.turbo`, `coverage`, `.git`, `.venv`, `venv`, `__pycache__`, `.tools/mcp-context-*`, `services/mcp-context-*`, `.kiro`, `.claude`. |

---

## Volume Mount

The entire workspace is mounted read-only at `/project`:

```yaml
- ${WORKSPACE_PATH:-.}:/project:ro
```

What gets **indexed** is controlled by the indexer's glob patterns, not the
volume boundary. The full-workspace mount is intentional — it avoids
rebuilding the container when you add new top-level directories. Use
`PYTHON_WATCH_GLOBS`, `TS_WATCH_GLOBS`, and `WATCH_IGNORES` to control scope
without changing the mount.

The cluster-config file is mounted separately:

```yaml
- ./services/mcp-context-manager/cluster-config.json:/project/cluster-config.json:ro
```

Edit `services/mcp-context-manager/cluster-config.json` to map your project's
folder structure to named clusters. See `cluster-config.README.md` for the
schema and `docs/CLUSTER-CONFIG.md` for the full guide.

> **Note — `setup.sh` output path:** The `setup.sh` initializer writes
> `cluster-config.json` to the **repo root** as a convenience. The Docker
> Compose file mounts `services/mcp-context-manager/cluster-config.json`
> into the container. After running `setup.sh`, copy or move the generated
> file to `services/mcp-context-manager/cluster-config.json`, or edit that
> file directly. The root-level copy is not read by the container.

### Nested-template layouts (collab-guard pattern)

When the MCP template itself lives inside the workspace (e.g., at
`.tools/mcp-context-manager/`), the built-in `**/.tools/mcp-context-*/**`
exclude prevents the indexer from indexing its own source code.
Set `WORKSPACE_PATH=../..` (relative to the compose file) so the indexer
roots at the project root, not inside the template directory.
App code at sibling directories (e.g., `collab-guard/src/`, `extension/`)
is picked up by the workspace-wide defaults automatically.

The cluster-config overlay mount ensures the indexer finds the config at
`/project/cluster-config.json` even when the workspace root is a parent
directory above the template.

---

## Management Commands

All operations go through `./mcp.sh`:

```bash
./mcp.sh build    # Build Docker images
./mcp.sh up       # Start services (detached); auto-copies .env.mcp.example → .env.mcp on first run
./mcp.sh down     # Stop and remove containers
./mcp.sh restart  # Restart running containers
./mcp.sh status   # Show container status and health
./mcp.sh logs     # Tail logs for all MCP services
./mcp.sh test     # Run the Context Manager test suite
./mcp.sh dev      # Start both services locally without Docker
./mcp.sh shell    # Open a shell in the mcp-context-manager container
./mcp.sh doctor   # Call /api/v1/diag, pretty-print result; exits 0 (healthy) / 2 (container down) / 3 (curl fail) / 4 (degraded)
```

### `mcp.sh` internals (Sprint 3)

- **`env_file_flag()`**: Emits `--env-file .env.mcp` when the file exists; all `docker compose` invocations use it. Safe on clean clones (flag omitted when file absent).
- **`validate_workspace()`**: Reads `WORKSPACE_PATH` from `.env.mcp`, resolves relative to the repo root (`COMPOSE_DIR`), exits 1 with a diagnostic message if the path doesn't exist. Called by `up`, `restart`, `build`.
- **Auto-copy**: `mcp.sh up` copies `.env.mcp.example` → `.env.mcp` on first run and prints `✓ Created .env.mcp from .env.mcp.example`.

### Docker Compose — `mcp-context-manager` service

`env_file: .env.mcp` (required: false) is declared before the explicit `environment:` block. Compose merge order ensures `WORKSPACE_ROOT` and `HTTP_PORT` from the explicit block always win over values in the env file.

For a production-style deploy (build → health-check → restart):

```bash
./mcp-deploy.sh
```

---

## AI Tool Integration

AI tools connect via **stdio transport** using `docker exec`:

```bash
docker exec -i mcp-context-manager node dist/server.js --stdio-only
```

Config templates for each supported tool live in `services/mcp-context-manager/`:

| Tool | Template file |
|------|---------------|
| Kiro | `kiro-config.template.json` |
| Cursor | `cursor-config.template.json` |
| Claude Desktop | `claude-desktop-config.template.json` |

See `services/mcp-context-manager/AI-TOOL-CONFIGS.md` for placement
instructions per platform (macOS / Windows / Linux / WSL).

---

## Troubleshooting

**1. Container won't start**
Check Docker is running and the compose file is reachable:
```bash
docker info
./mcp.sh build && ./mcp.sh up
./mcp.sh logs
```

**2. Indexer reports 0 files indexed**
The workspace mount path may not contain the expected source files.
Verify `WORKSPACE_PATH` points to your project root. The default glob patterns
(`**/*.py`, `**/*.{ts,tsx,js,jsx}`) are workspace-wide. If you still see 0
files, run `./mcp.sh doctor` for a full diagnostics snapshot.

**3. Port conflict (3001 or 8080 already in use)**
Set `HTTP_PORT` in your `.env` file and update the `ports` mapping in
`docker-compose.mcp.yml`, or stop the conflicting process.

**4. SSE disconnects / graph UI shows stale data**
Restart the Context Manager to force a re-index:
```bash
./mcp.sh restart
```
If the problem persists, check memory limits — the container is capped at
512 MB. Large workspaces may require raising `deploy.resources.limits.memory`
in `docker-compose.mcp.yml`.

**5. AI tool can't find the MCP server**
Confirm the container is healthy (`./mcp.sh status`) and that the config file
is in the correct location for your tool. See `AI-TOOL-CONFIGS.md`.
