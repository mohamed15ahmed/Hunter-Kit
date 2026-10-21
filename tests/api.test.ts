import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { fixtureServer } from './fixture.js';
import { ROOT, projectPath } from '../backend/src/core.js';

test('HTTP API and production React interface use the real scan pipeline', { timeout: 120000 }, async t => {
  const fixture = await fixtureServer();
  const templates = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-api-templates-'));
  const rel = 'http/exposed-panels/phpmyadmin-panel.yaml';
  await fs.mkdir(path.dirname(path.join(templates, rel)), { recursive: true });
  await fs.copyFile(path.join(ROOT, '.tools/nuclei-templates', rel), path.join(templates, rel));
  const portServer = net.createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as any).port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/server.ts'], {
    cwd: ROOT, env: { ...process.env, PORT: String(port), HUNTERKIT_TEMPLATES: templates }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; server.stdout.on('data', data => { log += data; }); server.stderr.on('data', data => { log += data; });
  const base = `http://127.0.0.1:${port}`;
  const name = `HK-api-${process.pid}`, uiName = `HK-ui-${process.pid}`;
  const ipc = async (channel: string, ...args: any[]) => {
    const response = await fetch(`${base}/api/ipc/${channel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) });
    return { response, data: await response.json() as any };
  };
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(`${base}/api/health`)).ok; } catch {}
      if (healthy) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(healthy, true, log);
    await t.test('local API rejects public browser origins before they can run tools or read projects', async () => {
      const rejected = await fetch(`${base}/api/health`, { headers: { Origin: 'https://attacker.example' } });
      assert.equal(rejected.status, 403);
      assert.match((await rejected.json() as any).error, /non-local browser origin/i);
      const local = await fetch(`${base}/api/health`, { headers: { Origin: 'http://127.0.0.1:5173' } });
      assert.equal(local.status, 200);
      assert.equal(local.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    });
    await t.test('create-project and exposed-panels return actual JSONL findings through IPC', async () => {
      const created = await ipc('create-project', { projectName: name, domain: fixture.base + '/lab/' });
      assert.equal(created.data.error, false, JSON.stringify(created.data));
      const scanned = await ipc('exposed-panels', { projectName: name });
      assert.equal(scanned.data.success, true, JSON.stringify(scanned.data)); assert.ok(scanned.data.result > 0);
      const results = await ipc('get-attack-result', name);
      assert.ok(results.data.results.some((row: any) => row['template-id'] === 'phpmyadmin-panel'));
      assert.equal(results.data.results[0].sources[0].module, 'exposedPanels');
      const details = await ipc('get-project-details', name); assert.equal(details.data.exposedPanels.completed, true);
    });
    await t.test('failed input returns an explicit API error', async () => {
      const bad = await ipc('create-project', { projectName: '../escape', domain: fixture.base });
      assert.equal(bad.response.status, 500); assert.match(bad.data.error, /Invalid project name/);
      const traversal = await ipc('api-call', { projectName: name, location: '../.env', type: 'text/plain' });
      assert.equal(traversal.response.status, 500); assert.match(traversal.data.error, /Invalid path/);
    });
    await t.test('API rejects a second project tool immediately instead of queueing concurrent scanners', async () => {
      fixture.state.slow = true;
      const firstRun = fetch(`${base}/api/ipc/exposed-panels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args: [{ projectName: name }] }),
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      const competing = await ipc('vulns-cves', { projectName: name });
      assert.equal(competing.response.status, 409);
      assert.equal(competing.data.busy, true);
      assert.match(competing.data.message, /already running/);
      const firstResponse = await firstRun;
      assert.equal(firstResponse.ok, true, await firstResponse.text());
      fixture.state.slow = false;
    });
    const frontendBuilt = await fs.access(path.join(ROOT, 'frontend/dist/index.html')).then(() => true, () => false);
    await t.test('browser creates a project with a full lab URL, runs Panels, and renders results', { skip: !process.env.HUNTERKIT_TEST_BROWSER || !frontendBuilt }, async () => {
      const browser = await chromium.launch({ executablePath: process.env.HUNTERKIT_TEST_BROWSER, headless: true, chromiumSandbox: true, env: { ...process.env, XDG_CONFIG_HOME: path.join(ROOT, '.runtime/config'), XDG_CACHE_HOME: path.join(ROOT, '.runtime/cache') } });
      try {
        const page = await browser.newPage();
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        const dialogs: string[] = []; page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
        await page.goto(`${base}/projects`);
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await page.getByLabel('Project Name', { exact: true }).fill(uiName);
        await page.getByLabel('Target hostname or URL', { exact: true }).fill(fixture.base + '/lab/');
        await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
        await page.waitForURL(`**/${uiName}/dashboard`);
        await page.goto(`${base}/${uiName}/attacks`);
        const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/ipc/exposed-panels'));
        fixture.state.slow = true;
        await page.getByRole('heading', { name: 'Hunting Exposed panels', exact: true }).locator('../..').getByRole('button', { name: 'Run scan' }).click();
        const cveButton = page.getByRole('heading', { name: 'Scanning for Known Vulns and CVEs', exact: true }).locator('../..').getByRole('button');
        assert.equal(await cveButton.isDisabled(), true, 'other attack buttons must be disabled while a scan is running');
        const result = await (await responsePromise).json(); assert.ok(result.result > 0, JSON.stringify(result));
        fixture.state.slow = false;
        await page.goto(`${base}/${uiName}/attack-result`);
        await page.getByRole('cell', { name: 'phpmyadmin-panel', exact: true }).waitFor();
        assert.match(await page.locator('body').innerText(), /COMPLETED/);
        assert.match(await page.locator('body').innerText(), /exposedPanels/);
        await page.goto(`${base}/${uiName}/jsleaks`);
        const linksResponse = page.waitForResponse(response => response.url().endsWith('/api/ipc/extra-links'));
        await page.getByRole('heading', { name: 'Find EndPoints', exact: true }).locator('../..').getByRole('button', { name: 'Process', exact: true }).click();
        const linksResult = await (await linksResponse).json(); assert.ok(linksResult.result > 0, JSON.stringify(linksResult));
        await page.getByRole('button', { name: 'Refresh saved JS results' }).click();
        await page.locator('pre').filter({ hasText: '/api/demo' }).waitFor();
        assert.deepEqual(errors, []);
        assert.deepEqual(dialogs, [], 'tool errors/results must use non-blocking UI instead of browser alert dialogs');
      } finally { await browser.close(); }
    });
  } finally {
    if (server.exitCode === null && server.signalCode === null) { server.kill(); await new Promise<void>(resolve => server.once('close', () => resolve())); }
    await fixture.close();
    for (const project of [name, uiName]) await fs.rm(projectPath(project), { recursive: true, force: true });
    await fs.rm(templates, { recursive: true, force: true });
  }
});
