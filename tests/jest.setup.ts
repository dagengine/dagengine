import { vi, beforeAll, afterAll } from "vitest";

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
	log: vi.fn(),
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};
