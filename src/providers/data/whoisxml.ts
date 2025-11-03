import {
	BaseProvider,
	type ProviderConfig,
	type ProviderRequest,
	type ProviderResponse,
} from "../types";

export interface WhoisData {
	domain: string;
	estimatedDomainAge: number | null;
	createdDate: string | null;
	expiresDate: string | null;
	registrar: string | null;
	success: boolean;
}

export class WhoisXMLProvider extends BaseProvider {
	private readonly apiKey: string;
	private readonly cache = new Map<
		string,
		{ data: WhoisData; timestamp: number }
	>();
	private readonly cacheTTL: number;

	constructor(config: ProviderConfig) {
		super("whoisxml", config);

		if (!config.apiKey) {
			throw new Error("WhoisXML API key is required");
		}

		this.apiKey = config.apiKey;
		this.cacheTTL = (config.cacheTTL as number) || 86400000; // 24 hours
	}

	getNativeBaseUrl(): string {
		return "";
	}

	async execute(
		request: ProviderRequest,
	): Promise<ProviderResponse<WhoisData[]>> {
		try {
			const domains = Array.isArray(request.input)
				? request.input
				: [request.input];
			const results: WhoisData[] = [];

			for (const domain of domains) {
				// Check cache
				const cached = this.cache.get(domain);
				if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
					results.push(cached.data);
					continue;
				}

				// Fetch from API
				const params = new URLSearchParams({
					apiKey: this.apiKey,
					domainName: domain,
					outputFormat: "JSON",
				});

				const response = await fetch(
					`https://www.whoisxmlapi.com/whoisserver/WhoisService?${params}`,
				);

				if (!response.ok) {
					throw new Error(`WhoisXML API error (${response.status})`);
				}

				const json = (await response.json()) as {
					WhoisRecord?: {
						domainName?: string;
						estimatedDomainAge?: number;
						createdDate?: string;
						expiresDate?: string;
						registrarName?: string;
					};
				};

				const record = json.WhoisRecord;
				const whoisData: WhoisData = {
					domain: record?.domainName || domain,
					estimatedDomainAge: record?.estimatedDomainAge || null,
					createdDate: record?.createdDate || null,
					expiresDate: record?.expiresDate || null,
					registrar: record?.registrarName || null,
					success: !!record,
				};

				this.cache.set(domain, { data: whoisData, timestamp: Date.now() });
				results.push(whoisData);
			}

			return { data: results };
		} catch (error) {
			return {
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	clearCache(): void {
		this.cache.clear();
	}
}
