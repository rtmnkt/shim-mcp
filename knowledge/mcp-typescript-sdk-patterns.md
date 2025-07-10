# MCP TypeScript SDK Integration Patterns

## ⚠️ DISCLAIMER
This document contains **implementation assumptions** based on practical coding experience. The patterns shown worked in practice but may not represent official recommendations. For verified information, see `mcp-typescript-sdk-official.md`.

## Overview
This document covers implementation patterns attempted during the refactoring of the streamable HTTP MCP server sample. All patterns are marked as **ASSUMED** until officially verified.

## Core SDK Components (ASSUMED)

### 1. McpServer (ASSUMED PATTERN)
The main server class that handles MCP protocol communication:

```typescript
// ASSUMED: This import path and constructor pattern
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';

const server = new McpServer({
  name: 'your-server-name',
  version: '1.0.0',
});
```

### 2. StreamableHTTPServerTransport (ASSUMED PATTERN)
Transport layer for HTTP-based MCP communication:

```typescript
// ASSUMED: This import path and configuration options
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamable-http/index.js';

const transport = new StreamableHTTPServerTransport(req, res, {
  sessionId,
  enableJsonResponse: true,
  generateSessionId: () => sessionId,
});
```

### 3. Schema Validation with Zod (ASSUMED INTEGRATION)
Type-safe input validation for tools and prompts:

```typescript
// ASSUMED: Zod integration works this way
import { z } from 'zod';

const inputSchema = z.object({
  prompt: z.string().describe('The text prompt'),
  max_tokens: z.number().optional().describe('Maximum tokens'),
  temperature: z.number().min(0).max(2).optional().describe('Temperature'),
});
```

## Implementation Patterns (ALL ASSUMED)

### Tool Registration (ASSUMED PATTERN)
Tools are functions that can be called by MCP clients:

```typescript
server.registerTool(
  'tool-name',
  {
    title: 'Tool Title',
    description: 'Tool description',
    inputSchema: z.object({
      param: z.string().describe('Parameter description')
    }),
  },
  async ({ param }, { server }) => {
    // Tool implementation
    
    // Optional: Send notifications during processing
    await server.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken: randomUUID(),
        progress: 50,
        total: 100,
      },
    });
    
    return {
      content: [
        {
          type: 'text',
          text: 'Tool result text',
        },
      ],
      metadata: {
        custom_field: 'custom_value',
      },
    };
  }
);
```

### Resource Registration (ASSUMED PATTERN)
Resources provide static or dynamic content to clients:

```typescript
server.registerResource(
  'resource-uri',
  {
    title: 'Resource Title',
    description: 'Resource description',
    mimeType: 'application/json',
  },
  async () => {
    const data = {
      // Resource data
    };
    
    return {
      contents: [
        {
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);
```

### Prompt Registration (ASSUMED PATTERN)
Prompts provide templates for LLM interactions:

```typescript
server.registerPrompt(
  'prompt-name',
  {
    title: 'Prompt Title',
    description: 'Prompt description',
    arguments: z.object({
      topic: z.string().describe('Topic to discuss'),
      tone: z.enum(['formal', 'casual']).describe('Response tone'),
    }),
  },
  async ({ topic, tone }) => {
    const prompts = {
      formal: `Please provide a formal analysis of ${topic}.`,
      casual: `Hey! Can you tell me about ${topic}?`,
    };

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: prompts[tone],
          },
        },
      ],
    };
  }
);
```

### HTTP Integration with Express (ASSUMED PATTERN)
Combining MCP server with Express for HTTP handling:

```typescript
import express from 'express';

const app = express();
const mcpServer = createMcpServer();

// Session and transport management
const transports = new Map<string, StreamableHTTPServerTransport>();
const activeSessions = new Map<string, SessionData>();

app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['x-session-id'] as string || randomUUID();
  
  // Track session
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      startTime: Date.now(),
      lastActivity: Date.now(),
    });
  }

  // Get or create transport
  let transport = transports.get(sessionId);
  if (!transport) {
    transport = new StreamableHTTPServerTransport(req, res, {
      sessionId,
      enableJsonResponse: true,
      generateSessionId: () => sessionId,
    });
    
    transports.set(sessionId, transport);
    
    // Cleanup on close
    transport.onClose(() => {
      transports.delete(sessionId);
      activeSessions.delete(sessionId);
    });
  }

  // Connect server to transport
  await mcpServer.connect(transport);
});
```

## Session Management (ASSUMED PATTERNS)

### Session Tracking (ASSUMED)
```typescript
interface SessionData {
  startTime: number;
  lastActivity: number;
}

const activeSessions = new Map<string, SessionData>();

// Update activity
const updateSessionActivity = (sessionId: string) => {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
};
```

