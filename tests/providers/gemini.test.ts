import { describe, test, expect, vi, afterEach } from "vitest";
import { GeminiProvider } from "../../src/providers/ai/gemini.ts";

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
	generationConfig?: {
		topP?: number;
		topK?: number;
		responseMimeType?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

describe("GeminiProvider", () => {
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("should initialize with API key", () => {
		const provider = new GeminiProvider({ apiKey: "test-key" });

		expect(provider.name).toBe("gemini");
	});

	test("should throw error without API key", () => {
		expect(() => {
			new GeminiProvider({});
		}).toThrow("API key is required");
	});

	test("should execute request successfully", async () => {
		const mockResponse = {
			candidates: [
				{
					content: {
						parts: [{ text: '{"result": "success"}' }],
						role: "model",
					},
					finishReason: "STOP",
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test prompt",
			options: {},
		});

		expect(result.data).toEqual({ result: "success" });
		expect(result.error).toBeUndefined();
	});

	test("should handle safety filters", async () => {
		const mockResponse = {
			candidates: [
				{
					content: { parts: [{ text: '{"result": "ok"}' }], role: "model" },
					finishReason: "SAFETY",
					safetyRatings: [
						{ category: "HARM_CATEGORY_HATE_SPEECH", probability: "HIGH" },
					],
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toContain("safety filters");
	});

	test("should handle content blocking", async () => {
		const mockResponse = {
			promptFeedback: {
				blockReason: "SAFETY",
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "blocked content",
			options: {},
		});

		expect(result.error).toContain("blocked");
	});

	test("should reject batch inputs", async () => {
		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: ["input1", "input2"],
			options: {},
		});

		expect(result.error).toContain("does not support batch inputs");
	});

	test("should handle finish reasons", async () => {
		const mockResponse = {
			candidates: [
				{
					content: {
						parts: [{ text: '{"result": "truncated"}' }],
						role: "model",
					},
					finishReason: "MAX_TOKENS",
				},
			],
		};

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining("MAX_TOKENS"),
		);
		expect(result.data).toEqual({ result: "truncated" });

		consoleWarnSpy.mockRestore();
	});

	test("should return token usage from API", async () => {
		const provider = new GeminiProvider({
			apiKey: "test-key",
		});

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				candidates: [
					{
						content: {
							parts: [{ text: '{"result": "test"}' }],
						},
						finishReason: "STOP",
					},
				],
				usageMetadata: {
					promptTokenCount: 120,
					candidatesTokenCount: 280,
					totalTokenCount: 400,
				},
			}),
		} as Response);

		const result = await provider.execute({
			input: "test",
		});

		expect(result.metadata).toBeDefined();
		expect(result.metadata?.provider).toBe("gemini");
		expect(result.metadata?.tokens).toBeDefined();
		expect(result.metadata?.tokens?.inputTokens).toBe(120);
		expect(result.metadata?.tokens?.outputTokens).toBe(280);
		expect(result.metadata?.tokens?.totalTokens).toBe(400);
	});

	test("should handle custom baseUrl", async () => {
		const mockResponse = {
			candidates: [
				{
					content: { parts: [{ text: '{"result": "ok"}' }], role: "model" },
					finishReason: "STOP",
				},
			],
		};

		let capturedUrl = "";

		global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
			capturedUrl = url.toString();
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new GeminiProvider({
			apiKey: "test-key",
			baseUrl: "https://custom.api.com/v1",
		});

		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedUrl).toContain("https://custom.api.com/v1");
	});

	test("should handle topP and topK parameters", async () => {
		let capturedBody: CapturedBody = {};

		const mockResponse = {
			candidates: [
				{
					content: { parts: [{ text: '{"result": "ok"}' }], role: "model" },
					finishReason: "STOP",
				},
			],
		};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new GeminiProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: { topP: 0.9, topK: 40 },
		});

		expect(capturedBody.generationConfig?.topP).toBe(0.9);
		expect(capturedBody.generationConfig?.topK).toBe(40);
	});

	test("should use default model gemini-2.5-pro", async () => {
		let capturedUrl = "";

		const mockResponse = {
			candidates: [
				{
					content: { parts: [{ text: '{"result": "ok"}' }], role: "model" },
					finishReason: "STOP",
				},
			],
		};

		global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
			capturedUrl = url.toString();
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new GeminiProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedUrl).toContain("gemini-2.5-pro");
	});

	test("should handle empty candidates", async () => {
		const mockResponse = {
			candidates: [],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toContain("no candidates");
	});

	test("should handle API errors", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
			text: async () => "Bad Request",
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toContain("400");
		expect(result.error).toContain("Bad Request");
	});

	test("should force JSON response format", async () => {
		let capturedBody: CapturedBody = {};

		const mockResponse = {
			candidates: [
				{
					content: { parts: [{ text: '{"result": "ok"}' }], role: "model" },
					finishReason: "STOP",
				},
			],
		};

		global.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, options?: MockFetchOptions) => {
			if (options?.body) {
				capturedBody = JSON.parse(options.body) as CapturedBody;
			}
			return {
				ok: true,
				json: async () => mockResponse,
			} as Response;
		});

		const provider = new GeminiProvider({ apiKey: "test-key" });
		await provider.execute({
			input: "test",
			options: {},
		});

		expect(capturedBody.generationConfig?.responseMimeType).toBe(
			"application/json",
		);
	});

	test("should handle MAX_TOKENS finish reason warning", async () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const mockResponse = {
			candidates: [
				{
					content: {
						parts: [{ text: '{"result": "truncated"}' }],
						role: "model",
					},
					finishReason: "MAX_TOKENS",
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		await provider.execute({ input: "test", options: {} });

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	test("should handle network errors", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain("Network error");
	});

	test("should handle malformed JSON responses", async () => {
		const mockResponse = {
			candidates: [
				{
					content: {
						parts: [{ text: "This is not valid JSON" }],
						role: "model",
					},
					finishReason: "STOP",
				},
			],
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new GeminiProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test",
			options: {},
		});

		expect(result.error).toBeDefined();
		expect(result.error).toContain("No JSON found");
	});
});