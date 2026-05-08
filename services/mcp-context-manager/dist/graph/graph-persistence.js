import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const SNAPSHOT_VERSION = 1;
/**
 * Resolve the snapshot directory. Prefers `GRAPH_SNAPSHOT_DIR` env var,
 * then falls back to `{workspaceRoot}/.mcp-cache/`. In Docker (when
 * WORKSPACE_ROOT is `/workspace`), defaults to `/tmp/.mcp-cache/` since
 * source volumes are mounted read-only.
 */
export function resolveSnapshotPath(workspaceRoot) {
    if (process.env.GRAPH_SNAPSHOT_DIR) {
        return path.join(process.env.GRAPH_SNAPSHOT_DIR, "graph-snapshot.json");
    }
    // In Docker the workspace is typically /workspace with :ro mounts.
    // Use /tmp as a writable fallback.
    const cacheDir = workspaceRoot === "/workspace"
        ? path.join(os.tmpdir(), ".mcp-cache")
        : path.join(workspaceRoot, ".mcp-cache");
    return path.join(cacheDir, "graph-snapshot.json");
}
/**
 * Save the current graph state to a JSON snapshot on disk.
 * Uses a temp-file + rename pattern for atomic writes.
 */
export async function saveSnapshot(graphStore, snapshotPath) {
    const dir = path.dirname(snapshotPath);
    await fs.mkdir(dir, { recursive: true });
    const serializedGraph = graphStore.exportGraph();
    const fileHashes = graphStore.getFileHashes();
    const snapshot = {
        version: SNAPSHOT_VERSION,
        createdAt: new Date().toISOString(),
        fileCount: Object.keys(fileHashes).length,
        nodeCount: serializedGraph.nodes.length,
        edgeCount: serializedGraph.edges.length,
        fileHashes,
        graph: serializedGraph,
    };
    const json = JSON.stringify(snapshot);
    const tmpPath = `${snapshotPath}.tmp.${process.pid}`;
    try {
        await fs.writeFile(tmpPath, json, "utf-8");
        await fs.rename(tmpPath, snapshotPath);
    }
    catch (err) {
        // Clean up temp file on failure
        try {
            await fs.unlink(tmpPath);
        }
        catch {
            // Ignore cleanup errors
        }
        throw err;
    }
}
/**
 * Load a snapshot from disk. Returns null if the file does not exist,
 * the version does not match, or the data is corrupt.
 * Never throws — always falls back gracefully.
 */
export async function loadSnapshot(snapshotPath) {
    try {
        const raw = await fs.readFile(snapshotPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            console.error("[graph-persistence] snapshot is not a valid object");
            return null;
        }
        if (parsed.version !== SNAPSHOT_VERSION) {
            console.error(`[graph-persistence] snapshot version mismatch: expected ${SNAPSHOT_VERSION}, got ${parsed.version}`);
            return null;
        }
        if (!parsed.graph || !parsed.fileHashes) {
            console.error("[graph-persistence] snapshot missing required fields");
            return null;
        }
        return parsed;
    }
    catch (err) {
        if (err.code === "ENOENT") {
            // File does not exist — not an error, just no snapshot available
            return null;
        }
        console.error("[graph-persistence] failed to load snapshot:", err.message);
        return null;
    }
}
/**
 * Create a debounced save function that ensures at most one save
 * per `intervalMs` milliseconds.
 */
export function createDebouncedSave(graphStore, snapshotPath, intervalMs = 5000) {
    let timer = null;
    let saving = false;
    return () => {
        if (timer)
            return;
        timer = setTimeout(async () => {
            timer = null;
            if (saving)
                return;
            saving = true;
            try {
                await saveSnapshot(graphStore, snapshotPath);
            }
            catch (err) {
                console.error("[graph-persistence] debounced save failed:", err.message);
            }
            finally {
                saving = false;
            }
        }, intervalMs);
    };
}
//# sourceMappingURL=graph-persistence.js.map