/**
 * Fundamentals 08: Error Handling & Retries
 *
 * Learn production-grade error handling strategies.
 *
 * Learn:
 * - onDimensionError() hook
 * - Retry strategies (immediate, exponential backoff)
 * - Fallback strategies (different provider, simpler prompt)
 * - Continue vs fail decisions
 * - Error logging and recovery
 *
 * Critical for:
 * - Production deployments
 * - Long-running workflows
 * - High-reliability systems
 * - Cost-sensitive operations
 *
 * Run: npm run guide:08
 */

import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
	type SectionData,
	type DimensionResult,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

// ============================================================================
// TYPES
// ============================================================================

interface AnalysisResult {
	sentiment: string;
	confidence: number;
}

interface ErrorStats {
	totalErrors: number;
	retriedErrors: number;
	failedErrors: number;
	errorsByType: Record<string, number>;
}

// ============================================================================
// SIMULATED ERROR SCENARIOS
// ============================================================================

/**
 * Simulate different error types for demonstration
 */
class ErrorSimulator {
	private callCount = 0;
	private readonly failPatterns = [
		{ callNumber: 2, errorType: "rate_limit" },      // Fail on 2nd call (should retry)
		{ callNumber: 5, errorType: "timeout" },         // Fail on 5th call (should retry)
		{ callNumber: 8, errorType: "invalid_request" }  // Fail on 8th call (should fail)
	];

	shouldFail(): { fail: boolean; errorType?: string } {
		this.callCount++;

		const pattern = this.failPatterns.find(p => p.callNumber === this.callCount);
		if (pattern) {
			return { fail: true, errorType: pattern.errorType };
		}

		return { fail: false };
	}

	reset(): void {
		this.callCount = 0;
	}
}

// ============================================================================
// PLUGIN WITH ERROR HANDLING
// ============================================================================

/**
 * ErrorHandlingPlugin
 *
 * Demonstrates comprehensive error handling:
 * - Detect error types
 * - Retry with backoff for transient errors
 * - Fallback to different provider/prompt for permanent errors
 * - Continue processing other sections on error
 * - Log all errors for monitoring
 */
class ErrorHandlingPlugin extends Plugin {
	private errorStats: ErrorStats = {
		totalErrors: 0,
		retriedErrors: 0,
		failedErrors: 0,
		errorsByType: {}
	};

	private errorSimulator = new ErrorSimulator();
	private retryAttempts = new Map<string, number>();

	constructor() {
		super(
			"error-handling-plugin",
			"Error Handling Plugin",
			"Production-grade error handling"
		);

		this.dimensions = [
			"analyze",
			{ name: "summary", scope: "global" }
		];
	}

	defineDependencies(): Record<string, string[]> {
		return {
			summary: ["analyze"]
		};
	}

	// ============================================================================
	// HOOK: onDimensionError (CRITICAL FOR PRODUCTION)
	// ============================================================================

	/**
	 * ✅ PRODUCTION HOOK: Handle dimension execution errors
	 *
	 * Called when a dimension fails to execute.
	 *
	 * Return options:
	 * - { action: "retry", delay?: number } - Retry the dimension
	 * - { action: "retry", modifyRequest?: (ctx) => ctx } - Retry with modified request
	 * - { action: "fallback", provider?: string } - Try different provider
	 * - { action: "skip" } - Skip this section, continue others
	 * - { action: "fail" } - Stop entire process
	 *
	 * @param ctx - Error context with full details
	 * @returns Action to take
	 */
	onDimensionError(ctx: any): any {
		const error = ctx.error as Error;
		const dimension = ctx.dimension;
		const sectionId = ctx.section.metadata?.id;

		// Track error statistics
		this.errorStats.totalErrors++;
		const errorType = this.detectErrorType(error);
		this.errorStats.errorsByType[errorType] = (this.errorStats.errorsByType[errorType] || 0) + 1;

		console.log(`\n❌ ERROR in dimension "${dimension}" (section ${sectionId})`);
		console.log(`   Type: ${errorType}`);
		console.log(`   Message: ${error.message}\n`);

		// Track retry attempts for this section
		const retryKey = `${dimension}:${sectionId}`;
		const attempts = this.retryAttempts.get(retryKey) || 0;
		this.retryAttempts.set(retryKey, attempts + 1);

		// ============================================================================
		// STRATEGY 1: Retry transient errors (rate limits, timeouts)
		// ============================================================================

		if (this.isTransientError(errorType)) {
			const maxRetries = 3;

			if (attempts < maxRetries) {
				this.errorStats.retriedErrors++;

				// Exponential backoff: 1s, 2s, 4s
				const delay = Math.pow(2, attempts) * 1000;

				console.log(`   🔄 RETRY: Attempt ${attempts + 1}/${maxRetries} (wait ${delay}ms)`);
				console.log(`   Strategy: Exponential backoff\n`);

				return {
					action: "retry",
					delay: delay
				};
			} else {
				console.log(`   ⚠️  MAX RETRIES: Exceeded ${maxRetries} attempts`);
				console.log(`   Strategy: Fallback to skip\n`);

				this.errorStats.failedErrors++;
				return { action: "skip" }; // Skip this section, continue others
			}
		}

		// ============================================================================
		// STRATEGY 2: Fallback for invalid requests
		// ============================================================================

		if (errorType === "invalid_request" || errorType === "invalid_response") {
			console.log(`   🔀 FALLBACK: Try simpler prompt`);
			console.log(`   Strategy: Modify request\n`);

			this.errorStats.retriedErrors++;

			return {
				action: "retry",
				modifyRequest: (originalCtx: any) => {
					// Simplify the prompt for retry
					return {
						...originalCtx,
						promptOverride: this.createSimplifiedPrompt(originalCtx)
					};
				}
			};
		}

		// ============================================================================
		// STRATEGY 3: Provider fallback for provider-specific errors
		// ============================================================================

		if (errorType === "provider_error") {
			console.log(`   🔀 FALLBACK: Try different provider`);
			console.log(`   Strategy: Switch to fallback provider\n`);

			this.errorStats.retriedErrors++;

			return {
				action: "fallback",
				provider: "openai", // Fallback to OpenAI if Anthropic fails
				options: { model: "gpt-4o-mini" }
			};
		}

		// ============================================================================
		// STRATEGY 4: Skip and continue for non-critical errors
		// ============================================================================

		if (errorType === "content_policy" || errorType === "context_length") {
			console.log(`   ⏭️  SKIP: Non-critical error, continue with other sections`);
			console.log(`   Strategy: Skip this section\n`);

			this.errorStats.failedErrors++;

			return { action: "skip" };
		}

		// ============================================================================
		// STRATEGY 5: Fail fast for critical errors
		// ============================================================================

		console.log(`   🛑 FAIL: Critical error, stopping process`);
		console.log(`   Strategy: Fail fast\n`);

		this.errorStats.failedErrors++;

		return { action: "fail" };
	}

