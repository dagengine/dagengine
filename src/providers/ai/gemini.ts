import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../types";
import { parseJSON } from "../../utils";
import { PortkeyAdapter, OpenAIResponse } from "../gateway/portkey-adapter"; // CHANGED

/**
 * Gemini API Response Types
 */
interface GeminiResponse {
	candidates?: GeminiCandidate[];
	promptFeedback?: {
		blockReason?: string;
		safetyRatings?: SafetyRating[];
	};
	usageMetadata?: {
		promptTokenCount: number;
		candidatesTokenCount: number;
		totalTokenCount: number;
	};
}

interface GeminiCandidate {
	content?: {
		parts: Array<{
			text: string;
		}>;
		role: string;
	};
	finishReason?: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
	safetyRatings?: SafetyRating[];
	citationMetadata?: {
		citationSources: Array<{
			startIndex: number;
			endIndex: number;
			uri: string;
			license: string;
		}>;
	};
}

interface SafetyRating {
	category: string;
	probability: "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH";
	blocked?: boolean;
}

export class GeminiProvider extends BaseProvider {
	private readonly apiKey: string;
	private readonly baseUrl: string;

	constructor(config: ProviderConfig) {
		super("gemini", config);

		if (!config.apiKey) {
			throw new Error("Gemini API key is required");
		}

		this.apiKey = config.apiKey;
		this.baseUrl =
			(config.baseUrl as string) ||
			"https://generativelanguage.googleapis.com/v1beta";
	}

	protected getNativeBaseUrl(): string {
		return this.baseUrl;
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		try {
			// Route through Portkey or direct to Gemini
			if (this.isUsingGateway()) {
				return await this.executeViaPortkey(request); // CHANGED
			}

			return await this.executeDirect(request);
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Execute via Portkey gateway
	 */
	private async executeViaPortkey(
		request: ProviderRequest,
	): Promise<ProviderResponse> {
		// CHANGED
		const gatewayApiKey = this.getGatewayApiKey();

		if (!gatewayApiKey) {
			throw new Error("Portkey API key is required when using gateway");
		}

		// Convert to OpenAI format
		const openAIRequest = PortkeyAdapter.geminiToOpenAI(request); // CHANGED

		// Portkey uses different headers
		const headers: Record<string, string> = {
			"x-portkey-api-key": gatewayApiKey, // CHANGED
			"x-portkey-provider": "google", // NEW ('google' not 'gemini' in Portkey)
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`, // ADD THIS
		};

		// Add Portkey config if provided
		const gatewayConfig = this.getGatewayConfig();
		if (gatewayConfig) {
			headers["x-portkey-config"] = gatewayConfig;
		}

		const response = await fetch("https://api.portkey.ai/v1/chat/completions", {
			// CHANGED
			method: "POST",
			headers,
			body: JSON.stringify(openAIRequest),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Portkey API error (${response.status}): ${error}`);
		}

		const data = (await response.json()) as OpenAIResponse;

		// Parse OpenAI format response
		const parsedResponse = PortkeyAdapter.parseOpenAIResponse(data); // CHANGED

		// Parse JSON from content if needed
		if (parsedResponse.data && typeof parsedResponse.data === "string") {
			parsedResponse.data = parseJSON(parsedResponse.data);
		}

		return parsedResponse;
	}

	/**
	 * Execute directly to Gemini (original behavior)
	 */
	private async executeDirect(
		request: ProviderRequest,
	): Promise<ProviderResponse> {
		if (Array.isArray(request.input)) {
			throw new Error(
				"Gemini provider does not support batch inputs. Process queries one at a time.",
			);
		}

		const model = (request.options?.model as string) || "gemini-2.5-pro";
		const temperature = (request.options?.temperature as number) ?? 0.1;
		const max_tokens = (request.options?.max_tokens as number) || 4096;
		const topP = request.options?.topP as number | undefined;
		const topK = request.options?.topK as number | undefined;

		// Build generation config
		const generationConfig: Record<string, unknown> = {
			temperature,
			maxOutputTokens: max_tokens,
			responseMimeType: "application/json", // Force JSON response
		};

		if (topP !== undefined) generationConfig.topP = topP;
		if (topK !== undefined) generationConfig.topK = topK;

		// Build request body
		const requestBody = {
			contents: [
				{
					parts: [
						{
							text: request.input,
						},
					],
				},
			],
			generationConfig,
		};

		// Make API request
		const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Gemini API error (${response.status}): ${error}`);
		}

		const data = (await response.json()) as GeminiResponse;

		// Handle safety ratings (content blocked)
		if (!data.candidates || data.candidates.length === 0) {
			if (data.promptFeedback?.blockReason) {
				throw new Error(
					`Content blocked by Gemini: ${data.promptFeedback.blockReason}`,
				);
			}
			throw new Error("Gemini returned no candidates");
		}

		const candidate = data.candidates[0];

		// Check finish reason
		if (candidate?.finishReason && candidate.finishReason !== "STOP") {
			console.warn(`Gemini finish reason: ${candidate.finishReason}`);

			if (candidate.finishReason === "SAFETY") {
				throw new Error("Content blocked by Gemini safety filters");
			}

			if (candidate.finishReason === "MAX_TOKENS") {
				console.warn("Response truncated due to max tokens limit");
			}
		}

		// Extract text content
		const content = candidate?.content?.parts?.[0]?.text || "";

		if (!content) {
			throw new Error("Gemini returned empty content");
		}

		// Parse JSON response
		const parsedData = parseJSON(content);

		return {
			data: parsedData,
			metadata: {
				model,
				provider: "gemini",
				...(data.usageMetadata && {
					tokens: {
						inputTokens: data.usageMetadata.promptTokenCount,
						outputTokens: data.usageMetadata.candidatesTokenCount,
						totalTokens: data.usageMetadata.totalTokenCount,
					},
				}),
				finishReason: candidate?.finishReason,
				safetyRatings: candidate?.safetyRatings,
			},
		};
	}

	/**
	 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
	 */
	private estimateTokenCount(text: string): number {
		return Math.ceil(text.length / 4);
	}
}
