# State Sync Draft — Track 4 (FIX-04)

**Track:** PARALLEL TRACK 4 — Tool Input Validation and Actionable Hints
**Persona:** `backend_engineer`
**Sprint:** sprint-2.0-mcp-fixes
**Date:** 2026-05-14
**Status:** COMPLETE

---

## Summary

All Track 4 deliverables were already implemented in the codebase prior to this execution. The blast radius check confirmed full implementation; this run verified correctness via TDD and confirmed no regressions.

---

## Deliverables Verified

| Deliverable | File | Status |
|---|---|---|
| `ToolInputError` class | `src/utils/tool-input-error.ts` | ✅ EXISTS |
| `validateGlob()` — comma/absolute rejection | `src/utils/glob-utils.ts` | ✅ EXISTS |
| `validateRegex()` — unclosed class / unterminated group hints | `src/utils/glob-utils.ts` | ✅ EXISTS |
| `toolInputErrorResponse()` helper | `src/api.ts` | ✅ EXISTS |
| `zeroFilesReason()` helper | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleGetDeadCode` (GET + POST) | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleGetHotspots` (GET + POST) | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleSearchSymbols` (GET + POST) | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleGetCircularDeps` (GET + POST) | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleGetComplexity` (GET + POST) | `src/api.ts` | ✅ EXISTS |
| Validation wired in `handleGetUnresolvedImports` | `src/api.ts` | ✅ EXISTS |
| `reason` field on zero-`searchedFiles` responses | `src/api.ts` | ✅ EXISTS |
| Test coverage (24 cases) | `src/__tests__/tool-input-validation.test.ts` | ✅ EXISTS, ALL PASS |
| Tool authoring cheat sheet | `docs/TOOLS-CHEATSHEET.md` | ✅ EXISTS, <60 lines |

---

## Test Output

**Pre-flight baseline:** 3 failed (EADDRINUSE — `server-flags.test.ts`, pre-existing) | 418 passed (421 total)

**Post-flight:** 3 failed (same pre-existing EADDRINUSE) | 418 passed (421 total)

**Track 4 test file — all 24 pass:**

```
✓ validateGlob > rejects comma-separated glob without brace-expansion
✓ validateGlob > accepts brace-expansion glob
✓ validateGlob > accepts comma inside braces (brace-expansion with comma)
✓ validateGlob > rejects absolute path (Unix-style)
✓ validateGlob > rejects absolute path (Windows-style)
✓ validateGlob > accepts relative glob without comma
✓ validateRegex > returns a RegExp for a valid pattern
✓ validateRegex > throws ToolInputError with character-class hint for unclosed class
✓ validateRegex > throws ToolInputError with parens hint for unterminated group
✓ validateRegex > includes the original pattern in the error message
✓ HTTP handlers — glob validation > GET /api/v1/mcp/dead-code rejects comma glob
✓ HTTP handlers — glob validation > POST /api/v1/mcp/dead-code rejects comma glob
✓ HTTP handlers — glob validation > GET /api/v1/mcp/dead-code accepts brace-expansion glob
✓ HTTP handlers — glob validation > GET /api/v1/mcp/hotspots rejects absolute path glob
✓ HTTP handlers — glob validation > GET /api/v1/mcp/circular-deps rejects comma glob
✓ HTTP handlers — glob validation > GET /api/v1/mcp/complexity rejects absolute path glob
✓ HTTP handlers — regex validation > GET /api/v1/mcp/search rejects unclosed character class when use_regex=true
✓ HTTP handlers — regex validation > POST /api/v1/mcp/search rejects unterminated group when use_regex=true
✓ HTTP handlers — regex validation > GET /api/v1/mcp/search does NOT validate regex when use_regex=false
✓ Zero-results reason field > dead-code: reason field present when totalScanned=0 and file_pattern is set
✓ Zero-results reason field > dead-code: NO reason field when totalScanned=0 but no file_pattern
✓ Zero-results reason field > dead-code: NO reason field when totalScanned > 0 (legitimate empty result)
✓ Zero-results reason field > circular-deps: reason field present when totalFilesScanned=0 and file_pattern is set
✓ Zero-results reason field > complexity: reason field present when totalScanned=0 and file_path is set
```

**No regression introduced.**

---

## Required Doc Updates (for Knowledge Manager)

### 1. `services/mcp-context-manager/README.md`

Add a section under "API Tools" or "Input Validation":

> **Input Validation:** All tools that accept `file_pattern` (glob) or `pattern` (regex) parameters perform pre-flight validation. Comma-separated globs (`*.ts,*.tsx`) and absolute paths are rejected with a `400 INVALID_PARAMS` response and an actionable hint. Invalid regex patterns include a hint for the most common mistakes (unclosed character class, unterminated group). When a tool returns zero results because no files matched the glob, the response includes a `reason` field explaining the likely cause.

### 2. `services/mcp-context-manager/.claude/local_context.md`

No dependency or tech stack changes. No update required.

### 3. `/.claude/docs/architecture/infrastructure.md`

No infrastructure changes. No update required.

### 4. `docs/TROUBLESHOOTING.md`

Add entry:

> **Tool returns `400 INVALID_PARAMS` with "brace-expansion" in the message:**
> You passed a comma-separated glob like `*.ts,*.tsx`. Use brace-expansion: `*.{ts,tsx}`.
>
> **Tool returns `400 INVALID_PARAMS` with "Absolute paths are not valid globs":**
> Use a workspace-relative path like `src/**/*.ts` instead of `/absolute/path/src/**/*.ts`.
>
> **Tool returns zero results with a `reason` field:**
> The glob matched no indexed files. Check the pattern is relative to the workspace root and uses correct brace-expansion syntax.

---

## Contract Impact

- Tool response shapes gain an **optional** `reason` field (additive, backwards-compatible).
- No existing required fields changed.
- No API contract files require updates.
- No `package.json` changes.

---

## Ripple Effect Assessment

- `ToolInputError` and the unresolved-import error path (Track 2) use consistent error shapes: both return `{ error: string, code: "INVALID_PARAMS", retryable: false }` via `toolInputErrorResponse()`. ✅ Compatible with Track 7 integration review.
- No cross-track contract mismatches found.
