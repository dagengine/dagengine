/**
 * Engine configuration validator
 *
 * Validates DagEngine configuration during initialization to catch
 * errors early and provide clear error messages.
 *
 * @module validation/config-validator
 */

import type { Plugin } from "../../plugin.js";
import type {
	ProviderAdapter,
	ProviderAdapterConfig,
} from "../../providers/adapter.js";
import type { ProviderRegistry } from "../../providers/registry.js";
import type { PricingConfig } from "../../types.js";
import {
	ConfigurationError,
	NoProvidersError,
	ValidationError,
} from "../shared/errors.js";
import { VALIDATION } from "../shared/constants.js";

/**
 * Execution configuration interface
 */
interface ExecutionConfig {
	concurrency?: number;
	maxRetries?: number;
	retryDelay?: number;
	continueOnError?: boolean;
	timeout?: number;
	dimensionTimeouts?: Record<string, number>;
}

/**
 * Engine configuration interface
 */
interface EngineConfig {
	plugin: Plugin;
	providers?: ProviderAdapter | ProviderAdapterConfig | ProviderRegistry;
	registry?: ProviderRegistry;
	execution?: ExecutionConfig;
	concurrency?: number;
	maxRetries?: number;
	retryDelay?: number;
	continueOnError?: boolean;
	timeout?: number;
	dimensionTimeouts?: Record<string, number>;
	pricing?: PricingConfig;
}

/**
 * Configuration validator for DagEngine
 *
 * Performs comprehensive validation of engine configuration including:
 * - Required fields (plugin, providers)
 * - Numeric constraints (concurrency, retries, timeouts)
 * - Provider availability
 */
export class ConfigValidator {
	/**
	 * Validates engine configuration
	 *
	 * @param config - Engine configuration to validate
	 * @throws {ConfigurationError} If configuration is invalid
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   ConfigValidator.validate(config);
	 * } catch (error) {
	 *   if (error instanceof ConfigurationError) {
	 *     console.error('Invalid config:', error.message);
	 *   }
	 * }
	 * ```
	 */
	static validate(config: EngineConfig): void {
		this.validateRequired(config);
		this.validateProviders(config);
		this.validateNumericConstraints(config);
		this.validateTimeouts(config);
	}

	/**
	 * Validates that an adapter has at least one provider
	 *
	 * @param adapter - Provider adapter to validate
	 * @throws {NoProvidersError} If no providers are configured
	 */
	static validateProviderAdapter(adapter: ProviderAdapter): void {
		const availableProviders = adapter.listProviders();
		if (availableProviders.length === 0) {
			throw new NoProvidersError();
		}
	}

	// ============================================================================
	// PRIVATE VALIDATION METHODS
	// ============================================================================

	/**
	 * Validates required fields
	 */
	private static validateRequired(config: EngineConfig): void {
		if (!config.plugin) {
			throw new ConfigurationError("DagEngine requires a plugin", {
				field: "plugin",
			});
		}

		if (!config.providers && !config.registry) {
			throw new ConfigurationError(
				'DagEngine requires either "providers" or "registry"',
				{ field: "providers" },
			);
		}
	}

	/**
	 * Validates provider configuration
	 *
	 * Note: Provider validation happens during initialization.
	 * This is a placeholder for future provider-specific validation.
	 */
	private static validateProviders(_config: EngineConfig): void {
		// Future: Validate provider configuration structure
		// For now, provider validation happens during adapter initialization
	}

	/**
	 * Validates numeric constraints (concurrency, retries, delays)
	 */
	private static validateNumericConstraints(config: EngineConfig): void {
		// Validate concurrency
		const concurrency = config.execution?.concurrency ?? config.concurrency;
		if (concurrency !== undefined) {
			this.validateConcurrency(concurrency);
		}

		// Validate retries
		const maxRetries = config.execution?.maxRetries ?? config.maxRetries;
		if (maxRetries !== undefined) {
			this.validateRetries(maxRetries);
		}

		// Validate retry delay
		const retryDelay = config.execution?.retryDelay ?? config.retryDelay;
		if (retryDelay !== undefined) {
			this.validateRetryDelay(retryDelay);
		}
	}

