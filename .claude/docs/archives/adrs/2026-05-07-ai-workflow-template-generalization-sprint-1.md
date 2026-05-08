# ADR: AI-Workflow-Template Generalization — Sprint 1

**Date:** 2026-05-07
**Status:** Completed

## Purpose

Sprint 1 transformed this repository from a chuchube-emails-specific orchestration setup into a generic, portable AI-Workflow template. The sprint fixed consistency drift across all `.claude/` orchestration files, abstracted the tech stack out of rules and personas, purged chuchube-specific sprint history, generalized Docker/cluster/env config, and delivered a step-by-step root `README.md` for brand-new adopters.

## Key Decisions

- **Approach E (Hybrid):** Generalized the repo in-place rather than creating a separate distribution repo. Chuchube-specific archives were deleted; the repo itself becomes the template.
- **Sprint Math constants** (`MAX_FEATURE_TRACKS = 6`, `MAX_ADMIN_TRACKS = 2`, `MAX_TOTAL_TRACKS = 8`) elevated to authoritative global rules; all hardcoded numbers replaced with named references.
- **Stack de-referencing:** All prescriptive pytest/vitest/FastAPI/Pydantic/React references removed from rules and personas; replaced with abstract wording deferring to each service's `local_context.md`.
- **Workspace-mount compose:** Replaced three hardcoded volume mounts (`./backend`, `./frontend`, `./services`) with a single env-driven `${WORKSPACE_PATH:-.}:/project:ro` mount. Mount target is `/project` (not `/workspace`) to avoid virtiofs overlay conflicts on macOS Docker Desktop.
- **`setup.sh` deferred to Sprint 2:** To keep Sprint 1 within `MAX_TOTAL_TRACKS = 8`, the interactive initializer was deferred. Sprint 1's README documents the manual adoption path.

## Outcome

Six feature tracks completed across Tracks 1–6 (mechanical audit, rule elevation, stack de-referencing, CLAUDE.md + README.md template, Docker/cluster generalization, root README). Track 7 integration review passed all 11 checks. The template is now adoptable by greenfield projects via the manual Quick Start path. Sprint 2 will add `setup.sh` automation, env-configurable indexer globs, service-level `local_context.md` cleanup, and example presets.
