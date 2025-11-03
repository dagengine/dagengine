export interface ProviderConfig {
	apiKey?: string;

	gateway?: "portkey";
	gatewayApiKey?: string;
	gatewayConfig?: string;

	[key: string]: unknown;
}

export interface ProviderRequest {
	input: string | string[];
	options?: Record<string, unknown>;
	dimension?: string;
	isGlobal?: boolean;
	metadata?: {
		sectionIndex?: number;
		totalSections?: number;
		[key: string]: unknown;
	};
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface ProviderMetadata {
	model?: string;
	tokens?: TokenUsage;
	provider?: string;
	[key: string]: unknown;
}

export interface ProviderResponse<T = unknown> {
	data?: T;
	error?: string;
	metadata?: ProviderMetadata;
}

export abstract class BaseProvider {
	protected readonly config: ProviderConfig;
	public readonly name: string;

	constructor(name: string, config: ProviderConfig) {
		this.name = name;
		this.config = config;
	}

	abstract execute(request: ProviderRequest): Promise<ProviderResponse>;

	// Gateway helper methods
	isUsingGateway(): boolean {
		return this.config.gateway === "portkey"; // CHANGED
	}

	protected getGatewayApiKey(): string | undefined {
		return this.config.gatewayApiKey;
	}

	protected getGatewayConfig(): string | undefined {
		return typeof this.config.gatewayConfig === "object"
			? JSON.stringify(this.config.gatewayConfig)
			: this.config.gatewayConfig;
	}

	protected getProviderApiKey(): string | undefined {
		return this.config.apiKey;
	}

	/**
	 * Get base URL - either gateway or native provider URL
	 */
	protected getBaseUrl(): string {
		if (this.isUsingGateway()) {
			return "https://api.portkey.ai"; // CHANGED
		}
		return this.getNativeBaseUrl();
	}

	/**
	 * Each provider implements their native URL
	 */
	protected abstract getNativeBaseUrl(): string;
}
