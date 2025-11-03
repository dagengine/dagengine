import { describe, test, expect, afterEach, vi } from "vitest";
import { WhoisXMLProvider } from "../../src/providers/data/whoisxml.ts";

const originalFetch = global.fetch;

describe("WhoisXMLProvider", () => {
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("should initialize with API key", () => {
		const provider = new WhoisXMLProvider({ apiKey: "test-key" });

		expect(provider.name).toBe("whoisxml");
	});

	test("should throw error without API key", () => {
		expect(() => {
			new WhoisXMLProvider({});
		}).toThrow("API key is required");
	});

	test("should execute domain lookup", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
				createdDate: "1995-08-14",
				expiresDate: "2025-08-13",
				registrarName: "IANA",
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "example.com",
			options: {},
		});

		expect(result.data).toHaveLength(1);
		expect(result.data?.[0]?.domain).toBe("example.com");
		expect(result.data?.[0]?.estimatedDomainAge).toBe(9500);
		expect(result.data?.[0]?.success).toBe(true);
	});

	test("should handle batch domain lookups", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
				createdDate: "1995-08-14",
				expiresDate: "2025-08-13",
				registrarName: "IANA",
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: ["example.com", "test.com"],
			options: {},
		});

		expect(result.data).toHaveLength(2);
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("should cache results", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });

		// First call
		await provider.execute({
			input: "example.com",
			options: {},
		});

		// Second call (should use cache)
		await provider.execute({
			input: "example.com",
			options: {},
		});

		// Should only fetch once due to caching
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	test("should respect cacheTTL", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({
			apiKey: "test-key",
			cacheTTL: 100, // 100ms TTL
		});

		// First call
		await provider.execute({
			input: "example.com",
			options: {},
		});

		// Wait for cache to expire
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Second call (cache expired, should fetch again)
		await provider.execute({
			input: "example.com",
			options: {},
		});

		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("should clear cache", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });

		// First call
		await provider.execute({
			input: "example.com",
			options: {},
		});

		// Clear cache
		provider.clearCache();

		// Second call (should fetch again)
		await provider.execute({
			input: "example.com",
			options: {},
		});

		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test("should handle API errors", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "invalid-key" });
		const result = await provider.execute({
			input: "example.com",
			options: {},
		});

		expect(result.error).toContain("401");
		expect(result.data).toBeUndefined();
	});

	test("should handle missing domain records", async () => {
		const mockResponse = {};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "nonexistent.invalid",
			options: {},
		});

		expect(result.data).toHaveLength(1);
		expect(result.data?.[0]?.success).toBe(false);
		expect(result.data?.[0]?.domain).toBe("nonexistent.invalid");
	});

	test("should handle partial domain data", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				// Missing some fields
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "example.com",
			options: {},
		});

		expect(result.data?.[0]?.domain).toBe("example.com");
		expect(result.data?.[0]?.estimatedDomainAge).toBeNull();
		expect(result.data?.[0]?.createdDate).toBeNull();
		expect(result.data?.[0]?.success).toBe(true);
	});

	test("should use default cacheTTL of 24 hours", async () => {
		const provider = new WhoisXMLProvider({ apiKey: "test-key" });

		// Access private cacheTTL through type assertion for testing
		const ttl = (provider as any).cacheTTL;

		expect(ttl).toBe(86400000); // 24 hours in ms
	});

	test("should include domain in response when missing in API response", async () => {
		const mockResponse = {
			WhoisRecord: {
				// No domainName field
				estimatedDomainAge: 100,
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });
		const result = await provider.execute({
			input: "test.com",
			options: {},
		});

		expect(result.data?.[0]?.domain).toBe("test.com");
	});

	test("should handle cache hit within TTL", async () => {
		const mockResponse = {
			WhoisRecord: {
				domainName: "example.com",
				estimatedDomainAge: 9500,
			},
		};

		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => mockResponse,
		} as Response);

		const provider = new WhoisXMLProvider({ apiKey: "test-key" });

		// First call
		await provider.execute({ input: "example.com", options: {} });

		// Second call immediately (within TTL)
		await provider.execute({ input: "example.com", options: {} });

		// Should only fetch once due to caching
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
