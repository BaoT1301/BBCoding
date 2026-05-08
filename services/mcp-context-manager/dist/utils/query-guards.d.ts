/**
 * Query Guards — Timeout wrapper and error types for query infrastructure.
 *
 * Provides:
 * - `QueryTimeoutError`: Custom error for timed-out queries
 * - `withTimeout<T>()`: Wraps an async function with a timeout guard and AbortController
 *
 * @module utils/query-guards
 */
/**
 * Custom error thrown when a query exceeds its timeout.
 */
export declare class QueryTimeoutError extends Error {
    readonly code: "TIMEOUT";
    readonly retryable = true;
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
/**
 * Custom error for invalid query parameters.
 */
export declare class InvalidParamsError extends Error {
    readonly code: "INVALID_PARAMS";
    readonly retryable = false;
    constructor(message: string);
}
/**
 * Custom error when a queried resource is not found.
 */
export declare class NotFoundError extends Error {
    readonly code: "NOT_FOUND";
    readonly retryable = false;
    constructor(message: string);
}
/**
 * Standard error response schema for all new query endpoints.
 */
export interface QueryErrorResponse {
    error: string;
    code: "TIMEOUT" | "INVALID_PARAMS" | "NOT_FOUND";
    retryable: boolean;
}
/**
 * Wraps an async function with a timeout guard.
 *
 * Creates an `AbortController` and passes its `signal` to the provided function.
 * If the function does not resolve within `ms` milliseconds, the signal is aborted
 * and a `QueryTimeoutError` is thrown.
 *
 * @param fn - Async function that accepts an `AbortSignal` for cooperative cancellation.
 * @param ms - Timeout in milliseconds. Default: 5000.
 * @returns The resolved value of `fn`.
 * @throws {QueryTimeoutError} If `fn` does not complete within `ms` milliseconds.
 */
export declare function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms?: number): Promise<T>;
/**
 * Applies pagination (limit/offset) to an array of results.
 *
 * @param items - The full result array.
 * @param limit - Maximum number of items to return. Default: 100. Max: 1000.
 * @param offset - Number of items to skip. Default: 0.
 * @returns Paginated slice of the array.
 */
export declare function paginate<T>(items: T[], limit?: number, offset?: number): T[];
/**
 * Parses pagination parameters from URL search params or request body.
 *
 * @param params - Object with optional `limit` and `offset` values.
 * @returns Parsed and clamped pagination values.
 */
export declare function parsePaginationParams(params: {
    limit?: string | number | null;
    offset?: string | number | null;
}): {
    limit: number;
    offset: number;
};
/**
 * Builds a standard error response object.
 */
export declare function buildErrorResponse(error: unknown): QueryErrorResponse;
/**
 * Returns the appropriate HTTP status code for a query error.
 */
export declare function errorStatusCode(error: unknown): number;
/**
 * Retry wrapper for query handlers. Retries on `QueryTimeoutError` up to
 * `maxRetries` times with `backoffMs` delay between attempts.
 *
 * @param fn - The async handler to retry.
 * @param maxRetries - Maximum number of retries. Default: 2.
 * @param backoffMs - Delay between retries in milliseconds. Default: 500.
 * @returns The resolved value of `fn`.
 * @throws The last error if all retries are exhausted.
 */
export declare function withRetry<T>(fn: () => Promise<T>, maxRetries?: number, backoffMs?: number): Promise<T>;
