import type { GraphStore } from "./graph-store.js";
/**
 * Snapshot metadata envelope wrapping the graphology serialized graph.
 */
export interface SnapshotData {
    version: 1;
    createdAt: string;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    fileHashes: Record<string, string>;
    graph: unknown;
}
/**
 * Resolve the snapshot directory. Prefers `GRAPH_SNAPSHOT_DIR` env var,
 * then falls back to `{workspaceRoot}/.mcp-cache/`. In Docker (when
 * WORKSPACE_ROOT is `/workspace`), defaults to `/tmp/.mcp-cache/` since
 * source volumes are mounted read-only.
 */
export declare function resolveSnapshotPath(workspaceRoot: string): string;
/**
 * Save the current graph state to a JSON snapshot on disk.
 * Uses a temp-file + rename pattern for atomic writes.
 */
export declare function saveSnapshot(graphStore: GraphStore, snapshotPath: string): Promise<void>;
/**
 * Load a snapshot from disk. Returns null if the file does not exist,
 * the version does not match, or the data is corrupt.
 * Never throws — always falls back gracefully.
 */
export declare function loadSnapshot(snapshotPath: string): Promise<SnapshotData | null>;
/**
 * Create a debounced save function that ensures at most one save
 * per `intervalMs` milliseconds.
 */
export declare function createDebouncedSave(graphStore: GraphStore, snapshotPath: string, intervalMs?: number): () => void;
