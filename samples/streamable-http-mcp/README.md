# Streamable HTTP MCP Server Sample (TypeScript SDK)

This sample demonstrates a proper implementation of a streamable HTTP MCP (Model Context Protocol) server using the **official @modelcontextprotocol/sdk**. It can be connected to ShimMCP for stdio-to-HTTP transport translation.

## Features

- **Official MCP TypeScript SDK** compliance
- **StreamableHTTPServerTransport** for proper HTTP handling
- **Proper tools, resources, and prompts** implementation
- **Type safety** with zod schemas
- **Session management** and state handling
- **Graceful error handling** and shutdown
- **Health check endpoint** for monitoring
- **Comprehensive test suite** with SDK patterns

## Quick Start

### 1. Install Dependencies

```bash
cd samples/streamable-http-mcp
npm install
```

### 2. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://127.0.0.1:3000` by default.

### 3. Test the Server

```bash
# Health check
curl http://127.0.0.1:3000/health

# Status check
curl http://127.0.0.1:3000/status

# Run comprehensive tests
npm test
```

### 4. Connect via ShimMCP

Use the provided configuration files to connect through ShimMCP:

```bash
# Using full configuration
./dist/bin/shim.js --config ./configs/streamable-http-mcp-example.json

# Using minimal configuration
./dist/bin/shim.js --config ./configs/streamable-http-mcp-minimal.json
```

### 5. Test with MCP Client

The server now supports proper MCP protocol features:

```bash
# Test tools
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"generate-text","arguments":{"prompt":"Hello, world!"}}}'

# Test resources
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"resources/read","params":{"uri":"server-status"}}'

# Test prompts
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"prompts/get","params":{"name":"example-prompt","arguments":{"topic":"AI","tone":"technical"}}}'
```

## Configuration Options

### Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 127.0.0.1)
- `NODE_ENV`: Environment mode (default: development)

### ShimMCP Configuration

See configuration files in `configs/`:
- `streamable-http-mcp-example.json` - Full configuration with all options
- `streamable-http-mcp-minimal.json` - Minimal configuration for quick start

## API Endpoints

### POST /mcp

Main MCP endpoint using official SDK patterns.

**Tools Available:**
- `generate-text`: Generate mock text with streaming simulation
- `generate-text-streaming`: Generate text with progress notifications

**Resources Available:**
- `server-status`: Current server status and statistics
- `tools-list`: List of available tools and resources

**Prompts Available:**
- `example-prompt`: Example prompt template
- `help-prompt`: Help and usage information

**Request Format (Tool Call):**
```json
{
  "method": "tools/call",
  "params": {
    "name": "generate-text",
    "arguments": {
      "prompt": "Your text prompt here",
      "max_tokens": 100,
      "temperature": 0.7
    }
  }
}
```

**Response Format (Tool Result):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Generated response text..."
    }
  ],
  "metadata": {
    "tokens_used": 25,
    "temperature": 0.7,
    "max_tokens": 100
  }
}
```

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "server": "streamable-http-mcp-sample",
  "version": "1.0.0",
  "protocol": "MCP with TypeScript SDK",
  "activeSessions": 0,
  "uptime": 123.456,
  "timestamp": "2023-11-04T12:34:56.789Z"
}
```

### GET /status

Detailed status information.

**Response:**
```json
{
  "server": {
    "name": "streamable-http-mcp-sample",
    "version": "1.0.0",
    "protocol": "MCP with TypeScript SDK",
    "transport": "StreamableHTTPServerTransport",
    "uptime": 123.456,
    "memory": {...},
    "pid": 12345
  },
  "sessions": {
    "active": 0,
    "total": 0,
    "details": []
  },
  "timestamp": "2023-11-04T12:34:56.789Z"
}
```

## MCP Protocol Features

### Tools

#### generate-text
- **Purpose**: Generate mock text with streaming simulation
- **Input Schema**: `{ prompt: string, max_tokens?: number, temperature?: number }`
- **Output**: Text content with metadata

