import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Copy example README.md files to docs for VitePress
 */
const examplesDir = resolve('examples');
const docsExamplesDir = resolve('docs/examples');

// Create docs/examples directory
if (!existsSync(docsExamplesDir)) {
	mkdirSync(docsExamplesDir, { recursive: true });
}

console.log('📦 Copying example READMEs to docs...\n');

// Read all example folders
const examples = readdirSync(examplesDir).filter(name => {
	const path = join(examplesDir, name);
	return statSync(path).isDirectory();
});

// Copy each README.md
examples.forEach(exampleName => {
	const srcReadme = join(examplesDir, exampleName, 'README.md');

	if (existsSync(srcReadme)) {
		// Copy as the markdown file VitePress will render
		const destFile = join(docsExamplesDir, `${exampleName}.md`);
		copyFileSync(srcReadme, destFile);
		console.log(`✓ Copied ${exampleName}/README.md → examples/${exampleName}.md`);
	} else {
		console.log(`⚠️  Skipped ${exampleName} (no README.md)`);
	}
});

console.log('\n✅ Done! Example docs ready for VitePress');