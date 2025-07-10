import { EventEmitter } from 'events';

// Session management types
export interface SessionInfo {
  id: string;
  clientPid: number;
  startTime: number;
  lastActivity: number;
  isActive: boolean;
}

export interface MCPMessage {
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export interface SessionEnvelope {
  sessionId: string;
  sequence: number;
  payload: MCPMessage;
  timestamp: number;
}

// Transport adapter interface
export interface TransportAdapter extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendToClient(sessionId: string, data: any): Promise<void>;
  sendToBackend(envelope: SessionEnvelope): Promise<void>;
  isConnected(): boolean;
}

// Session multiplexer interface  
export interface SessionMultiplexer extends EventEmitter {
  createSession(clientPid: number): string;
  destroySession(sessionId: string): void;
  getSession(sessionId: string): SessionInfo | undefined;
  getAllSessions(): SessionInfo[];
  routeToBackend(sessionId: string, message: MCPMessage): Promise<void>;
  routeToClient(sessionId: string, message: MCPMessage): Promise<void>;
  getActiveSessionCount(): number;
}

// Process manager interface
export interface ProcessManagerConfig {
  command: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  healthCheckUrl?: string;
  restartPolicy?: 'always' | 'on-failure' | 'never';
  maxRestartAttempts?: number;
  healthCheckInterval?: number;
  idleTimeout?: number;
}

export interface ProcessStatus {
  pid?: number;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed';
  startTime?: number;
  restartCount: number;
  lastError?: string;
  isHealthy: boolean;
}

export interface ProcessManager extends EventEmitter {
  start(config: ProcessManagerConfig): Promise<void>;
  stop(force?: boolean): Promise<void>;
  restart(): Promise<void>;
  getStatus(): ProcessStatus;
  isRunning(): boolean;
  isHealthy(): Promise<boolean>;
}

// Backend adapter interface for server-specific customization
export interface BackendAdapterConfig {
  serverType: string;
  version?: string;
  authToken?: string;
  customHeaders?: Record<string, string>;
  codecPreference?: 'json' | 'msgpack';
  compressionPreference?: 'gzip' | 'brotli' | 'none';
}

export interface BackendAdapter {
  configure(config: BackendAdapterConfig): void;
  transformOutbound(message: MCPMessage): MCPMessage;
  transformInbound(message: MCPMessage): MCPMessage;
  getAuthHeaders(): Record<string, string>;
  negotiate(): Promise<void>;
}

// Main shim server configuration
export interface ShimMCPConfig {
  // Transport settings
  stdioBufferSize?: number;
  httpPort?: number;
  httpHost?: string;
  
  // Process management
  backend: ProcessManagerConfig;
  
  // Session management
  sessionIdleTimeout?: number;
  maxConcurrentSessions?: number;
  
  // Backend adapter
  backendAdapter?: BackendAdapterConfig;
  
  // Logging
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logFile?: string;
}

// Events
export interface ShimMCPEvents {
  'session.created': (sessionId: string) => void;
  'session.destroyed': (sessionId: string) => void;
  'backend.started': (pid: number) => void;
  'backend.stopped': () => void;
  'backend.crashed': (error: Error) => void;
  'transport.connected': () => void;
  'transport.disconnected': () => void;
  'error': (error: Error) => void;
}

// Main shim server interface
export interface ShimMCPServer extends EventEmitter {
  start(config: ShimMCPConfig): Promise<void>;
  stop(): Promise<void>;
  getStatus(): {
    transport: { connected: boolean };
    backend: ProcessStatus;
    sessions: SessionInfo[];
    uptime: number;
  };
}