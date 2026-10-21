import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixtureServer } from './fixture.js';
import * as core from '../backend/src/core.js';

// Real Nuclei/Dalfox/HTTPX/JSLeak binaries; a small unmodified upstream template set
// keeps this contract test deterministic. Production scans use the installed full library.
test('real scanners: complete project -> recon -> attack evidence -> clean rescan and failure states', { timeout: 300000 }, async t => {
  const installedRoot = path.resolve(core.ROOT, '.tools/nuclei-templates');
  await fs.access(path.join(core.BIN_DIR, process.platform === 'win32' ? 'nuclei.exe' : 'nuclei'));
  const templates = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-signed-templates-'));
  const copies = [
    'http/exposed-panels/phpmyadmin-panel.yaml',
    'http/exposures/configs/laravel-env.yaml',
    'http/default-logins/activemq/activemq-default-login.yaml',
    'http/takeovers/kinsta-takeover.yaml',
    'http/cves/2021/CVE-2021-41773.yaml',
    'dast/vulnerabilities/sqli/sqli-error-based.yaml',
    'dast/vulnerabilities/lfi/linux-lfi-fuzz.yaml',
  ];
  for (const rel of copies) { await fs.mkdir(path.dirname(path.join(templates, rel)), { recursive: true }); await fs.copyFile(path.join(installedRoot, rel), path.join(templates, rel)); }
  await fs.mkdir(path.join(templates, 'http/misconfiguration'), { recursive: true });
  const oldTemplates = process.env.HUNTERKIT_TEMPLATES;
  const oldBudget = process.env.HUNTERKIT_SCAN_TIMEOUT_MS;
  process.env.HUNTERKIT_TEMPLATES = templates;
  const fixture = await fixtureServer();
  const names: string[] = [];
  async function project(suffix: string, target = fixture.base + '/lab/') {
    const name = `HK-test-${process.pid}-${suffix}`; names.push(name);
    await core.createProject(name, target); return core.projectPath(name);
  }
  try {
    const dir = await project('pipeline'); const name = path.basename(dir);
    await t.test('exact project URL survives serialization and fresh scanner input preparation', async () => {
      const details = await core.getDetails(name);
      assert.equal(details.targetUrl, fixture.base + '/lab/');
      assert.equal(details.domain, 'localhost');
      const res = await core.exposedPanels(dir);
      assert.equal(res.success, true, JSON.stringify(res)); assert.ok(res.result! >= 1, JSON.stringify(res));
      assert.match(await fs.readFile(path.join(dir, '.nuclei-exposedPanels-input.txt'), 'utf8'), new RegExp(`:${new URL(fixture.base).port}/lab/`));
    });
    await t.test('full local recon runs real HTTPX and discovers GET form/query/JS without public archives', async () => {
      const res = await core.runReconPipeline(dir); assert.equal(res.success, true, JSON.stringify(res));
      assert.ok(res.stages?.every(stage => stage.success), JSON.stringify(res));
      assert.ok((res.stages?.find(stage => stage.name === 'HTTPX')?.result || 0) > 0);
      const params = await fs.readFile(path.join(dir, 'waybackurls_parameter.txt'), 'utf8');
      assert.match(params, /search\?q=hello/); assert.match(params, /sqli\?id=1/); assert.match(params, /lfi\?file=/);
      assert.doesNotMatch(params, /outside\.invalid|\/login/);
      assert.match(await fs.readFile(path.join(dir, 'waybackurls_js.txt'), 'utf8'), /app\.js/);
    });
    const modules = [
      ['General', 'generalScanning', core.generalScanning], ['Panels', 'exposedPanels', core.exposedPanels],
      ['Default login', 'defaultCredentials', core.defaultCredentials], ['Takeover signature', 'subdomainTakeovers', core.subdomainTakeovers],
      ['Exposure', 'exposures', core.scanningForExposures], ['CVE signature', 'scanningCVEs', core.scanningCVEs],
      ['LFI DAST', 'scanningForLFI', core.scanningForLFI], ['SQLi DAST', 'sqlInjection', core.scanningForSQLi],
    ] as const;
    for (const [label, key, run] of modules) await t.test(`${label}: real Nuclei executes requests and saves its matched evidence`, async () => {
      const res = await run(dir); assert.equal(res.success, true, JSON.stringify(res));
      assert.ok(res.result! > 0, JSON.stringify(res));
      const meta = (await core.getDetails(name))[key];
      assert.equal(meta.completed, true, JSON.stringify(meta)); assert.ok(meta.requests > 0, JSON.stringify(meta));
    });
    await t.test('XSS: real Dalfox verifies unescaped reflection and aggregates a V finding', async () => {
      const res = await core.scanningForXSS(dir); assert.equal(res.success, true, JSON.stringify(res)); assert.ok(res.result! >= 1, JSON.stringify(res));
      const rows = await core.attackResults(name); assert.ok(rows.some(row => row['template-id'] === 'dalfox-xss'));
      assert.ok(rows.some(row => row['template-id'] === 'sqli-error-based'));
      assert.ok(rows.some(row => row['template-id'] === 'linux-lfi-fuzz'));
      assert.ok(rows.every(row => new URL(row.url).port === new URL(fixture.base).port));
    });
    await t.test('JSLeak secrets and endpoints execute with real stdin tool input', async () => {
      const secret = await core.findSecret(dir), links = await core.extraLinks(dir);
      assert.equal(secret.success, true, JSON.stringify(secret)); assert.equal(links.success, true, JSON.stringify(links));
      assert.ok(secret.result! > 0, JSON.stringify(secret));
      assert.match(await fs.readFile(path.join(dir, 'extra_links.txt'), 'utf8'), /api\/demo/);
    });
    await t.test('screenshots use a real browser and generate a gallery', { skip: !process.env.HUNTERKIT_TEST_BROWSER }, async () => {
      const oldBrowser = process.env.HUNTERKIT_BROWSER; process.env.HUNTERKIT_BROWSER = process.env.HUNTERKIT_TEST_BROWSER;
      try { const res = await core.screenwin(dir); assert.equal(res.success, true, JSON.stringify(res)); assert.ok(res.result! > 0, JSON.stringify(res)); }
      finally { if (oldBrowser === undefined) delete process.env.HUNTERKIT_BROWSER; else process.env.HUNTERKIT_BROWSER = oldBrowser; }
    });
    await t.test('clean rescans remove earlier Nuclei and Dalfox findings', async () => {
      fixture.state.vulnerable = false;
      const panel = await core.exposedPanels(dir); assert.equal(panel.success, true, JSON.stringify(panel)); assert.equal(panel.result, 0);
      const xss = await core.scanningForXSS(dir); assert.equal(xss.success, true, JSON.stringify(xss)); assert.equal(xss.result, 0, JSON.stringify(xss));
      assert.equal((await core.getDetails(name)).XSS.completed, true);
      const rows = await core.attackResults(name); assert.ok(!rows.some(row => row['template-id'] === 'dalfox-xss'));
      assert.equal((await fs.readFile(path.join(dir, 'exposed_panels.json'), 'utf8')).trim(), '');
      assert.ok(rows.filter(row => row['template-id'] === 'phpmyadmin-panel').every(row => row.sources.every((source: any) => source.module !== 'exposedPanels')));
    });
    await t.test('a nonempty archive cannot hide current GET form parameters', async () => {
      const fresh = await project('archive');
      await fs.writeFile(path.join(fresh, 'waybackurls_archive.txt'), fixture.base + '/old.js\nhttps://outside.invalid/x?id=1\n');
      const res = await core.parameter(fresh); assert.equal(res.success, true, JSON.stringify(res));
      const params = await fs.readFile(path.join(fresh, 'waybackurls_parameter.txt'), 'utf8'); assert.match(params, /search\?q=hello/); assert.doesNotMatch(params, /outside.invalid/);
    });
    await t.test('missing parameter candidates are SKIPPED, never completed/clean', async () => {
      const fresh = await project('no-params', fixture.base + '/plain');
      const xss = await core.scanningForXSS(fresh), sqli = await core.scanningForSQLi(fresh);
      assert.equal(xss.skipped, true, JSON.stringify(xss)); assert.equal(sqli.skipped, true, JSON.stringify(sqli));
      const details = await core.getDetails(path.basename(fresh));
      assert.equal(details.XSS.completed, false); assert.equal(details.sqlInjection.completed, false);
    });
    await t.test('missing template profile fails visibly and cannot retain a stale previous finding', async () => {
      const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-empty-'));
      try {
        process.env.HUNTERKIT_TEMPLATES = empty;
        const res = await core.exposedPanels(dir); assert.equal(res.success, false);
        assert.equal((await core.getDetails(name)).exposedPanels.failed, true);
        assert.equal((await fs.readFile(path.join(dir, 'exposed_panels.json'), 'utf8')).trim(), '');
        assert.ok((await core.attackResults(name)).filter(row => row['template-id'] === 'phpmyadmin-panel').every(row => row.sources.every((source: any) => source.module !== 'exposedPanels')));
      } finally { process.env.HUNTERKIT_TEMPLATES = templates; await fs.rm(empty, { recursive: true, force: true }); }
    });
    await t.test('deadline reports PARTIAL and rejects simultaneous duplicate scans', async () => {
      process.env.HUNTERKIT_SCAN_TIMEOUT_MS = '1000'; fixture.state.slow = true;
      const first = core.exposedPanels(dir);
      const duplicate = await core.exposedPanels(dir);
      const competingModule = await core.scanningCVEs(dir);
      assert.equal(duplicate.success, false); assert.match(duplicate.message, /already running/);
      assert.equal(competingModule.success, false); assert.equal(competingModule.busy, true);
      assert.match(competingModule.message, /already running/);
      const res = await first; assert.equal(res.partial, true, JSON.stringify(res));
      assert.equal((await core.getDetails(name)).exposedPanels.completed, false);
      fixture.state.slow = false;
    });
  } finally {
    if (oldTemplates === undefined) delete process.env.HUNTERKIT_TEMPLATES; else process.env.HUNTERKIT_TEMPLATES = oldTemplates;
    if (oldBudget === undefined) delete process.env.HUNTERKIT_SCAN_TIMEOUT_MS; else process.env.HUNTERKIT_SCAN_TIMEOUT_MS = oldBudget;
    await fixture.close();
    for (const name of names) await fs.rm(core.projectPath(name), { recursive: true, force: true });
    await fs.rm(templates, { recursive: true, force: true });
  }
});
