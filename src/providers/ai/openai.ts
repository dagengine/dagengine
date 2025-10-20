import { parseJSON } from "../../utils";
import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../types";
import { PortkeyAdapter, OpenAIResponse } from "../gateway/portkey-adapter";

export class OpenAIProvider extends BaseProvider {
	private readonly apiKey: string;

	constructor(config: ProviderConfig) {
		super("openai", config);

		if (!config.apiKey) {
			throw new Error("OpenAI API key is required");
		}

		this.apiKey = config.apiKey;
	}

	protected getNativeBaseUrl(): string {
		return "https://api.openai.com";
	}

	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		try {
			// Route through Portkey or direct to OpenAI
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

		// Convert to OpenAI format (passthrough for OpenAI)
		const openAIRequest = PortkeyAdapter.openaiToOpenAI(request); // CHANGED

		// Portkey uses different headers
		const headers: Record<string, string> = {
			"x-portkey-api-key": gatewayApiKey, // CHANGED
			"x-portkey-provider": "openai",
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`,
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
	 * Execute directly to OpenAI (original behavior)
	 */
	private async executeDirect(
		request: ProviderRequest,
	): Promise<ProviderResponse> {
		const model = (request.options?.model as string) || "gpt-4o";
		const max_tokens = (request.options?.max_tokens as number) || 4096;
		const temperature = (request.options?.temperature as number) ?? 0.1;

		const response = await fetch(
			`${this.getNativeBaseUrl()}/v1/chat/completions`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					max_tokens: max_tokens,
					temperature,
					messages: [{ role: "user", content: request.input }],
				}),
			},
		);

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error (${response.status}): ${error}`);
		}

		const data = (await response.json()) as {
			choices: Array<{ message: { content: string } }>;
			usage?: {
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
			};
			model?: string;
		};

		const content = data.choices[0]?.message?.content || "";

		return {
			data: parseJSON(content),
			metadata: {
				model: data.model || model,
				provider: "openai",
				...(data.usage && {
					tokens: {
						inputTokens: data.usage.prompt_tokens,
						outputTokens: data.usage.completion_tokens,
						totalTokens: data.usage.total_tokens,
					},
				}),
			},
		};
	}
}
