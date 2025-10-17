// src/orchestration/serve.ts

/**
 * Get Inngest serve handler (auto-detects engine)
 *
 * @example Next.js
 * ```ts
 * export const { GET, POST, PUT } = serveInngest();
 * ```
 */
export function serveInngest() {
	const handler = (global as any).__dagengine_inngest_serve;

	if (!handler) {
		throw new Error(
			"No DagEngine with Inngest found. Create an engine first:\n\n" +
				"   const engine = new DagEngine({\n" +
				"     inngest: { enabled: true }\n" +
				"   });",
		);
	}

	return handler;
}