### Transport Lifecycle (ASSUMED)
```typescript
const manageTransportLifecycle = (sessionId: string, transport: StreamableHTTPServerTransport) => {
  // Store transport
  transports.set(sessionId, transport);
  
  // Handle cleanup
  transport.onClose(() => {
    transports.delete(sessionId);
    activeSessions.delete(sessionId);
    console.log(`Session ${sessionId} cleaned up`);
  });
  
  // Handle errors
  transport.onError((error) => {
    console.error(`Transport error for session ${sessionId}:`, error);
  });
};
```

## Error Handling (ASSUMED PATTERNS)

### Tool Error Handling (ASSUMED)
```typescript
server.registerTool('example-tool', schema, async (args) => {
  try {
    // Tool implementation
    return result;
  } catch (error) {
    // SDK will automatically convert thrown errors to proper MCP error responses
    throw new Error(`Tool execution failed: ${error.message}`);
  }
});
```

### Transport Error Handling (ASSUMED)
```typescript
app.all('/mcp', async (req, res) => {
  try {
    // MCP handling logic
    await mcpServer.connect(transport);
  } catch (error) {
    console.error('MCP request error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});
```

## Notifications and Progress (ASSUMED PATTERNS)

### Progress Notifications (ASSUMED)
```typescript
await server.sendNotification({
  method: 'notifications/progress',
  params: {
    progressToken: randomUUID(),
    progress: currentStep,
    total: totalSteps,
  },
});
```

### Message Notifications (ASSUMED)
```typescript
await server.sendNotification({
  method: 'notifications/message',
  params: {
    level: 'info',
    logger: 'tool-name',
    data: 'Processing step completed',
  },
});
```

## Testing Patterns (ASSUMED)

### Client-side Testing (ASSUMED PATTERN)
```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamable-http/index.js';

const setupTestClient = async () => {
  const transport = new StreamableHTTPClientTransport({
    url: 'http://localhost:3000/mcp',
    headers: {
      'x-session-id': randomUUID(),
    },
  });

  const client = new McpClient({
    name: 'test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return client;
};

// Test tool calls
const testTool = async (client: McpClient) => {
  const result = await client.callTool({
    name: 'tool-name',
    arguments: {
      param: 'test-value',
    },
  });
  
  // Assertions
  expect(result.content).toBeDefined();
  expect(result.content[0].type).toBe('text');
};
```

## Best Practices

### 1. Type Safety
- Always use zod schemas for input validation
- Define proper TypeScript interfaces for internal data structures
- Leverage SDK's built-in type safety features

### 2. Error Handling
- Use try-catch blocks in tool implementations
- Provide meaningful error messages
- Log errors appropriately for debugging

### 3. Session Management
- Implement proper session tracking
- Clean up resources on session end
- Handle session timeouts gracefully

### 4. Performance
- Use efficient data structures for session storage
- Implement connection pooling if needed
- Monitor memory usage for long-running sessions

### 5. Testing
- Write comprehensive tests for all tools, resources, and prompts
- Test error conditions and edge cases
- Use the official SDK client for testing

## Migration from Custom Implementation

### Before (Custom Implementation)
```javascript
// Custom message handling
app.post('/mcp', (req, res) => {
  const { type, id, body } = req.body;
  
  if (type === 'request') {
    // Custom request handling
    res.write(JSON.stringify({
      type: 'chunk',
      id,
      body: { choices: [{ text: 'response' }] }
    }) + '\n');
  }
});
```

### After (SDK Implementation)
```typescript
// SDK-based implementation
server.registerTool('generate-text', {
  title: 'Generate Text',
  inputSchema: z.object({
    prompt: z.string()
  })
}, async ({ prompt }) => {
  return {
    content: [{
      type: 'text',
      text: `Response to: ${prompt}`
    }]
  };
});
```

## Benefits of SDK Integration (OBSERVED IN PRACTICE)

1. **Protocol Compliance**: Assumed adherence to MCP specification
2. **Type Safety**: Full TypeScript support with compile-time checking (CONFIRMED)
3. **Feature Rich**: Built-in support for tools, resources, prompts, notifications (ASSUMED)
4. **Error Handling**: Standardized error responses and handling (ASSUMED)
5. **Testing**: Official client SDK for comprehensive testing (ASSUMED)
6. **Maintainability**: Standardized patterns and best practices (ASSUMED)
7. **Documentation**: Self-documenting through schemas and type definitions (CONFIRMED)
8. **Extensibility**: Easy to add new features following established patterns (OBSERVED)

## ACTUAL IMPLEMENTATION RESULTS

### ✅ What Definitely Worked
- TypeScript compilation successful
- HTTP server started without errors
- Express integration functional
- Zod schema validation operational
- Basic request/response flow functional
- Session management appeared to work
- Tool registration and execution worked
- Resource serving worked
- Prompt template generation worked

### ⚠️ What Remains Unverified
- Whether patterns follow official recommendations
- If all API signatures are exactly correct
- Whether configuration options are complete
- If return value formats match official spec
- Whether testing patterns are recommended
- If error handling follows best practices

### 🔍 Verification Needed
All patterns in this document should be cross-referenced with:
- Official MCP TypeScript SDK documentation
- Official examples in the repository
- MCP protocol specification
- API reference documentation