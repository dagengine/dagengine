import { config } from "dotenv";
import { resolve } from "path";
import {
	DagEngine,
	Plugin,
	type PromptContext,
	type ProviderSelection,
} from "../../src/index.js";

config({ path: resolve(process.cwd(), ".env") });

class HelloPlugin extends Plugin {
	constructor() {
		super("hello", "Hello World", "Simple greeting");
		this.dimensions = ["greeting"];
	}

	createPrompt(ctx: PromptContext): string {
		return `Say hello to: ${ctx.sections[0]?.content}

Return JSON:
{ "message": "your greeting here" }`;
	}

	selectProvider(): ProviderSelection {
		return {
			provider: "anthropic",
			options: { model: "claude-3-5-haiku-20241022" },
		};
	}
}

async function main() {
	const engine = new DagEngine({
		plugin: new HelloPlugin(),
		providers: {
			anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
		},
	});

	const result = await engine.process([
		{ content: "World", metadata: {} },
	]);

	console.log("Result:", result.sections[0]?.results?.greeting?.data);
}

main().catch(console.error);