/**
 * Transformation manager
 *
 * Manages transformation of sections after global dimension execution.
 * Handles both legacy transform functions and new hook-based transformations.
 *
 * @module execution/transformation-manager
 */

import type { Plugin } from "../../plugin.js";
import type {
	SectionData,
	DimensionResult,
	ProcessOptions,
} from "../../types.js";
import type { HookExecutor } from "../lifecycle/hook-executor.js";
import type { ProcessState } from "../shared/types.js";

/**
 * Manages transformation of sections after global dimension execution
 *
 * Handles both:
 * - Legacy transform functions defined on dimension configs
 * - New hook-based transformSections approach
 */
export class TransformationManager {
	constructor(private readonly plugin: Plugin) {}

	/**
	 * Applies transformation for a global dimension result
	 *
	 * Tries legacy transform first, then falls back to hook-based transform.
	 * If sections are transformed, the section results map is reset.
	 *
	 * @param dimension - Dimension name
	 * @param result - Dimension result
	 * @param state - Process state
	 * @param hookExecutor - Hook executor instance
	 * @param options - Process options
	 * @returns Transformed sections or original sections if no transformation
	 */
	async applyTransformation(
		dimension: string,
		result: DimensionResult | undefined,
		state: ProcessState,
		hookExecutor: HookExecutor,
		options: ProcessOptions,
	): Promise<SectionData[]> {
		if (!result) {
			return state.sections;
		}

		// Try legacy transform first
		const legacyTransformed = await this.applyLegacyTransform(
			dimension,
			result,
			state.sections,
			state.sectionResultsMap,
			options,
		);

		if (legacyTransformed) {
			return legacyTransformed;
		}

		// Try new transformSections hook
		const hookTransformed = await this.applyHookTransform(
			dimension,
			result,
			state,
			hookExecutor,
		);

		if (hookTransformed) {
			return hookTransformed;
		}

		return state.sections;
	}

	// ==================== PRIVATE METHODS ====================

	/**
	 * Applies legacy dimension transform function
	 *
	 * This supports the old-style transform function defined directly
	 * on the dimension configuration.
	 */
	private async applyLegacyTransform(
		dimension: string,
		result: DimensionResult,
		currentSections: SectionData[],
		sectionResultsMap: Map<number, Record<string, DimensionResult>>,
		options: ProcessOptions,
	): Promise<SectionData[] | null> {
		const config = this.plugin.getDimensionConfig(dimension);

		if (!config.transform || !result.data) {
			return null;
		}

		try {
			const transformed = await Promise.resolve(
				config.transform(result, currentSections),
			);

			if (Array.isArray(transformed) && transformed.length > 0) {
				return transformed;
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.error(`Error in transform for ${dimension}:`, err.message);
			options.onError?.(`transform-${dimension}`, err);
		}

		return null;
	}

	/**
	 * Applies new hook-based transformation
	 *
	 * This uses the transformSections hook which provides more context
	 * and flexibility for transforming sections.
	 */
	private async applyHookTransform(
		dimension: string,
		result: DimensionResult,
		state: ProcessState,
		hookExecutor: HookExecutor,
	): Promise<SectionData[] | null> {
		const transformed = await hookExecutor.transformSections({
			processId: state.id,
			timestamp: Date.now(),
			dimension,
			isGlobal: true,
			sections: state.sections,
			dependencies: {},
			globalResults: state.globalResults,
			request: { input: "", options: {} },
			provider: result.metadata?.provider ?? "unknown",
			providerOptions: {},
			result,
			duration: 0,
			tokensUsed: result.metadata?.tokens,
			currentSections: state.sections,
		});

		if (transformed) {
			return transformed;
		}

		return null;
	}
}
