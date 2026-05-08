import { IncrementalIndexer } from "../indexer/incremental-indexer.js";
import type { GraphStore } from "../graph/graph-store.js";
export interface WatcherUpdateStats {
    reparsed: number;
    dependents: number;
    files: number;
    filePaths: string[];
    newFiles: string[];
}
interface WatcherOptions {
    workspaceRoot: string;
    indexer: IncrementalIndexer;
    graphStore: GraphStore;
    onUpdate?: (stats: WatcherUpdateStats) => void;
    onDelete?: (filePath: string) => void;
}
export declare class LiveFileWatcher {
    private readonly workspaceRoot;
    private readonly indexer;
    private readonly graphStore;
    private readonly onUpdate?;
    private readonly onDelete?;
    private readonly pendingByFile;
    private readonly pendingSet;
    private readonly knownFiles;
    private flushTimer;
    private watcher;
    constructor(options: WatcherOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private schedule;
    private scheduleFlush;
    private normalize;
}
export {};
