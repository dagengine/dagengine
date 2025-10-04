import { BaseAIProvider, AIProviderConfig, ProcessOptions, AIResponse } from './base-provider';

interface CompleteTavilyResult {
    // Core fields
    title: string;
    url: string;
    content: string;
    score: number;

    // Extended fields (optional)
    raw_content?: string;
    published_date?: string;
    author?: string;
    language?: string;
    favicon?: string;
    images?: string[];
    videos?: string[];
    snippet?: string;
    highlighted?: string[];
    page_rank?: number;
    domain_rank?: number;
    trust_score?: number;
    meta_description?: string;
    keywords?: string[];
    h1?: string;
    h2?: string[];
    canonical_url?: string;
    word_count?: number;
    reading_time?: number;
    sentiment?: string;
    topics?: string[];
    entities?: string[];
    categories?: string[];
    shares?: number;
    likes?: number;
    comments?: number;
    retweets?: number;
    domain_age?: number;
    has_contact?: boolean;
    has_privacy_policy?: boolean;
    indexed_at?: string;
    last_modified?: string;
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

    async process(prompt: string, options: ProcessOptions = {}): Promise<AIResponse> {
        const queries = this.parseQueries(prompt);
        return await this.executeBatchSearch(queries, options);
    }

    private parseQueries(prompt: string): string[] {
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

            return parsed;
        } catch (parseError) {
            const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
            throw new Error(`Tavily requires valid JSON array of queries: ${errorMessage}`);
        }
    }

    private isStringArray(value: unknown[]): value is string[] {
        return value.every((item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        );
    }

    private async executeBatchSearch(queries: string[], options: ProcessOptions): Promise<AIResponse> {
        const config = this.buildSearchConfig(options);
        const startTime = Date.now();

        const concurrency = config.concurrency || 5;
        const allResults: CompleteTavilyResult[] = [];
        const errors: Array<{query: string, error: string}> = [];

        for (let i = 0; i < queries.length; i += concurrency) {
            const batch = queries.slice(i, i + concurrency);

            const batchPromises = batch.map(async (query, batchIndex) => {
                const queryIndex = i + batchIndex;
                const maxRetries = 3;

                for (let attempt = 0; attempt < maxRetries; attempt++) {
                    try {
                        const searchData = await this.executeSearch(query.trim(), config);
                        return {
                            success: true,
                            results: this.normalizeResults(searchData.results || [], query, queryIndex),
                            query
                        };
                    } catch (error) {
                        if (error instanceof Error && error.message.includes('429')) {
                            await this.delay(1000 * (attempt + 1));
                            continue;
                        }

                        return {
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error',
                            query
                        };
                    }
                }

                return {
                    success: false,
                    error: 'Max retries exceeded',
                    query
                };
            });

            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach(result => {
                if (result.success) {
                    allResults.push(...(result as any).results);
                } else {
                    errors.push({
                        query: result.query,
                        error: (result as any).error
                    });
                }
            });

            if (i + concurrency < queries.length) {
                await this.delay(config.delay);
            }
        }

        const response = {
            results: allResults,  // ✅ Fixed
            meta: {
                total: allResults.length,  // ✅ Fixed
                queries: queries.length,
                errors: errors.length,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            },
            ...(errors.length > 0 && { errors })
        };

        return { response };
    }
    private buildSearchConfig(options: ProcessOptions) {
        return {
            maxResults: (options.numResults as number) || 5,
            searchDepth: (options.model as string) || "advanced",
            delay: (options.searchDelay as number) || 400,
            includeDomains: (options.includeDomains as string[]) || [],
            excludeDomains: (options.excludeDomains as string[]) || [],
            includeRawContent: (options.includeRawContent as boolean) || false,
            includeImages: (options.includeImages as boolean) || false,
            includeAnswer: (options.includeAnswer as boolean) !== false, // Default true
            includeDomainInfo: (options.includeDomainInfo as boolean) !== false, // Default true
            concurrency: (options.concurrency as number) || 5, // Add this
        };
    }

    private async executeSearch(query: string, config: any): Promise<any> {
        const body = {
            query,
            max_results: config.maxResults,
            search_depth: config.searchDepth,
            include_raw_content: config.includeRawContent,
            include_images: config.includeImages,
            include_answer: config.includeAnswer,
            include_domains_info: config.includeDomainInfo,
            ...(config.includeDomains.length && { include_domains: config.includeDomains }),
            ...(config.excludeDomains.length && { exclude_domains: config.excludeDomains })
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

    private normalizeResults(results: any[], query: string, queryIndex: number): CompleteTavilyResult[] {
        return results.map((r: any, index: number) => {
            const url = r.url || '';
            const domain = this.extractDomain(url);

            return {
                id: `q${queryIndex}_${index}`, // Unique ID for easy reference
                title: r.title || '',
                url,
                content: r.content || '',
                score: r.score || 0,
                query,
                domain,

                // ALL OPTIONAL TAVILY FIELDS - Preserved when available
                ...(r.raw_content && { raw_content: r.raw_content }),
                ...(r.published_date && { published_date: r.published_date }),
                ...(r.author && { author: r.author }),
                ...(r.language && { language: r.language }),
                ...(r.favicon && { favicon: r.favicon }),
                ...(r.images?.length && { images: r.images }),
                ...(r.videos?.length && { videos: r.videos }),
                ...(r.snippet && { snippet: r.snippet }),
                ...(r.highlighted?.length && { highlighted: r.highlighted }),
                ...(r.page_rank !== undefined && { page_rank: r.page_rank }),
                ...(r.domain_rank !== undefined && { domain_rank: r.domain_rank }),
                ...(r.trust_score !== undefined && { trust_score: r.trust_score }),
                ...(r.meta_description && { meta_description: r.meta_description }),
                ...(r.keywords?.length && { keywords: r.keywords }),
                ...(r.h1 && { h1: r.h1 }),
                ...(r.h2?.length && { h2: r.h2 }),
                ...(r.canonical_url && { canonical_url: r.canonical_url }),
                ...(r.word_count !== undefined && { word_count: r.word_count }),
                ...(r.reading_time !== undefined && { reading_time: r.reading_time }),
                ...(r.sentiment && { sentiment: r.sentiment }),
                ...(r.topics?.length && { topics: r.topics }),
                ...(r.entities?.length && { entities: r.entities }),
                ...(r.categories?.length && { categories: r.categories }),
                ...(r.shares !== undefined && { shares: r.shares }),
                ...(r.likes !== undefined && { likes: r.likes }),
                ...(r.comments !== undefined && { comments: r.comments }),
                ...(r.retweets !== undefined && { retweets: r.retweets }),
                ...(r.domain_age !== undefined && { domain_age: r.domain_age }),
                ...(r.has_contact !== undefined && { has_contact: r.has_contact }),
                ...(r.has_privacy_policy !== undefined && { has_privacy_policy: r.has_privacy_policy }),
                ...(r.indexed_at && { indexed_at: r.indexed_at }),
                ...(r.last_modified && { last_modified: r.last_modified }),

                // COMPUTED CONVENIENCE FIELDS
                hasContent: !!(r.content && r.content.trim()),
                contentLength: (r.content || '').length,
                isSecure: url.startsWith('https://'),

                // TIMESTAMP
                retrievedAt: new Date().toISOString()
            };
        });
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return '';
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }
}