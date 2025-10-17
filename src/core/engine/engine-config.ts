/**
 * Engine configuration types and defaults
 *
 * Provides clean configuration interfaces for the DagEngine with
 * sensible defaults and comprehensive documentation.
 *
 * @module engine/engine-config
 */

import { Plugin } from '../../plugin.ts';
import { ProviderAdapter, ProviderAdapterConfig } from '../../providers/adapter.ts';
import { ProviderRegistry } from '../../providers/registry.ts';
import { PricingConfig } from '../../types.ts';

// ============================================================================
// EXECUTION CONFIGURATION
// ============================================================================

/**
 * Execution configuration for the DagEngine
 *
 * Controls concurrency, retries, timeouts, and error handling behavior.
 *
 * @example
 * ```typescript
 * const execution: ExecutionConfig = {
 *   concurrency: 10,
 *   maxRetries: 5,
 *   timeout: 30000,
 *   continueOnError: false
 * };
 * ```
 */
export interface ExecutionConfig {
    /**
     * Maximum number of dimensions to execute concurrently
     *
     * @default 5
     * @minimum 1
     * @maximum 100
     */
    concurrency?: number;

    /**
     * Maximum number of retry attempts for failed operations
     *
     * @default 3
     * @minimum 0
     * @maximum 10
     */
    maxRetries?: number;

    /**
     * Delay between retry attempts in milliseconds
     *
     * Actual delay uses exponential backoff: delay * 2^attempt
     *
     * @default 1000
     */
    retryDelay?: number;

    /**
     * Whether to continue execution when a dimension fails
     *
     * - `true`: Continue processing other dimensions
     * - `false`: Stop immediately on first failure
     *
     * @default true
     */
    continueOnError?: boolean;

    /**
     * Default timeout for dimension execution in milliseconds
     *
     * Applied to all dimensions unless overridden by dimensionTimeouts.
     *
     * @default 60000 (60 seconds)
     * @minimum 1000 (1 second)
     * @maximum 600000 (10 minutes)
     */
    timeout?: number;

    /**
     * Dimension-specific timeout overrides in milliseconds
     *
     * Allows setting custom timeouts for specific dimensions.
     *
     * @example
     * ```typescript
     * {
     *   dimensionTimeouts: {
     *     'slow-dimension': 120000,  // 2 minutes
     *     'fast-dimension': 5000      // 5 seconds
     *   }
     * }
     * ```
     */
    dimensionTimeouts?: Record<string, number>;
}

// ============================================================================
// MAIN ENGINE CONFIGURATION
// ============================================================================

// ADD THIS (Lines 179-200)

/**
 * Inngest orchestration configuration
 */
export interface InngestConfig {
    /**
     * Enable Inngest orchestration
     * @default false
     */
    enabled: boolean;

    /**
     * Inngest event key (from inngest.com dashboard)
     * If not provided, uses local dev server (http://localhost:8288)
     */
    eventKey?: string;

    /**
     * Inngest signing key (for webhook security in production)
     * Optional - only needed for production webhooks
     */
    signingKey?: string;

    /**
     * Custom Inngest base URL
     * @default Uses Inngest cloud or local dev server
     */
    baseUrl?: string;

    /**
     * Function name prefix
     * @default 'dagengine'
     */
    functionPrefix?: string;

    /**
     * Checkpoint every N dimensions (for fine-grained control)
     * @default 1 (checkpoint after each dimension)
     */
    checkpointFrequency?: number;
}

/**
 * Main configuration interface for the DagEngine
 *
 * @example Basic configuration
 * ```typescript
 * const config: EngineConfig = {
 *   plugin: myPlugin,
 *   providers: myAdapter
 * };
 * ```
 *
 * @example Advanced configuration
 * ```typescript
 * const config: EngineConfig = {
 *   plugin: myPlugin,
 *   providers: myAdapter,
 *   execution: {
 *     concurrency: 10,
 *     maxRetries: 5,
 *     timeout: 30000,
 *     dimensionTimeouts: {
 *       'slow-task': 120000
 *     }
 *   },
 *   pricing: {
 *     models: {
 *       'gpt-4': { inputPer1M: 30, outputPer1M: 60 }
 *     }
 *   }
 * };
 * ```
 */
export interface EngineConfig {
    /**
     * Plugin that defines dimensions and their behavior
     *
     * REQUIRED - The plugin is the core of the engine, defining:
     * - Available dimensions
     * - Dependencies between dimensions
     * - How to create prompts
     * - Provider selection logic
     */
    plugin: Plugin;

    /**
     * Provider adapter or configuration
     *
     * Provide either a ProviderAdapter instance or a configuration
     * object that will be used to create one.
     *
     * REQUIRED unless `registry` is provided.
     */
    providers?: ProviderAdapter | ProviderAdapterConfig;

    /**
     * Provider registry
     *
     * Alternative to `providers`. Provide a registry of available providers
     * that will be used to create a ProviderAdapter.
     *
     * REQUIRED unless `providers` is provided.
     */
    registry?: ProviderRegistry;

    /**
     * Execution configuration
     *
     * Controls concurrency, retries, timeouts, and error handling.
     * Recommended way to configure execution behavior.
     */
    execution?: ExecutionConfig;

