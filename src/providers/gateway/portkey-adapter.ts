import type { ProviderRequest, ProviderResponse } from "../../types";

/**
 * OpenAI-compatible message format used by Portkey
 */
interface OpenAIMessage {
	role: "user" | "assistant" | "system";
	content: string;
}

/**
 * OpenAI-compatible request format
 */
interface OpenAIRequest {
	model: string;
	messages: OpenAIMessage[];
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
}

/**
 * OpenAI-compatible response format from Portkey
 */
export interface OpenAIResponse {
	choices?: Array<{
		message?: {
			content?: string;
		};
		finish_reason?: string;
		index?: number;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
	model?: string;
	id?: string;
	object?: string;
	created?: number;
}

/**
 * Portkey uses OpenAI-compatible API format for all providers.
 * This adapter converts provider-specific requests to OpenAI format.
 */
export class PortkeyAdapter {
	/**
	 * Convert Anthropic request to OpenAI format
	 */
	static anthropicToOpenAI(request: ProviderRequest): OpenAIRequest {
		const messages = Array.isArray(request.input)
			? request.input.map(
					(text): OpenAIMessage => ({
						role: "user" as const,
						content: text,
					}),
				)
			: [{ role: "user" as const, content: request.input }];

		return {
			model: this.getModelOption(
				request.options?.model,
				"claude-sonnet-4-5-20250929",
			),
			messages,
			max_tokens: this.getMaxTokens(request.options?.max_tokens, 4096),
			temperature: this.getTemperature(request.options?.temperature),
			top_p: this.getTopP(request.options?.topP),
		};
	}

	/**
	 * Convert OpenAI request to OpenAI format (passthrough, but normalize)
	 */
	static openaiToOpenAI(request: ProviderRequest): OpenAIRequest {
		const messages = Array.isArray(request.input)
			? request.input.map(
					(text): OpenAIMessage => ({
						role: "user" as const,
						content: text,
					}),
				)
			: [{ role: "user" as const, content: request.input }];

		return {
			model: this.getModelOption(request.options?.model, "gpt-4o"),
			messages,
			max_tokens: this.getMaxTokens(request.options?.max_tokens, 4096),
			temperature: this.getTemperature(request.options?.temperature),
			top_p: this.getTopP(request.options?.topP),
		};
	}

	/**
	 * Convert Gemini request to OpenAI format
	 */
	static geminiToOpenAI(request: ProviderRequest): OpenAIRequest {
		const messages = Array.isArray(request.input)
			? request.input.map(
					(text): OpenAIMessage => ({
						role: "user" as const,
						content: text,
					}),
				)
			: [{ role: "user" as const, content: request.input }];

		return {
			model: this.getModelOption(request.options?.model, "gemini-1.5-pro"),
			messages,
			max_tokens: this.getMaxTokens(request.options?.max_tokens, 4096),
			temperature: this.getTemperature(request.options?.temperature),
			top_p: this.getTopP(request.options?.topP),
		};
	}

	/**
	 * Parse OpenAI format response (from Portkey)
	 */
	static parseOpenAIResponse(response: OpenAIResponse): ProviderResponse {
		try {
			// Validate response structure
			if (!response || typeof response !== "object") {
				return {
					error: "Invalid response format: expected object",
				};
			}

			// Extract choice
			const choice = response.choices?.[0];
			if (!choice) {
				return {
					error: "No choices in response",
				};
			}

			// Extract content
			const content = choice.message?.content;
			if (!content || typeof content !== "string") {
				return {
					error: "No content in response",
				};
			}

			// Build metadata
			const metadata: ProviderResponse["metadata"] = {
				model: response.model,
				provider: "portkey",
			};

			// Add token usage if available
			if (response.usage) {
				metadata.tokens = {
					inputTokens: response.usage.prompt_tokens || 0,
					outputTokens: response.usage.completion_tokens || 0,
					totalTokens: response.usage.total_tokens || 0,
				};
			}

			return {
				data: content,
				metadata,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";

			return {
				error: `Failed to parse Portkey response: ${errorMessage}`,
			};
		}
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Safely extract and validate model option
	 */
	private static getModelOption(value: unknown, defaultModel: string): string {
		if (typeof value === "string" && value.trim().length > 0) {
			return value;
		}
		return defaultModel;
	}

	/**
	 * Safely extract and validate max_tokens option
	 */
	private static getMaxTokens(value: unknown, defaultValue: number): number {
		if (typeof value === "number" && value > 0 && Number.isFinite(value)) {
			return Math.floor(value);
		}
		return defaultValue;
	}

	/**
	 * Safely extract and validate temperature option
	 */
	private static getTemperature(value: unknown): number | undefined {
		if (
			typeof value === "number" &&
			value >= 0 &&
			value <= 2 &&
			Number.isFinite(value)
		) {
			return value;
		}
		return undefined;
	}

	/**
	 * Safely extract and validate top_p option
	 */
	private static getTopP(value: unknown): number | undefined {
		if (
			typeof value === "number" &&
			value >= 0 &&
			value <= 1 &&
			Number.isFinite(value)
		) {
			return value;
		}
		return undefined;
	}

	/**
	 * Validate that response is a valid OpenAI response
	 */
	private static isValidOpenAIResponse(
		value: unknown,
	): value is OpenAIResponse {
		if (!value || typeof value !== "object") {
			return false;
		}

		const response = value as Record<string, unknown>;

		// Must have choices array
		if (!Array.isArray(response.choices)) {
			return false;
		}

		// Must have at least one choice with message
		const firstChoice = response.choices[0] as
			| Record<string, unknown>
			| undefined;
		if (!firstChoice || typeof firstChoice !== "object") {
			return false;
		}

		return true;
	}
}
