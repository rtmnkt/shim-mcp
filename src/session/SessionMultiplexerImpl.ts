import { EventEmitter } from 'events';
import { 
  SessionMultiplexer, 
  SessionInfo, 
  MCPMessage,
  TransportAdapter 
} from '../core/interfaces.js';
import { 
  SessionError, 
  Utils, 
  Constants 
} from '../core/types.js';

export interface SessionMultiplexerConfig {
  maxConcurrentSessions?: number;
  sessionIdleTimeout?: number;
  flowControlWindowSize?: number;
  enableFlowControl?: boolean;
}

interface ActiveSession extends SessionInfo {
  pendingRequests: Map<string | number, {
    timestamp: number;
    timeout: NodeJS.Timeout;
  }>;
  messageQueue: MCPMessage[];
  lastSequence: number;
  flowControlWindow: number;
  backpressure: boolean;
}

export class SessionMultiplexerImpl extends EventEmitter implements SessionMultiplexer {
  private config: SessionMultiplexerConfig;
  private sessions: Map<string, ActiveSession> = new Map();
  private transportAdapter?: TransportAdapter;
  private cleanupInterval?: NodeJS.Timeout;
  private messageRoutes: Map<string | number, string> = new Map(); // messageId -> sessionId

  constructor(config: SessionMultiplexerConfig = {}) {
    super();
    
    this.config = {
      maxConcurrentSessions: Constants.DEFAULT_MAX_CONCURRENT_SESSIONS,
      sessionIdleTimeout: Constants.DEFAULT_SESSION_IDLE_TIMEOUT,
      flowControlWindowSize: 10,
      enableFlowControl: true,
      ...config
    };
    
    this.startCleanupTimer();
  }

  setTransportAdapter(adapter: TransportAdapter): void {
    this.transportAdapter = adapter;
    
    // Listen for transport events
    adapter.on('message.inbound', (envelope) => {
      this.handleInboundMessage(envelope);
    });
    
    adapter.on('message.outbound', (envelope) => {
      this.handleOutboundMessage(envelope);
    });
  }

  createSession(clientPid: number): string {
    if (this.sessions.size >= this.config.maxConcurrentSessions!) {
      throw new SessionError('Maximum concurrent sessions exceeded', '');
    }

    const sessionId = Utils.generateSessionId();
    const now = Date.now();
    
    const session: ActiveSession = {
      id: sessionId,
      clientPid,
      startTime: now,
      lastActivity: now,
      isActive: true,
      pendingRequests: new Map(),
      messageQueue: [],
      lastSequence: 0,
      flowControlWindow: this.config.flowControlWindowSize!,
      backpressure: false
    };
    
    this.sessions.set(sessionId, session);
    this.emit(Constants.EVENTS.SESSION_CREATED, sessionId);
    
    return sessionId;
  }

  destroySession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    // Clear pending request timeouts
    for (const { timeout } of session.pendingRequests.values()) {
      clearTimeout(timeout);
    }
    
    // Clear message routes
    for (const [messageId, sid] of this.messageRoutes.entries()) {
      if (sid === sessionId) {
        this.messageRoutes.delete(messageId);
      }
    }
    
