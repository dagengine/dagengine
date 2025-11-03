import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine/dag-engine.ts";
import { Plugin } from "../src/plugin.ts";
import { ProviderRegistry } from "../src/providers/registry.ts";
import { MockAIProvider, createMockSection } from "./setup.ts";
import type { PromptContext, ProviderSelection } from "../src/types.ts";

class TestPlugin extends Plugin {
	constructor() {
		super("test", "Test Plugin", "Test plugin");
		this.dimensions = ["sentiment", "summary"];
	}

	createPrompt(context: PromptContext): string {
		return `Analyze ${context.dimension}: ${context.sections[0]?.content ?? ""}`;
	}

	selectProvider(): ProviderSelection {
		return { provider: "mock-ai", options: {} };
	}

	defineDependencies(): Record<string, string[]> {
		return { summary: ["sentiment"] };
	}
}

describe("DagEngine - Core Functionality", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("Analyze sentiment: Test content", {
			sentiment: "positive",
			score: 0.9,
		});
		mockProvider.setMockResponse("Analyze summary: Test content", {
			summary: "Test summary",
		});

		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should process single section", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [createMockSection("Test content")];
		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.results.sentiment).toBeDefined();
		expect(result.sections[0]?.results.summary).toBeDefined();
	});

	test("should process multiple sections", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			concurrency: 2,
		});

		const sections = [
			createMockSection("Content 1"),
			createMockSection("Content 2"),
			createMockSection("Content 3"),
		];

		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(3);
		result.sections.forEach((section) => {
			expect(section.results.sentiment).toBeDefined();
			expect(section.results.summary).toBeDefined();
		});
	});

	test("should throw error if no sections provided", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		await expect(engine.process([])).rejects.toThrow("at least one section");
	});

	test("should throw error if no providers configured", () => {
		const emptyRegistry = new ProviderRegistry();

		expect(() => {
			new DagEngine({
				plugin: new TestPlugin(),
				registry: emptyRegistry,
			});
		}).toThrow("at least one provider");
	});

	test("should respect concurrency setting", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
			concurrency: 1,
		});

		const sections = [
			createMockSection("Content 1"),
			createMockSection("Content 2"),
		];

		await engine.process(sections);

		expect(mockProvider.callCount).toBeGreaterThan(0);
	});

	test("should handle dependencies correctly", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [createMockSection("Test content")];
		const result = await engine.process(sections);

		// Summary depends on sentiment, so both should be defined
		expect(result.sections[0]?.results.sentiment).toBeDefined();
		expect(result.sections[0]?.results.summary).toBeDefined();

		// Verify the data structure
		const sentimentData = result.sections[0]?.results.sentiment?.data as {
			sentiment?: string;
			score?: number;
		};
		const summaryData = result.sections[0]?.results.summary?.data as {
			summary?: string;
		};

		expect(sentimentData?.sentiment).toBe("positive");
		expect(sentimentData?.score).toBe(0.9);
		expect(summaryData?.summary).toBe("Test summary");
	});

	test("should initialize with default concurrency", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [
			createMockSection("Content 1"),
			createMockSection("Content 2"),
		];

		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(2);
	});

	test("should handle empty metadata in sections", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [
			{ content: "Test content", metadata: {} },
		];

		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.section.metadata).toEqual({});
	});

	test("should return result object with expected structure", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [createMockSection("Test content")];
		const result = await engine.process(sections);

		// Test only what we know should be there
		expect(result).toBeDefined();
		expect(result.sections).toBeDefined();
		expect(Array.isArray(result.sections)).toBe(true);
	});

	test("should return transformed sections", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [createMockSection("Test content")];
		const result = await engine.process(sections);

		expect(result.transformedSections).toBeDefined();
		expect(result.transformedSections).toHaveLength(1);
		expect(result.transformedSections[0]?.content).toBe("Test content");
	});

	test("should initialize with default concurrency", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [
			createMockSection("Content 1"),
			createMockSection("Content 2"),
		];

		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(2);
	});

	test("should handle empty metadata in sections", async () => {
		const engine = new DagEngine({
			plugin: new TestPlugin(),
			registry,
		});

		const sections = [
			{ content: "Test content", metadata: {} },
		];

		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(1);
		expect(result.sections[0]?.section.metadata).toEqual({});
	});
});