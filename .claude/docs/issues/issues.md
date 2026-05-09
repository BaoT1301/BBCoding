# Issues Queue

No active blocking issues.

---

## Open Items — Deferred

- **Workspace mount `:ro` flag** — Currently not read-only (removed to allow cluster-config overlay). A future sprint should investigate mounting cluster-config outside the workspace (e.g., `/config/cluster-config.json`) and adding `CLUSTER_CONFIG_PATH` env var so the workspace can be `:ro`.
- **`setup.sh` cluster-config path** — `setup.sh` writes `cluster-config.json` to repo root; Docker Compose mounts `services/mcp-context-manager/cluster-config.json`. Consider updating `setup.sh` to write directly to `services/mcp-context-manager/cluster-config.json` in a future sprint.
- **Pre-existing `EADDRINUSE` error** — `server-flags.test.ts` reports port 3001 conflict in local environments where the MCP container is already running. Not a test failure; cosmetic. Consider adding a port-availability guard or test isolation in a future sprint.

---

*Sprint 1 resolved issues archived to `.claude/docs/issues/archives/sprint-1-generalization-resolved.md`.*
*Sprint 2 resolved issues archived to `.claude/docs/issues/archives/sprint-2-generalization-resolved.md`.*
*Sprint 3 resolved issues archived to `.claude/docs/issues/archives/sprint-3-bugfix-resolved.md`.*
