import { describe, test, expect, beforeEach } from "vitest";
import { DagEngine } from "../src/core/engine";
import { Plugin, type PromptContext, type ProviderSelection } from "../src/plugin";
import { ProviderRegistry } from "../src/providers/registry";
import { MockAIProvider, createMockSection } from "./setup";
import type { SectionDimensionContext } from "../src/types";

// ============================================================================
// TEST TYPES
// ============================================================================

interface TestData {
	quality?: string;
	result?: string;
	skipped?: boolean;
	reason?: string;
	[key: string]: unknown;
}

/**
 * Helper to get typed data from dimension result
 */
function getResultData(result: unknown): TestData | undefined {
	if (
		typeof result === "object" &&
		result !== null &&
		"data" in result
	) {
		return (result as { data: unknown }).data as TestData;
	}
	return undefined;
}

// ============================================================================
// TESTS
// ============================================================================

describe("DagEngine - Dynamic Skipping", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should skip dimensions based on shouldSkipSectionDimension with dependency access", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test skip");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					analysis: ["check"], // analysis depends on check
				};
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					// Access 'check' through dependencies
					const checkData = dependencies?.check?.data as TestData | undefined;
					return checkData?.quality === "good";
				}
				return false;
			}
		}

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// check dimension executes normally
		const checkData = getResultData(result.sections[0]?.results?.check);
		expect(checkData).toEqual({
			quality: "good",
		});

		// analysis dimension is skipped because check.quality === 'good'
		const analysisData = getResultData(result.sections[0]?.results?.analysis);
		expect(analysisData).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
	});

	test("should execute dimension when skip condition not met", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return {
					analysis: ["check"],
				};
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					const checkData = dependencies?.check?.data as TestData | undefined;
					return checkData?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "poor" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		// check executes and returns 'poor'
		const checkData = getResultData(result.sections[0]?.results?.check);
		expect(checkData).toEqual({
			quality: "poor",
		});

		// analysis executes because check.quality !== 'good'
		const analysisData = getResultData(result.sections[0]?.results?.analysis);
		expect(analysisData).toEqual({
			result: "deep",
		});
	});

	test("should skip dimension without dependencies (content-based)", async () => {
		class ContentSkipPlugin extends Plugin {
			constructor() {
				super("content-skip", "Content Skip", "Test content skip");
				this.dimensions = ["process"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				// Skip if content is too short
				return section.content.length < 10;
			}
		}

		mockProvider.setMockResponse("process", { result: "processed" });

		const engine = new DagEngine({
			plugin: new ContentSkipPlugin(),
			registry,
		});

		const result = await engine.process([
			createMockSection("Hi"), // Too short - skip
			createMockSection("Long enough content"), // Long enough - process
		]);

		// First section skipped
		const section0Data = getResultData(result.sections[0]?.results?.process);
		expect(section0Data).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});

		// Second section processed
		const section1Data = getResultData(result.sections[1]?.results?.process);
		expect(section1Data).toEqual({
			result: "processed",
		});
	});
});

describe("Dependency-Based Skipping", () => {
	let mockProvider: MockAIProvider;
	let registry: ProviderRegistry;

	beforeEach(() => {
		mockProvider = new MockAIProvider();
		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });
		registry = new ProviderRegistry();
		registry.register(mockProvider);
	});

	test("should skip dimensions based on dependency results", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test skip");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { analysis: ["check"] };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					const checkData = dependencies?.check?.data as TestData | undefined;
					return checkData?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "good" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		const checkData = getResultData(result.sections[0]?.results?.check);
		expect(checkData).toEqual({
			quality: "good",
		});

		const analysisData = getResultData(result.sections[0]?.results?.analysis);
		expect(analysisData).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
	});

	test("should execute dimension when skip condition not met", async () => {
		class SkipPlugin extends Plugin {
			constructor() {
				super("skip", "Skip", "Test");
				this.dimensions = ["check", "analysis"];
			}

			createPrompt(context: PromptContext): string {
				return context.dimension;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock-ai", options: {} };
			}

			defineDependencies(): Record<string, string[]> {
				return { analysis: ["check"] };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, dependencies } = context;

				if (dimension === "analysis") {
					const checkData = dependencies?.check?.data as TestData | undefined;
					return checkData?.quality === "good";
				}
				return false;
			}
		}

		mockProvider.setMockResponse("check", { quality: "poor" });
		mockProvider.setMockResponse("analysis", { result: "deep" });

		const engine = new DagEngine({
			plugin: new SkipPlugin(),
			registry,
		});

		const result = await engine.process([createMockSection("Test")]);

		const analysisData = getResultData(result.sections[0]?.results?.analysis);
		expect(analysisData).toEqual({
			result: "deep",
		});
	});
});