// Global test setup
beforeAll(() => {
    // Setup any global test configuration
});

afterAll(() => {
    // Cleanup
});

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
