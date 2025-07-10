#!/usr/bin/env node

/**
 * Streamable HTTP MCP Server Sample using Official TypeScript SDK
 * 
 * This sample demonstrates a proper implementation of a streamable HTTP MCP server
 * using the official @modelcontextprotocol/sdk package.
 * 
 * Features:
 * - Official MCP TypeScript SDK compliance
 * - Proper tools, resources, and prompts implementation
 * - StreamableHTTPServerTransport for HTTP handling
 * - Session management and state handling
 * - Type safety with zod schemas
 * - Graceful error handling and shutdown
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { createFileLogger } from 'vibelogger';

// Environment configuration
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '127.0.0.1';
const DEBUG = process.env.DEBUG === 'true';

// Initialize vibelogger
const logger = createFileLogger('streamable-http-mcp');

// Server state
const activeSessions = new Map<string, { startTime: number; lastActivity: number }>();
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Create and configure the MCP server
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'streamable-http-mcp-sample',
    version: '1.0.0',
  });

  // Tool: Generate mock text with streaming
  server.registerTool(
    'generate-text',
    {
      title: 'Generate Mock Text',
      description: 'Generate mock text response with streaming simulation',
      inputSchema: {
        prompt: z.string().describe('The text prompt to generate from'),
        max_tokens: z.number().optional().describe('Maximum number of tokens to generate'),
        temperature: z.number().min(0).max(2).optional().describe('Temperature for generation'),
      },
    },
    async ({ prompt, max_tokens = 100, temperature = 1.0 }) => {
      await logger.info(
        'tool_generate_text',
        'Text generation tool called',
        {
          context: { 
            prompt: prompt.substring(0, 100),
            max_tokens,
            temperature,
            timestamp: Date.now()
          },
          humanNote: 'User requested text generation with MCP tool'
        }
      );

      const responses = [
        `🤖 Generated response for: "${prompt}"\n\n`,
        `This is a mock text generation using the official MCP TypeScript SDK. `,
        `Temperature: ${temperature}, Max tokens: ${max_tokens}.\n\n`,
        `The server demonstrates proper MCP protocol implementation with:\n`,
        `- Structured tools with zod schema validation\n`,
        `- Proper resource management\n`,
        `- Session handling through StreamableHTTPServerTransport\n`,
        `- Type-safe request/response handling\n\n`,
        `This sample can be connected to ShimMCP for stdio-to-HTTP translation.`,
      ];

      const fullResponse = responses.join('');
      
      await logger.info(
        'tool_generate_text_complete',
        'Text generation completed successfully',
        {
          context: { 
            responseLength: fullResponse.length,
            estimatedTokens: Math.floor(fullResponse.length / 4),
            temperature,
            max_tokens
          },
          humanNote: 'Text generation completed, response ready'
        }
      );
      
      return {
        content: [
          {
            type: 'text',
            text: fullResponse,
          },
        ],
        metadata: {
          tokens_used: Math.floor(fullResponse.length / 4), // Rough token estimate
          temperature,
          max_tokens,
        },
      };
    }
  );

  // Tool: Multi-step text generation with progress
  server.registerTool(
    'generate-text-streaming',
    {
      title: 'Generate Text with Progress',
      description: 'Generate text with multiple progress notifications',
      inputSchema: {
        prompt: z.string().describe('The text prompt'),
        steps: z.number().min(1).max(10).optional().describe('Number of generation steps'),
      },
    },
    async ({ prompt, steps = 3 }, extra) => {
      const stepTexts = [
        'Analyzing prompt...',
        'Generating content...',
        'Refining response...',
        'Finalizing output...',
      ];

      // Send progress notifications
      for (let i = 0; i < Math.min(steps, stepTexts.length); i++) {
        // Note: Notifications would need to be sent through the server instance
        // For now, we'll just log the progress
        console.log(`Progress: ${Math.floor(((i + 1) / steps) * 100)}% - ${stepTexts[i]}`);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const generatedText = `Generated text for "${prompt}" completed in ${steps} steps.`;
      
      return {
        content: [
          {
            type: 'text',
            text: generatedText,
          },
        ],
        metadata: {
          steps_completed: steps,
          processing_time: steps * 500,
        },
      };
    }
  );

  // Resource: Server status information
  server.registerResource(
    'server-status',
    'status://server',
    {
      title: 'Server Status',
      description: 'Current server status and statistics',
      mimeType: 'application/json',
    },
    async (uri, extra) => {
      const status = {
        server: {
          name: 'streamable-http-mcp-sample',
          version: '1.0.0',
          protocol: 'MCP with TypeScript SDK',
          transport: 'StreamableHTTPServerTransport',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid,
        },
        sessions: {
          active: activeSessions.size,
          total: transports.size,
          details: Array.from(activeSessions.entries()).map(([id, data]) => ({
            id: id.substring(0, 8),
            duration: Date.now() - data.startTime,
            lastActivity: Date.now() - data.lastActivity,
          })),
        },
        timestamp: new Date().toISOString(),
      };

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  // Resource: Available tools list
  server.registerResource(
    'tools-list',
    'tools://list',
    {
      title: 'Available Tools',
      description: 'List of all available MCP tools',
      mimeType: 'text/plain',
    },
    async (uri, extra) => {
      const toolsInfo = [
        '🔧 Available MCP Tools:',
        '',
        '1. generate-text',
        '   - Generate mock text with streaming simulation',
        '   - Parameters: prompt (required), max_tokens, temperature',
        '',
        '2. generate-text-streaming',
        '   - Generate text with progress notifications',
        '   - Parameters: prompt (required), steps',
        '',
        '📊 Available Resources:',
        '',
        '1. server-status - Current server status and statistics',
        '2. tools-list - This list of available tools',
        '',
        '💡 Available Prompts:',
        '',
        '1. example-prompt - Example prompt template',
        '2. help-prompt - Help and usage information',
      ].join('\n');

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'text/plain',
            text: toolsInfo,
          },
        ],
      };
    }
  );

  // Prompt: Example prompt template
  server.registerPrompt(
    'example-prompt',
    {
      title: 'Example Prompt',
      description: 'Example prompt template for testing',
      argsSchema: {
        topic: z.string().describe('Topic to generate content about'),
        tone: z.enum(['formal', 'casual', 'technical']).describe('Tone of the response'),
      },
    },
    async ({ topic, tone }) => {
      const prompts = {
        formal: `Please provide a formal analysis of ${topic}.`,
        casual: `Hey! Can you tell me about ${topic}?`,
        technical: `Provide a technical overview of ${topic} including key concepts and implementation details.`,
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

  // Prompt: Help prompt
  server.registerPrompt(
    'help-prompt',
    {
      title: 'Help Information',
      description: 'Help and usage information for the MCP server',
      argsSchema: {
        section: z.enum(['tools', 'resources', 'prompts', 'general']).optional().describe('Help section to display'),
      },
    },
    async ({ section = 'general' }) => {
      const helpTexts = {
        general: 'This is a sample MCP server built with the official TypeScript SDK. It demonstrates proper implementation of tools, resources, and prompts.',
        tools: 'Available tools: generate-text (basic text generation), generate-text-streaming (text generation with progress notifications)',
        resources: 'Available resources: server-status (server statistics), tools-list (available tools and resources)',
        prompts: 'Available prompts: example-prompt (example template), help-prompt (this help system)',
      };

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Help: ${helpTexts[section || 'general']}`,
            },
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Create Express app for HTTP handling
 */
