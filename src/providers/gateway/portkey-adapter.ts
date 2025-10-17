import type { ProviderRequest, ProviderResponse } from "../../types";

/**
 * Portkey uses OpenAI-compatible API format for all providers.
 * This adapter converts provider-specific requests to OpenAI format.
 */
export class PortkeyAdapter {
	/**
	 * Convert Anthropic request to OpenAI format
	 */
	static anthropicToOpenAI(request: ProviderRequest): any {
		const messages = Array.isArray(request.input)
			? request.input.map((text) => ({ role: "user" as const, content: text }))
			: [{ role: "user" as const, content: request.input }];

		return {
			model: request.options?.model || "claude-sonnet-4-5-20250929",
			messages,
			max_tokens: request.options?.maxTokens || 4096,
			temperature: request.options?.temperature,
			top_p: request.options?.topP,
		};
	}

	/**
	 * Convert OpenAI request to OpenAI format (passthrough, but normalize)
	 */
	static openaiToOpenAI(request: ProviderRequest): any {
		const messages = Array.isArray(request.input)
			? request.input.map((text) => ({ role: "user" as const, content: text }))
			: [{ role: "user" as const, content: request.input }];

		return {
			model: request.options?.model || "gpt-4o",
			messages,
			max_tokens: request.options?.maxTokens || 4096,
			temperature: request.options?.temperature,
			top_p: request.options?.topP,
		};
	}

	/**
	 * Convert Gemini request to OpenAI format
	 */
	static geminiToOpenAI(request: ProviderRequest): any {
		const messages = Array.isArray(request.input)
			? request.input.map((text) => ({ role: "user" as const, content: text }))
			: [{ role: "user" as const, content: request.input }];

		return {
			model: request.options?.model || "gemini-1.5-pro",
			messages,
			max_tokens: request.options?.maxTokens || 4096,
			temperature: request.options?.temperature,
			top_p: request.options?.topP,
		};
	}

	/**
	 * Parse OpenAI format response (from Portkey)
	 */
	static parseOpenAIResponse(response: any): ProviderResponse {
		try {
			// OpenAI format response
			const choice = response.choices?.[0];
			const content = choice?.message?.content;

			if (!content) {
				return {
					error: "No content in response",
				};
			}

			return {
				data: content,
				metadata: {
					model: response.model,
					tokens: {
						inputTokens: response.usage?.prompt_tokens || 0,
						outputTokens: response.usage?.completion_tokens || 0,
						totalTokens: response.usage?.total_tokens || 0,
					},
					provider: "portkey",
				},
			};
		} catch (error) {
			return {
				error: `Failed to parse Portkey response: ${(error as Error).message}`,
			};
		}
	}
}
