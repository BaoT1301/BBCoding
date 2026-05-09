# Local Context: MCP Context UI

## Service Identity

**Name:** MCP Context UI  
**Type:** Internal Developer Tooling  
**Purpose:** Interactive web-based visualization of code dependencies and relationships  
**Port:** 8080 (host) → 80 (container)  
**Authentication:** None (Zero Auth)

---

## Tech Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | React | 19.1.0 | UI component library |
| **Build Tool** | Vite | 6.3.5 | Fast development and production builds |
| **Language** | TypeScript | 5.8.3 | Type-safe development |
| **CSS Framework** | Tailwind CSS | 4.x | Utility-first CSS (with @tailwindcss/vite plugin) |
| **Routing** | React Router DOM | 7.x | Client-side routing (HashRouter for nginx SPA compatibility) |
| **Search** | Fuse.js | latest | Client-side fuzzy search for documentation |
| **UI Primitives** | Radix UI | latest | Accessible component primitives (Tabs, Tooltip, Dialog, Accordion, Select, ScrollArea, Separator) |
| **Variant Management** | class-variance-authority | latest | Type-safe component variant management |
| **Class Utilities** | clsx + tailwind-merge | latest | Conditional class merging and Tailwind deduplication |
| **2D Visualization** | React Flow | 11.11.4 | Interactive 2D graph rendering |
| **3D Visualization** | react-globe.gl | latest | Globe-based 3D rendering (Phase 1 — retained as fallback) |
| **3D Framework** | @react-three/fiber | ^9.1.2 | React Three Fiber — R3F scene management (Phase 2) |
| **3D Helpers** | @react-three/drei | ^10.3.2 | R3F utility components: Sphere, Line, Html, OrbitControls (Phase 2) |
| **3D Engine** | three | latest | WebGL 3D library (R3F + react-globe.gl dependency) |
| **State Management** | React Query | 5.100.5 | Server state caching and synchronization |
| **HTTP Client** | Axios | 1.13.5 | API communication |
| **Schema Validation** | Zod | 4.3.6 | Runtime type validation |
| **Toast Notifications** | sonner | latest | Lightweight toast notification library |
| **Icons** | Lucide React | 0.564.0 | Icon components |
| **Web Server** | Nginx (Alpine) | Latest | Static file serving and reverse proxy |

---

## Architectural Constraints

### 1. Service Isolation (CRITICAL)

This UI is **completely isolated** from the main production frontend (`/frontend`). It is a standalone internal tool.

**MUST:**
- ✅ Treat this as a separate microservice
- ✅ Keep all code within `services/mcp-context-ui/`
- ✅ Use only dependencies listed in `package.json`
- ✅ Proxy API requests to `mcp-context-manager:3001` via nginx
- ✅ Run on port 8080 (isolated from production frontend on port 80)

**MUST NOT:**
- ❌ Import code from `/frontend` directory
- ❌ Import code from `/backend` directory
- ❌ Share components with production frontend
- ❌ Reference production frontend utilities or types
- ❌ Proxy to production backend (port 8000)
- ❌ Use production frontend's build pipeline

