import { BaseProvider, BaseProviderDimensionOptions, ProviderConfig, ProviderResponse } from './base-provider';

export const TAVILY_DEFAULTS = {
    MAX_RESULTS: 5,
    SEARCH_DEPTH: 'advanced',
    DELAY_MS: 400,
    BASE_URL: 'https://api.tavily.com/search',
    INCLUDE_ANSWER: true,
    INCLUDE_DOMAIN_INFO: true,
    INCLUDE_RAW_CONTENT: false,
    INCLUDE_IMAGES: false,
} as const;

export interface TavilyConfig extends ProviderConfig {
    baseUrl?: string;
}

export interface TavilyDimensionOptions  extends BaseProviderDimensionOptions {
    maxResults?: number;
    searchDepth?: string;
    delayBetweenQueries?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    includeRawContent?: boolean;
    includeImages?: boolean;
    includeAnswer?: boolean;
    includeDomainInfo?: boolean;
}

export type TavilySearchConfig = {
    maxResults: number;
    searchDepth: string;
    delayBetweenQueries: number;
    includeDomains: string[];
    excludeDomains: string[];
    includeRawContent: boolean;
    includeImages: boolean;
    includeAnswer: boolean;
    includeDomainInfo: boolean;
};

export interface TavilyResult {
    // Core fields
    id: string;
    title: string;
    url: string;
    content: string;
    score: number;
    query: string;
    domain: string;

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

    // Computed convenience fields
    hasContent: boolean;
    contentLength: number;
    isSecure: boolean;
    retrievedAt: string;
}

export interface TavilySearchResponse {
    results: TavilyResult[];
    meta: {
        total: number;
        queries: number;
        errors: number;
        duration: number;
        timestamp: string;
    };
    errors?: Array<{query: string, error: string}>;
}

export class TavilyProvider extends BaseProvider {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(config: TavilyConfig) {
        super(config);
        this.name = 'tavily';

        if (!config.apiKey) {
            throw new Error('Tavily API key is required');
        }

        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || TAVILY_DEFAULTS.BASE_URL;
    }

    async process(
        prompt: string,
        options: TavilyDimensionOptions
    ): Promise<ProviderResponse> {
        if (!prompt?.trim()) {
            throw new Error('Prompt cannot be empty');
        }

        const queries = this.parseSearchQueries(prompt);
        const searchResponse = await this.executeSearchBatch(queries, options);

        return {
            success: true,
            data: searchResponse,
            rawContent: JSON.stringify(searchResponse),
            provider: this.name
        };
    }

    private parseSearchQueries(prompt: string): string[] {
        try {
            const parsed: unknown = JSON.parse(prompt);

            if (!Array.isArray(parsed)) {
                throw new Error('Tavily requires an array of search queries');
            }

            if (parsed.length === 0) {
                throw new Error('Tavily requires at least one search query');
            }

            if (!this.isValidStringArray(parsed)) {
                throw new Error('All search queries must be non-empty strings');
            }

            return parsed;
        } catch (parseError) {
            const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
            throw new Error(`Tavily requires valid JSON array of queries: ${errorMessage}`);
        }
    }

    private isValidStringArray(value: unknown[]): value is string[] {
        return value.every((item): item is string =>
            typeof item === 'string' && item.trim().length > 0
        );
    }

