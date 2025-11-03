import { describe, test, expect, vi } from "vitest";
import {
	ProviderAdapter,
	createProviderAdapter,
} from "../src/providers/adapter";
import { ProviderRegistry } from "../src/providers/registry";
import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../src/providers/types";

class TestProvider extends BaseProvider {
	constructor(name: string, config: ProviderConfig = {}) {
		super(name, config);
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		return { data: { result: "test" } };
	}

	getNativeBaseUrl() {
		return '';
	}
}

describe("ProviderAdapter", () => {
	test("should initialize providers from config", () => {
		const adapter = new ProviderAdapter({
			anthropic: { apiKey: "test-key" },
		});

		expect(adapter.hasProvider("anthropic")).toBe(true);
	});

	test("should initialize multiple providers", () => {
		const adapter = new ProviderAdapter({
			anthropic: { apiKey: "test-key-1" },
			openai: { apiKey: "test-key-2" },
		});

		expect(adapter.hasProvider("anthropic")).toBe(true);
		expect(adapter.hasProvider("openai")).toBe(true);
	});

	test("should handle provider initialization failures gracefully", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const adapter = new ProviderAdapter({
			// @ts-expect-error - test
			anthropic: {}, // Missing API key
		});

		expect(consoleSpy).toHaveBeenCalled();
		expect(adapter.hasProvider("anthropic")).toBe(false);

		consoleSpy.mockRestore();
	});

	test("should register custom providers", () => {
		const adapter = new ProviderAdapter({});
		const customProvider = new TestProvider("custom");

		adapter.registerProvider(customProvider);

		expect(adapter.hasProvider("custom")).toBe(true);
	});

	test("should execute requests through adapter", async () => {
		const adapter = new ProviderAdapter({});
		const testProvider = new TestProvider("test");
		adapter.registerProvider(testProvider);

		const result = await adapter.execute("test", {
			input: "test input",
			options: {},
		});

		expect(result.data).toEqual({ result: "test" });
	});

	test("should get provider instance", () => {
		const adapter = new ProviderAdapter({});
		const testProvider = new TestProvider("test");
		adapter.registerProvider(testProvider);

		const provider = adapter.getProvider("test");

		expect(provider).toBe(testProvider);
		expect(provider.name).toBe("test");
	});

	test("should check provider availability", () => {
		const adapter = new ProviderAdapter({});

		expect(adapter.hasProvider("nonexistent")).toBe(false);

		adapter.registerProvider(new TestProvider("test"));

		expect(adapter.hasProvider("test")).toBe(true);
	});

	test("should list all providers", () => {
		const adapter = new ProviderAdapter({});
		adapter.registerProvider(new TestProvider("test1"));
		adapter.registerProvider(new TestProvider("test2"));

		const providers = adapter.listProviders();

		expect(providers).toContain("test1");
		expect(providers).toContain("test2");
		expect(providers).toHaveLength(2);
	});

	test("should get underlying registry", () => {
		const adapter = new ProviderAdapter({});
		const registry = adapter.getRegistry();

		expect(registry).toBeInstanceOf(ProviderRegistry);
	});

	test("should throw error when executing with non-existent provider", async () => {
		const adapter = new ProviderAdapter({});

		await expect(
			adapter.execute("nonexistent", { input: "test" }),
		).rejects.toThrow("not found");
	});

	test("should handle empty configuration", () => {
		const adapter = new ProviderAdapter({});

		expect(adapter.listProviders()).toHaveLength(0);
	});
});

describe("createProviderAdapter", () => {
	test("should create adapter with factory function", () => {
		const adapter = createProviderAdapter({
			anthropic: { apiKey: "test-key" },
		});

		expect(adapter).toBeInstanceOf(ProviderAdapter);
		expect(adapter.hasProvider("anthropic")).toBe(true);
	});

	test("should create adapter with empty config", () => {
		const adapter = createProviderAdapter({});

		expect(adapter).toBeInstanceOf(ProviderAdapter);
		expect(adapter.listProviders()).toHaveLength(0);
	});
});

describe("ProviderAdapter - Warning Messages", () => {
	test("should warn when Anthropic config provided without API key", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		new ProviderAdapter({
			anthropic: {} as any,
		});

		expect(consoleSpy).toHaveBeenCalledWith(
			"Anthropic provider config provided but API key is missing",
		);
		consoleSpy.mockRestore();
	});

	test("should warn when OpenAI config provided without API key", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		new ProviderAdapter({
			openai: {} as any,
		});

		expect(consoleSpy).toHaveBeenCalledWith(
			"OpenAI provider config provided but API key is missing",
		);
		consoleSpy.mockRestore();
	});

	test("should warn when Gemini config provided without API key", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		new ProviderAdapter({
			gemini: {} as any,
		});

		expect(consoleSpy).toHaveBeenCalledWith(
			"Gemini provider config provided but API key is missing",
		);
		consoleSpy.mockRestore();
	});

	test("should warn when Tavily config provided without API key", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		new ProviderAdapter({
			tavily: {} as any,
		});

		expect(consoleSpy).toHaveBeenCalledWith(
			"Tavily provider config provided but API key is missing",
		);
		consoleSpy.mockRestore();
	});

	test("should warn when WhoisXML config provided without API key", () => {
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		new ProviderAdapter({
			whoisxml: {} as any,
		});

		expect(consoleSpy).toHaveBeenCalledWith(
			"WhoisXML provider config provided but API key is missing",
		);
		consoleSpy.mockRestore();
	});
});
