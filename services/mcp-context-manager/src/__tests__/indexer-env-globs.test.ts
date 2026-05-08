import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Import after env manipulation — use dynamic import inside tests to ensure
// the module re-evaluates process.env at call time (which it does, by design).
// We test the exported helper directly by re-importing the module.
import { resolveGlobPatterns } from "../indexer/incremental-indexer.js";
import { resolveWatchPaths } from "../watcher/file-watcher.js";

describe("resolveGlobPatterns", () => {
  let originalPython: string | undefined;
  let originalTs: string | undefined;

  beforeEach(() => {
    originalPython = process.env.PYTHON_WATCH_GLOBS;
    originalTs = process.env.TS_WATCH_GLOBS;
    delete process.env.PYTHON_WATCH_GLOBS;
    delete process.env.TS_WATCH_GLOBS;
  });

  afterEach(() => {
    if (originalPython === undefined) {
      delete process.env.PYTHON_WATCH_GLOBS;
    } else {
      process.env.PYTHON_WATCH_GLOBS = originalPython;
    }
    if (originalTs === undefined) {
      delete process.env.TS_WATCH_GLOBS;
    } else {
      process.env.TS_WATCH_GLOBS = originalTs;
    }
  });

  it("returns default Python pattern when PYTHON_WATCH_GLOBS is unset", () => {
    const { pythonPatterns } = resolveGlobPatterns();
    expect(pythonPatterns).toEqual(["backend/**/*.py"]);
  });

  it("returns custom Python pattern when PYTHON_WATCH_GLOBS=src/**/*.py", () => {
    process.env.PYTHON_WATCH_GLOBS = "src/**/*.py";
    const { pythonPatterns } = resolveGlobPatterns();
    expect(pythonPatterns).toEqual(["src/**/*.py"]);
  });

  it("returns default TS patterns when TS_WATCH_GLOBS is unset", () => {
    const { tsPatterns } = resolveGlobPatterns();
    expect(tsPatterns).toEqual([
      "frontend/src/**/*.{ts,tsx,js,jsx}",
      "services/**/*.{ts,tsx,js,jsx}",
    ]);
  });

  it("returns custom TS patterns when TS_WATCH_GLOBS=app/**/*.ts,lib/**/*.ts", () => {
    process.env.TS_WATCH_GLOBS = "app/**/*.ts,lib/**/*.ts";
    const { tsPatterns } = resolveGlobPatterns();
    expect(tsPatterns).toEqual(["app/**/*.ts", "lib/**/*.ts"]);
  });
});

describe("resolveWatchPaths", () => {
  let originalPython: string | undefined;
  let originalTs: string | undefined;

  beforeEach(() => {
    originalPython = process.env.PYTHON_WATCH_GLOBS;
    originalTs = process.env.TS_WATCH_GLOBS;
    delete process.env.PYTHON_WATCH_GLOBS;
    delete process.env.TS_WATCH_GLOBS;
  });

  afterEach(() => {
    if (originalPython === undefined) {
      delete process.env.PYTHON_WATCH_GLOBS;
    } else {
      process.env.PYTHON_WATCH_GLOBS = originalPython;
    }
    if (originalTs === undefined) {
      delete process.env.TS_WATCH_GLOBS;
    } else {
      process.env.TS_WATCH_GLOBS = originalTs;
    }
  });

  it("returns default watch dirs when no env vars set", () => {
    const paths = resolveWatchPaths("/workspace");
    expect(paths).toEqual(["/workspace/backend", "/workspace/frontend/src", "/workspace/services"]);
  });

  it("extracts top-level dir from PYTHON_WATCH_GLOBS", () => {
    process.env.PYTHON_WATCH_GLOBS = "src/**/*.py";
    const paths = resolveWatchPaths("/workspace");
    expect(paths).toContain("/workspace/src");
  });

  it("extracts multi-segment prefix from TS_WATCH_GLOBS (frontend/src)", () => {
    process.env.TS_WATCH_GLOBS = "frontend/src/**/*.{ts,tsx}";
    const paths = resolveWatchPaths("/workspace");
    expect(paths).toContain("/workspace/frontend/src");
  });

  it("deduplicates overlapping glob prefixes", () => {
    process.env.TS_WATCH_GLOBS = "app/**/*.ts,app/**/*.tsx";
    const paths = resolveWatchPaths("/workspace");
    expect(paths.filter((p) => p.endsWith("/app"))).toHaveLength(1);
  });
});
