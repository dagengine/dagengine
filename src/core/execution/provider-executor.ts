/**
 * Provider executor with retry and fallback logic
 *
 * Handles provider execution with comprehensive retry/fallback strategies,
 * hook integration, and detailed attempt tracking.
 *
 * @module execution/provider-executor
 */

import type { ProviderAdapter } from "../../providers/adapter.ts";
import type { Plugin } from "../../plugin.ts";
import type { HookExecutor } from "../lifecycle/hook-executor.ts";
import pRetry from "p-retry";
import type {
	SectionData,
	DimensionResult,
	DimensionDependencies,
	ProviderRequest,
	DimensionContext,
	SectionDimensionContext,
	ProviderContext,
	RetryContext,
	FallbackContext,
	FailureContext,
} from "../../types.ts";
import type { ProviderAttempt, AttemptRecord } from "../shared/types.ts";
import { ProviderNotFoundError, AllProvidersFailed } from "../shared/errors.ts";

/**
 * Handles provider execution with retry and fallback logic
 *
 * Manages:
 * - Primary provider execution
 * - Retry logic with exponential backoff
 * - Fallback to alternative providers
 * - Hook integration for custom behavior
 * - Detailed attempt tracking
 */
export class ProviderExecutor {
	constructor(
		private readonly adapter: ProviderAdapter,
		private readonly plugin: Plugin,
		private readonly hookExecutor: HookExecutor,
		private readonly maxRetries: number,
		private readonly retryDelay: number,
	) {}

	/**
	 * Execute a dimension using the appropriate provider with retry/fallback logic
	 *
	 * @param dimension - Dimension name
	 * @param sections - Sections to process
	 * @param dependencies - Resolved dependencies
	 * @param isGlobal - Whether this is a global dimension
	 * @param dimensionContext - Dimension execution context
	 * @returns Dimension result
	 * @throws {AllProvidersFailed} If all providers fail
	 */
	async execute(
		dimension: string,
		sections: SectionData[],
		dependencies: DimensionDependencies,
		isGlobal: boolean,
		dimensionContext: DimensionContext | SectionDimensionContext,
	): Promise<DimensionResult> {
		// Create prompt
		const prompt = await this.createPrompt(
			dimension,
			sections,
			dependencies,
			isGlobal,
		);

		// Get provider configuration (use first section, should always exist at this point)
		const providerConfig = await this.selectProvider(dimension, sections[0]!);

		// Build list of providers to try (primary + fallbacks)
		const providersToTry = this.buildProviderChain(providerConfig);

		// Execute with retry and fallback
		return await this.executeWithFallbacks(
			dimension,
			prompt,
			providersToTry,
			sections,
			isGlobal,
			dimensionContext,
		);
	}

	// ===== PRIVATE METHODS =====

	private async createPrompt(
		dimension: string,
		sections: SectionData[],
		dependencies: DimensionDependencies,
		isGlobal: boolean,
	): Promise<string> {
		try {
			return await Promise.resolve(
				this.plugin.createPrompt({
					sections,
					dimension,
					dependencies,
					isGlobal,
				}),
			);
		} catch (error) {
			// Re-throw to allow proper error handling upstream
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	private async selectProvider(dimension: string, section: SectionData) {
		return await Promise.resolve(
			this.plugin.selectProvider(dimension, section),
		);
	}

	private buildProviderChain(providerConfig: any): ProviderAttempt[] {
		return [
			{
				provider: providerConfig.provider,
				options: providerConfig.options,
			},
			...(providerConfig.fallbacks || []),
		];
	}

	private async executeWithFallbacks(
		dimension: string,
		prompt: string,
		providersToTry: ProviderAttempt[],
		sections: SectionData[],
		isGlobal: boolean,
		dimensionContext: DimensionContext | SectionDimensionContext,
	): Promise<DimensionResult> {
		// Check if using gateway
		const primaryProvider = providersToTry[0]!;
		const provider = this.adapter.getProvider(primaryProvider.provider);

		if (provider.isUsingGateway?.()) {
			// Gateway mode: Single attempt, Portkey handles retries/fallbacks
			return await this.executeSingleAttemptViaGateway(
				dimension,
				prompt,
				primaryProvider,
				sections,
				isGlobal,
				dimensionContext,
			);
		}

		// Direct mode: Use full retry/fallback logic
		return await this.executeWithRetryAndFallback(
			dimension,
			prompt,
			providersToTry,
			sections,
			isGlobal,
			dimensionContext,
		);
	}

	/**
	 * Execute via gateway with single attempt (gateway handles retries/fallbacks)
	 */
	private async executeSingleAttemptViaGateway(
		dimension: string,
		prompt: string,
		provider: ProviderAttempt,
		sections: SectionData[],
		isGlobal: boolean,
		dimensionContext: DimensionContext | SectionDimensionContext,
	): Promise<DimensionResult> {
		let currentRequest = this.createProviderRequest(
			prompt,
			dimension,
			isGlobal,
			sections.length,
			provider.options,
		);

		// Build provider context
		const providerContext: ProviderContext = {
			...dimensionContext,
			request: currentRequest,
			provider: provider.provider,
			providerOptions: provider.options,
		};

		// Execute beforeProviderExecute hook
		currentRequest = await this.hookExecutor.executeBeforeProvider(
			dimensionContext,
			currentRequest,
			provider.provider,
			provider.options,
		);
		providerContext.request = currentRequest;

		try {
			// Single attempt - Portkey handles retries internally
			const result = await this.adapter.execute(
				provider.provider,
				currentRequest,
			);

			if (result.error) {
				throw new Error(result.error);
			}

			// Execute afterProviderExecute hook
			const finalResponse = await this.hookExecutor.executeAfterProvider({
				...providerContext,
				result,
				duration: 0,
				...(result.metadata?.tokens && { tokensUsed: result.metadata.tokens }),
			});

			return {
				data: finalResponse.data,
				...(finalResponse.metadata && { metadata: finalResponse.metadata }),
			};
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));

			// Try dimension failure hook
			const fallbackResult = await this.handleDimensionFailure(
				providerContext,
				err,
				[], // No previous attempts when using gateway
				[provider.provider],
			);

			if (fallbackResult) {
				return fallbackResult;
			}

			// No recovery possible
			throw new AllProvidersFailed(dimension, [provider.provider], err);
		}
	}

