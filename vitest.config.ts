import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.d.ts",
				"src/index.ts",
				"src/**/*.test.ts",
				"src/**/*.spec.ts",
				"**/node_modules/**",
				"**/dist/**",
			],
			thresholds: {
				lines: 80,
				functions: 75,
				branches: 70,
				statements: 80,
			},
		},
		// Recommended additions:
		testTimeout: 10000,
		hookTimeout: 10000,
		pool: "forks", // Better for Node.js
		isolate: true, // Each test file runs isolated
	},
});
