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
| `PYTHON_WATCH_GLOBS` | `backend/**/*.py` | Glob for Python files *(Sprint-2 feature)* |
| `TS_WATCH_GLOBS` | `frontend/src/**/*.{ts,tsx,js,jsx},services/**/*.{ts,tsx,js,jsx}` | Glob for TS/JS files *(Sprint-2 feature)* |

---

## Volume Mount

The entire workspace is mounted read-only at `/project`:

```yaml
- ${WORKSPACE_PATH:-.}:/project:ro
```

What gets **indexed** is controlled by the indexer's glob patterns, not the
volume boundary. The full-workspace mount is intentional — it avoids
rebuilding the container when you add new top-level directories. Glob-based
filtering (Sprint-2) will let you restrict indexing without changing the mount.

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

---

## Management Commands

All operations go through `./mcp.sh`:

```bash
./mcp.sh build    # Build Docker images
./mcp.sh up       # Start services (detached)
./mcp.sh down     # Stop and remove containers
./mcp.sh restart  # Restart running containers
./mcp.sh status   # Show container status and health
./mcp.sh logs     # Tail logs for all MCP services
./mcp.sh test     # Run the Context Manager test suite
./mcp.sh dev      # Start both services locally without Docker
./mcp.sh shell    # Open a shell in the mcp-context-manager container
```

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
The workspace mount path may not contain the expected source directories.
Verify `WORKSPACE_PATH` points to your project root and that the directories
referenced in `cluster-config.json` exist inside it. Full glob-based
configuration is a Sprint-2 feature.

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
