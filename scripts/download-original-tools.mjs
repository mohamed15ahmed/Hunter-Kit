// Tested versions and archive/executable SHA-256 digests are pinned in tools-lock.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import AdmZip from 'adm-zip';
import { ROOT, hash, digestFile, downloadVerified } from './download-support.mjs';
const lock = JSON.parse(await fs.readFile(new URL('./tools-lock.json', import.meta.url), 'utf8'));
const platform = `${process.platform === 'win32' ? 'windows' : process.platform}-${os.arch()}`;
const bin = path.join(ROOT, 'bin');
await fs.mkdir(bin, { recursive: true });
const failures = [];
for (const [name, tool] of Object.entries(lock)) {
  try {
    const asset = tool.assets[platform];
    if (!asset) throw new Error(`No tested binary for ${platform}. Supported: ${Object.keys(tool.assets).join(', ')}. Install from the official source on other platforms.`);
    const exe = process.platform === 'win32' ? `${name}.exe` : name;
    const destination = path.join(bin, exe);
    if (await digestFile(destination) === asset.binarySha256) { console.log(`${name} ${tool.version}: verified, already installed`); continue; }
    const archive = await downloadVerified(asset, name);
    let data;
    if (asset.url.endsWith('.zip')) {
      const zip = new AdmZip(archive);
      const entries = zip.getEntries().filter(entry => !entry.isDirectory && path.posix.basename(entry.entryName).toLowerCase() === exe.toLowerCase());
      if (entries.length !== 1) throw new Error('Archive does not contain exactly one expected executable.');
      data = entries[0].getData();
    } else {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-tool-'));
      try {
        await tar.x({ file: archive, cwd: temp, filter: (entryPath, entry) => entry.type === 'File' && path.posix.basename(entryPath) === exe && !entryPath.split('/').includes('..') });
        async function find(dir) {
          const matches = [];
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) matches.push(...await find(full));
            else if (entry.isFile() && entry.name === exe) matches.push(full);
          }
          return matches;
        }
        const matches = await find(temp);
        if (matches.length !== 1) throw new Error('Archive does not contain exactly one expected executable.');
        data = await fs.readFile(matches[0]);
      } finally { await fs.rm(temp, { recursive: true, force: true }); }
    }
    if (hash(data) !== asset.binarySha256) throw new Error('Extracted executable digest mismatch.');
    if (await digestFile(destination)) {
      const backup = path.join(bin, '.previous'); await fs.mkdir(backup, { recursive: true });
      await fs.copyFile(destination, path.join(backup, `${exe}-${Date.now()}`));
    }
    const temp = `${destination}.new`;
    await fs.writeFile(temp, data, { mode: 0o755 });
    await fs.rename(temp, destination);
    if (process.platform !== 'win32') await fs.chmod(destination, 0o755);
    console.log(`${name} ${tool.version}: installed and SHA-256 verified`);
  } catch (error) { failures.push(`${name}: ${error.message}`); console.error(failures.at(-1)); }
}
if (failures.length) process.exitCode = 1;
