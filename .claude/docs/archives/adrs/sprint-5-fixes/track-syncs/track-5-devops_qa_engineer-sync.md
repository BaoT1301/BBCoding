# State Sync Draft — Track 5 (FIX-05a)
**Persona:** devops_qa_engineer  
**Date:** 2026-05-14  
**Sprint:** sprint-2.0-mcp-fixes  
**Status:** COMPLETE ✅

---

## Summary of Changes

Track 5 decouples liveness from readiness, adds memory diagnostics to `/api/v1/diag`, and hardens the Docker Compose and Dockerfile configuration.

---

## 1. Required Updates to `services/mcp-context-manager/README.md`

### New Endpoints

Add to the **HTTP API** section:

```
GET /api/ready
  Returns 200 { "ready": true } once the initial graph build completes.
  Returns 503 { "ready": false, "reason": "indexing" } while indexing is in progress.
  Use this for readiness probes (depends_on: service_healthy in Compose).
  Do NOT use for liveness — use /api/health for that.
```

### Updated `/api/v1/diag` Response

Add to the diag endpoint documentation:

```
memory block (new in FIX-05a):
  rssMb        — Resident Set Size in MB
  heapUsedMb   — V8 heap used in MB
  heapTotalMb  — V8 heap total in MB
  heapLimitMb  — Effective heap limit (cgroup constrainedMemory if > 0, else heapTotal)
  external     — External (native) memory in MB
  degraded     — true when heapUsedMb / heapLimitMb > 0.85

Top-level degraded flag now ORs: indexed-0-files, high-unresolved-import-ratio, high-heap-usage.
```

### Environment Variables

Add to the **Environment Variables** section:

```
NODE_OPTIONS (set in Dockerfile and docker-compose.mcp.yml)
  Default: --max-old-space-size=1024
  Gives V8 1 GB old-space headroom. Paired with 1536M cgroup limit (heap ≈ 2/3 of cgroup).
```

---

## 2. Required Updates to `.claude/local_context.md`

### `HttpApiServer` component entry

Add to the component hierarchy under `HttpApiServer`:

```
├── GET /api/ready → 200 { ready: true } | 503 { ready: false, reason: "indexing" }
├── setReady(flag: boolean) → void  (called by server.ts around buildInitialGraph)
├── isReady() → boolean
```

### `/api/v1/diag` entry

Extend the existing diag entry:

```
GET /api/v1/diag → diagnostics snapshot (workspaceRoot, globs, ignores, fileCount,
  clusterHits, importResolution, memory { rssMb, heapUsedMb, heapTotalMb, heapLimitMb,
  external, degraded }, degraded, reasons)
```

### Docker Configuration section

Update the healthcheck entry:

```
Health Check: wget -qO /dev/null http://localhost:3001/api/ready
  (changed from /api/health — now waits for graph readiness, not just port liveness)
```

Update the memory limit entry:

```
deploy.resources.limits.memory: 1536M  (was 512M)
NODE_OPTIONS: --max-old-space-size=1024 (set in both Dockerfile ENV and compose environment)
```

### Testing Strategy section

Add to the test file list:

```
src/__tests__/healthcheck-payload.test.ts (4 tests — Track 5: /api/ready 503/200, toggle, /api/health always 200)
src/__tests__/diag-memory.test.ts (4 tests — Track 5: memory block fields, degraded=false normal, degraded=true at 85%, non-negative integers)
```

---

## 3. Required Updates to `docs/architecture/infrastructure.md`

### Healthcheck URL Change

```diff
- test: ["CMD", "wget", "-qO", "/dev/null", "http://localhost:3001/api/health"]
+ test: ["CMD", "wget", "-qO", "/dev/null", "http://localhost:3001/api/ready"]
```

**Rationale:** `/api/health` is a liveness probe (always 200). `/api/ready` is a readiness probe (503 until `buildInitialGraph` completes). The `mcp-context-ui` service uses `depends_on: service_healthy`, so it now correctly waits for a usable graph before starting.

### Memory Sizing Note

Add to the infrastructure notes:

```
Memory sizing (mcp-context-manager):
  cgroup limit:    1536 MB  (deploy.resources.limits.memory)
  V8 old-space:    1024 MB  (NODE_OPTIONS=--max-old-space-size=1024)
  Ratio:           ~67%     (heap = 2/3 of cgroup, leaves headroom for native/external memory)
  Degraded threshold: heapUsedMb / heapLimitMb > 0.85 → /api/v1/diag reports degraded=true
```

### Healthcheck Timing

```
interval:     5s   (was 30s)
timeout:      5s
retries:      12   (was 3)
start_period: 60s
Total grace:  120s (12×5s retry budget + 60s start_period)
```

---

## 4. Ripple Effect Notes

### Services polling `/api/health` for readiness

The `mcp-context-ui` `depends_on: service_healthy` condition now polls `/api/ready` (via the compose healthcheck). Any external script or monitoring tool that was using `/api/health` as a readiness signal should be updated to use `/api/ready`. `/api/health` remains available and always returns 200 — it is now strictly a liveness probe.

**Action required:** Review any CI scripts, monitoring dashboards, or external health-check configurations that poll `http://mcp-context-manager:3001/api/health` for readiness semantics and update them to `/api/ready`.

### Track 6 dependency

Track 6 (FIX-05b) smoke test must poll `/api/ready` (not `/api/health`) for the cold-start assertion. This is already specified in the Track 6 checklist.

### Track 7 integration check

The `/api/v1/diag` response now has both `importResolution` (Track 2) and `memory` (Track 5) blocks. The top-level `degraded` boolean ORs all three conditions: `indexed-0-files`, `high-unresolved-import-ratio`, `high-heap-usage`. No field name collisions.

---

## 5. Files Modified

| File | Change |
|------|--------|
| `services/mcp-context-manager/src/api.ts` | Added `ready` flag, `setReady()`/`isReady()` methods, `GET /api/ready` route, `memory` block in `handleDiag()` |
| `services/mcp-context-manager/src/server.ts` | Added `setReady(false)` before indexing, `setReady(true)` after both warm and cold paths |
| `docker-compose.mcp.yml` | Switched healthcheck URL to `/api/ready`; `NODE_OPTIONS` and `1536M` memory limit already present from prior work |
| `services/mcp-context-manager/Dockerfile` | Added `ENV NODE_OPTIONS="--max-old-space-size=1024"` in production stage |
| `src/__tests__/healthcheck-payload.test.ts` | New: 4 tests for `/api/ready` and `/api/health` |
| `src/__tests__/diag-memory.test.ts` | New: 4 tests for memory block in `/api/v1/diag` |

---

## 6. Test Results (Post-flight)

```
Test Files  3 failed (pre-existing Track 3) | 41 passed (44)
      Tests  3 failed (pre-existing Track 3) | 426 passed (429)
```

New Track 5 tests: **8/8 pass**
- `healthcheck-payload.test.ts`: 4/4 ✅
- `diag-memory.test.ts`: 4/4 ✅

Pre-existing failures (Track 3, out of scope for this track):
- `bootstrap-fresh-clone.test.ts`
- `fresh-clone-defaults.test.ts`
- `indexer-env-globs.test.ts`
