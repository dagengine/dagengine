/**
 * Fundamentals 07: Async Hooks & External Integrations
 *
 * Learn how to integrate external async tools in hooks.
 *
 * Learn:
 * - All hooks support async/await
 * - Integrate databases, APIs, caches
 * - Real-world integration patterns
 * - Error handling in async hooks
 *
 * Use cases:
 * - Database lookups
 * - External API calls
 * - Redis caching
 * - Webhook notifications
 * - File system operations
 *
 * Run: npm run guide:07
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
	type SectionDimensionContext,
	type DimensionResult,
	type TransformSectionsContext,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// MOCK EXTERNAL SERVICES (Replace with real integrations)
// ============================================================================

/**
 * Mock Database Service
 */
class DatabaseService {
	async getUserPreferences(userId: string): Promise<{ theme: string; language: string }> {
		console.log(`   🗄️  Database: Fetching preferences for user ${userId}...`);
		await this.delay(100);
		return { theme: "dark", language: "en" };
	}

	async saveAnalysisResult(data: unknown): Promise<void> {
		console.log(`   🗄️  Database: Saving result...`);
		await this.delay(50);
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

/**
 * Mock Redis Cache Service
 */
class CacheService {
	private cache = new Map<string, { data: unknown; timestamp: number }>();

	async get(key: string): Promise<unknown | null> {
		console.log(`   💾 Cache: Checking for key "${key}"...`);
		await this.delay(10);

		const cached = this.cache.get(key);
		if (!cached) return null;

		// Check if expired (5 min TTL)
		const age = Date.now() - cached.timestamp;
		if (age > 5 * 60 * 1000) {
			this.cache.delete(key);
			return null;
		}

		console.log(`   💾 Cache: HIT!`);
		return cached.data;
	}

	async set(key: string, data: unknown): Promise<void> {
		console.log(`   💾 Cache: Storing key "${key}"...`);
		await this.delay(10);
		this.cache.set(key, { data, timestamp: Date.now() });
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

/**
 * Mock External API Service
 */
class ExternalAPIService {
	async enrichData(content: string): Promise<{ metadata: Record<string, unknown> }> {
		console.log(`   🌐 API: Enriching data...`);
		await this.delay(200);
		return {
			metadata: {
				source: "external-api",
				enriched: true,
				timestamp: new Date().toISOString()
			}
		};
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

/**
 * Mock Webhook Service
 */
class WebhookService {
	async notify(event: string, data: unknown): Promise<void> {
		console.log(`   📡 Webhook: Sending "${event}" notification...`);
		await this.delay(50);
		// In real implementation: await fetch(webhookUrl, { method: 'POST', body: JSON.stringify(data) })
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// ============================================================================
// TYPES
// ============================================================================

interface AnalysisResult {
	sentiment: string;
	score: number;
	enriched_metadata?: Record<string, unknown>;
}

// ============================================================================
// PLUGIN WITH ASYNC HOOKS
// ============================================================================

/**
 * AsyncHooksPlugin
 *
 * Demonstrates async operations in ALL hooks:
 * - beforeProcess (setup)
 * - beforeDimensionExecute (pre-processing)
 * - shouldSkipDimension (cache check)
 * - transformDependencies (data enrichment)
 * - afterDimensionExecute (save results)
 * - transformSections (async transformation)
 * - afterProcess (cleanup/notifications)
 */
class AsyncHooksPlugin extends Plugin {
	// External services
	private db = new DatabaseService();
	private cache = new CacheService();
	private api = new ExternalAPIService();
	private webhooks = new WebhookService();

	// State
	private userPreferences: Record<string, unknown> = {};
	private processedCount = 0;

	constructor() {
		super(
			"async-hooks-plugin",
			"Async Hooks Plugin",
			"Demonstrates async operations in hooks"
		);

		this.dimensions = [
			"analyze",
			{ name: "aggregate", scope: "global" }
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			aggregate: ["analyze"]
		};
	}

	// ============================================================================
	// HOOK 1: beforeProcess (async)
	// ============================================================================

	/**
	 * Called once before processing starts
	 *
	 * Use for:
	 * - Loading configuration from database
	 * - Fetching user preferences
	 * - Initializing external connections
	 * - Pre-warming caches
	 */
	async beforeProcess(sections: SectionData[]): Promise<void> {
		console.log("\n🎬 HOOK: beforeProcess (async)\n");

		// Load user preferences from database
		const userId = "user-123"; // In real app, get from context
		this.userPreferences = await this.db.getUserPreferences(userId);

		console.log(`   ✓ Loaded preferences: ${JSON.stringify(this.userPreferences)}\n`);
	}

	// ============================================================================
	// HOOK 2: beforeDimensionExecute (async)
	// ============================================================================

	/**
	 * Called before each dimension execution
	 *
	 * Use for:
	 * - Fetching additional context
	 * - Validating prerequisites
	 * - Rate limit checks
	 * - Logging/monitoring
	 */
	async beforeDimensionExecute(ctx: SectionDimensionContext): Promise<void> {
		if (ctx.dimension === "analyze") {
			console.log(`\n⚙️  HOOK: beforeDimensionExecute (async) - ${ctx.dimension}`);

			// Could do async operations here
			// Example: Check rate limits, fetch context, etc.
			await this.delay(10);

			console.log(`   ✓ Pre-execution checks passed\n`);
		}
	}

	// ============================================================================
	// HOOK 3: shouldSkipDimension (async)
	// ============================================================================

	/**
	 * Decide whether to skip dimension execution
	 *
	 * Use for:
	 * - Cache lookups (Redis, Memcached)
	 * - Database checks (already processed?)
	 * - External service checks
	 * - Conditional logic with async operations
	 */
	async shouldSkipDimension(
		ctx: SectionDimensionContext
	): Promise<boolean | { skip: boolean; result?: unknown }> {
		if (ctx.dimension !== "analyze") return false;

		console.log(`\n🔍 HOOK: shouldSkipDimension (async) - ${ctx.dimension}`);

		// Check cache (async)
		const cacheKey = `analysis:${ctx.section.content.slice(0, 50)}`;
		const cached = await this.cache.get(cacheKey);

		if (cached) {
			console.log(`   ✓ Cache hit! Skipping execution\n`);
			return { skip: true, result: cached };
		}

		console.log(`   ✗ Cache miss. Proceeding with execution\n`);
		return false;
	}

	// ============================================================================
	// HOOK 4: transformDependencies (async)
	// ============================================================================

	/**
	 * Transform dependency data before using in prompts
	 *
	 * Use for:
	 * - Enriching data from external APIs
	 * - Translating formats
	 * - Fetching related data
	 * - Data validation/cleaning
	 */
	async transformDependencies(
		ctx: SectionDimensionContext
	): Promise<Record<string, DimensionResult<unknown>>> {
		if (ctx.dimension !== "aggregate") {
			return ctx.dependencies;
		}

		console.log(`\n🔄 HOOK: transformDependencies (async) - ${ctx.dimension}`);

		// Enrich dependency data with external API
		const enriched = { ...ctx.dependencies };

		// Simulate API call to enrich data
		const apiData = await this.api.enrichData("aggregate analysis");

		// Add enrichment to dependencies
		if (enriched.analyze) {
			enriched.analyze = {
				...enriched.analyze,
				metadata: {
					...enriched.analyze.metadata,
					enriched: apiData.metadata
				}
			};
		}

		console.log(`   ✓ Dependencies enriched with external data\n`);

		return enriched;
	}

	// ============================================================================
	// HOOK 5: afterDimensionExecute (async)
	// ============================================================================

	/**
	 * Called after dimension executes successfully
	 *
	 * Use for:
	 * - Saving results to database
	 * - Updating caches
	 * - Sending notifications
	 * - Logging/analytics
	 */
	async afterDimensionExecute(ctx: SectionDimensionContext): Promise<void> {
		if (ctx.dimension !== "analyze") return;

		console.log(`\n💾 HOOK: afterDimensionExecute (async) - ${ctx.dimension}`);

		// Save to cache (async)
		const cacheKey = `analysis:${ctx.section.content.slice(0, 50)}`;
		await this.cache.set(cacheKey, ctx.result);

		// Save to database (async)
		await this.db.saveAnalysisResult({
			dimension: ctx.dimension,
			section_id: ctx.section.metadata?.id,
			result: ctx.result.data
		});

		// Send webhook notification (async)
		await this.webhooks.notify("analysis.completed", {
			dimension: ctx.dimension,
			section_id: ctx.section.metadata?.id
		});

		this.processedCount++;

		console.log(`   ✓ Result cached, saved, and notification sent\n`);
	}

	// ============================================================================
	// HOOK 6: transformSections (async)
	// ============================================================================

	/**
	 * Transform sections between dimensions
	 *
	 * Use for:
	 * - Fetching additional data per section
	 * - External API enrichment
	 * - Database lookups
	 * - File system operations
	 */
	async transformSections(ctx: TransformSectionsContext): Promise<SectionData[]> {
		if (ctx.dimension !== "analyze") {
			return ctx.currentSections;
		}

		console.log(`\n🔄 HOOK: transformSections (async) - ${ctx.dimension}`);

		// Enrich each section with external data (async)
		const enrichedSections = await Promise.all(
			ctx.currentSections.map(async (section) => {
				const enrichment = await this.api.enrichData(section.content);

				return {
					...section,
					metadata: {
						...section.metadata,
						...enrichment.metadata
					}
				};
			})
		);

		console.log(`   ✓ ${enrichedSections.length} sections enriched\n`);

		return enrichedSections;
	}

	// ============================================================================
	// HOOK 7: afterProcess (async)
	// ============================================================================

	/**
	 * Called once after all processing completes
	 *
	 * Use for:
	 * - Final cleanup
	 * - Sending completion notifications
	 * - Updating dashboards
	 * - Closing connections
	 */
	async afterProcess(
		sections: SectionData[],
		results: unknown
	): Promise<void> {
		console.log("\n🏁 HOOK: afterProcess (async)\n");

		// Send completion webhook
		await this.webhooks.notify("process.completed", {
			total_sections: sections.length,
			processed_count: this.processedCount,
			timestamp: new Date().toISOString()
		});

		console.log(`   ✓ Completion notification sent`);
		console.log(`   ✓ Processed ${this.processedCount} sections\n`);
	}

	// ============================================================================
	// STANDARD PLUGIN METHODS
	// ============================================================================

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections } = ctx;
		const content = sections[0]?.content || "";

		if (dimension === "analyze") {
			return `Analyze: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "score": 0.0-1.0
}`;
		}

		if (dimension === "aggregate") {
			return `Create aggregate analysis.

Return JSON:
{
  "summary": "overall summary"
}`;
		}

		return "";
	}

	selectProvider(): ProviderSelection {
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022", temperature: 0.2 }
		};
	}

	// Helper
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 07: Async Hooks & External Integrations\n");
	console.log("Watch async operations in action...\n");

	const sections: SectionData[] = [
		{ content: "Great product!", metadata: { id: 1 } },
		{ content: "Not satisfied", metadata: { id: 2 } },
		{ content: "Great product!", metadata: { id: 3 } } // Duplicate for cache demo
	];

	const engine = new DagEngine({
		plugin: new AsyncHooksPlugin(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! }
		}
	});

	console.log(`Processing ${sections.length} sections...\n`);
	console.log("=" .repeat(60));

	const startTime = Date.now();
	const result = await engine.process(sections);
	const duration = Date.now() - startTime;

	console.log("=" .repeat(60));
	console.log(`\n✅ Complete in ${(duration / 1000).toFixed(2)}s\n`);

	// ============================================================================
	// EXPLANATION
	// ============================================================================

	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("ASYNC HOOKS SUMMARY");
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

	console.log("✨ What happened:\n");

	console.log("1. beforeProcess (async)");
	console.log("   → Loaded user preferences from database");
	console.log("   → Setup complete before processing started\n");

	console.log("2. beforeDimensionExecute (async)");
	console.log("   → Pre-execution checks for each dimension");
	console.log("   → Could validate, fetch context, check limits\n");

	console.log("3. shouldSkipDimension (async)");
	console.log("   → Checked Redis cache for each section");
	console.log("   → Section 3 was cached (duplicate of section 1)");
	console.log("   → Skipped expensive API call\n");

	console.log("4. transformDependencies (async)");
	console.log("   → Enriched data with external API");
	console.log("   → Added metadata before prompt generation\n");

	console.log("5. afterDimensionExecute (async)");
	console.log("   → Saved results to database");
	console.log("   → Updated Redis cache");
	console.log("   → Sent webhook notifications\n");

	console.log("6. transformSections (async)");
	console.log("   → Enriched sections with external API data");
	console.log("   → Each section got additional metadata\n");

	console.log("7. afterProcess (async)");
	console.log("   → Sent completion webhook");
	console.log("   → Cleanup and final notifications\n");

	console.log("🎓 What you learned:\n");
	console.log("✓ ALL hooks support async/await");
	console.log("✓ Integrate databases (PostgreSQL, MongoDB, etc.)");
	console.log("✓ Integrate caches (Redis, Memcached, etc.)");
	console.log("✓ Call external APIs (enrichment, validation)");
	console.log("✓ Send webhooks/notifications");
	console.log("✓ File system operations");
	console.log("✓ Any async operation you need\n");

	console.log("💡 Real-world integration examples:\n");

	console.log("Database (PostgreSQL):");
	console.log("  async shouldSkipDimension(ctx) {");
	console.log("    const exists = await db.query(");
	console.log("      'SELECT 1 FROM results WHERE content_hash = $1',");
	console.log("      [hash(ctx.section.content)]");
	console.log("    );");
	console.log("    return exists.rows.length > 0;");
	console.log("  }\n");

	console.log("Cache (Redis):");
	console.log("  async shouldSkipDimension(ctx) {");
	console.log("    const cached = await redis.get(cacheKey);");
	console.log("    if (cached) {");
	console.log("      return { skip: true, result: JSON.parse(cached) };");
	console.log("    }");
	console.log("  }\n");

	console.log("External API:");
	console.log("  async transformDependencies(ctx) {");
	console.log("    const enriched = await fetch(");
	console.log("      'https://api.example.com/enrich',");
	console.log("      { method: 'POST', body: JSON.stringify(ctx.dependencies) }");
	console.log("    );");
	console.log("    return await enriched.json();");
	console.log("  }\n");

	console.log("Webhooks:");
	console.log("  async afterDimensionExecute(ctx) {");
	console.log("    await fetch(webhookUrl, {");
	console.log("      method: 'POST',");
	console.log("      body: JSON.stringify({");
	console.log("        event: 'dimension.completed',");
	console.log("        data: ctx.result");
	console.log("      })");
	console.log("    });");
	console.log("  }\n");

	console.log("File System:");
	console.log("  async afterProcess(sections, results) {");
	console.log("    await fs.writeFile(");
	console.log("      'results.json',");
	console.log("      JSON.stringify(results, null, 2)");
	console.log("    );");
	console.log("  }\n");

	console.log("⚠️  Error handling:\n");
	console.log("Always wrap async operations in try/catch:");
	console.log("  async shouldSkipDimension(ctx) {");
	console.log("    try {");
	console.log("      const cached = await redis.get(key);");
	console.log("      return cached ? { skip: true, result: cached } : false;");
	console.log("    } catch (error) {");
	console.log("      console.error('Cache error:', error);");
	console.log("      return false; // Proceed without cache on error");
	console.log("    }");
	console.log("  }\n");

	console.log("🎉 You now know how to integrate ANY external service!\n");
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error: Error) => {
	console.error("\n❌ Error:", error.message);
	process.exit(1);
});