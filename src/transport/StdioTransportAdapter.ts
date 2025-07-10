import { EventEmitter } from 'events';
import { createReadStream, createWriteStream } from 'fs';
import { Readable, Writable, Transform } from 'stream';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { 
  TransportAdapter, 
  SessionEnvelope, 
  MCPMessage 
} from '../core/interfaces.js';
import { 
  TransportError, 
  Utils, 
  Constants 
} from '../core/types.js';

export interface StdioTransportConfig {
  bufferSize?: number;
  backendUrl: string;
  backendType: 'http' | 'websocket';
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export class StdioTransportAdapter extends EventEmitter implements TransportAdapter {
  private config: StdioTransportConfig;
  private isStarted = false;
  private backendConnected = false;
  private sessionId: string;
  private clientPid: number;
  
  // Stdio streams
  private stdinReader: NodeJS.ReadableStream;
  private stdoutWriter: NodeJS.WritableStream;
  private messageBuffer = '';
  
  // Backend connection
  private websocket?: WebSocket;
  private httpClient: typeof fetch;
  
  // Sequence tracking
  private outboundSequence = 0;
  private pendingRequests = new Map<number, NodeJS.Timeout>();

  constructor(config: StdioTransportConfig) {
    super();
    this.config = {
      bufferSize: Constants.DEFAULT_STDIO_BUFFER_SIZE,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };
    
    this.sessionId = Utils.generateSessionId();
    this.clientPid = process.ppid || process.pid;
    this.httpClient = fetch;
    
    // Setup stdio streams
    this.stdinReader = process.stdin;
    this.stdoutWriter = process.stdout;
    
    this.setupStdioHandlers();
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    
    try {
      // Connect to backend
      await this.connectToBackend();
      
      // Start stdio processing
      this.stdinReader.resume();
      this.isStarted = true;
      
      this.emit(Constants.EVENTS.TRANSPORT_CONNECTED);
    } catch (error) {
      throw new TransportError(
        `Failed to start transport: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;
    
    this.isStarted = false;
    
    // Clean up pending requests
    for (const timeout of this.pendingRequests.values()) {
      clearTimeout(timeout);
    }
    this.pendingRequests.clear();
    
    // Close backend connection
    if (this.websocket) {
      this.websocket.close();
      this.websocket = undefined;
    }
    
    this.backendConnected = false;
    this.emit(Constants.EVENTS.TRANSPORT_DISCONNECTED);
  }

  async sendToClient(sessionId: string, data: any): Promise<void> {
    if (!this.isStarted || sessionId !== this.sessionId) {
      throw new TransportError('Transport not started or session mismatch', sessionId);
    }
    
    try {
      const message = JSON.stringify(data) + '\n';
      await this.writeToStdout(message);
    } catch (error) {
      throw new TransportError(
        `Failed to send to client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  async sendToBackend(envelope: SessionEnvelope): Promise<void> {
    if (!this.backendConnected) {
      throw new TransportError('Backend not connected', envelope.sessionId);
    }
    
    try {
      if (this.config.backendType === 'websocket' && this.websocket) {
        await this.sendViaWebSocket(envelope);
      } else {
        await this.sendViaHttp(envelope);
      }
      
      // Set timeout for response
      this.setResponseTimeout(envelope.sequence);
    } catch (error) {
      throw new TransportError(
        `Failed to send to backend: ${error instanceof Error ? error.message : 'Unknown error'}`,
        envelope.sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  isConnected(): boolean {
    return this.isStarted && this.backendConnected;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  private setupStdioHandlers(): void {
    this.stdinReader.setEncoding('utf8');
    
    this.stdinReader.on('data', (chunk: string) => {
      this.handleStdinData(chunk);
    });
    
    this.stdinReader.on('end', () => {
      this.emit('client.disconnected', this.sessionId);
    });
    
    this.stdinReader.on('error', (error) => {
      this.emit('error', new TransportError('Stdin error', this.sessionId, error));
    });
    
    // Handle parent process exit
    process.on('disconnect', () => {
      this.stop();
    });
    
    process.on('SIGTERM', () => {
      this.stop();
    });
  }

  private handleStdinData(chunk: string): void {
    this.messageBuffer += chunk;
    
    // Process complete messages (assuming newline-delimited JSON)
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        this.processIncomingMessage(line.trim());
      }
    }
  }

  private processIncomingMessage(message: string): void {
    try {
      const mcpMessage = JSON.parse(message) as MCPMessage;
      
      if (!Utils.isValidMCPMessage(mcpMessage)) {
        throw new Error('Invalid MCP message format');
      }
      
      const envelope: SessionEnvelope = {
        sessionId: this.sessionId,
        sequence: ++this.outboundSequence,
        payload: mcpMessage,
        timestamp: Date.now()
      };
      
      this.emit('message.outbound', envelope);
    } catch (error) {
      this.emit('error', new TransportError(
        `Failed to process incoming message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.sessionId,
        error instanceof Error ? error : undefined
      ));
    }
  }

  private async connectToBackend(): Promise<void> {
    if (this.config.backendType === 'websocket') {
      await this.connectWebSocket();
    } else {
      await this.testHttpConnection();
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(this.config.backendUrl);
        
        this.websocket.on('open', () => {
          this.backendConnected = true;
          resolve();
        });
        
        this.websocket.on('message', (data: WebSocket.Data) => {
          this.handleBackendMessage(data.toString());
        });
        
        this.websocket.on('close', () => {
          this.backendConnected = false;
          this.emit(Constants.EVENTS.TRANSPORT_DISCONNECTED);
        });
        
        this.websocket.on('error', (error) => {
          this.backendConnected = false;
          reject(new TransportError('WebSocket connection failed', this.sessionId, error));
        });
        
        // Timeout for connection
        setTimeout(() => {
          if (!this.backendConnected) {
            this.websocket?.close();
            reject(new TransportError('WebSocket connection timeout', this.sessionId));
          }
        }, this.config.timeout);
        
      } catch (error) {
        reject(new TransportError(
          'Failed to create WebSocket connection',
          this.sessionId,
          error instanceof Error ? error : undefined
        ));
      }
    });
  }

  private async testHttpConnection(): Promise<void> {
    try {
      // Test the health endpoint for connection
      const healthUrl = `${this.config.backendUrl}/health`;
      const response = await Utils.withTimeout(
        this.httpClient(healthUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'ShimMCP/1.0' }
        }),
        this.config.timeout!
      );
      
      if (response.ok) {
        this.backendConnected = true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new TransportError(
        `HTTP backend connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async sendViaWebSocket(envelope: SessionEnvelope): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new TransportError('WebSocket not connected', envelope.sessionId);
    }
    
    return new Promise((resolve, reject) => {
      this.websocket!.send(JSON.stringify(envelope), (error) => {
        if (error) {
          reject(new TransportError('WebSocket send failed', envelope.sessionId, error));
        } else {
          resolve();
        }
      });
    });
  }

  private async sendViaHttp(envelope: SessionEnvelope): Promise<void> {
    try {
      // Use the MCP endpoint for actual message sending
      const mcpUrl = `${this.config.backendUrl}/mcp`;
      const response = await Utils.withTimeout(
        this.httpClient(mcpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'X-Session-Id': envelope.sessionId,
            'X-Sequence': envelope.sequence.toString()
          },
          body: JSON.stringify(envelope.payload)
        }),
        this.config.timeout!
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json() as MCPMessage;
      this.handleBackendResponse(envelope.sequence, responseData);
      
    } catch (error) {
      throw new TransportError(
        `HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        envelope.sessionId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private handleBackendMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      
      // Handle different message formats
      if (data.sessionId && data.payload) {
        // Envelope format
        this.handleBackendResponse(data.sequence, data.payload);
      } else {
        // Direct MCP message
        this.emit('message.inbound', {
          sessionId: this.sessionId,
          sequence: 0,
          payload: data,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.emit('error', new TransportError(
        `Failed to parse backend message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.sessionId,
        error instanceof Error ? error : undefined
      ));
    }
  }

  private handleBackendResponse(sequence: number, payload: MCPMessage): void {
    // Clear timeout for this sequence
    const timeout = this.pendingRequests.get(sequence);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingRequests.delete(sequence);
    }
    
    this.emit('message.inbound', {
      sessionId: this.sessionId,
      sequence,
      payload,
      timestamp: Date.now()
    });
  }

  private setResponseTimeout(sequence: number): void {
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(sequence);
      this.emit('error', new TransportError(
        `Request timeout for sequence ${sequence}`,
        this.sessionId
      ));
    }, this.config.timeout);
    
    this.pendingRequests.set(sequence, timeout);
  }

  private async writeToStdout(message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stdoutWriter.write(message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}