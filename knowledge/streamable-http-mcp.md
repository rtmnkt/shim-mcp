# Streamable HTTP MCP (Model Context Protocol)

## Overview
MCP (Model Context/Communication Protocol) is an informal umbrella term for line-oriented JSON messages that pass between:
- **Orchestrator/front-end** (e.g., gateway speaking OpenAI, ChatGPT, or OSS APIs)
- **Model worker/inference-engine** (e.g., vLLM, llama.cpp, TGI)

## Transport Bindings

### 1. stdio MCP
- Messages go over worker's stdin/stdout pipes
- Framing via "\n" separating JSON messages
- Concurrency multiplexed in user land

### 2. HTTP-stream MCP
- Messages go over single HTTP request/response with chunked transfer or HTTP/2 DATA frames
- Same message format as stdio, different transport

## Message Format

Every message is UTF-8 JSON object terminated by "\n":

```json
{"type":"request","id":"abc123","body":{"prompt":"Hello"}}\n
{"type":"chunk","id":"abc123","body":{"choices":[{"text":"Hi"}]}}\n
{"type":"response_end","id":"abc123","body":{"finish_reason":"stop"}}\n
```

### Common Message Types
- `type`: "model_load", "request", "chunk", "error", "response_end"
- `id`: request correlation ID (string)
- `body`: payload whose schema depends on type
- `created`: unix-epoch milliseconds (optional)

## HTTP-stream MCP Implementation

### Request Flow
1. Orchestrator opens HTTP/1.1 or HTTP/2 POST to `/mcp` or `/invoke`
2. Request body streamed/chunked or sent as full JSON array
3. Worker responds with status 200 and `Transfer-Encoding: chunked`
4. Each HTTP response chunk is single newline-terminated JSON object
5. Stream ends when worker flushes final `response_end` message

### Framing Choices
- **HTTP/1.1 + chunked transfer-encoding**: Simplest, works through most load balancers
- **HTTP/2 streaming**: Lower head-of-line blocking, parallel logical requests
- **Server-Sent-Events (SSE)**: Wraps each JSON line in "data: …\n\n"
- **WebSocket**: For browsers that cannot keep request open

### Concurrency Model
- Multiple user prompts interleaved in same HTTP TCP connection
- Each JSON object carries own `"id"` field
- Worker can queue requests and answer sequentially

## Implementation Patterns

### Pattern A: Single long-lived connection
- Worker keeps one HTTP connection open to orchestrator
- Pulls new requests (reverse-proxy style)
- Advantage: Easy deployment behind firewalls

### Pattern B: Push model (common)
- Orchestrator POSTs to worker
- Kubernetes Service/Ingress fronts worker pods
- Scaling via Horizontal Pod Autoscaler

### Pattern C: gRPC mapping
- Same message format, use gRPC streaming RPC
- HTTP/2 multiplexing, built-in deadlines, compression

## stdio vs HTTP MCP Comparison

| Aspect | stdio MCP | HTTP-stream MCP |
|--------|-----------|-----------------|
| Transport | POSIX pipes | HTTP/1.1 chunked, HTTP/2, SSE, WebSocket |
| Deployment | Worker as forked binary | Worker as standalone server/pod |
| Supervision | Orchestrator must respawn | k8s/systemd/container runtime |
| Multiplexing | Required in protocol layer | Native in HTTP/2, via `"id"` field |
| Back-pressure | OS pipe buffers | HTTP flow control/window updates |
| Observability | Harder (no headers/metrics) | Standard HTTP metrics, ALB/NLB logs |
| TLS/auth | DIY (ssh, mTLS to pipes) | Off-the-shelf TLS, OAuth, JWT |
| Hot-upgrade | Replace binary → restart | Blue/green or rolling pod update |
| Latency | Slightly lower | Negligible in practice (>0.1 ms) |

## Wire Example (HTTP/1.1, chunked)

### Request
```http
POST /mcp HTTP/1.1
Host: worker-0
Transfer-Encoding: chunked
Content-Type: application/x-ndjson

32\r\n
{"type":"request","id":"1","body":{"prompt":"Hi"}}\n\r\n
0\r\n
\r\n
```

### Response
```http
HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Transfer-Encoding: chunked

36\r\n
{"type":"chunk","id":"1","body":{"choices":[{"text":"H"}]}}\n\r\n
2c\r\n
{"type":"chunk","id":"1","body":{"choices":[{"text":"i"}]}}\n\r\n
3a\r\n
{"type":"response_end","id":"1","body":{"finish_reason":"stop"}}\n\r\n
0\r\n
\r\n
```

## Implementation Tips

### Best Practices
- Set `Content-Type: application/x-ndjson` or `text/event-stream`
- Disable proxy buffering (Nginx: `proxy_buffering off`)
- Set maximum JSON line length (e.g., 16 MiB)
- Stream tokens frequently to avoid head-of-line blocking

### Keep-alive & Back-pressure
- Emit keep-alive comments (`:`) or empty JSON (`{}`) for long pauses
- Honor `socket.write()` return codes
- Pause token generation if downstream client is slow
- Tune HTTP/2 flow-control window for large tokens

### Error Handling
- HTTP status ≠ 200 → transport-level failure (500, 503)
- Inside 200 stream: emit `{"type":"error", ...}` for application errors

## Reference Implementations
- HuggingFace Text-Generation-Inference (TGI): `src/grpc_server.cpp`
- vLLM: `fastapi_app.py` (SSE streaming)
- llama.cpp: `llama_server.cpp` (WebSocket + NDJSON)

## Key Advantages
- Works across machine boundaries
- Leverages commodity HTTP infrastructure
- Enables modern scaling patterns
- Standard observability and security

## Key Disadvantages
- Slightly more overhead than stdio
- Need to manage HTTP keep-alive and proxy quirks