import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { ROOT, downloadVerified } from './download-support.mjs';
const spec = JSON.parse(await fs.readFile(new URL('./templates-lock.json', import.meta.url), 'utf8'));
const destination = path.join(ROOT, '.tools', 'nuclei-templates');
const marker = path.join(destination, '.hunterkit-version');
const required = ['http/exposed-panels/phpmyadmin-panel.yaml', 'dast/vulnerabilities/sqli/sqli-error-based.yaml', 'dast/vulnerabilities/lfi/linux-lfi-fuzz.yaml'];
const readable = async file => { try { await fs.access(file); return true; } catch { return false; } };
const current = await fs.readFile(marker, 'utf8').catch(() => '');
if (current.trim() === spec.sha256 && (await Promise.all(required.map(rel => readable(path.join(destination, rel))))).every(Boolean)) {
  console.log(`Nuclei templates ${spec.version}: already prepared`);
} else {
  const archive = await downloadVerified(spec, 'nuclei-templates');
  const staging = `${destination}.staging-${Date.now()}`;
  await fs.mkdir(staging, { recursive: true });
  try {
    const zip = new AdmZip(archive);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const rel = entry.entryName.split('/').slice(1).join('/');
      if (!rel || rel.split('/').includes('..') || path.isAbsolute(rel)) throw new Error('Unsafe template archive path.');
      const full = path.resolve(staging, rel);
      if (!full.startsWith(staging + path.sep)) throw new Error('Unsafe template archive path.');
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, entry.getData());
    }
    for (const rel of required) await fs.access(path.join(staging, rel));
    await fs.writeFile(path.join(staging, '.hunterkit-version'), spec.sha256 + '\n');
    if (await readable(destination)) await fs.rename(destination, `${destination}.previous-${Date.now()}`);
    await fs.rename(staging, destination);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
  console.log(`Nuclei templates ${spec.version}: installed and archive SHA-256 verified`);
}
// Nuclei reads its exclusion list from the config directory, not from -t alone.
if (process.platform !== 'win32') {
  const config = path.join(process.env.XDG_CONFIG_HOME || path.join(ROOT, '.runtime', 'config'), 'nuclei');
  await fs.mkdir(config, { recursive: true });
  if (!(await readable(path.join(config, '.nuclei-ignore')))) await fs.copyFile(path.join(destination, '.nuclei-ignore'), path.join(config, '.nuclei-ignore'));
}
