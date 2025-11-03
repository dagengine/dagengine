import { defineConfig } from "vitepress";

export default defineConfig({
	title: "DagEngine",
	description: "Type-safe DAG execution framework for AI workflows",

	head: [
		['link', { rel: 'icon', href: '/logo.svg' }],
		['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
		['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
		['link', { href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', rel: 'stylesheet' }],
	],

	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "DagEngine",

		// Add search configuration
		search: {
			provider: 'local',
			options: {
				placeholder: 'Search docs...',
				translations: {
					button: {
						buttonText: 'Search',
						buttonAriaLabel: 'Search docs'
					},
					modal: {
						displayDetails: 'Display detailed list',
						resetButtonTitle: 'Reset search',
						backButtonTitle: 'Close search',
						noResultsText: 'No results for',
						footer: {
							selectText: 'to select',
							selectKeyAriaLabel: 'enter',
							navigateText: 'to navigate',
							navigateUpKeyAriaLabel: 'up arrow',
							navigateDownKeyAriaLabel: 'down arrow',
							closeText: 'to close',
							closeKeyAriaLabel: 'escape'
						}
					}
				}
			}
		},

		nav: [
			{
				text: "v1.0.0",
				items: [
					{ text: "Changelog", link: "https://github.com/dagengine/dagengine/releases" },
					{ text: "GitHub", link: "https://github.com/dagengine/dagengine" },
					{ text: "npm", link: "https://www.npmjs.com/package/@dagengine/dagengine" },
				],
			},
		],

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
			{ icon: "github", link: "https://github.com/dagengine/dagengine" },
		],

		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2025'
		}
	},
});