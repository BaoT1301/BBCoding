# Epic: AI-Workflow-Template Generalization

**Started:** 2026-05-06
**Owner:** product_architect
**Goal:** Transform this repository from a chuchube-emails-specific orchestration setup into a generic, portable AI-Workflow template. Remove project-specific references, parameterize infrastructure, add a root `README.md` that walks a brand-new developer through setup step-by-step.

**Selected Approach:** E — Hybrid. Generalize this repo in-place, purge chuchube-specific sprint history, add env-driven parameterization, ship an interactive `setup.sh` initializer, and write a step-by-step root `README.md`.

---

## Progress Tracking

- **Sprint 1:** Foundation audit + orchestration generalization + Docker/cluster config + root README (manual setup path) ✅ COMPLETE
- **Sprint 2:** Interactive `setup.sh` initializer + env-configurable indexer globs + service-level `local_context.md` cleanup + example presets (Next.js, Django+React, monorepo) + remaining chuchube scans + AI-tool-config adopter walkthroughs ✅ COMPLETE — Items E (remaining), F (all four files), J (all three sub-items), L (all five sub-items), M (all three sub-items)
- **Sprint 3:** End-to-end verification + polish (to be scheduled)

**Sprint 3 Bug-Fix (2026-05-08):** Fresh-clone bootstrap defects resolved — env-load fix, brace-aware glob splitter, workspace-wide defaults + excludes, `/api/v1/diag` endpoint, `./mcp.sh doctor` CLI, bootstrap integration test on `collab-guard` fixture. ✅ COMPLETE

**Sprint 4 Bug-Fix (2026-05-08):** UI health status regression fixed — `SetupPage.tsx` false-negative where `degraded` status was mapped to `unhealthy`. Added `"degraded"` to `HealthStatus` union, yellow warning badge, wizard visibility confirmed, static copy updated in `AgentsPage.tsx` and `openapi-parser.ts`, 3-case test suite added (301/28 green). ✅ COMPLETE

**Sprint 5 Bug-Fix (2026-05-14):** MCP template bugfixes ported from sibling repo — tsconfig-aware alias resolver (FIX-01), unresolved import diagnostics + `/api/v1/mcp/unresolved_imports` endpoint (FIX-02), layout-agnostic defaults (FIX-03), tool input validation with actionable hints (FIX-04), readiness probe + memory hardening + snapshot lifecycle (FIX-05a+b), UX polish + doc updates (Track 6). 438/440 tests passing (2 pre-existing). ✅ COMPLETE

**Sprint 1 scope adjustment (2026-05-07):** Foundation audit was split into two tracks (mechanical fixes; global rule elevation) to reduce fsWrite payload risk. To keep within `MAX_TOTAL_TRACKS = 8`, the `setup.sh` interactive initializer was deferred to Sprint 2. Sprint 1's README documents the **manual** adoption path; Sprint 2 will add the script and update the README's Quick Start accordingly.

---

## High-Level Task List

### N. End-to-End Verification (Future Sprint)

- [x] Dry-run: fresh clone → follow root `README.md` steps → MCP services up and indexing user-provided files *(Sprint 3 Bug-Fix)*
- [x] Re-run `services/mcp-context-manager` vitest suite after indexer env-var changes *(Sprint 3 Bug-Fix — 356/37 green)*
- [ ] Verify AI tool integration: point Kiro / Cursor / Claude Desktop at the template output, confirm MCP tools resolve
- [x] Confirm `setup.sh` is idempotent (running twice produces the same config) *(Sprint 5 — layout-agnostic defaults verified)*

---

## Out of Scope

