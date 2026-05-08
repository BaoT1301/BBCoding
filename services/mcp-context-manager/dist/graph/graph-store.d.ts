import type { EdgeType, FileParseResult, GraphEdge, GraphExport, GraphNode, Language, SymbolKind } from "../types/schema.js";
export declare class GraphStore {
    private readonly graph;
    private readonly fileToSymbolIds;
    private readonly symbolByQualifiedName;
    private readonly reverseImports;
    private readonly importsByFile;
    private readonly fileHashes;
    hasFileHash(filePath: string, hash: string): boolean;
    getFileHash(filePath: string): string | undefined;
    getIndexedFilePaths(): string[];
    getDirectDependents(filePath: string): string[];
    upsertFileResult(result: FileParseResult): void;
    removeFile(filePath: string): void;
    getFunctionContext(params: {
        functionName: string;
        filePath?: string;
        maxHops: number;
        includeEdgeTypes?: EdgeType[];
        maxNodes: number;
        signal?: AbortSignal;
    }): {
        root: GraphNode | null;
        neighborhood: GraphExport;
        relatedFiles: string[];
        truncated: boolean;
    };
    getFileDependents(params: {
        filePath: string;
        direction: "incoming" | "outgoing" | "both";
        depth: number;
        maxFiles: number;
        signal?: AbortSignal;
    }): {
        file: string;
        dependents: Array<{
            filePath: string;
            relationType: string;
            depth: number;
        }>;
        summary: {
            incomingCount: number;
            outgoingCount: number;
            truncated: boolean;
        };
    };
    getSymbolReferences(params: {
        symbolQualifiedName: string;
        includeReads: boolean;
        includeWrites: boolean;
        includeCalls: boolean;
        maxResults: number;
        signal?: AbortSignal;
    }): {
        symbol: GraphNode | null;
        references: Array<{
            filePath: string;
            range: string;
            edgeType: string;
            contextSnippet: string;
        }>;
        truncated: boolean;
    };
    exportDependencyGraph(params: {
        scope: "repo" | "file" | "symbol";
        filePath?: string;
        symbolQualifiedName?: string;
        maxNodes: number;
        maxEdges: number;
        signal?: AbortSignal;
    }): {
        graph: GraphExport;
        meta: Record<string, unknown>;
    };
    /**
     * Get all functions that call a given function (reverse call graph).
     * Supports depth parameter for transitive callers via BFS on inbound `calls` edges.
     */
    getCallers(params: {
        functionName: string;
        filePath?: string;
        maxDepth?: number;
        maxResults?: number;
        signal?: AbortSignal;
    }): {
        target: GraphNode | null;
        callers: Array<{
            node: GraphNode;
            depth: number;
            callEdge: GraphEdge;
        }>;
        truncated: boolean;
    };
    /**
     * Get the full call chain for a function as a directed subgraph.
     * Supports upstream (who calls me), downstream (who do I call), or both directions.
     * Returns a `GraphExport` (nodes + edges) suitable for visualization.
     */
    getCallChain(params: {
        functionName: string;
        filePath?: string;
        direction: "upstream" | "downstream" | "both";
        maxDepth?: number;
        maxNodes?: number;
        signal?: AbortSignal;
    }): {
        root: GraphNode | null;
        chain: GraphExport;
        truncated: boolean;
    };
    /**
     * Compute the transitive closure of all files and symbols affected by a
     * change to the given file.  BFS on `reverseImports` (who imports this file?)
     * up to `maxDepth`.  Returns affected files, affected symbols, a risk score,
     * and suggested test files.
     */
    getImpactAnalysis(params: {
        filePath: string;
        maxDepth?: number;
        maxFiles?: number;
        signal?: AbortSignal;
    }): {
        sourceFile: string;
        affectedFiles: Array<{
            filePath: string;
            depth: number;
            impactType: "direct" | "transitive";
        }>;
        affectedSymbols: Array<{
            node: GraphNode;
            impactType: "direct" | "transitive";
        }>;
        riskScore: number;
        suggestedTestFiles: string[];
        truncated: boolean;
    };
    /**
     * Find functions and classes with zero inbound `calls`/`instantiates` edges (potential dead code).
     * Supports filtering by file pattern, language, and symbol kind.
     * Excludes entry points heuristically: functions named `main`, `bootstrap`, `__init__`,
     * and files matching test directory patterns (e.g. any path containing a test segment).
     */
    getDeadCode(params: {
        filePattern?: string;
        language?: "python" | "typescript";
        kind?: "function" | "class";
        maxResults?: number;
        signal?: AbortSignal;
    }): {
        deadSymbols: Array<{
            node: GraphNode;
            definedIn: string;
        }>;
        totalScanned: number;
        truncated: boolean;
    };
    getHotspots(params: {
        topN?: number;
        kind?: SymbolKind;
        language?: Language;
        filePattern?: string;
        includeEdgeTypes?: EdgeType[];
        signal?: AbortSignal;
    }): {
        hotspots: Array<{
            node: GraphNode;
            fanIn: number;
            fanOut: number;
            edgeBreakdown: Record<string, number>;
        }>;
        totalSymbolsScanned: number;
        truncated: boolean;
    };
    getModuleCoupling(params: {
        filePathA: string;
        filePathB: string;
        maxDepth?: number;
        signal?: AbortSignal;
    }): {
        filePathA: string;
        filePathB: string;
        sharedImports: number;
        sharedSymbols: number;
        directEdges: number;
        transitiveEdges: number;
        couplingScore: number;
        truncated: boolean;
    };
    /**
     * Get the class hierarchy (ancestors and/or descendants) for a given class.
     * Traverses `inherits` edges in the graph:
     *   - Ancestors: follow outgoing `inherits` edges (child → parent)
     *   - Descendants: follow incoming `inherits` edges (child → this class)
     */
    getClassHierarchy(params: {
        className: string;
        filePath?: string;
        direction?: "ancestors" | "descendants" | "both";
        maxDepth?: number;
        signal?: AbortSignal;
    }): {
        root: GraphNode | null;
        ancestors: Array<{
            node: GraphNode;
            depth: number;
        }>;
        descendants: Array<{
            node: GraphNode;
            depth: number;
        }>;
        hierarchy: GraphExport;
        truncated: boolean;
    };
    searchSymbols(params: {
        query: string;
        kind?: SymbolKind;
        language?: Language;
        filePattern?: string;
        useRegex?: boolean;
        maxResults?: number;
        signal?: AbortSignal;
    }): {
        results: Array<{
            node: GraphNode;
            matchScore: number;
            matchedField: "label" | "qualifiedName";
        }>;
        totalMatches: number;
        truncated: boolean;
    };
    /**
     * Compute per-symbol complexity metrics: fan-in (inbound edges), fan-out
     * (outbound edges), and max call-chain depth via BFS (capped at 10).
     * `totalComplexity = fanIn + fanOut + maxDepth`.
     * Supports filtering by filePath, kind, language, and sorting.
     */
    getComplexityMetrics(params: {
        filePath?: string;
        kind?: "function" | "class" | "file";
        language?: "python" | "typescript";
        sortBy?: "fan_in" | "fan_out" | "depth" | "total";
        maxResults?: number;
        signal?: AbortSignal;
    }): {
        metrics: Array<{
            node: GraphNode;
            fanIn: number;
            fanOut: number;
            maxDepth: number;
            totalComplexity: number;
        }>;
        totalScanned: number;
        truncated: boolean;
    };
    /**
     * Detect circular import dependencies in the codebase using iterative DFS
     * on the file-level import graph (via the `importsByFile` map).
     * Supports filtering by file pattern and language, and respects maxCycles
     * and maxDepth for early termination.
     */
    getCircularDependencies(params: {
        filePattern?: string;
        language?: "python" | "typescript";
        maxCycles?: number;
        maxDepth?: number;
        signal?: AbortSignal;
    }): {
        cycles: Array<{
            chain: string[];
            length: number;
        }>;
        totalFilesScanned: number;
        truncated: boolean;
    };
    /**
     * Given a set of changed file paths (e.g. from a git diff), predict which
     * tests should run and which areas of the codebase are highest risk.
     *
     * Builds on the existing impact-analysis traversal logic but accepts
     * multiple files and aggregates risk scores. Cross-references affected
     * symbols with the top-20 hotspots to surface high-fan-in symbols in the
     * blast radius.
     */
    getChangeRisk(params: {
        changedFiles: string[];
        maxDepth?: number;
        maxFiles?: number;
        signal?: AbortSignal;
    }): {
        changedFiles: string[];
        aggregateRiskScore: number;
        affectedFiles: Array<{
            filePath: string;
            depth: number;
            impactType: "direct" | "transitive";
            riskContribution: number;
        }>;
        suggestedTestFiles: string[];
        hotspotOverlap: Array<{
            node: GraphNode;
            fanIn: number;
        }>;
        truncated: boolean;
    };
    /**
     * Returns a copy of the current file path to content hash map.
     */
    getFileHashes(): Record<string, string>;
    /**
     * Export the raw graphology graph for snapshot serialization.
     */
    exportGraph(): ReturnType<typeof this.graph.export>;
    /**
     * Import a previously exported graphology graph and rebuild internal lookup maps.
     * Used to restore state from a disk snapshot.
     */
    importFromSnapshot(graphologyExport: unknown, fileHashes: Record<string, string>): void;
    private removeFileData;
    private upsertSymbolNode;
    private upsertNode;
    private exportSubgraph;
    private toGraphNode;
    private fileNodeId;
    private symbolNodeId;
    private externalSymbolNodeId;
}
