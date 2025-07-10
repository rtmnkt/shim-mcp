import { EventEmitter } from 'events';
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

  constructor() {
    super();
  }

  async start(config: ShimMCPConfig): Promise<void> {
    if (this.isStarted) {
      throw new ShimMCPError('Server is already started', 'ALREADY_STARTED');
    }

    this.config = this.validateAndNormalizeConfig(config);
    
    try {
      console.log('[ShimMCP] Starting MCP proxy server...');
      
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
      
      console.log('[ShimMCP] Server started successfully');
      this.emit('started');
      
    } catch (error) {
      console.error('[ShimMCP] Failed to start server:', error);
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

    console.log('[ShimMCP] Stopping MCP proxy server...');
    
    try {
      this.isStarted = false;
      await this.cleanup();
      console.log('[ShimMCP] Server stopped successfully');
      this.emit('stopped');
    } catch (error) {
      console.error('[ShimMCP] Error during stop:', error);
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
      uptime: this.startTime ? Date.now() - this.startTime : 0
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
    this.processManager.on(Constants.EVENTS.BACKEND_STARTED, (pid: number) => {
      console.log(`[ShimMCP] Backend process started with PID: ${pid}`);
      this.emit(Constants.EVENTS.BACKEND_STARTED, pid);
    });
    
    this.processManager.on(Constants.EVENTS.BACKEND_STOPPED, () => {
      console.log('[ShimMCP] Backend process stopped');
      this.emit(Constants.EVENTS.BACKEND_STOPPED);
    });
    
    this.processManager.on(Constants.EVENTS.BACKEND_CRASHED, (error: Error) => {
      console.error('[ShimMCP] Backend process crashed:', error);
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
    this.sessionMultiplexer.on(Constants.EVENTS.SESSION_CREATED, (sessionId: string) => {
      console.log(`[ShimMCP] Session created: ${sessionId}`);
      this.emit(Constants.EVENTS.SESSION_CREATED, sessionId);
      
      // Update process manager activity
      this.processManager?.updateActivity();
    });
    
    this.sessionMultiplexer.on(Constants.EVENTS.SESSION_DESTROYED, (sessionId: string) => {
      console.log(`[ShimMCP] Session destroyed: ${sessionId}`);
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
    this.transportAdapter.on(Constants.EVENTS.TRANSPORT_CONNECTED, () => {
      console.log('[ShimMCP] Transport connected');
      this.emit(Constants.EVENTS.TRANSPORT_CONNECTED);
    });
    
    this.transportAdapter.on(Constants.EVENTS.TRANSPORT_DISCONNECTED, () => {
      console.log('[ShimMCP] Transport disconnected');
      this.emit(Constants.EVENTS.TRANSPORT_DISCONNECTED);
    });
    
    this.transportAdapter.on('client.disconnected', (sessionId: string) => {
      console.log(`[ShimMCP] Client disconnected: ${sessionId}`);
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
    console.log('[ShimMCP] Backend adapter configuration:', this.config.backendAdapter);
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
        this.transportAdapter.stop().catch(error => {
          console.warn('[ShimMCP] Error stopping transport adapter:', error);
        })
      );
    }
    
    // Stop process manager
    if (this.processManager) {
      cleanupTasks.push(
        this.processManager.stop().catch(error => {
          console.warn('[ShimMCP] Error stopping process manager:', error);
        })
      );
    }
    
    // Destroy session multiplexer
    if (this.sessionMultiplexer) {
      try {
        this.sessionMultiplexer.destroy();
      } catch (error) {
        console.warn('[ShimMCP] Error destroying session multiplexer:', error);
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
    
    console.log('[ShimMCP] Restarting backend process...');
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