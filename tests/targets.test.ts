import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget, targetSeeds, scopedUrls } from '../backend/src/targets.js';
import { parseNucleiReport, parseDalfoxEnvelope, updateDetails, readJson } from '../backend/src/core.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('preserves exact scheme, port, path and query instead of reducing a lab to its hostname', () => {
  const target = parseTarget('http://127.0.0.1:8080/lab/sqli?id=1#top');
  assert.equal(target.domain, '127.0.0.1');
  assert.deepEqual(targetSeeds(target), ['http://127.0.0.1:8080/lab/sqli?id=1']);
});
test('hostname input remains compatible with HTTP and HTTPS discovery', () => {
  assert.deepEqual(targetSeeds(parseTarget('example.test')), ['http://example.test/', 'https://example.test/']);
  assert.deepEqual(targetSeeds({ domain: 'example.test' }), ['http://example.test/', 'https://example.test/']);
});
test('URL input rejects embedded credentials, non-HTTP protocols and invalid ports', () => {
  for (const value of ['ftp://example.test/', 'http://user:pass@example.test', 'http://localhost:99999', '']) assert.throws(() => parseTarget(value));
});
test('scopes historical URLs, external links and changed ports before active tools receive them', () => {
  const target = parseTarget('http://localhost:8080/lab/');
  assert.deepEqual(scopedUrls(['http://localhost:8080/sqli?id=1', 'http://localhost:9090/no', 'http://external.invalid/', 'javascript:alert(1)', 'http://localhost:8080/sqli?id=1#frag'], target), ['http://localhost:8080/sqli?id=1']);
});
test('hostname scope includes discovered subdomains but excludes lookalike domains', () => {
  assert.deepEqual(scopedUrls(['https://api.example.test/', 'https://example.test.evil.invalid/', 'https://notexample.test/'], parseTarget('example.test')), ['https://api.example.test/']);
});
test('IP and localhost targets do not allow arbitrary hostname suffixes', () => {
  assert.deepEqual(scopedUrls(['http://evil.127.0.0.1/', 'http://127.0.0.1/'], parseTarget('127.0.0.1')), ['http://127.0.0.1/']);
  assert.deepEqual(scopedUrls(['http://evil.localhost/', 'http://localhost/'], parseTarget('localhost')), ['http://localhost/']);
});
test('Nuclei statistics cannot turn into phantom findings when stdout is used', () => {
  const finding = { 'template-id': 'contract', info: { name: 'contract', severity: 'info' }, 'matched-at': 'http://localhost/' };
  const stats = { requests: '5', matched: '1', templates: '1' };
  assert.deepEqual(parseNucleiReport(JSON.stringify(stats)), []);
  assert.deepEqual(parseNucleiReport([JSON.stringify(finding), JSON.stringify(stats)].join('\n')), [finding]);
  assert.deepEqual(parseNucleiReport(JSON.stringify([finding, stats])), [finding]);
});
test('Dalfox reflections and static observations are separate from verified V findings', () => {
  const report = parseDalfoxEnvelope(JSON.stringify({ findings: [{ type: 'V', param: 'q' }, { type: 'R', param: 'q' }, { type: 'A', param: 'q' }], meta: { incomplete: true } }));
  assert.equal(report.findings.length, 1); assert.equal(report.observations.length, 2); assert.equal(report.incomplete, true);
});
test('missing or malformed Dalfox reports raise an error instead of claiming a clean scan', () => {
  assert.throws(() => parseDalfoxEnvelope(''));
  assert.throws(() => parseDalfoxEnvelope('error: unknown argument --input-type'));
  assert.equal(parseDalfoxEnvelope('{"findings":[],"meta":{"incomplete":false,"total_requests":10}}').findings.length, 0);
});
test('concurrent scanners retain every details update', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-detail-test-'));
  try {
    await Promise.all(Array.from({ length: 20 }, (_, i) => updateDetails(dir, { [`scan${i}`]: { result: i } })));
    const saved = await readJson(path.join(dir, 'details.json'));
    for (let i = 0; i < 20; i++) assert.equal(saved[`scan${i}`].result, i);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
