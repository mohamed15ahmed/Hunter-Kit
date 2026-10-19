import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hash = data => createHash('sha256').update(data).digest('hex');
export async function digestFile(file) { try { return hash(await fs.readFile(file)); } catch { return null; } }
export async function downloadVerified(asset, label) {
  const cache = path.join(ROOT, '.tools', 'downloads');
  await fs.mkdir(cache, { recursive: true });
  const file = path.join(cache, `${label}-${asset.sha256.slice(0, 12)}.archive`);
  if (await digestFile(file) === asset.sha256) return file;
  const tmp = `${file}.part`;
  try {
    // curl supports HTTPS_PROXY and the OS trust store on Windows, macOS and Linux.
    await new Promise((resolve, reject) => {
      const child = spawn('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--connect-timeout', '15', '--max-time', '180', '--output', tmp, asset.url], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let stderr = '';
      child.stderr.on('data', data => { stderr += data; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`curl failed (${code}): ${stderr.trim()}`)));
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Download HTTP ${response.status}: ${label}`);
    await fs.writeFile(tmp, Buffer.from(await response.arrayBuffer()));
  }
  if (await digestFile(tmp) !== asset.sha256) {
    await fs.rm(tmp, { force: true });
    throw new Error(`SHA-256 verification failed for ${label}. No executable was installed.`);
  }
  await fs.rename(tmp, file);
  return file;
}
