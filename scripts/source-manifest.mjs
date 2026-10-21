import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'validation', 'source-sha256.json');
const skippedDirectories = new Set(['.git', '.runtime', '.tools', 'downloads', 'node_modules']);

const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (relative === '.env' || relative === 'validation/source-sha256.json' || relative.endsWith('.tsbuildinfo')) continue;
    if (relative.startsWith('projects/') && relative !== 'projects/.gitkeep') continue;
    if (relative.startsWith('bin/') && relative !== 'bin/.gitkeep') continue;
    files.push(relative);
  }
}

await walk(root);
files.sort();
const sha256 = {};
for (const relative of files) {
  const data = await fs.readFile(path.join(root, relative));
  sha256[relative] = createHash('sha256').update(data).digest('hex');
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({
  generatedAt: new Date().toISOString(),
  algorithm: 'sha256',
  fileCount: files.length,
  files: sha256,
}, null, 2) + '\n');
console.log(`Wrote ${files.length} SHA-256 entries to ${path.relative(root, output)}`);
