import { ProviderAdapter, ProviderAdapterConfig } from '../providers/adapter.ts';
import { ProviderRegistry } from '../providers/registry.ts';
import { SectionData, DimensionResult, DimensionDependencies } from '../types.ts';
import { EngineConfig } from './engine.ts';
import { ERROR_MESSAGES } from './constants.ts';

/**
 * Validates the engine configuration
 */
export function validateEngineConfig(config: EngineConfig): void {
    if (!config.plugin) {
        throw new Error(ERROR_MESSAGES.NO_PLUGIN);
    }

    if (config.concurrency !== undefined && config.concurrency < 1) {
        throw new Error(ERROR_MESSAGES.INVALID_CONCURRENCY);
    }

    if (!config.providers && !config.registry) {
        throw new Error(ERROR_MESSAGES.NO_PROVIDERS);
    }
}

/**
 * Initializes the provider adapter from config
 */
export function initializeProviderAdapter(config: EngineConfig): ProviderAdapter {
    const adapter = config.providers
        ? createAdapterFromProviders(config.providers)
        : createAdapterFromRegistry(config.registry!);

    validateProviderAdapter(adapter);
    return adapter;
}

/**
 * Creates adapter from providers config
 */
function createAdapterFromProviders(
    providers: ProviderAdapter | ProviderAdapterConfig
): ProviderAdapter {
    return providers instanceof ProviderAdapter
        ? providers
        : new ProviderAdapter(providers);
}

/**
 * Creates adapter from registry
 */
function createAdapterFromRegistry(registry: ProviderRegistry): ProviderAdapter {
    const adapter = new ProviderAdapter({});
    const registryProviders = registry.list();

    registryProviders.forEach(name => {
        const provider = registry.get(name);
        adapter.registerProvider(provider);
    });

    return adapter;
}

/**
 * Validates that adapter has at least one provider
 */
function validateProviderAdapter(adapter: ProviderAdapter): void {
    const availableProviders = adapter.listProviders();
    if (availableProviders.length === 0) {
        throw new Error(ERROR_MESSAGES.NO_PROVIDERS_CONFIGURED);
    }
}

/**
 * Checks if dependencies contain any failures
 */
export function hasFailedDependencies(deps: DimensionDependencies): boolean {
    return Object.values(deps).some(dep => dep.error !== undefined);
}

/**
 * Resets the section results map for new section count
 */
export function resetSectionResultsMap(
    map: Map<number, Record<string, DimensionResult>>,
    newLength: number
): void {
    map.clear();
    for (let i = 0; i < newLength; i++) {
        map.set(i, {});
    }
}

/**
 * Applies finalized results back to section results and global results
 */
export function applyFinalizedResults(
    sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>,
    finalizedResults: Record<string, DimensionResult>,
    globalResults: Record<string, DimensionResult>
): Array<{ section: SectionData; results: Record<string, DimensionResult> }> {
    const updated = sectionResults.map((sr, idx) => {
        const updatedResults: Record<string, DimensionResult> = {};

        Object.keys(sr.results).forEach(dim => {
            const finalizedKey = `${dim}_section_${idx}`;
            updatedResults[dim] = (finalizedResults[finalizedKey] ?? sr.results[dim]) as DimensionResult;
        });

        return { section: sr.section, results: updatedResults };
    });

    // Update global results
    Object.keys(globalResults).forEach(dim => {
        if (finalizedResults[dim]) {
            globalResults[dim] = finalizedResults[dim];
        }
    });

    return updated;
}

/**
 * Counts successful dimension executions
 */
export function countSuccessful(
    globalResults: Record<string, DimensionResult>,
    sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>
): number {
    const globalSuccess = Object.values(globalResults).filter(r => !r.error).length;

    const sectionDimensions = new Set<string>();
    sectionResults.forEach(sr => {
        Object.entries(sr.results).forEach(([dim, result]) => {
            if (!result.error) {
                sectionDimensions.add(dim);
            }
        });
    });

    return globalSuccess + sectionDimensions.size;
}

/**
 * Counts failed dimension executions
 */
export function countFailed(
    globalResults: Record<string, DimensionResult>,
    sectionResults: Array<{ section: SectionData; results: Record<string, DimensionResult> }>
): number {
    const globalFailures = Object.values(globalResults).filter(r => r.error).length;

    const failedSectionDimensions = new Set<string>();
    sectionResults.forEach(sr => {
        Object.entries(sr.results).forEach(([dim, result]) => {
            if (result.error) {
                failedSectionDimensions.add(dim);
            }
        });
    });

    return globalFailures + failedSectionDimensions.size;
}

/**
 * Creates a timeout promise for dimension execution
 */
export function createTimeoutPromise<T>(timeoutMs: number, dimension: string): Promise<T> {
    return new Promise<T>((_, reject) =>
        setTimeout(
            () => reject(new Error(ERROR_MESSAGES.TIMEOUT(dimension, timeoutMs))),
            timeoutMs
        )
    );
}

/**
 * Executes a function with timeout protection
 */
export async function executeWithTimeout<T>(
    fn: () => Promise<T>,
    dimension: string,
    timeoutMs: number
): Promise<T> {
    return Promise.race([fn(), createTimeoutPromise<T>(timeoutMs, dimension)]);
}