	// ============================================================================
	// ERROR DETECTION HELPERS
	// ============================================================================

	/**
	 * Detect error type from error message
	 */
	private detectErrorType(error: Error): string {
		const message = error.message.toLowerCase();

		if (message.includes("rate limit") || message.includes("429")) {
			return "rate_limit";
		}

		if (message.includes("timeout") || message.includes("timed out")) {
			return "timeout";
		}

		if (message.includes("invalid request") || message.includes("400")) {
			return "invalid_request";
		}

		if (message.includes("invalid") || message.includes("json")) {
			return "invalid_response";
		}

		if (message.includes("content policy") || message.includes("blocked")) {
			return "content_policy";
		}

		if (message.includes("context length") || message.includes("too long")) {
			return "context_length";
		}

		if (message.includes("authentication") || message.includes("401")) {
			return "auth_error";
		}

		if (message.includes("provider") || message.includes("503")) {
			return "provider_error";
		}

		return "unknown";
	}

	/**
	 * Check if error is transient (retryable)
	 */
	private isTransientError(errorType: string): boolean {
		const transientErrors = ["rate_limit", "timeout", "provider_error"];
		return transientErrors.includes(errorType);
	}

	/**
	 * Create simplified prompt for fallback
	 */
	private createSimplifiedPrompt(ctx: any): string {
		const content = ctx.section?.content || "";

		return `Simple analysis: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "confidence": 0.5
}`;
	}

	// ============================================================================
	// STANDARD PLUGIN METHODS
	// ============================================================================

	createPrompt(ctx: PromptContext): string {
		const { dimension, sections } = ctx;

		if (dimension === "analyze") {
			const content = sections[0]?.content || "";

			// Simulate errors on specific calls
			const shouldFail = this.errorSimulator.shouldFail();
			if (shouldFail.fail) {
				// Inject error simulation into prompt metadata
				// In real code, errors would come from actual API failures
				throw new Error(`Simulated ${shouldFail.errorType} error`);
			}

			return `Analyze sentiment: "${content}"

Return JSON:
{
  "sentiment": "positive" or "negative" or "neutral",
  "confidence": 0.0-1.0
}`;
		}

		if (dimension === "summary") {
			const analyzeData = ctx.dependencies.analyze as any;
			const results = analyzeData?.data?.sections || [];

			return `Summarize ${results.length} analyses.

Return JSON:
{
  "summary": "overall summary"
}`;
		}

		return "";
	}

	selectProvider(dimension: string): ProviderSelection {
		return {
			provider: "anthropic",
			options: {
				model: "claude-3-5-haiku-20241022",
				temperature: 0.2
			}
		};
	}

	// ============================================================================
	// STATS
	// ============================================================================

	getErrorStats(): ErrorStats {
		return this.errorStats;
	}

	resetSimulator(): void {
		this.errorSimulator.reset();
	}
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
	console.log("\n📚 Fundamentals 08: Error Handling & Retries\n");
	console.log("Learn production-grade error recovery.\n");

// ============================================================================
// SETUP
// ===============================================================