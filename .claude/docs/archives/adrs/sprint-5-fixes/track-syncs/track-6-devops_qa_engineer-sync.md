# State Sync Draft — Track 6 (FIX-05b): Snapshot Lifecycle + CI Smoke Test

**Author:** devops_qa_engineer  
**Date:** 2026-05-14  
**Sprint:** sprint-2.0-mcp-fixes  
**Status:** COMPLETE — awaiting Knowledge Manager review

---

## 1. Required Updates to `services/mcp-context-manager/README.md`

Add the following entries to the **Environment Variables** section:

- `GRAPH_SNAPSHOT_MAX_AGE` — Maximum age in days before a snapshot is discarded and a cold re-index runs. Default: `7`. Example: `GRAPH_SNAPSHOT_MAX_AGE=14`.

Add the following to the **Startup Behaviour** or **Snapshot** section:

- On startup, any `.tmp.*` sibling files left over from interrupted atomic writes are deleted before the snapshot is loaded.
- If the snapshot is older than `GRAPH_SNAPSHOT_MAX_AGE` days, it is discarded and a full cold index runs.
- Startup log now emits: `[graph-store] loaded snapshot: X nodes, Y edges, Z KB, age N min`.

Add a reference to the new `docs/OPERATIONS.md` in the **Documentation** section.

---

## 2. Required Updates to `.claude/local_context.md`

### Environment Variables section — add:

```
- **`GRAPH_SNAPSHOT_MAX_AGE`**: Maximum snapshot age in days before forced re-index (default: `7`).
```

### Architecture → GraphPersistence section — add two new exports:

```
├── cleanupTempSnapshots(snapshotPath) → Promise<void> (deletes .tmp.* siblings on startup)
└── isSnapshotStale(snapshotPath, maxAgeDays) → Promise<boolean> (mtime-based age check)
```

### Testing Strategy section — add new test file:

```
- `src/__tests__/snapshot-staleness.test.ts` (7 tests — Track 6: tmp cleanup + staleness)
```

Update the mcp-sh-smoke entry:

```
- `src/__tests__/mcp-sh-smoke.test.ts` (3 tests + 1 skipped — validate_workspace + cold-start smoke)
```

---

## 3. Required Updates to `docs/architecture/infrastructure.md`

### Snapshot Lifecycle subsection (new or update existing):

- Document `GRAPH_SNAPSHOT_MAX_AGE` env var and its default.
- Document the startup cleanup of `.tmp.*` files.
- Document the startup log format: `[graph-store] loaded snapshot: X nodes, Y edges, Z KB, age N min`.

### CI section — add:

- Cold-start smoke test in `mcp-sh-smoke.test.ts` requires `RUN_SLOW_TESTS=1` and Docker.
- To exclude from unit-only CI: `npm test -- --testPathPattern='(?!mcp-sh-smoke)'`.

---

## 4. No Deployment Script Changes

`mcp.sh` was not modified. No changes to `docker-compose.mcp.yml` or `Dockerfile` in this track (those were Track 5 / FIX-05a).

---

## 5. Files Modified

| File | Change |
| ---- | ------ |
| `src/graph/graph-persistence.ts` | Added `cleanupTempSnapshots` and `isSnapshotStale` exports |
| `src/server.ts` | Wired cleanup + staleness check into bootstrap; added load stats log line; imported new exports |
| `src/__tests__/snapshot-staleness.test.ts` | New — 7 tests for tmp cleanup and staleness |
| `src/__tests__/mcp-sh-smoke.test.ts` | Extended — added cold-start smoke test (skipped unless `RUN_SLOW_TESTS=1`) |
| `docs/OPERATIONS.md` | New — 114 lines covering memory sizing, healthcheck math, cold/warm start, diag degradation, snapshot lifecycle, CI smoke test |

---

## 6. Test Results

| Metric | Before (baseline) | After (Track 6) |
| ------ | ----------------- | --------------- |
| Test files | 44 | 45 |
| Passing tests | 426 | 433 |
| Failing tests | 3 (pre-existing) | 3 (same pre-existing) |
| Skipped tests | 0 | 1 (cold-start smoke) |
| New tests added | — | 7 (snapshot-staleness) + 1 skipped |

No regressions introduced.

---

## 7. Ripple Effect Assessment

- `graph-persistence.ts` API gains two new exports (additive — no callers broken).
- `loadSnapshot` return type unchanged; `server.ts` callers updated atomically in this track.
- `GRAPH_SNAPSHOT_MAX_AGE` env var is new; no existing code reads it.
- Cold-start smoke test is opt-in (`RUN_SLOW_TESTS=1`); no CI pipeline changes required.
