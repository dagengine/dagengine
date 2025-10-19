/**
 * 🎯 SMART REVIEW ANALYZER - Kitchen Sink Example
 *
 * Demonstrates 50+ features:
 * ✅ Multi-provider ✅ Transformations ✅ Skip logic
 * ✅ Complex DAG ✅ Error handling ✅ Cost tracking
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
import { DagEngine } from '../../../src';
import { SmartReviewAnalyzer } from './plugin';
import { SAMPLE_REVIEWS } from './sample-data';
import { MODEL_PRICING } from './config';
import { displayResults } from './utils';
import { ConsoleUI } from "../../utils/console-ui";



async function main(): Promise<void> {
	ConsoleUI.showHeader("🚀 DAG-AI Kitchen Sink [Major Features]");

	const plugin = new SmartReviewAnalyzer();

	const engine = new DagEngine({
		plugin,
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY ?? '' },
			openai: { apiKey: process.env.OPENAI_API_KEY ?? '' },
			gemini: { apiKey: process.env.GEMINI_API_KEY ?? '' }
		},
		concurrency: 10,
		maxRetries: 3,
		continueOnError: true,
		pricing: { models: MODEL_PRICING },
		progressDisplay: {
			showDimensions: true,
			display: 'multi'
		}
	});

	console.log(`📝 Processing ${SAMPLE_REVIEWS.length} reviews...\n`);

	const result = await engine.process(SAMPLE_REVIEWS, {
		onDimensionComplete: (d, r) => console.log(r.error ? `❌ ${d}` : `✅ ${d}`)
	});

	displayResults(result, plugin);
}

main().catch((error: unknown) => {
	console.error('❌', error instanceof Error ? error.message : String(error));
	process.exit(1);
});