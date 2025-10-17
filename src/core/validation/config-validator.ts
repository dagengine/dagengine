/**
 * Engine configuration validator
 *
 * Validates DagEngine configuration during initialization to catch
 * errors early and provide clear error messages.
 *
 * @module validation/config-validator
 */

import type { Plugin } from "../../plugin.ts";
import type { ProviderAdapter } from "../../providers/adapter.ts";
import type { ProviderRegistry } from "../../providers/registry.ts";
import {
	ConfigurationError,
	NoProvidersError,
	ValidationError,
} from "../shared/errors.ts";
import { VALIDATION } from "../shared/constants.ts";

/**
 * Engine configuration interface (duplicated here to avoid circular deps)
 */
interface EngineConfig {
	plugin: Plugin;
	providers?: ProviderAdapter | any;
	registry?: ProviderRegistry;
	execution?: ExecutionConfig;
	concurrency?: number;
	maxRetries?: number;
	retryDelay?: number;
	continueOnError?: boolean;
	timeout?: number;
	dimensionTimeouts?: Record<string, number>;
	pricing?: any;
}

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
		ConfigValidator.validateRequired(config);
		ConfigValidator.validateProviders(config);
		ConfigValidator.validateNumericConstraints(config);
		ConfigValidator.validateTimeouts(config);
	}

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
	 */
	private static validateProviders(config: EngineConfig): void {
		// Provider validation happens during initialization
		// This is a placeholder for future provider-specific validation
	}

	/**
	 * Validates numeric constraints
	 */
	private static validateNumericConstraints(config: EngineConfig): void {
		// Get concurrency from multiple possible locations
		const concurrency = config.execution?.concurrency ?? config.concurrency;

		if (concurrency !== undefined) {
			ConfigValidator.validateConcurrency(concurrency);
		}

		// Get retries from multiple possible locations
		const maxRetries = config.execution?.maxRetries ?? config.maxRetries;

		if (maxRetries !== undefined) {
			ConfigValidator.validateRetries(maxRetries);
		}

		// Validate retry delay
		const retryDelay = config.execution?.retryDelay ?? config.retryDelay;

		if (retryDelay !== undefined) {
			ConfigValidator.validateRetryDelay(retryDelay);
		}
	}

	/**
	 * Validates concurrency setting
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
	 */
	private static validateRetryDelay(retryDelay: number): void {
		if (typeof retryDelay !== "number" || retryDelay < 0) {
			throw new ValidationError(
				"Retry delay must be a non-negative number",
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
			ConfigValidator.validateTimeout(timeout, "timeout");
		}

		// Validate dimension-specific timeouts
		const dimensionTimeouts =
			config.execution?.dimensionTimeouts ?? config.dimensionTimeouts;

		if (dimensionTimeouts) {
			Object.entries(dimensionTimeouts).forEach(([dimension, timeout]) => {
				ConfigValidator.validateTimeout(timeout, `dimensionTimeouts.${dimension}`);
			});
		}
	}

	/**
	 * Validates a single timeout value
	 */
	private static validateTimeout(timeout: number, field: string): void {
		if (typeof timeout !== "number" || timeout < VALIDATION.MIN_TIMEOUT) {
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
}