	/**
	 * Execute with full retry/fallback logic (direct mode only)
	 */
	private async executeWithRetryAndFallback(
		dimension: string,
		prompt: string,
		providersToTry: ProviderAttempt[],
		sections: SectionData[],
		isGlobal: boolean,
		dimensionContext: DimensionContext | SectionDimensionContext,
	): Promise<DimensionResult> {
		let lastError: Error | null = null;
		const previousAttempts: AttemptRecord[] = [];
		let currentRequest: ProviderRequest = this.createProviderRequest(
			prompt,
			dimension,
			isGlobal,
			sections.length,
			{},
		);
		let lastProviderContext: ProviderContext | undefined;

		// Try each provider in the chain
		for (
			let providerIdx = 0;
			providerIdx < providersToTry.length;
			providerIdx++
		) {
			const currentProvider = providersToTry[providerIdx]!;

			// Validate provider exists
			if (!this.adapter.hasProvider(currentProvider.provider)) {
				lastError = new ProviderNotFoundError(
					currentProvider.provider,
					this.adapter.listProviders(),
				);
				continue;
			}

			// Wait before fallback if specified
			if (providerIdx > 0 && currentProvider.retryAfter) {
				await this.delay(currentProvider.retryAfter);
			}

			// Update request for this provider
			currentRequest = this.createProviderRequest(
				prompt,
				dimension,
				isGlobal,
				sections.length,
				currentProvider.options,
			);

			// Build provider context
			const providerContext: ProviderContext = {
				...dimensionContext,
				request: currentRequest,
				provider: currentProvider.provider,
				providerOptions: currentProvider.options,
			};
			lastProviderContext = providerContext;

			// Execute beforeProviderExecute hook
			currentRequest = await this.hookExecutor.executeBeforeProvider(
				dimensionContext,
				currentRequest,
				currentProvider.provider,
				currentProvider.options,
			);
			providerContext.request = currentRequest;

			// Try executing with retries
			try {
				const result = await this.executeWithRetries(
					currentProvider,
					currentRequest,
					providerContext,
					previousAttempts,
					dimension,
				);

				// Execute afterProviderExecute hook
				const finalResponse = await this.hookExecutor.executeAfterProvider({
					...providerContext,
					result,
					duration: 0,
					...(result.metadata?.tokens && {
						tokensUsed: result.metadata.tokens,
					}),
				});

				return {
					data: finalResponse.data,
					...(finalResponse.metadata && { metadata: finalResponse.metadata }),
				};
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Try fallback if available
				if (providerIdx < providersToTry.length - 1) {
					const nextProvider = providersToTry[providerIdx + 1]!;

					// Execute handleProviderFallback hook
					const shouldContinue = await this.handleFallback(
						providerContext,
						lastError,
						previousAttempts,
						currentProvider.provider,
						nextProvider,
						dimension,
					);

					if (!shouldContinue) {
						break;
					}

					console.warn(
						`Provider "${currentProvider.provider}" failed for dimension "${dimension}". ` +
							`Trying fallback provider "${nextProvider.provider}"...`,
					);
				}
			}
		}

		// All providers failed - try dimension failure hook
		const fallbackResult = await this.handleDimensionFailure(
			lastProviderContext || {
				...dimensionContext,
				request: currentRequest,
				provider: "unknown",
				providerOptions: {},
			},
			lastError!,
			previousAttempts,
			providersToTry.map((p) => p.provider),
		);

		if (fallbackResult) {
			return fallbackResult;
		}

		// No recovery possible
		throw new AllProvidersFailed(
			dimension,
			providersToTry.map((p) => p.provider),
			lastError || new Error("Unknown error"),
		);
	}