    /**
     * Pricing configuration for cost tracking
     *
     * When provided, the engine will track token usage and calculate costs.
     *
     * @example
     * ```typescript
     * {
     *   pricing: {
     *     models: {
     *       'gpt-4': { inputPer1M: 30, outputPer1M: 60 },
     *       'gpt-3.5-turbo': { inputPer1M: 0.5, outputPer1M: 1.5 }
     *     }
     *   }
     * }
     * ```
     */
    pricing?: PricingConfig;

    // ===== Legacy Fields (Deprecated - use execution instead) =====

    /**
     * @deprecated Use execution.concurrency instead
     */
    concurrency?: number;

    /**
     * @deprecated Use execution.maxRetries instead
     */
    maxRetries?: number;

    /**
     * @deprecated Use execution.retryDelay instead
     */
    retryDelay?: number;

    /**
     * @deprecated Use execution.continueOnError instead
     */
    continueOnError?: boolean;

    /**
     * @deprecated Use execution.timeout instead
     */
    timeout?: number;

    /**
     * @deprecated Use execution.dimensionTimeouts instead
     */
    dimensionTimeouts?: Record<string, number>;

    inngest?: InngestConfig;  // ← ADD THIS
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default execution configuration
 *
 * These values are used when not explicitly provided in EngineConfig.
 *
 * @example
 * ```typescript
 * import { DEFAULT_EXECUTION_CONFIG } from '@dagengine/core';
 *
 * const myConfig = {
 *   ...DEFAULT_EXECUTION_CONFIG,
 *   concurrency: 10  // Override just what you need
 * };
 * ```
 */
export const DEFAULT_EXECUTION_CONFIG: Required<ExecutionConfig> = {
    concurrency: 5,
    maxRetries: 3,
    retryDelay: 1000,
    continueOnError: true,
    timeout: 60000,
    dimensionTimeouts: {},
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Merges execution configuration with defaults
 *
 * Handles both new `execution` field and legacy top-level fields,
 * with `execution` taking precedence.
 *
 * @param config - Engine configuration
 * @returns Merged execution configuration with all fields populated
 *
 * @internal
 */
export function mergeExecutionConfig(config: EngineConfig): Required<ExecutionConfig> {
    return {
        concurrency: config.execution?.concurrency ?? config.concurrency ?? DEFAULT_EXECUTION_CONFIG.concurrency,
        maxRetries: config.execution?.maxRetries ?? config.maxRetries ?? DEFAULT_EXECUTION_CONFIG.maxRetries,
        retryDelay: config.execution?.retryDelay ?? config.retryDelay ?? DEFAULT_EXECUTION_CONFIG.retryDelay,
        continueOnError: config.execution?.continueOnError ?? config.continueOnError ?? DEFAULT_EXECUTION_CONFIG.continueOnError,
        timeout: config.execution?.timeout ?? config.timeout ?? DEFAULT_EXECUTION_CONFIG.timeout,
        dimensionTimeouts: config.execution?.dimensionTimeouts ?? config.dimensionTimeouts ?? DEFAULT_EXECUTION_CONFIG.dimensionTimeouts,
    };
}

/**
 * Validates and normalizes engine configuration
 *
 * Ensures all required fields are present and converts legacy
 * configuration format to new format.
 *
 * @param config - Engine configuration
 * @returns Normalized configuration
 *
 * @internal
 */
/**
 * Helper to build execution config without undefined values
 */
function buildExecutionConfig(config: EngineConfig): ExecutionConfig {
    const result: ExecutionConfig = {};

    const concurrency = config.execution?.concurrency ?? config.concurrency;
    if (concurrency !== undefined) result.concurrency = concurrency;

    const maxRetries = config.execution?.maxRetries ?? config.maxRetries;
    if (maxRetries !== undefined) result.maxRetries = maxRetries;

    const retryDelay = config.execution?.retryDelay ?? config.retryDelay;
    if (retryDelay !== undefined) result.retryDelay = retryDelay;

    const continueOnError = config.execution?.continueOnError ?? config.continueOnError;
    if (continueOnError !== undefined) result.continueOnError = continueOnError;

    const timeout = config.execution?.timeout ?? config.timeout;
    if (timeout !== undefined) result.timeout = timeout;

    const dimensionTimeouts = config.execution?.dimensionTimeouts ?? config.dimensionTimeouts;
    if (dimensionTimeouts !== undefined) result.dimensionTimeouts = dimensionTimeouts;

    return result;
}

/**
 * Validates and normalizes engine configuration
 *
 * Ensures all required fields are present and converts legacy
 * configuration format to new format.
 *
 * @param config - Engine configuration
 * @returns Normalized configuration
 *
 * @internal
 */
export function normalizeEngineConfig(config: EngineConfig): EngineConfig {
    // If using legacy top-level fields, move them to execution
    if (
        config.concurrency !== undefined ||
        config.maxRetries !== undefined ||
        config.retryDelay !== undefined ||
        config.continueOnError !== undefined ||
        config.timeout !== undefined ||
        config.dimensionTimeouts !== undefined
    ) {
        return {
            ...config,
            execution: buildExecutionConfig(config),
        };
    }

    return config;
}