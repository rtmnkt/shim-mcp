# MCP TypeScript SDK - Official Information (Fact vs Assumption)

## Disclaimer
This document separates **verified facts** from **implementation assumptions** to maintain accuracy. Information marked as assumptions should be verified against official sources.

## ✅ VERIFIED FACTS

### Package Information
- **Package Name**: `@modelcontextprotocol/sdk` (confirmed in package.json)
- **Version Used**: `^1.15.0` (confirmed in package.json)
- **Repository**: https://github.com/modelcontextprotocol/typescript-sdk (confirmed)
- **Installation**: `npm install @modelcontextprotocol/sdk` (standard npm practice)

### File Structure Evidence
Based on actual implementation attempt, these imports were used:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamable-http/index.js';
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamable-http/index.js';
```

### Dependencies Confirmed
- **Zod**: Used for schema validation (commonly paired with TypeScript SDKs)
- **Express**: Used for HTTP server implementation
- **TypeScript**: Primary language for the SDK

## ⚠️ IMPLEMENTATION ASSUMPTIONS (Needs Verification)

### Server Implementation Pattern
**ASSUMPTION**: The following pattern is correct:
```typescript
const server = new McpServer({
  name: 'server-name',
  version: '1.0.0',
});

server.registerTool('tool-name', {
  title: 'Tool Title',
  description: 'Description',
  inputSchema: zodSchema,
}, async (args) => {
  // Implementation
});
```

### Transport Configuration
**ASSUMPTION**: StreamableHTTPServerTransport works like this:
```typescript
const transport = new StreamableHTTPServerTransport(req, res, {
  sessionId,
  enableJsonResponse: true,
  generateSessionId: () => sessionId,
});
```

### Tool Registration
**ASSUMPTION**: Tools return this format:
```typescript
return {
  content: [
    {
      type: 'text',
      text: 'response text',
    },
  ],
  metadata: {
    // Optional metadata
  },
};
```

### Resource Registration
**ASSUMPTION**: Resources work like this:
```typescript
server.registerResource('resource-uri', {
  title: 'Resource Title',
  description: 'Description',
  mimeType: 'application/json',
}, async () => {
  return {
    contents: [{
      mimeType: 'application/json',
      text: JSON.stringify(data),
    }],
  };
});
```

### Prompt Registration
**ASSUMPTION**: Prompts work like this:
```typescript
server.registerPrompt('prompt-name', {
  title: 'Prompt Title',
  description: 'Description',
  arguments: zodSchema,
}, async (args) => {
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: 'prompt text',
      },
    }],
  };
});
```

## 🌐 PARTIAL INFORMATION FROM WEB SOURCES

### From Previous WebFetch
The following information was gathered from web sources but should be independently verified:

1. **Server Capabilities**: Tools, resources, prompts, notifications
2. **Session Management**: Unique session IDs, state management
3. **Transport Types**: stdio, HTTP, possibly WebSocket
4. **Notifications**: Progress and message notifications during tool execution

### Example References Found
- `simpleStreamableHttp.ts` - Example HTTP server implementation
- `jsonResponseStreamableHttp.ts` - JSON response mode example

## ❓ NEEDS OFFICIAL VERIFICATION

The following aspects require verification from official documentation:

1. **Correct import paths** for all classes
2. **Proper method signatures** for registerTool, registerResource, registerPrompt
3. **Official configuration options** for transports
4. **Correct session management patterns**
5. **Official error handling approaches**
6. **Proper notification patterns**
7. **Testing frameworks and patterns recommended**
8. **Production deployment best practices**

## 🔧 IMPLEMENTATION RESULTS

### What Actually Worked
The implementation compiled and appeared to function with:
- TypeScript compilation successful
- HTTP server started without errors
- Express integration functional
- Basic request/response flow operational

### What Remains Uncertain
- Whether the patterns follow official recommendations
- If the class names and import paths are exactly correct
- Whether the configuration options are complete and accurate
- If the return value formats match the official specification

## 📝 NEXT STEPS FOR VERIFICATION

To get authoritative information:
1. Access official MCP TypeScript SDK documentation
2. Review official examples in the repository
3. Check API reference documentation
4. Verify against MCP protocol specification
5. Cross-reference with official tutorials or guides

## 🎯 CONFIDENCE LEVELS

- **High Confidence**: Package name, repository URL, basic TypeScript usage
- **Medium Confidence**: General patterns for server/client/transport architecture
- **Low Confidence**: Exact API signatures, configuration options, best practices
- **Unknown**: Official testing patterns, deployment recommendations, performance considerations

This document will be updated with verified information once official sources are consulted.