import { describe, test, expect, beforeEach, vi, afterEach, type MockInstance } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.ts";
import { Plugin } from "../../src/plugin.ts";
import { ProviderAdapter } from "../../src/providers/adapter.ts";
import type {
	SectionData,
	SectionDimensionContext,
	ProviderResponse,
	PromptContext,
	ProviderSelection,
} from "../../src/types.ts";

/**
 * Call log entry structure
 */
interface CallLogEntry {
	dimension: string;
	content: string;
}

/**
 * Mock provider that tracks calls
 */
class MockProvider {
	name = "mock";
	callLog: CallLogEntry[] = [];

	async execute(request: {
		input: string | string[];
		options?: Record<string, unknown>;
		dimension?: string;
		isGlobal?: boolean;
	}): Promise<ProviderResponse | void> {
		const dimension = request.dimension ?? "unknown";
		const input = Array.isArray(request.input)
			? request.input[0]
			: request.input;

		if (!input) return;

		this.callLog.push({
			dimension,
			content: input.slice(0, 30),
		});

		return {
			data: { result: "mock result", dimension },
			metadata: {
				model: "test-model",
				provider: "mock",
				tokens: {
					inputTokens: 100,
					outputTokens: 200,
					totalTokens: 300,
				},
			},
		};
	}

	reset(): void {
		this.callLog = [];
	}

	getDimensionCallCount(dimension: string): number {
		return this.callLog.filter((c) => c.dimension === dimension).length;
	}

	getTotalCalls(): number {
		return this.callLog.length;
	}
}

