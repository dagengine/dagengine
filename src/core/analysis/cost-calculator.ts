import type {
	SectionData,
	DimensionResult,
	PricingConfig,
	CostSummary,
	DimensionCost,
	TokenUsage,
} from "../../types.js";

/**
 * Handles all cost calculation and pricing logic
 */
export class CostCalculator {
	constructor(private readonly pricing: PricingConfig) {}

	/**
	 * Calculate comprehensive cost summary from results
	 */
	calculate(
		sectionResults: Array<{
			section: SectionData;
			results: Record<string, DimensionResult>;
		}>,
		globalResults: Record<string, DimensionResult>,
	): CostSummary {
		const byDimension: Record<string, DimensionCost> = {};
		const byProvider: Record<
			string,
			{ cost: number; tokens: TokenUsage; models: string[] }
		> = {};

		let totalCost = 0;
		let totalInputTokens = 0;
		let totalOutputTokens = 0;

		// Process section results
		for (const { results } of sectionResults) {
			for (const [dimension, result] of Object.entries(results)) {
				const cost = this.processDimensionResult(
					dimension,
					result,
					byDimension,
					byProvider,
				);
				if (cost !== null) {
					totalCost += cost.totalCost;
					totalInputTokens += cost.inputTokens;
					totalOutputTokens += cost.outputTokens;
				}
			}
		}

		// Process global results
		for (const [dimension, result] of Object.entries(globalResults)) {
			const cost = this.processDimensionResult(
				dimension,
				result,
				byDimension,
				byProvider,
			);
			if (cost !== null) {
				totalCost += cost.totalCost;
				totalInputTokens += cost.inputTokens;
				totalOutputTokens += cost.outputTokens;
			}
		}

		return {
			totalCost,
			totalTokens: totalInputTokens + totalOutputTokens,
			byDimension,
			byProvider,
			currency: "USD",
		};
	}

	/**
	 * Calculate cost for a single model and token usage
	 */
	calculateModelCost(model: string, tokens: TokenUsage): number | null {
		const modelPricing = this.pricing.models[model];

		if (!modelPricing) {
			console.warn(
				`No pricing data for model "${model}". Skipping cost calculation for this dimension.`,
			);
			return null;
		}

		return (
			(tokens.inputTokens * modelPricing.inputPer1M +
				tokens.outputTokens * modelPricing.outputPer1M) /
			1_000_000
		);
	}

	/**
	 * Check if model has pricing information
	 */
	hasPricingForModel(model: string): boolean {
		return !!this.pricing.models[model];
	}

	/**
	 * Get pricing info for a specific model
	 */
	getModelPricing(model: string): PricingConfig["models"][string] | undefined {
		return this.pricing.models[model];
	}

	// ===== Private Helper Methods =====

	private processDimensionResult(
		dimension: string,
		result: DimensionResult,
		byDimension: Record<string, DimensionCost>,
		byProvider: Record<
			string,
			{ cost: number; tokens: TokenUsage; models: string[] }
		>,
	): { totalCost: number; inputTokens: number; outputTokens: number } | null {
		const metadata = result.metadata;

		// Skip if no token data
		if (!metadata?.tokens || !metadata?.model) {
			return null;
		}

		const { tokens, model, provider = "unknown" } = metadata;

		// Calculate cost
		const cost = this.calculateModelCost(model, tokens);
		if (cost === null) {
			return null;
		}

		// Update dimension costs
		this.updateDimensionCost(
			byDimension,
			dimension,
			cost,
			tokens,
			model,
			provider,
		);

		// Update provider costs
		this.updateProviderCost(byProvider, provider, cost, tokens, model);

		return {
			totalCost: cost,
			inputTokens: tokens.inputTokens,
			outputTokens: tokens.outputTokens,
		};
	}

	private updateDimensionCost(
		byDimension: Record<string, DimensionCost>,
		dimension: string,
		cost: number,
		tokens: TokenUsage,
		model: string,
		provider: string,
	): void {
		if (!byDimension[dimension]) {
			byDimension[dimension] = {
				cost: 0,
				tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				model,
				provider,
			};
		}

		byDimension[dimension].cost += cost;
		byDimension[dimension].tokens.inputTokens += tokens.inputTokens;
		byDimension[dimension].tokens.outputTokens += tokens.outputTokens;
		byDimension[dimension].tokens.totalTokens += tokens.totalTokens;
	}

	private updateProviderCost(
		byProvider: Record<
			string,
			{ cost: number; tokens: TokenUsage; models: string[] }
		>,
		provider: string,
		cost: number,
		tokens: TokenUsage,
		model: string,
	): void {
		if (!byProvider[provider]) {
			byProvider[provider] = {
				cost: 0,
				tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				models: [],
			};
		}

		byProvider[provider].cost += cost;
		byProvider[provider].tokens.inputTokens += tokens.inputTokens;
		byProvider[provider].tokens.outputTokens += tokens.outputTokens;
		byProvider[provider].tokens.totalTokens += tokens.totalTokens;

		if (!byProvider[provider].models.includes(model)) {
			byProvider[provider].models.push(model);
		}
	}
}
