import type { FileParseResult, Language, RangePosition } from "../types/schema.js";
export declare function hashContent(content: string): string;
export declare function pos(row: number, column: number): RangePosition;
export declare function normalizePath(filePath: string): string;
export declare function detectLanguage(filePath: string): Language | null;
export declare function emptyParseResult(filePath: string, language: Language, content: string): FileParseResult;
