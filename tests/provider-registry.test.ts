import { describe, test, expect, beforeEach } from "vitest";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type { ProviderSelection } from "../src/types.ts";

describe("ProviderRegistry", () => {
	test("should register and retrieve providers", () => {
		const registry = new ProviderRegistry();
		const provider = new MockAIProvider();

		registry.register(provider);

		expect(registry.has("mock-ai")).toBe(true);
		expect(registry.get("mock-ai")).toBe(provider);
	});

	test("should throw error for duplicate registration", () => {
		const registry = new ProviderRegistry();
		const provider = new MockAIProvider();

		registry.register(provider);

		expect(() => registry.register(provider)).toThrow("already registered");
	});

	test("should throw error for missing provider", () => {
		const registry = new ProviderRegistry();

		expect(() => registry.get("nonexistent")).toThrow("not found");
	});

	test("should list all providers", () => {
		const registry = new ProviderRegistry();
		registry.register(new MockAIProvider());

		const list = registry.list();

		expect(list).toContain("mock-ai");
	});
});

// ============================================================================
// Plugin Tests
// ============================================================================

describe("Plugin", () => {
	test("should get dimension names", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test");
				this.dimensions = [
					"simple",
					{ name: "complex", scope: "global" as const },
				];
			}

			createPrompt(): string {
				return "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();
		const names = plugin.getDimensionNames();

		expect(names).toEqual(["simple", "complex"]);
	});

	test("should identify global dimensions", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test");
				this.dimensions = [
					"section",
					{ name: "global", scope: "global" as const },
				];
			}

			createPrompt(): string {
				return "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();

		expect(plugin.isGlobalDimension("section")).toBe(false);
		expect(plugin.isGlobalDimension("global")).toBe(true);
	});

	test("should throw error for unknown dimension", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test");
				this.dimensions = ["known"];
			}

			createPrompt(): string {
				return "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();

		expect(() => plugin.getDimensionConfig("unknown")).toThrow("not found");
	});

	test("should get dimension config", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test");
				this.dimensions = [
					"simple",
					{ name: "complex", scope: "global" as const },
				];
			}

			createPrompt(): string {
				return "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();

		const simpleConfig = plugin.getDimensionConfig("simple");
		expect(simpleConfig.name).toBe("simple");
		expect(simpleConfig.scope).toBe("section");

		const complexConfig = plugin.getDimensionConfig("complex");
		expect(complexConfig).toEqual({ name: "complex", scope: "global" });
	});

	test("should handle mixed dimension types", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("test", "Test", "Test");
				this.dimensions = [
					"dim1",
					{ name: "dim2", scope: "section" as const },
					{ name: "dim3", scope: "global" as const },
					"dim4",
				];
			}

			createPrompt(): string {
				return "";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();
		const names = plugin.getDimensionNames();

		expect(names).toEqual(["dim1", "dim2", "dim3", "dim4"]);
		expect(plugin.isGlobalDimension("dim1")).toBe(false);
		expect(plugin.isGlobalDimension("dim2")).toBe(false);
		expect(plugin.isGlobalDimension("dim3")).toBe(true);
		expect(plugin.isGlobalDimension("dim4")).toBe(false);
	});

	test("should validate plugin properties", () => {
		class TestPlugin extends Plugin {
			constructor() {
				super("my-plugin", "My Plugin", "A test plugin");
				this.dimensions = ["test"];
			}

			createPrompt(): string {
				return "test prompt";
			}

			selectProvider(): ProviderSelection {
				return { provider: "test", options: {} };
			}
		}

		const plugin = new TestPlugin();

		expect(plugin.id).toBe("my-plugin");
		expect(plugin.name).toBe("My Plugin");
		expect(plugin.description).toBe("A test plugin");
		expect(plugin.dimensions).toHaveLength(1);
	});
});