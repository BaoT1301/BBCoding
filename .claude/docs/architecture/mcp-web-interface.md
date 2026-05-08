# MCP Web Interface - Technical Design Document

## Overview

A minimalist web interface for visualizing the live dependency graph and file structure managed by the MCP Context Manager. This interface provides real-time insights into code relationships, symbol dependencies, and file structures across the host repository's codebase.

---

## Architecture Decision

### Current Stack Alignment

The existing frontend uses **React + Vite + TypeScript**, not Next.js. To maintain consistency and avoid introducing a separate framework, this design adapts the original Next.js + tRPC vision to work within the current Vite-based architecture.

**Adapted Architecture:**
- **Frontend Framework:** React 19 + Vite (existing)
- **Type-Safe API Layer:** Custom typed API client using Axios + Zod schemas
- **State Management:** React Query for server state caching
- **UI Components:** Radix UI primitives + Tailwind CSS (existing)
- **Graph Visualization:** React Flow or D3.js for dependency graphs

---

## System Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Context Manager                      │
│  (Node.js Service - Stdio Transport via Docker Container)   │
│                                                              │
│  • Watches workspace files (Python, TypeScript)             │
│  • Parses AST and builds dependency graph                   │
│  • Exposes MCP tools via stdio protocol                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ MCP Protocol (stdio)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              FastAPI Backend (New Endpoint)                  │
│                                                              │
│  • /api/mcp/graph - Proxy to MCP export_dependency_graph    │
│  • /api/mcp/function/{name} - Proxy to get_function_context │
│  • /api/mcp/file/{path} - Proxy to get_file_dependents      │
│  • /api/mcp/symbol/{name} - Proxy to get_symbol_references  │
│                                                              │
│  Uses: @modelcontextprotocol/sdk client to communicate      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP/JSON
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  React Frontend (Vite)                       │
│                                                              │
│  • Typed API client (Axios + Zod)                           │
│  • React Query for caching                                  │
│  • Interactive graph visualization                          │
│  • File tree explorer                                       │
│  • Symbol search and navigation                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. Backend API Layer (`backend/app/routers/mcp.py`)

**Purpose:** Bridge between FastAPI and the MCP Context Manager service.

**Endpoints:**

```python
# GET /api/mcp/graph?scope=repo&max_nodes=2000
# Returns: { nodes: [...], edges: [...] }
async def export_graph(
    scope: Literal["repo", "file", "symbol"],
    file_path: Optional[str] = None,
    symbol_qualified_name: Optional[str] = None,
    max_nodes: int = 2000,
    max_edges: int = 4000
)

# GET /api/mcp/function/{function_name}?file_path=...&max_hops=2
# Returns: { nodes: [...], edges: [...], center_node: {...} }
async def get_function_context(
    function_name: str,
    file_path: Optional[str] = None,
    max_hops: int = 2,
    max_nodes: int = 150
)

# GET /api/mcp/file/{file_path}/dependents?direction=incoming&depth=1
# Returns: { files: [...], dependencies: [...] }
async def get_file_dependents(
    file_path: str,
    direction: Literal["incoming", "outgoing", "both"] = "incoming",
    depth: int = 1,
    max_files: int = 200
)

# GET /api/mcp/symbol/{symbol_name}/references
# Returns: { references: [...], symbol: {...} }
async def get_symbol_references(
    symbol_name: str,
    include_reads: bool = True,
    include_writes: bool = True,
    include_calls: bool = True,
    max_results: int = 300
)
```

**Implementation Notes:**
- Use `@modelcontextprotocol/sdk` Node.js client (or Python equivalent if available)
- Communicate with MCP service via stdio subprocess
- Add proper error handling and timeouts
- Cache responses for 30-60 seconds to reduce load

---

### 2. Frontend Type Definitions (`frontend/src/types/mcp.ts`)

```typescript
import { z } from 'zod';

// Node types in the dependency graph
export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(['file', 'function', 'class', 'variable', 'module']),
  label: z.string(),
  filePath: z.string().optional(),
  qualifiedName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum([
    'imports',
    'defines',
    'calls',
    'instantiates',
    'reads',
    'writes',
    'references',
    'exports',
  ]),
  metadata: z.record(z.unknown()).optional(),
});

export const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});

export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;
```

---

### 3. API Client (`frontend/src/api/mcp-client.ts`)

