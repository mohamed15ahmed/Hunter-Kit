// Optional slower check against the full installed profiles, on a loopback fixture only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixtureServer } from './fixture.js';
import * as core from '../backend/src/core.js';
const fixture = await fixtureServer();
const name = `HK-production-smoke-${process.pid}`;
const oldBudget = process.env.HUNTERKIT_SCAN_TIMEOUT_MS;
process.env.HUNTERKIT_SCAN_TIMEOUT_MS = '30000';
const summary: any[] = [];
try {
  await core.createProject(name, fixture.base + '/lab/');
  const dir = core.projectPath(name);
  await core.parameter(dir);
  const jobs = [
    ['generalScanning', core.generalScanning], ['exposedPanels', core.exposedPanels],
    ['defaultCredentials', core.defaultCredentials], ['subdomainTakeovers', core.subdomainTakeovers],
    ['exposures', core.scanningForExposures], ['scanningCVEs', core.scanningCVEs],
    ['scanningForLFI', core.scanningForLFI], ['sqlInjection', core.scanningForSQLi],
    ['XSS', core.scanningForXSS],
  ] as const;
  for (const [key, run] of jobs) {
    const result = await run(dir);
    const meta = (await core.getDetails(name))[key] || {};
    const row = { key, success: result.success, findings: result.result ?? 0, partial: meta.partial || false, completed: meta.completed, templates: meta.templates, requests: meta.requests, requestErrors: meta.requestErrors, message: result.message, error: result.error };
    summary.push(row); console.log(JSON.stringify(row));
  }
  const output = path.join(core.ROOT, 'validation'); await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'production-profiles.json'), JSON.stringify({ generatedAt: new Date().toISOString(), target: 'loopback HTTP signature fixture', budgetPerProcessMs: 30000, results: summary }, null, 2));
  if (summary.some(row => !row.success)) process.exitCode = 1;
} finally {
  await fixture.close(); await fs.rm(core.projectPath(name), { recursive: true, force: true });
  if (oldBudget === undefined) delete process.env.HUNTERKIT_SCAN_TIMEOUT_MS; else process.env.HUNTERKIT_SCAN_TIMEOUT_MS = oldBudget;
}