- Any changes to the production chuchube-emails `/backend` or `/frontend` folders (they are no longer part of this repo's goal)
- Building a separate `ai-workflow-template` distribution repo (approach A was rejected — this repo *becomes* the template)
- Publishing as an npm/Docker package (future consideration)
- Persona additions beyond the existing 7 (user confirmed: keep 7)

---

## Archived

*Sprint 1 completed items — moved here 2026-05-08.*

### A. Foundation Audit & Consistency Fixes ✅

- [x] Rename `.claude/personas/intergration_reviewer.md` → `integration_reviewer.md`
- [x] Fix corrupted title `# Persona: re` in `.claude/personas/knowledge_manager.md`
- [x] Define authoritative Sprint Math constants (`MAX_FEATURE_TRACKS`, `MAX_ADMIN_TRACKS`, `MAX_TOTAL_TRACKS`) in `.claude/rules/01-global-master-rules.md`
- [x] Replace all hardcoded "5" / "6" / "8" track numbers in `MULTI_AGENTS_WORKFLOW.md`, `DEV_INTELLIGENCE.md`, and personas with named references to the constants
- [x] Fix `MULTI_AGENTS_WORKFLOW.md` Cast section: add missing `devops_qa_engineer` (7 personas total)
- [x] Standardize placeholder naming across all files: `[feature_name]` (replace `[feature]` variants)
- [x] Fix stale path `.claude/docs/infrastructure.md` → `.claude/docs/architecture/infrastructure.md`
- [x] Fix `State Sync Draft` path: `docs/reviews/...` → `.claude/docs/reviews/...` in `MULTI_AGENTS_WORKFLOW.md`
- [x] Fix stale reference `/docs` folder → `.claude/docs/` in global rules ("No Blind Coding")
- [x] Fix case sensitivity: `cargo.toml` → `Cargo.toml` in global rules
- [x] Fix `DEV_INTELLIGENCE.md` persona table header (separate Domain and Scope columns)

### B. Conflict Resolution & Global Rule Elevation ✅

- [x] Resolve conflict between `devops_qa_engineer.md` Rule 5 and global Doc-Sync rule (remove the direct-edit shortcut; devops_qa now drafts to `.claude/docs/reviews/` like other personas)
- [x] Elevate "Chunked Assembly Protocol" from `internal_tooling_engineer` and `knowledge_manager` to a global rule in `01-global-master-rules.md` (scoped to "authorized" document types only, preventing scope bypass)
- [x] Add "Persona Dispatch" global rule: a persona handed a task outside its documented scope must route to `issues.md` — never silently expand scope

### C. Stack De-Referencing (Abstract the Tech Stack) ✅

- [x] Replace `pytest / vitest / tsc` specific references in global rules with abstract wording ("the project test suite as defined in `local_context.md`, e.g., pytest / vitest / cargo test / go test / npm test")
- [x] Replace `Pydantic ↔ Zod` wording in `integration_reviewer.md` and `MULTI_AGENTS_WORKFLOW.md` Phase 3 with "backend schema model ↔ frontend schema validation"
- [x] Replace `FastAPI routes` / `CORS settings in FastAPI` in workflow and `devops_qa_engineer` with "backend API routes" / "cross-service connectivity errors"
- [x] Replace React/TypeScript and Python/FastAPI in `DEV_INTELLIGENCE.md` persona table with stack-agnostic descriptions that defer to `local_context.md`
- [x] Abstract persona domain paths (`/frontend` / `/backend` / `/services`) into "the frontend domain as mapped in `CLAUDE.md`" (illustrative, not prescriptive)

### D. `CLAUDE.md` Template + `.claude/` Agent Entry Index ✅

- [x] Rewrite root `CLAUDE.md` as a template with a required mappings schema (mandatory structure) + one concrete example marked `<!-- EXAMPLE — REPLACE WITH YOUR PROJECT -->`
- [x] Create `.claude/README.md` (~60 lines) as a table-of-contents index for agents entering the `.claude/` folder
- [x] Generalize chuchube-specific Phase 3 rejection example in `MULTI_AGENTS_WORKFLOW.md` to abstract placeholders

### E. Chuchube Purge from `.claude/docs/` (partial) ✅

- [x] Delete `.claude/docs/archives/` (chuchube ADRs)
- [x] Delete `.claude/docs/tasks/archives/` (chuchube sprint backlogs)
- [x] Delete `.claude/docs/issues/archives/` (chuchube resolved issues)
- [x] Delete `.claude/docs/features/archives/` (chuchube feature specs)

### F. `.claude/examples/` — Worked Adopter References (partial) ✅

- [x] Create `.claude/examples/` folder
- [x] Create `.claude/examples/case-study-chuchube-rejection.md` — worked case study of Phase 3 rejection flow

### G. Infrastructure Documentation Rewrite ✅

- [x] Delete current 1,922-line chuchube-specific `.claude/docs/architecture/infrastructure.md`
- [x] Replace with a thin (<200 line) generic "MCP Services Infrastructure" document covering only the template-relevant services, ports, volumes, adopter customization points

### H. Docker / Compose / Cluster Config Generalization ✅

- [x] Update `docker-compose.mcp.yml` to mount the entire workspace (`${WORKSPACE_PATH:-.}:/project:ro`) instead of hardcoded `./backend`, `./frontend`, `./services`
- [x] Replace `cluster-config.json` with a minimal 2-cluster starter (e.g., `src/` and `tests/`) with inline JSON schema hints
- [x] Extend `.env.mcp.example` with all supported env variables (`WORKSPACE_PATH`, `HTTP_PORT`, `GRAPH_SNAPSHOT_DIR`, `PYTHON_WATCH_GLOBS`, `TS_WATCH_GLOBS`) plus explanatory comments

### I. AI Tool Config Templates ✅

- [x] Keep existing `services/mcp-context-manager/kiro-config.template.json`
- [x] Add `services/mcp-context-manager/cursor-config.template.json`
- [x] Add `services/mcp-context-manager/claude-desktop-config.template.json`
- [x] Document placement of each config file (platform-specific paths) in `services/mcp-context-manager/AI-TOOL-CONFIGS.md`

### J. Script Generalization (partial) ✅

- [x] Remove "isolated from chuchube-emails" language from `mcp.sh` banner and usage help
- [x] Remove "chuchube-emails production stack" language from `mcp-deploy.sh` banner and comments

### K. Root `README.md` — Step-by-Step Setup ✅

- [x] Author `README.md` at repo root — brand-new-developer targeted, zero prior knowledge assumed, linked deep-dive style
- [x] Sections: Prerequisites → Quick Start (6 steps) → First AI Task → Customizing → Worked Example → Troubleshooting → Deep Dives → Contributing/License
- [x] Include at least one worked example (greenfield Next.js + FastAPI monorepo)

### E. Chuchube Purge from `.claude/docs/` ✅ — Sprint 2 items

- [x] Review and purge chuchube references in `.claude/docs/architecture/mcp-web-interface.md` and `.claude/docs/architecture/active_mcp_api_spec.md`
- [x] Review and purge chuchube references in `.claude/docs/guides/*`

### F. `.claude/examples/` — Worked Adopter References ✅ — Sprint 2 items

- [x] Create `.claude/examples/case-study-chuchube-emails.md` — worked example of a full-stack (Python + React) adopter
- [x] Create `.claude/examples/preset-nextjs.md` — configuration preset for Next.js monorepos
- [x] Create `.claude/examples/preset-django-react.md` — configuration preset for Django + React monorepos
- [x] Create `.claude/examples/preset-monorepo.md` — configuration preset for generic monorepos (`apps/*`, `packages/*`)

### J. Script Generalization ✅ — Sprint 2 items

- [x] Author `setup.sh` (root-level) — interactive initializer; supports `--non-interactive` mode via `setup.answers.yml`
- [x] Add `.gitignore` additions for `.mcp-cache/`, `.env.mcp`, `setup.answers.yml`
- [x] Update `README.md` Quick Start to use `setup.sh` path; manual steps in `<details>` block

### L. MCP Indexer Env-Configurable Watch Globs ✅

- [x] Add `PYTHON_WATCH_GLOBS` env var with default `backend/**/*.py`
- [x] Add `TS_WATCH_GLOBS` env var with default `frontend/src/**/*.{ts,tsx,js,jsx},services/**/*.{ts,tsx,js,jsx}`
- [x] Update `src/watcher/` and `src/indexer/` to consume these env vars
- [x] Add tests covering the env-var override path (`indexer-env-globs.test.ts`, 8 tests)
- [x] Update `docs/NEW-PROJECT.md` with "Customizing Watch Paths" section

### M. Service-Level `local_context.md` Generalization ✅

- [x] Generalize `services/mcp-context-manager/.claude/local_context.md` — "the host repository" phrasing
- [x] Generalize `services/mcp-context-ui/.claude/local_context.md` — generic frontend phrasing
- [x] Review and update `services/mcp-context-manager/README.md` and `services/mcp-context-ui/README.md`