```typescript
import axios from 'axios';
import { GraphSchema, type Graph } from '@/types/mcp';

const api = axios.create({
  baseURL: '/api/mcp',
  timeout: 10000,
});

export const mcpApi = {
  exportGraph: async (params: {
    scope: 'repo' | 'file' | 'symbol';
    filePath?: string;
    symbolQualifiedName?: string;
    maxNodes?: number;
    maxEdges?: number;
  }): Promise<Graph> => {
    const { data } = await api.get('/graph', { params });
    return GraphSchema.parse(data);
  },

  getFunctionContext: async (params: {
    functionName: string;
    filePath?: string;
    maxHops?: number;
    maxNodes?: number;
  }): Promise<Graph> => {
    const { data } = await api.get(`/function/${params.functionName}`, {
      params: {
        file_path: params.filePath,
        max_hops: params.maxHops,
        max_nodes: params.maxNodes,
      },
    });
    return GraphSchema.parse(data);
  },

  // ... similar methods for file dependents and symbol references
};
```

---

### 4. React Query Hooks (`frontend/src/hooks/use-mcp-graph.ts`)

```typescript
import { useQuery } from '@tanstack/react-query';
import { mcpApi } from '@/api/mcp-client';

export function useMcpGraph(scope: 'repo' | 'file' | 'symbol', options?: {
  filePath?: string;
  symbolQualifiedName?: string;
  maxNodes?: number;
}) {
  return useQuery({
    queryKey: ['mcp-graph', scope, options],
    queryFn: () => mcpApi.exportGraph({ scope, ...options }),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Auto-refresh every minute
  });
}

export function useFunctionContext(functionName: string, filePath?: string) {
  return useQuery({
    queryKey: ['mcp-function', functionName, filePath],
    queryFn: () => mcpApi.getFunctionContext({ functionName, filePath }),
    enabled: !!functionName,
    staleTime: 30000,
  });
}
```

---

### 5. UI Components

#### 5.1 Graph Visualization (`frontend/src/components/mcp/DependencyGraph.tsx`)

**Technology Choice:** React Flow (recommended) or D3.js

**React Flow Advantages:**
- Built for React with hooks
- Interactive by default (pan, zoom, drag)
- Automatic layout algorithms
- TypeScript support
- Smaller bundle size than D3

**Component Structure:**

```typescript
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';

interface DependencyGraphProps {
  graph: Graph;
  onNodeClick?: (node: Node) => void;
  highlightedNodes?: Set<string>;
}

export function DependencyGraph({
  graph,
  onNodeClick,
  highlightedNodes,
}: DependencyGraphProps) {
  const nodes = graph.nodes.map((n) => ({
    id: n.id,
    data: { label: n.label, type: n.type },
    position: { x: 0, y: 0 }, // Auto-layout will position
    type: getNodeType(n.type),
    className: highlightedNodes?.has(n.id) ? 'highlighted' : '',
  }));

  const edges = graph.edges.map((e) => ({
    id: `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    label: e.type,
    type: 'smoothstep',
    animated: e.type === 'calls',
  }));

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) => onNodeClick?.(node)}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

#### 5.2 File Tree Explorer (`frontend/src/components/mcp/FileTree.tsx`)

**Purpose:** Hierarchical view of workspace files with dependency indicators.

**Features:**
- Collapsible folder structure
- File icons by type (Python, TypeScript, etc.)
- Dependency count badges
- Click to load file-specific graph

**Design:**
- Use Radix UI Collapsible for folders
- Lucide React icons for file types
- Tailwind for styling

#### 5.3 Symbol Search (`frontend/src/components/mcp/SymbolSearch.tsx`)

**Purpose:** Search and navigate to functions, classes, variables.

**Features:**
- Fuzzy search across all symbols
- Type filtering (function, class, variable)
- File path context
- Click to load symbol context graph

**Implementation:**
- Combobox pattern (Radix UI)
- Debounced search input
- Keyboard navigation (↑↓ arrows, Enter)

#### 5.4 Main Layout (`frontend/src/pages/MCP/index.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│  Header: "Code Dependency Explorer"                     │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Sidebar     │         Graph Visualization             │
│  (300px)     │         (React Flow Canvas)             │
│              │                                          │
│  • Search    │                                          │
│  • File Tree │                                          │
│  • Filters   │                                          │
│              │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│  Footer: Stats (194 files indexed, last update: 2s ago) │
└─────────────────────────────────────────────────────────┘
```

---

## Visual Design System

### Color Palette (Minimalist)

```css
/* Node Types */
--node-file: #3b82f6;      /* Blue */
--node-function: #10b981;  /* Green */
--node-class: #8b5cf6;     /* Purple */
--node-variable: #f59e0b;  /* Amber */
--node-module: #6366f1;    /* Indigo */

/* Edge Types */
--edge-imports: #94a3b8;   /* Slate */
--edge-calls: #22c55e;     /* Green (animated) */
--edge-reads: #60a5fa;     /* Light Blue */
--edge-writes: #f97316;    /* Orange */