**Rationale:** This service is internal tooling for developers. It must remain decoupled from production code to avoid:
- Deployment coupling (changes to production don't break tooling)
- Dependency conflicts (different React versions, etc.)
- Security risks (tooling bugs don't affect production)

### 2. Zero Authentication (CRITICAL)

This UI has **NO authentication** by design.

**MUST:**
- ✅ Assume all users are trusted developers
- ✅ Keep the service on localhost only
- ✅ Display read-only code structure data

**MUST NOT:**
- ❌ Implement Clerk authentication wrappers
- ❌ Add JWT validation
- ❌ Implement API keys or access tokens
- ❌ Add user login flows
- ❌ Expose to public internet

**Rationale:** This is internal tooling for developers working on localhost. Authentication adds unnecessary complexity and friction for a read-only visualization tool.

### 3. Data Contract with MCP Context Manager

The UI consumes data from the MCP Context Manager service. The schema **MUST** remain synchronized.

**Backend Schema (MCP Context Manager):**
```typescript
type SymbolKind = "file" | "module" | "function" | "class" | "variable" | "external";

type EdgeType = "imports" | "defines" | "calls" | "instantiates" 
              | "reads" | "writes" | "references" | "exports" | "inherits";

interface Node {
  id: string;
  type: SymbolKind;
  label: string;
  filePath?: string;
  qualifiedName?: string;
  metadata?: Record<string, unknown>;
}

interface Edge {
  source: string;
  target: string;
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

interface Graph {
  nodes: Node[];
  edges: Edge[];
}
```

**Frontend Schema (This Service):**
```typescript
// src/types/mcp.ts
export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "function", "class", "variable", "module", "external"]),
  label: z.string(),
  filePath: z.string().optional(),
  qualifiedName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum([
    "imports", "defines", "calls", "instantiates",
    "reads", "writes", "references", "exports", "inherits"
  ]),
  isCrossCluster: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  clusterMeta: z.array(z.object({ id: z.string(), path: z.string(), label: z.string(), color: z.string() })).optional(),
});
```

**Health Endpoint (`/api/v1/health`):** Returns `{ status: "ok" }` when healthy, or `{ status: "degraded", reasons: string[] }` when running but 0 files are indexed. The `SetupPage.tsx` `HealthStatus` union includes `"degraded"` as a first-class state. Degraded state shows a yellow warning badge (`"⚠ Service degraded — 0 files indexed"`) and the setup wizard (same as unhealthy), but the Reconfigure button is hidden.

**CRITICAL RULE:** When the backend schema changes, the frontend Zod schemas **MUST** be updated to match. Failure to do so will cause runtime validation errors.

**Historical Incident:** In April 2026, the backend added the `"external"` node type, but the frontend schema was not updated. This caused ~2000 Zod validation errors in production. See `SCHEMA-FIX.md` for full details.

**Validation Process:**
1. All API responses are validated with `GraphSchema.parse(data)`
2. If validation fails, Zod throws a detailed error
3. The error is caught by React Query and displayed to the user
4. Check browser console for `ZodError` messages

### 4. API Routing via Nginx Proxy (Versioned)

All API requests are proxied through nginx to the MCP Context Manager. As of Sprint 4, all endpoints use the `/api/v1/` prefix.

**Request Flow:**
```
Browser: GET http://localhost:8080/api/v1/mcp/graph
    ↓
Nginx (container port 80): Receives request
    ↓
Nginx proxy_pass: http://mcp-context-manager:3001/api/v1/mcp/graph
    ↓
MCP Context Manager: Processes request and returns JSON
    ↓
Nginx: Forwards response to browser
    ↓
Browser: Validates with Zod, renders graph
```

**Nginx Configuration (`nginx.conf`):**
```nginx
# Versioned API (primary)
location /api/v1/ {
    proxy_pass http://mcp-context-manager:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# SSE (versioned, buffering disabled)
location /api/v1/mcp/events {
    proxy_pass http://mcp-context-manager:3001;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_cache off;
}

# Legacy SSE (served directly, no redirect — EventSource limitation)
location /api/mcp/events {
    proxy_pass http://mcp-context-manager:3001;
    proxy_buffering off;
    proxy_read_timeout 3600s;
}

# Legacy API (returns 301 from backend)
location /api/ {
    proxy_pass http://mcp-context-manager:3001;
}
```

**MUST:**
- ✅ Use relative paths in API calls: `/mcp/graph` (relative to baseURL)
- ✅ Configure axios baseURL as `/api/v1`
- ✅ Ensure nginx proxy_pass points to `mcp-context-manager:3001`

**MUST NOT:**
- ❌ Hardcode `localhost:3001` in API calls
- ❌ Use absolute URLs in axios requests
- ❌ Bypass nginx proxy
- ❌ Use legacy `/api/mcp/*` paths in new code (they return 301)

### 5. React Flow Integration

The UI uses React Flow for graph visualization. The integration follows specific patterns.

**Data Transformation:**
```typescript
// MCP Graph → React Flow Nodes
const flowNodes: FlowNode[] = graph.nodes.map((node, index) => ({
  id: node.id,
  type: "default",
  data: {
    label: node.label,
    mcpNode: node, // Store original node for reference
  },
  position: {
    x: (index % 10) * 200,
    y: Math.floor(index / 10) * 100,
  },
  style: getNodeStyle(node.type), // Color by node type
}));

// MCP Graph → React Flow Edges
const flowEdges: FlowEdge[] = graph.edges.map((edge) => ({
  id: `${edge.source}-${edge.target}-${edge.type}`,
  source: edge.source,
  target: edge.target,
  label: edge.type,
  type: ConnectionLineType.SmoothStep,
  style: getEdgeStyle(edge.type), // Color by edge type
}));
```

**MUST:**
- ✅ Use `useMemo` for node/edge transformations (performance)
- ✅ Store original MCP node in `data.mcpNode` for reference
- ✅ Apply consistent styling based on node/edge types
- ✅ Use React Flow's built-in state management (`useNodesState`, `useEdgesState`)

**MUST NOT:**
- ❌ Mutate node/edge arrays directly
- ❌ Perform expensive computations in render
- ❌ Override React Flow's internal state management

### 6. Performance Constraints

The UI must handle large graphs (up to 2000 nodes, 4000 edges) without performance degradation.

**Optimization Strategies:**
- ✅ **Memoization:** Use `useMemo` for expensive transformations
- ✅ **Lazy Rendering:** React Flow only renders visible nodes
- ✅ **Debouncing:** Search input is debounced (300ms)
- ✅ **Pagination:** API supports `maxNodes` and `maxEdges` limits
- ✅ **Caching:** React Query caches responses for 30 seconds

**React Query Configuration:**
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch on tab focus
      retry: 1,                    // Only retry once on failure
      staleTime: 30_000,           // Data fresh for 30 seconds
      refetchInterval: 60_000,     // Auto-refresh every 60 seconds
    },
  },
});
```

**MUST:**
- ✅ Keep staleTime at 30 seconds (balance freshness vs. performance)
- ✅ Limit refetch attempts to avoid hammering the API
- ✅ Use `enabled` flag to prevent unnecessary queries

**MUST NOT:**
- ❌ Fetch full graph on every render
- ❌ Disable React Query caching
- ❌ Set refetchInterval below 30 seconds

### 7. Application Architecture (5-Tab Documentation Portal)

The application is a multi-page documentation portal using HashRouter for nginx SPA compatibility.

**Routing Scheme:**
- `/#/` → OverviewPage (default)
- `/#/setup` → SetupPage (Docker wizard)
- `/#/api` → ApiReferencePage (interactive playground)
- `/#/agents` → AgentsPage (AI agent configuration guides)
- `/#/graph` → GraphPage (2D/3D dependency graph)
- `/#/*` → Redirects to Overview

