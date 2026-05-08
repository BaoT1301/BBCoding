# AI Workflow Template

An AI-workflow template that layers a structured multi-agent orchestration
system and live-dependency-graph tooling onto any codebase. Drop it into a
greenfield project or an existing repo and your AI tools gain scoped personas,
rule-enforced guardrails, and real-time code-graph awareness — without touching
your production code.

Why it exists: generic AI assistants have no memory of your team's standards,
no awareness of cross-service contracts, and no guardrails against scope creep.
This template solves that by giving each AI agent a specific persona (Frontend,
Backend, DevOps, etc.), a strict set of rules it cannot violate, and a live
AST graph of your codebase it can query before making changes.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker Desktop | 24+ | Required for MCP services |
| Docker Compose | v2+ | Bundled with Docker Desktop 4.x+ |
| Node.js | 20+ | Optional — only needed for `./mcp.sh dev` (local mode) |
| OS | macOS / Linux / WSL | Windows native not tested |

**Install Docker Desktop:**

```bash
# macOS (Homebrew)
brew install --cask docker

# Linux (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh

# WSL — install Docker Desktop on the Windows side, then enable WSL integration
# in Docker Desktop → Settings → Resources → WSL Integration
```

Verify your install:

```bash
docker --version          # Docker version 24.x.x or higher
docker compose version    # Docker Compose version v2.x.x or higher
```

---

## Quick Start

### Step 1 — Clone the template

```bash
git clone <url> your-project-name
```

Expected: the repository clones into `your-project-name/`.

> **Most common failure:** SSH key not configured → use the HTTPS URL instead,
> or add your SSH key with `ssh-add ~/.ssh/id_ed25519`.

### Step 2 — Enter the directory

```bash
cd your-project-name
```

### Step 3 — Run the setup initializer

```bash
./setup.sh
```

The script prompts you for:
1. Your project name
2. The number of clusters (1–8) and their paths, labels, and colors
3. Which AI tool to configure (`kiro`, `cursor`, `claude-desktop`, or `skip`)

It then generates `cluster-config.json`, `.env.mcp`, and copies the correct
AI tool config template to the right location automatically.

**Non-interactive mode** (CI / scripted adoption):

```bash
cp setup.answers.yml.example setup.answers.yml   # fill in your values
./setup.sh --non-interactive
```

> **Most common failure:** Paths entered for clusters don't match your actual
> directory names → the indexer reports 0 files. Double-check spelling and
> trailing slashes in `cluster-config.json` after setup.

### Step 4 — Map your domains to AI personas

Edit root `CLAUDE.md`. Fill in the **Domain Mappings** table with your
project's directories and the persona responsible for each:

```markdown
| Domain      | Path        | Assigned Persona       | local_context.md                        |
|-------------|-------------|------------------------|-----------------------------------------|
| Frontend    | /frontend   | frontend_architect     | frontend/.claude/local_context.md       |
| Backend API | /backend    | backend_engineer       | backend/.claude/local_context.md        |
| MCP Tools   | /services   | internal_tooling_engineer | services/mcp-context-manager/.claude/local_context.md |
```

Delete the `<!-- BEGIN: CLAUDE-EXAMPLE --> … <!-- END: CLAUDE-EXAMPLE -->`
block once you have replaced it with your own mappings.

> **Most common failure:** Leaving the example block in place — AI tools will
> read the example rows as real mappings and route tasks to the wrong persona.

<details>
<summary>Manual setup (advanced) — skip if you used <code>./setup.sh</code></summary>

**Describe your project's folder structure manually:**

Edit `services/mcp-context-manager/cluster-config.json` to map your top-level
directories to named clusters. The default starter gives you two clusters:

```json
{
  "clusters": [
    { "id": "src",   "path": "src/",   "label": "Source Code", "color": "#4A90D9" },
    { "id": "tests", "path": "tests/", "label": "Tests",       "color": "#E28A4A" }
  ]
}
```

Replace `src/` and `tests/` with the actual directories in your project. Each
`path` is a prefix — any file whose relative path starts with that prefix
belongs to the cluster.

See [`services/mcp-context-manager/docs/CLUSTER-CONFIG.md`](services/mcp-context-manager/docs/CLUSTER-CONFIG.md)
for the full schema and advanced examples.

**Copy the AI tool config template manually:**

See [`services/mcp-context-manager/AI-TOOL-CONFIGS.md`](services/mcp-context-manager/AI-TOOL-CONFIGS.md)
for exact file locations per tool and platform.

</details>

### Step 5 — Build and start the MCP services

```bash
./mcp.sh build && ./mcp.sh up
```

Expected output (after ~30–60 s):

```
NAME                    IMAGE                STATUS          PORTS
mcp-context-manager     ...                  healthy         0.0.0.0:3001->3001/tcp
mcp-context-ui          ...                  healthy         0.0.0.0:8080->80/tcp
```

Verify with:

```bash
./mcp.sh status
curl http://localhost:3001/api/v1/health   # → {"status":"ok"}
open http://localhost:8080                 # Graph visualization UI
```

