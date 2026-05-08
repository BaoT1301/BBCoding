import { z } from "zod";
declare const ClusterSchema: z.ZodObject<{
    id: z.ZodString;
    path: z.ZodString;
    label: z.ZodString;
    color: z.ZodString;
}, "strip", z.ZodTypeAny, {
    label: string;
    id: string;
    path: string;
    color: string;
}, {
    label: string;
    id: string;
    path: string;
    color: string;
}>;
declare const ClusterConfigSchema: z.ZodObject<{
    clusters: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        path: z.ZodString;
        label: z.ZodString;
        color: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        label: string;
        id: string;
        path: string;
        color: string;
    }, {
        label: string;
        id: string;
        path: string;
        color: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    clusters: {
        label: string;
        id: string;
        path: string;
        color: string;
    }[];
}, {
    clusters: {
        label: string;
        id: string;
        path: string;
        color: string;
    }[];
}>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type ClusterConfig = z.infer<typeof ClusterConfigSchema>;
export declare class ClusterConfigLoader {
    private clusters;
    private readonly configPath;
    private watcher;
    constructor(configPath: string);
    getClusters(): Cluster[];
    getClusterForFile(filePath: string): Cluster;
    startWatching(): Promise<void>;
    stopWatching(): Promise<void>;
    private loadSync;
}
export {};
