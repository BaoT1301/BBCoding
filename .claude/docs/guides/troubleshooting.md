# Troubleshooting: SSE Connection Issues, R3F Performance Tuning, WebGL Context Loss

---

## 1. SSE Connection Issues

### How SSE Connections Work

The frontend connects to the backend via Server-Sent Events (SSE) at `/api/mcp/events`. The `SSEClient` class manages the connection lifecycle, including automatic reconnection with exponential backoff.

### Exponential Backoff Behavior

When the SSE connection drops, the client reconnects using exponential backoff:

| Attempt | Delay    |
|---------|----------|
| 1       | 1,000ms  |
| 2       | 2,000ms  |
| 3       | 4,000ms  |
| 4       | 8,000ms  |
| 5       | 16,000ms |
| 6+      | 30,000ms (cap) |

The delay doubles after each failed attempt, capped at 30 seconds (`MAX_RETRY_MS`). On successful reconnection, the delay resets to 1 second (`INITIAL_RETRY_MS`).

### Reconnection Notifications

- **First connection:** No notification (silent).
- **Reconnection after a drop:** The `connectionRestoredCallbacks` fire, triggering a toast notification in the UI.
- **Connection lost:** The `connectionLostCallbacks` fire when the connection drops after having been previously connected.

### Nginx Proxy Configuration

The SSE endpoint is proxied through nginx with these critical settings:

```nginx
location /api/mcp/events {
    proxy_pass http://mcp-context-manager:3001;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

Key points:
- `proxy_buffering off` — Required for SSE. Without this, nginx buffers responses and events arrive in batches instead of real-time.
- `proxy_cache off` — Prevents caching of the event stream.
- `proxy_read_timeout 3600s` — Keeps the connection alive for up to 1 hour. If the backend doesn't send any data (including keepalives) within this window, nginx closes the connection.
- `Connection ""` — Ensures HTTP/1.1 keep-alive is used between nginx and the backend.

### Health Check

Verify the SSE endpoint is reachable:

```bash
curl -N http://localhost/api/mcp/events/health
```

A healthy response confirms the mcp-context-manager service is running and accepting connections.

### Common Causes of SSE Failures

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Connection drops every 60s | Default `proxy_read_timeout` (60s) overriding the SSE config | Ensure the `/api/mcp/events` location block has `proxy_read_timeout 3600s` |
| No events received | `proxy_buffering` is on | Add `proxy_buffering off` to the SSE location block |
| Connection refused | mcp-context-manager service is down | Check `docker-compose logs mcp-context-manager` |
| Firewall blocking | Corporate proxy/firewall dropping long-lived connections | Use a VPN or configure the proxy to allow SSE |
| Immediate disconnect loop | Backend crashing on startup | Check backend logs for startup errors |

---

## 2. R3F Performance Tuning

### LOD (Level of Detail) System

The globe visualizer uses a Level of Detail system to manage rendering performance. Nodes are rendered with varying complexity based on camera distance and visibility:

- **High detail:** Full labels, connection arcs, and glow effects. Used when the camera is close to a globe.
- **Medium detail:** Simplified labels, reduced arc segments. Used at moderate distances.
- **Low detail:** Dots only, no labels or arcs. Used when the camera is far away or many globes are visible.

### "Show All Details" Warning

Enabling "Show All Details" forces high-detail rendering for all nodes regardless of distance. This bypasses the LOD system and can cause:
- Frame rate drops below 30fps on large repositories
- Increased GPU memory usage
- Browser tab becoming unresponsive

**Recommendation:** Only use "Show All Details" for screenshots or presentations. Disable it during normal exploration.

### Reducing Node Count via Cluster Filtering

If performance is poor with many files:
1. Use cluster filtering to show only the clusters you're working with.
2. Reduce the number of clusters in `cluster-config.json` to group related files more aggressively.
3. Consider splitting very large clusters (1000+ files) into sub-clusters.

### Memory Limits

The `mcp-context-manager` service runs with a 512MB memory limit in docker-compose. For large repositories (10,000+ files):
- The graph export may approach this limit.
- Monitor with `docker stats mcp-context-manager`.
- If OOM kills occur, increase the memory limit in `docker-compose.yml`:

```yaml
services:
  mcp-context-manager:
    mem_limit: 1024m
```

### General Performance Tips

- Keep cluster count between 2–5 for optimal rendering.
- Close browser DevTools when not debugging (DevTools adds rendering overhead).
- Use Chrome/Edge for best WebGL performance (V8 + Angle backend).
- Avoid running multiple tabs with WebGL content simultaneously.

---

## 3. WebGL Context Loss

### What Is WebGL Context Loss?

WebGL contexts are GPU resources managed by the browser. A "context loss" event means the GPU has reclaimed the resources used by the 3D globe, causing the canvas to go blank or display errors.

### Common Causes

| Cause | Description |
|-------|-------------|
| GPU driver crash | The graphics driver encountered an error and reset |
| Too many WebGL contexts | Browsers limit active WebGL contexts (typically 8–16). Exceeding this causes the oldest contexts to be lost |
| System sleep/wake | Laptops resuming from sleep may lose GPU state |
| GPU memory exhaustion | Other applications or tabs consuming all VRAM |
| Browser update | Some browser updates reset GPU processes |

### Recovery

When WebGL context is lost:
1. **Reload the page** — This is the most reliable recovery method. The R3F renderer will reinitialize with a fresh WebGL context.
2. **Check for error messages** — The browser console may show `CONTEXT_LOST_WEBGL` events.
3. **If reloading doesn't help** — Close other WebGL-heavy tabs, then reload.

### Prevention

- **Close unused tabs** with WebGL content (other 3D visualizers, games, maps with WebGL rendering).
- **Update GPU drivers** — Outdated drivers are the most common cause of context loss.
- **Avoid hardware acceleration conflicts** — If using multiple monitors or external GPUs, ensure drivers support the configuration.
- **Monitor context count** — In Chrome DevTools, navigate to `chrome://gpu` to see active WebGL contexts.
- **Reduce globe complexity** — Fewer nodes and arcs means less GPU memory pressure.

### Browser-Specific Notes

| Browser | Max Contexts | Notes |
|---------|-------------|-------|
| Chrome/Edge | ~16 | Shares limit across all tabs |
| Firefox | ~16 | May vary by GPU driver |
| Safari | ~8 | More aggressive context eviction |

If you consistently hit context limits, consider closing the globe visualizer tab when not actively using it.