describe("shouldSkipSectionDimension - Basic Functionality", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should process all dimensions when shouldSkipSectionDimension is not defined", async () => {
		class NoSkipPlugin extends Plugin {
			constructor() {
				super("no-skip", "No Skip Plugin", "No skip logic");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}
		}

		const plugin = new NoSkipPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test content", metadata: {} }];
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
		expect(mockProvider.getDimensionCallCount("dim1")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim2")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim3")).toBe(1);
	});

	test("should skip dimension when shouldSkipSectionDimension returns true (sync)", async () => {
		class SkipOnePlugin extends Plugin {
			constructor() {
				super("skip-one", "Skip One Plugin", "Skip one dimension");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				return context.dimension === "dim2";
			}
		}

		const plugin = new SkipOnePlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test content", metadata: {} }];
		const result = await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
		expect(mockProvider.getDimensionCallCount("dim1")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim2")).toBe(0);
		expect(mockProvider.getDimensionCallCount("dim3")).toBe(1);

		const sectionResults = result.sections[0]?.results;
		expect(sectionResults?.dim2?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
	});

	test("should skip multiple dimensions when shouldSkipSectionDimension returns true", async () => {
		class SkipMultiplePlugin extends Plugin {
			constructor() {
				super("skip-multiple", "Skip Multiple", "Skip multiple dimensions");
				this.dimensions = ["dim1", "dim2", "dim3", "dim4"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension } = context;
				return dimension === "dim2" || dimension === "dim4";
			}
		}

		const plugin = new SkipMultiplePlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test content", metadata: {} }];
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
		expect(mockProvider.getDimensionCallCount("dim1")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim2")).toBe(0);
		expect(mockProvider.getDimensionCallCount("dim3")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim4")).toBe(0);
	});

	test("should process all dimensions when shouldSkipSectionDimension always returns false", async () => {
		class NeverSkipPlugin extends Plugin {
			constructor() {
				super("never-skip", "Never Skip", "Never skip any dimension");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(_context: SectionDimensionContext): boolean {
				return false;
			}
		}

		const plugin = new NeverSkipPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
	});
});

describe("shouldSkipSectionDimension - Content-Based Routing", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should skip dimension based on section content", async () => {
		class ContentBasedPlugin extends Plugin {
			constructor() {
				super("content-based", "Content Based", "Content-based routing");
				this.dimensions = [
					"extract_code",
					"analyze_sentiment",
					"general_summary",
				];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				const content = section.content.toLowerCase();

				if (dimension === "extract_code") {
					return !/```|function|class|def |import |const /.test(content);
				}

				if (dimension === "analyze_sentiment") {
					return !/review|opinion|feedback|rating/i.test(content);
				}

				return false;
			}
		}

		const plugin = new ContentBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "This is a great product! Review: 5 stars", metadata: {} },
			{ content: 'function hello() { return "world"; }', metadata: {} },
			{ content: "Just some random text about nothing special", metadata: {} },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(5);
		expect(mockProvider.getDimensionCallCount("extract_code")).toBe(1);
		expect(mockProvider.getDimensionCallCount("analyze_sentiment")).toBe(1);
		expect(mockProvider.getDimensionCallCount("general_summary")).toBe(3);
	});

	test("should skip dimension based on content length", async () => {
		class LengthBasedPlugin extends Plugin {
			constructor() {
				super("length-based", "Length Based", "Length-based routing");
				this.dimensions = ["quick_summary", "deep_analysis"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;

				if (dimension === "deep_analysis") {
					return section.content.length < 100;
				}

				if (dimension === "quick_summary") {
					return section.content.length < 20;
				}

				return false;
			}
		}

		const plugin = new LengthBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Hi", metadata: {} },
			{ content: "This is medium length content", metadata: {} },
			{ content: "x".repeat(150), metadata: {} },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
	});

	test("should skip dimension based on regex patterns", async () => {
		class PatternBasedPlugin extends Plugin {
			constructor() {
				super("pattern-based", "Pattern Based", "Pattern-based routing");
				this.dimensions = ["extract_emails", "extract_urls", "extract_phone"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				const content = section.content;

				if (dimension === "extract_emails") {
					return !/@/.test(content);
				}

				if (dimension === "extract_urls") {
					return !/https?:\/\//.test(content);
				}

				if (dimension === "extract_phone") {
					return !/\d{3}[-.]?\d{3}[-.]?\d{4}/.test(content);
				}

				return false;
			}
		}

		const plugin = new PatternBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Contact me at user@example.com", metadata: {} },
			{ content: "Visit https://example.com for more info", metadata: {} },
			{ content: "Call 555-123-4567 or 555.987.6543", metadata: {} },
			{ content: "No contact info here", metadata: {} },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
		expect(mockProvider.getDimensionCallCount("extract_emails")).toBe(1);
		expect(mockProvider.getDimensionCallCount("extract_urls")).toBe(1);
		expect(mockProvider.getDimensionCallCount("extract_phone")).toBe(1);
	});
});

describe("shouldSkipSectionDimension - Metadata-Based Routing", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should skip dimension based on section metadata", async () => {
		class MetadataBasedPlugin extends Plugin {
			constructor() {
				super("metadata-based", "Metadata Based", "Metadata-based routing");
				this.dimensions = ["expensive_analysis", "cheap_analysis"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;

				if (dimension === "expensive_analysis") {
					return section.metadata.runExpensiveAnalysis !== true;
				}
				return false;
			}
		}

		const plugin = new MetadataBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Content 1", metadata: { runExpensiveAnalysis: true } },
			{ content: "Content 2", metadata: {} },
			{ content: "Content 3", metadata: { runExpensiveAnalysis: false } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(4);
		expect(mockProvider.getDimensionCallCount("expensive_analysis")).toBe(1);
		expect(mockProvider.getDimensionCallCount("cheap_analysis")).toBe(3);
	});

	test("should skip dimension based on file type in metadata", async () => {
		class FileTypeBasedPlugin extends Plugin {
			constructor() {
				super("file-type", "File Type Plugin", "File type routing");
				this.dimensions = ["extract_code", "extract_text", "analyze_image"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				const fileType = section.metadata.fileType as string | undefined;

				if (dimension === "extract_code") {
					return fileType !== "code";
				}

				if (dimension === "extract_text") {
					return fileType !== "text";
				}

				if (dimension === "analyze_image") {
					return fileType !== "image";
				}

				return false;
			}
		}

		const plugin = new FileTypeBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "function() {}", metadata: { fileType: "code" } },
			{ content: "Plain text", metadata: { fileType: "text" } },
			{ content: "image data", metadata: { fileType: "image" } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
		expect(mockProvider.getDimensionCallCount("extract_code")).toBe(1);
		expect(mockProvider.getDimensionCallCount("extract_text")).toBe(1);
		expect(mockProvider.getDimensionCallCount("analyze_image")).toBe(1);
	});

	test("should skip dimension based on priority level", async () => {
		class PriorityBasedPlugin extends Plugin {
			constructor() {
				super("priority", "Priority Plugin", "Priority-based routing");
				this.dimensions = [
					"basic_check",
					"standard_analysis",
					"premium_analysis",
				];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				const priority = section.metadata.priority as string | undefined;

				if (dimension === "premium_analysis") {
					return priority !== "high";
				}

				if (dimension === "standard_analysis") {
					return priority === "low";
				}

				return false;
			}
		}

		const plugin = new PriorityBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "High priority", metadata: { priority: "high" } },
			{ content: "Medium priority", metadata: { priority: "medium" } },
			{ content: "Low priority", metadata: { priority: "low" } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(6);
		expect(mockProvider.getDimensionCallCount("basic_check")).toBe(3);
		expect(mockProvider.getDimensionCallCount("standard_analysis")).toBe(2);
		expect(mockProvider.getDimensionCallCount("premium_analysis")).toBe(1);
	});
});

describe("shouldSkipSectionDimension - Async Routing", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should handle async shouldSkipSectionDimension returning Promise<true>", async () => {
		class AsyncPlugin extends Plugin {
			constructor() {
				super("async-plugin", "Async Plugin", "Async skip logic");
				this.dimensions = ["dim1", "dim2", "dim3"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipSectionDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				return context.dimension === "dim2";
			}
		}

		const plugin = new AsyncPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
		expect(mockProvider.getDimensionCallCount("dim1")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim2")).toBe(0);
		expect(mockProvider.getDimensionCallCount("dim3")).toBe(1);
	});

	test("should handle async cache lookup to skip already processed dimensions", async () => {
		const processedCache = new Set<string>(["analysis:doc2", "analysis:doc4"]);

		class CachedPlugin extends Plugin {
			constructor() {
				super("cached", "Cached Plugin", "Cache-based routing");
				this.dimensions = ["analysis"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipSectionDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				const { dimension, section } = context;
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
				const cacheKey = `${dimension}:${section.metadata.id}`;
				return processedCache.has(cacheKey);
			}
		}

		const plugin = new CachedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Doc 1", metadata: { id: "doc1" } },
			{ content: "Doc 2", metadata: { id: "doc2" } },
			{ content: "Doc 3", metadata: { id: "doc3" } },
			{ content: "Doc 4", metadata: { id: "doc4" } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
	});

	test("should handle async API check to determine skip", async () => {
		const externalAPI = {
			async shouldProcess(documentId: string): Promise<boolean> {
				await new Promise<void>((resolve) => setTimeout(resolve, 5));
				const id = parseInt(documentId.replace("doc", ""));
				return id % 2 !== 0;
			},
		};

		class APIBasedPlugin extends Plugin {
			constructor() {
				super("api-based", "API Based", "API-based routing");
				this.dimensions = ["processing"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipSectionDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				const { section } = context;
				const shouldProcess = await externalAPI.shouldProcess(
					section.metadata.id as string,
				);
				return !shouldProcess;
			}
		}

		const plugin = new APIBasedPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Doc 1", metadata: { id: "doc1" } },
			{ content: "Doc 2", metadata: { id: "doc2" } },
			{ content: "Doc 3", metadata: { id: "doc3" } },
			{ content: "Doc 4", metadata: { id: "doc4" } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
	});

	test("should handle mixed sync and async logic in skip decision", async () => {
		class HybridPlugin extends Plugin {
			constructor() {
				super("hybrid", "Hybrid Plugin", "Hybrid sync/async routing");
				this.dimensions = ["quick_check", "deep_analysis"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipSectionDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				const { dimension, section } = context;

				if (section.content.length < 10) {
					return true;
				}

				if (dimension === "deep_analysis") {
					await new Promise<void>((resolve) => setTimeout(resolve, 5));
					return section.metadata.priority !== "high";
				}

				return false;
			}
		}

		const plugin = new HybridPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Hi", metadata: {} },
			{ content: "Medium length content", metadata: { priority: "low" } },
			{ content: "Another medium content", metadata: { priority: "high" } },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
	});
});

describe("shouldSkipSectionDimension - Multiple Sections", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should apply skip logic independently to each section", async () => {
		class IndependentSkipPlugin extends Plugin {
			constructor() {
				super(
					"independent",
					"Independent Skip",
					"Independent skip per section",
				);
				this.dimensions = ["dimension1"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				return section.content.includes("skip");
			}
		}

		const plugin = new IndependentSkipPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Process this", metadata: {} },
			{ content: "skip this one", metadata: {} },
			{ content: "Process this too", metadata: {} },
			{ content: "Also skip", metadata: {} },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(2);
	});

	test("should handle different skip decisions for different dimensions per section", async () => {
		class MultiDimensionSkipPlugin extends Plugin {
			constructor() {
				super("multi-dim", "Multi Dimension", "Multi-dimension skip");
				this.dimensions = ["extract", "analyze", "summarize"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				const isShort = section.content.length < 50;
				const hasCode = /```|function/.test(section.content);

				if (dimension === "extract") {
					return !hasCode;
				}

				if (dimension === "analyze") {
					return isShort;
				}

				if (dimension === "summarize") {
					return isShort;
				}

				return false;
			}
		}

		const plugin = new MultiDimensionSkipPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			{ content: "Hi", metadata: {} },
			{ content: "function test() {}", metadata: {} },
			{ content: "x".repeat(100), metadata: {} },
		];

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(3);
		expect(mockProvider.getDimensionCallCount("extract")).toBe(1);
		expect(mockProvider.getDimensionCallCount("analyze")).toBe(1);
		expect(mockProvider.getDimensionCallCount("summarize")).toBe(1);
	});

	test("should work correctly with high concurrency", async () => {
		class ConcurrentPlugin extends Plugin {
			constructor() {
				super("concurrent", "Concurrent Plugin", "Concurrency test");
				this.dimensions = ["process"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				return (section.metadata.index as number) % 2 === 1;
			}
		}

		const plugin = new ConcurrentPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			concurrency: 10,
		});

		const sections: SectionData[] = Array.from({ length: 20 }, (_, i) => ({
			content: `Section ${i}`,
			metadata: { index: i },
		}));

		mockProvider.reset();
		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(10);
	});
});

