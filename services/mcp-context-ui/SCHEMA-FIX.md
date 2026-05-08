# MCP Context UI - Schema Fix Report

**Date:** 2026-04-27  
**Issue:** Zod Validation Failures (~2000 nodes)  
**Status:** ✅ FIXED

## Problem Description

The user reported massive Zod validation failures in the browser console:

```
ZodError: [
  {
    "code": "invalid_enum_value",
    "received": "external",
    "path": ["nodes", 0, "type"],
    "message": "Invalid input"
  },
  ... (~2000 similar errors)
]
```

## Root Cause Analysis

### Backend Schema (services/mcp-context-manager/src/types/schema.ts)

```typescript
export type SymbolKind = "file" | "module" | "function" | "class" | "variable" | "external";
```

The backend defines 6 node types, including **"external"** for symbols imported from external packages.

### Frontend Schema (services/mcp-context-ui/src/types/mcp.ts) - BEFORE FIX

```typescript
export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "function", "class", "variable", "module"]), // ❌ Missing "external"
  label: z.string(),
  // ...
});
```

The frontend Zod schema only defined 5 node types, **missing "external"**.

### Why Track 1 Missed This

Track 1 validation in `test-results-track1.md` claimed:

> ✅ No schema mismatches detected

However, Track 1 only validated:
1. HTTP status codes (200 OK)
2. Response structure (top-level keys)
3. Field presence (required fields exist)
4. Field types (string, number, etc.)

**Track 1 did NOT validate enum values** - it didn't check if the actual node types returned by the backend matched the frontend's enum definition.

## The Fix

### Updated Frontend Schema (services/mcp-context-ui/src/types/mcp.ts) - AFTER FIX

```typescript
export const NodeSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "function", "class", "variable", "module", "external"]), // ✅ Added "external"
  label: z.string(),
  // ...
});
```

**Change:** Added `"external"` to the node type enum to match the backend's `SymbolKind` type.

## Verification

### 1. Schema Alignment

| Backend (SymbolKind) | Frontend (NodeSchema.type) | Status |
|---------------------|---------------------------|--------|
| file                | file                      | ✅ Match |
| module              | module                    | ✅ Match |
| function            | function                  | ✅ Match |
| class               | class                     | ✅ Match |
| variable            | variable                  | ✅ Match |
| external            | external                  | ✅ **FIXED** |

### 2. Container Rebuild

**Issue:** Initial rebuild with `docker compose -f docker-compose.mcp.yml build --no-cache` didn't pick up the changes due to Docker layer caching.

**Solution:** Complete rebuild process:
```bash
# Stop and remove container
docker compose -f docker-compose.mcp.yml stop mcp-ui
docker compose -f docker-compose.mcp.yml rm -f mcp-ui

# Remove the image
docker rmi mcp-context-ui

# Rebuild from scratch with no cache and fresh base images
docker compose -f docker-compose.mcp.yml build --no-cache --pull mcp-ui

# Start the container
docker compose -f docker-compose.mcp.yml up -d mcp-ui
```

**Verification:**
```bash
# Verify the built JavaScript includes "external"
docker compose -f docker-compose.mcp.yml exec mcp-ui sh -c 'cat /usr/share/nginx/html/assets/*.js | grep -o "file.*function.*class.*variable.*module.*external"'
# Output: file","function","class","variable","module","external ✅
```

The container was successfully rebuilt with the updated schema.

### 3. Expected Behavior

After the fix:
- ✅ No Zod validation errors in browser console
- ✅ All ~2000 nodes validate successfully
- ✅ React Flow graph renders without errors
- ✅ External symbols (e.g., imported from npm packages) display correctly

## What Are "External" Nodes?

External nodes represent symbols that are:
- Imported from external packages (e.g., `react`, `lodash`, `axios`)
- Not defined in the current codebase
- Referenced but not owned by the project

Example:
```typescript
import { useState } from 'react'; // "useState" is an external symbol
import axios from 'axios';         // "axios" is an external symbol
```

These symbols are tracked in the dependency graph to show:
- What external dependencies the codebase uses
- Which files import which external packages
- How external APIs are called throughout the codebase

## Lessons Learned

### For Future Track 1 Validations

Track 1 should validate:
1. ✅ HTTP status codes
2. ✅ Response structure
3. ✅ Field presence
4. ✅ Field types
5. **❌ Enum value alignment** ← This was missing!

### Recommended Track 1 Enhancement

Add enum validation to Track 1:

```bash
# Example: Validate node types match frontend schema
curl -s http://localhost:8000/api/mcp/graph | \
  jq -r '.nodes[].type' | \
  sort -u | \
  diff - <(echo -e "class\nexternal\nfile\nfunction\nmodule\nvariable")
```

This would catch enum mismatches before Track 2.

## Conclusion

✅ **Schema mismatch identified and fixed**  
✅ **Frontend now accepts all 6 node types from backend**  
✅ **Container rebuilt and restarted**  
✅ **Ready for browser verification**

The Zod validation errors should now be resolved. The user can verify by:
1. Opening `http://localhost:8080` in browser
2. Opening DevTools console (F12)
3. Confirming no Zod validation errors appear
4. Verifying the graph renders successfully with all nodes visible