#### generate-text-streaming
- **Purpose**: Generate text with progress notifications
- **Input Schema**: `{ prompt: string, steps?: number }`
- **Output**: Text content with step completion metadata

### Resources

#### server-status
- **URI**: `server-status`
- **MIME Type**: `application/json`
- **Content**: Current server status and statistics

#### tools-list
- **URI**: `tools-list`
- **MIME Type**: `text/plain`
- **Content**: List of available tools and resources

### Prompts

#### example-prompt
- **Arguments**: `{ topic: string, tone: 'formal' | 'casual' | 'technical' }`
- **Purpose**: Example prompt template for testing

#### help-prompt
- **Arguments**: `{ section?: 'tools' | 'resources' | 'prompts' | 'general' }`
- **Purpose**: Help and usage information

### SDK Integration

This server uses the official MCP TypeScript SDK patterns:

```typescript
// Tool registration
server.registerTool('generate-text', {
  title: 'Generate Mock Text',
  description: 'Generate mock text response',
  inputSchema: z.object({
    prompt: z.string().describe('The text prompt')
  })
}, async ({ prompt }) => {
  // Implementation
});

// Resource registration
server.registerResource('server-status', {
  title: 'Server Status',
  description: 'Current server status',
  mimeType: 'application/json'
}, async () => {
  // Implementation
});

// Prompt registration
server.registerPrompt('example-prompt', {
  title: 'Example Prompt',
  description: 'Example prompt template',
  arguments: z.object({
    topic: z.string().describe('Topic to generate about')
  })
}, async ({ topic }) => {
  // Implementation
});
```

## Development

### Development Mode

```bash
npm run dev
```

Uses `tsx` for TypeScript execution and automatic restart on file changes.

### Testing

```bash
# Comprehensive SDK-based tests
npm test

# Manual testing with curl
./test.sh

# TypeScript compilation
npm run build
```

### Environment Variables

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 127.0.0.1)
- `DEBUG`: Enable debug logging (default: false)

## Integration with ShimMCP

This server is designed to work with ShimMCP, which provides:

1. **stdio-to-HTTP translation**: Clients using stdio MCP can connect seamlessly
2. **Session multiplexing**: Multiple clients can share this single HTTP server
3. **Process management**: Automatic startup, health monitoring, and restart
4. **Flow control**: Prevents head-of-line blocking between clients
5. **SDK compatibility**: Full support for MCP TypeScript SDK features

### Connection Flow

```
stdio clients      ┌───────────┐     HTTP/SDK       ┌─────────────────────┐
(N processes) ───▶ │  ShimMCP  ├────────────────────▶│ MCP Server (SDK)    │
                   │  Proxy    │                    │ - Tools             │
                   └───────────┘                    │ - Resources         │
                                                    │ - Prompts           │
                                                    └─────────────────────┘
```

1. stdio clients connect to ShimMCP proxy
2. ShimMCP translates stdio messages to HTTP MCP format
3. MCP server processes requests using official SDK patterns
4. ShimMCP translates HTTP responses back to stdio format
5. stdio clients receive responses as if connecting directly

### Benefits of SDK Integration

- **Type Safety**: Full TypeScript type checking and validation
- **Protocol Compliance**: Guaranteed adherence to MCP specification
- **Feature Rich**: Support for tools, resources, prompts, and notifications
- **Maintainability**: Standardized patterns and error handling
- **Extensibility**: Easy addition of new tools and resources
- **Testing**: Comprehensive test suite with SDK client patterns

## SDK Documentation

For more information about the MCP TypeScript SDK:

- **GitHub**: https://github.com/modelcontextprotocol/typescript-sdk
- **Examples**: https://github.com/modelcontextprotocol/typescript-sdk/tree/main/src/examples
- **Documentation**: Official MCP specification and SDK documentation

## License

MIT License - see project root for details.