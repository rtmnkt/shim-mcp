// Test setup for ShimMCP

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console.error during tests to reduce noise
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

// Global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  createMockMCPMessage: (overrides = {}) => ({
    id: Math.random().toString(36),
    method: 'test.method',
    params: { test: true },
    ...overrides
  }),
  
  createMockConfig: (overrides = {}) => ({
    backend: {
      command: ['echo', 'test'],
      workingDirectory: process.cwd(),
      restartPolicy: 'never' as const,
      maxRestartAttempts: 0,
      ...overrides.backend
    },
    httpHost: '127.0.0.1',
    httpPort: 13000 + Math.floor(Math.random() * 1000), // Random test port
    maxConcurrentSessions: 5,
    sessionIdleTimeout: 5000,
    logLevel: 'error' as const,
    ...overrides
  })
};

// Extend global types
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    createMockMCPMessage: (overrides?: any) => any;
    createMockConfig: (overrides?: any) => any;
  };
}