/* UI */
--bg-primary: #ffffff;
--bg-secondary: #f8fafc;
--border: #e2e8f0;
--text-primary: #0f172a;
--text-secondary: #64748b;
```

### Typography

- **Headings:** Inter (existing)
- **Code/Symbols:** JetBrains Mono or Fira Code
- **Body:** Inter

---

## Implementation Phases

### Phase 1: Backend Integration (2-3 days)
1. Install `@modelcontextprotocol/sdk` in backend
2. Create `backend/app/routers/mcp.py` with 4 endpoints
3. Implement stdio communication with MCP service
4. Add error handling and caching
5. Test endpoints with Postman/curl

### Phase 2: Frontend Foundation (2-3 days)
1. Install dependencies: `react-flow-renderer`, `@tanstack/react-query`, `zod`
2. Create type definitions (`types/mcp.ts`)
3. Build API client (`api/mcp-client.ts`)
4. Create React Query hooks
5. Set up routing (`/mcp` route)

### Phase 3: Core UI Components (3-4 days)
1. Build `DependencyGraph` component with React Flow
2. Implement node/edge styling by type
3. Add interaction handlers (click, hover)
4. Create `FileTree` component
5. Build `SymbolSearch` component

### Phase 4: Integration & Polish (2-3 days)
1. Assemble main layout
2. Add loading states and error boundaries
3. Implement real-time updates (WebSocket or polling)
4. Performance optimization (virtualization for large graphs)
5. Responsive design adjustments

---

## Performance Considerations

### Graph Rendering
- **Limit nodes:** Default max 2000 nodes, 4000 edges
- **Virtualization:** React Flow handles viewport culling automatically
- **Lazy loading:** Load subgraphs on-demand (click to expand)

### API Caching
- **React Query:** 30s stale time, 60s refetch interval
- **Backend:** Redis cache for expensive graph queries (optional)

### Bundle Size
- **React Flow:** ~200KB gzipped
- **Code splitting:** Lazy load MCP page (`React.lazy`)

---

## Testing Strategy

### Unit Tests
- API client functions (mock axios)
- React Query hooks (mock API responses)
- Graph data transformations

### Integration Tests
- Backend endpoints (FastAPI TestClient)
- MCP service communication (mock stdio)

### E2E Tests
- Full user flow: search → click node → view context
- Graph interactions (zoom, pan, click)

---

## Security Considerations

1. **Authentication:** Reuse existing Clerk auth for `/api/mcp/*` endpoints
2. **Rate Limiting:** Apply existing rate limits to MCP endpoints
3. **Input Validation:** Zod schemas on both frontend and backend
4. **Path Traversal:** Sanitize file paths in backend before querying MCP

---

## Future Enhancements

1. **Real-time Collaboration:** Multiple users viewing same graph with cursors
2. **Graph Annotations:** Add notes/comments to nodes
3. **Historical View:** Time-travel through code changes
4. **AI Insights:** LLM-powered code explanations via graph context
5. **Export:** Download graph as PNG/SVG or JSON

---

## Documentation Updates Required

Per Doc-Sync Rule, update these files:

1. **`docs/infrastructure.md`**
   - Add section on MCP web interface architecture
   - Document new backend endpoints

2. **`docs/api.md`** (if exists)
   - Document `/api/mcp/*` endpoints with request/response schemas

3. **`README.md`**
   - Add link to MCP web interface in features section
   - Update screenshots (after implementation)

---

## Deployment Notes

### Docker Compose
- MCP service already running (Track 1 complete)
- No additional containers needed
- Backend will communicate via stdio to MCP container

### Environment Variables
```env
# .env
MCP_SERVICE_ENABLED=true
MCP_MAX_GRAPH_NODES=2000
MCP_CACHE_TTL=60
```

### Build Scripts
Update `./redeploy.sh` and `./run.sh` to ensure MCP service starts before backend.

---

## Success Metrics

1. **Performance:** Graph renders <2s for 500 nodes
2. **Usability:** Users can find symbol references in <3 clicks
3. **Reliability:** 99% uptime for MCP endpoints
4. **Adoption:** 80% of dev team uses it weekly (internal tool)

---

## Conclusion

This design adapts the original Next.js + tRPC vision to the existing React + Vite stack, maintaining type safety through Zod schemas and a custom API client. The minimalist UI prioritizes clarity and performance, making code exploration intuitive and fast.

**Key Decisions:**
- ✅ Stick with React + Vite (no framework migration)
- ✅ Use React Flow for graph visualization (best React integration)
- ✅ Proxy MCP tools through FastAPI (security + caching)
- ✅ Type-safe API layer with Zod validation
- ✅ Minimalist design with Tailwind + Radix UI

**Next Steps:** Proceed to Phase 1 (Backend Integration) after approval.
