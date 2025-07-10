#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { ShimMCPServer } from '../core/ShimMCPServer.js';
import { ShimMCPConfig } from '../core/interfaces.js';
import { ShimMCPError } from '../core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ShimOptions {
  config?: string;
  backend?: string;
  backendPort?: number;
  backendHost?: string;
  serverType?: string;
  authToken?: string;
  maxSessions?: number;
  debug?: boolean;
  help?: boolean;
  version?: boolean;
}

class ShimMCPCLI {
  private options: ShimOptions = {};

  async run(argv: string[]): Promise<void> {
    try {
      this.parseArguments(argv);
      
      if (this.options.help) {
        this.showHelp();
        return;
      }
      
      if (this.options.version) {
        this.showVersion();
        return;
      }

      const config = await this.loadConfiguration();
      
      if (this.options.debug) {
        console.error('[ShimMCP Debug] Configuration:', JSON.stringify(config, null, 2));
      }

      const server = new ShimMCPServer();
      
      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers(server);
      
      // Start the server
      await server.start(config);
      
      if (this.options.debug) {
        console.error('[ShimMCP Debug] Server started successfully');
      }
      
    } catch (error) {
      console.error('[ShimMCP Error]:', error instanceof Error ? error.message : 'Unknown error');
      
      if (this.options.debug && error instanceof Error) {
        console.error('[ShimMCP Debug] Stack trace:', error.stack);
      }
      
      process.exit(1);
    }
  }

  private parseArguments(argv: string[]): void {
    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];
      const nextArg = argv[i + 1];
      
