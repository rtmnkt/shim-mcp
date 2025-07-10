import { 
  BackendAdapter, 
  BackendAdapterConfig, 
  MCPMessage 
} from '../interfaces.js';
import { ShimMCPError } from '../types.js';

export class GenericBackendAdapter implements BackendAdapter {
  private config: BackendAdapterConfig;
  private negotiated = false;

  constructor() {
    this.config = {
      serverType: 'generic',
      version: '1.0',
      codecPreference: 'json',
      compressionPreference: 'none'
    };
  }

  configure(config: BackendAdapterConfig): void {
    this.config = { ...this.config, ...config };
    this.negotiated = false;
  }

  transformOutbound(message: MCPMessage): MCPMessage {
    // Generic adapter performs minimal transformation
    // Subclasses can override for server-specific modifications
    
    // Ensure message has proper structure
    if (!message || typeof message !== 'object') {
      throw new ShimMCPError('Invalid message format', 'INVALID_MESSAGE');
    }

    // Add any generic headers or metadata
    const transformed: any = { ...message };
    
    // Add timestamp if not present
    if (!transformed.timestamp) {
      transformed.timestamp = Date.now();
    }
    
    // Add client identifier if needed
    if (!transformed.clientInfo && this.config.customHeaders?.['X-Client-Id']) {
      transformed.clientInfo = {
        id: this.config.customHeaders['X-Client-Id'],
        version: this.config.version
      };
    }

    return transformed;
  }

  transformInbound(message: MCPMessage): MCPMessage {
    // Generic adapter performs minimal transformation
    // Remove any server-specific metadata that clients shouldn't see
    
    const transformed: any = { ...message };
    
    // Remove internal server fields
    delete transformed.serverInternal;
    delete transformed.processingTime;
    delete transformed.serverTimestamp;
    
    return transformed;
  }

  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': this.getContentType(),
      'Accept': this.getAcceptType(),
      'User-Agent': `ShimMCP/${this.config.version || '1.0'}`
    };

    // Add authentication token if configured
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    // Add custom headers
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }

    // Add compression headers if requested
    if (this.config.compressionPreference && this.config.compressionPreference !== 'none') {
      headers['Accept-Encoding'] = this.config.compressionPreference;
    }

    return headers;
  }

  async negotiate(): Promise<void> {
    // Generic negotiation - can be overridden by specific adapters
    
    if (this.negotiated) {
      return;
    }

    // Perform basic validation
    this.validateConfig();
    
    // Mark as negotiated
    this.negotiated = true;
    
    console.log(`[BackendAdapter] Negotiated for ${this.config.serverType} server`);
  }

  protected getContentType(): string {
    switch (this.config.codecPreference) {
      case 'msgpack':
        return 'application/msgpack';
      case 'json':
      default:
        return 'application/json';
    }
  }

  protected getAcceptType(): string {
    return this.getContentType();
  }

  protected validateConfig(): void {
    if (!this.config.serverType) {
      throw new ShimMCPError('Server type is required', 'INVALID_CONFIG');
    }
  }

  // Utility methods for subclasses
  
  protected isNegotiated(): boolean {
    return this.negotiated;
  }

  protected getConfig(): BackendAdapterConfig {
    return { ...this.config };
  }

  protected setNegotiated(value: boolean): void {
    this.negotiated = value;
  }
}