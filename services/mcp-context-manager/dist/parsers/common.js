import { createHash } from "node:crypto";
import path from "node:path";
export function hashContent(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function pos(row, column) {
    return { line: row + 1, column: column + 1 };
}
export function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}
export function detectLanguage(filePath) {
    if (filePath.endsWith(".py")) {
        return "python";
    }
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
        return "typescript";
    }
    return null;
}
export function emptyParseResult(filePath, language, content) {
    return {
        filePath: normalizePath(filePath),
        language,
        hash: hashContent(content),
        symbols: [],
        relations: [],
        parsedImports: [],
        resolvedImports: [],
        parseErrors: [],
    };
}
//# sourceMappingURL=common.js.map