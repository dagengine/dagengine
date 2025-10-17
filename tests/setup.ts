import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../src/providers/types.ts";
import type { SectionData } from "../src/types.ts";

/**
 * Mock AI Provider for testing
 */
export class MockAIProvider extends BaseProvider {
	public callCount = 0;
	public lastRequest: ProviderRequest | null = null;
	public mockResponses: Map<string, unknown> = new Map();
	public shouldFail = false;
	public delay = 0;

	constructor(config: ProviderConfig = {}) {
		super("mock-ai", config);
	}

	/**
	 * Set a mock response for a specific input
	 */
	setMockResponse(input: string, response: unknown): void {
		this.mockResponses.set(input, response);
	}

	/**
	 * Execute the mock request
	 */
	async execute(request: ProviderRequest): Promise<ProviderResponse> {
		this.callCount++;
		this.lastRequest = request;

		if (this.delay > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, this.delay));
		}

		if (this.shouldFail) {
			return { error: "Mock provider error" };
		}

		const response = this.mockResponses.get(request.input as string) || {
			result: "mock response",
		};
		return { data: response };
	}

	/**
	 * Reset the mock provider state
	 */
	reset(): void {
		this.callCount = 0;
		this.lastRequest = null;
		this.shouldFail = false;
		this.delay = 0;
	}

	/**
	 * Get the native base URL (not used for mock provider)
	 */
	protected getNativeBaseUrl(): string {
		return "";
	}
}

/**
 * Create a mock section for testing
 */
export function createMockSection(
	content: string,
	metadata: Record<string, unknown> = {},
): SectionData {
	return { content, metadata };
}

/**
 * Sleep utility for testing
 */
export function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}