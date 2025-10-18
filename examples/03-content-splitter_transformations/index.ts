import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type DimensionResult,
	type SectionData,
	type TransformSectionsContext,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// Types
// ============================================================================

interface SplitResult {
	paragraphs: string[];
}

interface TopicsResult {
	topics: string[];
}

interface SummaryResult {
	summary: string;
	total_topics: number;
}

// ============================================================================
// Prompts
// ============================================================================

function createSplitPrompt(content: string): string {
	return `Split this text into separate paragraphs:

"${content}"

Return JSON: { "paragraphs": ["paragraph 1", "paragraph 2", "paragraph 3"] }`;
}

function createTopicsPrompt(content: string): string {
	return `Extract 2-3 main topics from this paragraph:

"${content}"

Return JSON: { "topics": ["topic1", "topic2"] }`;
}

function createSummaryPrompt(ctx: PromptContext): string {
	const topicsData = ctx.dependencies.extract_topics as DimensionResult<{
		sections: Array<DimensionResult<TopicsResult>>;
	}>;

	const allTopics: string[] = [];

	if (topicsData?.data?.sections) {
		topicsData.data.sections.forEach(section => {
			if (section?.data?.topics) {
				allTopics.push(...section.data.topics);
			}
		});
	}

	return `Write a brief summary mentioning these topics: ${allTopics.join(", ")}

Return JSON: { "summary": "2-3 sentence summary", "total_topics": ${allTopics.length} }`;
}

// ============================================================================
// Plugin
// ============================================================================

class ContentSplitterPlugin extends Plugin {
	public constructor() {
		super("splitter", "Content Splitter", "Split and analyze content");

		this.dimensions = [
			{ name: "split", scope: "global" },
			"extract_topics",
			{ name: "summary", scope: "global" },
		];
	}

	public defineDependencies(): Record<string, string[]> {
		return {
			summary: ["extract_topics"],
			extract_topics: ["split"],  // ←
		};
	}

	public createPrompt(ctx: PromptContext): string {
		const { dimension, sections } = ctx;
		const content = sections[0]?.content ?? "";

		if (dimension === "split") return createSplitPrompt(content);
		if (dimension === "extract_topics") return createTopicsPrompt(content);
		if (dimension === "summary") return createSummaryPrompt(ctx);

		return "";
	}

	public selectProvider(): ProviderSelection {
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022" },
		};
	}

	public transformSections(ctx: TransformSectionsContext): SectionData[] {
		if (ctx.dimension === "split") {
			const result = ctx.result as DimensionResult<SplitResult>;
			const paragraphs = result?.data?.paragraphs ?? [];

			if (paragraphs.length > 0) {
				return paragraphs.map((text, idx) => ({
					content: text,
					metadata: { paragraph: idx + 1 },
				}));
			}
		}

		return ctx.currentSections;
	}
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const apiKey = process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY is required");
	}

	console.log("\n🔄 Content Splitter [Transformations]\n");

	const engine = new DagEngine({
		plugin: new ContentSplitterPlugin(),
		providers: {
			anthropic: { apiKey },
		},
		progressDisplay: {
			display: 'multi',
			showDimensions: true
		}
	});

	const article = `
    AI is transforming software development. Modern tools can write code, analyze data, and automate workflows. This is happening faster than predicted.
    
    However, integrating AI services is challenging. Developers struggle with dependencies, errors, and coordinating providers. The complexity can be overwhelming.
    
    New orchestration tools are solving these problems. They provide declarative workflows, automatic dependency resolution, and built-in error handling. The future looks promising.
  `.trim();

	console.log("Processing article...\n");

	const startTime = Date.now();
	const result = await engine.process([{ content: article, metadata: {} }]);
	const duration = Date.now() - startTime;

	// Extract results
	const splitResult = result.globalResults?.split as DimensionResult<SplitResult>;
	const summaryResult = result.globalResults?.summary as DimensionResult<SummaryResult>;
	const paragraphCount = splitResult?.data?.paragraphs?.length ?? 0;

	// Display results
	console.log("━".repeat(60));
	console.log("RESULTS");
	console.log("━".repeat(60));

	console.log(`\n✓ Split into ${paragraphCount} paragraphs\n`);

	console.log('result', JSON.stringify(result, null, 4));

	result.sections.forEach((section, idx) => {
		const topicsResult = section.results?.extract_topics as DimensionResult<TopicsResult>;
		const topics = topicsResult?.data?.topics ?? [];
		console.log(`  Paragraph ${idx + 1}: ${topics.join(", ")}`);
	});

	console.log(`\n✓ Summary:\n`);
	console.log(`  ${summaryResult?.data?.summary}`);

	console.log("\n" + "━".repeat(60));
	console.log(`Completed in ${duration}ms`);
	console.log("━".repeat(60) + "\n");
}

main().catch((error: unknown) => {
	console.error("\n❌ Error:", error);
	process.exit(1);
});