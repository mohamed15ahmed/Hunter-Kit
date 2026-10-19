// Keep the real test exit code, and expose failed assertions as GitHub annotations.
// This also avoids relying on shell glob expansion on Windows.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = process.argv.slice(2);
if (!files.length) files.push(...fs.readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort().map(name => path.join('tests', name)));
const report = path.resolve('.runtime', 'ci-tests.xml');
fs.mkdirSync(path.dirname(report), { recursive: true });
const run = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', `--test-reporter-destination=${report}`, ...files], { stdio: 'inherit' });
if (run.error) console.log(`::error title=Test runner::${run.error.message}`);
const decode = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escape = value => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const xml = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
for (const match of xml.matchAll(/<failure\b[^>]*>([\s\S]*?)<\/failure>/g)) {
  console.log(`::error title=Test assertion failed::${escape(decode(match[1]).slice(0, 10000))}`);
}
process.exitCode = run.status ?? 1;
