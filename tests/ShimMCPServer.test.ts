import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { ShimMCPServer } from '../src/core/ShimMCPServer.js';
import { createDefaultConfig } from '../src/index.js';
import { Utils } from '../src/core/types.js';

describe('ShimMCPServer', () => {
  let server: ShimMCPServer;

  beforeEach(() => {
    server = new ShimMCPServer();
  });

  afterEach(async () => {
    if (server) {
      try {
        await server.stop();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
    }
  });

  test('should create server instance', () => {
    expect(server).toBeInstanceOf(ShimMCPServer);
  });

  test('should fail to start with invalid config', async () => {
    const invalidConfig = createDefaultConfig([]);
    
    await expect(server.start(invalidConfig)).rejects.toThrow();
  });

  test('should validate configuration', async () => {
    const config = createDefaultConfig(['echo', 'test']);
    config.maxConcurrentSessions = -1; // Invalid
    
    await expect(server.start(config)).rejects.toThrow('Max concurrent sessions must be at least 1');
  });

  test('should provide status information', () => {
    const status = server.getStatus();
    
    expect(status).toHaveProperty('transport');
    expect(status).toHaveProperty('backend');
    expect(status).toHaveProperty('sessions');
    expect(status).toHaveProperty('uptime');
  });

  test('should handle multiple start calls', async () => {
    const config = createDefaultConfig(['echo', 'test']);
    
    await server.start(config);
    
    // Second start should throw
    await expect(server.start(config)).rejects.toThrow('already started');
  });

  test('should handle stop when not started', async () => {
    // Should not throw
    await expect(server.stop()).resolves.not.toThrow();
  });
});

describe('Utils', () => {
  test('should generate unique session IDs', () => {
    const id1 = Utils.generateSessionId();
    const id2 = Utils.generateSessionId();
    
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^session-\d+-[a-z0-9]+$/);
  });

  test('should validate MCP messages', () => {
    expect(Utils.isValidMCPMessage({ method: 'test' })).toBe(true);
    expect(Utils.isValidMCPMessage({ result: 'success' })).toBe(true);
    expect(Utils.isValidMCPMessage({ error: { code: -1 } })).toBe(true);
    expect(Utils.isValidMCPMessage({})).toBe(false);
    expect(Utils.isValidMCPMessage(null)).toBe(false);
    expect(Utils.isValidMCPMessage('string')).toBe(false);
  });

  test('should sanitize objects for logging', () => {
    const obj = { test: 'value', secret: 'hidden' };
    const sanitized = Utils.sanitizeForLogging(obj, 20);
    
    expect(sanitized).toContain('...');
    expect(sanitized.length).toBeLessThanOrEqual(25); // 20 + "... [truncated]"
  });

  test('should retry with backoff', async () => {
    let attempts = 0;
    const fn = jest.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Retry me');
      }
      return 'success';
    });

    const result = await Utils.retryWithBackoff(fn, 3, 10, 2);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});