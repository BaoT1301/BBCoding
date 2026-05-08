import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { parsePythonFile } from "../parsers/python-parser.js";
import { parseTypeScriptFile } from "../parsers/typescript-parser.js";
import { detectLanguage } from "../parsers/common.js";
const PYTHON_PATTERNS = ["backend/**/*.py"];
const TYPESCRIPT_PATTERNS = ["frontend/src/**/*.{ts,tsx,js,jsx}", "services/**/*.{ts,tsx,js,jsx}"];
const TS_IMPORT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".d.ts"];
function normalize(filePath) {
    return filePath.split(path.sep).join("/");
}
export class IncrementalIndexer {
    workspaceRoot;
    graphStore;
    fileExistsCache = new Map();
    constructor(workspaceRoot, graphStore) {
        this.workspaceRoot = normalize(workspaceRoot);
        this.graphStore = graphStore;
    }
    async buildInitialGraph(onProgress) {
        const files = await fg([...PYTHON_PATTERNS, ...TYPESCRIPT_PATTERNS], {
            cwd: this.workspaceRoot,
            absolute: true,
            onlyFiles: true,
            ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/venv/**", "**/__pycache__/**"],
        });
        let count = 0;
        for (const filePath of files) {
            const ok = await this.reindexSingleFile(filePath);
            if (ok) {
                count += 1;
            }
            onProgress?.(count, files.length);
        }
        return { indexedFiles: count };
    }
    async buildDeltaGraph(snapshotFileHashes) {
        const files = await fg([...PYTHON_PATTERNS, ...TYPESCRIPT_PATTERNS], {
            cwd: this.workspaceRoot,
            absolute: true,
            onlyFiles: true,
            ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/venv/**", "**/__pycache__/**"],
        });
        const currentFiles = new Set(files.map((f) => normalize(f)));
        let reused = 0;
        let reparsed = 0;
        let deleted = 0;
        // Re-parse changed or new files
        for (const filePath of currentFiles) {
            const snapshotHash = snapshotFileHashes[filePath];
            if (snapshotHash && this.graphStore.hasFileHash(filePath, snapshotHash)) {
                // File unchanged since snapshot — reuse
                reused += 1;
                continue;
            }
            // New or changed file — re-index
            const ok = await this.reindexSingleFile(filePath);
            if (ok) {
                reparsed += 1;
            }
            else {
                // File exists but hash matches (race) or not a supported language
                reused += 1;
            }
        }
        // Remove files that existed in snapshot but no longer exist on disk
        const snapshotFiles = Object.keys(snapshotFileHashes);
        for (const snapshotFile of snapshotFiles) {
            if (!currentFiles.has(snapshotFile)) {
                this.graphStore.removeFile(snapshotFile);
                deleted += 1;
            }
        }
        return { reused, reparsed, deleted };
    }
    async processChanges(changedFiles) {
        const normalized = Array.from(new Set(changedFiles.map((item) => normalize(item))));
        let reparsed = 0;
        const dependentCandidates = new Set();
        for (const filePath of normalized) {
            for (const dependent of this.graphStore.getDirectDependents(filePath)) {
                dependentCandidates.add(dependent);
            }
            const ok = await this.reindexSingleFile(filePath);
            if (ok) {
                reparsed += 1;
            }
            for (const dependent of this.graphStore.getDirectDependents(filePath)) {
                dependentCandidates.add(dependent);
            }
        }
        let dependentCount = 0;
        for (const dependent of dependentCandidates) {
            if (normalized.includes(dependent)) {
                continue;
            }
            const ok = await this.reindexSingleFile(dependent);
            if (ok) {
                dependentCount += 1;
            }
        }
        return { reparsed, dependents: dependentCount };
    }
    async removeFile(filePath) {
        this.graphStore.removeFile(normalize(filePath));
    }
    async reindexSingleFile(filePath) {
        const normalized = normalize(filePath);
        const language = detectLanguage(normalized);
        if (!language) {
            return false;
        }
        const exists = await this.exists(normalized);
        if (!exists) {
            this.graphStore.removeFile(normalized);
            return false;
        }
        let parseResult;
        if (language === "python") {
            parseResult = await parsePythonFile(normalized, this.workspaceRoot);
        }
        else {
            parseResult = await parseTypeScriptFile(normalized, this.workspaceRoot);
        }
        if (this.graphStore.hasFileHash(normalized, parseResult.hash)) {
            return false;
        }
        parseResult.resolvedImports = await this.resolveImports(normalized, parseResult.parsedImports.map((item) => item.raw), language);
        this.graphStore.upsertFileResult(parseResult);
        return true;
    }
    async resolveImports(currentFile, imports, language) {
        const resolved = new Set();
        for (const importValue of imports) {
            if (language === "python") {
                const pythonResolved = await this.resolvePythonModule(importValue);
                if (pythonResolved) {
                    resolved.add(pythonResolved);
                }
            }
            else {
                const tsResolved = await this.resolveTypeScriptImport(currentFile, importValue);
                if (tsResolved) {
                    resolved.add(tsResolved);
                }
            }
        }
        return [...resolved];
    }
    async resolvePythonModule(moduleName) {
        if (!moduleName || moduleName.startsWith(".")) {
            return null;
        }
        const modulePath = moduleName.replace(/\./g, "/");
        const candidates = [
            path.join(this.workspaceRoot, `${modulePath}.py`),
            path.join(this.workspaceRoot, modulePath, "__init__.py"),
            path.join(this.workspaceRoot, "backend", `${modulePath}.py`),
            path.join(this.workspaceRoot, "backend", modulePath, "__init__.py"),
        ].map((item) => normalize(item));
        for (const candidate of candidates) {
            if (await this.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    async resolveTypeScriptImport(currentFile, importValue) {
        if (!importValue) {
            return null;
        }
        if (!importValue.startsWith(".") && !importValue.startsWith("@/")) {
            return null;
        }
        let basePath;
        if (importValue.startsWith("@/")) {
            basePath = path.join(this.workspaceRoot, "frontend", "src", importValue.slice(2));
        }
        else {
            basePath = path.resolve(path.dirname(currentFile), importValue);
        }
        const candidates = [normalize(basePath)];
        for (const ext of TS_IMPORT_EXTENSIONS) {
            candidates.push(`${normalize(basePath)}${ext}`);
        }
        for (const ext of TS_IMPORT_EXTENSIONS) {
            candidates.push(normalize(path.join(basePath, `index${ext}`)));
        }
        for (const candidate of candidates) {
            if (await this.exists(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    async exists(filePath) {
        if (this.fileExistsCache.get(filePath) === true) {
            return true;
        }
        try {
            await fs.access(filePath);
            this.fileExistsCache.set(filePath, true);
            return true;
        }
        catch {
            this.fileExistsCache.delete(filePath);
            return false;
        }
    }
}
//# sourceMappingURL=incremental-indexer.js.map