#!/usr/bin/env node

/**
 * Test script for MCP server using official TypeScript SDK
 * 
 * This script tests the MCP server implementation with proper SDK patterns:
 * - Tools invocation and validation
 * - Resources access and content verification
 * - Prompts execution and response validation
 * - Session management and transport handling
 * - Health and status endpoints
 */

import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamable-http/index.js';
import { randomUUID } from 'crypto';

// Server configuration
const SERVER_HOST = process.env.HOST || '127.0.0.1';
const SERVER_PORT = parseInt(process.env.PORT || '3000');
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

// Test utilities
class TestRunner {
  private client: McpClient | null = null;
  private sessionId: string;
  private testsPassed = 0;
  private testsFailed = 0;

  constructor() {
    this.sessionId = randomUUID();
  }

  async setupClient(): Promise<void> {
    const transport = new StreamableHTTPClientTransport({
      url: `${SERVER_URL}/mcp`,
      headers: {
        'x-session-id': this.sessionId,
      },
    });

    this.client = new McpClient({
      name: 'mcp-test-client',
      version: '1.0.0',
    });

    await this.client.connect(transport);
  }

  async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }

  private log(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const prefixes = {
      info: '📋',
      success: '✅',
      error: '❌',
    };
    console.log(`${prefixes[type]} ${message}`);
  }

  private async expect(condition: boolean, message: string): Promise<void> {
    if (condition) {
      this.log(`${message} - PASSED`, 'success');
      this.testsPassed++;
    } else {
      this.log(`${message} - FAILED`, 'error');
      this.testsFailed++;
    }
  }

  async testHealthEndpoint(): Promise<void> {
    this.log('Testing health endpoint...');
    
    try {
      const response = await fetch(`${SERVER_URL}/health`);
      const data = await response.json();
      
      await this.expect(response.status === 200, 'Health endpoint returns 200');
      await this.expect(data.status === 'healthy', 'Health status is healthy');
      await this.expect(data.server === 'streamable-http-mcp-sample', 'Server name matches');
      await this.expect(typeof data.uptime === 'number', 'Uptime is a number');
      
    } catch (error) {
      await this.expect(false, `Health endpoint test failed: ${error}`);
    }
  }

  async testStatusEndpoint(): Promise<void> {
    this.log('Testing status endpoint...');
    
    try {
      const response = await fetch(`${SERVER_URL}/status`);
      const data = await response.json();
      
      await this.expect(response.status === 200, 'Status endpoint returns 200');
      await this.expect(data.server.name === 'streamable-http-mcp-sample', 'Server name matches');
      await this.expect(data.server.protocol === 'MCP with TypeScript SDK', 'Protocol matches');
      await this.expect(typeof data.sessions.active === 'number', 'Active sessions is a number');
      
    } catch (error) {
      await this.expect(false, `Status endpoint test failed: ${error}`);
    }
  }

  async testServerCapabilities(): Promise<void> {
    this.log('Testing server capabilities...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const capabilities = await this.client.getServerCapabilities();
      
      await this.expect(capabilities.tools !== undefined, 'Server supports tools');
      await this.expect(capabilities.resources !== undefined, 'Server supports resources');
      await this.expect(capabilities.prompts !== undefined, 'Server supports prompts');
      
    } catch (error) {
      await this.expect(false, `Server capabilities test failed: ${error}`);
    }
  }

  async testListTools(): Promise<void> {
    this.log('Testing tools listing...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const tools = await this.client.listTools();
      
      await this.expect(Array.isArray(tools.tools), 'Tools list is an array');
      await this.expect(tools.tools.length > 0, 'Tools list is not empty');
      
      const toolNames = tools.tools.map(tool => tool.name);
      await this.expect(toolNames.includes('generate-text'), 'generate-text tool is available');
      await this.expect(toolNames.includes('generate-text-streaming'), 'generate-text-streaming tool is available');
      
      this.log(`Found ${tools.tools.length} tools: ${toolNames.join(', ')}`);
      
    } catch (error) {
      await this.expect(false, `Tools listing test failed: ${error}`);
    }
  }

  async testListResources(): Promise<void> {
    this.log('Testing resources listing...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const resources = await this.client.listResources();
      
      await this.expect(Array.isArray(resources.resources), 'Resources list is an array');
      await this.expect(resources.resources.length > 0, 'Resources list is not empty');
      
      const resourceUris = resources.resources.map(resource => resource.uri);
      await this.expect(resourceUris.includes('server-status'), 'server-status resource is available');
      await this.expect(resourceUris.includes('tools-list'), 'tools-list resource is available');
      
      this.log(`Found ${resources.resources.length} resources: ${resourceUris.join(', ')}`);
      
    } catch (error) {
      await this.expect(false, `Resources listing test failed: ${error}`);
    }
  }

  async testListPrompts(): Promise<void> {
    this.log('Testing prompts listing...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const prompts = await this.client.listPrompts();
      
      await this.expect(Array.isArray(prompts.prompts), 'Prompts list is an array');
      await this.expect(prompts.prompts.length > 0, 'Prompts list is not empty');
      
      const promptNames = prompts.prompts.map(prompt => prompt.name);
      await this.expect(promptNames.includes('example-prompt'), 'example-prompt is available');
      await this.expect(promptNames.includes('help-prompt'), 'help-prompt is available');
      
      this.log(`Found ${prompts.prompts.length} prompts: ${promptNames.join(', ')}`);
      
    } catch (error) {
      await this.expect(false, `Prompts listing test failed: ${error}`);
    }
  }

  async testGenerateTextTool(): Promise<void> {
    this.log('Testing generate-text tool...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.callTool({
        name: 'generate-text',
        arguments: {
          prompt: 'Hello, world!',
          max_tokens: 50,
          temperature: 0.7,
        },
      });
      
      await this.expect(Array.isArray(result.content), 'Tool result has content array');
      await this.expect(result.content.length > 0, 'Tool result content is not empty');
      await this.expect(result.content[0].type === 'text', 'First content item is text');
      await this.expect(typeof result.content[0].text === 'string', 'Text content is a string');
      await this.expect(result.content[0].text.includes('Hello, world!'), 'Response contains input prompt');
      
      this.log(`Generated text length: ${result.content[0].text.length} characters`);
      
    } catch (error) {
      await this.expect(false, `Generate text tool test failed: ${error}`);
    }
  }

  async testGenerateTextStreamingTool(): Promise<void> {
    this.log('Testing generate-text-streaming tool...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.callTool({
        name: 'generate-text-streaming',
        arguments: {
          prompt: 'Test streaming',
          steps: 3,
        },
      });
      
      await this.expect(Array.isArray(result.content), 'Tool result has content array');
      await this.expect(result.content.length > 0, 'Tool result content is not empty');
      await this.expect(result.content[0].type === 'text', 'First content item is text');
      await this.expect(result.metadata !== undefined, 'Tool result has metadata');
      
      if (result.metadata && typeof result.metadata === 'object') {
        const metadata = result.metadata as Record<string, unknown>;
        await this.expect(metadata.steps_completed === 3, 'Correct number of steps completed');
      }
      
    } catch (error) {
      await this.expect(false, `Generate text streaming tool test failed: ${error}`);
    }
  }

  async testServerStatusResource(): Promise<void> {
    this.log('Testing server-status resource...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.readResource({
        uri: 'server-status',
      });
      
      await this.expect(Array.isArray(result.contents), 'Resource result has contents array');
      await this.expect(result.contents.length > 0, 'Resource contents is not empty');
      await this.expect(result.contents[0].mimeType === 'application/json', 'First content is JSON');
      
      if (result.contents[0].mimeType === 'application/json') {
        const statusData = JSON.parse(result.contents[0].text);
        await this.expect(statusData.server.name === 'streamable-http-mcp-sample', 'Status contains server name');
        await this.expect(typeof statusData.server.uptime === 'number', 'Status contains uptime');
        await this.expect(typeof statusData.sessions.active === 'number', 'Status contains active sessions');
      }
      
    } catch (error) {
      await this.expect(false, `Server status resource test failed: ${error}`);
    }
  }

  async testToolsListResource(): Promise<void> {
    this.log('Testing tools-list resource...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.readResource({
        uri: 'tools-list',
      });
      
      await this.expect(Array.isArray(result.contents), 'Resource result has contents array');
      await this.expect(result.contents.length > 0, 'Resource contents is not empty');
      await this.expect(result.contents[0].mimeType === 'text/plain', 'First content is plain text');
      await this.expect(result.contents[0].text.includes('Available MCP Tools'), 'Tools list contains expected content');
      
    } catch (error) {
      await this.expect(false, `Tools list resource test failed: ${error}`);
    }
  }

  async testExamplePrompt(): Promise<void> {
    this.log('Testing example-prompt...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.getPrompt({
        name: 'example-prompt',
        arguments: {
          topic: 'artificial intelligence',
          tone: 'technical',
        },
      });
      
      await this.expect(Array.isArray(result.messages), 'Prompt result has messages array');
      await this.expect(result.messages.length > 0, 'Prompt messages is not empty');
      await this.expect(result.messages[0].role === 'user', 'First message is from user');
      await this.expect(result.messages[0].content.type === 'text', 'First message content is text');
      await this.expect(result.messages[0].content.text.includes('artificial intelligence'), 'Prompt contains topic');
      
    } catch (error) {
      await this.expect(false, `Example prompt test failed: ${error}`);
    }
  }

  async testHelpPrompt(): Promise<void> {
    this.log('Testing help-prompt...');
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const result = await this.client.getPrompt({
        name: 'help-prompt',
        arguments: {
          section: 'tools',
        },
      });
      
      await this.expect(Array.isArray(result.messages), 'Prompt result has messages array');
      await this.expect(result.messages.length > 0, 'Prompt messages is not empty');
      await this.expect(result.messages[0].content.text.includes('tools'), 'Help prompt contains tools section');
      
    } catch (error) {
      await this.expect(false, `Help prompt test failed: ${error}`);
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting MCP Server Tests with TypeScript SDK');
    console.log(`📡 Testing server at ${SERVER_URL}`);
    console.log(`🔗 Session ID: ${this.sessionId.substring(0, 8)}`);
    console.log();

    try {
      // Test HTTP endpoints first
      await this.testHealthEndpoint();
      await this.testStatusEndpoint();
      
      // Setup MCP client
      await this.setupClient();
      
      // Test MCP protocol features
      await this.testServerCapabilities();
      await this.testListTools();
      await this.testListResources();
      await this.testListPrompts();
      
      // Test tools
      await this.testGenerateTextTool();
      await this.testGenerateTextStreamingTool();
      
      // Test resources
      await this.testServerStatusResource();
      await this.testToolsListResource();
      
      // Test prompts
      await this.testExamplePrompt();
      await this.testHelpPrompt();
      
    } catch (error) {
      this.log(`Unexpected error during tests: ${error}`, 'error');
      this.testsFailed++;
    } finally {
      await this.cleanup();
    }

    // Results summary
    console.log();
    console.log('📊 Test Results:');
    console.log(`✅ Tests passed: ${this.testsPassed}`);
    console.log(`❌ Tests failed: ${this.testsFailed}`);
    console.log(`📈 Success rate: ${((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(1)}%`);
    
    if (this.testsFailed === 0) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some tests failed!');
      process.exit(1);
    }
  }
}

// Check if server is running before starting tests
async function checkServerHealth(): Promise<void> {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    if (response.status === 200) {
      console.log('✅ Server is running and healthy');
      return;
    }
  } catch (error) {
    // Server not running
  }
  
  console.error(`❌ Server not responding at ${SERVER_URL}`);
  console.error('💡 Please start the server first: npm run dev');
  process.exit(1);
}

// Main execution
async function main(): Promise<void> {
  await checkServerHealth();
  
  const testRunner = new TestRunner();
  await testRunner.runAllTests();
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});