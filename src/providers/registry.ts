import type { BaseProvider } from "./types";

export class ProviderRegistry {
	private readonly providers = new Map<string, BaseProvider>();

	register(provider: BaseProvider): void {
		if (this.providers.has(provider.name)) {
			throw new Error(`Provider "${provider.name}" is already registered`);
		}
		this.providers.set(provider.name, provider);
	}

	get(name: string): BaseProvider {
		const provider = this.providers.get(name);
		if (!provider) {
			throw new Error(
				`Provider "${name}" not found. Available: ${Array.from(this.providers.keys()).join(", ")}`,
			);
		}
		return provider;
	}

	has(name: string): boolean {
		return this.providers.has(name);
	}

	list(): string[] {
		return Array.from(this.providers.keys());
	}
}
