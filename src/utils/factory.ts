import { ShimMCPServer } from '../core/ShimMCPServer.js';
import { ShimMCPConfig } from '../core/interfaces.js';

// Default configuration factory
export function createDefaultConfig(backendCommand: string[]): ShimMCPConfig {
  return {
    backend: {
      command: backendCommand,
      workingDirectory: process.cwd(),
      restartPolicy: 'on-failure',
      maxRestartAttempts: 3,
      healthCheckInterval: 5000,
      idleTimeout: 10 * 60 * 1000 // 10 minutes
    },
    httpHost: '127.0.0.1',
    httpPort: 3000,
    maxConcurrentSessions: 50,
    sessionIdleTimeout: 10 * 60 * 1000,
    logLevel: 'info'
  };
}

// Quick start function for programmatic usage
export async function createShimMCPProxy(
  backendCommand: string[],
  options: Partial<ShimMCPConfig> = {}
): Promise<ShimMCPServer> {
  const config = {
    ...createDefaultConfig(backendCommand),
    ...options
  };
  
  const server = new ShimMCPServer();
  await server.start(config);
  
  return server;
}