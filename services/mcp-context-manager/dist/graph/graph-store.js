import path from "node:path";
import { MultiDirectedGraph } from "graphology";
import { InvalidParamsError, NotFoundError } from "../utils/query-guards.js";
function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}
export class GraphStore {
    graph = new MultiDirectedGraph();
    fileToSymbolIds = new Map();
    symbolByQualifiedName = new Map();
    reverseImports = new Map();
    importsByFile = new Map();
    fileHashes = new Map();
    hasFileHash(filePath, hash) {
        return this.fileHashes.get(normalizePath(filePath)) === hash;
    }
    getFileHash(filePath) {
        return this.fileHashes.get(normalizePath(filePath));
    }
    getIndexedFilePaths() {
        return [...this.fileHashes.keys()];
    }
    getDirectDependents(filePath) {
        const dependents = this.reverseImports.get(normalizePath(filePath));
        return dependents ? [...dependents] : [];
    }
    upsertFileResult(result) {
        const filePath = normalizePath(result.filePath);
        this.removeFileData(filePath, false);
        this.fileHashes.set(filePath, result.hash);
        const fileNodeId = this.fileNodeId(filePath);
        this.upsertNode(fileNodeId, {
            label: path.basename(filePath),
            kind: "file",
            language: result.language,
            filePath,
            qualifiedName: filePath,
        });
        const symbolIds = new Set();
        for (const symbol of result.symbols) {
            const symbolNodeId = this.symbolNodeId(symbol.id);
            this.upsertSymbolNode(symbolNodeId, symbol);
            symbolIds.add(symbolNodeId);
            this.symbolByQualifiedName.set(symbol.qualifiedName, symbolNodeId);
        }
        this.fileToSymbolIds.set(filePath, symbolIds);
        const resolvedImportSet = new Set(result.resolvedImports.map((entry) => normalizePath(entry)));
        this.importsByFile.set(filePath, resolvedImportSet);
        for (const importedFile of resolvedImportSet) {
            const importedNodeId = this.fileNodeId(importedFile);
            this.upsertNode(importedNodeId, {
                label: path.basename(importedFile),
                kind: "file",
                language: "python",
                filePath: importedFile,
                qualifiedName: importedFile,
            });
            this.graph.addDirectedEdgeWithKey(`edge:imports:${filePath}->${importedFile}`, fileNodeId, importedNodeId, {
                type: "imports",
                weight: 1,
                filePath,
            });
            const existingDependents = this.reverseImports.get(importedFile) ?? new Set();
            existingDependents.add(filePath);
            this.reverseImports.set(importedFile, existingDependents);
        }
        for (const relation of result.relations) {
            const sourceNodeId = relation.sourceSymbolId.startsWith("file:")
                ? this.fileNodeId(filePath)
                : this.symbolNodeId(relation.sourceSymbolId);
            if (!this.graph.hasNode(sourceNodeId)) {
                continue;
            }
            let targetNodeId;
            if (relation.targetSymbolId) {
                targetNodeId = this.symbolNodeId(relation.targetSymbolId);
            }
            else if (relation.targetQualifiedName) {
                targetNodeId =
                    this.symbolByQualifiedName.get(relation.targetQualifiedName) ??
                        this.externalSymbolNodeId(relation.targetQualifiedName);
                if (!this.graph.hasNode(targetNodeId)) {
                    this.upsertNode(targetNodeId, {
                        label: relation.targetQualifiedName,
                        kind: "external",
                        language: result.language,
                        qualifiedName: relation.targetQualifiedName,
                    });
                }
            }
            else {
                continue;
            }
            if (!this.graph.hasNode(targetNodeId)) {
                continue;
            }
            const edgeKey = `edge:${relation.type}:${sourceNodeId}->${targetNodeId}:${relation.filePath}:${Math.random().toString(36).slice(2, 8)}`;
            this.graph.addDirectedEdgeWithKey(edgeKey, sourceNodeId, targetNodeId, {
                type: relation.type,
                weight: relation.confidence,
                filePath: relation.filePath,
            });
        }
    }
    removeFile(filePath) {
        this.removeFileData(normalizePath(filePath), true);
    }
    getFunctionContext(params) {
        const nodes = this.graph
            .nodes()
            .filter((nodeId) => {
            const attrs = this.graph.getNodeAttributes(nodeId);
            if (attrs.kind !== "function") {
                return false;
            }
            if (attrs.label !== params.functionName) {
                return false;
            }
            if (!params.filePath) {
                return true;
            }
            return normalizePath(attrs.filePath ?? "") === normalizePath(params.filePath);
        });
        if (nodes.length === 0) {
            return {
                root: null,
                neighborhood: { nodes: [], edges: [] },
                relatedFiles: [],
                truncated: false,
            };
        }
        const root = nodes[0];
        const visited = new Set([root]);
        let frontier = [root];
        for (let hop = 0; hop < params.maxHops; hop += 1) {
            if (params.signal?.aborted)
                break;
            const next = [];
            for (const current of frontier) {
                if (params.signal?.aborted)
                    break;
                const outbound = this.graph.outboundEdges(current);
                const inbound = this.graph.inboundEdges(current);
                for (const edge of [...outbound, ...inbound]) {
                    if (params.signal?.aborted)
                        break;
                    const attrs = this.graph.getEdgeAttributes(edge);
                    if (params.includeEdgeTypes && !params.includeEdgeTypes.includes(attrs.type)) {
                        continue;
                    }
                    const opposite = this.graph.opposite(current, edge);
                    if (!visited.has(opposite)) {
                        visited.add(opposite);
                        next.push(opposite);
                    }
                    if (visited.size >= params.maxNodes) {
                        break;
                    }
                }
                if (visited.size >= params.maxNodes) {
                    break;
                }
            }
            frontier = next;
            if (visited.size >= params.maxNodes || frontier.length === 0) {
                break;
            }
        }
        const exported = this.exportSubgraph(visited, params.includeEdgeTypes);
        const relatedFiles = Array.from(new Set(exported.nodes.map((node) => node.filePath).filter((entry) => Boolean(entry))));
        return {
            root: this.toGraphNode(root),
            neighborhood: exported,
            relatedFiles,
            truncated: exported.nodes.length >= params.maxNodes,
        };
    }
    getFileDependents(params) {
        const filePath = normalizePath(params.filePath);
        const seen = new Set([filePath]);
        const queue = [{ path: filePath, depth: 0 }];
        const dependents = [];
        while (queue.length > 0) {
            if (params.signal?.aborted)
                break;
            const current = queue.shift();
            if (current.depth >= params.depth) {
                continue;
            }
            const candidates = [];
            if (params.direction === "incoming" || params.direction === "both") {
                const incoming = this.reverseImports.get(current.path) ?? new Set();
                for (const item of incoming) {
                    candidates.push({ path: item, relationType: "incoming" });
                }
            }
            if (params.direction === "outgoing" || params.direction === "both") {
                const outgoing = this.importsByFile.get(current.path) ?? new Set();
                for (const item of outgoing) {
                    candidates.push({ path: item, relationType: "outgoing" });
                }
            }
            for (const candidate of candidates) {
                if (params.signal?.aborted)
                    break;
                if (seen.has(candidate.path)) {
                    continue;
                }
                seen.add(candidate.path);
                dependents.push({ filePath: candidate.path, relationType: candidate.relationType, depth: current.depth + 1 });
                queue.push({ path: candidate.path, depth: current.depth + 1 });
                if (dependents.length >= params.maxFiles) {
                    break;
                }
            }
            if (dependents.length >= params.maxFiles) {
                break;
            }
        }
        const incomingCount = dependents.filter((item) => item.relationType === "incoming").length;
        const outgoingCount = dependents.filter((item) => item.relationType === "outgoing").length;
        return {
            file: filePath,
            dependents,
            summary: {
                incomingCount,
                outgoingCount,
                truncated: dependents.length >= params.maxFiles,
            },
        };
    }
    getSymbolReferences(params) {
        const symbolNodeId = this.symbolByQualifiedName.get(params.symbolQualifiedName);
        if (!symbolNodeId || !this.graph.hasNode(symbolNodeId)) {
            return { symbol: null, references: [], truncated: false };
        }
        const edges = this.graph.inboundEdges(symbolNodeId);
        const allowed = new Set();
        if (params.includeReads) {
            allowed.add("reads");
            allowed.add("references");
        }
        if (params.includeWrites) {
            allowed.add("writes");
        }
        if (params.includeCalls) {
            allowed.add("calls");
            allowed.add("instantiates");
        }
        const references = [];
        for (const edge of edges) {
            if (params.signal?.aborted)
                break;
            const attrs = this.graph.getEdgeAttributes(edge);
            if (!allowed.has(attrs.type)) {
                continue;
            }
            const sourceNodeId = this.graph.source(edge);
            const sourceAttrs = this.graph.getNodeAttributes(sourceNodeId);
            references.push({
                filePath: attrs.filePath,
                range: `${sourceAttrs.rangeStart?.line ?? 1}:${sourceAttrs.rangeStart?.column ?? 1}-${sourceAttrs.rangeEnd?.line ?? 1}:${sourceAttrs.rangeEnd?.column ?? 1}`,
                edgeType: attrs.type,
                contextSnippet: sourceAttrs.label,
            });
            if (references.length >= params.maxResults) {
                break;
            }
        }
        return {
            symbol: this.toGraphNode(symbolNodeId),
            references,
            truncated: references.length >= params.maxResults,
        };
    }
    exportDependencyGraph(params) {
        let nodeSet;
        if (params.scope === "repo") {
            nodeSet = new Set(this.graph.nodes().slice(0, params.maxNodes));
        }
        else if (params.scope === "file") {
            const filePath = normalizePath(params.filePath ?? "");
            nodeSet = new Set();
            const fileNodeId = this.fileNodeId(filePath);
            if (this.graph.hasNode(fileNodeId)) {
                nodeSet.add(fileNodeId);
            }
            const symbols = this.fileToSymbolIds.get(filePath) ?? new Set();
            for (const symbolId of symbols) {
                nodeSet.add(symbolId);
            }
            for (const importedFile of this.importsByFile.get(filePath) ?? new Set()) {
                nodeSet.add(this.fileNodeId(importedFile));
            }
            for (const dependent of this.reverseImports.get(filePath) ?? new Set()) {
                nodeSet.add(this.fileNodeId(dependent));
            }
        }
        else {
            const symbolNodeId = this.symbolByQualifiedName.get(params.symbolQualifiedName ?? "") ?? "";
            nodeSet = new Set();
            if (symbolNodeId && this.graph.hasNode(symbolNodeId)) {
                nodeSet.add(symbolNodeId);
                for (const edge of this.graph.inboundEdges(symbolNodeId)) {
                    nodeSet.add(this.graph.source(edge));
                }
                for (const edge of this.graph.outboundEdges(symbolNodeId)) {
                    nodeSet.add(this.graph.target(edge));
                }
            }
        }
        const graph = this.exportSubgraph(nodeSet);
        const cappedGraph = {
            nodes: graph.nodes.slice(0, params.maxNodes),
            edges: graph.edges.slice(0, params.maxEdges),
        };
        return {
            graph: cappedGraph,
            meta: {
                generatedAt: new Date().toISOString(),
                scope: params.scope,
                truncated: graph.nodes.length > params.maxNodes || graph.edges.length > params.maxEdges,
                nodeCount: cappedGraph.nodes.length,
                edgeCount: cappedGraph.edges.length,
            },
        };
    }
    /**
     * Get all functions that call a given function (reverse call graph).
     * Supports depth parameter for transitive callers via BFS on inbound `calls` edges.
     */
    getCallers(params) {
        const maxDepth = params.maxDepth ?? 3;
        const maxResults = params.maxResults ?? 100;
        // Find the target function node by name (and optionally filePath)
        const targetNodes = this.graph
            .nodes()
            .filter((nodeId) => {
            const attrs = this.graph.getNodeAttributes(nodeId);
            if (attrs.kind !== "function")
                return false;
            if (attrs.label !== params.functionName)
                return false;
            if (!params.filePath)
                return true;
            return normalizePath(attrs.filePath ?? "") === normalizePath(params.filePath);
        });
        if (targetNodes.length === 0) {
            return { target: null, callers: [], truncated: false };
        }
        const targetNodeId = targetNodes[0];
        const callers = [];
        const visited = new Set([targetNodeId]);
        let frontier = [targetNodeId];
        for (let depth = 1; depth <= maxDepth; depth++) {
            if (params.signal?.aborted)
                break;
            const nextFrontier = [];
            for (const currentNodeId of frontier) {
                if (params.signal?.aborted)
                    break;
                // Walk inbound edges looking for `calls` edges
                const inboundEdges = this.graph.inboundEdges(currentNodeId);
                for (const edgeKey of inboundEdges) {
                    if (params.signal?.aborted)
                        break;
                    const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                    if (edgeAttrs.type !== "calls")
                        continue;
                    const sourceNodeId = this.graph.source(edgeKey);
                    if (visited.has(sourceNodeId))
                        continue;
                    // Only collect function nodes as callers
                    const sourceAttrs = this.graph.getNodeAttributes(sourceNodeId);
                    if (sourceAttrs.kind !== "function")
                        continue;
                    visited.add(sourceNodeId);
                    const callEdge = {
                        id: edgeKey,
                        source: sourceNodeId,
                        target: currentNodeId,
                        type: edgeAttrs.type,
                        weight: edgeAttrs.weight,
                        filePath: edgeAttrs.filePath,
                    };
                    callers.push({
                        node: this.toGraphNode(sourceNodeId),
                        depth,
                        callEdge,
                    });
                    nextFrontier.push(sourceNodeId);
                    if (callers.length >= maxResults)
                        break;
                }
                if (callers.length >= maxResults)
                    break;
            }
            frontier = nextFrontier;
            if (callers.length >= maxResults || frontier.length === 0)
                break;
        }
        return {
            target: this.toGraphNode(targetNodeId),
            callers,
            truncated: callers.length >= maxResults,
        };
    }
    /**
     * Get the full call chain for a function as a directed subgraph.
     * Supports upstream (who calls me), downstream (who do I call), or both directions.
     * Returns a `GraphExport` (nodes + edges) suitable for visualization.
     */
    getCallChain(params) {
        const maxDepth = params.maxDepth ?? 5;
        const maxNodes = params.maxNodes ?? 200;
        // Find the root function node by name (and optionally filePath)
        const rootNodes = this.graph
            .nodes()
            .filter((nodeId) => {
            const attrs = this.graph.getNodeAttributes(nodeId);
            if (attrs.kind !== "function")
                return false;
            if (attrs.label !== params.functionName)
                return false;
            if (!params.filePath)
                return true;
            return normalizePath(attrs.filePath ?? "") === normalizePath(params.filePath);
        });
        if (rootNodes.length === 0) {
            return { root: null, chain: { nodes: [], edges: [] }, truncated: false };
        }
        const rootNodeId = rootNodes[0];
        const collectedNodes = new Set([rootNodeId]);
        const collectedEdgeKeys = new Set();
        // BFS helper for one direction
        const bfs = (startId, direction) => {
            const visited = new Set([startId]);
            let frontier = [startId];
            for (let depth = 0; depth < maxDepth; depth++) {
                if (params.signal?.aborted)
                    break;
                const nextFrontier = [];
                for (const currentId of frontier) {
                    if (params.signal?.aborted)
                        break;
                    const edges = direction === "upstream"
                        ? this.graph.inboundEdges(currentId)
                        : this.graph.outboundEdges(currentId);
                    for (const edgeKey of edges) {
                        if (params.signal?.aborted)
                            break;
                        const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                        if (edgeAttrs.type !== "calls")
                            continue;
                        const neighborId = direction === "upstream"
                            ? this.graph.source(edgeKey)
                            : this.graph.target(edgeKey);
                        collectedEdgeKeys.add(edgeKey);
                        if (!visited.has(neighborId)) {
                            visited.add(neighborId);
                            collectedNodes.add(neighborId);
                            nextFrontier.push(neighborId);
                        }
                        if (collectedNodes.size >= maxNodes)
                            break;
                    }
                    if (collectedNodes.size >= maxNodes)
                        break;
                }
                frontier = nextFrontier;
                if (collectedNodes.size >= maxNodes || frontier.length === 0)
                    break;
            }
        };
        if (params.direction === "upstream" || params.direction === "both") {
            bfs(rootNodeId, "upstream");
        }
        if (params.direction === "downstream" || params.direction === "both") {
            bfs(rootNodeId, "downstream");
        }
        // Build the subgraph from collected nodes and edges
        const nodes = [];
        for (const nodeId of collectedNodes) {
            if (this.graph.hasNode(nodeId)) {
                nodes.push(this.toGraphNode(nodeId));
            }
        }
        const edges = [];
        for (const edgeKey of collectedEdgeKeys) {
            const source = this.graph.source(edgeKey);
            const target = this.graph.target(edgeKey);
            // Only include edges where both endpoints are in the collected set
            if (collectedNodes.has(source) && collectedNodes.has(target)) {
                const attrs = this.graph.getEdgeAttributes(edgeKey);
                edges.push({
                    id: edgeKey,
                    source,
                    target,
                    type: attrs.type,
                    weight: attrs.weight,
                    filePath: attrs.filePath,
                });
            }
        }
        return {
            root: this.toGraphNode(rootNodeId),
            chain: { nodes, edges },
            truncated: collectedNodes.size >= maxNodes,
        };
    }
    /**
     * Compute the transitive closure of all files and symbols affected by a
     * change to the given file.  BFS on `reverseImports` (who imports this file?)
     * up to `maxDepth`.  Returns affected files, affected symbols, a risk score,
     * and suggested test files.
     */
    getImpactAnalysis(params) {
        const maxDepth = params.maxDepth ?? 3;
        const maxFiles = params.maxFiles ?? 100;
        const filePath = normalizePath(params.filePath);
        const affectedFiles = [];
        const seen = new Set([filePath]);
        let frontier = [filePath];
        for (let depth = 1; depth <= maxDepth; depth++) {
            if (params.signal?.aborted)
                break;
            const nextFrontier = [];
            const impactType = depth === 1 ? "direct" : "transitive";
            for (const current of frontier) {
                if (params.signal?.aborted)
                    break;
                const dependents = this.reverseImports.get(current) ?? new Set();
                for (const dep of dependents) {
                    if (params.signal?.aborted)
                        break;
                    if (seen.has(dep))
                        continue;
                    seen.add(dep);
                    affectedFiles.push({ filePath: dep, depth, impactType });
                    nextFrontier.push(dep);
                    if (affectedFiles.length >= maxFiles)
                        break;
                }
                if (affectedFiles.length >= maxFiles)
                    break;
            }
            frontier = nextFrontier;
            if (affectedFiles.length >= maxFiles || frontier.length === 0)
                break;
        }
        // Collect symbols defined in affected files
        const affectedSymbols = [];
        for (const af of affectedFiles) {
            if (params.signal?.aborted)
                break;
            const symbolIds = this.fileToSymbolIds.get(af.filePath) ?? new Set();
            for (const symbolNodeId of symbolIds) {
                if (this.graph.hasNode(symbolNodeId)) {
                    affectedSymbols.push({
                        node: this.toGraphNode(symbolNodeId),
                        impactType: af.impactType,
                    });
                }
            }
        }
        // Compute risk score: (affectedFiles * 0.3) + (affectedSymbols * 0.1), capped at 1.0
        const riskScore = Math.min(1.0, affectedFiles.length * 0.3 + affectedSymbols.length * 0.1);
        // Suggested test files: affected files matching test/spec patterns
        const testPattern = /(?:\/test[^/]*\/|\/tests[^/]*\/|[._-]test\.|[._-]spec\.)/i;
        const suggestedTestFiles = affectedFiles
            .map((af) => af.filePath)
            .filter((fp) => testPattern.test(fp));
        return {
            sourceFile: filePath,
            affectedFiles,
            affectedSymbols,
            riskScore,
            suggestedTestFiles,
            truncated: affectedFiles.length >= maxFiles,
        };
    }
    /**
     * Find functions and classes with zero inbound `calls`/`instantiates` edges (potential dead code).
     * Supports filtering by file pattern, language, and symbol kind.
     * Excludes entry points heuristically: functions named `main`, `bootstrap`, `__init__`,
     * and files matching test directory patterns (e.g. any path containing a test segment).
     */
    getDeadCode(params) {
        const maxResults = params.maxResults ?? 100;
        // Entry-point names to exclude heuristically
        const entryPointNames = new Set(["main", "bootstrap", "__init__"]);
        // Test file pattern: files under **/test*/** or matching **/*test* or **/*spec*
        const isTestFile = (fp) => {
            const normalized = fp.replace(/\\/g, "/");
            return (/\/test[^/]*\//.test(normalized) ||
                /\/tests\//.test(normalized) ||
                /[/].*test[^/]*\.[^/]+$/.test(normalized) ||
                /[/].*spec[^/]*\.[^/]+$/.test(normalized));
        };
        // Simple glob matcher for filePattern (supports * and ** wildcards)
        const matchesFilePattern = (fp, pattern) => {
            // Convert glob to regex
            const escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "{{GLOBSTAR}}")
                .replace(/\*/g, "[^/]*")
                .replace(/\{\{GLOBSTAR\}\}/g, ".*");
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(fp);
        };
        const deadSymbols = [];
        let totalScanned = 0;
        const allNodes = this.graph.nodes();
        for (const nodeId of allNodes) {
            if (params.signal?.aborted)
                break;
            const attrs = this.graph.getNodeAttributes(nodeId);
            // Only consider function and class nodes
            if (attrs.kind !== "function" && attrs.kind !== "class")
                continue;
            // Apply kind filter
            if (params.kind && attrs.kind !== params.kind)
                continue;
            // Apply language filter
            if (params.language && attrs.language !== params.language)
                continue;
            // Apply file pattern filter
            const filePath = attrs.filePath ?? "";
            if (params.filePattern && !matchesFilePattern(filePath, params.filePattern))
                continue;
            totalScanned++;
            // Exclude entry points
            if (entryPointNames.has(attrs.label))
                continue;
            // Exclude test files
            if (filePath && isTestFile(filePath))
                continue;
            // Check for inbound `calls` or `instantiates` edges
            const inboundEdges = this.graph.inboundEdges(nodeId);
            let hasInboundCallOrInstantiation = false;
            for (const edgeKey of inboundEdges) {
                const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                if (edgeAttrs.type === "calls" || edgeAttrs.type === "instantiates") {
                    hasInboundCallOrInstantiation = true;
                    break;
                }
            }
            if (!hasInboundCallOrInstantiation) {
                deadSymbols.push({
                    node: this.toGraphNode(nodeId),
                    definedIn: filePath,
                });
                if (deadSymbols.length >= maxResults)
                    break;
            }
        }
        return {
            deadSymbols,
            totalScanned,
            truncated: deadSymbols.length >= maxResults,
        };
    }
    getHotspots(params) {
        const topN = Math.min(params.topN ?? 20, 100);
        // Simple glob matcher for filePattern (same as getDeadCode)
        const matchesFilePattern = (fp, pattern) => {
            const escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "{{GLOBSTAR}}")
                .replace(/\*/g, "[^/]*")
                .replace(/\{\{GLOBSTAR\}\}/g, ".*");
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(fp);
        };
        const candidates = [];
        let totalSymbolsScanned = 0;
        const allNodes = this.graph.nodes();
        for (const nodeId of allNodes) {
            if (params.signal?.aborted)
                break;
            const attrs = this.graph.getNodeAttributes(nodeId);
            // Skip file and module nodes — only consider symbols
            if (attrs.kind === "file" || attrs.kind === "module")
                continue;
            // Apply kind filter
            if (params.kind && attrs.kind !== params.kind)
                continue;
            // Apply language filter
            if (params.language && attrs.language !== params.language)
                continue;
            // Apply file pattern filter
            const filePath = attrs.filePath ?? "";
            if (params.filePattern && !matchesFilePattern(filePath, params.filePattern))
                continue;
            totalSymbolsScanned++;
            // Compute fanIn: count of inbound edges (optionally filtered by includeEdgeTypes)
            const inboundEdges = this.graph.inboundEdges(nodeId);
            let fanIn = 0;
            const edgeBreakdown = {};
            for (const edgeKey of inboundEdges) {
                const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                if (params.includeEdgeTypes && !params.includeEdgeTypes.includes(edgeAttrs.type)) {
                    continue;
                }
                fanIn++;
                edgeBreakdown[edgeAttrs.type] = (edgeBreakdown[edgeAttrs.type] ?? 0) + 1;
            }
            // Compute fanOut: count of outbound edges
            const outboundEdges = this.graph.outboundEdges(nodeId);
            const fanOut = outboundEdges.length;
            candidates.push({
                node: this.toGraphNode(nodeId),
                fanIn,
                fanOut,
                edgeBreakdown,
            });
        }
        // Sort by fanIn descending
        candidates.sort((a, b) => b.fanIn - a.fanIn);
        // Take top N
        const hotspots = candidates.slice(0, topN);
        return {
            hotspots,
            totalSymbolsScanned,
            truncated: candidates.length > topN,
        };
    }
    getModuleCoupling(params) {
        const maxDepth = Math.min(params.maxDepth ?? 2, 5);
        const normalizedA = normalizePath(params.filePathA);
        const normalizedB = normalizePath(params.filePathB);
        const fileNodeA = this.fileNodeId(normalizedA);
        const fileNodeB = this.fileNodeId(normalizedB);
        // Validate both file paths exist in the graph
        if (!this.graph.hasNode(fileNodeA)) {
            throw new NotFoundError(`File not found in graph: ${params.filePathA}`);
        }
        if (!this.graph.hasNode(fileNodeB)) {
            throw new NotFoundError(`File not found in graph: ${params.filePathB}`);
        }
        // Collect symbol node IDs belonging to each file
        const symbolsA = this.fileToSymbolIds.get(normalizedA) ?? new Set();
        const symbolsB = this.fileToSymbolIds.get(normalizedB) ?? new Set();
        // All nodes belonging to file A (file node + symbols)
        const nodesA = new Set([fileNodeA, ...symbolsA]);
        const nodesB = new Set([fileNodeB, ...symbolsB]);
        // 1. sharedImports: Count of files imported by both A and B
        const importsA = this.importsByFile.get(normalizedA) ?? new Set();
        const importsB = this.importsByFile.get(normalizedB) ?? new Set();
        let sharedImports = 0;
        for (const imp of importsA) {
            if (params.signal?.aborted)
                break;
            if (importsB.has(imp))
                sharedImports++;
        }
        // 2. sharedSymbols: Symbols defined in A that are referenced by B + symbols defined in B that are referenced by A
        const referenceEdgeTypes = new Set(["calls", "reads", "writes", "references"]);
        let sharedSymbols = 0;
        // Symbols in A referenced by B (check inbound edges from B's nodes to A's symbols)
        for (const symA of symbolsA) {
            if (params.signal?.aborted)
                break;
            const inboundEdges = this.graph.inboundEdges(symA);
            let referencedByB = false;
            for (const edgeKey of inboundEdges) {
                const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                if (!referenceEdgeTypes.has(edgeAttrs.type))
                    continue;
                const sourceNode = this.graph.source(edgeKey);
                if (nodesB.has(sourceNode)) {
                    referencedByB = true;
                    break;
                }
            }
            if (referencedByB)
                sharedSymbols++;
        }
        // Symbols in B referenced by A (check inbound edges from A's nodes to B's symbols)
        for (const symB of symbolsB) {
            if (params.signal?.aborted)
                break;
            const inboundEdges = this.graph.inboundEdges(symB);
            let referencedByA = false;
            for (const edgeKey of inboundEdges) {
                const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                if (!referenceEdgeTypes.has(edgeAttrs.type))
                    continue;
                const sourceNode = this.graph.source(edgeKey);
                if (nodesA.has(sourceNode)) {
                    referencedByA = true;
                    break;
                }
            }
            if (referencedByA)
                sharedSymbols++;
        }
        // 3. directEdges: Count of direct edges between nodes belonging to file A and nodes belonging to file B (any edge type)
        let directEdges = 0;
        for (const nodeA of nodesA) {
            if (params.signal?.aborted)
                break;
            // Outbound from A to B
            const outEdges = this.graph.outboundEdges(nodeA);
            for (const edgeKey of outEdges) {
                const target = this.graph.target(edgeKey);
                if (nodesB.has(target))
                    directEdges++;
            }
            // Inbound from B to A
            const inEdges = this.graph.inboundEdges(nodeA);
            for (const edgeKey of inEdges) {
                const source = this.graph.source(edgeKey);
                if (nodesB.has(source))
                    directEdges++;
            }
        }
        // 4. transitiveEdges: BFS from A's nodes within maxDepth, count edges that terminate at B's nodes
        let transitiveEdges = 0;
        const visited = new Set();
        let frontier = new Set(nodesA);
        for (const n of nodesA)
            visited.add(n);
        for (let depth = 1; depth <= maxDepth; depth++) {
            if (params.signal?.aborted)
                break;
            const nextFrontier = new Set();
            for (const currentNode of frontier) {
                if (params.signal?.aborted)
                    break;
                const outEdges = this.graph.outboundEdges(currentNode);
                for (const edgeKey of outEdges) {
                    const target = this.graph.target(edgeKey);
                    if (nodesB.has(target)) {
                        transitiveEdges++;
                    }
                    if (!visited.has(target)) {
                        visited.add(target);
                        nextFrontier.add(target);
                    }
                }
            }
            frontier = nextFrontier;
            if (frontier.size === 0)
                break;
        }
        // Compute total edges for normalization
        let totalEdgesA = 0;
        for (const nodeA of nodesA) {
            totalEdgesA += this.graph.outboundEdges(nodeA).length + this.graph.inboundEdges(nodeA).length;
        }
        let totalEdgesB = 0;
        for (const nodeB of nodesB) {
            totalEdgesB += this.graph.outboundEdges(nodeB).length + this.graph.inboundEdges(nodeB).length;
        }
        const normalizationFactor = Math.max(1, totalEdgesA + totalEdgesB);
        const rawScore = (sharedImports * 0.2 + sharedSymbols * 0.3 + directEdges * 0.3 + transitiveEdges * 0.2) / normalizationFactor;
        const couplingScore = Math.min(1.0, rawScore);
        return {
            filePathA: params.filePathA,
            filePathB: params.filePathB,
            sharedImports,
            sharedSymbols,
            directEdges,
            transitiveEdges,
            couplingScore,
            truncated: false,
        };
    }
    /**
     * Get the class hierarchy (ancestors and/or descendants) for a given class.
     * Traverses `inherits` edges in the graph:
     *   - Ancestors: follow outgoing `inherits` edges (child → parent)
     *   - Descendants: follow incoming `inherits` edges (child → this class)
     */
    getClassHierarchy(params) {
        const direction = params.direction ?? "both";
        const maxDepth = Math.min(params.maxDepth ?? 5, 10);
        // Find the target class node by name (and optionally filePath)
        const targetNodes = this.graph
            .nodes()
            .filter((nodeId) => {
            const attrs = this.graph.getNodeAttributes(nodeId);
            if (attrs.kind !== "class")
                return false;
            if (attrs.label !== params.className)
                return false;
            if (!params.filePath)
                return true;
            return normalizePath(attrs.filePath ?? "") === normalizePath(params.filePath);
        });
        if (targetNodes.length === 0) {
            throw new NotFoundError(`Class not found in graph: ${params.className}`);
        }
        const targetNodeId = targetNodes[0];
        const ancestors = [];
        const descendants = [];
        const allNodeIds = new Set([targetNodeId]);
        // Traverse ancestors: follow outgoing `inherits` edges (child → parent)
        if (direction === "ancestors" || direction === "both") {
            const visited = new Set([targetNodeId]);
            let frontier = [targetNodeId];
            for (let depth = 1; depth <= maxDepth; depth++) {
                if (params.signal?.aborted)
                    break;
                const nextFrontier = [];
                for (const currentNodeId of frontier) {
                    if (params.signal?.aborted)
                        break;
                    const outboundEdges = this.graph.outboundEdges(currentNodeId);
                    for (const edgeKey of outboundEdges) {
                        if (params.signal?.aborted)
                            break;
                        const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                        if (edgeAttrs.type !== "inherits")
                            continue;
                        const targetId = this.graph.target(edgeKey);
                        if (visited.has(targetId))
                            continue;
                        visited.add(targetId);
                        allNodeIds.add(targetId);
                        ancestors.push({
                            node: this.toGraphNode(targetId),
                            depth,
                        });
                        nextFrontier.push(targetId);
                    }
                }
                frontier = nextFrontier;
                if (frontier.length === 0)
                    break;
            }
        }
        // Traverse descendants: follow incoming `inherits` edges (child → this class)
        if (direction === "descendants" || direction === "both") {
            const visited = new Set([targetNodeId]);
            let frontier = [targetNodeId];
            for (let depth = 1; depth <= maxDepth; depth++) {
                if (params.signal?.aborted)
                    break;
                const nextFrontier = [];
                for (const currentNodeId of frontier) {
                    if (params.signal?.aborted)
                        break;
                    const inboundEdges = this.graph.inboundEdges(currentNodeId);
                    for (const edgeKey of inboundEdges) {
                        if (params.signal?.aborted)
                            break;
                        const edgeAttrs = this.graph.getEdgeAttributes(edgeKey);
                        if (edgeAttrs.type !== "inherits")
                            continue;
                        const sourceId = this.graph.source(edgeKey);
                        if (visited.has(sourceId))
                            continue;
                        visited.add(sourceId);
                        allNodeIds.add(sourceId);
                        descendants.push({
                            node: this.toGraphNode(sourceId),
                            depth,
                        });
                        nextFrontier.push(sourceId);
                    }
                }
                frontier = nextFrontier;
                if (frontier.length === 0)
                    break;
            }
        }
        const hierarchy = this.exportSubgraph(allNodeIds, ["inherits"]);
        return {
            root: this.toGraphNode(targetNodeId),
            ancestors,
            descendants,
            hierarchy,
            truncated: false,
        };
    }
    searchSymbols(params) {
        const maxResults = Math.min(params.maxResults ?? 50, 200);
        const useRegex = params.useRegex ?? false;
        // Simple glob matcher for filePattern (same as getDeadCode / getHotspots)
        const matchesFilePattern = (fp, pattern) => {
            const escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "{{GLOBSTAR}}")
                .replace(/\*/g, "[^/]*")
                .replace(/\{\{GLOBSTAR\}\}/g, ".*");
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(fp);
        };
        // If useRegex, compile the regex upfront (case-insensitive)
        let compiledRegex = null;
        if (useRegex) {
            try {
                compiledRegex = new RegExp(params.query, "i");
            }
            catch {
                throw new InvalidParamsError(`Invalid regex pattern: ${params.query}`);
            }
        }
        const queryLower = params.query.toLowerCase();
        const candidates = [];
        const allNodes = this.graph.nodes();
        for (const nodeId of allNodes) {
            if (params.signal?.aborted)
                break;
            const attrs = this.graph.getNodeAttributes(nodeId);
            // Skip file nodes — only consider symbols
            if (attrs.kind === "file")
                continue;
            // Apply kind filter
            if (params.kind && attrs.kind !== params.kind)
                continue;
            // Apply language filter
            if (params.language && attrs.language !== params.language)
                continue;
            // Apply file pattern filter
            const filePath = attrs.filePath ?? "";
            if (params.filePattern && !matchesFilePattern(filePath, params.filePattern))
                continue;
            const label = attrs.label ?? "";
            const qualifiedName = attrs.qualifiedName ?? "";
            if (useRegex && compiledRegex) {
                // Regex mode: test against label and qualifiedName
                const labelMatch = compiledRegex.test(label);
                const qnMatch = compiledRegex.test(qualifiedName);
                if (labelMatch) {
                    candidates.push({
                        node: this.toGraphNode(nodeId),
                        matchScore: 0.8,
                        matchedField: "label",
                    });
                }
                else if (qnMatch) {
                    candidates.push({
                        node: this.toGraphNode(nodeId),
                        matchScore: 0.6,
                        matchedField: "qualifiedName",
                    });
                }
            }
            else {
                // Fuzzy substring matching
                let matchScore = 0;
                let matchedField = "label";
                if (label === params.query) {
                    // Exact match on label
                    matchScore = 1.0;
                    matchedField = "label";
                }
                else if (label.toLowerCase() === queryLower) {
                    // Case-insensitive exact match on label
                    matchScore = 0.9;
                    matchedField = "label";
                }
                else if (label.toLowerCase().includes(queryLower)) {
                    // Substring match on label
                    matchScore = 0.7;
                    matchedField = "label";
                }
                else if (qualifiedName.toLowerCase().includes(queryLower)) {
                    // Substring match on qualifiedName
                    matchScore = 0.5;
                    matchedField = "qualifiedName";
                }
                if (matchScore > 0) {
                    candidates.push({
                        node: this.toGraphNode(nodeId),
                        matchScore,
                        matchedField,
                    });
                }
            }
        }
        const totalMatches = candidates.length;
        // Sort by matchScore descending, then alphabetically by label for ties
        candidates.sort((a, b) => {
            if (b.matchScore !== a.matchScore)
                return b.matchScore - a.matchScore;
            return a.node.label.localeCompare(b.node.label);
        });
        // Take top maxResults
        const results = candidates.slice(0, maxResults);
        return {
            results,
            totalMatches,
            truncated: totalMatches > maxResults,
        };
    }
    /**
     * Compute per-symbol complexity metrics: fan-in (inbound edges), fan-out
     * (outbound edges), and max call-chain depth via BFS (capped at 10).
     * `totalComplexity = fanIn + fanOut + maxDepth`.
     * Supports filtering by filePath, kind, language, and sorting.
     */
    getComplexityMetrics(params) {
        const maxResults = Math.min(params.maxResults ?? 100, 500);
        const sortBy = params.sortBy ?? "total";
        // Simple glob matcher (same pattern used by getDeadCode / getHotspots)
        const matchesFilePattern = (fp, pattern) => {
            const escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "{{GLOBSTAR}}")
                .replace(/\*/g, "[^/]*")
                .replace(/\{\{GLOBSTAR\}\}/g, ".*");
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(fp);
        };
        const candidates = [];
        let totalScanned = 0;
        const allNodes = this.graph.nodes();
        for (const nodeId of allNodes) {
            if (params.signal?.aborted)
                break;
            const attrs = this.graph.getNodeAttributes(nodeId);
            // Skip module and external nodes — only consider file, function, class
            if (attrs.kind === "module" || attrs.kind === "external" || attrs.kind === "variable")
                continue;
            // Apply kind filter
            if (params.kind && attrs.kind !== params.kind)
                continue;
            // Apply language filter
            if (params.language && attrs.language !== params.language)
                continue;
            // Apply filePath filter (glob match)
            const filePath = attrs.filePath ?? "";
            if (params.filePath && !matchesFilePattern(filePath, params.filePath))
                continue;
            totalScanned++;
            // Compute fanIn: count of inbound edges
            const fanIn = this.graph.inboundEdges(nodeId).length;
            // Compute fanOut: count of outbound edges
            const fanOut = this.graph.outboundEdges(nodeId).length;
            // Compute maxDepth via BFS on outbound edges (capped at 10)
            const MAX_BFS_DEPTH = 10;
            let maxDepth = 0;
            const visited = new Set();
            visited.add(nodeId);
            let frontier = [nodeId];
            for (let depth = 1; depth <= MAX_BFS_DEPTH && frontier.length > 0; depth++) {
                if (params.signal?.aborted)
                    break;
                const nextFrontier = [];
                for (const current of frontier) {
                    const outEdges = this.graph.outboundEdges(current);
                    for (const edgeKey of outEdges) {
                        const target = this.graph.target(edgeKey);
                        if (!visited.has(target)) {
                            visited.add(target);
                            nextFrontier.push(target);
                            maxDepth = depth;
                        }
                    }
                }
                frontier = nextFrontier;
            }
            const totalComplexity = fanIn + fanOut + maxDepth;
            candidates.push({
                node: this.toGraphNode(nodeId),
                fanIn,
                fanOut,
                maxDepth,
                totalComplexity,
            });
        }
        // Sort by the requested field, descending
        const sortFn = (a, b) => {
            switch (sortBy) {
                case "fan_in": return b.fanIn - a.fanIn;
                case "fan_out": return b.fanOut - a.fanOut;
                case "depth": return b.maxDepth - a.maxDepth;
                case "total":
                default: return b.totalComplexity - a.totalComplexity;
            }
        };
        candidates.sort(sortFn);
        const metrics = candidates.slice(0, maxResults);
        return {
            metrics,
            totalScanned,
            truncated: candidates.length > maxResults,
        };
    }
    /**
     * Detect circular import dependencies in the codebase using iterative DFS
     * on the file-level import graph (via the `importsByFile` map).
     * Supports filtering by file pattern and language, and respects maxCycles
     * and maxDepth for early termination.
     */
    getCircularDependencies(params) {
        const maxCycles = params.maxCycles ?? 50;
        const maxDepth = params.maxDepth ?? 20;
        // Simple glob matcher (same pattern used by getDeadCode / getHotspots)
        const matchesFilePattern = (fp, pattern) => {
            const escaped = pattern
                .replace(/[.+^${}()|[\]\\]/g, "\\$&")
                .replace(/\*\*/g, "{{GLOBSTAR}}")
                .replace(/\*/g, "[^/]*")
                .replace(/\{\{GLOBSTAR\}\}/g, ".*");
            const regex = new RegExp(`^${escaped}$`);
            return regex.test(fp);
        };
        // Collect all indexed file paths that match filters.
        // Use fileHashes keys (all indexed files that have been fully parsed).
        const candidateFiles = [];
        // Helper to infer language from file extension (more reliable than graph node
        // attributes, which can be overwritten by import-target creation with wrong language)
        const inferLanguage = (fp) => {
            if (fp.endsWith(".py"))
                return "python";
            if (fp.endsWith(".ts") || fp.endsWith(".tsx") || fp.endsWith(".js") || fp.endsWith(".jsx"))
                return "typescript";
            return undefined;
        };
        for (const filePath of this.fileHashes.keys()) {
            if (params.signal?.aborted)
                break;
            // Apply language filter via file extension
            if (params.language) {
                const lang = inferLanguage(filePath);
                if (lang !== params.language)
                    continue;
            }
            // Apply file pattern filter
            if (params.filePattern && !matchesFilePattern(filePath, params.filePattern))
                continue;
            candidateFiles.push(filePath);
        }
        const totalFilesScanned = candidateFiles.length;
        const cycles = [];
        // Build adjacency list from importsByFile, restricted to candidate files
        const candidateSet = new Set(candidateFiles);
        const adjacency = new Map();
        for (const filePath of candidateFiles) {
            const imports = this.importsByFile.get(filePath) ?? new Set();
            const neighbors = [];
            for (const imp of imports) {
                if (candidateSet.has(imp)) {
                    neighbors.push(imp);
                }
            }
            adjacency.set(filePath, neighbors);
        }
        // Iterative DFS-based cycle detection using coloring (white/gray/black)
        const WHITE = 0;
        const GRAY = 1;
        const BLACK = 2;
        const color = new Map();
        for (const fp of candidateFiles) {
            color.set(fp, WHITE);
        }
        for (const startFile of candidateFiles) {
            if (params.signal?.aborted)
                break;
            if (cycles.length >= maxCycles)
                break;
            if (color.get(startFile) !== WHITE)
                continue;
            // Iterative DFS with explicit stack tracking the current path
            const stack = [];
            color.set(startFile, GRAY);
            stack.push({ filePath: startFile, neighborIdx: 0, pathStack: [startFile] });
            while (stack.length > 0) {
                if (params.signal?.aborted)
                    break;
                if (cycles.length >= maxCycles)
                    break;
                const top = stack[stack.length - 1];
                const neighbors = adjacency.get(top.filePath) ?? [];
                if (top.neighborIdx >= neighbors.length || top.pathStack.length > maxDepth) {
                    // Done with this node
                    color.set(top.filePath, BLACK);
                    stack.pop();
                    continue;
                }
                const neighbor = neighbors[top.neighborIdx];
                top.neighborIdx++;
                const neighborColor = color.get(neighbor);
                if (neighborColor === GRAY) {
                    // Found a cycle — reconstruct from the path stack
                    const startIdx = top.pathStack.indexOf(neighbor);
                    if (startIdx !== -1) {
                        const chain = top.pathStack.slice(startIdx);
                        cycles.push({ chain, length: chain.length });
                    }
                    if (cycles.length >= maxCycles)
                        break;
                }
                else if (neighborColor === WHITE) {
                    color.set(neighbor, GRAY);
                    stack.push({
                        filePath: neighbor,
                        neighborIdx: 0,
                        pathStack: [...top.pathStack, neighbor],
                    });
                }
                // BLACK nodes are already fully processed — skip
            }
        }
        return {
            cycles,
            totalFilesScanned,
            truncated: cycles.length >= maxCycles,
        };
    }
    /**
     * Given a set of changed file paths (e.g. from a git diff), predict which
     * tests should run and which areas of the codebase are highest risk.
     *
     * Builds on the existing impact-analysis traversal logic but accepts
     * multiple files and aggregates risk scores. Cross-references affected
     * symbols with the top-20 hotspots to surface high-fan-in symbols in the
     * blast radius.
     */
    getChangeRisk(params) {
        const maxDepth = params.maxDepth ?? 3;
        const maxFiles = params.maxFiles ?? 100;
        if (!params.changedFiles || params.changedFiles.length === 0) {
            throw new InvalidParamsError("changed_files must contain at least one file path");
        }
        const normalizedChanged = params.changedFiles.map(normalizePath);
        // Deduplicated map: filePath → { depth, impactType, sources }
        const affectedMap = new Map();
        const allSuggestedTests = new Set();
        let riskScoreSum = 0;
        let truncated = false;
        for (const changedFile of normalizedChanged) {
            if (params.signal?.aborted)
                break;
            // Skip files that don't exist in the graph (graceful skip)
            if (!this.fileHashes.has(changedFile))
                continue;
            // Reuse the same BFS traversal logic as getImpactAnalysis
            const seen = new Set([changedFile]);
            let frontier = [changedFile];
            const localAffected = [];
            for (let depth = 1; depth <= maxDepth; depth++) {
                if (params.signal?.aborted)
                    break;
                const nextFrontier = [];
                const impactType = depth === 1 ? "direct" : "transitive";
                for (const current of frontier) {
                    if (params.signal?.aborted)
                        break;
                    const dependents = this.reverseImports.get(current) ?? new Set();
                    for (const dep of dependents) {
                        if (params.signal?.aborted)
                            break;
                        if (seen.has(dep))
                            continue;
                        seen.add(dep);
                        localAffected.push({ filePath: dep, depth, impactType });
                        nextFrontier.push(dep);
                    }
                }
                frontier = nextFrontier;
                if (frontier.length === 0)
                    break;
            }
            // Collect symbols for risk score
            let localSymbolCount = 0;
            for (const af of localAffected) {
                const symbolIds = this.fileToSymbolIds.get(af.filePath) ?? new Set();
                localSymbolCount += symbolIds.size;
            }
            // Per-file risk score (same formula as getImpactAnalysis)
            const localRisk = Math.min(1.0, localAffected.length * 0.3 + localSymbolCount * 0.1);
            riskScoreSum += localRisk;
            // Merge into global affected map, keeping the shallowest depth
            for (const af of localAffected) {
                const existing = affectedMap.get(af.filePath);
                if (!existing) {
                    affectedMap.set(af.filePath, {
                        depth: af.depth,
                        impactType: af.impactType,
                        sources: new Set([changedFile]),
                    });
                }
                else {
                    existing.sources.add(changedFile);
                    if (af.depth < existing.depth) {
                        existing.depth = af.depth;
                        existing.impactType = af.impactType;
                    }
                }
            }
            // Collect test files
            const testPattern = /(?:\/test[^/]*\/|\/tests[^/]*\/|[._-]test\.|[._-]spec\.)/i;
            for (const af of localAffected) {
                if (testPattern.test(af.filePath)) {
                    allSuggestedTests.add(af.filePath);
                }
            }
        }
        // Build affectedFiles array, respecting maxFiles
        const affectedEntries = [...affectedMap.entries()];
        // Sort by depth ascending, then alphabetically for determinism
        affectedEntries.sort((a, b) => a[1].depth - b[1].depth || a[0].localeCompare(b[0]));
        if (affectedEntries.length > maxFiles) {
            truncated = true;
        }
        const limitedEntries = affectedEntries.slice(0, maxFiles);
        // Compute riskContribution per affected file: how many changed files caused it
        const affectedFiles = limitedEntries.map(([filePath, info]) => ({
            filePath,
            depth: info.depth,
            impactType: info.impactType,
            riskContribution: info.sources.size / normalizedChanged.length,
        }));
        // Aggregate risk score: average of per-file risk scores, capped at 1.0
        const validChangedCount = normalizedChanged.filter((f) => this.fileHashes.has(f)).length;
        const aggregateRiskScore = validChangedCount > 0
            ? Math.min(1.0, riskScoreSum / validChangedCount)
            : 0;
        // Cross-reference with top-20 hotspots
        const hotspotsResult = this.getHotspots({ topN: 20 });
        const affectedSymbolIds = new Set();
        for (const [filePath] of limitedEntries) {
            const symbolIds = this.fileToSymbolIds.get(filePath) ?? new Set();
            for (const sid of symbolIds) {
                affectedSymbolIds.add(sid);
            }
        }
        // Also include symbols from the changed files themselves
        for (const changedFile of normalizedChanged) {
            const symbolIds = this.fileToSymbolIds.get(changedFile) ?? new Set();
            for (const sid of symbolIds) {
                affectedSymbolIds.add(sid);
            }
        }
        const hotspotOverlap = [];
        for (const hs of hotspotsResult.hotspots) {
            const hsNodeId = hs.node.id;
            if (affectedSymbolIds.has(hsNodeId)) {
                hotspotOverlap.push({ node: hs.node, fanIn: hs.fanIn });
            }
        }
        return {
            changedFiles: normalizedChanged,
            aggregateRiskScore,
            affectedFiles,
            suggestedTestFiles: [...allSuggestedTests],
            hotspotOverlap,
            truncated,
        };
    }
    /**
     * Returns a copy of the current file path to content hash map.
     */
    getFileHashes() {
        return Object.fromEntries(this.fileHashes);
    }
    /**
     * Export the raw graphology graph for snapshot serialization.
     */
    exportGraph() {
        return this.graph.export();
    }
    /**
     * Import a previously exported graphology graph and rebuild internal lookup maps.
     * Used to restore state from a disk snapshot.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    importFromSnapshot(graphologyExport, fileHashes) {
        this.graph.import(graphologyExport);
        // Rebuild fileHashes
        for (const [fp, hash] of Object.entries(fileHashes)) {
            this.fileHashes.set(fp, hash);
        }
        // Rebuild internal lookup maps from the imported graph
        this.graph.forEachNode((nodeId, attrs) => {
            // Rebuild symbolByQualifiedName for symbol nodes
            if (nodeId.startsWith("symbol:") && attrs.qualifiedName) {
                this.symbolByQualifiedName.set(attrs.qualifiedName, nodeId);
            }
            // Rebuild fileToSymbolIds: file nodes own symbol nodes via "defines" edges
            if (attrs.kind === "file" && attrs.filePath) {
                const fp = normalizePath(attrs.filePath);
                const symbolIds = new Set();
                this.graph.forEachOutEdge(nodeId, (edge, edgeAttrs, _src, target) => {
                    if (edgeAttrs.type === "defines" || target.startsWith("symbol:")) {
                        // Collect all symbol nodes connected from this file
                    }
                });
                // Collect symbols defined by this file by checking outbound edges
                this.graph.forEachOutEdge(nodeId, (_edge, _edgeAttrs, _src, target) => {
                    if (target.startsWith("symbol:") && !target.startsWith("symbol:external:")) {
                        symbolIds.add(target);
                    }
                });
                if (symbolIds.size > 0) {
                    this.fileToSymbolIds.set(fp, symbolIds);
                }
            }
        });
        // Rebuild importsByFile and reverseImports from "imports" edges
        this.graph.forEachEdge((edge, attrs, source, target) => {
            if (attrs.type === "imports") {
                const sourceAttrs = this.graph.getNodeAttributes(source);
                const targetAttrs = this.graph.getNodeAttributes(target);
                if (sourceAttrs.filePath && targetAttrs.filePath) {
                    const srcFp = normalizePath(sourceAttrs.filePath);
                    const tgtFp = normalizePath(targetAttrs.filePath);
                    const imports = this.importsByFile.get(srcFp) ?? new Set();
                    imports.add(tgtFp);
                    this.importsByFile.set(srcFp, imports);
                    const dependents = this.reverseImports.get(tgtFp) ?? new Set();
                    dependents.add(srcFp);
                    this.reverseImports.set(tgtFp, dependents);
                }
            }
        });
    }
    removeFileData(filePath, removeFileHash) {
        const normalizedPath = normalizePath(filePath);
        const fileNodeId = this.fileNodeId(normalizedPath);
        const symbols = this.fileToSymbolIds.get(normalizedPath) ?? new Set();
        for (const symbolNodeId of symbols) {
            if (this.graph.hasNode(symbolNodeId)) {
                const attrs = this.graph.getNodeAttributes(symbolNodeId);
                if (attrs.qualifiedName) {
                    this.symbolByQualifiedName.delete(attrs.qualifiedName);
                }
                this.graph.dropNode(symbolNodeId);
            }
        }
        this.fileToSymbolIds.delete(normalizedPath);
        const previousImports = this.importsByFile.get(normalizedPath) ?? new Set();
        for (const importedFile of previousImports) {
            const dependents = this.reverseImports.get(importedFile);
            if (!dependents) {
                continue;
            }
            dependents.delete(normalizedPath);
            if (dependents.size === 0) {
                this.reverseImports.delete(importedFile);
            }
        }
        this.importsByFile.delete(normalizedPath);
        if (this.graph.hasNode(fileNodeId)) {
            this.graph.dropNode(fileNodeId);
        }
        if (removeFileHash) {
            this.fileHashes.delete(normalizedPath);
        }
    }
    upsertSymbolNode(nodeId, symbol) {
        this.upsertNode(nodeId, {
            label: symbol.name,
            kind: symbol.kind,
            language: symbol.language,
            filePath: symbol.filePath,
            qualifiedName: symbol.qualifiedName,
            rangeStart: symbol.rangeStart,
            rangeEnd: symbol.rangeEnd,
        });
    }
    upsertNode(nodeId, attrs) {
        if (this.graph.hasNode(nodeId)) {
            this.graph.mergeNodeAttributes(nodeId, attrs);
        }
        else {
            this.graph.addNode(nodeId, attrs);
        }
    }
    exportSubgraph(nodeSet, includeEdgeTypes) {
        const nodes = [];
        for (const nodeId of nodeSet) {
            if (this.graph.hasNode(nodeId)) {
                nodes.push(this.toGraphNode(nodeId));
            }
        }
        const edges = [];
        for (const edgeKey of this.graph.edges()) {
            const source = this.graph.source(edgeKey);
            const target = this.graph.target(edgeKey);
            if (!nodeSet.has(source) || !nodeSet.has(target)) {
                continue;
            }
            const attrs = this.graph.getEdgeAttributes(edgeKey);
            if (includeEdgeTypes && !includeEdgeTypes.includes(attrs.type)) {
                continue;
            }
            edges.push({
                id: edgeKey,
                source,
                target,
                type: attrs.type,
                weight: attrs.weight,
                filePath: attrs.filePath,
            });
        }
        return { nodes, edges };
    }
    toGraphNode(nodeId) {
        const attrs = this.graph.getNodeAttributes(nodeId);
        return {
            id: nodeId,
            label: attrs.label,
            kind: attrs.kind,
            language: attrs.language,
            filePath: attrs.filePath,
            qualifiedName: attrs.qualifiedName,
            rangeStart: attrs.rangeStart,
            rangeEnd: attrs.rangeEnd,
        };
    }
    fileNodeId(filePath) {
        return `file:${normalizePath(filePath)}`;
    }
    symbolNodeId(symbolId) {
        return symbolId.startsWith("symbol:") ? symbolId : `symbol:${symbolId}`;
    }
    externalSymbolNodeId(qualifiedName) {
        return `symbol:external:${qualifiedName}`;
    }
}
//# sourceMappingURL=graph-store.js.map