      switch (arg) {
        case '--config':
        case '-c':
          this.options.config = nextArg;
          i++;
          break;
          
        case '--backend':
        case '-b':
          this.options.backend = nextArg;
          i++;
          break;
          
        case '--backend-port':
          this.options.backendPort = parseInt(nextArg, 10);
          i++;
          break;
          
        case '--backend-host':
          this.options.backendHost = nextArg;
          i++;
          break;
          
        case '--server-type':
        case '-t':
          this.options.serverType = nextArg;
          i++;
          break;
          
        case '--auth-token':
        case '-a':
          this.options.authToken = nextArg;
          i++;
          break;
          
        case '--max-sessions':
          this.options.maxSessions = parseInt(nextArg, 10);
          i++;
          break;
          
        case '--debug':
        case '-d':
          this.options.debug = true;
          break;
          
        case '--help':
        case '-h':
          this.options.help = true;
          break;
          
        case '--version':
        case '-v':
          this.options.version = true;
          break;
          
        default:
          throw new ShimMCPError(`Unknown option: ${arg}`, 'INVALID_OPTION');
      }
    }
  }

  private async loadConfiguration(): Promise<ShimMCPConfig> {
    let config: Partial<ShimMCPConfig> = {};
    
    // Load from config file if specified
    if (this.options.config) {
      config = await this.loadConfigFile(this.options.config);
    } else {
      // Try to load default config files
      const defaultConfigPaths = [
        './shim-mcp.config.json',
        './configs/shim-mcp.config.json',
        join(__dirname, '../../configs/default.json')
      ];
      
      for (const path of defaultConfigPaths) {
        if (existsSync(path)) {
          config = await this.loadConfigFile(path);
          break;
        }
      }
    }

    // Start with config file as base
    const finalConfig: ShimMCPConfig = {
      // Default settings
      httpHost: '127.0.0.1',
      httpPort: 3000,
      maxConcurrentSessions: 50,
      sessionIdleTimeout: 10 * 60 * 1000, // 10 minutes
      logLevel: 'info',
      backend: {
        command: [],
        workingDirectory: process.cwd(),
        restartPolicy: 'on-failure',
        maxRestartAttempts: 3
      },
      
      // Override with config file
      ...config
    };

    // Override backend settings carefully
    if (config.backend) {
      finalConfig.backend = {
        ...finalConfig.backend,
        ...config.backend
      };
    }

    // Override with command line options if provided
    if (this.options.backend) {
      finalConfig.backend.command = this.parseBackendCommand();
    }
    if (this.options.backendHost) {
      finalConfig.httpHost = this.options.backendHost;
    }
    if (this.options.backendPort) {
      finalConfig.httpPort = this.options.backendPort;
    }
    if (this.options.maxSessions) {
      finalConfig.maxConcurrentSessions = this.options.maxSessions;
    }
    if (this.options.debug) {
      finalConfig.logLevel = 'debug';
    }
    if (this.buildHealthCheckUrl()) {
      finalConfig.backend.healthCheckUrl = this.buildHealthCheckUrl();
    }
    if (this.buildBackendAdapterConfig()) {
      finalConfig.backendAdapter = this.buildBackendAdapterConfig();
    }

    this.validateConfiguration(finalConfig);
    return finalConfig;
  }

  private async loadConfigFile(path: string): Promise<Partial<ShimMCPConfig>> {
    try {
      const content = readFileSync(path, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new ShimMCPError(
        `Failed to load config file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONFIG_LOAD_ERROR'
      );
    }
  }

  private parseBackendCommand(): string[] {
    if (!this.options.backend) {
      throw new ShimMCPError('Backend command is required. Use --backend option or config file.', 'MISSING_BACKEND');
    }
    
    // Parse command string into array
    // Simple parsing - could be enhanced with proper shell parsing
    return this.options.backend.split(' ').filter(part => part.length > 0);
  }

  private buildHealthCheckUrl(): string | undefined {
    if (this.options.backendHost && this.options.backendPort) {
      return `http://${this.options.backendHost}:${this.options.backendPort}/health`;
    }
    return undefined;
  }

  private buildBackendAdapterConfig() {
    if (!this.options.serverType && !this.options.authToken) {
      return undefined;
    }
    
    return {
      serverType: this.options.serverType || 'generic',
      authToken: this.options.authToken,
      version: '1.0'
    };
  }

  private validateConfiguration(config: ShimMCPConfig): void {
    if (!config.backend?.command || config.backend.command.length === 0) {
      throw new ShimMCPError('Backend command is required', 'INVALID_CONFIG');
    }
    
    if (config.httpPort && (config.httpPort < 1 || config.httpPort > 65535)) {
      throw new ShimMCPError('Invalid HTTP port number', 'INVALID_CONFIG');
    }
    
    if (config.maxConcurrentSessions && config.maxConcurrentSessions < 1) {
      throw new ShimMCPError('Max concurrent sessions must be at least 1', 'INVALID_CONFIG');
    }
  }

  private setupSignalHandlers(server: ShimMCPServer): void {
    const shutdown = async (signal: string) => {
      if (this.options.debug) {
        console.error(`[ShimMCP Debug] Received ${signal}, shutting down...`);
      }
      
      try {
        await server.stop();
        process.exit(0);
      } catch (error) {
        console.error('[ShimMCP Error] Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[ShimMCP Fatal] Uncaught exception:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason) => {
      console.error('[ShimMCP Fatal] Unhandled rejection:', reason);
      process.exit(1);
    });
  }

  private showHelp(): void {
    console.log(`
ShimMCP - Generic MCP Proxy for stdio to HTTP transport translation

USAGE:
  shim-mcp [OPTIONS]

OPTIONS:
  -c, --config PATH          Configuration file path
  -b, --backend COMMAND      Backend MCP server command
      --backend-host HOST    Backend server host (default: 127.0.0.1)
      --backend-port PORT    Backend server port (default: 3000)
  -t, --server-type TYPE     Backend server type (generic, openai, claude)
  -a, --auth-token TOKEN     Authentication token for backend
      --max-sessions NUM     Maximum concurrent sessions (default: 50)
  -d, --debug                Enable debug logging
  -h, --help                 Show this help message
  -v, --version              Show version information

EXAMPLES:
  # Basic usage with backend command
  shim-mcp --backend "python mcp-server.py --port 3000"
  
  # With specific server type and authentication
  shim-mcp --backend "node server.js" --server-type openai --auth-token sk-...
  
  # Using configuration file
  shim-mcp --config ./my-config.json
  
  # Debug mode
  shim-mcp --backend "python server.py" --debug

CONFIGURATION FILE FORMAT:
  {
    "backend": {
      "command": ["python", "mcp-server.py"],
      "workingDirectory": "/path/to/server",
      "healthCheckUrl": "http://localhost:3000/health"
    },
    "httpHost": "127.0.0.1",
    "httpPort": 3000,
    "backendAdapter": {
      "serverType": "generic",
      "authToken": "your-token-here"
    }
  }
`);
  }

  private showVersion(): void {
    try {
      const packageJsonPath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      console.log(`ShimMCP v${packageJson.version}`);
    } catch {
      console.log('ShimMCP v1.0.0');
    }
  }
}

// Main entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new ShimMCPCLI();
  cli.run(process.argv).catch((error) => {
    console.error('[ShimMCP Fatal]:', error);
    process.exit(1);
  });
}