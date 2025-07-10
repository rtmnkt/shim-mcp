# ShimMCP - Generic MCP Proxy

A generic proxy for Model Context Protocol (MCP) that enables stdio-to-HTTP transport translation with session multiplexing. This allows multiple stdio-based MCP clients to share a single backend MCP server, solving resource conflicts and enabling more efficient resource utilization.

## Features

- **Transport Translation**: Seamlessly converts between stdio and HTTP transports
- **Session Multiplexing**: Multiple clients can share a single backend server
- **Process Management**: Automatic backend server lifecycle management
- **Flow Control**: Prevents head-of-line blocking between clients
- **Backend Adapters**: Support for different server types (OpenAI, Claude, generic)
- **Auto-restart**: Automatic recovery from backend crashes
- **Health Monitoring**: Continuous health checks with automatic failover

## Architecture

```
stdio clients      ┌───────────┐     HTTP/WS      ┌─────────────┐
(N processes) ───▶ │  shim /   ├──────────────────▶│ MCP server  │
                   │  proxy    │                  └─────────────┘
                   └───────────┘
                   ▲   ▲   ▲
                   │   │   └─ lifecycle manager (spawn, monitor)
                   │   └───── session router / multiplexer  
                   └───────── transport adapter (stdio ⇔ HTTP)
```

## Installation

```bash
npm install
npm run build
```

## Usage

### Command Line Interface

```bash
# Basic usage
./dist/bin/shim.js --backend "python mcp-server.py --port 3000"

# With authentication
./dist/bin/shim.js --backend "node server.js" --server-type openai --auth-token sk-...

# Using configuration file
./dist/bin/shim.js --config ./configs/my-config.json

# Debug mode
./dist/bin/shim.js --backend "python server.py" --debug
```

### Programmatic Usage

```typescript
import { createShimMCPProxy } from 'shim-mcp';

const server = await createShimMCPProxy(
  ['python', 'mcp-server.py', '--port', '3000'],
  {
    maxConcurrentSessions: 10,
    backendAdapter: {
      serverType: 'generic',
      authToken: 'your-token-here'
    }
  }
);

// Server is now running and ready to accept stdio clients
```

### As a Drop-in Replacement

Replace your existing MCP server binary with the shim:

```bash
# Before: clients call your MCP server directly
# my-editor-config.json: { "mcp_server": "/path/to/original-server" }

# After: clients call the shim instead
# my-editor-config.json: { "mcp_server": "/path/to/shim-mcp" }
```

## Configuration

### Configuration File Format

```json
{
  "backend": {
    "command": ["python", "mcp-server.py"],
    "workingDirectory": "/path/to/server",
    "environment": {
      "PYTHONPATH": "./backend"
    },
    "healthCheckUrl": "http://localhost:3000/health",
    "restartPolicy": "on-failure",
    "maxRestartAttempts": 3,
    "idleTimeout": 600000
  },
  "httpHost": "127.0.0.1",
  "httpPort": 3000,
  "maxConcurrentSessions": 50,
  "sessionIdleTimeout": 600000,
  "backendAdapter": {
    "serverType": "generic",
    "authToken": "your-token-here",
    "customHeaders": {
      "X-Custom-Header": "value"
    }
  }
}
```

### Environment Variables

Environment variables in configuration files are automatically expanded:

```json
{
  "backend": {
    "command": ["python", "server.py"],
    "environment": {
      "API_KEY": "${MY_API_KEY}"
    }
  },
  "backendAdapter": {
    "authToken": "${OPENAI_API_KEY}"
  }
}
```

## Backend Adapters

### Generic Adapter (Default)

Works with any MCP-compliant server:

```json
{
  "backendAdapter": {
    "serverType": "generic"
  }
}
```

### OpenAI Adapter

Optimized for OpenAI-compatible servers:

```json
{
  "backendAdapter": {
    "serverType": "openai",
    "authToken": "sk-...",
    "customHeaders": {
      "OpenAI-Organization": "org-..."
    }
  }
}
```

### Claude Adapter

Optimized for Anthropic Claude servers:

```json
{
  "backendAdapter": {
    "serverType": "claude",
    "authToken": "sk-ant-...",
    "version": "2023-06-01"
  }
}
```

## API Reference

### ShimMCPServer

Main server class for programmatic usage.

```typescript
import { ShimMCPServer, ShimMCPConfig } from 'shim-mcp';

const server = new ShimMCPServer();
await server.start(config);

// Get status
const status = server.getStatus();

// Stop server
await server.stop();
```

### Configuration Types

```typescript
interface ShimMCPConfig {
  backend: ProcessManagerConfig;
  httpHost?: string;
  httpPort?: number;
  maxConcurrentSessions?: number;
  sessionIdleTimeout?: number;
  backendAdapter?: BackendAdapterConfig;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Running in Development

```bash
npm run dev
```

## Examples

See the `configs/` directory for example configurations:

- `example-python-server.json` - Python MCP server
- `example-openai-server.json` - OpenAI-compatible server

## Troubleshooting

### Debug Mode

Enable debug logging for detailed information:

```bash
./dist/bin/shim.js --backend "your-server" --debug
```

### Common Issues

1. **Backend server not starting**: Check command and working directory
2. **Health check failures**: Ensure health check URL is correct
3. **Session timeouts**: Adjust session idle timeout settings
4. **Port conflicts**: Change HTTP port in configuration

### Logs

The shim provides structured logging with different levels:

- `error`: Critical errors only
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

For issues and questions, please use the GitHub issue tracker.