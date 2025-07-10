// Common types and utilities for ShimMCP

export class ShimMCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public sessionId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ShimMCPError';
  }
}

export class TransportError extends ShimMCPError {
  constructor(message: string, sessionId?: string, cause?: Error) {
    super(message, 'TRANSPORT_ERROR', sessionId, cause);
    this.name = 'TransportError';
  }
}

export class ProcessError extends ShimMCPError {
  constructor(message: string, cause?: Error) {
    super(message, 'PROCESS_ERROR', undefined, cause);
    this.name = 'ProcessError';
  }
}

export class SessionError extends ShimMCPError {
  constructor(message: string, sessionId: string, cause?: Error) {
    super(message, 'SESSION_ERROR', sessionId, cause);
    this.name = 'SessionError';
  }
}

// Utility functions
export class Utils {
  static generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateSequenceNumber(): number {
    return Math.floor(Math.random() * 1000000);
  }

  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    errorMessage = 'Operation timed out'
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      )
    ]);
  }

  static retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelayMs: number = 1000,
    backoffFactor: number = 2
  ): Promise<T> {
    return new Promise(async (resolve, reject) => {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await fn();
          resolve(result);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt === maxAttempts) {
            reject(lastError);
            return;
          }
          
          const delay = baseDelayMs * Math.pow(backoffFactor, attempt - 1);
          await Utils.sleep(delay);
        }
      }
    });
  }

  static isValidMCPMessage(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    // Must have either method (request) or result/error (response)
    const hasMethod = typeof obj.method === 'string';
    const hasResult = obj.hasOwnProperty('result');
    const hasError = obj.hasOwnProperty('error');
    
    return hasMethod || hasResult || hasError;
  }

  static sanitizeForLogging(obj: any, maxLength: number = 1000): string {
    try {
      const str = JSON.stringify(obj, null, 2);
      if (str.length <= maxLength) return str;
      return str.substring(0, maxLength) + '... [truncated]';
    } catch {
      return '[unable to serialize]';
    }
  }
}

// Constants
export const Constants = {
  DEFAULT_HTTP_PORT: 3000,
  DEFAULT_HTTP_HOST: '127.0.0.1',
  DEFAULT_SESSION_IDLE_TIMEOUT: 600000, // 10 minutes
  DEFAULT_HEALTH_CHECK_INTERVAL: 5000,  // 5 seconds
  DEFAULT_MAX_RESTART_ATTEMPTS: 3,
  DEFAULT_STDIO_BUFFER_SIZE: 8192,
  DEFAULT_MAX_CONCURRENT_SESSIONS: 50,
  
  // Message types
  MESSAGE_TYPES: {
    REQUEST: 'request',
    RESPONSE: 'response',
    NOTIFICATION: 'notification'
  } as const,
  
  // Process states
  PROCESS_STATES: {
    STOPPED: 'stopped',
    STARTING: 'starting', 
    RUNNING: 'running',
    STOPPING: 'stopping',
    CRASHED: 'crashed'
  } as const,
  
  // Event names
  EVENTS: {
    SESSION_CREATED: 'session.created',
    SESSION_DESTROYED: 'session.destroyed',
    BACKEND_STARTED: 'backend.started',
    BACKEND_STOPPED: 'backend.stopped',
    BACKEND_CRASHED: 'backend.crashed',
    TRANSPORT_CONNECTED: 'transport.connected',
    TRANSPORT_DISCONNECTED: 'transport.disconnected',
    ERROR: 'error'
  } as const
};