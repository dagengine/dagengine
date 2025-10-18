import type { Plugin } from "../../plugin.js";
import type { DimensionResult, DimensionDependencies } from "../../types.js";
import { ERROR_MESSAGES } from "../constants.js";

/**
 * Handles resolution of dimension dependencies
 *
 * Responsible for:
 * - Resolving global dimension dependencies
 * - Resolving section-level dimension dependencies
 * - Aggregating section results for global dimensions
 * - Providing clear error messages for missing dependencies
 */
export class DependencyResolver {
	constructor(private readonly plugin: Plugin) {}

	/**
	 * Resolves dependencies for a global dimension
	 *
	 * Global dimensions can depend on:
	 * - Other global dimensions (direct reference)
	 * - Section dimensions (aggregated results)
	 */
	async resolveGlobalDependencies(
		dimension: string,
		globalResults: Record<string, DimensionResult>,
		sectionResultsMap: Map<number, Record<string, DimensionResult>>,
		totalSections: number,
		dependencyGraph: Record<string, string[]>,
	): Promise<DimensionDependencies> {
		const dependencies: DimensionDependencies = {};
		const allDimensions = this.plugin.getDimensionNames();
		const dimensionDeps = dependencyGraph[dimension] ?? [];

		for (const depName of dimensionDeps) {
			// Check if dependency exists in plugin
			if (!allDimensions.includes(depName)) {
				dependencies[depName] = {
					error: ERROR_MESSAGES.DEPENDENCY_NOT_FOUND(depName),
				};
				continue;
			}

			// Resolve based on dependency type
			dependencies[depName] = this.plugin.isGlobalDimension(depName)
				? this.resolveGlobalDependency(depName, globalResults)
				: this.resolveSectionDependencyForGlobal(
						depName,
						sectionResultsMap,
						totalSections,
					);
		}

		return dependencies;
	}

	/**
	 * Resolves dependencies for a section-level dimension
	 *
	 * Section dimensions can depend on:
	 * - Global dimensions (direct reference)
	 * - Other section dimensions from the same section
	 */
	async resolveSectionDependencies(
		dimension: string,
		sectionResults: Record<string, DimensionResult>,
		globalResults: Record<string, DimensionResult>,
		dependencyGraph: Record<string, string[]>,
	): Promise<DimensionDependencies> {
		const dependencies: DimensionDependencies = {};
		const allDimensions = this.plugin.getDimensionNames();
		const dimensionDeps = dependencyGraph[dimension] ?? [];

		for (const depName of dimensionDeps) {
			// Check if dependency exists in plugin
			if (!allDimensions.includes(depName)) {
				dependencies[depName] = {
					error: ERROR_MESSAGES.DEPENDENCY_NOT_FOUND(depName),
				};
				continue;
			}

			// Resolve based on dependency type
			dependencies[depName] = this.plugin.isGlobalDimension(depName)
				? this.resolveGlobalDependency(depName, globalResults)
				: this.resolveSectionDependency(depName, sectionResults);
		}

		return dependencies;
	}

	// ==================== PRIVATE METHODS ====================

	/**
	 * Resolves a global dependency by looking it up in global results
	 */
	private resolveGlobalDependency(
		depName: string,
		globalResults: Record<string, DimensionResult>,
	): DimensionResult {
		return (
			globalResults[depName] ?? {
				error: ERROR_MESSAGES.GLOBAL_DEP_NOT_FOUND(depName),
			}
		);
	}

	/**
	 * Resolves a section dependency by looking it up in section results
	 */
	private resolveSectionDependency(
		depName: string,
		sectionResults: Record<string, DimensionResult>,
	): DimensionResult {
		return (
			sectionResults[depName] ?? {
				error: ERROR_MESSAGES.SECTION_DEP_NOT_FOUND(depName),
			}
		);
	}

	/**
	 * Resolves a section dependency for a global dimension
	 *
	 * This aggregates results from all sections into a single dependency
	 * that the global dimension can use.
	 */
	private resolveSectionDependencyForGlobal(
		depName: string,
		sectionResultsMap: Map<number, Record<string, DimensionResult>>,
		totalSections: number,
	): DimensionResult {
		const sectionDeps: DimensionResult[] = [];

		// Collect results from all sections
		for (let i = 0; i < totalSections; i++) {
			const sectionResults = sectionResultsMap.get(i);
			if (sectionResults?.[depName]) {
				sectionDeps.push(sectionResults[depName]);
			}
		}

		// Return aggregated results or error if none found
		return sectionDeps.length > 0
			? {
					data: {
						sections: sectionDeps,
						aggregated: true,
						totalSections,
					},
				}
			: {
					error: ERROR_MESSAGES.SECTION_DEP_NOT_PROCESSED(depName),
				};
	}
}
