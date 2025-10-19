/**
 * Fundamentals 01: Hello World
 *
 * The absolute simplest dag-ai plugin.
 *
 * Learn:
 * - Plugin class structure
 * - Single dimension
 * - Basic prompt creation
 * - Provider selection
 *
 * Run: npm run guide:01
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface GreetingResult {
	greeting: string;
	language: string;
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * HelloWorldPlugin
 *
 * The simplest possible plugin:
 * - One dimension: "greet"
 * - One prompt: "Say hello to {name}"
 * - One provider: Anthropic Claude
 */
class HelloWorldPlugin extends Plugin {
	constructor() {
		// Every plugin needs 3 things:
		super(
			"hello-world",           // 1. Unique ID
			"Hello World",           // 2. Display name
			"Say hello to names"     // 3. Description
		);

		// ✅ DIMENSIONS: The "tasks" in your workflow
		// This plugin has ONE task: greet
		this.dimensions = ["greet"];
	}

	/**
	 * ✅ REQUIRED METHOD 1: createPrompt
	 *
	 * This method tells dag-ai what to ask the AI.
	 * It's called once per section.
	 *
	 * @param ctx - Context with section data
	 * @returns Prompt string sent to AI
	 */
	createPrompt(ctx: PromptContext): string {
		// Get the name from the section content
		const name = ctx.sections[0]?.content || "World";

		// Create a simple prompt
		return `Say hello to ${name} in a friendly way.

Return JSON with this structure:
{
  "greeting": "your greeting here",
  "language": "english"
}`;
	}

	/**
	 * ✅ REQUIRED METHOD 2: selectProvider
	 *
	 * This method tells dag-ai which AI provider to use.
	 *
	 * @param dimension - The dimension being processed
	 * @returns Provider configuration
	 */
	selectProvider(dimension: string): ProviderSelection {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",  // Fast, cheap model
				temperature: 0.7                      // Slightly creative
			}
		};
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 01: Hello World\n");
	console.log("The simplest possible dag-ai plugin.\n");

	// ============================================================================
	// STEP 1: Create the engine
	// ============================================================================

	console.log("Step 1: Creating engine with HelloWorldPlugin...");

	const engine = new DagEngine({
		plugin: new HelloWorldPlugin(),
		providers: {
			anthropic: {
				apiKey: process.env.ANTHROPIC_API_KEY!
			}
		}
	});

	console.log("✓ Engine created\n");

	// ============================================================================
	// STEP 2: Prepare input data
	// ============================================================================

	console.log("Step 2: Preparing input sections...");

	const sections: SectionData[] = [
		{ content: "Alice", metadata: { id: 1 } },
		{ content: "Bob", metadata: { id: 2 } },
		{ content: "Charlie", metadata: { id: 3 } }
	];

	console.log(`✓ Prepared ${sections.length} sections\n`);

	// ============================================================================
	// STEP 3: Process
	// ============================================================================

	console.log("Step 3: Processing...\n");

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	// ============================================================================
	// STEP 4: Display results
	// ============================================================================

	console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("RESULTS");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	result.sections.forEach((section, idx) => {
		const name = section.section.content;
		const greetingResult = section.results.greet?.data as GreetingResult | undefined;

		if (greetingResult) {
			console.log(`${idx + 1}. ${name}`);
			console.log(`   → ${greetingResult.greeting}`);
			console.log(`   Language: ${greetingResult.language}\n`);
		}
	});

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`⚡ Completed in ${(duration / 1000).toFixed(2)}s`);

	if (result.costs) {
		console.log(`💰 Cost: $${result.costs.totalCost.toFixed(4)}`);
	}

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	// ============================================================================
	// STEP 5: Explain what happened
	// ============================================================================

	console.log("✨ What just happened?\n");
	console.log("1. Engine created with HelloWorldPlugin");
	console.log("2. Plugin defined ONE dimension: 'greet'");
	console.log("3. Engine processed 3 sections (names)");
	console.log("4. For each section:");
	console.log("   - Called createPrompt() to build request");
	console.log("   - Called selectProvider() to choose AI");
	console.log("   - Sent request to Anthropic Claude");
	console.log("   - Parsed JSON response");
	console.log("5. All 3 sections processed IN PARALLEL (automatically)\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ Plugin structure (extends Plugin)");
	console.log("✓ Dimensions (tasks in your workflow)");
	console.log("✓ createPrompt() method (what to ask AI)");
	console.log("✓ selectProvider() method (which AI to use)");
	console.log("✓ Automatic parallelization (no code needed)\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);

	if (error.message.includes("API key")) {
		console.error("\n💡 Fix: Add ANTHROPIC_API_KEY to examples/.env");
		console.error("   Get your key at: https://console.anthropic.com/\n");
	}

	process.exit(1);
});