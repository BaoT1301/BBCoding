# MCP Context Manager — Error reports and long-term fix proposals

This folder holds:

- **Incident notes** (the original four `.md` files) — raw observations from agents and humans hitting the MCP Context Manager tools.
- **Fix proposals** (`FIX-01` through `FIX-05`) — detailed, implementation-ready recommendations for resolving the underlying issues.

## How to use this

- If you're an **agent** assigned to implement one of these fixes, read the relevant `FIX-0X-*.md` end-to-end. It contains the design, file targets, tests to add, and a rollout plan. Don't start coding until you've also read the incident notes it references.
- If you're a **human reviewing** the proposals, the table below is the fastest way in.
- If you're **filing a new incident**, drop an observation note here first. Don't edit the FIX files without a linked note showing the real-world impact.

## Incident notes

| File                                         | What it reports                                              |
| -------------------------------------------- | ------------------------------------------------------------ |
| `graph-index-empty-extension-dir.md`         | `get_impact_analysis` / `get_file_dependents` return empty for every file under `extension/src/`. |
| `get_file_dependents-cancelled.md`           | `get_file_dependents` cancelled mid-call (downstream symptom of the same resolver bug). |
| `grep-no-files-to-search-include-syntax.md`  | `include: "*.ts,*.tsx"` returned zero files because the tool expects brace-expansion `"*.{ts,tsx}"`. |
| `grep-regex-parse-error.md`                  | Hand-written regex opened a character class it never closed. |

## Long-term fix proposals

Sequenced priority (highest first). Later fixes build on earlier assumptions; follow the order when implementing.

| Fix                                              | Priority | Problem                                                                                             | Effort |
| ------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------- | ------ |
| `FIX-01-tsconfig-path-alias-resolver.md`         | **P0**   | TS alias resolver hardcodes `@/*` → `frontend/src/*`. Replace with a nearest-tsconfig resolver.     | 1–2 d  |
| `FIX-02-unresolved-import-diagnostics.md`        | P1       | Unresolved imports are silently dropped. Surface counters, per-file diagnostics, and a new MCP tool. | 1 d    |
| `FIX-03-multi-root-workspace-defaults.md`        | P2       | Defaults assume a `backend/ frontend/src/ services/` monorepo. Make the service layout-agnostic.     | 0.5–1 d |
| `FIX-04-tool-input-validation-and-hints.md`      | P2       | Agents repeatedly write malformed globs and regexes. Add pre-flight validation with actionable hints. | 1 d    |
| `FIX-05-operational-hardening.md`                | P2       | Cold-start OOMs and healthcheck timeouts in `./mcp.sh up`. Codify the already-applied tuning + readiness endpoint. | 1–2 d |

## Relationship graph

```
FIX-01 (alias resolver) ──┬──► fixes the "empty extension/" reports
                          └──► relies on FIX-03 not happening first
FIX-02 (diagnostics) ─────────► would have made FIX-01 a 10-minute diagnosis instead of a day
FIX-03 (multi-root) ──────────► paves the road for any other project adopting this service
FIX-04 (tool hints) ──────────► independent — prevents the grep-related error reports
FIX-05 (ops hardening) ───────► independent — captures the patches we applied live this week
```

## Recommended implementation order

1. **FIX-01** first. It's the direct blocker. Ship it before doing anything else with the resolver.
2. **FIX-02** next, while the resolver is fresh in mind. It turns the class of bug FIX-01 fixed into an observable, self-diagnosing failure mode for future regressions.
3. **FIX-05** when the next ops/infra task comes up. Already patched live; just needs to be committed and CI-tested.
4. **FIX-03** and **FIX-04** can ship independently, in any order, once the first two are in.

## Verification checklist (run after each fix)

- `./mcp.sh down && ./mcp.sh up` — both containers reach `healthy` within 90 s.
- `curl -s http://localhost:3001/api/v1/diag | jq` — `degraded: false`, `fileCount.total` matches expectation, new fields populated (for FIX-02/05).
- `curl -s http://localhost:3001/api/v1/mcp/unresolved_imports | jq '.totalSpecifiers'` — 0 after FIX-01 on this repo (FIX-02 prerequisite).
- MCP client (`get_file_dependents` on `extension/src/bridge/supabase.ts`) returns the 8 consumers `grep` finds.
- `./mcp.sh test` — green.

## Out of scope (tracked separately)

- Node-modules edge resolution. All five fixes deliberately leave bare specifiers (`react`, `zod`) as `skipped-external`. Adding package-level edges is a separate, larger piece of work.
- Python resolver parity. FIX-01's tsconfig-style resolver is TS-only; a similar `pyproject.toml`-aware Python resolver would be a FIX-06 candidate if demand shows up.
- UI changes. FIX-02 suggests a node-level "unresolved imports" badge as phase 2; defer until the API exists.
