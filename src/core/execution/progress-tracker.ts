import type { ProgressUpdate, TokenUsage, PricingConfig } from "../../types";

interface DimState {
	completed: number;
	failed: number;
	skipped: number;
	cost: number;
	durations: number[];
}

interface ProgressTrackerOptions {
	onProgress?: (progress: ProgressUpdate) => void;
	updateEvery?: number;
	pricing?: PricingConfig; // ← Add pricing config instead of CostCalculator
	globalDimensions?: string[]; // ← ADD THIS
}

/**
 * Result structure for progress tracking
 */
interface ProgressResult {
	error?: string;
	metadata?: {
		cost?: number;
		tokens?: TokenUsage;
		model?: string;
		[key: string]: unknown;
	};
}

export class ProgressTracker {
	private readonly startTime: number;
	private totalSections: number;
	private readonly totalDimensions: number;
	private completedOps = 0;

	private currentDim = "";
	private currentSection = 0;

	private readonly dimensions = new Map<string, DimState>();
	private readonly callback?: (p: ProgressUpdate) => void;
	private readonly updateEvery: number;
	private readonly pricing?: PricingConfig; // ← Store pricing config
	private updateCounter = 0;
	private readonly globalDimensions: Set<string>; // ← ADD THIS

	constructor(
		sections: number,
		dimensionNames: string[],
		options: ProgressTrackerOptions = {},
	) {
		this.startTime = Date.now();
		this.totalSections = sections;
		this.totalDimensions = dimensionNames.length;
		this.callback = options.onProgress;
		this.updateEvery = options.updateEvery ?? 1;
		this.pricing = options.pricing; // ← Store it
		this.globalDimensions = new Set(options.globalDimensions || []); // ← ADD THIS

		for (const dim of dimensionNames) {
			this.dimensions.set(dim, {
				completed: 0,
				failed: 0,
				skipped: 0,
				cost: 0,
				durations: [],
			});
		}
	}

	/**
	 * Record a completed section
	 */
	record(
		dimension: string,
		section: number,
		success: boolean,
		skipped: boolean,
		durationMs: number,
		result: ProgressResult,
	): void {
		const dim = this.dimensions.get(dimension);
		if (!dim) return;

		this.currentDim = dimension;
		this.currentSection = section;

		if (skipped) {
			dim.skipped++;
			this.completedOps++;
		} else if (success) {
			dim.completed++;
			this.completedOps++;
		} else {
			dim.failed++;
			this.completedOps++;
			// The key: per-dimension "completed" doesn't include failures
			// But overall "completedOps" includes everything that finished
		}

		// Calculate cost from result
		const cost = this.calculateCost(result);
		dim.cost += cost;

		if (!skipped) {
			dim.durations.push(durationMs);
			if (dim.durations.length > 50) {
				dim.durations.shift();
			}
		}

		this.updateCounter++;
		if (this.updateCounter % this.updateEvery === 0 && this.callback) {
			this.callback(this.buildUpdate());
		}
	}

	/**
	 * Get current progress (for polling)
	 */
	getProgress(): ProgressUpdate {
		return this.buildUpdate();
	}

	private buildUpdate(): ProgressUpdate {
		const now = Date.now();
		const elapsed = (now - this.startTime) / 1000;
		let total = 0;
		for (const [name] of this.dimensions) {
			const isGlobal = this.globalDimensions.has(name);
			total += isGlobal ? 1 : this.totalSections;
		}

		const percent = total > 0 ? (this.completedOps / total) * 100 : 0;

		let totalCost = 0;
		for (const dim of this.dimensions.values()) {
			totalCost += dim.cost;
		}

		const avgCostPerOp =
			this.completedOps > 0 ? totalCost / this.completedOps : 0;
		const remaining = total - this.completedOps;
		const estimatedCost = totalCost + remaining * avgCostPerOp;

		const rate = elapsed > 0 ? this.completedOps / elapsed : 0;
		const etaSeconds = rate > 0 ? remaining / rate : 0;

		const dimensions: ProgressUpdate["dimensions"] = {};
		for (const [name, dim] of this.dimensions) {
			const dimProcessed = dim.completed + dim.skipped;

			const isGlobal = this.globalDimensions.has(name);
			const dimTotal = isGlobal ? 1 : this.totalSections; // ← FIXED

			const dimPercent = dimTotal > 0 ? (dimProcessed / dimTotal) * 100 : 0;

			const avgDuration = this.average(dim.durations);
			const dimRemaining = dimTotal - dimProcessed; // ← Use dimTotal, not this.totalSections
			const dimEtaSeconds =
				avgDuration > 0 ? (dimRemaining * avgDuration) / 1000 : 0;

			const avgCostPerSection = dimProcessed > 0 ? dim.cost / dimProcessed : 0;
			const dimEstimatedCost = dim.cost + dimRemaining * avgCostPerSection;

			dimensions[name] = {
				completed: dim.completed,
				total: dimTotal, // ✅ Use dimTotal instead of this.totalSections
				percent: Math.round(dimPercent * 10) / 10,
				cost: Math.round(dim.cost * 1000) / 1000,
				estimatedCost: Math.round(dimEstimatedCost * 1000) / 1000,
				failed: dim.failed,
				etaSeconds: Math.round(dimEtaSeconds),
			};
		}

		return {
			completed: this.completedOps,
			total,
			percent: Math.round(percent * 10) / 10,
			cost: Math.round(totalCost * 1000) / 1000,
			estimatedCost: Math.round(estimatedCost * 1000) / 1000,
			elapsedSeconds: Math.round(elapsed),
			etaSeconds: Math.round(etaSeconds),
			currentDimension: this.currentDim,
			currentSection: this.currentSection,
			dimensions,
		};
	}

	/**
	 * Calculate cost from result metadata
	 * Uses same logic as CostCalculator
	 */
	private calculateCost(result: ProgressResult): number {
		// If cost already provided, use it
		if (result.metadata?.cost !== undefined) {
			return result.metadata.cost;
		}

		// If we have tokens, model, and pricing config, calculate cost
		if (result.metadata?.tokens && result.metadata?.model && this.pricing) {
			const tokens = result.metadata.tokens;
			const model = result.metadata.model;

			const modelPricing = this.pricing.models[model];
			if (!modelPricing) {
				return 0;
			}

			// Calculate cost using pricing rates
			const inputCost =
				(tokens.inputTokens / 1_000_000) * modelPricing.inputPer1M;
			const outputCost =
				(tokens.outputTokens / 1_000_000) * modelPricing.outputPer1M;

			const totalCost = inputCost + outputCost;

			return totalCost;
		}

		return 0;
	}

	/**
	 * Update total sections after transformation
	 */
	// src/core/execution/progress-tracker.ts

	/**
	 * Update total sections after transformation
	 */
	updateTotalSections(newTotal: number): void {
		this.totalSections = newTotal;

		if (this.callback) {
			this.callback(this.buildUpdate());
		}
	}

	private average(numbers: number[]): number {
		if (numbers.length === 0) return 0;
		return numbers.reduce((a, b) => a + b, 0) / numbers.length;
	}
}
