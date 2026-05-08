# Adoption Preset: Generic Monorepo (Turborepo / Nx)

A self-contained reference for adopting this template into a TypeScript monorepo managed by Turborepo or Nx.

---

## Assumed Folder Structure

```
my-monorepo/
├── apps/
│   ├── web/               # Next.js or Vite web app
│   │   └── src/
│   └── api/               # Node.js / Fastify API
│       └── src/
├── packages/
│   ├── ui/                # Shared component library
│   │   └── src/
│   └── shared/            # Shared types, utilities, constants
│       └── src/
├── services/              # MCP tooling (this template)
│   ├── mcp-context-manager/
│   └── mcp-context-ui/
├── turbo.json             # or nx.json
├── cluster-config.json
├── CLAUDE.md
└── docker-compose.mcp.yml
```

---

## `cluster-config.json`

```json
{
  "clusters": [
    {
      "id": "apps-web",
      "path": "apps/web/src/",
      "label": "Web App",
      "color": "#4A90D9"
    },
    {
      "id": "apps-api",
      "path": "apps/api/src/",
      "label": "API App",
      "color": "#E28A4A"
    },
    {
      "id": "packages",
      "path": "packages/",
      "label": "Shared Packages",
      "color": "#50C878"
    },
    {
      "id": "services",
      "path": "services/",
      "label": "MCP Tooling",
      "color": "#7B68EE"
    }
  ]
}
```

---

## `CLAUDE.md` Domain Mappings Table

```markdown
| Domain          | Path            | Assigned Persona          | local_context.md                                          |
|-----------------|-----------------|---------------------------|-----------------------------------------------------------|
| Web App         | /apps/web       | frontend_architect        | apps/web/.claude/local_context.md                         |
| API App         | /apps/api       | backend_engineer          | apps/api/.claude/local_context.md                         |
| Shared Packages | /packages       | frontend_architect        | packages/.claude/local_context.md                         |
| MCP Tools       | /services       | internal_tooling_engineer | services/mcp-context-manager/.claude/local_context.md     |
```

> **Note:** `packages/` is assigned to `frontend_architect` because shared UI components and types are typically owned by the frontend domain. Adjust to `backend_engineer` or a dedicated `platform_engineer` persona if your team structure differs.

---

## `.env.mcp` Snippet

```dotenv
# TypeScript watch globs — all apps, packages, and MCP tooling
TS_WATCH_GLOBS=apps/web/src/**/*.{ts,tsx,js,jsx},apps/api/src/**/*.{ts,js},packages/ui/src/**/*.{ts,tsx},packages/shared/src/**/*.{ts},services/**/*.{ts,tsx,js,jsx}

# No Python in this stack — leave PYTHON_WATCH_GLOBS unset
# PYTHON_WATCH_GLOBS=
```

---

## First AI Task Prompt

Paste this into a new chat after `./mcp.sh up` is healthy:

```
Adopt the `product_architect` persona. I am starting a greenfield Turborepo
monorepo with a Next.js web app, a Fastify API, and shared packages. Read
CLAUDE.md and .claude/DEV_INTELLIGENCE.md. Generate the Master Ledger for a
"Design System Bootstrap" epic in
.claude/docs/tasks/epics/design-system_backlog.md, then generate the first
sprint in .claude/docs/tasks/active_task.md. Strictly follow Sprint Math
constants from .claude/rules/01-global-master-rules.md.
```

---

## Notes

- Each `apps/*` and `packages/*` workspace should have its own `.claude/local_context.md` describing its test runner and stack.
- Turborepo's `.turbo/` cache directory and `node_modules/` at any depth are excluded automatically.
- If you add a Python data pipeline under `apps/pipeline/`, extend `PYTHON_WATCH_GLOBS=apps/pipeline/**/*.py`.
- The `packages/shared` cluster is especially useful for tracking cross-app type contract changes via the MCP `get_impact_analysis` tool.
