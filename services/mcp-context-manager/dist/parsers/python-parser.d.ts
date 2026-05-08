import type { FileParseResult } from "../types/schema.js";
export declare function parsePythonFile(filePath: string, workspaceRoot: string): Promise<FileParseResult>;
