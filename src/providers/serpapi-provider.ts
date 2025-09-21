import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

interface SearchResult {
    query: string;
    success: boolean;
    data?: any;
    error?: string;
    resultCount?: number;
    timestamp: string;
}

interface BatchSearchSummary {
    total: number;
    successful: number;
    failed: number;
    totalResults: number;
    executionTimeMs: number;
}

export interface SerpApiResponse extends AIResponse {
    raw: {
        batch_id: string;
        queries: string[];
        results: SearchResult[];
        summary: BatchSearchSummary;
    };
    engine: string;
    type: "batch_search";
}

export class SerpApiProvider extends BaseAIProvider {
    private readonly apiKey: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.name = "serpapi";
        this.apiKey = config.apiKey || "";
    }

    async process(
        prompt: string,
        options: ProcessOptions = {},
    ): Promise<SerpApiResponse> {
        let queries: string[];

        try {
            const parsed: unknown = JSON.parse(prompt);

            if (!Array.isArray(parsed)) {
                throw new Error("SerpApi requires an array of search queries");
            }

            if (parsed.length === 0) {
                throw new Error("SerpApi requires at least one search query");
            }

            if (!this.isStringArray(parsed)) {
                throw new Error("All search queries must be non-empty strings");
            }

            queries = parsed;
        } catch (parseError) {
            const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
            throw new Error(`SerpApi requires valid JSON array of queries: ${errorMessage}`);
        }

        return await this.executeBatchSearch(queries, options);
    }

    private isStringArray(value: unknown[]): value is string[] {
        return value.every((item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        );
    }

    private async executeBatchSearch(
        queries: string[],
        options: ProcessOptions,
    ): Promise<SerpApiResponse> {
        const engine: string = options.model as string || "google";
        const num: number = (options.numResults as number) || 10;
        const delay: number = (options.searchDelay as number) || 500;

        const results: SearchResult[] = [];
        const startTime: number = Date.now();

        for (let i = 0; i < queries.length; i++) {
            const query: string = queries[i].trim();

            try {
                const searchData = await this.executeSearch(query, engine, num);

                results.push({
                    query,
                    success: true,
                    data: searchData,
                    resultCount: searchData.organic_results?.length || 0,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                results.push({
                    query,
                    success: false,
                    error: errorMessage,
                    timestamp: new Date().toISOString()
                });
            }

            if (i < queries.length - 1) {
                await this.delay(delay);
            }
        }

        const executionTime: number = Date.now() - startTime;
        const successful: SearchResult[] = results.filter(r => r.success);

        const summary: BatchSearchSummary = {
            total: queries.length,
            successful: successful.length,
            failed: results.length - successful.length,
            totalResults: successful.reduce((sum, r) => sum + (r.resultCount || 0), 0),
            executionTimeMs: executionTime
        };

        return {
            text: JSON.stringify(results, null, 2),
            raw: {
                batch_id: `serpapi_${Date.now()}`,
                queries,
                results,
                summary
            },
            engine,
            type: "batch_search"
        };
    }

    private async executeSearch(
        query: string,
        engine: string,
        num: number
    ): Promise<any> {
        const params = new URLSearchParams({
            engine,
            q: query,
            api_key: this.apiKey,
            num: String(num),
        });

        const response = await globalThis.fetch(
            `https://serpapi.com/search.json?${params.toString()}`,
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    private delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }
}