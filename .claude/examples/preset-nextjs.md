# Adoption Preset: Next.js 14+ (App Router) + Node/Express API

A self-contained reference for adopting this template into a Next.js (App Router) + Node/Express monorepo.

---

## Assumed Folder Structure

```
my-app/
├── frontend/              # Next.js 14+ app (App Router)
│   └── src/
│       ├── app/           # App Router pages and layouts
│       ├── components/
│       └── lib/
├── backend/               # Node.js / Express API
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── services/
│   └── package.json
├── services/              # MCP tooling (this template)
│   ├── mcp-context-manager/
│   └── mcp-context-ui/
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
      "id": "frontend",
      "path": "frontend/src/",
      "label": "Next.js Frontend",
      "color": "#4A90D9"
    },
    {
      "id": "backend",
      "path": "backend/src/",
      "label": "Express API",
      "color": "#E28A4A"
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
| Domain      | Path          | Assigned Persona          | local_context.md                                          |
|-------------|---------------|---------------------------|-----------------------------------------------------------|
| Frontend    | /frontend     | frontend_architect        | frontend/.claude/local_context.md                         |
| Backend API | /backend      | backend_engineer          | backend/.claude/local_context.md                          |
| MCP Tools   | /services     | internal_tooling_engineer | services/mcp-context-manager/.claude/local_context.md     |
```

---

## `.env.mcp` Snippet

```dotenv
# Watch globs — comma-separated, no spaces
TS_WATCH_GLOBS=frontend/src/**/*.{ts,tsx,js,jsx},backend/src/**/*.{ts,js},services/**/*.{ts,tsx,js,jsx}

# No Python in this stack — leave PYTHON_WATCH_GLOBS unset or empty
# PYTHON_WATCH_GLOBS=
```

---

## First AI Task Prompt

Paste this into a new chat after `./mcp.sh up` is healthy:

```
Adopt the `product_architect` persona. I am starting a greenfield Next.js 14
(App Router) + Node/Express project. Read CLAUDE.md and
.claude/DEV_INTELLIGENCE.md. Generate the Master Ledger for a "User
Authentication" epic in
.claude/docs/tasks/epics/user-auth_backlog.md, then generate the first sprint
in .claude/docs/tasks/active_task.md. Strictly follow Sprint Math constants
from .claude/rules/01-global-master-rules.md.
```

---

## Notes

- The Express backend uses TypeScript, so only `TS_WATCH_GLOBS` is needed.
- If you add a Python microservice later, set `PYTHON_WATCH_GLOBS=<service>/**/*.py` in `.env.mcp` and restart the MCP stack.
- Next.js `public/` and `.next/` directories are excluded automatically by the indexer's default ignore list.