**Layout Shell** (`src/components/Layout.tsx`):
- Fixed header with logo, version badge, and Fuse.js search input
- Horizontal tab bar (Overview | Setup | API Reference | AI Agents | Graph)
- Active tab indicator with smooth transition
- Main content area (scrollable)
- Footer with links

### 8. 2D/3D Toggle (Phase 2)

`MCPPage.tsx` conditionally renders `DependencyGraph` (2D React Flow) or `Globe3DPhase2` (R3F multi-globe solar system) in 3D mode. Each cluster renders as its own sphere in a shared 3D scene. The cluster dropdown selector has been removed — all clusters are visible simultaneously as separate globes. Default view is 2D to avoid breaking existing workflows. `react-globe.gl` (`Globe3DPhase1`) is retained as a fallback but no longer the primary 3D renderer.

### 9. SSE Integration (Phase 1)

The `useSSEEvents` hook manages an EventSource connection to `GET /api/v1/mcp/events` with exponential backoff reconnection (1s initial → 30s cap). On reconnect, the hook invalidates the React Query cache to ensure fresh data. Toast notifications via `sonner` display file change events (auto-dismiss 3s). SSE events now include `clusterId`/`clusterIds` fields (Phase 2) for future targeted globe refresh optimization.

### 10. LOD System (Phase 2 — Per-Globe)

The `useMultiGlobeLOD` hook computes LOD independently for each globe based on camera distance to that globe's center. Same thresholds as Phase 1 (>3R = far, 1.5R–3R = medium, <1.5R = close). Camera position tracked via `useFrame()` throttled to every 5 frames. Each `ClusterGlobe` receives its own LOD state controlling `showFunctionLabels`, `showDirectedArcs`, `showFunctionBadges`.

