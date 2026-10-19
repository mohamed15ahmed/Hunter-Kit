import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import axios from 'axios';
import { axiosTransport, scannerTransport, networkCause, redactNetworkText } from './network.js';

type Runner = (command: string, args: string[], options?: any) => Promise<{ code: number; stdout: string; stderr: string; command: string }>;
type Evidence = { ok: boolean; status?: number; code?: string; error?: string };
export type ConnectionTarget = { url: string; node: Evidence; nuclei: Evidence; allowed: boolean; proxySource: string; pacDetected?: boolean; suggestion?: string };
export type ConnectionReport = { checkedAt: string; targets: ConnectionTarget[]; ready: boolean; diagnosticFile: string };
type Context = { dir: string; root: string; nuclei: string; run: Runner };
const cache = new Map<string, { expires: number; report: ConnectionReport }>();

export class ConnectionFailure extends Error {
  blocked = true;
  code = 'TARGET_UNREACHABLE';
  constructor(public report: ConnectionReport) {
    const first = report.targets.find(target => !target.allowed)!;
    const contrast = first.node.ok && !first.nuclei.ok ? `Node received HTTP ${first.node.status}, but nuclei could not connect. ` : '';
    const detail = first.nuclei.error || `HTTP ${first.nuclei.status ?? 'connection failure'}`;
    super(`Connection check failed for ${first.url}. ${contrast}${detail} Open Connection details for the recorded cause and proxy route.`);
  }
}

export function requestTimeoutSeconds() {
  const seconds = Number(process.env.HUNTERKIT_REQUEST_TIMEOUT_SECONDS || 15);
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 60) throw new Error('HUNTERKIT_REQUEST_TIMEOUT_SECONDS must be between 3 and 60.');
  return Math.round(seconds);
}

async function nodeProbe(url: string): Promise<Evidence> {
  try {
    const response = await axios.get(url, {
      ...await axiosTransport(url), timeout: Math.min(10000, requestTimeoutSeconds() * 1000),
      maxRedirects: 0, responseType: 'stream', validateStatus: () => true,
      headers: { 'User-Agent': 'HunterKit-Connectivity/1.11' },
    });
    response.data.destroy();
    return { ok: true, status: response.status };
  } catch (error: any) {
    return { ok: false, code: error.code || networkCause(error.message || '').code, error: redactNetworkText(error.message || String(error)) };
  }
}

async function nucleiProbe(context: Context, url: string, tag: string): Promise<Evidence> {
  const transport = await scannerTransport([url], 'nuclei');
  const output = path.join(context.dir, 'logs', `connection-${tag}.jsonl`);
  const errorLog = path.join(context.dir, 'logs', `connection-${tag}-errors.log`);
  const seconds = Math.min(10, requestTimeoutSeconds());
  const args = [
    '-u', url, '-t', path.join(context.root, 'backend/assets/http-connectivity.yaml'),
    '-duc', '-ni', '-nc', '-silent', '-jsonl', '-o', output, '-no-stdin', '-sr',
    '-timeout', String(seconds), '-retries', '0', '-c', '1', '-bs', '1', '-rl', '2', '-elog', errorLog,
    ...transport.args,
  ];
  await fs.writeFile(output, '');
  try {
    const result = await context.run(context.nuclei, args, { timeout: (seconds + 8) * 1000, env: transport.env });
    const raw = (await fs.readFile(output, 'utf8')) || result.stdout;
    const records = raw.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const hit = records.find(row => row['template-id'] === 'hunterkit-http-connectivity');
    if (hit) {
      const status = Number(hit['extracted-results']?.[0] || String(hit.response || '').match(/^HTTP\/\S+\s+(\d+)/)?.[1]);
      return { ok: true, status: status || undefined };
    }
    const details = await fs.readFile(errorLog, 'utf8').catch(() => '');
    const cause = networkCause(details || result.stderr || result.stdout);
    return { ok: false, ...cause, error: redactNetworkText((details || result.stderr || cause.message).trim()).slice(-2000) };
  } catch (error: any) {
    const details = await fs.readFile(errorLog, 'utf8').catch(() => '');
    const text = [details, error.stderr, error.stdout, error.message].filter(Boolean).join('\n');
    const cause = error.code === 'ENOENT' || /ENOENT|not recognized|cannot find/i.test(text) ? { code: 'TOOL_MISSING', message: 'The nuclei executable could not start. Run INSTALL-TOOLS again.' } : networkCause(text);
    return { ok: false, code: cause.code, error: redactNetworkText(details || error.stderr || cause.message).trim().slice(-2000) };
  }
}

