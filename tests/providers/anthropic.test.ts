import { describe, test, expect, vi, afterEach } from "vitest";
import { AnthropicProvider } from "../../src/providers/ai/anthropic.ts";

// Mock fetch globally
const originalFetch = global.fetch;

describe("AnthropicProvider", () => {
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("should initialize with API key", () => {
		const provider = new AnthropicProvider({ apiKey: "test-key" });

		expect(provider.name).toBe("anthropic");
	});

	test("should throw error without API key", () => {
		expect(() => {
			new AnthropicProvider({});
		}).toThrow("API key is required");
	});

	test("should execute request successfully", async () => {
		const mockResponse = {
			content: [{ text: '{"result": "success"}' }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
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
			text: async () => "Unauthorized",
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "invalid-key" });
		const result = await provider.execute({
			input: "test prompt",
			options: {},
		});

		expect(result.error).toContain("401");
		expect(result.error).toContain("Unauthorized");
		expect(result.data).toBeUndefined();
	});

	test("should parse JSON responses", async () => {
		const mockResponse = {
			content: [{ text: '```json\n{"parsed": true}\n```' }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.data).toEqual({ parsed: true });
	});

	test("should handle custom model", async () => {
		let capturedBody: any;

		global.fetch = vi.fn().mockImplementation(async (url, options) => {
			capturedBody = JSON.parse(options?.body as string);
			return {
				ok: true,
				json: async () => ({ content: [{ text: '{"result": "ok"}' }] }),
			} as Response;
		});

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { model: "claude-opus-4" },
		});

		expect(capturedBody.model).toBe("claude-opus-4");
	});

	test("should handle custom maxTokens", async () => {
		let capturedBody: any;

		global.fetch = vi.fn().mockImplementation(async (url, options) => {
			capturedBody = JSON.parse(options?.body as string);
			return {
				ok: true,
				json: async () => ({ content: [{ text: '{"result": "ok"}' }] }),
			} as Response;
		});

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { maxTokens: 8192 },
		});

		expect(capturedBody.max_tokens).toBe(8192);
	});

	test("should handle custom temperature", async () => {
		let capturedBody: any;

		global.fetch = vi.fn().mockImplementation(async (url, options) => {
			capturedBody = JSON.parse(options?.body as string);
			return {
				ok: true,
				json: async () => ({ content: [{ text: '{"result": "ok"}' }] }),
			} as Response;
		});

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { temperature: 0.5 },
		});

		expect(capturedBody.temperature).toBe(0.5);
	});

	test("should use default model when not specified", async () => {
		let capturedBody: any;

		global.fetch = vi.fn().mockImplementation(async (url, options) => {
			capturedBody = JSON.parse(options?.body as string);
			return {
				ok: true,
				json: async () => ({ content: [{ text: '{"result": "ok"}' }] }),
			} as Response;
		});

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedBody.model).toBe("claude-sonnet-4-5-20250929");
	});

	test("should handle truly malformed JSON responses", async () => {
		const mockResponse = {
			content: [{ text: "This is not JSON at all, just plain text" }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		// Should have error because no JSON found
		expect(result.error).toBeDefined();
		expect(result.error).toContain("No JSON found");
	});

	test("should repair malformed JSON responses", async () => {
		const mockResponse = {
			content: [{ text: "{invalid json" }],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		// jsonrepair should successfully repair it
		expect(result.data).toBeDefined();
		expect(result.error).toBeUndefined();
	});

	test("should handle empty response content", async () => {
		const mockResponse = {
			content: [],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
	});

	test("should include metadata in response", async () => {
		const provider = new AnthropicProvider({
			apiKey: "test-key",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				content: [{ text: '{"result": "test"}' }],
				model: "custom-model",
				usage: {
					input_tokens: 100,
					output_tokens: 200,
				},
			}),
		} as Response);

		const result = await provider.execute({
			input: "test",
			options: { model: "custom-model" },
		});

		expect(result.metadata).toBeDefined();
		expect(result.metadata?.model).toBe("custom-model");
		expect(result.metadata?.provider).toBe("anthropic");
		expect(result.metadata?.tokens).toBeDefined();
		expect(result.metadata?.tokens?.inputTokens).toBe(100);
		expect(result.metadata?.tokens?.outputTokens).toBe(200);
		expect(result.metadata?.tokens?.totalTokens).toBe(300);
	});

	test("should handle response with no content array", async () => {
		const mockResponse = {
			content: [],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new AnthropicProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
	});
});