A "Show All Details" toggle bypasses LOD with a performance warning modal for graphs exceeding 2000 nodes.

---

## Development Workflow

### Local Development (Outside Docker)

```bash
cd services/mcp-context-ui

# Install dependencies
npm install

# Start dev server (port 8080, hot reload enabled)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Note:** When running locally, ensure MCP Context Manager is accessible at `http://localhost:3001` or update the proxy in `vite.config.ts`.

### Docker Development

```bash
# Build and start the service
docker-compose up -d mcp-ui

# View logs
docker-compose logs -f mcp-ui

# Rebuild after code changes
docker-compose build --no-cache mcp-ui
docker-compose up -d mcp-ui

# Stop the service
docker-compose stop mcp-ui
```

### Testing Changes

1. **Make code changes** in `services/mcp-context-ui/src/`
2. **Rebuild container:**
   ```bash
   docker-compose build --no-cache mcp-ui
   docker-compose up -d mcp-ui
   ```
3. **Verify in browser:**
   - Open `http://localhost:8080`
   - Open DevTools console (F12)
   - Check for errors or warnings
4. **Test interactions:**
   - Search for symbols
   - Click nodes to highlight
   - Navigate file tree
   - Verify graph renders correctly

### Schema Updates

**When MCP Context Manager updates its schema:**

1. **Update Zod schemas** in `src/types/mcp.ts` to match backend
2. **Run TypeScript compiler** to catch type errors:
   ```bash
   npm run build
   ```
3. **Test locally:**
   ```bash
   npm run dev
   # Open http://localhost:8080 and verify no Zod errors
   ```
4. **Rebuild container:**
   ```bash
   docker-compose build --no-cache mcp-ui
   docker-compose up -d mcp-ui
   ```
5. **Hard refresh browser** (Ctrl+Shift+R) to clear cached JavaScript

---

## File Structure Conventions

### Component Organization

### Component Organization

```
src/components/
├── Layout.tsx             # Shell with header, tab nav, content outlet, footer
├── api/                   # API playground components (Sprint 4 Track 4)
│   ├── EndpointSidebar.tsx    # Left sidebar — grouped endpoint list with filter
│   └── EndpointDetail.tsx     # Main detail — parameter forms, "Try It", code examples
├── docs/                  # Documentation-specific components (Sprint 4 Tracks 3-5)
│   ├── AgentCard.tsx          # Card with logo, name, description, config path
│   ├── CodeBlock.tsx          # Syntax display with copy + download buttons
│   ├── ConfigBlock.tsx        # JSON config display with file path header and copy
│   ├── CopyButton.tsx         # Click-to-copy with toast feedback
│   ├── StatusBadge.tsx        # Green/red/yellow/loading status indicators
│   ├── StepWizard.tsx         # Multi-step form with progress indicator
│   └── ToolList.tsx           # Expandable list of MCP tools with descriptions
├── mcp/                   # Graph visualization components
│   ├── ClusterGlobe.tsx       # Per-cluster 3D sphere renderer (Phase 2)
│   ├── DependencyGraph.tsx    # React Flow visualization (2D — main canvas)
│   ├── EdgeFilterPanel.tsx    # Edge type filter sidebar (Phase 1)
│   ├── FileTree.tsx           # File navigation sidebar
│   ├── Globe3DPhase1.tsx      # react-globe.gl 3D visualization (Phase 1 — fallback)
│   ├── Globe3DPhase2.tsx      # R3F multi-globe solar system scene (Phase 2)
│   ├── GlobeLoadingScreen.tsx # Loading screen with progress (Phase 1)
│   └── SymbolSearch.tsx       # Symbol search input with autocomplete
└── ui/                    # shadcn/ui primitives (Sprint 4 Track 2)
    ├── accordion.tsx
    ├── badge.tsx
    ├── button.tsx
    ├── card.tsx
    ├── code-block.tsx
    ├── dialog.tsx
    ├── input.tsx
    ├── label.tsx
    ├── scroll-area.tsx
    ├── select.tsx
    ├── separator.tsx
    ├── tabs.tsx
    ├── textarea.tsx
    └── tooltip.tsx
```

### Page Organization

