import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import { fixtureServer } from './fixture.js';
import * as core from '../backend/src/core.js';
import { redactNetworkText } from '../backend/src/network.js';

test('real native connectivity, proxy forwarding, request errors, and recovery', { timeout: 180000 }, async t => {
  const saved = { proxy: process.env.HUNTERKIT_PROXY, templates: process.env.HUNTERKIT_TEMPLATES };
  process.env.HUNTERKIT_PROXY = 'direct';
  const fixture = await fixtureServer();
  const templates = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-network-'));
  const rel = 'http/exposed-panels/phpmyadmin-panel.yaml';
  await fs.mkdir(path.dirname(path.join(templates, rel)), { recursive: true });
  await fs.copyFile(path.join(core.ROOT, '.tools/nuclei-templates', rel), path.join(templates, rel));
  process.env.HUNTERKIT_TEMPLATES = templates;
  const names: string[] = [];
  async function project(suffix: string, target: string) {
    const name = `HK-network-${process.pid}-${suffix}`; names.push(name);
    await core.createProject(name, target); return core.projectPath(name);
  }
  try {
    await t.test('scheme discovery keeps the supplied port and excludes only the dead HTTPS origin', async () => {
      const dir = await project('schemes', fixture.base.replace('http://', '') + '/lab/');
      const result = await core.exposedPanels(dir);
      assert.equal(result.success, true, JSON.stringify(result)); assert.ok(result.result! > 0);
      const inputs = await fs.readFile(path.join(dir, '.nuclei-exposedPanels-input.txt'), 'utf8');
      assert.match(inputs, /http:\/\/localhost:\d+\/lab\//); assert.doesNotMatch(inputs, /https:/);
      const report = await core.projectDiagnostics(path.basename(dir));
      assert.equal(report.connection.targets.length, 2);
      assert.ok(report.connection.targets.every((row: any) => new URL(row.url).port === new URL(fixture.base).port));
      assert.ok(!(await core.attackResults(path.basename(dir))).some(row => row['template-id'] === 'hunterkit-http-connectivity'));
    });
    await t.test('an unreachable port blocks the large scan and recovers when the service returns', async () => {
      const reservation = net.createServer();
      await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
      const port = (reservation.address() as net.AddressInfo).port;
      await new Promise<void>(resolve => reservation.close(() => resolve()));
      const dir = await project('recovery', `http://localhost:${port}/lab/`);
      const failed = await core.exposedPanels(dir);
      assert.equal(failed.success, false, JSON.stringify(failed)); assert.equal(failed.blocked, true);
      const details = await core.getDetails(path.basename(dir));
      assert.equal(details.exposedPanels.completionState, 'blocked');
      assert.equal(details.exposedPanels.completed, false);
      assert.equal(await fs.access(path.join(dir, '.nuclei-exposedPanels-input.txt')).then(() => true, () => false), true);
      assert.equal(await fs.readFile(path.join(dir, 'logs/exposedPanels-nuclei.raw.jsonl'), 'utf8'), '');
      const recovered = await fixtureServer(port);
      try {
        const check = await core.checkTargetConnection(dir, true);
        assert.equal(check.success, true, JSON.stringify(check));
        const result = await core.exposedPanels(dir);
        assert.equal(result.success, true, JSON.stringify(result)); assert.ok(result.result! > 0);
      } finally { await recovered.close(); }
    });
    await t.test('Node and real Nuclei share an explicit HTTP proxy for a non-resolving hostname', async () => {
      let forwarded = 0;
      const sockets = new Set<net.Socket>();
      const proxy = http.createServer((req, res) => {
        const url = new URL(req.url!);
        assert.equal(url.hostname, 'hunterkit.invalid'); forwarded++;
        const upstream = http.request({ hostname: '127.0.0.1', port: new URL(fixture.base).port, path: url.pathname + url.search, method: req.method, headers: req.headers }, response => {
          res.writeHead(response.statusCode!, response.headers); response.pipe(res);
        });
        upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
      });
      proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      proxy.on('connect', (req, socket, head) => {
        assert.match(req.url!, /^hunterkit\.invalid:/); forwarded++;
        const upstream = net.connect(Number(new URL(fixture.base).port), '127.0.0.1', () => {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
        });
        upstream.on('error', () => socket.destroy()); socket.on('close', () => upstream.destroy());
      });
      await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
      process.env.HUNTERKIT_PROXY = `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;
      try {
        const dir = await project('proxy', `http://hunterkit.invalid:${new URL(fixture.base).port}/lab/`);
        const check = await core.checkTargetConnection(dir, true);
        assert.equal(check.success, true, JSON.stringify(check));
        assert.equal(check.report.targets[0].node.status, 200);
        assert.equal(check.report.targets[0].nuclei.status, 200);
        assert.equal(check.report.targets[0].proxySource, 'HUNTERKIT_PROXY');
        const result = await core.exposedPanels(dir);
        assert.equal(result.success, true, JSON.stringify(result)); assert.ok(result.result! > 0);
        assert.ok(forwarded >= 3);
        assert.doesNotMatch(JSON.stringify(await core.projectDiagnostics(path.basename(dir))), /127\.0\.0\.1:\d+/);
      } finally {
        process.env.HUNTERKIT_PROXY = 'direct';
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => proxy.close(() => resolve()));
      }
    });
    await t.test('normal engine completion with a failed request is distinct from an interrupted scan', async () => {
      await fs.writeFile(path.join(templates, 'http/exposed-panels/socket-drop.yaml'), `id: hunterkit-test-socket-drop
info:
  name: Local test socket drop
  author: hunterkit-test
  severity: info
http:
  - method: GET
    path:
      - "{{BaseURL}}/drop"
    matchers:
      - type: status
        status: [200]
`);
      const dir = await project('errors', fixture.base + '/lab/');
      const result = await core.exposedPanels(dir);
      assert.equal(result.success, true, JSON.stringify(result));
      const details = await core.getDetails(path.basename(dir));
      assert.ok(details.exposedPanels.requestErrors > 0, JSON.stringify(details.exposedPanels));
      assert.equal(details.exposedPanels.completionState, 'completed-with-errors');
      assert.equal(details.exposedPanels.partial, false);
      assert.match(details.exposedPanels.warning, /incomplete coverage/);
    });
    await t.test('POST login forms are reported without inventing GET scan inputs', async () => {
      const dir = await project('login', fixture.base + '/login');
      await core.parameter(dir);
      const diagnostic = await core.projectDiagnostics(path.basename(dir));
      assert.equal(diagnostic.discovery.postForms, 1);
      assert.equal(diagnostic.discovery.passwordForms, 1);
      assert.equal(diagnostic.discovery.authenticatedSession, false);
      const result = await core.scanningForSQLi(dir);
      assert.equal(result.skipped, true, JSON.stringify(result));
      assert.equal((await core.getDetails(path.basename(dir))).sqlInjection.completed, false);
    });
    await t.test('diagnostic text redacts proxy passwords', () => {
      assert.equal(redactNetworkText('proxy http://tester:private-value@proxy.invalid:8080'), 'proxy http://[redacted]@proxy.invalid:8080');
    });
  } finally {
    if (saved.proxy === undefined) delete process.env.HUNTERKIT_PROXY; else process.env.HUNTERKIT_PROXY = saved.proxy;
    if (saved.templates === undefined) delete process.env.HUNTERKIT_TEMPLATES; else process.env.HUNTERKIT_TEMPLATES = saved.templates;
    await fixture.close();
    for (const name of names) await fs.rm(core.projectPath(name), { recursive: true, force: true });
    await fs.rm(templates, { recursive: true, force: true });
  }
});
