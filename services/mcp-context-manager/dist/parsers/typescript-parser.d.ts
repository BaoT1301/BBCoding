import type { FileParseResult } from "../types/schema.js";
export declare function parseTypeScriptFile(filePath: string, workspaceRoot: string): Promise<FileParseResult>;