```
src/pages/
├── OverviewPage.tsx       # Hero, features, architecture diagram, quick start CTA
├── SetupPage.tsx          # Docker wizard with health check gate
├── ApiReferencePage.tsx   # Interactive API playground (Swagger-style)
├── AgentsPage.tsx         # AI agent configuration guides (Claude, Cursor, Kiro)
├── GraphPage.tsx          # 2D/3D dependency graph (migrated from MCPPage)
└── MCPPage.tsx            # Original graph page (retained, no longer routed)
```

**Naming Convention:**
- PascalCase for component files: `DependencyGraph.tsx`
- Export component as named export: `export function DependencyGraph() {}`
- One component per file

### API Client Organization

```
src/api/
├── clusters.ts   # Cluster API client (Phase 1)
├── instance.ts   # Axios instance configuration (baseURL: /api/v1)
├── mcp.ts        # MCP API endpoints with Zod validation
└── sse.ts        # SSE client with exponential backoff (default URL: /api/v1/mcp/events)
```

**API functions in `mcp.ts`** (all use baseURL `/api/v1`):
- `exportGraph(params)` — `GET /mcp/graph`
- `getFunctionContext(params)` — `POST /mcp/function`
- `getFileDependents(params)` — `POST /mcp/dependents`
- `getSymbolReferences(params)` — `POST /mcp/references`
- `getCallers(params)` — `GET /mcp/callers/:functionName`
- `getCallChain(params)` — `GET /mcp/call-chain/:functionName`
- `getDeadCode(params?)` — `GET /mcp/dead-code`
- `getImpactAnalysis(params)` — `GET /mcp/impact/:filePath`
- `getModuleCoupling(params)` — `GET /mcp/coupling/:filePathA/:filePathB`
- `getHotspots(params?)` — `GET /mcp/hotspots`
- `getClassHierarchy(params)` — `GET /mcp/class-hierarchy/:className`
- `searchSymbols(params)` — `GET /mcp/search`
- `getCircularDeps(params?)` — `POST /mcp/circular-deps`
- `getComplexityMetrics(params?)` — `POST /mcp/complexity`
- `getChangeRisk(params)` — `POST /mcp/change-risk`

All functions validate responses with the corresponding Zod schema (`.parse(data)`).

**Pattern:**
- Each API function returns a validated type: `Promise<Graph>`
- All responses are validated with Zod: `GraphSchema.parse(data)`
- Use descriptive function names: `exportGraph`, `getFunctionContext`

### Type Definitions

```
src/types/
├── globe.ts      # Globe-specific Zod schemas (Phase 1)
├── globe-r3f.ts  # R3F-specific types: GlobePosition, CrossGlobeArc, GlobeLayoutState, GlobeLODState (Phase 2)
└── mcp.ts        # Zod schemas and inferred TypeScript types
```

### Lib Utilities

```
src/lib/
├── utils.ts                    # cn() helper — clsx + tailwind-merge (Sprint 4 Track 2)
├── docker-compose-generator.ts # Docker Compose YAML + .env + run commands generation (Sprint 4 Track 3)
├── openapi-parser.ts           # Static OpenAPI spec parser — extracts endpoints, params, schemas (Sprint 4 Track 4)
└── code-generator.ts           # Code snippet generator — curl, TypeScript (axios), Python (requests) (Sprint 4 Track 4)
```

**Zod Response Schemas in `mcp.ts`:**
- `NodeSchema`, `EdgeSchema`, `GraphSchema` — Core graph data schemas
- `CallersResponseSchema` — Reverse call graph response (Sprint 1)
- `CallChainResponseSchema` — Directed subgraph response (Sprint 1)
- `DeadCodeResponseSchema` — Unreferenced symbols response (Sprint 1)
- `ImpactAnalysisResponseSchema` — File impact analysis response (Sprint 1)
- `ModuleCouplingResponseSchema` — Coupling metrics between two files (Sprint 2)
- `HotspotsResponseSchema` — Top-N most-referenced symbols (Sprint 2)
- `ClassHierarchyResponseSchema` — Class inheritance hierarchy (Sprint 2)
- `SearchSymbolsResponseSchema` — Fuzzy/regex symbol search results (Sprint 2)
- `CircularDepsResponseSchema` — Circular dependency detection response (Sprint 3)
- `ComplexityMetricsResponseSchema` — Per-symbol complexity metrics response (Sprint 3)
- `ChangeRiskResponseSchema` — Change risk analysis response (Sprint 3)