    private async executeSearchBatch(queries: string[], options: TavilyDimensionOptions): Promise<TavilySearchResponse> {
        const searchConfig = this.buildSearchConfig(options);
        const results: TavilyResult[] = [];
        const errors: Array<{query: string, error: string}> = [];
        const startTime = Date.now();

        for (let i = 0; i < queries.length; i++) {
            const query = queries[i]?.trim() ?? '';

            try {
                const searchData = await this.executeSingleSearch(query, searchConfig);
                const normalizedResults = this.normalizeSearchResults(searchData.results || [], query, i);
                results.push(...normalizedResults);
            } catch (error) {
                errors.push({
                    query,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            // Rate limiting delay between requests
            if (i < queries.length - 1 && searchConfig.delayBetweenQueries > 0) {
                await this.delay(searchConfig.delayBetweenQueries);
            }
        }

        return {
            results,
            meta: {
                total: results.length,
                queries: queries.length,
                errors: errors.length,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            },
            ...(errors.length > 0 && { errors })
        };
    }

    private buildSearchConfig(options: TavilyDimensionOptions): Required<TavilySearchConfig> {
        return {
            maxResults: options.maxResults ?? TAVILY_DEFAULTS.MAX_RESULTS,
            searchDepth: options.searchDepth ?? TAVILY_DEFAULTS.SEARCH_DEPTH,
            delayBetweenQueries: options.delayBetweenQueries ?? TAVILY_DEFAULTS.DELAY_MS,
            includeDomains: options.includeDomains ?? [],
            excludeDomains: options.excludeDomains ?? [],
            includeRawContent: options.includeRawContent ?? TAVILY_DEFAULTS.INCLUDE_RAW_CONTENT,
            includeImages: options.includeImages ?? TAVILY_DEFAULTS.INCLUDE_IMAGES,
            includeAnswer: options.includeAnswer ?? TAVILY_DEFAULTS.INCLUDE_ANSWER,
            includeDomainInfo: options.includeDomainInfo ?? TAVILY_DEFAULTS.INCLUDE_DOMAIN_INFO
        };
    }

    private async executeSingleSearch(query: string, config: Required<TavilySearchConfig>): Promise<TavilyApiResponse> {
        const requestBody = {
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

        const response = await globalThis.fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tavily API request failed (${response.status}): ${errorText}`);
        }

        try {
            return await response.json() as TavilyApiResponse;
        } catch (error) {
            throw new Error('Failed to parse Tavily API response as JSON');
        }
    }

    private normalizeSearchResults(results: any[], query: string, queryIndex: number): TavilyResult[] {
        return results.map((result: any, index: number) => {
            const url = result.url || '';
            const domain = this.extractDomainFromUrl(url);

            return {
                id: `q${queryIndex}_${index}`,
                title: result.title || '',
                url,
                content: result.content || '',
                score: result.score || 0,
                query,
                domain,

                // Optional Tavily fields - preserved when available
                ...(result.raw_content && { raw_content: result.raw_content }),
                ...(result.published_date && { published_date: result.published_date }),
                ...(result.author && { author: result.author }),
                ...(result.language && { language: result.language }),
                ...(result.favicon && { favicon: result.favicon }),
                ...(result.images?.length && { images: result.images }),
                ...(result.videos?.length && { videos: result.videos }),
                ...(result.snippet && { snippet: result.snippet }),
                ...(result.highlighted?.length && { highlighted: result.highlighted }),
                ...(result.page_rank !== undefined && { page_rank: result.page_rank }),
                ...(result.domain_rank !== undefined && { domain_rank: result.domain_rank }),
                ...(result.trust_score !== undefined && { trust_score: result.trust_score }),
                ...(result.meta_description && { meta_description: result.meta_description }),
                ...(result.keywords?.length && { keywords: result.keywords }),
                ...(result.h1 && { h1: result.h1 }),
                ...(result.h2?.length && { h2: result.h2 }),
                ...(result.canonical_url && { canonical_url: result.canonical_url }),
                ...(result.word_count !== undefined && { word_count: result.word_count }),
                ...(result.reading_time !== undefined && { reading_time: result.reading_time }),
                ...(result.sentiment && { sentiment: result.sentiment }),
                ...(result.topics?.length && { topics: result.topics }),
                ...(result.entities?.length && { entities: result.entities }),
                ...(result.categories?.length && { categories: result.categories }),
                ...(result.shares !== undefined && { shares: result.shares }),
                ...(result.likes !== undefined && { likes: result.likes }),
                ...(result.comments !== undefined && { comments: result.comments }),
                ...(result.retweets !== undefined && { retweets: result.retweets }),
                ...(result.domain_age !== undefined && { domain_age: result.domain_age }),
                ...(result.has_contact !== undefined && { has_contact: result.has_contact }),
                ...(result.has_privacy_policy !== undefined && { has_privacy_policy: result.has_privacy_policy }),
                ...(result.indexed_at && { indexed_at: result.indexed_at }),
                ...(result.last_modified && { last_modified: result.last_modified }),

                // Computed convenience fields
                hasContent: !!(result.content && result.content.trim()),
                contentLength: (result.content || '').length,
                isSecure: url.startsWith('https://'),
                retrievedAt: new Date().toISOString()
            };
        });
    }

    private extractDomainFromUrl(url: string): string {
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

interface TavilyApiResponse {
    results: any[];
}