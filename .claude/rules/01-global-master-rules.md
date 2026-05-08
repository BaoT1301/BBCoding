# Global Master Rules

## Sprint Math — Authoritative Constants

These values are the single source of truth for sprint sizing across the entire orchestration system. Every orchestration file (personas, workflow docs, active tasks) **must reference these by name** — never hardcode the numbers.

- `MAX_FEATURE_TRACKS = 6` — Maximum coding/feature tracks per sprint (assigned to domain experts).
- `MAX_ADMIN_TRACKS = 2` — Mandatory admin tracks: one `integration_reviewer` + one `knowledge_manager`.
- `MAX_TOTAL_TRACKS = 8` — Hard ceiling: `MAX_FEATURE_TRACKS + MAX_ADMIN_TRACKS`.

## Out-of-Scope Fallback

If you encounter a task, bug, or dependency that is outside your assigned persona or current task scope, DO NOT attempt to fix it. Instead, write a detailed bug report in `.claude/docs/issues/issues.md` and continue with your original task if possible.

## Zero-Secret Leakage

Never output, log, or commit hardcoded API keys, database URIs, passwords, or any sensitive credentials. All secrets MUST be accessed via established environment variables (e.g., `.env` files) or a secure secrets manager. If a secret is exposed in the context window, ignore it in the output.

## No Unilateral Deletion (Destructive Action Guardrail)

You are strictly forbidden from executing destructive commands (e.g., `rm -rf`, `DROP TABLE`, deleting core directories) or aggressively overwriting existing, working architecture without explicit, step-by-step human authorization. If a refactor requires mass deletion, propose the deletion plan first.

## The Circuit Breaker (Anti-Looping)

If you encounter the same error three times consecutively while attempting a fix, or if a script repeatedly fails, HALT execution immediately. Do not brute-force the problem. Document the failure loop, state your hypothesis for the root cause, and request human intervention.

## Atomic Commits

Every change must be committed logically and atomically. Do not lump frontend UI changes, backend schema migrations, and documentation updates into a single monolithic commit. Use standard conventional commit messages (e.g., `feat:`, `fix:`, `chore:`, `docs:`).

## The "Do Not Invent" Rule

If a utility function, component, or design pattern already exists in the codebase, reuse it. You must not invent redundant custom implementations for problems that have already been solved within the repository.

## Mandatory Verification (No Ghost Commits)

Code generation is not complete until it is verified. If test suites exist, you must run them after modifying code. If tests do not exist for a new feature, you must write them using the project test suite as defined in your service's `local_context.md` (e.g., pytest / vitest / cargo test / go test / npm test) before considering the task finalized.

## State Preservation & Idempotency

Whenever interacting with databases or system states, assume your actions might be interrupted. Scripts and migrations must be idempotent (safe to run multiple times without unintended side effects). Never leave the system in a broken, intermediate state.

## No Blind Coding

Before writing or modifying code, you MUST review the relevant documentation in the `.claude/docs/` folder.

## Strict Typing Enforcement:

You must maintain strict typing, validation, and schema definitions exactly as dictated by the `local_context.md` of the specific service you are working in.

## Decision Making

You must ask questions involving critical architectural decisions or schema changes before proceeding with any edits. Do not assume the outcomes or methods.

## Doc-Sync & Context-Sync Rule (Draft Only):

Every service maintains its own `.claude` context file defining its architecture, responsibilities, and core dependencies.
**If you introduce, remove, or upgrade a major dependency (e.g., a 3D processing library, a new database driver, a UI framework), you are FORBIDDEN from modifying `package.json`, `requirements.txt`, or `Cargo.toml` without drafting a corresponding update.**
Instead of editing the `.claude` or `README.md` files directly, you MUST fulfill this requirement by writing a "State Sync Draft" into the `.claude/docs/reviews/` folder, as dictated by the Definition of Done below.

## The "Definition of Done" (State Synchronization Draft)

A coding task is NEVER considered [COMPLETE] until the developer agent has drafted a "State Sync" document in `.claude/docs/reviews/`. This document must explicitly list:

1. Any required updates to the local `README.md`.
2. Any required updates to the `Dependencies` or `Tech Stack` in this service's `.claude/local_context.md`.
3. Any required updates to the global `/.claude/docs/architecture/infrastructure.md`, or the deployment scripts at the project root (e.g., `./mcp.sh`, `./redeploy.sh`, or equivalent).

**You are STRICTLY FORBIDDEN from modifying `.claude`, `README.md`, or deployment `.sh` scripts directly.** The Knowledge Manager will review your draft.

## Chunked Assembly Protocol

When you are **authorized by your persona's scope** to generate a document exceeding 150 lines, assemble it in logical chunks via temp files (`temp_part1.md`, `temp_part2.md`), then combine with the terminal tool (`cat temp_part1.md temp_part2.md > final_doc.md`), then delete the temps. This protocol **DOES NOT grant scope expansion** — if your persona is not permitted to write that document type, you must still route to `.claude/docs/reviews/` or `issues.md` as normal.

## Persona Dispatch & Scope Containment

A persona handed a task outside its documented scope must route the task to `.claude/docs/issues/issues.md` (with the phrase "OUT OF SCOPE — requires <target_persona>") and mark its current track `[BLOCKED]`. Never silently expand scope. This rule is non-negotiable; violations cause cross-domain ripple effects that break integration reviews.

## The Blast Radius Guardrail (MANDATORY PRE-FLIGHT)

Before you modify ANY existing API endpoint, Database Model, or Shared Type, you MUST pause and evaluate the cross-service impact.

1. **Contract-First Mutation:** If you need to alter a JSON payload, you are FORBIDDEN from changing the code first. You must update the contract in `/.claude/docs/core/api-contracts/` and assign the downstream team in `.claude/docs/issues/issues.md`.
2. **TDD Enforcement:** You must run the project test suite as defined in your service's `local_context.md` (e.g., pytest / vitest / cargo test / go test / npm test) BEFORE you write new code, and AFTER you write new code.
3. **Proof of Work:** You cannot mark a task [COMPLETE] without explicitly pasting the passing test output into your final response.