**Arc styling constants in `globe.ts`:**
- `ARC_STYLES` record includes entries for all edge types including `inherits: { color: "#F59E0B", dashLength: 1.0, dashGap: 0 }`

**Pattern:**
- Define Zod schema first: `export const NodeSchema = z.object({...})`
- Infer TypeScript type: `export type Node = z.infer<typeof NodeSchema>`
- Export both schema and type

### Hooks

```
src/hooks/
├── use-api-playground.ts  # Playground state: endpoint selection, params, history (Sprint 4 Track 4)
├── use-cluster-config.ts  # React Query hook for clusters (Phase 1)
├── use-lod.ts             # Level of Detail hook (Phase 1 — single globe)
├── use-mcp-graph.ts       # React Query hooks for data fetching
├── use-mcp-queries.ts     # React Query hooks for Sprint 3 query tools
├── use-multi-globe-lod.ts # Per-globe LOD computation (Phase 2)
├── use-search.ts          # Fuse.js-powered documentation search (Sprint 4 Track 2)
└── use-sse-events.ts      # SSE connection management (Phase 1)
```

**React Query hooks in `use-mcp-graph.ts`:**
- `useMcpGraph(scope, options?)` — Fetch dependency graph
- `useFunctionContext(functionName, options?)` — Fetch function context
- `useCallers(functionName, options?)` — Reverse call graph (Sprint 1)
- `useCallChain(functionName, options?)` — Directed call chain (Sprint 1)
- `useDeadCode(options?)` — Dead code detection (Sprint 1)
- `useImpactAnalysis(filePath, options?)` — File impact analysis (Sprint 1)
- `useModuleCoupling(filePathA, filePathB, options?)` — Coupling metrics (Sprint 2)
- `useHotspots(options?)` — Top-N hotspots (Sprint 2)
- `useClassHierarchy(className, options?)` — Class inheritance (Sprint 2)
- `useSearchSymbols(query, options?)` — Symbol search (Sprint 2)
- `useCircularDeps(params?)` — Circular dependency detection (Sprint 3)
- `useComplexityMetrics(params?)` — Complexity metrics (Sprint 3)
- `useChangeRisk(params)` — Change risk analysis, enabled only when `changedFiles.length > 0` (Sprint 3)

All hooks: `staleTime: 30_000`, `retry: 2`. Query keys are unique and prefixed with `mcp-`.

**Pattern:**
- Prefix with `use`: `useMcpGraph`, `useFunctionContext`
- Return React Query result: `{ data, isLoading, error }`
- Configure caching and refetch behavior

---

## Common Pitfalls

### ❌ Pitfall 1: Importing from Production Frontend

**Wrong:**
```typescript
import { Button } from '../../../frontend/src/components/ui/Button';
```

**Right:**
```typescript
// Create a local Button component or use a shared UI library
import { Button } from './components/ui/Button';
```

**Why:** This violates service isolation and creates deployment coupling.

### ❌ Pitfall 2: Hardcoding API URLs

**Wrong:**
```typescript
const api = axios.create({
  baseURL: 'http://localhost:3001',
});
```

**Right:**
```typescript
const api = axios.create({
  baseURL: '/api', // Proxied by nginx
});
```

**Why:** Hardcoded URLs break in Docker and prevent nginx proxy from working.

### ❌ Pitfall 3: Forgetting to Update Zod Schemas

**Wrong:**
```typescript
// Backend adds "external" node type, but frontend schema not updated
export const NodeSchema = z.object({
  type: z.enum(["file", "function", "class", "variable", "module"]),
  // Missing "external"!
});
```

**Right:**
```typescript
// Always keep frontend schema in sync with backend
export const NodeSchema = z.object({
  type: z.enum(["file", "function", "class", "variable", "module", "external"]),
});
```

**Why:** Schema mismatches cause runtime validation errors. See `SCHEMA-FIX.md` for a real incident.

### ❌ Pitfall 4: Mutating React Flow State

**Wrong:**
```typescript
const [nodes, setNodes] = useState(initialNodes);
nodes[0].position.x = 100; // Direct mutation!
setNodes(nodes);
```

