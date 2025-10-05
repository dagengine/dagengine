export interface WhoisXMLProviderConfig {
    apiKey: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
}

export interface WhoisData {
    domain: string | null;
    estimatedDomainAge: number | null;
    dates: {
        created: string | null;
        updated: string | null;
        expires: string | null;
    };
    registrant: {
        organization: string | null;
        country: string | null;
        countryCode: string | null;
    };
    registrar: {
        name: string | null;
    };
    _metadata: {
        lookupDate: string;
        success: boolean;
        error?: string;
    };
    _raw?: any; // Full raw response if needed
}

export class WhoisXMLProvider {
    private apiKey: string;
    private baseUrl = 'https://www.whoisxmlapi.com/whoisserver/WhoisService';
    private cache = new Map<string, { data: WhoisData; timestamp: number }>();
    private cacheTTL: number;

    constructor({ apiKey, cacheTTL }: { apiKey: string, cacheTTL: number }) {
        if (!apiKey) throw new Error('WhoisXML API key required');
        this.apiKey = apiKey;
        this.cacheTTL = cacheTTL ?? 86400000; // 24h
    }

    async lookup(domain: string): Promise<WhoisData> {
        const normalized = this.normalizeDomain(domain);

        // Check cache
        const cached = this.cache.get(normalized);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        try {
            const params = new URLSearchParams({
                apiKey: this.apiKey,
                domainName: normalized,
                outputFormat: 'JSON',
                da: '2'
            });

            const response = await globalThis.fetch(`${this.baseUrl}?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const json = await response.json();
            // @ts-ignore
            const record = json.WhoisRecord;

            if (!record) {
                return this.errorResponse(normalized, 'No WhoisRecord in response');
            }

            const data: WhoisData = {
                domain: record.domainName || null,
                estimatedDomainAge: record.estimatedDomainAge || null,
                dates: {
                    created: record.createdDate || null,
                    updated: record.updatedDate || null,
                    expires: record.expiresDate || null
                },
                registrant: {
                    organization: record.registrant?.organization || null,
                    country: record.registrant?.country || null,
                    countryCode: record.registrant?.countryCode || null
                },
                registrar: {
                    name: record.registrarName || null
                },
                _metadata: {
                    lookupDate: new Date().toISOString(),
                    success: true
                },
                _raw: record // Store full response if needed later
            };

            this.cache.set(normalized, { data, timestamp: Date.now() });
            return data;

        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`WhoisXML error for ${normalized}:`, msg);
            return this.errorResponse(normalized, msg);
        }
    }

    async process(domains: string[]): Promise<WhoisData[]> {
        const results: WhoisData[] = [];

        for (let i = 0; i < domains.length; i++) {
            // @ts-ignore
            results.push(await this.lookup(domains[i]));
            if (i < domains.length - 1) {
                await new Promise(r => setTimeout(r, 100)); // Rate limit
            }
        }

        // @ts-ignore
        return { response: results };
    }

    private normalizeDomain(input: string): string {
        // @ts-ignore
        return input
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0]
            .split('?')[0]
            .split(':')[0];
    }

    private errorResponse(domain: string, error: string): WhoisData {
        return {
            domain,
            estimatedDomainAge: null,
            dates: { created: null, updated: null, expires: null },
            registrant: { organization: null, country: null, countryCode: null },
            registrar: { name: null },
            _metadata: { lookupDate: new Date().toISOString(), success: false, error }
        };
    }

    clearCache(): void {
        this.cache.clear();
    }
}

export default WhoisXMLProvider;