# AI Orchestration

Welcome. You are operating in a multi-agent orchestrated repository. This file is the root dispatcher — the first file any AI tool reads to discover how this codebase is structured and which persona to adopt for a given task.

## Global Rules

You must strictly abide by the global master rules and knowledge routing protocols defined in:

* `.claude/rules/01-global-master-rules.md`
* `.claude/rules/02-knowledge-routing.md`

## How to Use This File

Before writing any code, locate the row in the **Domain Mappings** table below that matches the directory you are working in. Read the `local_context.md` at the listed path — it defines the exact tech stack, test runner, auth rules, and architectural constraints for that domain. Do not assume the stack; let the local context dictate it.

## Domain Mappings

| Domain | Path | Assigned Persona | local_context.md |
|--------|------|-----------------|-----------------|
| *(add your domains here)* | *(path)* | *(persona)* | *(path/to/local_context.md)* |

<!-- BEGIN: CLAUDE-EXAMPLE -->
## Example Mappings (delete this section when adopting)

The table below shows what a filled-in mapping looks like for a Next.js + FastAPI monorepo. Replace every row with your own project's structure.

| Domain | Path | Assigned Persona | local_context.md |
|--------|------|-----------------|-----------------|
| Frontend | `/frontend` | `frontend_architect` | `frontend/.claude/local_context.md` |
| Backend API | `/backend` | `backend_engineer` | `backend/.claude/local_context.md` |
| MCP Context Manager | `/services/mcp-context-manager` | `internal_tooling_engineer` | `services/mcp-context-manager/.claude/local_context.md` |
| MCP Context UI | `/services/mcp-context-ui` | `internal_tooling_engineer` | `services/mcp-context-ui/.claude/local_context.md` |

> **Note:** The `devops_qa_engineer`, `integration_reviewer`, `product_architect`, and `knowledge_manager` personas operate across the whole repository and do not have a single domain path. They read this file and `.claude/DEV_INTELLIGENCE.md` for orientation.
<!-- END: CLAUDE-EXAMPLE -->

## Contextual Execution

**Crucial:** Do not assume the tech stack. Let the local context files dictate the specific frameworks, validation methods, and architectural constraints for each domain.
