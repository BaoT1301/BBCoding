# ADR: AI-Workflow-Template Generalization — Sprint 2

**Date:** 2026-05-08
**Status:** Complete

## Summary

Sprint 2 completed the generalization of the AI-workflow-template repository. Key deliverables: env-configurable watch globs (`PYTHON_WATCH_GLOBS`, `TS_WATCH_GLOBS`) wired into the indexer and watcher with 8 new tests; interactive `setup.sh` initializer with non-interactive mode; three adopter preset examples (Next.js, Django+React, monorepo) and a chuchube-emails case study in `.claude/examples/`; full chuchube purge from all live docs and service-level `local_context.md` files; `README.md` Quick Start updated to use `setup.sh` as primary path. All 314 tests passing. One open architectural note: `setup.sh` writes `cluster-config.json` to repo root; Docker Compose mounts `services/mcp-context-manager/cluster-config.json` — clarified in `infrastructure.md`. Sprint 3 scope: end-to-end verification and polish.
