# Long-term fix 05 — Operational hardening (healthchecks, memory, cold starts)

**Priority:** P2 (prevents the class of outages we hit this week during `./mcp.sh up`).
**Target files:**
- `.tools/mcp-context-manager/docker-compose.mcp.yml`
- `.tools/mcp-context-manager/services/mcp-context-manager/Dockerfile`
- `.tools/mcp-context-manager/services/mcp-context-manager/src/server.ts`
- `.tools/mcp-context-manager/services/mcp-context-manager/src/api.ts`
- `.tools/mcp-context-manager/mcp.sh`

**Related history (not filed under `mcp-error/` but worth capturing):**
- `./mcp.sh up` failed because the manager's healthcheck ran out of retries during a cold index.
- The manager then OOM-crashed with `FATAL ERROR: Reached heap limit Allocation failed` — V8 old-space default (~170 MB) was too small for the 512 MB cgroup cap with tree-sitter's native heap on top.

We patched both in place (raised memory to 1.5 GB + `NODE_OPTIONS=--max-old-space-size=1024`, lengthened `start_period` to 60 s, shortened `interval` to 5 s). This fix proposal turns those patches into durable, observable, tested settings.

---

## Problem

Three cold-start fragilities:

1. **Healthcheck timing was tuned for a warm snapshot.** `interval 30s, retries 3, start_period 10s` gives a 90 s window, but the probe only fires every 30 s. A first run that takes 35 s to become healthy fails the second probe and the UI dependency gives up.
2. **Memory cap was half of what the cold index needs.** Tree-sitter parsers allocate "external" memory (native heap) that V8 doesn't count against `max-old-space-size`. Default V8 heap limit was ~170 MB; cgroup limit was 512 MB. The two combined meant the process crashed somewhere around 260–280 MB of RSS during indexing.
3. **Nothing in the codebase validated these operational choices.** No healthcheck assertion test, no memory guard, no pressure test. The failure mode was only discoverable by running `./mcp.sh up` on a cold cache.

---

## Goal

Make the service survive a cold start on any reasonably sized monorepo, and fail loudly if future changes regress that property.

---

## Design

### 1. Codify the tuned healthcheck

Already applied in the live compose file:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO", "/dev/null", "http://localhost:3001/api/health"]
  interval: 5s
  timeout: 5s
  retries: 12
  start_period: 60s
```

Add a comment block explaining the math: `12 × 5 s + 60 s = 120 s total wait`, sized for a workspace with ~200 files. Document the scale-up rule in `docs/SETUP.md`: "Double `start_period` for each additional ~200 files in your workspace, or migrate to a warm-snapshot restart."

### 2. Decouple `/api/health` readiness from indexing

Right now `/api/health` returns 200 the moment the HTTP server binds, which is *before* the indexer finishes. That's fine for liveness but is wrong for readiness — the UI happily connects while the graph is still empty.

Add a second endpoint:

```
GET /api/health        → 200 always (liveness)
GET /api/ready         → 200 when initial index is complete, 503 otherwise
```

Switch the compose healthcheck to `/api/ready`. The UI's `depends_on` now genuinely waits for a usable graph, and `/api/health` remains a trivial liveness check for orchestrators.

### 3. Pin memory settings explicitly

Already applied:

```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=1024
deploy:
  resources:
    limits:
      memory: 1536M
```

Codify the relationship: "old-space heap = two-thirds of cgroup limit, rounded down to the nearest 256 MB. Leave the remaining third for native heap + ephemeral buffers." Put it in a new doc `docs/OPERATIONS.md` and in a comment at the top of the compose file.

For Dockerfile, add the same default so local (non-compose) runs get the same treatment:

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=1024"
```

### 4. Add a diag warning for memory pressure

In `/api/v1/diag`, add a `memory` section:

```jsonc
"memory": {
  "rssMb": 368,
  "heapUsedMb": 240,
  "heapTotalMb": 290,
  "heapLimitMb": 1024,
  "external": 112,
  "degraded": false
}
```

Mark `degraded: true` and append to `reasons` when `heapUsedMb / heapLimitMb > 0.85`. `mcp.sh doctor` already parses `degraded` and exits 4; the alert becomes visible on every cold start without extra wiring.

### 5. Snapshot health

Log snapshot size and age on startup:

```
[graph-store] loaded snapshot: 2340 nodes, 5120 edges, 68 KB, age 12 min
```

Add a hard cap (configurable via `GRAPH_SNAPSHOT_MAX_AGE`, default 7 days). On cold start, if the snapshot is older than the cap, re-index from scratch rather than loading stale data. Prevents users coming back after a long break with edges pointing at files that were renamed.

Also handle the `graph-snapshot.json.tmp.*` leftovers from interrupted writes — delete any `.tmp.*` sibling during startup before loading the canonical file. (We observed one of these after the OOM crashes.)

### 6. A cold-start smoke test in CI

New test: `src/__tests__/cold-start-smoke.test.ts`

- Spins up the indexer against a fixture workspace with 500 generated files (TS + Python).
- Asserts: `/api/ready` returns 200 within 30 s of process start; peak RSS under 1 GB.
- Runs in CI on every PR.

Separately, extend `mcp-sh-smoke.test.ts` to:
- `./mcp.sh up` on a clean slate (no `.mcp-cache/`).
- Assert both containers reach `healthy` within 90 s.
- `./mcp.sh down` to clean up.

### 7. Docs

New: `docs/OPERATIONS.md` covering:
- Memory sizing guidance (table of workspace size → cgroup limit → `max-old-space-size`).
- Healthcheck tuning math.
- Cold-start vs warm-start behaviour.
- How to interpret `/api/v1/diag` degradation reasons.
- Snapshot lifecycle and manual cache reset: `rm .mcp-cache/graph-snapshot*.json`.

Update `docs/TROUBLESHOOTING.md` with the OOM signature and the healthcheck-timeout signature, each with a one-liner fix.

---

## Tests

New or extended:

| Test                                            | Asserts                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `cold-start-smoke.test.ts`                      | `/api/ready` within 30 s on a 500-file fixture               |
| `healthcheck-payload.test.ts`                   | `/api/ready` returns 503 during initial index, 200 after     |
| `diag-memory.test.ts`                           | Memory block populated; degraded flag trips above threshold  |
| `snapshot-staleness.test.ts`                    | Stale snapshot is discarded; `.tmp.*` leftovers cleaned      |
| `mcp-sh-smoke.test.ts` (extended)               | Both containers reach healthy within 90 s from cold          |

---

## Rollout

Independent of FIX-01/02/03/04. Order within this fix:

1. Apply the already-live healthcheck and memory settings to repo config (done in the live compose file; verify they're committed).
2. Add `/api/ready` endpoint; switch compose healthcheck.
3. Add memory block to `/api/v1/diag`.
4. Snapshot staleness + tmp-cleanup.
5. CI smoke test.
6. Docs.

### Estimated effort
- `/api/ready`: 30 LOC + tests.
- Diag memory block: 40 LOC + tests.
- Snapshot handling: 50 LOC + tests.
- Cold-start smoke: ~150 LOC (fixture + harness).
- Docs: 200 lines.
- Total: 1–2 days.

---

## Why this isn't optional

The failures this week wasted ~45 minutes of wall-clock time and generated user-visible scary errors (`dependency failed to start`, `FATAL ERROR`). The root causes are fully understood and the patches are already proven in production on this host. Codifying them is cheap insurance; the CI smoke test is the only way to make sure a future dependency bump or compose tweak doesn't re-break the cold-start path.
