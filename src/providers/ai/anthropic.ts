import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../types.js";
import { parseJSON } from "../../utils.js";
import { PortkeyAdapter, OpenAIResponse } from "../gateway/portkey-adapter.js";

export class AnthropicProvider extends BaseProvider {
	private readonly apiKey: string;

	constructor(config: ProviderConfig) {
		super("anthropic", config);

		if (!config.apiKey) {
			throw new Error("Anthropic API key is required");
		}

		this.apiKey = config.apiKey;
	}

	protected getNativeBaseUrl(): string {
		return "https://api.anthropic.com";
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		try {
			// Route through Portkey or direct to Anthropic
			if (this.isUsingGateway()) {
				return await this.executeViaPortkey(request);
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
		const gatewayApiKey = this.getGatewayApiKey();

		if (!gatewayApiKey) {
			throw new Error("Portkey API key is required when using gateway");
		}

		// Convert to OpenAI format
		const openAIRequest = PortkeyAdapter.anthropicToOpenAI(request);

		// Portkey uses different headers
		const headers: Record<string, string> = {
			"x-portkey-api-key": gatewayApiKey,
			"x-portkey-provider": "anthropic",
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`,
		};

		// Add Portkey config if provided
		const gatewayConfig = this.getGatewayConfig();
		if (gatewayConfig) {
			headers["x-portkey-config"] = gatewayConfig;
		}

		const response = await fetch("https://api.portkey.ai/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify(openAIRequest),
		});

		if (!response.ok) {
			const error = await response.text();
			console.error("❌ Portkey Response Details:");
			console.error("Status:", response.status);
			console.error("Headers:", Object.fromEntries(response.headers.entries()));
			console.error("Body:", error);
			throw new Error(`Portkey API error (${response.status}): ${error}`);
		}

		const data = (await response.json()) as OpenAIResponse;

		// Parse OpenAI format response
		const parsedResponse = PortkeyAdapter.parseOpenAIResponse(data);

		// Parse JSON from content if needed
		if (parsedResponse.data && typeof parsedResponse.data === "string") {
			parsedResponse.data = parseJSON(parsedResponse.data);
		}

		return parsedResponse;
	}

	/**
	 * Execute directly to Anthropic (original behavior)
	 */
	private async executeDirect(
		request: ProviderRequest,
	): Promise<ProviderResponse> {
		const model =
			(request.options?.model as string) || "claude-sonnet-4-5-20250929";
		const max_tokens = (request.options?.max_tokens as number) || 4096;
		const temperature = request.options?.temperature as number | undefined;

		const response = await fetch(`${this.getNativeBaseUrl()}/v1/messages`, {
			method: "POST",
			headers: {
				"x-api-key": this.apiKey,
				"Content-Type": "application/json",
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: max_tokens,
				messages: [{ role: "user", content: request.input }],
				...(temperature !== undefined && { temperature }),
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			console.log('Anthropic API error', error)

			throw new Error(`Anthropic API error (${response.status}): ${error}`);
		}

		const data = (await response.json()) as {
			content: Array<{ text: string }>;
			usage?: {
				input_tokens: number;
				output_tokens: number;
			};
			model?: string;
		};

		const content = data.content[0]?.text || "";

		return {
			data: parseJSON(content),
			metadata: {
				model: data.model || model,
				provider: "anthropic",
				...(data.usage && {
					tokens: {
						inputTokens: data.usage.input_tokens,
						outputTokens: data.usage.output_tokens,
						totalTokens: data.usage.input_tokens + data.usage.output_tokens,
					},
				}),
			},
		};
	}
}
