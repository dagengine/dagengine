// docs/.vitepress/config.mjs
import { defineConfig } from 'vitepress'

export default defineConfig({
    title: 'dag-ai',
    description: 'Production-ready AI workflow orchestration with intelligent dependency management',
    cleanUrls: true,

    themeConfig: {
        logo: '/logo.svg',
        siteTitle: 'dag-ai',

        // ==========================================
        // NAVIGATION
        // ==========================================
        nav: [
            {
                text: 'Guide',
                link: '/guide/introduction',
                activeMatch: '/guide/'
            },
            {
                text: 'API',
                link: '/api/engine',
                activeMatch: '/api/'
            },
            {
                text: 'Recipes',
                link: '/recipes/',
                activeMatch: '/recipes/'
            },
            {
                text: 'v1.0.0',
                items: [
                    { text: 'Changelog', link: 'https://github.com/ivan629/dag-ai/releases' },
                    { text: 'Contributing', link: 'https://github.com/ivan629/dag-ai/blob/main/CONTRIBUTING.md' }
                ]
            }
        ],

        // ==========================================
        // ✅ UNIFIED SIDEBAR (Same for all pages)
        // ==========================================
        sidebar: [
            {
                text: 'Getting Started',
                collapsed: false,
                items: [
                    { text: 'Introduction', link: '/guide/introduction' },
                    { text: 'Quick Start', link: '/guide/quick-start' },
                    { text: 'Installation', link: '/guide/installation' },
                    { text: 'Core Concepts', link: '/guide/core-concepts' },
                    { text: 'Examples', link: '/guide/examples' }
                ]
            },
            {
                text: 'Lifecycle',
                collapsed: false,
                items: [
                    { text: 'Workflow', link: '/lifecycle/workflow' },
                    { text: 'Dimension', link: '/lifecycle/dimension' },
                    { text: 'Hooks', link: '/lifecycle/hooks' }
                ]
            },
            {
                text: 'API Reference',
                collapsed: false,
                items: [
                    { text: 'DagEngine', link: '/api/engine' },
                    { text: 'Plugin', link: '/api/plugin' },
                    { text: 'Providers', link: '/api/providwrs' }
                ]
            },
            {
                text: 'Recipes',
                collapsed: false,
                items: [
                    { text: 'Overview', link: '/recipes/' },
                    { text: 'Functionality', link: '/recipes/functionality' }
                ]
            }
        ],

        // ==========================================
        // SOCIAL LINKS
        // ==========================================
        socialLinks: [
            { icon: 'github', link: 'https://github.com/ivan629/dag-ai' },
            { icon: 'npm', link: 'https://www.npmjs.com/package/@ivan629/dag-ai' }
        ],

        // ==========================================
        // SEARCH
        // ==========================================
        search: {
            provider: 'local',
            options: {
                detailedView: true
            }
        },

        // ==========================================
        // FOOTER
        // ==========================================
        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Copyright © 2025-present Ivan Holovach'
        },

        // ==========================================
        // EDIT LINK
        // ==========================================
        editLink: {
            pattern: 'https://github.com/ivan629/dag-ai/edit/main/docs/:path',
            text: 'Edit this page on GitHub'
        },

        // ==========================================
        // LAST UPDATED
        // ==========================================
        lastUpdated: {
            text: 'Last updated',
            formatOptions: {
                dateStyle: 'medium',
                timeStyle: 'short'
            }
        },

        // ==========================================
        // TABLE OF CONTENTS
        // ==========================================
        outline: {
            level: [2, 3],
            label: 'On this page'
        },

        // ==========================================
        // UI TEXT
        // ==========================================
        docFooter: {
            prev: 'Previous',
            next: 'Next'
        },

        returnToTopLabel: 'Back to top',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Theme'
    },

    // ==========================================
    // MARKDOWN CONFIGURATION
    // ==========================================
    markdown: {
        theme: {
            light: 'github-light',
            dark: 'github-dark'
        },
        lineNumbers: true
    },

    // ==========================================
    // HEAD TAGS
    // ==========================================
    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
        ['meta', { name: 'theme-color', content: '#0D9373' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:locale', content: 'en' }],
        ['meta', { property: 'og:site_name', content: 'dag-ai' }],
        ['meta', { property: 'og:title', content: 'dag-ai | AI Workflow Orchestration' }],
        ['meta', { property: 'og:description', content: 'Production-ready AI pipelines with intelligent dependency management' }]
    ],

    // ==========================================
    // SITEMAP
    // ==========================================
    sitemap: {
        hostname: 'https://dag-ai.dev'
    },

    // ==========================================
    // OTHER OPTIONS
    // ==========================================
    lastUpdated: true,
    appearance: 'dark'
})