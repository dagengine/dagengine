import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type DimensionResult,
} from "../../../src";
import { ConsoleUI } from "../../utils/console-ui";

config({ path: resolve(process.cwd(), ".env") });

// Type-safe result interfaces
interface TopicsResult {
	topics: string[];
}

interface SentimentResult {
	sentiment: "positive" | "negative" | "neutral";
	score: number;
}

interface SummaryResult {
	summary: string;
	tone: string;
}

class BlogAnalyzerPlugin extends Plugin {
	public constructor() {
		super("blog-analyzer", "Blog Analyzer", "Multi-dimensional blog analysis");

		this.dimensions = [
			"extract_topics",
			"sentiment_analysis",
			{ name: "editorial_summary", scope: "global" },
		];
	}

	public defineDependencies(): Record<string, string[]> {
		return {
			editorial_summary: ["extract_topics", "sentiment_analysis"],
		};
	}

	public createPrompt(ctx: PromptContext): string {
		const { dimension, sections, dependencies } = ctx;

		if (dimension === "extract_topics") {
			const content = sections[0]?.content ?? "";
			return `Extract main topics from: "${content}"

Return JSON: { "topics": ["topic1", "topic2", "topic3"] }`;
		}

		if (dimension === "sentiment_analysis") {
			const content = sections[0]?.content ?? "";
			return `Analyze sentiment: "${content}"

Return JSON: { "sentiment": "positive|negative|neutral", "score": 0.85, "confidence": 0.9 }`;
		}

		if (dimension === "editorial_summary") {
			const topicsResult = dependencies.extract_topics as DimensionResult<TopicsResult> | undefined;
			const sentimentResult = dependencies.sentiment_analysis as DimensionResult<SentimentResult> | undefined;

			const topics = topicsResult?.data?.topics ?? [];
			const sentiment = sentimentResult?.data?.sentiment ?? "neutral";
			const content = sections[0]?.content ?? "";

			return `Create summary:

Topics: ${topics.join(", ")}
Sentiment: ${sentiment}
Text: "${content}"

Return JSON: { "summary": "2-3 sentences", "tone": "professional|casual|technical", "key_points": ["point1", "point2"] }`;
		}

		return "";
	}

	public selectProvider(): ProviderSelection {
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022" },
		};
	}
}

async function main(): Promise<void> {
	const apiKey = process.env.ANTHROPIC_API_KEY;

	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY is required");
	}

	// Show header
	ConsoleUI.showHeader("🚀 DAG-AI Blog Analyzer [Dependencies]");

	const engine = new DagEngine({
		plugin: new BlogAnalyzerPlugin(),
		providers: {
			anthropic: { apiKey },
		},
	});

	const blogPost = `
    AI is transforming software development.
    Developers can now build systems faster than ever.
    However, managing AI workflows remains challenging.
  `;

	const startTime = Date.now();
	const result = await engine.process([
		{ content: blogPost.trim(), metadata: {} },
	]);
	const duration = Date.now() - startTime;

	// Collect all results (section + global)
	const section = result.sections[0];
	const allResults: Record<string, unknown> = {
		...section?.results,
		...result.globalResults,
	};

	// Extract data from results
	const resultsData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(allResults)) {
		const dimResult = value as DimensionResult<unknown>;
		resultsData[key] = dimResult?.data ?? dimResult;
	}

	// Render results (generic - works with any structure!)
	ConsoleUI.renderResults(resultsData);

	// Show stats
	ConsoleUI.showStats({
		duration: `${duration}ms`,
		"parallel tasks": 2,
		"synthesis tasks": 1,
		"estimated cost": "~$0.0001",
	});

	// Show success
	ConsoleUI.showSuccess("Analysis completed successfully!", [
		"Parallel dimension execution",
		"Dependency management",
		"Section vs Global processing",
	]);
}

main().catch((error: unknown) => {
	ConsoleUI.showError(error);
	process.exit(1);
});