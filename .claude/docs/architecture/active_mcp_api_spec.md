# MCP API Contract Specification

**Version:** 1.0  
**Generated:** 2026-04-27  
**Frontend Implementation:** Complete  
**Backend Implementation:** Pending (Track 2)

---

## Overview

This document defines the exact JSON structure that the frontend expects from the FastAPI backend's MCP proxy endpoints. The backend must implement these endpoints to communicate with the MCP Context Manager service via stdio and return data in the formats specified below.

---

## Base URL

All endpoints are prefixed with `/api/mcp`

---

## Authentication

All endpoints require:
- **Clerk Bearer Token** in `Authorization` header
- **Access Key** in `X-Access-Key` header (existing auth mechanism)

---

## Endpoints

### 1. Export Dependency Graph

**Endpoint:** `GET /api/mcp/graph`

**Description:** Returns the full dependency graph from the MCP Context Manager.

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `scope` | string | Yes | - | Graph scope: `"repo"`, `"file"`, or `"symbol"` |
| `file_path` | string | No | - | Required when scope is `"file"` |
| `symbol_qualified_name` | string | No | - | Required when scope is `"symbol"` |
| `max_nodes` | integer | No | 2000 | Maximum number of nodes to return |
| `max_edges` | integer | No | 4000 | Maximum number of edges to return |

**Response Schema:**

```json
{
  "nodes": [
    {
      "id": "string (unique identifier)",
      "type": "file | function | class | variable | module",
      "label": "string (display name)",
      "filePath": "string (optional - relative path from repo root)",
      "qualifiedName": "string (optional - fully qualified name)",
      "metadata": {
        "key": "value (optional - any additional data)"
      }
    }
  ],
  "edges": [
    {
      "source": "string (node id)",
      "target": "string (node id)",
      "type": "imports | defines | calls | instantiates | reads | writes | references | exports",
      "metadata": {
        "key": "value (optional - any additional data)"
      }
    }
  ]
}
```

**Example Request:**

```
GET /api/mcp/graph?scope=repo&max_nodes=2000&max_edges=4000
```

**Example Response:**

```json
{
  "nodes": [
    {
      "id": "file:backend/app/main.py",
      "type": "file",
      "label": "main.py",
      "filePath": "backend/app/main.py"
    },
    {
      "id": "function:backend/app/main.py:create_app",
      "type": "function",
      "label": "create_app",
      "filePath": "backend/app/main.py",
      "qualifiedName": "backend.app.main.create_app"
    }
  ],
  "edges": [
    {
      "source": "file:backend/app/main.py",
      "target": "function:backend/app/main.py:create_app",
      "type": "defines"
    }
  ]
}
```

**Error Responses:**

- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing or invalid Clerk token
- `403 Forbidden` - Invalid access key
- `500 Internal Server Error` - MCP service communication failure
- `503 Service Unavailable` - MCP service not running

---

### 2. Get Function Context

**Endpoint:** `GET /api/mcp/function/{function_name}`

**Description:** Returns the context graph for a specific function, showing its dependencies and dependents within a specified number of hops.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `function_name` | string | Yes | Name of the function to analyze |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file_path` | string | No | - | Optional file path to disambiguate functions with the same name |
| `max_hops` | integer | No | 2 | Maximum number of hops from the center node |
| `max_nodes` | integer | No | 150 | Maximum number of nodes to return |

**Response Schema:**

```json
{
  "nodes": [
    {
      "id": "string",
      "type": "file | function | class | variable | module",
      "label": "string",
      "filePath": "string (optional)",
      "qualifiedName": "string (optional)",
      "metadata": {}
    }
  ],
  "edges": [
    {
      "source": "string",
      "target": "string",
      "type": "imports | defines | calls | instantiates | reads | writes | references | exports",
      "metadata": {}
    }
  ],
  "centerNode": {
    "id": "string",
    "type": "function",
    "label": "string",
    "filePath": "string",
    "qualifiedName": "string",
    "metadata": {}
  }
}
```

**Example Request:**

```
GET /api/mcp/function/create_app?file_path=backend/app/main.py&max_hops=2
```

---

### 3. Get File Dependents

**Endpoint:** `GET /api/mcp/file/{file_path}/dependents`

**Description:** Returns all files that depend on or are depended upon by a specific file.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Path to the file to analyze (URL-encoded) |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `direction` | string | No | "incoming" | `"incoming"` (files that depend on this file), `"outgoing"` (files this file depends on), or `"both"` |
| `depth` | integer | No | 1 | How many levels deep to traverse |
| `max_files` | integer | No | 200 | Maximum number of files to return |

**Response Schema:**

```json
{
  "files": [
    "string (file path)"
  ],
  "dependencies": [
    {
      "filePath": "string",
      "dependencyType": "incoming | outgoing",
      "metadata": {}
    }
  ]
}
```

**Example Request:**

```
GET /api/mcp/file/backend%2Fapp%2Fmain.py/dependents?direction=incoming&depth=1
```

**Example Response:**

```json
{
  "files": [
    "backend/app/routers/auth.py",
    "backend/app/routers/campaigns.py"
  ],
  "dependencies": [
    {
      "filePath": "backend/app/routers/auth.py",
      "dependencyType": "incoming",
      "metadata": {
        "importCount": 3
      }
    }
  ]
}
```

---

### 4. Get Symbol References

**Endpoint:** `GET /api/mcp/symbol/{symbol_name}/references`

**Description:** Returns all references to a specific symbol (function, class, variable) across the codebase.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol_name` | string | Yes | Name of the symbol to search for |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `include_reads` | boolean | No | true | Include read references |
| `include_writes` | boolean | No | true | Include write references |
| `include_calls` | boolean | No | true | Include function call references |
| `max_results` | integer | No | 300 | Maximum number of references to return |

