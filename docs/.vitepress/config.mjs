import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'dag-ai',
    description: 'AI workflow orchestration with intelligent dependency management',

    // Clean URLs (no .html)
    cleanUrls: true,

    // Theme
    themeConfig: {
        // Logo
        logo: '/logo.svg', // Optional: add logo to docs/public/logo.svg

        // Navigation
        nav: [
            { text: 'Guide', link: '/guide/what-is-dag-ai' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'API', link: '/api/' },
            {
                text: 'v1.0.0',
                items: [
                    { text: 'Changelog', link: 'https://github.com/ivan629/dag-ai/releases' },
                    { text: 'Contributing', link: 'https://github.com/ivan629/dag-ai/blob/main/CONTRIBUTING.md' }
                ]
            }
        ],

        // Sidebar
        sidebar: [
            {
                text: 'Introduction',
                collapsed: false,
                items: [
                    { text: 'What is dag-ai?', link: '/guide/what-is-dag-ai' },
                    { text: 'Why dag-ai?', link: '/guide/why-dag-ai' },
                    { text: 'Quick Start', link: '/guide/quick-start' },
                    { text: 'Installation', link: '/guide/installation' }
                ]
            },
            {
                text: 'Essentials',
                collapsed: false,
                items: [
                    { text: 'Core Concepts', link: '/guide/core-concepts' },
                    { text: 'Examples', link: '/guide/examples' }
                ]
            },
            {
                text: 'API Reference',
                collapsed: false,
                items: [
                    { text: 'DagEngine', link: '/api/dag-engine' },
                    { text: 'Plugin', link: '/api/plugin' },
                    { text: 'Providers', link: '/api/providers' }
                ]
            }
        ],

        // Social links
        socialLinks: [
            { icon: 'github', link: 'https://github.com/ivan629/dag-ai' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/@ivan629/dag-ai' }
        ],

        // Footer
        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2025 Ivan Holovach'
        },

        // Search
        search: {
            provider: 'local'
        },

        // Edit link
        editLink: {
            pattern: 'https://github.com/ivan629/dag-ai/edit/main/docs/:path',
            text: 'Edit this page on GitHub'
        },

        // Last updated
        lastUpdated: {
            text: 'Updated at',
            formatOptions: {
                dateStyle: 'short',
                timeStyle: 'short'
            }
        }
    },

    // Markdown config
    markdown: {
        theme: {
            light: 'github-light',
            dark: 'github-dark'
        },
        lineNumbers: true
    },

    // Head tags (SEO)
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
        ['meta', { name: 'theme-color', content: '#0D9373' }],
        ['meta', { name: 'og:type', content: 'website' }],
        ['meta', { name: 'og:locale', content: 'en' }],
        ['meta', { name: 'og:site_name', content: 'dag-ai' }],
        ['meta', { name: 'og:title', content: 'dag-ai | AI Workflow Orchestration' }],
        ['meta', { name: 'og:description', content: 'Build production-ready AI pipelines with intelligent dependency management, cost optimization, and zero complexity' }]
    ]
})