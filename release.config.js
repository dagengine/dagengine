/**
 * Semantic Release Configuration
 * Publishes beta versions from main branch
 */
export default {
  branches: [
    {
      name: 'main',
      prerelease: 'beta'
    }
  ],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/github'
  ]
};