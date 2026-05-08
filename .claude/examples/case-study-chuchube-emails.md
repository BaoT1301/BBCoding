# Case Study: Adopting the AI Workflow Template into chuchube-emails

A worked example showing how an existing Python + React full-stack project was migrated into this template. Use this as a concrete reference when adopting the template into a project that already has running code.

---

## Project Background

**chuchube-emails** was a full-stack email management application with:

- **Backend:** Python / FastAPI — REST API, Celery workers, PostgreSQL via SQLAlchemy
- **Frontend:** React / TypeScript — Vite-bundled SPA, Tailwind CSS
- **Infrastructure:** Existing `docker-compose.yml` managing the app stack (Postgres, Redis, API, worker, Nginx)
- **Repo layout:**
  ```
  chuchube-emails/
  ├── backend/          # FastAPI app (Python)
  │   └── app/
  ├── frontend/         # React SPA (TypeScript)
  │   └── src/
  ├── services/         # (empty — added during adoption)
  ├── docker-compose.yml
  └── README.md
  ```

The project had no AI tooling, no persona system, and no code-graph awareness before adoption.

---

## Adoption Steps Taken

### Step 1 — Clone the template alongside the project

The template was cloned into a scratch directory and its non-production files were copied into the existing repo root:

```bash
git clone <template-url> ai-workflow-tmp
cp -r ai-workflow-tmp/.claude          chuchube-emails/
cp -r ai-workflow-tmp/services         chuchube-emails/
cp    ai-workflow-tmp/docker-compose.mcp.yml chuchube-emails/
cp    ai-workflow-tmp/mcp.sh           chuchube-emails/
cp    ai-workflow-tmp/.env.mcp.example chuchube-emails/
```

The production `docker-compose.yml` was left untouched. The MCP stack runs from `docker-compose.mcp.yml` in isolation.

### Step 2 — Run `./setup.sh`

```
Project name: chuchube-emails
Number of clusters: 3
  Cluster 1 — id: backend,  path: backend/app/,  label: FastAPI Backend,  color: #E28A4A
  Cluster 2 — id: frontend, path: frontend/src/, label: React Frontend,   color: #4A90D9
  Cluster 3 — id: services, path: services/,     label: MCP Tooling,      color: #7B68EE
AI tool: kiro
```

`setup.sh` generated `cluster-config.json`, `.env.mcp`, and copied the Kiro MCP config to `.kiro/mcp.json`.

### Step 3 — Map domains in `CLAUDE.md`

The Domain Mappings table was filled in (see below). The `<!-- BEGIN: CLAUDE-EXAMPLE -->` block was deleted.

### Step 4 — Verify watch globs in `.env.mcp`

The default globs matched the project layout exactly, so no overrides were needed. The `.env.mcp` snippet was left at defaults (see Watch Glob Configuration below).

### Step 5 — Build and start MCP services

```bash
./mcp.sh build && ./mcp.sh up
```

Both containers reached `healthy` within 45 seconds. The graph UI at `http://localhost:8080` showed all three clusters populated.

### Step 6 — Configure Kiro

`setup.sh` had already placed the config at `.kiro/mcp.json`. Kiro was restarted and `mcp-context-manager` appeared in the connected servers list.

---

## `cluster-config.json` Used

```json
{
  "clusters": [
    { "id": "backend",  "path": "backend/app/",  "label": "FastAPI Backend",  "color": "#E28A4A" },
    { "id": "frontend", "path": "frontend/src/", "label": "React Frontend",   "color": "#4A90D9" },
    { "id": "services", "path": "services/",     "label": "MCP Tooling",      "color": "#7B68EE" }
  ]
}
```

---

## `CLAUDE.md` Domain Mappings

```markdown
| Domain      | Path          | Assigned Persona             | local_context.md                                          |
|-------------|---------------|------------------------------|-----------------------------------------------------------|
| Frontend    | /frontend     | frontend_architect           | frontend/.claude/local_context.md                         |
| Backend API | /backend      | backend_engineer             | backend/.claude/local_context.md                          |
| MCP Tools   | /services     | internal_tooling_engineer    | services/mcp-context-manager/.claude/local_context.md     |
```

---

## Watch Glob Configuration

Default globs matched the project layout — no overrides required:

```dotenv
# .env.mcp (relevant excerpt — defaults used, no overrides set)
# PYTHON_WATCH_GLOBS=backend/**/*.py          ← default, not set
# TS_WATCH_GLOBS=frontend/src/**/*.{ts,tsx,js,jsx},services/**/*.{ts,tsx,js,jsx}  ← default, not set
```

If the FastAPI app had lived under `api/` instead of `backend/`, the override would have been:

```dotenv
PYTHON_WATCH_GLOBS=api/**/*.py
```

---

## Lessons Learned / Gotchas

- **Hardcoded paths in sprint history.** Early `.claude/docs/tasks/` files referenced `chuchube-emails` by name in task descriptions and persona assignments. These had to be purged before the template could be published as generic. The purge was tracked as Sprint 2 Tracks 1–2.
- **Existing `docker-compose.yml` conflict.** The project already had a `docker-compose.yml` for the app stack. The MCP stack uses a separate `docker-compose.mcp.yml` — this separation was intentional and caused no conflicts, but it was not obvious from the README at first.
- **`CLAUDE.md` example block left in.** On the first AI task attempt, the agent read the `<!-- BEGIN: CLAUDE-EXAMPLE -->` block as real mappings and routed a backend task to `frontend_architect`. Deleting the example block immediately fixed routing.
- **`services/` directory did not exist.** The original repo had no `services/` directory. It had to be created before `./mcp.sh build` could mount the volume correctly.
- **Graph showed 0 files on first run.** `WORKSPACE_PATH` in `.env.mcp` was left pointing to the template's own root instead of the chuchube-emails root. Correcting the path and restarting the container resolved it.

---

## Result

After adoption, AI agents operating in the repo had full persona scoping, rule-enforced guardrails, and a live AST dependency graph of the Python and TypeScript codebase — with zero changes to the production application code or its Docker stack.