**Response Schema:**

```json
{
  "symbol": {
    "id": "string",
    "type": "function | class | variable | module",
    "label": "string",
    "filePath": "string",
    "qualifiedName": "string",
    "metadata": {}
  },
  "references": [
    {
      "filePath": "string",
      "line": "integer (1-indexed)",
      "column": "integer (0-indexed)",
      "referenceType": "read | write | call",
      "context": "string (optional - surrounding code snippet)"
    }
  ]
}
```

**Example Request:**

```
GET /api/mcp/symbol/create_app/references?include_calls=true&max_results=100
```

**Example Response:**

```json
{
  "symbol": {
    "id": "function:backend/app/main.py:create_app",
    "type": "function",
    "label": "create_app",
    "filePath": "backend/app/main.py",
    "qualifiedName": "backend.app.main.create_app"
  },
  "references": [
    {
      "filePath": "backend/app/__init__.py",
      "line": 5,
      "column": 10,
      "referenceType": "call",
      "context": "app = create_app()"
    }
  ]
}
```

---

## Implementation Notes for Backend Team

### 1. MCP Service Communication

The backend must communicate with the MCP Context Manager service via **stdio** (standard input/output). The MCP service runs in a Docker container and exposes tools via the Model Context Protocol.

**Recommended Approach:**

```python
import subprocess
import json

def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """
    Call an MCP tool via stdio subprocess.
    
    Args:
        tool_name: Name of the MCP tool (e.g., "export_dependency_graph")
        arguments: Tool arguments as a dictionary
    
    Returns:
        Tool response as a dictionary
    """
    # Start MCP service subprocess
    process = subprocess.Popen(
        ["node", "/path/to/mcp-service/index.js"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Send MCP protocol request
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    
    stdout, stderr = process.communicate(json.dumps(request))
    
    if process.returncode != 0:
        raise Exception(f"MCP tool call failed: {stderr}")
    
    return json.loads(stdout)
```

### 2. Caching Strategy

To reduce load on the MCP service, implement caching:

- **Cache TTL:** 30-60 seconds
- **Cache Key:** Endpoint + query parameters
- **Cache Backend:** Redis (recommended) or in-memory dict

### 3. Error Handling

Handle these error scenarios:

1. **MCP Service Not Running:** Return `503 Service Unavailable`
2. **Invalid Tool Arguments:** Return `400 Bad Request` with validation errors
3. **Timeout:** Set 10-second timeout for MCP calls, return `504 Gateway Timeout`
4. **Auth Failures:** Return `401` or `403` as appropriate

### 4. Rate Limiting

Apply existing rate limiting to MCP endpoints to prevent abuse.

### 5. Logging

Log all MCP tool calls with:
- Tool name
- Arguments
- Response time
- Success/failure status

---

## Frontend Implementation Status

✅ **Complete:**
- Type definitions (`frontend/src/types/mcp.ts`)
- API client (`frontend/src/api/mcp.ts`)
- React Query hooks (`frontend/src/hooks/use-mcp-graph.ts`)
- DependencyGraph component (`frontend/src/components/mcp/DependencyGraph.tsx`)
- SymbolSearch component (`frontend/src/components/mcp/SymbolSearch.tsx`)
- FileTree component (`frontend/src/components/mcp/FileTree.tsx`)
- Main MCP page (`frontend/src/pages/MCPPage.tsx`)
- Route integration (`/mcp`)

---

## Testing Checklist for Backend

Once the backend endpoints are implemented, test:

1. ✅ `/api/mcp/graph?scope=repo` returns valid graph with nodes and edges
2. ✅ `/api/mcp/function/{name}` returns function context with centerNode
3. ✅ `/api/mcp/file/{path}/dependents` returns file dependencies
4. ✅ `/api/mcp/symbol/{name}/references` returns symbol references
5. ✅ All endpoints return proper error responses (400, 401, 403, 500, 503)
6. ✅ Zod validation passes on frontend for all responses
7. ✅ Graph renders correctly in React Flow
8. ✅ Search and file tree work with real data

---

## Questions or Issues?

If the backend team encounters any issues or needs clarification:

1. Check the MCP Context Manager documentation in `services/mcp-context-manager/`
2. Review the MCP protocol specification
3. Log issues to `issues/issue.md` with [BACKEND] prefix
4. Tag the frontend architect for API contract questions

---

**End of API Contract Specification**