**Right:**
```typescript
const [nodes, , onNodesChange] = useNodesState(initialNodes);
// Let React Flow manage state via onNodesChange
```

**Why:** React Flow uses internal state management. Direct mutations break reactivity.

### ❌ Pitfall 5: Disabling React Query Caching

**Wrong:**
```typescript
const { data } = useQuery({
  queryKey: ["mcp-graph"],
  queryFn: fetchGraph,
  cacheTime: 0, // Disables caching!
  staleTime: 0,
});
```

**Right:**
```typescript
const { data } = useQuery({
  queryKey: ["mcp-graph"],
  queryFn: fetchGraph,
  staleTime: 30_000,      // Cache for 30 seconds
  refetchInterval: 60_000, // Auto-refresh every minute
});
```

**Why:** Disabling caching causes excessive API requests and poor performance.

---

## Debugging

### Browser Console Logging

The UI includes debug logging for data fetching:

```typescript
console.log("[useMcpGraph] Fetching graph data:", { scope, options });
console.log("[useMcpGraph] Received graph data:", {
  nodeCount: data.nodes.length,
  edgeCount: data.edges.length,
  sampleNode: data.nodes[0],
  sampleEdge: data.edges[0],
});
```

**To debug:**
1. Open browser to `http://localhost:8080`
2. Open DevTools console (F12)
3. Look for `[useMcpGraph]` log messages
4. Verify node/edge counts match expectations

### Common Error Messages

**Zod Validation Error:**
```
ZodError: [
  {
    "code": "invalid_enum_value",
    "received": "external",
    "path": ["nodes", 0, "type"],
    "message": "Invalid input"
  }
]
```
**Solution:** Update `src/types/mcp.ts` to include missing enum value.

**MIME Type Error:**
```
Refused to execute script from 'http://localhost:8080/assets/index.js'
because its MIME type ('text/html') is not executable.
```
**Solution:** Verify `nginx.conf` includes explicit MIME type configuration.

**API 404 Error:**
```
GET http://localhost:8080/api/mcp/graph 404 (Not Found)
```
**Solution:** Verify nginx proxy configuration and MCP Context Manager is running.

---

## Security Notes

### No Authentication Required

This service is designed for **internal developer use only** and has **zero authentication**.

**Acceptable Use:**
- ✅ Running on localhost for development
- ✅ Visualizing code structure and dependencies
- ✅ Exploring function call graphs

**Unacceptable Use:**
- ❌ Exposing to public internet
- ❌ Deploying to production environments
- ❌ Displaying sensitive credentials or secrets

### Content Security Policy

The nginx configuration includes a strict CSP to prevent XSS attacks:

```nginx
add_header Content-Security-Policy "
  default-src 'self';
  script-src 'self' https://*.clerk.accounts.dev;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' http://backend:8000 https://*.clerk.accounts.dev;
  worker-src 'self' blob:;
  frame-ancestors 'none';
" always;
```

**Note:** Clerk domains are included for infrastructure consistency, but authentication is not implemented. `worker-src 'self' blob:` is required for Three.js Web Workers used by R3F.

---

## Related Files

- **README.md** - User-facing documentation
- **SCHEMA-FIX.md** - Case study of schema mismatch incident
- **VERIFICATION.md** - Track 2 verification report
- **verify-schema-fix.sh** - Automated verification script

---

## Maintenance Checklist

When making changes to this service:

- [ ] Verify service isolation (no imports from `/frontend` or `/backend`)
- [ ] Update Zod schemas if backend schema changes
- [ ] Run TypeScript compiler to catch type errors (`npm run build`)
- [ ] Test locally before rebuilding container (`npm run dev`)
- [ ] Rebuild container with `--no-cache` flag
- [ ] Hard refresh browser (Ctrl+Shift+R) to clear cached JavaScript
- [ ] Check browser console for errors (F12)
- [ ] Run verification script: `./verify-schema-fix.sh`
- [ ] Update this local context if architectural constraints change

---

**Last Updated:** 2026-05-08 (Sprint 4 Bug-Fix — degraded health state sync)  
**Service Version:** 3.0.0  
**Maintainer:** Knowledge Manager
