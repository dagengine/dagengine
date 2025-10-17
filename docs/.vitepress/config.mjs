// docs/.vitepress/config.mjs
import { defineConfig } from "vitepress";

export default defineConfig({
	title: "dag-ai",
	description:
		"Production-ready AI workflow orchestration with intelligent dependency management",
	cleanUrls: true,

	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "dag-ai",

		// ==========================================
		// NAVIGATION (Simple)
		// ==========================================
		nav: [
			{ text: "Guide", link: "/guide/quick-start" },
			{ text: "API", link: "/api/engine" },
			{ text: "Recipes", link: "/recipes/" },
			{
				text: "v1.0.0",
				items: [
					{
						text: "Changelog",
						link: "https://github.com/ivan629/dag-ai/releases",
					},
					{ text: "GitHub", link: "https://github.com/ivan629/dag-ai" },
				],
			},
		],

		// ==========================================
		// SIDEBAR (Lean & Clean)
		// ==========================================
		sidebar: [
			{
				text: "Guide",
				collapsed: false,
				items: [
					{ text: "Quick Start", link: "/guide/quick-start" },
					{ text: "Core Concepts", link: "/guide/core-concepts" },
					{ text: "Skip Logic", link: "/guide/skip-logic" },
				],
			},
			{
				text: "Lifecycle",
				collapsed: false,
				items: [{ text: "Hooks", link: "/lifecycle/hooks" }],
			},
			{
				text: "API Reference",
				collapsed: false,
				items: [
					{ text: "DagEngine", link: "/api/engine" },
					{ text: "Plugin", link: "/api/plugin" },
					{ text: "Providers", link: "/api/providers" },
				],
			},
			{
				text: "Recipes",
				collapsed: false,
				items: [{ text: "Examples", link: "/recipes/" }],
			},
		],

		// ==========================================
		// SOCIAL LINKS
		// ==========================================
		socialLinks: [
			{ icon: "github", link: "https://github.com/ivan629/dag-ai" },
			{ icon: "npm", link: "https://www.npmjs.com/package/@ivan629/dag-ai" },
		],

		// ==========================================
		// SEARCH
		// ==========================================
		search: {
			provider: "local",
		},

		// ==========================================
		// FOOTER
		// ==========================================
		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2025-present Ivan Holovach",
		},

		// ==========================================
		// EDIT LINK
		// ==========================================
		editLink: {
			pattern: "https://github.com/ivan629/dag-ai/edit/main/docs/:path",
			text: "Edit this page on GitHub",
		},

		// ==========================================
		// TABLE OF CONTENTS
		// ==========================================
		outline: {
			level: [2, 3],
			label: "On this page",
		},
	},

	// ==========================================
	// MARKDOWN CONFIGURATION
	// ==========================================
	markdown: {
		theme: {
			light: "github-light",
			dark: "github-dark",
		},
		lineNumbers: true,
	},

	// ==========================================
	// HEAD TAGS
	// ==========================================
	head: [
		["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
		["meta", { name: "theme-color", content: "#0D9373" }],
		["meta", { property: "og:type", content: "website" }],
		[
			"meta",
			{ property: "og:title", content: "dag-ai | AI Workflow Orchestration" },
		],
		[
			"meta",
			{
				property: "og:description",
				content:
					"Production-ready AI pipelines with intelligent dependency management and 70% cost savings",
			},
		],
	],

	// ==========================================
	// SITEMAP
	// ==========================================
	sitemap: {
		hostname: "https://dag-ai.dev",
	},

	lastUpdated: true,
	appearance: "dark",
});
