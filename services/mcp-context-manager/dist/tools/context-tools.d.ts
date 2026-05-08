import { z } from "zod";
import { GraphStore } from "../graph/graph-store.js";
export declare function registerContextTools(server: {
    tool: (name: string, description: string, schema: z.ZodRawShape, handler: (args: any) => Promise<{
        content: Array<{
            type: "text";
            text: string;
        }>;
    }>) => void;
}, graphStore: GraphStore): void;
