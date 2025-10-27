import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

/**
 * Copy example README.md files to docs for VitePress (including nested folders)
 */
const examplesDir = resolve('examples');
const docsExamplesDir = resolve('docs/examples');

// Create docs/examples directory
if (!existsSync(docsExamplesDir)) {
	mkdirSync(docsExamplesDir, { recursive: true });
}

console.log('📦 Copying example READMEs to docs (including nested folders)...\n');

/**
 * Recursively find all README.md files in a directory
 */
function findReadmeFiles(dir, baseDir) {
	const results = [];
	const items = readdirSync(dir);

	items.forEach(item => {
		const fullPath = join(dir, item);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			// Recursively search subdirectories
			results.push(...findReadmeFiles(fullPath, baseDir));
		} else if (item === 'README.md') {
			// Found a README.md file
			results.push(fullPath);
		}
	});

	return results;
}

// Find all README.md files recursively
const readmeFiles = findReadmeFiles(examplesDir, examplesDir);

// Copy each README.md maintaining folder structure
readmeFiles.forEach(srcReadme => {
	// Get relative path from examples dir
	const relativePath = relative(examplesDir, srcReadme);

	// Remove 'README.md' from the path and replace with .md extension
	// e.g., 'basic/intro/README.md' → 'basic/intro.md'
	const pathParts = relativePath.split('/').slice(0, -1); // Remove README.md
	const fileName = pathParts.pop() || 'index'; // Get folder name
	const parentPath = pathParts.join('/');

	// Create destination path
	const destDir = parentPath ? join(docsExamplesDir, parentPath) : docsExamplesDir;
	const destFile = join(destDir, `${fileName}.md`);

	// Create destination directory if it doesn't exist
	if (!existsSync(destDir)) {
		mkdirSync(destDir, { recursive: true });
	}

	// Copy the file
	copyFileSync(srcReadme, destFile);

	// Log with proper relative paths
	const displaySrc = relativePath;
	const displayDest = relative(resolve('docs'), destFile);
	console.log(`✓ Copied ${displaySrc} → ${displayDest}`);
});

if (readmeFiles.length === 0) {
	console.log('⚠️  No README.md files found');
} else {
	console.log(`\n✅ Done! Copied ${readmeFiles.length} example doc(s) ready for VitePress`);
}