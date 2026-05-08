import { GraphStore } from "../graph/graph-store.js";
export declare class IncrementalIndexer {
    private readonly workspaceRoot;
    private readonly graphStore;
    private readonly fileExistsCache;
    constructor(workspaceRoot: string, graphStore: GraphStore);
    buildInitialGraph(onProgress?: (current: number, total: number) => void): Promise<{
        indexedFiles: number;
    }>;
    buildDeltaGraph(snapshotFileHashes: Record<string, string>): Promise<{
        reused: number;
        reparsed: number;
        deleted: number;
    }>;
    processChanges(changedFiles: string[]): Promise<{
        reparsed: number;
        dependents: number;
    }>;
    removeFile(filePath: string): Promise<void>;
    private reindexSingleFile;
    private resolveImports;
    private resolvePythonModule;
    private resolveTypeScriptImport;
    private exists;
}
