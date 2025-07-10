import { EventEmitter } from 'events';
import { createFileLogger } from 'vibelogger';
import { 
  ShimMCPServer as IShimMCPServer,
  ShimMCPConfig,
  ProcessStatus,
  SessionInfo,
  BackendAdapter
} from './interfaces.js';
import { StdioTransportAdapter } from '../transport/StdioTransportAdapter.js';
import { MCPProcessManager } from '../process/MCPProcessManager.js';
import { SessionMultiplexerImpl } from '../session/SessionMultiplexerImpl.js';
import { 
  ShimMCPError, 
  Utils, 
  Constants 
} from './types.js';

export class ShimMCPServer extends EventEmitter implements IShimMCPServer {
  private config!: ShimMCPConfig;
  private transportAdapter?: StdioTransportAdapter;
  private processManager?: MCPProcessManager;
  private sessionMultiplexer?: SessionMultiplexerImpl;
  private backendAdapter?: BackendAdapter;
  private isStarted = false;
  private startTime?: number;
  private logger = createFileLogger('shim-mcp');

  constructor() {
    super();
  }

  async start(config: ShimMCPConfig): Promise<void> {
    if (this.isStarted) {
      throw new ShimMCPError('Server is already started', 'ALREADY_STARTED');
    }

    this.config = this.validateAndNormalizeConfig(config);
    
    try {
      await this.logger.info(
        'server_start_begin',
        'Starting MCP proxy server with component initialization',
        {
          context: { 
            backend: this.config.backend,
            httpHost: this.config.httpHost,
            httpPort: this.config.httpPort
          },
          humanNote: 'AI-TODO: Monitor startup sequence for potential bottlenecks'
        }
      );
      
      // Initialize components
      await this.initializeProcessManager();
      await this.initializeSessionMultiplexer();
      await this.initializeTransportAdapter();
      await this.initializeBackendAdapter();
      
      // Wire components together
      this.wireComponents();
      
      // Start process manager first
      await this.processManager!.start(this.config.backend);
      
      // Start transport adapter
      await this.transportAdapter!.start();
      
      this.isStarted = true;
      this.startTime = Date.now();
      
      await this.logger.info(
        'server_start_complete',
        'MCP proxy server started successfully',
        {
          context: { 
            startTime: this.startTime,
            uptime: 0,
            components: ['processManager', 'sessionMultiplexer', 'transportAdapter']
          },
          humanNote: 'Server initialization complete, all components active'
        }
      );
      this.emit('started');
      
    } catch (error) {
      await this.logger.error(
        'server_start_failed',
        'Failed to start MCP proxy server',
        {
          context: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            config: this.config
          },
          humanNote: 'AI-TODO: Analyze startup failure patterns for reliability improvements'
        }
      );
      await this.cleanup();
      throw new ShimMCPError(
        `Failed to start ShimMCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'START_FAILED',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    await this.logger.info(
      'server_stop_begin',
      'Stopping MCP proxy server and cleaning up resources',
      {
        context: { 
          uptime: this.getUptime(),
          activeSessionCount: this.getActiveSessionCount(),
          backendHealthy: await this.isBackendHealthy().catch(() => false)
        },
        humanNote: 'AI-TODO: Track shutdown duration and cleanup efficiency'
      }
    );
    
    try {
      this.isStarted = false;
      await this.cleanup();
      await this.logger.info(
        'server_stop_complete',
        'MCP proxy server stopped successfully',
        {
          context: { 
            finalUptime: this.getUptime(),
            shutdownTime: Date.now()
          },
          humanNote: 'Server shutdown complete, all resources cleaned up'
        }
      );
      this.emit('stopped');
    } catch (error) {
      await this.logger.error(
        'server_stop_failed',
        'Error during server shutdown',
        {
          context: { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            uptime: this.getUptime()
          },
          humanNote: 'AI-TODO: Investigate shutdown failure patterns'
        }
      );
      throw new ShimMCPError(
        `Failed to stop ShimMCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STOP_FAILED',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  getStatus() {
    return {
      transport: {
        connected: this.transportAdapter?.isConnected() || false
      },
      backend: this.processManager?.getStatus() || {
        status: 'stopped' as const,
        restartCount: 0,
        isHealthy: false
      },
      sessions: this.sessionMultiplexer?.getAllSessions() || [],
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      // TDD Refactor: より実用的な実装に改善
      logging: {
        enabled: !!this.logger,
        provider: 'vibelogger',
        logDirectory: './logs/shim-mcp',
        structured: true
      }
    };
  }

  private validateAndNormalizeConfig(config: ShimMCPConfig): ShimMCPConfig {
    if (!config.backend?.command) {
      throw new ShimMCPError('Backend command is required', 'INVALID_CONFIG');
    }

    return {
      // Transport settings
      stdioBufferSize: config.stdioBufferSize || Constants.DEFAULT_STDIO_BUFFER_SIZE,
      httpPort: config.httpPort || Constants.DEFAULT_HTTP_PORT,
      httpHost: config.httpHost || Constants.DEFAULT_HTTP_HOST,
      
      // Process management
      backend: {
        restartPolicy: 'on-failure',
        maxRestartAttempts: Constants.DEFAULT_MAX_RESTART_ATTEMPTS,
        healthCheckInterval: Constants.DEFAULT_HEALTH_CHECK_INTERVAL,
        idleTimeout: Constants.DEFAULT_SESSION_IDLE_TIMEOUT,
        ...config.backend
      },
      
      // Session management
      sessionIdleTimeout: config.sessionIdleTimeout || Constants.DEFAULT_SESSION_IDLE_TIMEOUT,
      maxConcurrentSessions: config.maxConcurrentSessions || Constants.DEFAULT_MAX_CONCURRENT_SESSIONS,
      
      // Backend adapter
      backendAdapter: config.backendAdapter,
      
      // Logging
      logLevel: config.logLevel || 'info',
      logFile: config.logFile
    };
  }

  private async initializeProcessManager(): Promise<void> {
    this.processManager = new MCPProcessManager();
    
    // Set up process manager event handlers
    this.processManager.on(Constants.EVENTS.BACKEND_STARTED, async (pid: number) => {
      await this.logger.info(
        'backend_process_started',
        'Backend process started successfully',
        {
          context: { 
            pid: pid,
            backendCommand: this.config.backend.command,
            timestamp: Date.now()
          },
          humanNote: 'Backend process is now active and ready to handle requests'
        }
      );
      this.emit(Constants.EVENTS.BACKEND_STARTED, pid);
    });
    
    this.processManager.on(Constants.EVENTS.BACKEND_STOPPED, async () => {
      await this.logger.info(
        'backend_process_stopped',
        'Backend process stopped',
        {
          context: { 
            timestamp: Date.now(),
            uptime: this.getUptime()
          },
          humanNote: 'Backend process has been gracefully stopped'
        }
      );
      this.emit(Constants.EVENTS.BACKEND_STOPPED);
    });
    
    this.processManager.on(Constants.EVENTS.BACKEND_CRASHED, async (error: Error) => {
      await this.logger.error(
        'backend_process_crashed',
        'Backend process crashed unexpectedly',
        {
          context: { 
            error: error.message,
            stack: error.stack,
            timestamp: Date.now(),
            uptime: this.getUptime()
          },
          humanNote: 'AI-TODO: Analyze crash patterns and implement recovery strategies'
        }
      );
      this.emit(Constants.EVENTS.BACKEND_CRASHED, error);
    });
    
    this.processManager.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private async initializeSessionMultiplexer(): Promise<void> {
    this.sessionMultiplexer = new SessionMultiplexerImpl({
      maxConcurrentSessions: this.config.maxConcurrentSessions,
      sessionIdleTimeout: this.config.sessionIdleTimeout,
      enableFlowControl: true
    });
    
    // Set up session multiplexer event handlers
    this.sessionMultiplexer.on(Constants.EVENTS.SESSION_CREATED, async (sessionId: string) => {
      await this.logger.info(
        'session_created',
        'New session created and registered with multiplexer',
        {
          context: { 
            sessionId: sessionId,
            activeSessionCount: this.getActiveSessionCount(),
            timestamp: Date.now()
          },
          humanNote: 'Session multiplexer is handling new client connection'
        }
      );
      this.emit(Constants.EVENTS.SESSION_CREATED, sessionId);
      
      // Update process manager activity
      this.processManager?.updateActivity();
    });
    
    this.sessionMultiplexer.on(Constants.EVENTS.SESSION_DESTROYED, async (sessionId: string) => {
      await this.logger.info(
        'session_destroyed',
        'Session destroyed and removed from multiplexer',
        {
          context: { 
            sessionId: sessionId,
            remainingSessionCount: this.getActiveSessionCount(),
            timestamp: Date.now()
          },
          humanNote: 'Client session has been cleaned up and resources released'
        }
      );
      this.emit(Constants.EVENTS.SESSION_DESTROYED, sessionId);
    });
    
    this.sessionMultiplexer.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private async initializeTransportAdapter(): Promise<void> {
    const backendUrl = this.buildBackendUrl();
    
    this.transportAdapter = new StdioTransportAdapter({
      bufferSize: this.config.stdioBufferSize,
      backendUrl,
      backendType: 'http', // Default to HTTP, could be configurable
      timeout: 30000,
      retryAttempts: 3
    });
    
    // Set up transport adapter event handlers
    this.transportAdapter.on(Constants.EVENTS.TRANSPORT_CONNECTED, async () => {
      await this.logger.info(
        'transport_connected',
        'Transport layer connected and ready for communication',
        {
          context: { 
            backendUrl: this.buildBackendUrl(),
            timestamp: Date.now()
          },
          humanNote: 'Transport adapter is now ready to handle client connections'
        }
      );
      this.emit(Constants.EVENTS.TRANSPORT_CONNECTED);
    });
    
    this.transportAdapter.on(Constants.EVENTS.TRANSPORT_DISCONNECTED, async () => {
      await this.logger.info(
        'transport_disconnected',
        'Transport layer disconnected',
        {
          context: { 
            timestamp: Date.now(),
            uptime: this.getUptime()
          },
          humanNote: 'Transport adapter has been disconnected, check network connectivity'
        }
      );
      this.emit(Constants.EVENTS.TRANSPORT_DISCONNECTED);
    });
    
    this.transportAdapter.on('client.disconnected', async (sessionId: string) => {
      await this.logger.info(
        'client_disconnected',
        'Client disconnected from transport',
        {
          context: { 
            sessionId: sessionId,
            timestamp: Date.now(),
            activeSessionCount: this.getActiveSessionCount()
          },
          humanNote: 'Client has disconnected, cleaning up associated session'
        }
      );
      this.sessionMultiplexer?.destroySession(sessionId);
    });
    
    this.transportAdapter.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private async initializeBackendAdapter(): Promise<void> {
    if (!this.config.backendAdapter) {
      return; // No backend adapter configured
    }

    // TODO: Implement backend adapter factory based on serverType
    // For now, we'll leave this as a placeholder
    await this.logger.info(
      'backend_adapter_config',
      'Backend adapter configuration detected',
      {
        context: { 
          backendAdapter: this.config.backendAdapter,
          timestamp: Date.now()
        },
        humanNote: 'AI-TODO: Implement backend adapter factory based on serverType'
      }
    );
  }

  private wireComponents(): void {
    if (!this.transportAdapter || !this.sessionMultiplexer || !this.processManager) {
      throw new ShimMCPError('Components not initialized', 'INITIALIZATION_ERROR');
    }

    // Connect session multiplexer with transport adapter
    this.sessionMultiplexer.setTransportAdapter(this.transportAdapter);
    
    // Create session for this transport instance
    const sessionId = this.sessionMultiplexer.createSession(process.ppid || process.pid);
    
    // Handle transport messages
    this.transportAdapter.on('message.outbound', (envelope) => {
      // Update process manager activity when messages are sent
      this.processManager?.updateActivity();
    });
    
    this.transportAdapter.on('message.inbound', (envelope) => {
      // Update process manager activity when messages are received
      this.processManager?.updateActivity();
    });
  }

  private buildBackendUrl(): string {
    const host = this.config.httpHost;
    const port = this.config.httpPort;
    return `http://${host}:${port}`;
  }

  private async cleanup(): Promise<void> {
    const cleanupTasks: Promise<void>[] = [];
    
    // Stop transport adapter
    if (this.transportAdapter) {
      cleanupTasks.push(
        this.transportAdapter.stop().catch(async error => {
          await this.logger.warning(
            'transport_stop_error',
            'Error stopping transport adapter during cleanup',
            {
              context: { 
                error: error.message,
                timestamp: Date.now()
              },
              humanNote: 'Transport adapter cleanup failed, may need manual intervention'
            }
          );
        })
      );
    }
    
    // Stop process manager
    if (this.processManager) {
      cleanupTasks.push(
        this.processManager.stop().catch(async error => {
          await this.logger.warning(
            'process_manager_stop_error',
            'Error stopping process manager during cleanup',
            {
              context: { 
                error: error.message,
                timestamp: Date.now()
              },
              humanNote: 'Process manager cleanup failed, backend process may still be running'
            }
          );
        })
      );
    }
    
    // Destroy session multiplexer
    if (this.sessionMultiplexer) {
      try {
        this.sessionMultiplexer.destroy();
      } catch (error) {
        await this.logger.warning(
          'session_multiplexer_destroy_error',
          'Error destroying session multiplexer during cleanup',
          {
            context: { 
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: Date.now()
            },
            humanNote: 'Session multiplexer cleanup failed, sessions may not be properly cleaned up'
          }
        );
      }
    }
    
    // Wait for all cleanup tasks
    await Promise.allSettled(cleanupTasks);
    
    // Clear references
    this.transportAdapter = undefined;
    this.processManager = undefined;
    this.sessionMultiplexer = undefined;
    this.backendAdapter = undefined;
    
    // Remove all listeners
    this.removeAllListeners();
  }

  // Utility methods for monitoring and management
  
  async restartBackend(): Promise<void> {
    if (!this.processManager) {
      throw new ShimMCPError('Process manager not initialized', 'NOT_INITIALIZED');
    }
    
    await this.logger.info(
      'backend_restart_begin',
      'Restarting backend process',
      {
        context: { 
          timestamp: Date.now(),
          currentStatus: this.processManager.getStatus()
        },
        humanNote: 'Manual backend restart initiated'
      }
    );
    await this.processManager.restart();
  }

  getActiveSessionCount(): number {
    return this.sessionMultiplexer?.getActiveSessionCount() || 0;
  }

  async isBackendHealthy(): Promise<boolean> {
    if (!this.processManager) {
      return false;
    }
    
    return await this.processManager.isHealthy();
  }

  getUptime(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }
}