describe("shouldSkipSectionDimension - Error Handling", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;
	let consoleErrorSpy: MockInstance;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	test("should handle errors in shouldSkipSectionDimension gracefully (sync error)", async () => {
		class ErrorPlugin extends Plugin {
			constructor() {
				super("error", "Error Plugin", "Error handling test");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				if (context.dimension === "dim2") {
					throw new Error("shouldSkipSectionDimension threw an error");
				}
				return false;
			}
		}

		const plugin = new ErrorPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];

		await expect(engine.process(sections)).resolves.toBeDefined();

		expect(consoleErrorSpy).toHaveBeenCalled();

		expect(mockProvider.getTotalCalls()).toBe(2);
		expect(mockProvider.getDimensionCallCount("dim1")).toBe(1);
		expect(mockProvider.getDimensionCallCount("dim2")).toBe(1);
	});

	test("should handle errors in async shouldSkipSectionDimension gracefully", async () => {
		class AsyncErrorPlugin extends Plugin {
			constructor() {
				super("async-error", "Async Error Plugin", "Async error handling");
				this.dimensions = ["dim1", "dim2"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			async shouldSkipSectionDimension(
				context: SectionDimensionContext,
			): Promise<boolean> {
				await new Promise<void>((resolve) => setTimeout(resolve, 5));

				if (context.dimension === "dim2") {
					throw new Error("Async error in shouldSkipSectionDimension");
				}

				return false;
			}
		}

		const plugin = new AsyncErrorPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];

		await expect(engine.process(sections)).resolves.toBeDefined();

		expect(consoleErrorSpy).toHaveBeenCalled();

		expect(mockProvider.getTotalCalls()).toBe(2);
	});

	test("should handle rejected promises in shouldSkipSectionDimension", async () => {
		class RejectedPromisePlugin extends Plugin {
			constructor() {
				super("rejected", "Rejected Promise Plugin", "Rejected promise test");
				this.dimensions = ["dim1"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(_context: SectionDimensionContext): Promise<boolean> {
				return Promise.reject(new Error("Promise rejected"));
			}
		}

		const plugin = new RejectedPromisePlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];

		await expect(engine.process(sections)).resolves.toBeDefined();

		expect(consoleErrorSpy).toHaveBeenCalled();

		expect(mockProvider.getTotalCalls()).toBe(1);
	});

	test("should handle null/undefined return from shouldSkipSectionDimension", async () => {
		class NullReturnPlugin extends Plugin {
			constructor() {
				super("null-return", "Null Return Plugin", "Null return test");
				this.dimensions = ["dim1"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(_context: SectionDimensionContext): boolean {
				return null as unknown as boolean;
			}
		}

		const plugin = new NullReturnPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [{ content: "Test", metadata: {} }];

		await engine.process(sections);

		expect(mockProvider.getTotalCalls()).toBe(1);
	});
});

describe("shouldSkipSectionDimension - Integration with Other Features", () => {
	let mockProvider: MockProvider;
	let adapter: ProviderAdapter;

	beforeEach(() => {
		mockProvider = new MockProvider();
		adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);
	});

	test("should work correctly with dependencies", async () => {
		class DependencyPlugin extends Plugin {
			constructor() {
				super("dep-plugin", "Dependency Plugin", "Test with dependencies");
				this.dimensions = ["extract", "analyze", "summarize"];
			}

			defineDependencies(): Record<string, string[]> {
				return {
					analyze: ["extract"],
					summarize: ["analyze"],
				};
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				if (dimension === "extract") {
					return section.content.includes("no-extract");
				}
				return false;
			}
		}

		const plugin = new DependencyPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			continueOnError: true,
		});

		const sections: SectionData[] = [
			{ content: "Process all", metadata: {} },
			{ content: "no-extract flag here", metadata: {} },
		];

		mockProvider.reset();
		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(2);
	});

	test("should integrate with cost tracking correctly", async () => {
		class CostTrackingPlugin extends Plugin {
			constructor() {
				super("cost-tracking", "Cost Tracking Plugin", "Test cost tracking");
				this.dimensions = ["cheap", "expensive"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return { provider: "mock", options: {} };
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { dimension, section } = context;
				return (
					dimension === "expensive" && section.metadata.allowExpensive !== true
				);
			}
		}

		const plugin = new CostTrackingPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: {
				models: {
					"test-model": { inputPer1M: 1.0, outputPer1M: 2.0 },
				},
			},
		});

		const sections: SectionData[] = [
			{ content: "Section 1", metadata: {} },
			{ content: "Section 2", metadata: { allowExpensive: true } },
		];

		const result = await engine.process(sections);

		expect(result.costs).toBeDefined();
		expect(result.costs!.byDimension).toHaveProperty("cheap");
		expect(result.costs!.totalCost).toBeGreaterThan(0);

		if (result.costs!.byDimension.expensive) {
			expect(
				result.costs!.byDimension.expensive.tokens.totalTokens,
			).toBeLessThan(
				result.costs!.byDimension.cheap?.tokens.totalTokens ?? Infinity,
			);
		}
	});

	test("should work with provider fallback", async () => {
		let failCount = 0;
		const unreliableProvider = {
			name: "unreliable",
			async execute(): Promise<ProviderResponse> {
				failCount++;
				if (failCount <= 2) {
					throw new Error("Provider temporarily unavailable");
				}
				return {
					data: { result: "success after retry" },
					metadata: {
						model: "test-model",
						provider: "unreliable",
						tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
					},
				};
			},
		};

		const fallbackProvider = {
			name: "fallback",
			async execute(): Promise<ProviderResponse> {
				return {
					data: { result: "fallback result" },
					metadata: {
						model: "test-model",
						provider: "fallback",
						tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(unreliableProvider as never);
		adapter.registerProvider(fallbackProvider as never);

		class FallbackPlugin extends Plugin {
			constructor() {
				super("fallback", "Fallback Plugin", "Test fallback");
				this.dimensions = ["process"];
			}

			createPrompt(context: PromptContext): string {
				return `[DIMENSION: ${context.dimension}] test prompt`;
			}

			selectProvider(): ProviderSelection {
				return {
					provider: "unreliable",
					options: {},
					fallbacks: [{ provider: "fallback", options: {} }],
				};
			}

			shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
				const { section } = context;
				return section.metadata.skip === true;
			}
		}

		const plugin = new FallbackPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			maxRetries: 0,
		});

		const sections: SectionData[] = [
			{ content: "Process", metadata: {} },
			{ content: "Skip", metadata: { skip: true } },
		];

		failCount = 0;
		const result = await engine.process(sections);

		expect(result.sections).toHaveLength(2);
		expect(result.sections[0]?.results.process?.metadata).toBeDefined();
		expect(result.sections[1]?.results.process?.metadata).toEqual({
			skipped: true,
			reason: "Skipped by plugin shouldSkipSectionDimension",
		});
	});
});