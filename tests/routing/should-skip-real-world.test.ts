import { describe, test, expect } from "vitest";
import { DagEngine } from "../../src/core/engine/dag-engine.ts";
import { Plugin } from "../../src/plugin.ts";
import { ProviderAdapter } from "../../src/providers/adapter.ts";
import type {
	SectionData,
	SectionDimensionContext,
	PromptContext,
	ProviderSelection,
	ProviderResponse,
} from "../../src/types.ts";

/**
 * Mock provider call log entry
 */
interface CallLogEntry {
	dimension: string;
	content: string;
}

/**
 * Mock provider with call tracking
 */
interface MockProviderWithTracking {
	name: string;
	callLog: CallLogEntry[];
	execute(options: {
		input?: string;
		[key: string]: unknown;
	}): Promise<ProviderResponse>;
	getDimensionCallCount(dimension: string): number;
}

/**
 * Mock provider with call counting
 */
interface MockProviderWithCount {
	name: string;
	callCount: number;
	execute(): Promise<ProviderResponse>;
}

describe("Routing - Real-World Document Processing", () => {
	class DocumentProcessingPlugin extends Plugin {
		constructor() {
			super(
				"doc-processor",
				"Document Processor",
				"Real-world document processing with intelligent routing",
			);

			this.dimensions = [
				"extract_code",
				"analyze_sentiment",
				"extract_entities",
				"classify_document",
				"generate_summary",
			];
		}

		createPrompt(context: PromptContext): string {
			return `[DIMENSION: ${context.dimension}] Process: ${context.sections[0]?.content.slice(0, 50) ?? ""}`;
		}

		selectProvider(): ProviderSelection {
			return { provider: "mock", options: {} };
		}

		shouldSkipSectionDimension(context: SectionDimensionContext): boolean {
			const { dimension, section } = context;
			const content = section.content.toLowerCase();
			const metadata = section.metadata;

			switch (dimension) {
				case "extract_code":
					return !(
						/```|function|class|def |import |const |let |var /.test(content) ||
						metadata.fileType === "code"
					);

				case "analyze_sentiment":
					return !(
						/review|feedback|opinion|comment|rating/i.test(content) ||
						metadata.type === "review" ||
						metadata.type === "social_media"
					);

				case "extract_entities":
					return section.content.length < 50;

				case "classify_document":
					return metadata.category !== undefined;

				case "generate_summary":
					return section.content.length < 200 || metadata.hasSummary === true;

				default:
					return false;
			}
		}
	}

	test("should efficiently process mixed document types with smart routing", async () => {
		const mockProvider: MockProviderWithTracking = {
			name: "mock",
			callLog: [],
			async execute(options: {
				input?: string;
				[key: string]: unknown;
			}): Promise<ProviderResponse> {
				const input = options.input ?? "";
				const match = input.match(/\[DIMENSION: ([^\]]+)\]/);
				const dimension = match?.[1] ?? "unknown";

				this.callLog.push({ dimension, content: input.slice(0, 50) });

				return {
					data: { result: "processed", dimension },
					metadata: {
						model: "test-model",
						provider: "mock",
						tokens: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
					},
				};
			},
			getDimensionCallCount(dimension: string): number {
				return this.callLog.filter((c) => c.dimension === dimension).length;
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);

		const plugin = new DocumentProcessingPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
		});

		const sections: SectionData[] = [
			// Document 1: Code file
			{
				content: 'function hello() {\n  return "world";\n}\n\nclass MyClass {}',
				metadata: { fileType: "code", id: "doc1" },
			},

			// Document 2: Product review
			{
				content:
					"This product is absolutely amazing! I love everything about it. " +
					"The quality is outstanding and the customer service was excellent. " +
					"Highly recommend to anyone looking for a reliable product. Worth every penny! " +
					"Rating: 5/5 stars. Will definitely buy again.",
				metadata: { type: "review", id: "doc2" },
			},

			// Document 3: Short note
			{
				content: "Meeting at 3pm today",
				metadata: { id: "doc3" },
			},

			// Document 4: Pre-classified news article
			{
				content:
					"Breaking news from the world of science: Researchers have discovered a new species " +
					"in the Amazon rainforest. The finding was announced by the University of São Paulo " +
					"and represents a significant contribution to biodiversity research. Scientists believe " +
					"this discovery could have important implications for conservation efforts.",
				metadata: { category: "news", id: "doc4" },
			},

			// Document 5: Social media post
			{
				content:
					"Just had the worst customer service experience ever! Totally disappointed. " +
					"Not happy at all with this company.",
				metadata: { type: "social_media", id: "doc5" },
			},
		];

		mockProvider.callLog = [];
		const result = await engine.process(sections);

		const totalCalls = mockProvider.callLog.length;
		const codeExtractions = mockProvider.getDimensionCallCount("extract_code");
		const sentimentAnalyses =
			mockProvider.getDimensionCallCount("analyze_sentiment");
		const entityExtractions =
			mockProvider.getDimensionCallCount("extract_entities");
		const classifications =
			mockProvider.getDimensionCallCount("classify_document");
		const summaries = mockProvider.getDimensionCallCount("generate_summary");

		console.log("\n=== Document Processing Analysis ===");
		console.log(`Total API calls: ${totalCalls}`);
		console.log(`extract_code: ${codeExtractions}`);
		console.log(`analyze_sentiment: ${sentimentAnalyses}`);
		console.log(`extract_entities: ${entityExtractions}`);
		console.log(`classify_document: ${classifications}`);
		console.log(`generate_summary: ${summaries}`);

		// Without routing: 5 sections × 5 dimensions = 25 calls
		// With routing: ~10-12 calls (50-60% reduction)
		expect(totalCalls).toBeLessThan(15);
		expect(totalCalls).toBeGreaterThan(8);

		// Verify specific dimension usage
		expect(codeExtractions).toBeGreaterThanOrEqual(1); // At least doc1
		expect(sentimentAnalyses).toBeGreaterThanOrEqual(2); // doc2 + doc5

		// Verify all sections processed
		expect(result.sections).toHaveLength(5);
	});

	test("should demonstrate cost savings with smart routing", async () => {
		const mockProvider: MockProviderWithCount = {
			name: "mock",
			callCount: 0,
			async execute(): Promise<ProviderResponse> {
				this.callCount++;
				return {
					data: { result: "processed" },
					metadata: {
						model: "test-model",
						provider: "mock",
						tokens: { inputTokens: 500, outputTokens: 1000, totalTokens: 1500 },
					},
				};
			},
		};

		const adapter = new ProviderAdapter({});
		adapter.registerProvider(mockProvider as never);

		const plugin = new DocumentProcessingPlugin();
		const engine = new DagEngine({
			plugin,
			providers: adapter,
			pricing: {
				models: {
					"test-model": { inputPer1M: 1.0, outputPer1M: 2.0 },
				},
			},
		});

		// Generate 100 mixed documents
		const sections: SectionData[] = [
			// 30 code files
			...Array.from({ length: 30 }, (_, i) => ({
				content: `function test${i}() { return ${i}; }`,
				metadata: { fileType: "code", id: `code${i}` },
			})),
			// 30 reviews
			...Array.from({ length: 30 }, (_, i) => ({
				content: `This is review ${i}. `.repeat(20) + "Rating: 5/5",
				metadata: { type: "review", id: `review${i}` },
			})),
			// 20 short notes
			...Array.from({ length: 20 }, (_, i) => ({
				content: `Short note ${i}`,
				metadata: { id: `note${i}` },
			})),
			// 20 pre-classified articles
			...Array.from({ length: 20 }, (_, i) => ({
				content: `Article ${i} content. `.repeat(25),
				metadata: { category: "news", id: `article${i}` },
			})),
		];

		mockProvider.callCount = 0;
		const result = await engine.process(sections);

		const callsWithRouting = mockProvider.callCount;
		const callsWithoutRouting = 100 * 5; // 100 sections × 5 dimensions

		const savings =
			((callsWithoutRouting - callsWithRouting) / callsWithoutRouting) * 100;

		console.log("\n=== Cost Savings Analysis ===");
		console.log(`Sections processed: 100`);
		console.log(`Without routing: ${callsWithoutRouting} API calls`);
		console.log(`With routing: ${callsWithRouting} API calls`);
		console.log(`Savings: ${savings.toFixed(1)}% fewer API calls`);

		if (result.costs) {
			console.log(`Total cost: $${result.costs.totalCost.toFixed(4)}`);
		}

		// Should save at least 30% of API calls
		expect(callsWithRouting).toBeLessThan(callsWithoutRouting * 0.7);

		// Verify costs are tracked correctly
		expect(result.costs).toBeDefined();
		expect(result.costs!.totalCost).toBeGreaterThan(0);
	});
});