import { BackendAdapter, BackendAdapterConfig } from '../interfaces.js';
import { GenericBackendAdapter } from './GenericBackendAdapter.js';
import { ShimMCPError } from '../types.js';

export class BackendAdapterFactory {
  private static adapters: Map<string, new () => BackendAdapter> = new Map();

  static {
    // Register built-in adapters
    BackendAdapterFactory.registerAdapter('generic', GenericBackendAdapter);
    // Add more built-in adapters here as needed
  }

  static registerAdapter(serverType: string, adapterClass: new () => BackendAdapter): void {
    this.adapters.set(serverType.toLowerCase(), adapterClass);
  }

  static createAdapter(config: BackendAdapterConfig): BackendAdapter {
    const serverType = config.serverType?.toLowerCase() || 'generic';
    
    const AdapterClass = this.adapters.get(serverType);
    if (!AdapterClass) {
      console.warn(`[BackendAdapterFactory] No specific adapter found for ${serverType}, using generic adapter`);
      const adapter = new GenericBackendAdapter();
      adapter.configure(config);
      return adapter;
    }

    const adapter = new AdapterClass();
    adapter.configure(config);
    return adapter;
  }

  static getAvailableAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  static hasAdapter(serverType: string): boolean {
    return this.adapters.has(serverType.toLowerCase());
  }
}

// Example specialized adapter for demonstration
export class OpenAIBackendAdapter extends GenericBackendAdapter {
  async negotiate(): Promise<void> {
    const config = this.getConfig();
    
    // Validate OpenAI-specific requirements
    if (!config.authToken) {
      throw new ShimMCPError('OpenAI adapter requires authentication token', 'MISSING_AUTH');
    }

    await super.negotiate();
    console.log('[OpenAIBackendAdapter] OpenAI-specific negotiation completed');
  }

  getAuthHeaders(): Record<string, string> {
    const headers = super.getAuthHeaders();
    const config = this.getConfig();
    
    // OpenAI-specific headers
    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
      headers['OpenAI-Organization'] = config.customHeaders?.['OpenAI-Organization'] || '';
    }
    
    return headers;
  }

  transformOutbound(message: any): any {
    const transformed = super.transformOutbound(message);
    
    // Add OpenAI-specific transformations
    if (transformed.method === 'chat.completions') {
      // Ensure OpenAI-compatible format
      if (!transformed.params?.model) {
        transformed.params = {
          ...transformed.params,
          model: 'gpt-3.5-turbo' // Default model
        };
      }
    }
    
    return transformed;
  }
}

// Example Claude adapter
export class ClaudeBackendAdapter extends GenericBackendAdapter {
  async negotiate(): Promise<void> {
    const config = this.getConfig();
    
    // Validate Claude-specific requirements
    if (!config.authToken) {
      throw new ShimMCPError('Claude adapter requires authentication token', 'MISSING_AUTH');
    }

    await super.negotiate();
    console.log('[ClaudeBackendAdapter] Claude-specific negotiation completed');
  }

  getAuthHeaders(): Record<string, string> {
    const headers = super.getAuthHeaders();
    const config = this.getConfig();
    
    // Claude-specific headers
    if (config.authToken) {
      headers['x-api-key'] = config.authToken;
      headers['anthropic-version'] = config.version || '2023-06-01';
    }
    
    return headers;
  }

  transformOutbound(message: any): any {
    const transformed = super.transformOutbound(message);
    
    // Add Claude-specific transformations
    if (transformed.method === 'messages.create') {
      // Ensure Claude-compatible format
      if (!transformed.params?.model) {
        transformed.params = {
          ...transformed.params,
          model: 'claude-3-sonnet-20240229' // Default model
        };
      }
      
      // Ensure max_tokens is set for Claude
      if (!transformed.params?.max_tokens) {
        transformed.params.max_tokens = 4096;
      }
    }
    
    return transformed;
  }
}

// Register specialized adapters
BackendAdapterFactory.registerAdapter('openai', OpenAIBackendAdapter);
BackendAdapterFactory.registerAdapter('claude', ClaudeBackendAdapter);
BackendAdapterFactory.registerAdapter('anthropic', ClaudeBackendAdapter); // Alias