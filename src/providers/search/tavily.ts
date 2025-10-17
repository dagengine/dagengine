import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../types";

export interface TavilyResult {
	title: string;
	url: string;
	content: string;
	score: number;
	domain?: string;
	publishedDate?: string;
}

export class TavilyProvider extends BaseProvider {
	private readonly apiKey: string;
	private readonly endpoint: string;

	constructor(config: ProviderConfig) {
		super("tavily", config);

		if (!config.apiKey) {
			throw new Error("Tavily API key is required");
		}

		this.apiKey = config.apiKey;
		this.endpoint =
			(config.endpoint as string) || "https://api.tavily.com/search";
	}

	getNativeBaseUrl(): string {
		return "";
	}

	async execute(
		request: ProviderRequest,
	): Promise<ProviderResponse<TavilyResult[]>> {
		try {
			const queries = Array.isArray(request.input)
				? request.input
				: [request.input];
			const maxResults = (request.options?.maxResults as number) || 5;
			const searchDepth =
				(request.options?.searchDepth as string) || "advanced";

			const allResults: TavilyResult[] = [];

			for (const query of queries) {
				const response = await fetch(this.endpoint, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify({
						query,
						max_results: maxResults,
						search_depth: searchDepth,
					}),
				});

				if (!response.ok) {
					throw new Error(`Tavily API error (${response.status})`);
				}

				const data = (await response.json()) as {
					results: Array<{
						title: string;
						url: string;
						content: string;
						score: number;
					}>;
				};

				allResults.push(...(data.results || []));
			}

			return {
				data: allResults,
				metadata: {
					totalQueries: queries.length,
					totalResults: allResults.length,
				},
			};
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
