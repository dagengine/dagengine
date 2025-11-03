import { describe, test, expect, vi, afterEach } from "vitest";
import { OpenAIProvider } from "../../src/providers/ai/openai.ts";

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
	model?: string;
	max_tokens?: number;
	temperature?: number;
	[key: string]: unknown;
}

describe("OpenAIProvider", () => {
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("should initialize with API key", () => {
		const provider = new OpenAIProvider({ apiKey: "test-key" });

		expect(provider.name).toBe("openai");
	});

	test("should throw error without API key", () => {
		expect(() => {
			new OpenAIProvider({});
		}).toThrow("API key is required");
	});

	test("should execute request successfully", async () => {
		const mockResponse = {
			choices: [{ message: { content: '{"result": "success"}' } }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test prompt",
			options: {},
		});

		expect(result.data).toEqual({ result: "success" });
		expect(result.error).toBeUndefined();
	});

	test("should handle API errors", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => "Invalid API key",
		} as Response);

		const provider = new OpenAIProvider({ apiKey: "invalid-key" });
		const result = await provider.execute({
			input: "test prompt",
			options: {},
		});

		expect(result.error).toContain("401");
		expect(result.error).toContain("Invalid API key");
		expect(result.data).toBeUndefined();
	});

	test("should use default model gpt-4o", async () => {
		let capturedBody: CapturedBody = {};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"ok": true}' } }],
				}),
			} as Response;
		});

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedBody.model).toBe("gpt-4o");
	});

	test("should handle custom model", async () => {
		let capturedBody: CapturedBody = {};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"ok": true}' } }],
				}),
			} as Response;
		});

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { model: "gpt-4o-mini" },
		});

		expect(capturedBody.model).toBe("gpt-4o-mini");
	});

	test("should handle custom parameters", async () => {
		let capturedBody: CapturedBody = {};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"ok": true}' } }],
				}),
			} as Response;
		});

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {
				max_tokens: 2048,
				temperature: 0.7,
			},
		});

		expect(capturedBody.max_tokens).toBe(2048);
		expect(capturedBody.temperature).toBe(0.7);
	});

	test("should parse JSON responses", async () => {
		const mockResponse = {
			choices: [{ message: { content: '```json\n{"parsed": true}\n```' } }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.data).toEqual({ parsed: true });
	});

	test("should use default temperature 0.1", async () => {
		let capturedBody: CapturedBody = {};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"ok": true}' } }],
				}),
			} as Response;
		});

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedBody.temperature).toBe(0.1);
	});

	test("should handle empty response", async () => {
		const mockResponse = {
			choices: [],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
	});

	test("should include metadata in response", async () => {
		const provider = new OpenAIProvider({
			apiKey: "test-key",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: '{"result": "test"}',
						},
					},
				],
				model: "gpt-4o",
				usage: {
					prompt_tokens: 150,
					completion_tokens: 250,
					total_tokens: 400,
				},
			}),
		} as Response);

		const result = await provider.execute({
			input: "test",
			options: { model: "gpt-4o" },
		});

		expect(result.metadata).toBeDefined();
		expect(result.metadata?.model).toBe("gpt-4o");
		expect(result.metadata?.provider).toBe("openai");
		expect(result.metadata?.tokens).toBeDefined();
		expect(result.metadata?.tokens?.inputTokens).toBe(150);
		expect(result.metadata?.tokens?.outputTokens).toBe(250);
		expect(result.metadata?.tokens?.totalTokens).toBe(400);
	});

	test("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain("Network error");
	});

	test("should handle malformed JSON responses", async () => {
		const mockResponse = {
			choices: [{ message: { content: "This is not valid JSON" } }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new OpenAIProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain("No JSON found");
	});
});