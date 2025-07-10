// Main library exports for ShimMCP

// Core components
export { ShimMCPServer } from './core/ShimMCPServer.js';
export { 
  ShimMCPConfig,
  ShimMCPServer as IShimMCPServer,
  TransportAdapter,
  SessionMultiplexer,
  ProcessManager,
  ProcessManagerConfig,
  ProcessStatus,
  SessionInfo,
  MCPMessage,
  SessionEnvelope,
  BackendAdapter,
  BackendAdapterConfig
} from './core/interfaces.js';

// Transport adapters
export { StdioTransportAdapter } from './transport/StdioTransportAdapter.js';

// Process management
export { MCPProcessManager } from './process/MCPProcessManager.js';

// Session management
export { SessionMultiplexerImpl } from './session/SessionMultiplexerImpl.js';

// Backend adapters
export { GenericBackendAdapter } from './core/adapters/GenericBackendAdapter.js';
export { 
  BackendAdapterFactory,
  OpenAIBackendAdapter,
  ClaudeBackendAdapter
} from './core/adapters/BackendAdapterFactory.js';

// Types and utilities
export { 
  ShimMCPError,
  TransportError,
  ProcessError,
  SessionError,
  Utils,
  Constants
} from './core/types.js';

// Utility functions
export { createDefaultConfig, createShimMCPProxy } from './utils/factory.js';