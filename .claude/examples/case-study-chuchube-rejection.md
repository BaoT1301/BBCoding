# Case Study: Chuchube Sprint Rejection — Absolute Path Bug

This is the original concrete rejection example that was generalized in `MULTI_AGENTS_WORKFLOW.md` Phase 3 during Sprint 1 (Track 3). Preserved here as a worked case study.

---

## Context

**Project:** chuchube-emails  
**Sprint:** Phase 2 execution  
**Rejected by:** `integration_reviewer`  
**Root cause:** `internal_tooling_engineer` failed to strip `WORKSPACE_ROOT` absolute Docker paths in `api.ts`, breaking the entire frontend multi-globe routing.

---

## Step 1: Assign the Patch (The Fixer Track)

Open a **fresh chat window** to prevent the context from getting confused, and send the developer agent in to fix its own mess.

**Copy/Paste this prompt:**

> *"Adopt the `internal_tooling_engineer` persona. The current sprint was REJECTED by the Integration Reviewer. Read Issue #4 in `.claude/docs/issues/issues.md` and the `.claude/docs/phase2-integration-report.md`. You failed to strip the `WORKSPACE_ROOT` absolute Docker paths in `api.ts`, which broke the entire frontend multi-globe routing.*
> *Your task: Fix the path stripping logic in `api.ts` so `getClusterForFile()` receives relative paths. Run your test suite. Prove to me it is fixed."*

---

## Step 2: The Re-Validation (The Guard Track)

Once the `internal_tooling_engineer` applies the fix and shows you passing tests, you must bring the guard back to verify it. Open another **fresh chat window**.

**Copy/Paste this prompt:**

> *"Adopt the `integration_reviewer` persona. The `internal_tooling_engineer` has applied a patch for Issue #4 in `api.ts`. Re-evaluate the sprint. Check if the absolute path bug is resolved and if `isCrossCluster` is now functioning correctly. If everything passes, formally approve the sprint so we can proceed to cleanup."*

---

## Step 3: Resume the Standard Workflow

If the Integration Reviewer gives you the green light and approves the sprint, the blockage is cleared.

1. Open a fresh chat.
2. Adopt the `knowledge_manager` persona.
3. Tell it to execute Track 5 (summarize changes, ask for your approval, squash the history, archive Issue #4, and check off the items in the `epic_backlog.md`).

---

## Lessons Learned

- Absolute Docker paths (`WORKSPACE_ROOT`) must be stripped before passing file paths to frontend routing logic.
- The `getClusterForFile()` function expects relative paths — this contract must be documented in the API spec.
- The `integration_reviewer` caught this at the sprint boundary, preventing a production regression.