export async function assessConnections(context: Context, urls: string[], force = false): Promise<ConnectionReport> {
  const byOrigin = new Map<string, string>();
  for (const value of urls) {
    try { const parsed = new URL(value); if (!byOrigin.has(parsed.origin)) byOrigin.set(parsed.origin, value); } catch {}
  }
  const targets = [...byOrigin.values()];
  if (!targets.length) throw new Error('No valid HTTP(S) target URLs are available.');
  const routes = await Promise.all(targets.map(url => scannerTransport([url], 'nuclei')));
  const signature = createHash('sha256').update(JSON.stringify([targets, routes.map(route => route.route.url)])).digest('hex');
  const key = `${context.dir}|${signature}`;
  const saved = cache.get(key);
  if (!force && saved && saved.expires > Date.now()) return saved.report;
  await fs.mkdir(path.join(context.dir, 'logs'), { recursive: true });
  const evidence: ConnectionTarget[] = [];
  // These are ordinary GETs, one per selected origin; run them serially to avoid a probe burst.
  for (let index = 0; index < targets.length; index++) {
    const url = targets[index];
    const [node, nuclei] = await Promise.all([nodeProbe(url), nucleiProbe(context, url, `${signature.slice(0, 10)}-${index}`)]);
    const status = nuclei.status;
    const allowed = nuclei.ok && ![403, 407, 429].includes(status || 0);
    const entry: ConnectionTarget = { url, node, nuclei, allowed, proxySource: routes[index].route.source, pacDetected: routes[index].route.pacDetected };
    if (nuclei.ok && !allowed) entry.nuclei = { ...nuclei, error: `HTTP ${status}: access is denied, proxy authentication is required, or the target is rate limiting requests.` };
    if (!allowed && new URL(url).protocol === 'https:') {
      const alternative = new URL(url); alternative.protocol = 'http:';
      // Diagnose HTTP-only sites without silently changing the saved target or its scan scope.
      const http = await nodeProbe(alternative.toString());
      if (http.ok && ![403, 407, 429].includes(http.status || 0)) entry.suggestion = `HTTP responds at ${alternative.toString()}. If that is the intended lab, update the target URL explicitly.`;
    }
    if (!allowed && !entry.suggestion) entry.suggestion = node.ok && !nuclei.ok
      ? 'The Node/browser route and scanner route differ. Check the proxy configuration and whether Windows permits nuclei.exe/dalfox.exe network access. Do not disable endpoint protection.'
      : entry.pacDetected && entry.proxySource === 'direct'
        ? 'Windows uses a PAC proxy. Configure its explicit HTTP proxy as HUNTERKIT_PROXY; PAC scripts are not executed by the scanners.'
        : 'Check the exact HTTP/HTTPS URL and port. If the browser requires a proxy, configure HUNTERKIT_PROXY or the static Windows proxy.';
    evidence.push(entry);
  }
  const report: ConnectionReport = { checkedAt: new Date().toISOString(), targets: evidence, ready: evidence.some(target => target.allowed), diagnosticFile: 'logs/connection-report.json' };
  await fs.writeFile(path.join(context.dir, report.diagnosticFile), JSON.stringify(report, null, 2));
  cache.set(key, { expires: Date.now() + (report.ready ? 30000 : 2000), report });
  return report;
}

export function reachableInputs(urls: string[], report: ConnectionReport) {
  const allowed = new Set(report.targets.filter(target => target.allowed).map(target => new URL(target.url).origin));
  return urls.filter(url => allowed.has(new URL(url).origin));
}
