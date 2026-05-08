import path from "node:path";
import chokidar from "chokidar";
export class LiveFileWatcher {
    workspaceRoot;
    indexer;
    graphStore;
    onUpdate;
    onDelete;
    pendingByFile = new Map();
    pendingSet = new Set();
    knownFiles = new Set();
    flushTimer = null;
    watcher = null;
    constructor(options) {
        this.workspaceRoot = options.workspaceRoot;
        this.indexer = options.indexer;
        this.graphStore = options.graphStore;
        this.onUpdate = options.onUpdate;
        this.onDelete = options.onDelete;
    }
    async start() {
        // Populate knownFiles from the graph store's existing indexed files
        for (const filePath of this.graphStore.getIndexedFilePaths()) {
            this.knownFiles.add(filePath);
        }
        const watchPaths = [
            path.join(this.workspaceRoot, "backend"),
            path.join(this.workspaceRoot, "frontend", "src"),
            path.join(this.workspaceRoot, "services"),
        ];
        this.watcher = chokidar.watch(watchPaths, {
            ignored: [
                "**/node_modules/**",
                "**/.git/**",
                "**/dist/**",
                "**/venv/**",
                "**/__pycache__/**",
            ],
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 150,
                pollInterval: 40,
            },
        });
        this.watcher.on("add", (filePath) => this.schedule(filePath));
        this.watcher.on("change", (filePath) => this.schedule(filePath));
        this.watcher.on("unlink", async (filePath) => {
            const normalized = this.normalize(filePath);
            await this.indexer.removeFile(filePath);
            this.pendingSet.delete(normalized);
            this.knownFiles.delete(normalized);
            this.onDelete?.(filePath);
        });
    }
    async stop() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        for (const timer of this.pendingByFile.values()) {
            clearTimeout(timer);
        }
        this.pendingByFile.clear();
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
    }
    schedule(filePath) {
        const normalized = this.normalize(filePath);
        const existing = this.pendingByFile.get(normalized);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.pendingByFile.delete(normalized);
            this.pendingSet.add(normalized);
            this.scheduleFlush();
        }, 200);
        this.pendingByFile.set(normalized, timer);
    }
    scheduleFlush() {
        if (this.flushTimer) {
            return;
        }
        this.flushTimer = setTimeout(async () => {
            this.flushTimer = null;
            const files = [...this.pendingSet];
            this.pendingSet.clear();
            if (files.length === 0) {
                return;
            }
            // Detect new files before processing
            const newFiles = files.filter((f) => !this.knownFiles.has(f));
            const stats = await this.indexer.processChanges(files);
            // After processing, add all files to knownFiles
            for (const f of files) {
                this.knownFiles.add(f);
            }
            this.onUpdate?.({
                ...stats,
                files: files.length,
                filePaths: files,
                newFiles,
            });
        }, 500);
    }
    normalize(filePath) {
        return filePath.split(path.sep).join("/");
    }
}
//# sourceMappingURL=file-watcher.js.map