	/**
	 * Validates concurrency setting
	 *
	 * @param concurrency - Concurrency value to validate
	 * @throws {ValidationError} If concurrency is invalid
	 */
	private static validateConcurrency(concurrency: number): void {
		if (!Number.isInteger(concurrency)) {
			throw new ValidationError(
				"Concurrency must be an integer",
				"concurrency",
				{ provided: concurrency },
			);
		}

		if (concurrency < VALIDATION.MIN_CONCURRENCY) {
			throw new ValidationError(
				`Concurrency must be at least ${VALIDATION.MIN_CONCURRENCY}`,
				"concurrency",
				{
					provided: concurrency,
					minimum: VALIDATION.MIN_CONCURRENCY,
				},
			);
		}

		if (concurrency > VALIDATION.MAX_CONCURRENCY) {
			throw new ValidationError(
				`Concurrency must not exceed ${VALIDATION.MAX_CONCURRENCY}`,
				"concurrency",
				{
					provided: concurrency,
					maximum: VALIDATION.MAX_CONCURRENCY,
				},
			);
		}
	}

	/**
	 * Validates retry attempts
	 *
	 * @param maxRetries - Max retry value to validate
	 * @throws {ValidationError} If retries setting is invalid
	 */
	private static validateRetries(maxRetries: number): void {
		if (!Number.isInteger(maxRetries)) {
			throw new ValidationError(
				"Max retries must be an integer",
				"maxRetries",
				{ provided: maxRetries },
			);
		}

		if (maxRetries < VALIDATION.MIN_RETRIES) {
			throw new ValidationError(
				`Max retries must be at least ${VALIDATION.MIN_RETRIES}`,
				"maxRetries",
				{
					provided: maxRetries,
					minimum: VALIDATION.MIN_RETRIES,
				},
			);
		}

		if (maxRetries > VALIDATION.MAX_RETRIES) {
			throw new ValidationError(
				`Max retries must not exceed ${VALIDATION.MAX_RETRIES}`,
				"maxRetries",
				{
					provided: maxRetries,
					maximum: VALIDATION.MAX_RETRIES,
				},
			);
		}
	}

	/**
	 * Validates retry delay
	 *
	 * @param retryDelay - Retry delay to validate
	 * @throws {ValidationError} If retry delay is invalid
	 */
	private static validateRetryDelay(retryDelay: number): void {
		if (typeof retryDelay !== "number" || retryDelay < 0) {
			throw new ValidationError(
				"Retry delay must be a non-negative number",
				"retryDelay",
				{ provided: retryDelay },
			);
		}

		if (!Number.isFinite(retryDelay)) {
			throw new ValidationError(
				"Retry delay must be a finite number",
				"retryDelay",
				{ provided: retryDelay },
			);
		}
	}

	/**
	 * Validates timeout settings
	 */
	private static validateTimeouts(config: EngineConfig): void {
		// Validate default timeout
		const timeout = config.execution?.timeout ?? config.timeout;
		if (timeout !== undefined) {
			this.validateTimeout(timeout, "timeout");
		}

		// Validate dimension-specific timeouts
		const dimensionTimeouts =
			config.execution?.dimensionTimeouts ?? config.dimensionTimeouts;

		if (dimensionTimeouts) {
			for (const [dimension, dimensionTimeout] of Object.entries(
				dimensionTimeouts,
			)) {
				this.validateTimeout(
					dimensionTimeout,
					`dimensionTimeouts.${dimension}`,
				);
			}
		}
	}

	/**
	 * Validates a single timeout value
	 *
	 * @param timeout - Timeout value in milliseconds
	 * @param field - Field name for error messages
	 * @throws {ValidationError} If timeout is invalid
	 */
	private static validateTimeout(timeout: number, field: string): void {
		if (typeof timeout !== "number") {
			throw new ValidationError("Timeout must be a number", field, {
				provided: timeout,
			});
		}

		if (!Number.isFinite(timeout)) {
			throw new ValidationError("Timeout must be a finite number", field, {
				provided: timeout,
			});
		}

		if (timeout < VALIDATION.MIN_TIMEOUT) {
			throw new ValidationError(
				`Timeout must be at least ${VALIDATION.MIN_TIMEOUT}ms`,
				field,
				{
					provided: timeout,
					minimum: VALIDATION.MIN_TIMEOUT,
				},
			);
		}

		if (timeout > VALIDATION.MAX_TIMEOUT) {
			throw new ValidationError(
				`Timeout must not exceed ${VALIDATION.MAX_TIMEOUT}ms`,
				field,
				{
					provided: timeout,
					maximum: VALIDATION.MAX_TIMEOUT,
				},
			);
		}
	}
}
