/**
 * Geographic Mapper — maps file paths to lat/lng coordinates using
 * recursive subdivision of the coordinate space.
 *
 * Algorithm: At each folder level, alternate between latitude and longitude
 * splits. Siblings at each level divide the current region equally.
 * The file is placed at the center of its final region.
 *
 * Deterministic: same file path + same sibling set → same coordinates.
 */
interface Coordinates {
    lat: number;
    lng: number;
}
/**
 * Map a file path to geographic coordinates.
 *
 * @param filePath - The file path relative to workspace root (e.g., "backend/app/main.py")
 * @param clusterPath - The cluster's base path (e.g., "backend/")
 * @param allFilePaths - All file paths in the cluster for sibling resolution
 * @returns Coordinates with lat ∈ [-90, 90] and lng ∈ [-180, 180]
 */
export declare function mapFileToCoordinates(filePath: string, clusterPath: string, allFilePaths: string[]): Coordinates;
export {};
