# Adoption Preset: Django (Python) + React (TypeScript)

A self-contained reference for adopting this template into a Django + React monorepo.

---

## Assumed Folder Structure

```
my-app/
├── frontend/              # React + TypeScript (Vite or CRA)
│   └── src/
│       ├── components/
│       ├── pages/
│       └── api/
├── backend/               # Django application
│   ├── manage.py
│   ├── config/            # Django settings
│   └── apps/
│       ├── users/
│       └── core/
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
      "label": "React Frontend",
      "color": "#61DAFB"
    },
    {
      "id": "backend",
      "path": "backend/",
      "label": "Django Backend",
      "color": "#092E20"
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
# Python watch globs — Django source files
PYTHON_WATCH_GLOBS=backend/**/*.py

# TypeScript watch globs — React frontend + MCP tooling
TS_WATCH_GLOBS=frontend/src/**/*.{ts,tsx,js,jsx},services/**/*.{ts,tsx,js,jsx}
```

---

## First AI Task Prompt

Paste this into a new chat after `./mcp.sh up` is healthy:

```
Adopt the `product_architect` persona. I am starting a greenfield Django +
React project. Read CLAUDE.md and .claude/DEV_INTELLIGENCE.md. Generate the
Master Ledger for a "User Authentication" epic in
.claude/docs/tasks/epics/user-auth_backlog.md, then generate the first sprint
in .claude/docs/tasks/active_task.md. Strictly follow Sprint Math constants
from .claude/rules/01-global-master-rules.md.
```

---

## Notes

- Django's `manage.py`, `migrations/`, and `__pycache__/` are excluded automatically by the indexer.
- If you use Django REST Framework, the `backend_engineer` persona should be assigned to `/backend`.
- For Celery workers in a separate directory (e.g., `workers/`), add a fourth cluster and extend `PYTHON_WATCH_GLOBS=backend/**/*.py,workers/**/*.py`.
- React `node_modules/` and `dist/` are excluded automatically.
