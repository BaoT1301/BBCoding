# .claude/ — AI Orchestration Layer

This folder is the "developer brain" for AI tools operating in this repository. It contains the rules, personas, workflow protocols, and documentation that govern how AI agents plan, execute, and review work.

---

## Read-Order for Agents

When starting a task, read in this order:

1. `rules/01-global-master-rules.md` — Universal guardrails (no secret leakage, TDD enforcement, blast radius checks, circuit breaker, state sync drafts). Read this first, always.
2. `rules/02-knowledge-routing.md` — Where to write specs, tasks, reviews, archives, and issues. Determines which file to touch for any given output.
3. `personas/[relevant].md` — The persona matching your assigned role. Defines your domain scope, stack constraints, and out-of-scope routing rules.
4. `DEV_INTELLIGENCE.md` — Architecture overview: what the MCP services do, how the components connect, and the full persona roster.
5. `MULTI_AGENTS_WORKFLOW.md` — The 6-phase rolling horizon workflow (Plan → Execute → Review → Sync → Bug-Fix → Roll). Read before starting any sprint.

---

## Folder Map

| Folder / File | Purpose |
|---|---|
| `rules/` | Global guardrails and knowledge routing protocol |
| `personas/` | Seven specialized AI agent definitions |
| `docs/tasks/` | Active sprint backlog (`active_task.md`) and epic ledgers (`epics/`) |
| `docs/reviews/` | Staging area for State Sync Drafts awaiting human approval |
| `docs/core/api-contracts/` | JSON schema contracts negotiated between frontend and backend |
| `docs/architecture/` | Long-lived architecture docs (infrastructure, API spec, web interface) |
| `docs/guides/` | Operational runbooks (troubleshooting, cluster configuration) |
| `docs/issues/` | Active issues queue (`issues.md`) |
| `docs/archives/` | Archived ADRs (re-created by `knowledge_manager` after each sprint) |
| `examples/` | Worked case studies and stack preset templates |
| `DEV_INTELLIGENCE.md` | Architecture reference — see this for component details |
| `MULTI_AGENTS_WORKFLOW.md` | Full 6-phase orchestration protocol |

---

## When to Write Where

| Output type | Write to |
|---|---|
| New feature plan / sprint | `docs/tasks/active_task.md` |
| Epic-level backlog | `docs/tasks/epics/[feature_name]_backlog.md` |
| State Sync Draft (post-track) | `docs/reviews/track-[N]-[persona]-sync.md` |
| API contract change | `docs/core/api-contracts/` |
| Bug or blocked issue | `docs/issues/issues.md` |
| Resolved issue archive | `docs/issues/archives/[sprint]-resolved.md` |
| Sprint ADR | `docs/archives/adrs/[date]-[slug].md` |
| Worked example / preset | `examples/[name].md` |

> For full routing rules, see `rules/02-knowledge-routing.md`.
