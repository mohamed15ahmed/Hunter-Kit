import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { ROOT } from './download-support.mjs';
dotenv.config({ path: path.join(ROOT, '.env') });
const local = path.join(ROOT, '.tools', 'nuclei-templates');
const root = process.env.HUNTERKIT_TEMPLATES ? path.resolve(ROOT, process.env.HUNTERKIT_TEMPLATES) : fs.existsSync(local) ? local : path.join(os.homedir(), 'nuclei-templates');
const profiles = [
  ['General (common HTTP)', ['http/misconfiguration', 'http/exposures', 'http/exposed-panels']],
  ['Exposed panels', ['http/exposed-panels']],
  ['Default logins', ['http/default-logins']],
  ['Subdomain takeovers', ['http/takeovers']],
  ['Exposures', ['http/exposures']],
  ['CVE scan', ['http/cves']],
  ['LFI DAST', ['dast/vulnerabilities/lfi']],
  ['SQLi DAST', ['dast/vulnerabilities/sqli']],
];
function countYaml(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? countYaml(path.join(dir, entry.name)) : /\.ya?ml$/i.test(entry.name) ? 1 : 0), 0);
}
console.log(`\nHunterKit attack profile diagnostics\nTemplates: ${root}`);
for (const [label, dirs] of profiles) {
  const count = dirs.reduce((n, rel) => n + countYaml(path.join(root, rel)), 0);
  console.log(`${count ? '✓' : '✗'} ${label.padEnd(25)} ${String(count).padStart(5)} template(s)`);
  if (!count) process.exitCode = 1;
}
console.log('\nCounts show installed templates before runtime severity/tag/protocol filters. Actual loaded/request counts are saved per scan. LFI/SQLi require parameter URLs; XSS requires Dalfox v3.');