function createExpressApp(): express.Application {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      server: 'streamable-http-mcp-sample',
      version: '1.0.0',
      protocol: 'MCP with TypeScript SDK',
      activeSessions: activeSessions.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Status endpoint
  app.get('/status', (req, res) => {
    res.json({
      server: {
        name: 'streamable-http-mcp-sample',
        version: '1.0.0',
        protocol: 'MCP with TypeScript SDK',
        transport: 'StreamableHTTPServerTransport',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      },
      sessions: {
        active: activeSessions.size,
        total: transports.size,
        details: Array.from(activeSessions.entries()).map(([id, data]) => ({
          id: id.substring(0, 8),
          duration: Date.now() - data.startTime,
          lastActivity: Date.now() - data.lastActivity,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Main server startup
 */
async function startServer() {
  try {
    console.log('🚀 Starting MCP Server with TypeScript SDK...');
    
    await logger.info(
      'server_startup_begin',
      'Starting MCP Server with TypeScript SDK',
      {
        context: { 
          host: HOST,
          port: PORT,
          debug: DEBUG,
          nodeVersion: process.version,
          timestamp: Date.now()
        },
        humanNote: 'MCP server initialization starting with HTTP transport'
      }
    );
    
    const mcpServer = createMcpServer();
    const app = createExpressApp();

    // MCP endpoint handler
    app.all('/mcp', async (req, res) => {
      let sessionId: string = 'unknown';
      try {
        sessionId = req.headers['x-session-id'] as string || randomUUID();
        
        // Track session
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, {
            startTime: Date.now(),
            lastActivity: Date.now(),
          });
          
          await logger.info(
            'session_created',
            'New MCP session created and tracked',
            {
              context: { 
                sessionId: sessionId.substring(0, 8),
                totalActiveSessions: activeSessions.size,
                timestamp: Date.now()
              },
              humanNote: 'Client connected to MCP server via HTTP transport'
            }
          );
          
          if (DEBUG) {
            console.log(`📝 Created new session: ${sessionId.substring(0, 8)}`);
          }
        } else {
          // Update activity
          const session = activeSessions.get(sessionId)!;
          session.lastActivity = Date.now();
          
          await logger.info(
            'session_activity',
            'MCP session activity updated',
            {
              context: { 
                sessionId: sessionId.substring(0, 8),
                sessionDuration: Date.now() - session.startTime,
                timestamp: Date.now()
              },
              humanNote: 'Existing session continues to be active'
            }
          );
        }

        // Get or create transport for this session
        let transport = transports.get(sessionId);
        if (!transport) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
            enableJsonResponse: true,
          });
          
          // Handle the actual HTTP request
          await transport.handleRequest(req, res, req.body);
          
          transports.set(sessionId, transport);
          
          // Clean up transport when done
          transport.onclose = () => {
            transports.delete(sessionId);
            activeSessions.delete(sessionId);
            
            if (DEBUG) {
              console.log(`🗑️  Cleaned up session: ${sessionId.substring(0, 8)}`);
            }
          };
        }

        // Connect server to transport
        await mcpServer.connect(transport);
        
        if (DEBUG) {
          console.log(`🔗 Connected session: ${sessionId.substring(0, 8)}`);
        }

      } catch (error) {
        console.error('❌ Error handling MCP request:', error);
        
        await logger.error(
          'mcp_request_error',
          'Error occurred while handling MCP request',
          {
            context: { 
              error: error instanceof Error ? error.message : 'Unknown error',
              stack: error instanceof Error ? error.stack : undefined,
              sessionId: sessionId ? sessionId.substring(0, 8) : 'unknown',
              activeSessions: activeSessions.size,
              timestamp: Date.now()
            },
            humanNote: 'AI-TODO: Analyze MCP request error patterns for reliability improvements'
          }
        );
        
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });

    // Start HTTP server
    const server = app.listen(PORT, HOST, async () => {
      console.log(`✅ MCP Server started successfully`);
      console.log(`📡 Listening on http://${HOST}:${PORT}`);
      console.log(`🔗 Endpoints:`);
      console.log(`   POST /mcp     - Main MCP endpoint`);
      console.log(`   GET  /health  - Health check`);
      console.log(`   GET  /status  - Detailed status`);
      console.log(`🚀 Ready to accept MCP connections!`);
      
      await logger.info(
        'server_startup_complete',
        'MCP Server started successfully and ready to accept connections',
        {
          context: { 
            host: HOST,
            port: PORT,
            endpoints: ['/mcp', '/health', '/status'],
            debug: DEBUG,
            pid: process.pid,
            uptime: process.uptime(),
            timestamp: Date.now()
          },
          humanNote: 'HTTP MCP server is now live and accepting client connections'
        }
      );
      
      if (DEBUG) {
        console.log(`🐛 Debug mode enabled`);
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Received shutdown signal, gracefully shutting down...');
      
      await logger.info(
        'server_shutdown_begin',
        'Graceful shutdown initiated, cleaning up sessions and resources',
        {
          context: { 
            activeSessions: activeSessions.size,
            activeTransports: transports.size,
            uptime: process.uptime(),
            timestamp: Date.now()
          },
          humanNote: 'Server shutdown process started, cleaning up all active connections'
        }
      );
      
      // Close all active sessions
      for (const [sessionId] of activeSessions) {
        console.log(`🔌 Closing session: ${sessionId.substring(0, 8)}`);
      }
      
      // Close all transports
      for (const [sessionId, transport] of transports) {
        try {
          await transport.close();
        } catch (error) {
          console.warn(`⚠️  Error closing transport for session ${sessionId}:`, error);
          
          await logger.warning(
            'transport_close_error',
            'Error occurred while closing transport during shutdown',
            {
              context: { 
                sessionId: sessionId.substring(0, 8),
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
              },
              humanNote: 'Transport cleanup encountered issues during shutdown'
            }
          );
        }
      }
      
      // Close HTTP server
      server.close(async () => {
        await logger.info(
          'server_shutdown_complete',
          'MCP server shutdown completed successfully',
          {
            context: { 
              finalUptime: process.uptime(),
              cleanedSessions: activeSessions.size,
              cleanedTransports: transports.size,
              timestamp: Date.now()
            },
            humanNote: 'Server has been gracefully shut down and all resources cleaned up'
          }
        );
        
        console.log('✅ Server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    
    await logger.error(
      'server_startup_failed',
      'Failed to start MCP server',
      {
        context: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          host: HOST,
          port: PORT,
          nodeVersion: process.version,
          timestamp: Date.now()
        },
        humanNote: 'AI-TODO: Investigate server startup failure patterns and improve error handling'
      }
    );
    
    process.exit(1);
  }
}

// Start the server
startServer().catch(async (error) => {
  console.error('💥 Fatal error:', error);
  
  await logger.critical(
    'server_fatal_error',
    'Fatal error occurred during server startup',
    {
      context: { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: Date.now()
      },
      humanNote: 'AI-CRITICAL: Fatal startup error requires immediate investigation'
    }
  );
  
  process.exit(1);
});