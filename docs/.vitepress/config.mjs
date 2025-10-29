// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress";

export default defineConfig({
	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "dag-ai",

		// ==========================================
		// NO TOP NAV - Just version dropdown
		// ==========================================
		nav: [
			{
				text: "v1.0.0",
				items: [
					{ text: "Changelog", link: "https://github.com/ivan629/dag-ai/releases" },
					{ text: "GitHub", link: "https://github.com/ivan629/dag-ai" },
					{ text: "npm", link: "https://www.npmjs.com/package/@ivan629/dag-ai" },
				],
			},
		],

		// ==========================================
		// EVERYTHING IN SIDEBAR (Single sidebar)
		// ==========================================
		sidebar: [
			{
				text: "Getting Started",
				collapsed: false,
				items: [
					{ text: "Quick Start", link: "/guide/quick-start" },
					{ text: "Core Concepts", link: "/guide/core-concepts" },
				],
			},
			{
				text: "Fundamentals",
				collapsed: false,
				items: [
					{ text: "01 - Hello World", link: "/examples/fundamentals/01-hello-world" },
					{ text: "02 - Dependencies", link: "/examples/fundamentals/02-dependencies" },
					{ text: "03 - Section vs Global", link: "/examples/fundamentals/03-section-vs-global" },
					{ text: "04 - Transformations", link: "/examples/fundamentals/04-transformations" },
					{ text: "05 - Skip Logic", link: "/examples/fundamentals/05-skip-logic" },
					{ text: "06 - Providers", link: "/examples/fundamentals/06-providers" },
					{ text: "07 - Async Hooks", link: "/examples/fundamentals/07-async-hooks" },
					{ text: "08 - Error Handling", link: "/examples/fundamentals/08-error-handling" },
				],
			},
			{
				text: "Advanced",
				collapsed: false,
				items: [
					{ text: "Advanced Quickstart", link: "/examples/fundamentals/00-quickstart" },
					{ text: "Portkey Gateway", link: "/examples/advanced/01-portkey" },
				],
			},
			{
				text: "API Reference",
				collapsed: true,
				items: [
					{ text: "Hooks", link: "/api/hooks" },
					{ text: "Configuration", link: "/api/configuration" },
					{ text: "Types", link: "/api/types" },
				],
			},
		],

		socialLinks: [
			{ icon: "github", link: "https://github.com/ivan629/dag-ai" },
		],
	},
});