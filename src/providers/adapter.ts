import type { BaseProvider, ProviderRequest, ProviderResponse } from "./types";
import { ProviderRegistry } from "./registry";
import { AnthropicProvider } from "./ai/anthropic";
import { OpenAIProvider } from "./ai/openai";
import { GeminiProvider } from "./ai/gemini";
import { TavilyProvider } from "./search/tavily";
import { WhoisXMLProvider } from "./data/whoisxml";

/**
 * Configuration for initializing providers
 */
export interface ProviderAdapterConfig {
	anthropic?: {
		apiKey: string;
		[key: string]: unknown;
	};
	openai?: {
		apiKey: string;
		[key: string]: unknown;
	};
	gemini?: {
		apiKey: string;
		[key: string]: unknown;
	};
	tavily?: {
		apiKey: string;
		endpoint?: string;
		[key: string]: unknown;
	};
	whoisxml?: {
		apiKey: string;
		cacheTTL?: number;
		[key: string]: unknown;
	};
}

/**
 * Provider Adapter - Central manager for all providers
 *
 * This class simplifies provider initialization and provides a unified
 * interface for executing requests across different provider types.
 *
 * @example
 * ```typescript
 * const adapter = new ProviderAdapter({
 *   anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
 *   openai: { apiKey: process.env.OPENAI_API_KEY },
 *   tavily: { apiKey: process.env.TAVILY_API_KEY }
 * });
 *
 * // Execute a request
 * const result = await adapter.execute('anthropic', {
 *   input: 'Analyze this text...',
 *   options: { model: 'claude-sonnet-4-5-20250929' }
 * });
 * ```
 */
export class ProviderAdapter {
	private readonly registry: ProviderRegistry;

	constructor(config: ProviderAdapterConfig = {}) {
		this.registry = new ProviderRegistry();
		this.initializeProviders(config);
	}

	/**
	 * Initialize providers based on configuration
	 */
	private initializeProviders(config: ProviderAdapterConfig): void {
		// Initialize AI Providers
		if (config.anthropic) {
			if (!config.anthropic.apiKey) {
				console.warn(
					"Anthropic provider config provided but API key is missing",
				);
			} else {
				try {
					this.registry.register(new AnthropicProvider(config.anthropic));
				} catch (error) {
					console.warn("Failed to initialize Anthropic provider:", error);
				}
			}
		}

		if (config.openai) {
			if (!config.openai.apiKey) {
				console.warn("OpenAI provider config provided but API key is missing");
			} else {
				try {
					this.registry.register(new OpenAIProvider(config.openai));
				} catch (error) {
					console.warn("Failed to initialize OpenAI provider:", error);
				}
			}
		}

		if (config.gemini) {
			if (!config.gemini.apiKey) {
				console.warn("Gemini provider config provided but API key is missing");
			} else {
				try {
					this.registry.register(new GeminiProvider(config.gemini));
				} catch (error) {
					console.warn("Failed to initialize Gemini provider:", error);
				}
			}
		}

		// Initialize Search Providers
		if (config.tavily) {
			if (!config.tavily.apiKey) {
				console.warn("Tavily provider config provided but API key is missing");
			} else {
				try {
					this.registry.register(new TavilyProvider(config.tavily));
				} catch (error) {
					console.warn("Failed to initialize Tavily provider:", error);
				}
			}
		}

		// Initialize Data Providers
		if (config.whoisxml) {
			if (!config.whoisxml.apiKey) {
				console.warn(
					"WhoisXML provider config provided but API key is missing",
				);
			} else {
				try {
					this.registry.register(new WhoisXMLProvider(config.whoisxml));
				} catch (error) {
					console.warn("Failed to initialize WhoisXML provider:", error);
				}
			}
		}
	}

	/**
	 * Execute a request using the specified provider
	 *
	 * @param providerName - Name of the provider to use
	 * @param request - Request to execute
	 * @returns Provider response
	 *
	 * @throws Error if provider not found or request fails
	 */
	async execute(
		providerName: string,
		request: ProviderRequest,
	): Promise<ProviderResponse> {
		const provider = this.registry.get(providerName);
		return provider.execute(request);
	}

	/**
	 * Get the underlying provider registry
	 * Useful for advanced use cases like adding custom providers
	 */
	getRegistry(): ProviderRegistry {
		return this.registry;
	}

	/**
	 * Check if a provider is available
	 */
	hasProvider(name: string): boolean {
		return this.registry.has(name);
	}

	/**
	 * List all available providers
	 */
	listProviders(): string[] {
		return this.registry.list();
	}

	/**
	 * Register a custom provider
	 *
	 * @example
	 * ```typescript
	 * class CustomProvider extends BaseProvider {
	 *   constructor(config) {
	 *     super('custom', 'ai', config);
	 *   }
	 *
	 *   async execute(request) {
	 *     // Implementation
	 *   }
	 * }
	 *
	 * adapter.registerProvider(new CustomProvider({ apiKey: 'xxx' }));
	 * ```
	 */
	registerProvider(provider: BaseProvider): void {
		this.registry.register(provider);
	}

	/**
	 * Get a provider instance directly
	 */
	getProvider(name: string): BaseProvider {
		return this.registry.get(name);
	}
}

/**
 * Create a provider adapter with simplified configuration
 *
 * @param config - Provider configuration
 * @returns Configured ProviderAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createProviderAdapter({
 *   anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
 *   openai: { apiKey: process.env.OPENAI_API_KEY }
 * });
 * ```
 */
export function createProviderAdapter(
	config: ProviderAdapterConfig,
): ProviderAdapter {
	return new ProviderAdapter(config);
}