    this.sessions.delete(sessionId);
    this.emit(Constants.EVENTS.SESSION_DESTROYED, sessionId);
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    
    return {
      id: session.id,
      clientPid: session.clientPid,
      startTime: session.startTime,
      lastActivity: session.lastActivity,
      isActive: session.isActive
    };
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      clientPid: session.clientPid,
      startTime: session.startTime,
      lastActivity: session.lastActivity,
      isActive: session.isActive
    }));
  }

  async routeToBackend(sessionId: string, message: MCPMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError('Session not found', sessionId);
    }

    if (!this.transportAdapter) {
      throw new SessionError('Transport adapter not configured', sessionId);
    }

    // Update session activity
    this.updateSessionActivity(sessionId);

    // Check flow control
    if (this.config.enableFlowControl && session.backpressure) {
      session.messageQueue.push(message);
      return;
    }

    // Track request-response mapping if message has ID
    if (message.id !== undefined) {
      this.messageRoutes.set(message.id, sessionId);
      
      // Set up timeout for request
      this.setupRequestTimeout(sessionId, message.id);
    }

    // Apply flow control
    if (this.config.enableFlowControl) {
      session.flowControlWindow--;
      if (session.flowControlWindow <= 0) {
        session.backpressure = true;
      }
    }

    // Send to backend
    const envelope = {
      sessionId,
      sequence: ++session.lastSequence,
      payload: message,
      timestamp: Date.now()
    };

    try {
      await this.transportAdapter.sendToBackend(envelope);
    } catch (error) {
      // Restore flow control state on error
      if (this.config.enableFlowControl) {
        session.flowControlWindow++;
        session.backpressure = session.flowControlWindow <= 0;
      }
      
      throw new SessionError(
        `Failed to route message to backend: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async routeToClient(sessionId: string, message: MCPMessage): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError('Session not found', sessionId);
    }

    if (!this.transportAdapter) {
      throw new SessionError('Transport adapter not configured', sessionId);
    }

    // Update session activity
    this.updateSessionActivity(sessionId);

    // Clear request tracking if this is a response
    if (message.id !== undefined) {
      this.clearRequestTimeout(sessionId, message.id);
      this.messageRoutes.delete(message.id);
    }

    // Update flow control
    if (this.config.enableFlowControl) {
      session.flowControlWindow++;
      
      // Process queued messages if backpressure is relieved
      if (session.backpressure && session.flowControlWindow > 0) {
        session.backpressure = false;
        this.processQueuedMessages(sessionId);
      }
    }

    try {
      await this.transportAdapter.sendToClient(sessionId, message);
    } catch (error) {
      throw new SessionError(
        `Failed to route message to client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.isActive).length;
  }

  private handleInboundMessage(envelope: any): void {
    const { sessionId, payload } = envelope;
    
    // Route message to appropriate session
    let targetSessionId = sessionId;
    
    // If sessionId is not provided, try to resolve from message ID
    if (!targetSessionId && payload.id !== undefined) {
      targetSessionId = this.messageRoutes.get(payload.id);
    }
    
    if (targetSessionId) {
      this.routeToClient(targetSessionId, payload).catch(error => {
        this.emit('error', new SessionError(
          `Failed to handle inbound message: ${error.message}`,
          targetSessionId
        ));
      });
    } else {
      this.emit('error', new SessionError(
        'Unable to route inbound message - no session found',
        sessionId || 'unknown'
      ));
    }
  }

  private handleOutboundMessage(envelope: any): void {
    const { sessionId, payload } = envelope;
    
    this.routeToBackend(sessionId, payload).catch(error => {
      this.emit('error', new SessionError(
        `Failed to handle outbound message: ${error.message}`,
        sessionId
      ));
    });
  }

  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  private setupRequestTimeout(sessionId: string, messageId: string | number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const timeout = setTimeout(() => {
      this.clearRequestTimeout(sessionId, messageId);
      this.emit('error', new SessionError(
        `Request timeout for message ${messageId}`,
        sessionId
      ));
    }, 30000); // 30 second timeout

    session.pendingRequests.set(messageId, {
      timestamp: Date.now(),
      timeout
    });
  }

  private clearRequestTimeout(sessionId: string, messageId: string | number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const pending = session.pendingRequests.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      session.pendingRequests.delete(messageId);
    }
  }

  private async processQueuedMessages(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.messageQueue.length === 0) return;

    const messages = session.messageQueue.splice(0);
    
    for (const message of messages) {
      if (session.backpressure) {
        // Put remaining messages back in queue
        session.messageQueue.unshift(...messages.slice(messages.indexOf(message)));
        break;
      }
      
      try {
        await this.routeToBackend(sessionId, message);
      } catch (error) {
        this.emit('error', new SessionError(
          `Failed to process queued message: ${error instanceof Error ? error.message : 'Unknown error'}`,
          sessionId,
          error instanceof Error ? error : undefined
        ));
      }
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60000); // Check every minute
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    const idleTimeout = this.config.sessionIdleTimeout!;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const idleTime = now - session.lastActivity;
      
      if (idleTime > idleTimeout) {
        console.log(`[SessionMultiplexer] Cleaning up idle session: ${sessionId}`);
        this.destroySession(sessionId);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    // Destroy all sessions
    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId);
    }
    
    this.removeAllListeners();
  }
}