> **Most common failure:** Docker Desktop is not running → start it first, then
> retry. Port 3001 or 8080 already in use → see [Troubleshooting](#troubleshooting).

### Step 6 — Configure your AI tool

Copy the config template that matches your tool and place it at the correct
path. See [`services/mcp-context-manager/AI-TOOL-CONFIGS.md`](services/mcp-context-manager/AI-TOOL-CONFIGS.md)
for exact file locations per platform.

**Kiro:**
```bash
cp services/mcp-context-manager/kiro-config.template.json .kiro/mcp.json
```

**Cursor:**
```bash
cp services/mcp-context-manager/cursor-config.template.json .cursor/mcp.json
```

**Claude Desktop (macOS):**
```bash
cp services/mcp-context-manager/claude-desktop-config.template.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Restart your AI tool. The `mcp-context-manager` server should appear in its
connected MCP servers list.

> **Most common failure:** Config file placed in the wrong directory → the AI
> tool silently ignores it. Check the exact path in `AI-TOOL-CONFIGS.md`.

---

## Your First AI Task

Once the MCP stack is running and your AI tool is connected, try this prompt
to verify end-to-end connectivity and get a feel for the persona system:

**Open a new chat in your AI tool and paste:**

```
Adopt the `product_architect` persona. I want to add a user authentication
feature to this project. Scan the codebase, give me pros/cons of the
implementation approaches, and ask me any clarifying questions before
generating a plan.
```

**Expected response shape:**

The `product_architect` will:
1. Read `CLAUDE.md` to discover your domain mappings
2. Read `.claude/rules/01-global-master-rules.md` for guardrails
3. Ask 3–5 clarifying questions (OAuth vs email/password, session vs JWT, etc.)
4. After you answer, offer to generate a sprint plan in
   `.claude/docs/tasks/active_task.md`

If the agent instead responds generically without reading any `.claude/` files,
the MCP connection is not active — re-check Step 6 of the Quick Start.

For the full 6-phase orchestration workflow (Plan → Execute → Review → Sync →
Bug-Fix → Roll), see [`.claude/MULTI_AGENTS_WORKFLOW.md`](.claude/MULTI_AGENTS_WORKFLOW.md).

---

## Customizing for Your Stack

### (a) Map your folder structure in `CLAUDE.md`

The `CLAUDE.md` Domain Mappings table is the single source of truth for which
persona owns which directory. Every AI agent reads this file first. Keep it
accurate — stale mappings cause agents to route tasks to the wrong persona.

Add one row per domain. Cross-cutting personas (`devops_qa_engineer`,
`integration_reviewer`, `product_architect`, `knowledge_manager`) operate
across the whole repo and do not need a row.

### (b) Define clusters in `cluster-config.json`

Clusters control how the MCP graph visualization groups your code. They also
help the AI understand your project's logical structure at a glance.

Rules of thumb:
- One cluster per top-level domain directory (frontend, backend, services, etc.)
- Keep cluster count between 2 and 8 for readable visualizations
- Use distinct colors so the graph is easy to read at a glance

Full schema reference: [`services/mcp-context-manager/docs/CLUSTER-CONFIG.md`](services/mcp-context-manager/docs/CLUSTER-CONFIG.md)

### (c) Add a test command to each service's `local_context.md`

Each service directory should have a `.claude/local_context.md` that tells
agents which test runner to use. Example:

```markdown
## Test Runner
Run tests with: `npm test` (vitest)
```

Agents read this before running tests. Without it, they fall back to the
global rule's example list and may guess wrong.

### (d) Pick which personas apply

The default set of seven personas covers most full-stack projects. If your
project has no frontend, you can ignore `frontend_architect`. If you have
additional domains (e.g., a data pipeline), add a new persona file in
`.claude/personas/` following the existing format.

See [`.claude/personas/`](.claude/personas/) for all seven default definitions.

---

## Worked Adoption Example: Next.js + FastAPI Monorepo

This example shows the exact files you would produce when adopting this
template into a greenfield Next.js (TypeScript) + FastAPI (Python) monorepo.
It exercises both MCP-indexer languages and is a common starting point.

> For a deeper dive, see `.claude/examples/preset-nextjs.md` (Sprint 2
> deliverable — not yet available).

### Project structure assumed

```
my-app/
├── frontend/          # Next.js app
│   └── src/
├── backend/           # FastAPI app
│   └── app/
├── services/          # MCP tooling (this template)
│   ├── mcp-context-manager/
│   └── mcp-context-ui/
├── cluster-config.json
├── CLAUDE.md
└── docker-compose.mcp.yml
```

### `cluster-config.json`

```json
{
  "clusters": [
    { "id": "frontend", "path": "frontend/src/", "label": "Next.js Frontend", "color": "#4A90D9" },
    { "id": "backend",  "path": "backend/app/",  "label": "FastAPI Backend",  "color": "#E28A4A" },
    { "id": "services", "path": "services/",     "label": "MCP Tooling",      "color": "#7B68EE" }
  ]
}
```

### `CLAUDE.md` Domain Mappings table

```markdown
| Domain      | Path        | Assigned Persona          | local_context.md                        |
|-------------|-------------|---------------------------|-----------------------------------------|
| Frontend    | /frontend   | frontend_architect        | frontend/.claude/local_context.md       |
| Backend API | /backend    | backend_engineer          | backend/.claude/local_context.md        |
| MCP Tools   | /services   | internal_tooling_engineer | services/mcp-context-manager/.claude/local_context.md |
```

### First AI task prompt

```
Adopt the `product_architect` persona. I am starting a greenfield Next.js +
FastAPI project. Read CLAUDE.md and .claude/DEV_INTELLIGENCE.md. Generate the
Master Ledger for a "User Authentication" epic in
.claude/docs/tasks/epics/user-auth_backlog.md, then generate the first sprint
in .claude/docs/tasks/active_task.md. Strictly follow Sprint Math constants
from .claude/rules/01-global-master-rules.md.
```

---

## Troubleshooting

### 1. `./mcp.sh up` fails immediately

**Symptom:** `docker compose up` exits with an error before containers start.

**Causes and fixes:**
- Docker Desktop is not running → open Docker Desktop and wait for the whale
  icon to stop animating, then retry.
- Port 3001 or 8080 is already in use → find and stop the conflicting process:
  ```bash
  lsof -i :3001   # find what's using port 3001
  lsof -i :8080   # find what's using port 8080
  ```
  Or override the port in `.env.mcp` (copy from `.env.mcp.example`):
  ```bash
  HTTP_PORT=3002
  ```
  Then update the `ports` mapping in `docker-compose.mcp.yml` to match.

### 2. MCP indexes 0 files

**Symptom:** `./mcp.sh logs` shows `indexed 0 files` or the graph UI is empty.

**Causes and fixes:**
- `cluster-config.json` paths don't match your actual directory names →
  verify each `path` value exists in your project root.
- `WORKSPACE_PATH` is set to the wrong directory → check `.env.mcp` and
  confirm the path points to your project root.
- The indexer's default glob patterns (`backend/**/*.py`,
  `frontend/src/**/*.{ts,tsx,js,jsx}`, `services/**/*.{ts,tsx,js,jsx}`) don't
  match your layout → full env-configurable globs are a Sprint-2 feature.
  Until then, structure your project to match the default paths, or adjust the
  glob patterns in the indexer source.

### 3. AI tool can't find the MCP server

**Symptom:** The AI tool shows no connected MCP servers, or `mcp-context-manager`
is missing from the server list.

**Causes and fixes:**
- Config file is in the wrong location → re-read
  [`services/mcp-context-manager/AI-TOOL-CONFIGS.md`](services/mcp-context-manager/AI-TOOL-CONFIGS.md)
  for the exact path per tool and OS.
- Container is not running → run `./mcp.sh status` and confirm both containers
  show `healthy`. If not, run `./mcp.sh up`.
- AI tool was not restarted after adding the config → restart the tool.

### 4. Graph UI is blank (port 8080 loads but shows nothing)

**Symptom:** `http://localhost:8080` loads but the graph is empty or shows a
connection error.

**Causes and fixes:**
- `mcp-context-manager` is not yet healthy when the UI starts → wait 30–60 s
  and refresh. The UI depends on the manager reaching `healthy`.
- Host firewall is blocking port 8080 → temporarily disable the firewall or
  add an exception for port 8080.
- Memory limit hit on large workspaces → the container is capped at 512 MB.
  Raise `deploy.resources.limits.memory` in `docker-compose.mcp.yml` if needed.

### 5. Docs say X but the code does Y

**Symptom:** A README or `.claude/` doc describes behavior that doesn't match
what you observe.

**Fix:** File an issue. Open `.claude/docs/issues/issues.md` and add a
description of the discrepancy. The `knowledge_manager` persona will triage it
in the next sprint's Track 8.

---

## Deep Dives

- [`.claude/DEV_INTELLIGENCE.md`](.claude/DEV_INTELLIGENCE.md) — Full architecture reference: what each component does and how they connect.
- [`.claude/MULTI_AGENTS_WORKFLOW.md`](.claude/MULTI_AGENTS_WORKFLOW.md) — The 6-phase rolling horizon workflow with prompt templates.
- [`services/mcp-context-manager/docs/NEW-PROJECT.md`](services/mcp-context-manager/docs/NEW-PROJECT.md) — Step-by-step guide for adding MCP to an existing project.
- [`services/mcp-context-manager/docs/TOOLS.md`](services/mcp-context-manager/docs/TOOLS.md) — All 15 MCP tools: what they do and example queries.
- [`.claude/rules/`](.claude/rules/) — Global guardrails and knowledge routing protocol.
- [`.claude/personas/`](.claude/personas/) — All seven persona definitions.

---

## Contributing / License

<!-- TODO: fill in contributing guidelines -->
<!-- TODO: fill in license -->
