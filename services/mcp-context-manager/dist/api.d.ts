import { GraphStore } from "./graph/graph-store.js";
import { ClusterConfigLoader } from "./cluster/cluster-config-loader.js";
interface ApiResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: any;
}
export declare class HttpApiServer {
    private server;
    private graphStore;
    private clusterConfig;
    private port;
    private readonly sseClients;
    private keepaliveInterval;
    private indexingState;
    /** Default timeout for query endpoints (ms). */
    private static readonly DEFAULT_TIMEOUT_MS;
    /** Max retries for query endpoints on timeout. */
    private static readonly MAX_RETRIES;
    /** Backoff between retries (ms). */
    private static readonly RETRY_BACKOFF_MS;
    constructor(graphStore: GraphStore, clusterConfig: ClusterConfigLoader, port?: number);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleRequest;
    private handleGetClusters;
    /**
     * Mark indexing as complete so that late-connecting SSE clients
     * receive an immediate `indexing-complete` event after `connected`.
     */
    markIndexingComplete(indexedFiles: number): void;
    private handleSSEConnection;
    broadcastSSE(event: string, data: object): void;
    private handleGetCallers;
    private handleGetCallersPost;
    private handleGetCallChain;
    private handleGetCallChainPost;
    private handleGetDeadCode;
    private handleGetDeadCodePost;
    private handleGetHotspots;
    private handleGetHotspotsPost;
    private handleGetImpactAnalysis;
    private handleGetImpactAnalysisPost;
    private handleGetModuleCoupling;
    private handleGetModuleCouplingPost;
    private handleGetClassHierarchy;
    private handleGetClassHierarchyPost;
    private handleSearchSymbols;
    private handleSearchSymbolsPost;
    private handleGetCircularDeps;
    private handleGetCircularDepsPost;
    private handleGetComplexity;
    private handleGetComplexityPost;
    private handleGetChangeRisk;
    private handleGetChangeRiskPost;
    private parseBody;
    /**
     * Wraps a query handler with timeout + retry logic.
     * On `QueryTimeoutError`, retries up to MAX_RETRIES times with RETRY_BACKOFF_MS backoff.
     * Returns HTTP 504 if all retries fail.
     *
     * This is used by new query endpoints (Tracks 3-6). Existing endpoints are NOT wrapped
     * to maintain backward compatibility.
     */
    executeQuery<T>(handler: (signal: AbortSignal) => Promise<T>, timeoutMs?: number): Promise<ApiResponse>;
    private handleExportGraph;
    private handleFunctionContext;
    private handleFunctionContextPost;
    private handleFileDependents;
    private handleFileDependentsPost;
    private handleSymbolReferences;
    private handleSymbolReferencesPost;
}
export {};
