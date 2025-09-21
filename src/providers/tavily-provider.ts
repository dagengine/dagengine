import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

interface TavilyResult {
    title: string;
    url: string;
    content: string;
    score?: number;
}

interface SearchResult {
    query: string;
    success: boolean;
    data?: TavilyResult[];
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

export interface TavilyResponse extends AIResponse {
    raw: {
        batch_id: string;
        queries: string[];
        results: SearchResult[];
        summary: BatchSearchSummary;
    };
    engine: string;
    type: "batch_search";
}

export class TavilyProvider extends BaseAIProvider {
    private readonly apiKey: string;
    private readonly endpoint: string;

    constructor(config: AIProviderConfig) {
        super(config);
        this.name = "tavily";
        this.apiKey = config.apiKey || "";
        this.endpoint = (config.endpoint as string) || "https://api.tavily.com/search";
    }

    async process(prompt: string, options: ProcessOptions = {}): Promise<TavilyResponse> {
        let queries: string[];

        try {
            const parsed: unknown = JSON.parse(prompt);

            if (!Array.isArray(parsed)) {
                throw new Error("Tavily requires an array of search queries");
            }

            if (parsed.length === 0) {
                throw new Error("Tavily requires at least one search query");
            }

            if (!this.isStringArray(parsed)) {
                throw new Error("All search queries must be non-empty strings");
            }

            queries = parsed;
        } catch (parseError) {
            const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
            throw new Error(`Tavily requires valid JSON array of queries: ${errorMessage}`);
        }

        return await this.executeBatchSearch(queries, options);
    }

    private isStringArray(value: unknown[]): value is string[] {
        return value.every((item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        );
    }

    private async executeBatchSearch(queries: string[], options: ProcessOptions): Promise<TavilyResponse> {
        const maxResults: number = (options.numResults as number) || 5;
        const searchDepth: string = (options.model as string) || "advanced";
        const delay: number = (options.searchDelay as number) || 400;

        const results: SearchResult[] = [];
        const startTime: number = Date.now();

        for (let i = 0; i < queries.length; i++) {
            const query: string = queries[i].trim();

            try {
                const searchData = await this.executeSearch(query, maxResults, searchDepth);
                const normalizedResults = this.normalizeResults(searchData.results || []);

                results.push({
                    query,
                    success: true,
                    data: normalizedResults,
                    resultCount: normalizedResults.length,
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
                batch_id: `tavily_${Date.now()}`,
                queries,
                results,
                summary
            },
            engine: "tavily",
            type: "batch_search"
        };
    }

    private async executeSearch(query: string, maxResults: number, searchDepth: string): Promise<any> {
        const body = {
            query,
            max_results: maxResults,
            search_depth: searchDepth === "basic" ? "basic" : "advanced"
        };

        const response = await globalThis.fetch(this.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    private normalizeResults(results: any[]): TavilyResult[] {
        return results.map((r: any) => ({
            title: r.title || "",
            url: r.url || "",
            content: r.content || "",
            score: r.score
        }));
    }

    private delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }
}