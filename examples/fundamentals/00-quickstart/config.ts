/**
 * Model selection
 */
export const MODELS = {
	FAST: "claude-3-5-haiku-20241022", // Fast & cheap for filtering
	SMART: "claude-3-7-sonnet-20250219", // Powerful for analysis
} as const;

/**
 * Temperature settings
 */
export const TEMPS = {
	DETERMINISTIC: 0.1, // Very consistent (spam detection)
	BALANCED: 0.2, // Slightly varied (categorization)
	CREATIVE: 0.3, // More varied (deep analysis)
} as const;

/**
 * Pricing per 1M tokens (as of Oct 2024)
 * Source: https://www.anthropic.com/pricing
 */
export const PRICING = {
	[MODELS.FAST]: {
		inputPer1M: 0.8, // $0.80 per 1M input tokens
		outputPer1M: 4.0, // $4.00 per 1M output tokens
	},
	[MODELS.SMART]: {
		inputPer1M: 3.0, // $3.00 per 1M input tokens
		outputPer1M: 15.0, // $15.00 per 1M output tokens
	},
} as const;
