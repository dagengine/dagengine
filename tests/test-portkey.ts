import "dotenv/config";
import {
	Plugin,
	DagEngine,
	type PromptContext,
	type ProviderSelection,
	type ProviderConfig,
} from "../src/index.ts";

/**
 * Simple test plugin that implements only the required methods
 */
class TestPlugin extends Plugin {
	constructor() {
		super(
			"test-plugin",
			"Test Plugin",
			"Simple plugin for testing gateway integration",
			{},
		);

		// Define one simple dimension
		this.dimensions = ["greeting"];
	}

	/**
	 * REQUIRED: Create prompt for the dimension
	 */
	async createPrompt(_context: PromptContext): Promise<string> {
		return 'Respond with a JSON object containing a greeting: {"greeting": "Hello!", "status": "success"}';
	}

	/**
	 * REQUIRED: Select provider (we'll test with anthropic)
	 */
	async selectProvider(_dimension: string): Promise<ProviderSelection> {
		return {
			provider: "anthropic",
			options: {
				model: "claude-sonnet-4-5-20250929",
				max_tokens: 1024,
				temperature: 0.7,
			},
		};
	}
}

/**
 * Test function for a single provider
 */
async function testProvider(
	providerName: string,
	withGateway: boolean,
): Promise<void> {
	const gatewayLabel = withGateway ? "WITH Portkey" : "WITHOUT Portkey";
	console.log(
		`\n${withGateway ? "🟢" : "🔵"} Testing ${providerName.toUpperCase()} ${gatewayLabel}...`,
	);

	// Get API key from environment
	const apiKey = process.env[`${providerName.toUpperCase()}_API_KEY`];

	if (!apiKey) {
		throw new Error(`Missing API key for ${providerName}`);
	}

	// Build provider config
	const providerConfig: ProviderConfig = {
		apiKey,
	};

	if (withGateway) {
		const portkeyApiKey = process.env.PORTKEY_API_KEY;
		if (!portkeyApiKey) {
			throw new Error("Missing PORTKEY_API_KEY");
		}

		providerConfig.gateway = "portkey";
		providerConfig.gatewayApiKey = portkeyApiKey;
	}

	// Create engine with test plugin
	const engine = new DagEngine({
		plugin: new TestPlugin(),
		providers: {
			[providerName]: providerConfig,
		},
	});

	// Run test
	const startTime = Date.now();

	try {
		const result = await engine.process([
			{
				content: "Test message 1",
				metadata: {},
			},
		]);

		const duration = Date.now() - startTime;

		console.log(`✅ ${providerName} ${gatewayLabel} - Success (${duration}ms)`);
		console.log("Result:", JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(`❌ ${providerName} ${gatewayLabel} - Failed:`, error);
		throw error;
	}
}

/**
 * Check if an environment variable is set
 */
function hasEnvVar(name: string): boolean {
	return !!process.env[name];
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
	console.log("🚀 Starting Portkey Integration Tests");
	console.log("=".repeat(70));

	const hasAnthropicKey = hasEnvVar("ANTHROPIC_API_KEY");
	const hasOpenAIKey = hasEnvVar("OPENAI_API_KEY");
	const hasGeminiKey = hasEnvVar("GEMINI_API_KEY");
	const hasPortkeyKey = hasEnvVar("PORTKEY_API_KEY");

	if (!hasAnthropicKey && !hasOpenAIKey && !hasGeminiKey) {
		console.error("\n❌ No provider API keys found!");
		console.error(
			"Set at least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY",
		);
		process.exit(1);
	}

	try {
		// Test Anthropic
		if (hasAnthropicKey) {
			console.log("\n📍 Testing Anthropic Provider");
			console.log("-".repeat(70));

			await testProvider("anthropic", false); // Direct

			if (hasPortkeyKey) {
				await testProvider("anthropic", true); // Via Portkey
			} else {
				console.log("\n⚠️  Skipping Portkey test (no PORTKEY_API_KEY)");
			}
		}

		// Test OpenAI
		if (hasOpenAIKey) {
			console.log("\n📍 Testing OpenAI Provider");
			console.log("-".repeat(70));

			await testProvider("openai", false); // Direct

			if (hasPortkeyKey) {
				await testProvider("openai", true); // Via Portkey
			}
		}

		// Test Gemini
		if (hasGeminiKey) {
			console.log("\n📍 Testing Gemini Provider");
			console.log("-".repeat(70));

			await testProvider("gemini", false); // Direct

			if (hasPortkeyKey) {
				await testProvider("gemini", true); // Via Portkey
			}
		}

		// Summary
		console.log("\n" + "=".repeat(70));
		console.log("✅ All tests passed!");

		if (hasPortkeyKey) {
			console.log("🎉 Portkey integration is working correctly!\n");
		} else {
			console.log(
				"ℹ️  Direct API calls work. Add PORTKEY_API_KEY to test gateway.\n",
			);
		}
	} catch (error) {
		console.log("\n" + "=".repeat(70));
		console.error("❌ Test failed:", error);
		process.exit(1);
	}
}

// Run tests
main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});