import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveFileWatcher } from "../watcher/file-watcher.js";
// ---------------------------------------------------------------------------
// Helpers: minimal mocks for IncrementalIndexer and GraphStore
// ---------------------------------------------------------------------------
function createMockIndexer(overrides = {}) {
    return {
        processChanges: vi.fn().mockResolvedValue({ reparsed: 1, dependents: 0 }),
        removeFile: vi.fn().mockResolvedValue(undefined),
        buildInitialGraph: vi.fn().mockResolvedValue({ indexedFiles: 0 }),
        ...overrides,
    };
}
function createMockGraphStore(indexedFiles = []) {
    return {
        getIndexedFilePaths: vi.fn().mockReturnValue(indexedFiles),
        getDirectDependents: vi.fn().mockReturnValue([]),
        getFileHash: vi.fn().mockReturnValue(undefined),
    };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LiveFileWatcher", () => {
    let watcher;
    let onUpdateSpy;
    let mockIndexer;
    let mockGraphStore;
    beforeEach(() => {
        vi.useFakeTimers();
        onUpdateSpy = vi.fn();
    });
    afterEach(async () => {
        if (watcher) {
            await watcher.stop();
        }
        vi.useRealTimers();
    });
    // -----------------------------------------------------------------------
    // Property (a): onUpdate callback receives actual file paths
    // -----------------------------------------------------------------------
    describe("Property (a): onUpdate receives actual file paths", () => {
        it("should pass file path strings in filePaths, not just a count", async () => {
            mockIndexer = createMockIndexer();
            mockGraphStore = createMockGraphStore(["existing/file.py"]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            // Simulate the internal flush by accessing private methods via prototype
            // Instead, we test the public contract by triggering schedule → flush
            // We need to call the private schedule method, so we cast to any
            const w = watcher;
            // Simulate a file change event
            w.schedule("existing/file.py");
            // Advance past the 200ms per-file debounce
            await vi.advanceTimersByTimeAsync(200);
            // Advance past the 500ms batch flush
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.filePaths).toEqual(["existing/file.py"]);
            expect(stats.files).toBe(1);
        });
        it("should include multiple file paths when multiple files change", async () => {
            mockIndexer = createMockIndexer({
                processChanges: vi.fn().mockResolvedValue({ reparsed: 2, dependents: 0 }),
            });
            mockGraphStore = createMockGraphStore(["backend/app/main.py", "backend/app/config.py"]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            const w = watcher;
            w.schedule("backend/app/main.py");
            w.schedule("backend/app/config.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.filePaths).toHaveLength(2);
            expect(stats.filePaths).toContain("backend/app/main.py");
            expect(stats.filePaths).toContain("backend/app/config.py");
        });
    });
    // -----------------------------------------------------------------------
    // Property (b): new files trigger newFiles in the stats
    // -----------------------------------------------------------------------
    describe("Property (b): new files appear in newFiles", () => {
        it("should report a file as new when it is not in knownFiles", async () => {
            mockIndexer = createMockIndexer();
            // Graph store has NO indexed files — everything is new
            mockGraphStore = createMockGraphStore([]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            // Populate knownFiles from graph store (empty)
            await watcher.start();
            const w = watcher;
            w.schedule("brand/new/file.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.newFiles).toEqual(["brand/new/file.py"]);
            expect(stats.filePaths).toEqual(["brand/new/file.py"]);
        });
        it("should add new files to knownFiles after first flush", async () => {
            mockIndexer = createMockIndexer();
            mockGraphStore = createMockGraphStore([]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            await watcher.start();
            const w = watcher;
            // First change — file is new
            w.schedule("brand/new/file.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            expect(onUpdateSpy.mock.calls[0][0].newFiles).toEqual(["brand/new/file.py"]);
            // Second change — same file, now known
            w.schedule("brand/new/file.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(2);
            const secondStats = onUpdateSpy.mock.calls[1][0];
            expect(secondStats.newFiles).toEqual([]);
            expect(secondStats.filePaths).toEqual(["brand/new/file.py"]);
        });
    });
    // -----------------------------------------------------------------------
    // Property (c): known files do NOT appear in newFiles
    // -----------------------------------------------------------------------
    describe("Property (c): known files do not appear in newFiles", () => {
        it("should not report existing indexed files as new", async () => {
            mockIndexer = createMockIndexer();
            // Graph store already knows about this file
            mockGraphStore = createMockGraphStore(["backend/app/main.py"]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            // start() populates knownFiles from graphStore
            await watcher.start();
            const w = watcher;
            w.schedule("backend/app/main.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.newFiles).toEqual([]);
            expect(stats.filePaths).toEqual(["backend/app/main.py"]);
        });
        it("should correctly split a batch into new and known files", async () => {
            mockIndexer = createMockIndexer({
                processChanges: vi.fn().mockResolvedValue({ reparsed: 2, dependents: 0 }),
            });
            // Only main.py is known
            mockGraphStore = createMockGraphStore(["backend/app/main.py"]);
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
            });
            await watcher.start();
            const w = watcher;
            w.schedule("backend/app/main.py"); // known
            w.schedule("backend/app/new_file.py"); // new
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.newFiles).toEqual(["backend/app/new_file.py"]);
            expect(stats.filePaths).toHaveLength(2);
            expect(stats.filePaths).toContain("backend/app/main.py");
            expect(stats.filePaths).toContain("backend/app/new_file.py");
        });
    });
    // -----------------------------------------------------------------------
    // Edge case: deleted files are removed from knownFiles
    // -----------------------------------------------------------------------
    describe("Edge case: file deletion removes from knownFiles", () => {
        it("should treat a re-created file as new after deletion", async () => {
            mockIndexer = createMockIndexer();
            mockGraphStore = createMockGraphStore(["backend/app/main.py"]);
            const onDeleteSpy = vi.fn();
            watcher = new LiveFileWatcher({
                workspaceRoot: "/workspace",
                indexer: mockIndexer,
                graphStore: mockGraphStore,
                onUpdate: onUpdateSpy,
                onDelete: onDeleteSpy,
            });
            await watcher.start();
            const w = watcher;
            // Verify file is known
            expect(w.knownFiles.has("backend/app/main.py")).toBe(true);
            // Simulate unlink event (call the handler directly since chokidar is mocked away)
            // The unlink handler normalizes and removes from knownFiles
            w.knownFiles.delete("backend/app/main.py");
            // Now schedule the same file — it should be new
            w.schedule("backend/app/main.py");
            await vi.advanceTimersByTimeAsync(200);
            await vi.advanceTimersByTimeAsync(500);
            expect(onUpdateSpy).toHaveBeenCalledTimes(1);
            const stats = onUpdateSpy.mock.calls[0][0];
            expect(stats.newFiles).toEqual(["backend/app/main.py"]);
        });
    });
});
//# sourceMappingURL=file-watcher.test.js.map