import { describe, test, expect, afterEach, vi } from "vitest";
import { TavilyProvider } from "../../src/providers/search/tavily.ts";

const originalFetch = global.fetch;

/**
 * Mock fetch options structure
 */
interface MockFetchOptions {
	body?: string;
	[key: string]: unknown;
}

/**
 * Captured request body structure
 */
interface CapturedBody {
	max_results?: number;
	search_depth?: string;
	[key: string]: unknown;
}

describe("TavilyProvider", () => {
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("should initialize with API key", () => {
		const provider = new TavilyProvider({ apiKey: "test-key" });

		expect(provider.name).toBe("tavily");
	});

	test("should throw error without API key", () => {
		expect(() => {
			new TavilyProvider({});
		}).toThrow("API key is required");
	});

	test("should execute search request", async () => {
		const mockResponse = {
			results: [
				{
					title: "Result 1",
					url: "https://example.com/1",
					content: "Content 1",
					score: 0.9,
				},
				{
					title: "Result 2",
					url: "https://example.com/2",
					content: "Content 2",
					score: 0.8,
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test query",
			options: {},
		});

		expect(result.data).toHaveLength(2);

		const data = result.data as Array<{
			title?: string;
			url?: string;
			content?: string;
			score?: number;
		}>;

		expect(data[0]?.title).toBe("Result 1");
		expect(data[1]?.title).toBe("Result 2");
	});

	test("should handle batch queries", async () => {
		const mockResponse = {
			results: [
				{
					title: "Result 1",
					url: "https://example.com/1",
					content: "Content 1",
					score: 0.9,
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: ["query1", "query2"],
			options: {},
		});

		expect(Array.isArray(result.data)).toBe(true);
		expect(result.data).toHaveLength(2);
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("should handle maxResults parameter", async () => {
		let capturedBody: CapturedBody = {};

		const mockResponse = { results: [] };

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new TavilyProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { maxResults: 10 },
		});

		expect(capturedBody.max_results).toBe(10);
	});

	test("should handle searchDepth parameter", async () => {
		let capturedBody: CapturedBody = {};

		const mockResponse = { results: [] };

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new TavilyProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { searchDepth: "basic" },
		});

		expect(capturedBody.search_depth).toBe("basic");
	});

	test("should use default searchDepth advanced", async () => {
		let capturedBody: CapturedBody = {};

		const mockResponse = { results: [] };

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new TavilyProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedBody.search_depth).toBe("advanced");
	});

	test("should handle API errors", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		} as Response);

		const provider = new TavilyProvider({ apiKey: "invalid-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toContain("401");
		expect(result.data).toBeUndefined();
	});

	test("should return metadata with results", async () => {
		const mockResponse = {
			results: [
				{
					title: "R1",
					url: "https://example.com/1",
					content: "C1",
					score: 0.9,
				},
				{
					title: "R2",
					url: "https://example.com/2",
					content: "C2",
					score: 0.8,
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.metadata).toBeDefined();

		const metadata = result.metadata as {
			totalQueries?: number;
			totalResults?: number;
		};

		expect(metadata.totalQueries).toBe(1);
		expect(metadata.totalResults).toBe(2);
	});

	test("should handle empty results", async () => {
		const mockResponse = {
			results: [],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "nonexistent query",
			options: {},
		});

		expect(Array.isArray(result.data)).toBe(true);
		expect(result.data).toHaveLength(0);

		const metadata = result.metadata as {
			totalResults?: number;
		};
		expect(metadata?.totalResults).toBe(0);
	});

	test("should handle custom endpoint", async () => {
		let capturedUrl = "";

		const mockResponse = { results: [] };

		global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
			capturedUrl = url.toString();
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new TavilyProvider({
			apiKey: "test-key",
			endpoint: "https://custom.tavily.com/search",
		});

		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedUrl).toBe("https://custom.tavily.com/search");
	});

	test("should aggregate results from multiple queries", async () => {
		const mockResponse1 = {
			results: [
				{ title: "R1", url: "https://ex.com/1", content: "C1", score: 0.9 },
			],
		};
		const mockResponse2 = {
			results: [
				{ title: "R2", url: "https://ex.com/2", content: "C2", score: 0.8 },
			],
		};

		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse1,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse2,
			} as Response);

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: ["query1", "query2"],
			options: {},
		});

		expect(Array.isArray(result.data)).toBe(true);
		expect(result.data).toHaveLength(2);

		const metadata = result.metadata as {
			totalQueries?: number;
			totalResults?: number;
		};

		expect(metadata?.totalQueries).toBe(2);
		expect(metadata?.totalResults).toBe(2);
	});

	test("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const provider = new TavilyProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain("Network error");
	});

	test("should use correct default endpoint", async () => {
		let capturedUrl = "";

		const mockResponse = { results: [] };

		global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
			capturedUrl = url.toString();
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new TavilyProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedUrl).toContain("tavily");
	});
});