	private async executeWithRetries(
		provider: ProviderAttempt,
		request: ProviderRequest,
		providerContext: ProviderContext,
		previousAttempts: AttemptRecord[],
		dimension: string,
	) {
		// Track the current request, which may be modified by retry hook
		let currentRequest = request;

		return await pRetry(
			async (attemptNumber) => {
				try {
					const result = await this.adapter.execute(
						provider.provider,
						currentRequest,
					);

					if (result.error) {
						throw new Error(result.error);
					}

					return result;
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));

					// Record attempt
					previousAttempts.push({
						attempt: attemptNumber,
						error: err,
						provider: provider.provider,
						timestamp: Date.now(),
					});

					// Handle retry hook
					if (attemptNumber < this.maxRetries) {
						const retryResponse = await this.handleRetry(
							providerContext,
							err,
							attemptNumber,
							previousAttempts,
							provider,
						);

						// Update currentRequest if hook provided a modification
						if (retryResponse.modifiedRequest) {
							currentRequest = retryResponse.modifiedRequest;
							providerContext.request = currentRequest; // Update context too
						}

						if (!retryResponse.shouldContinue) {
							throw err;
						}
					}

					throw err;
				}
			},
			{
				retries: this.maxRetries,
				factor: 2,
				minTimeout: this.retryDelay,
				maxTimeout: this.retryDelay * 2 ** this.maxRetries,
				onFailedAttempt: (error) => {
					console.warn(
						`Attempt ${error.attemptNumber} failed for dimension "${dimension}" ` +
							`with provider "${provider.provider}". ${error.retriesLeft} retries left.`,
					);
				},
			},
		);
	}

	private async handleRetry(
		providerContext: ProviderContext,
		error: Error,
		attemptNumber: number,
		previousAttempts: AttemptRecord[],
		currentProvider: ProviderAttempt,
	): Promise<{ shouldContinue: boolean; modifiedRequest?: ProviderRequest }> {
		const retryContext: RetryContext = {
			...providerContext,
			error,
			attempt: attemptNumber,
			maxAttempts: this.maxRetries,
			previousAttempts: [...previousAttempts],
		};

		const retryResponse = await this.hookExecutor.handleRetry(retryContext);

		if (retryResponse.shouldRetry === false) {
			return { shouldContinue: false };
		}

		if (retryResponse.delayMs) {
			await this.delay(retryResponse.delayMs);
		}

		if (retryResponse.modifiedProvider) {
			currentProvider.provider = retryResponse.modifiedProvider;
		}

		// Build return object, only including modifiedRequest if it exists
		const result: {
			shouldContinue: boolean;
			modifiedRequest?: ProviderRequest;
		} = {
			shouldContinue: true,
		};

		if (retryResponse.modifiedRequest) {
			result.modifiedRequest = retryResponse.modifiedRequest;
		}

		return result;
	}

	private async handleFallback(
		providerContext: ProviderContext,
		error: Error,
		previousAttempts: AttemptRecord[],
		failedProvider: string,
		nextProvider: ProviderAttempt,
		dimension: string,
	): Promise<boolean> {
		const fallbackContext: FallbackContext = {
			...providerContext,
			error,
			attempt: previousAttempts.length,
			maxAttempts: this.maxRetries,
			previousAttempts: [...previousAttempts],
			failedProvider,
			fallbackProvider: nextProvider.provider,
			fallbackOptions: nextProvider.options,
		};

		const fallbackResponse =
			await this.hookExecutor.handleFallback(fallbackContext);

		if (fallbackResponse.shouldFallback === false) {
			return false;
		}

		if (fallbackResponse.delayMs) {
			await this.delay(fallbackResponse.delayMs);
		}

		if (fallbackResponse.modifiedRequest) {
			providerContext.request = fallbackResponse.modifiedRequest;
			nextProvider.options = {
				...nextProvider.options,
				...fallbackResponse.modifiedRequest.options,
			};
		}

		return true;
	}

	private async handleDimensionFailure(
		providerContext: ProviderContext,
		error: Error,
		previousAttempts: AttemptRecord[],
		providers: string[],
	): Promise<DimensionResult | undefined> {
		const failureContext: FailureContext = {
			...providerContext,
			error,
			attempt: previousAttempts.length,
			maxAttempts: this.maxRetries,
			previousAttempts,
			totalAttempts: previousAttempts.length,
			providers,
		};

		return await this.hookExecutor.handleDimensionFailure(failureContext);
	}

	private createProviderRequest(
		prompt: string,
		dimension: string,
		isGlobal: boolean,
		totalSections: number,
		options: Record<string, unknown>,
	): ProviderRequest {
		return {
			input: prompt,
			options,
			dimension,
			isGlobal,
			metadata: {
				totalSections,
			},
		};
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
