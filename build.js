/**
 * build.js
 * Simple build script for production optimization
 * 
 * Usage: node build.js
 * 
 * This script:
 * 1. Creates a dist/ directory
 * 2. Copies all files
 * 3. Minifies CSS and JS (future)
 * 4. Generates file hashes for cache busting (future)
 * 5. Creates a production-ready build
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = __dirname;
const DIST_DIR = path.join(__dirname, 'dist');

// Files/folders to exclude from build
const EXCLUDE = [
  'node_modules',
  'dist',
  '.git',
  '.vscode',
  'build.js',
  'package.json',
  'package-lock.json',
  'REFACTORING-PLAN.md'
];

console.log('🚀 Building PDF Tool for production...\n');

// Clean dist directory
if (fs.existsSync(DIST_DIR)) {
  console.log('🧹 Cleaning dist directory...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

// Create dist directory
fs.mkdirSync(DIST_DIR, { recursive: true });
console.log('✅ Created dist directory\n');

// Copy files recursively
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    items.forEach(item => {
      if (!EXCLUDE.includes(item)) {
        copyRecursive(path.join(src, item), path.join(dest, item));
      }
    });
  } else {
    fs.copyFileSync(src, dest);
    console.log(`📄 Copied: ${path.relative(SRC_DIR, src)}`);
  }
}

// Copy all files
console.log('📦 Copying files...\n');
const items = fs.readdirSync(SRC_DIR);
items.forEach(item => {
  if (!EXCLUDE.includes(item)) {
    const srcPath = path.join(SRC_DIR, item);
    const destPath = path.join(DIST_DIR, item);
    copyRecursive(srcPath, destPath);
  }
});

console.log('\n✨ Build complete! Output in dist/\n');
console.log('📋 Next steps:');
console.log('   1. Test the build: cd dist && npx serve');
console.log('   2. Deploy the dist/ folder to your hosting provider\n');

// Future enhancements:
// - Minify CSS with cssnano
// - Minify JS with terser
// - Generate file hashes for cache busting
// - Inline critical CSS
// - Generate source maps
// - Optimize images
// - Bundle dependencies locally
