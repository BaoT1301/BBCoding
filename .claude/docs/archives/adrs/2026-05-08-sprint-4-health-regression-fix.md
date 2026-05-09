# ADR: Sprint 4 — UI Health Status Regression Fix

**Date:** 2026-05-08
**Sprint:** Sprint 4 Bug-Fix Micro-Sprint
**Status:** COMPLETE

Sprint 4 fixed a false-negative in `SetupPage.tsx` where the new `degraded` health status introduced in Sprint 3 was incorrectly mapped to `unhealthy`. Added `"degraded"` to the `HealthStatus` union, added a yellow warning badge with copy `"⚠ Service degraded — 0 files indexed"`, ensured the wizard remains visible for degraded state, updated static copy in `AgentsPage.tsx` and `openapi-parser.ts`, and added a 3-case `setup-page-health.test.tsx` covering healthy, degraded, and unreachable states. Test suite: 301 passing (28 files), net +3 from baseline of 298.
