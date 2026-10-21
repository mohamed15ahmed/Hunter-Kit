import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import axios from 'axios';
import https from 'node:https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { chromium } from 'playwright-core';
import { parseTarget, targetSeeds, scopedUrls, isScopedUrl } from './targets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
dotenv.config({ path: path.join(ROOT, '.env') });
export const PROJECT_DIR = path.join(ROOT, 'projects');
export const BIN_DIR = path.join(ROOT, 'bin');
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.mkdirSync(BIN_DIR, { recursive: true });

// Compatibility migration for early Web ports that wrote projects under backend/projects.
const LEGACY_PROJECT_DIR = path.join(ROOT, 'backend', 'projects');
if (fs.existsSync(LEGACY_PROJECT_DIR)) {
  for (const entry of fs.readdirSync(LEGACY_PROJECT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(LEGACY_PROJECT_DIR, entry.name);
    const dest = path.join(PROJECT_DIR, entry.name);
    if (!fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true });
  }
}

export type RunResult = {
  message: string;
  success: boolean;
  error: string | null;
  result?: number;
  outputFile?: string;
  stderr?: string;
  command?: string;
  stages?: Array<{ name: string; success: boolean; result?: number; message: string }>;
};

type ProcessResult = { code: number; stdout: string; stderr: string; command: string };
type RunOptions = { timeout?: number; acceptedCodes?: number[]; cwd?: string; input?: string };

export function safeProjectName(name: string) {
  const value = typeof name === 'string' ? name : '';
  const validShape = /^[A-Za-z0-9_-](?:[A-Za-z0-9._ -]{0,78}[A-Za-z0-9_-])?$/.test(value);
  const windowsDevice = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
  if (!validShape || value.includes('..') || windowsDevice) {
    throw new Error('Invalid project name. Use 1-80 letters, numbers, spaces, dashes, underscores or single dots; do not start/end with a space or dot.');
  }
  return name;
}
export function projectPath(name: string) {
  const result = path.resolve(PROJECT_DIR, safeProjectName(name));
  if (path.dirname(result) !== path.resolve(PROJECT_DIR)) throw new Error('Invalid project path');
  return result;
}
export function toolPath(tool: string) {
  const exe = os.platform() === 'win32' ? `${tool}.exe` : tool;
  const bundled = path.join(BIN_DIR, exe);
  return fs.existsSync(bundled) ? bundled : exe;
}
export async function readJson(file: string) { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return null; } }
const detailWrites = new Map<string, Promise<void>>();
export async function updateDetails(dir: string, updates: Record<string, any>) {
  const previous = detailWrites.get(dir) || Promise.resolve();
  const write = previous.catch(() => undefined).then(async () => {
    const file = path.join(dir, 'details.json');
    const old = (await readJson(file)) ?? {};
    const temp = `${file}.tmp`;
    await fsp.writeFile(temp, JSON.stringify({ ...old, ...updates, updatedAt: new Date().toISOString() }, null, 2));
    await fsp.rename(temp, file);
  });
  detailWrites.set(dir, write);
  try { await write; } finally { if (detailWrites.get(dir) === write) detailWrites.delete(dir); }
}
const attackJobs = new Map<string, string>();
async function exclusiveAttack(dir: string, key: string, run: () => Promise<any>) {
  const id = path.resolve(dir);
  const active = attackJobs.get(id);
  if (active) {
    return {
      success: false,
      busy: true,
      activeScanner: active,
      message: `Another attack scanner (${active}) is already running for this project.`,
      error: 'Wait for it to finish before starting a different attack scan.',
    };
  }
  attackJobs.set(id, key);
  try { return await run(); } finally { attackJobs.delete(id); }
}
export async function countLines(file: string) { try { return (await readLines(file)).length; } catch { return 0; } }

async function readLines(file: string): Promise<string[]> {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  } catch { return []; }
}
async function writeLines(file: string, lines: string[]) {
  const unique = Array.from(new Set(lines.map(x => x.trim()).filter(Boolean)));
  await fsp.writeFile(file, unique.join('\n') + (unique.length ? '\n' : ''), 'utf8');
  return unique;
}
async function hasInput(file: string) { return (await readLines(file)).length > 0; }
function resultObj(result: number, filePath: string) { return { result, run: true, filePath, date: new Date().toUTCString() }; }
function displayCommand(command: string, args: string[]) { return [command, ...args].map(x => /\s/.test(x) ? `"${x}"` : x).join(' '); }
function errorText(error: any) { return error?.message || String(error); }

function normalizeHost(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`).hostname; }
  catch { return raw.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]; }
}
function normalizeWaybackTarget(value: string) { return normalizeHost(value); }

async function runProcess(command: string, args: string[], opts: RunOptions = {}): Promise<ProcessResult> {
  const timeout = opts.timeout ?? 180000;
  const accepted = opts.acceptedCodes ?? [0];
  return new Promise((resolve, reject) => {
    const runtimeEnv = { ...process.env };
    // Go scanners honor XDG directories; keep runtime state writable and inside the project.
    if (process.platform !== 'win32') {
      runtimeEnv.XDG_CONFIG_HOME ||= path.join(ROOT, '.runtime', 'config');
      runtimeEnv.XDG_CACHE_HOME ||= path.join(ROOT, '.runtime', 'cache');
    }
    const child = spawn(command, args, { windowsHide: true, cwd: opts.cwd ?? ROOT, shell: false, env: runtimeEnv, detached: process.platform !== 'win32' });
    let stdout = ''; let stderr = ''; let timedOut = false; let settled = false;
    const finishReject = (err: Error) => { if (settled) return; settled = true; reject(err); };
    const finishResolve = (value: ProcessResult) => { if (settled) return; settled = true; resolve(value); };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {}
      if (process.platform === 'win32' && child.pid) {
        try {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          killer.unref();
        } catch {}
      }
      // Do not wait for a stubborn child process to emit `close`. The caller must regain control at the configured deadline.
      finishReject(Object.assign(new Error(`Timed out after ${Math.round(timeout / 1000)}s: ${displayCommand(command, args)}`), { stdout, stderr, timedOut: true, command: displayCommand(command, args) }));
    }, timeout);
    child.stdout?.on('data', d => { stdout += String(d); if (stdout.length > 150 * 1024 * 1024) stdout = stdout.slice(-150 * 1024 * 1024); });
    child.stderr?.on('data', d => { stderr += String(d); if (stderr.length > 20 * 1024 * 1024) stderr = stderr.slice(-20 * 1024 * 1024); });
    child.on('error', err => { clearTimeout(timer); finishReject(new Error(`${displayCommand(command, args)}: ${err.message}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      const c = code ?? -1;
      if (!accepted.includes(c)) return finishReject(Object.assign(new Error(`Exited with code ${c}: ${displayCommand(command, args)}${stderr.trim() ? `\n${stderr.trim()}` : ''}`), { stdout, stderr, code: c }));
      finishResolve({ code: c, stdout, stderr, command: displayCommand(command, args) });
    });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(opts.input ?? '');
  });
}
async function saveToolLog(dir: string, key: string, data: string) {
  if (!data.trim()) return;
  const logs = path.join(dir, 'logs');
  await fsp.mkdir(logs, { recursive: true });
  await fsp.writeFile(path.join(logs, `${key}.log`), data, 'utf8');
}

export function listProjects() {
  return fs.readdirSync(PROJECT_DIR, { withFileTypes: true })
    .filter(x => x.isDirectory() && fs.existsSync(path.join(PROJECT_DIR, x.name, 'details.json')))
    .map(x => x.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function createProject(projectName: string, domain: string) {
  safeProjectName(projectName);
  const target = parseTarget(domain);
  const host = target.domain;
  const dir = projectPath(projectName);
  if (fs.existsSync(dir)) throw new Error('Project already exists');
  await fsp.mkdir(path.join(dir, 'logs'), { recursive: true });
  const now = new Date().toISOString();
  await fsp.writeFile(path.join(dir, 'details.json'), JSON.stringify({ name: projectName, domain: host, targetUrl: target.targetUrl, explicitScheme: target.explicitScheme, createdAt: now, updatedAt: now }, null, 2));
  await fsp.access(path.join(dir, 'details.json'));
  // Project creation must be immediate; target metadata is loaded by the Dashboard on demand.
  return { error: false, projectDir: dir };
}
export async function getDetails(name: string) {
  const d = await readJson(path.join(projectPath(name), 'details.json'));
  if (!d) throw new Error('Project not found');
  return d;
}

export async function subFinder(domain: string, dir: string): Promise<RunResult> {
  try {
    const target = normalizeHost(domain);
    if (target === 'localhost' || /^127\./.test(target) || /^\d+\.\d+\.\d+\.\d+$/.test(target) || target.includes(':')) {
      const out = path.join(dir, 'recon_subdomins.txt');
      await writeLines(out, []);
      await updateDetails(dir, { subfinder: { ...resultObj(0, out), skipped: true } });
      return { success: true, error: null, result: 0, outputFile: out, message: 'Subfinder skipped: IP/localhost targets do not have DNS subdomains.' };
    }
    if (!target) throw new Error('Invalid target domain');
    const out = path.join(dir, 'recon_subdomins.txt');
    const p = await runProcess(toolPath('subfinder'), ['-silent', '-d', target], { timeout: 120000 });
    const lines = await writeLines(out, p.stdout.split(/\r?\n/));
    await saveToolLog(dir, 'subfinder', p.stderr);
    await updateDetails(dir, { subfinder: resultObj(lines.length, out) });
    return { message: `Subfinder completed: ${lines.length} unique subdomain(s).`, success: true, error: null, result: lines.length, outputFile: out, stderr: p.stderr, command: p.command };
  } catch (error) { return { message: 'Subfinder failed', success: false, error: errorText(error) }; }
}

type ProbeEvidence = {
  host: string;
  live: boolean;
  url?: string;
  status?: number;
  source: 'httpx' | 'fallback';
  error?: string;
};

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false });

function findSystemBrowser(): string | null {
  const configured = process.env.HUNTERKIT_BROWSER;
  if (configured && fs.existsSync(configured)) return configured;
  const candidates = process.platform === 'win32'
    ? [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

async function captureWithSystemBrowser(dir: string, urls: string[]): Promise<{ count: number; errors: string[]; browser: string }> {
  const browserPath = findSystemBrowser();
  if (!browserPath) return { count: 0, errors: ['Install Chrome/Edge/Chromium or set HUNTERKIT_BROWSER to its executable path.'], browser: '' };
  const screenshotDir = path.join(dir, 'screenshot');
  await fsp.mkdir(screenshotDir, { recursive: true });
  const browserEnv = { ...process.env };
  if (process.platform !== 'win32') {
    browserEnv.XDG_CONFIG_HOME ||= path.join(ROOT, '.runtime', 'config');
    browserEnv.XDG_CACHE_HOME ||= path.join(ROOT, '.runtime', 'cache');
  }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, chromiumSandbox: true, timeout: 15000, env: browserEnv });
  const targets = Array.from(new Set(urls)).slice(0, 20);
  const errors: string[] = [];
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= targets.length) return;
      const url = targets[i];
      const host = normalizeHost(url).replace(/[^A-Za-z0-9._-]+/g, '_') || 'target';
      const out = path.join(screenshotDir, `${String(i + 1).padStart(2, '0')}-${host}.png`);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.screenshot({ path: out, timeout: 15000 });
      } catch (e) { errors.push(`${url}: ${errorText(e)}`); }
      finally { await context.close().catch(() => undefined); }
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(4, targets.length || 1) }, () => worker())); }
  finally { await browser.close(); }
  return { count: (await screenshotFiles(dir)).length, errors, browser: browserPath };
}

async function probeOneHost(host: string): Promise<ProbeEvidence> {
  const clean = normalizeHost(host);
  if (!clean) return { host, live: false, source: 'fallback', error: 'Invalid host' };
  const candidates = /^https?:\/\//i.test(host) ? [host] : [`http://${String(host).trim()}`, `https://${String(host).trim()}`];
  let lastError = '';
  for (const candidate of candidates) {
    try {
      const r: any = await axios.get(candidate, {
        timeout: 6000,
        maxRedirects: 6,
        validateStatus: () => true,
        responseType: 'stream',
        headers: browserHeaders,
        httpsAgent: insecureHttpsAgent,
      });
      try { r?.data?.destroy?.(); } catch {}
      const finalUrl = r?.request?.res?.responseUrl || r?.request?._redirectable?._currentUrl || candidate;
      const status = Number(r?.status || 0);
      if (status > 0 && status < 600) return { host: clean, live: true, url: String(finalUrl), status, source: 'fallback' };
    } catch (e: any) {
      lastError = e?.code ? `${e.code}: ${e.message || ''}`.trim() : errorText(e);
    }
  }
  return { host: clean, live: false, source: 'fallback', error: lastError || 'No HTTP/S response' };
}

async function fallbackHttpProbe(hosts: string[]): Promise<ProbeEvidence[]> {
  const unique = Array.from(new Set(hosts.map(x => x.trim()).filter(Boolean)));
  const results: ProbeEvidence[] = [];
  const concurrency = 6;
  let index = 0;
  async function worker() {
    while (true) {
      const i = index++;
      if (i >= unique.length) return;
      results[i] = await probeOneHost(unique[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, () => worker()));
  return results.filter(Boolean);
}

async function candidateHosts(dir: string, maxHosts = 120): Promise<string[]> {
  const details = await readJson(path.join(dir, 'details.json'));
  let hosts = await readLines(path.join(dir, 'recon_subdomins.txt'));
  const root = normalizeHost(details?.domain || '');
  if (root) hosts.unshift(root);
  return Array.from(new Set(hosts.map(normalizeHost).filter(Boolean))).slice(0, maxHosts);
}

async function scannerHttpCandidates(dir: string, maxTargets: number): Promise<{ targets: string[]; verified: number }> {
  const details = await readJson(path.join(dir, 'details.json'));
  const seeds = targetSeeds(details);
  const cached = scopedUrls(await readLines(path.join(dir, 'httpx_live_domains.txt')), details);
  // Preserve the exact user-supplied URL first, even if Recon cached only an origin.
  const targets = [...seeds, ...cached];
  if (!details?.explicitScheme) {
    for (const host of await candidateHosts(dir, maxTargets)) targets.push(`http://${host}`, `https://${host}`);
  }
  return { targets: scopedUrls(targets, details).slice(0, maxTargets), verified: cached.length };
}

function extractUrlsFromHtml(html: string, base: string): string[] {
  const $ = load(html);
  const values: string[] = [];
  $('a[href], script[src], link[href], iframe[src]').each((_i, el) => {
    try { values.push(new URL($(el).attr('href') || $(el).attr('src')!, base).toString()); } catch {}
  });
  // Convert GET forms to real parameterized URLs. POST/authenticated workflows require explicit inputs.
  $('form').each((_i, el) => {
    const form = $(el);
    if ((form.attr('method') || 'get').toLowerCase() !== 'get') return;
    try {
      const url = new URL(form.attr('action') || base, base);
      form.find('input[name], select[name], textarea[name]').each((_j, input) => {
        const field = $(input), type = (field.attr('type') || '').toLowerCase();
        if (field.is('[disabled]') || ['submit', 'button', 'reset', 'file', 'password'].includes(type)) return;
        if (['checkbox', 'radio'].includes(type) && !field.is('[checked]')) return;
        const val = field.val();
        url.searchParams.append(field.attr('name')!, String(Array.isArray(val) ? val[0] : val || 'test'));
      });
      values.push(url.toString());
    } catch {}
  });
  return values;
}

async function currentUrlInventory(dir: string): Promise<{ urls: string[]; errors: string[] }> {
  const details = await readJson(path.join(dir, 'details.json'));
  const scan = await scannerHttpCandidates(dir, 16);
  const seeds = scan.targets.slice(0, 8);
  const queue = [...seeds];
  const seen = new Set<string>();
  const urls = new Set<string>(seeds);
  const errors: string[] = [];
  while (queue.length && seen.size < 12) {
    const target = queue.shift()!;
    if (seen.has(target) || !isScopedUrl(target, details)) continue;
    seen.add(target);
    try {
      const r: any = await axios.get(target, {
        timeout: 7000, maxRedirects: 5, validateStatus: () => true, responseType: 'text',
        headers: browserHeaders, httpsAgent: insecureHttpsAgent, maxContentLength: 3 * 1024 * 1024,
        // Reject redirects outside the project before sending a follow-up request.
        beforeRedirect: (options: any) => {
          const next = `${options.protocol}//${options.hostname}${options.port ? ':' + options.port : ''}${options.path}`;
          if (!isScopedUrl(next, details)) throw new Error('Redirect leaves project scope');
        },
      });
      const finalUrl = String(r?.request?.res?.responseUrl || r?.request?._redirectable?._currentUrl || target);
      if (!isScopedUrl(finalUrl, details)) continue;
      urls.add(finalUrl);
      const contentType = String(r?.headers?.['content-type'] || '');
      if (/html|javascript|text\//i.test(contentType) && typeof r.data === 'string') {
        for (const found of scopedUrls(extractUrlsFromHtml(r.data, finalUrl), details)) {
          urls.add(found);
          if (!seen.has(found) && queue.length < 20 && seen.size + queue.length < 12) queue.push(found);
        }
      }
    } catch (e) { errors.push(`${target}: ${errorText(e)}`); }
  }
  const out = scopedUrls(Array.from(urls), details);
  await writeLines(path.join(dir, 'current_url_inventory.txt'), out);
  await fsp.writeFile(path.join(dir, 'current_url_inventory_status.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), seeds, urls: out.length, errors,
  }, null, 2), 'utf8');
  return { urls: out, errors };
}

export async function liveSubDomains(dir: string): Promise<RunResult> {
  try {
    const details = await readJson(path.join(dir, 'details.json'));
    const input = path.join(dir, 'recon_subdomins.txt');
    const out = path.join(dir, 'httpx_live_domains.txt');
    const probeReport = path.join(dir, 'http_probe_details.json');
    let hosts = await readLines(input);
    hosts = [...targetSeeds(details), ...hosts.map(normalizeHost).filter(Boolean)];
    if (details?.explicitScheme) hosts = targetSeeds(details);
    hosts = Array.from(new Set(hosts));
    if (!hosts.length) throw new Error('No hosts are available for HTTP probing.');

    const tmp = path.join(dir, '.httpx-input.txt');
    await writeLines(tmp, hosts);
    // Never mix a fresh probe with stale live-target output from an earlier run.
    await fsp.rm(out, { force: true }).catch(() => undefined);

    // Run the browser-like reachability probe in parallel with HTTPX. Some real sites answer browsers
    // but stall or block automated HTTPX requests; this keeps Recon bounded and avoids false negatives.
    const fallbackPromise = fallbackHttpProbe(hosts);
    let httpxStdout = '';
    let httpxStderr = '';
    let httpxCommand = '';
    let httpxError = '';
    try {
      // Use an output file as the original Hunter Kit did. Keep the external process tightly bounded.
      const p = await runProcess(toolPath('httpx'), ['-silent', '-duc', '-timeout', '8', '-retries', '1', '-l', tmp, '-o', out], { timeout: 30000 });
      httpxStdout = p.stdout;
      httpxStderr = p.stderr;
      httpxCommand = p.command;
    } catch (e: any) {
      httpxError = errorText(e);
      httpxStderr = e?.stderr || '';
    }

    const fromFile = await readLines(out);
    const fromStdout = httpxStdout.split(/\r?\n/).map(x => x.trim()).filter(x => /^https?:\/\//i.test(x));
    const httpxUrls = Array.from(new Set([...fromFile, ...fromStdout].filter(x => /^https?:\/\//i.test(x))));
    const liveHosts = new Set(httpxUrls.map(normalizeHost).filter(Boolean));

    const fallbackAll = await fallbackPromise;
    const fallbackEvidence = fallbackAll.filter(x => !liveHosts.has(normalizeHost(x.host)));
    const fallbackUrls = fallbackEvidence.filter(x => x.live && x.url).map(x => x.url as string);
    const urls = await writeLines(out, scopedUrls([...httpxUrls, ...fallbackUrls], details));

    const evidence: ProbeEvidence[] = [
      ...httpxUrls.map(url => ({ host: normalizeHost(url), live: true, url, source: 'httpx' as const })),
      ...fallbackEvidence,
    ];
    await fsp.writeFile(probeReport, JSON.stringify({
      generatedAt: new Date().toISOString(),
      candidates: hosts,
      httpx: { command: httpxCommand, error: httpxError || null, resultCount: httpxUrls.length },
      fallbackCount: fallbackEvidence.length,
      liveCount: urls.length,
      evidence,
    }, null, 2), 'utf8');
    await saveToolLog(dir, 'httpx', [httpxStderr, httpxError].filter(Boolean).join('\n'));
    await updateDetails(dir, { liveDomains: resultObj(urls.length, out) });

    const fallbackLiveCount = fallbackEvidence.filter(x => x.live).length;
    const message = urls.length
      ? `Live-host probing completed: ${urls.length}/${hosts.length} host(s) responded over HTTP/S (${httpxUrls.length} via HTTPX${fallbackLiveCount ? `, ${fallbackLiveCount} via browser-like fallback` : ''}).`
      : `Live-host probing completed: 0/${hosts.length} hosts responded over HTTP/S. See logs/httpx.log and http_probe_details.json for exact connection evidence.`;
    return { message, success: true, error: null, result: urls.length, outputFile: out, stderr: [httpxStderr, httpxError].filter(Boolean).join('\n'), command: httpxCommand };
  } catch (error) { return { message: 'HTTP probing failed', success: false, error: errorText(error) }; }
}

async function ensureLiveTargets(dir: string): Promise<RunResult> {
  const live = path.join(dir, 'httpx_live_domains.txt');
  const existing = await readLines(live);
  if (existing.length) {
    return { message: `Using ${existing.length} cached live target(s) from Reconnaissance.`, success: true, error: null, result: existing.length, outputFile: live };
  }

  const details = await readJson(path.join(dir, 'details.json'));
  if (!details?.domain) return { message: 'Project target is missing.', success: false, error: 'Project details do not contain a target domain.' };

  // Active scanners must not spend minutes re-running HTTPX. Build a small candidate set from the
  // root target + any previously discovered subdomains and verify it directly with browser-like HTTP/S requests.
  const recon = path.join(dir, 'recon_subdomins.txt');
  let hosts = await readLines(recon);
  hosts = [...targetSeeds(details), ...hosts.map(normalizeHost).filter(Boolean)];
  if (details.explicitScheme) hosts = targetSeeds(details);
  hosts = Array.from(new Set(hosts));

  // Keep prerequisite preparation bounded even when passive discovery produced thousands of names.
  const candidates = hosts.slice(0, 120);
  const evidence = await fallbackHttpProbe(candidates);
  const urls = await writeLines(live, scopedUrls(evidence.filter(x => x.live && x.url).map(x => x.url as string), details));

  const report = path.join(dir, 'http_probe_details.json');
  const oldReport = (await readJson(report)) || {};
  await fsp.writeFile(report, JSON.stringify({
    ...oldReport,
    prerequisiteProbeAt: new Date().toISOString(),
    prerequisiteCandidates: candidates,
    prerequisiteLiveCount: urls.length,
    prerequisiteEvidence: evidence,
  }, null, 2), 'utf8');

  await updateDetails(dir, { liveDomains: resultObj(urls.length, live) });
  if (urls.length) {
    return {
      message: `Prepared ${urls.length} live HTTP/S target(s) for the active scanner without re-running HTTPX.`,
      success: true,
      error: null,
      result: urls.length,
      outputFile: live,
    };
  }

  return {
    message: 'No live HTTP/S targets are available for the active scanner.',
    success: false,
    error: 'The cached live-target inventory is empty and the bounded HTTP/S prerequisite probe could not confirm a reachable service. Run Reconnaissance and review http_probe_details.json for connection evidence.',
    result: 0,
    outputFile: live,
  };
}

async function screenshotFiles(root: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    let entries: fs.Dirent[] = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(png|jpe?g|webp)$/i.test(e.name)) files.push(full);
    }
  }
  await walk(root);
  return files;
}
async function ensureScreenshotGallery(shot: string) {
  const screenshotDir = path.join(shot, 'screenshot');
  await fsp.mkdir(screenshotDir, { recursive: true });
  const html = path.join(screenshotDir, 'screenshot.html');
  const files = await screenshotFiles(shot);
  const cards = files.map(file => {
    const rel = path.relative(screenshotDir, file).split(path.sep).join('/');
    const safe = rel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<figure><img src="${safe}" loading="lazy"><figcaption>${safe}</figcaption></figure>`;
  }).join('');
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>HunterKit Screenshots</title><style>body{font-family:system-ui;background:#0b1220;color:#e5e7eb;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}figure{margin:0;background:#111827;border:1px solid #334155;border-radius:12px;padding:12px}img{width:100%;height:auto;border-radius:8px;background:white}figcaption{font-size:12px;margin-top:8px;word-break:break-all;color:#94a3b8}.empty{padding:30px;border:1px dashed #475569;border-radius:12px}</style></head><body><h1>Visual Reconnaissance</h1>${cards ? `<main>${cards}</main>` : '<div class="empty">No screenshots were produced by HTTPX for this run.</div>'}</body></html>`;
  await fsp.writeFile(html, page, 'utf8');
}

export async function screenwin(dir: string): Promise<RunResult> {
  const shot = path.join(dir, 'httpx_screen');
  try {
    const prereq = await ensureLiveTargets(dir);
    if (!prereq.success) throw new Error(prereq.error || prereq.message);
    const input = path.join(dir, 'httpx_live_domains.txt');
    const urls = await readLines(input);

    await fsp.rm(shot, { recursive: true, force: true }).catch(() => undefined);
    await fsp.mkdir(shot, { recursive: true });

    // Prefer an installed Chrome/Edge browser. It is faster to diagnose and avoids HTTPX's managed
    // browser download path, which can be blocked by endpoint-protection software on Windows.
    const direct = await captureWithSystemBrowser(shot, urls);
    let command = direct.browser ? `${direct.browser} --headless=new ...` : '';
    let stderr = direct.errors.join('\n');

    if (!direct.count) throw new Error(`Visual Recon could not capture any page. ${direct.errors.join(' | ')}`);

    await saveToolLog(dir, 'visual-recon', stderr);
    const idx = path.join(shot, 'screenshot', 'index_screenshot.txt');
    let n = await countLines(idx);
    const imageFiles = await screenshotFiles(shot);
    if (!n) n = imageFiles.length;
    await ensureScreenshotGallery(shot);
    if (!n) throw new Error('No screenshots were created. Check browser availability and logs/visual-recon.log.');
    await fsp.writeFile(path.join(shot, 'visual_recon.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      inputCount: urls.length,
      captureCount: n,
      systemBrowser: direct.browser || null,
      directCaptureErrors: direct.errors,
    }, null, 2), 'utf8');
    await updateDetails(dir, { screens: { ...resultObj(n, shot), partial: n < Math.min(urls.length, 20), completed: n >= Math.min(urls.length, 20) } });
    return { message: `Screenshot capture completed: ${n}/${Math.min(urls.length, 20)} capture(s).${stderr ? ' Some captures failed; review the visual-recon log.' : ''}`, success: true, error: null, result: n, outputFile: shot, stderr, command };
  } catch (error) {
    const msg = errorText(error);
    await saveToolLog(dir, 'visual-recon-error', msg).catch(() => undefined);
    await fsp.mkdir(shot, { recursive: true }).catch(() => undefined);
    await ensureScreenshotGallery(shot).catch(() => undefined);
    return { message: 'Screenshot capture failed', success: false, error: msg, outputFile: shot };
  }
}

async function waybackCdxFallback(targets: string[]): Promise<{ urls: string[]; errors: string[] }> {
  const selected = Array.from(new Set(targets)).slice(0, 10);
  const perTarget: Array<{ urls: string[]; error?: string }> = new Array(selected.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= selected.length) return;
      const target = selected[i];
      try {
        const r = await axios.get('https://web.archive.org/cdx/search/cdx', {
          timeout: 18000,
          params: {
            url: `${target}/*`,
            output: 'json',
            fl: 'original',
            collapse: 'urlkey',
            filter: 'statuscode:200',
            limit: 5000,
          },
          headers: browserHeaders,
          validateStatus: (status) => status >= 200 && status < 500,
        });
        if (r.status >= 400) {
          perTarget[i] = { urls: [], error: `${target}: Wayback CDX returned HTTP ${r.status}` };
          continue;
        }
        const rows = Array.isArray(r.data) ? r.data : [];
        const urls: string[] = [];
        for (const row of rows.slice(1)) {
          const value = Array.isArray(row) ? row[0] : row;
          if (typeof value === 'string' && /^https?:\/\//i.test(value)) urls.push(value);
        }
        perTarget[i] = { urls };
      } catch (e) {
        perTarget[i] = { urls: [], error: `${target}: ${errorText(e)}` };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, selected.length || 1) }, () => worker()));
  return {
    urls: Array.from(new Set(perTarget.flatMap(x => x?.urls || []))),
    errors: perTarget.flatMap(x => x?.error ? [x.error] : []),
  };
}

async function commonCrawlFallback(targets: string[]): Promise<{ urls: string[]; errors: string[] }> {
  const selected = Array.from(new Set(targets)).slice(0, 8);
  const urls = new Set<string>();
  const errors: string[] = [];
  let api = '';
  try {
    const indexResp: any = await axios.get('https://index.commoncrawl.org/collinfo.json', { timeout: 12000, headers: browserHeaders });
    const first = Array.isArray(indexResp.data) ? indexResp.data[0] : null;
    api = String(first?.['cdx-api'] || first?.cdxApi || '');
    if (!api) throw new Error('Common Crawl did not return a CDX endpoint.');
  } catch (e) {
    return { urls: [], errors: [`Common Crawl index: ${errorText(e)}`] };
  }

  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= selected.length) return;
      const target = selected[i];
      try {
        const r: any = await axios.get(api, {
          timeout: 18000,
          params: { url: `${target}/*`, output: 'json', filter: 'status:200', collapse: 'urlkey' },
          headers: browserHeaders,
          responseType: 'text',
          validateStatus: (status) => status >= 200 && status < 500,
        });
        if (r.status >= 400) { errors.push(`${target}: Common Crawl returned HTTP ${r.status}`); continue; }
        const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || '');
        for (const line of raw.split(/\r?\n/)) {
          if (!line.trim()) continue;
          try {
            const row = JSON.parse(line);
            const value = row.url || row.original;
            if (typeof value === 'string' && /^https?:\/\//i.test(value)) urls.add(value);
          } catch {}
        }
      } catch (e) {
        errors.push(`${target}: ${errorText(e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, selected.length || 1) }, () => worker()));
  return { urls: Array.from(urls), errors };
}

export async function wayback(dir: string): Promise<RunResult> {
  try {
    const details = await readJson(path.join(dir, 'details.json'));
    const live = path.join(dir, 'httpx_live_domains.txt');
    const out = path.join(dir, 'waybackurls_archive.txt');
    let targets = await readLines(live);
    if (details?.domain) targets.unshift(details.domain);
    targets = Array.from(new Set(targets.map(normalizeWaybackTarget).filter(Boolean))).slice(0, 40);
    if (!targets.length) throw new Error('No project target is available.');

    const localTarget = targets.every(host => host === 'localhost' || /^127\./.test(host) || host === '[::1]' || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
    if (localTarget) {
      await writeLines(out, []);
      await updateDetails(dir, { archive: { ...resultObj(0, out), source: 'local-target-no-public-archive' } });
      return { success: true, error: null, result: 0, outputFile: out, message: 'Local/private target: public archives skipped. Current-site discovery is used for JS and parameters.' };
    }
    // waybackurls officially accepts line-delimited domains on STDIN. Older HunterKit Web builds
    // passed each domain as a positional argument, which can produce help text / zero output.
    let toolUrls: string[] = [];
    let toolError = '';
    let command = '';
    try {
      const p = await runProcess(toolPath('waybackurls'), [], {
        timeout: 60000,
        input: targets.join('\n') + '\n',
        acceptedCodes: [0],
      });
      command = `${p.command} < ${targets.length} domain(s) via stdin`;
      toolError = p.stderr.trim();
      toolUrls = p.stdout.split(/\r?\n/).map(x => x.trim()).filter(x => /^https?:\/\//i.test(x));
    } catch (e) {
      toolError = errorText(e);
    }

    // Query more than one passive history source. A local ISP, CDN, or archive service can block one
    // provider while another still works. This is deliberately passive and does not depend on live HTTP probes.
    const cdx = await waybackCdxFallback(targets);
    const common = await commonCrawlFallback(targets);
    const fallbackUrls = [...cdx.urls, ...common.urls];
    const fallbackErrors = [...cdx.errors, ...common.errors];

    const all = await writeLines(out, [...toolUrls, ...fallbackUrls]);
    const log = [toolError, ...fallbackErrors].filter(Boolean).join('\n');
    await saveToolLog(dir, 'waybackurls', log);
    await fsp.writeFile(path.join(dir, 'wayback_status.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      inputDomains: targets,
      source: toolUrls.length ? 'multi-source' : fallbackUrls.length ? 'passive-fallback' : 'none',
      waybackurlsCount: toolUrls.length,
      cdxFallbackCount: cdx.urls.length,
      commonCrawlCount: common.urls.length,
      total: all.length,
      command: command || null,
      errors: [toolError, ...fallbackErrors].filter(Boolean),
    }, null, 2), 'utf8');
    await updateDetails(dir, { archive: { ...resultObj(all.length, out), source: toolUrls.length ? 'multi-source' : fallbackUrls.length ? 'passive-fallback' : 'none' } });

    if (all.length) {
      return {
        message: `Archive collection completed: ${all.length} unique URL(s) from ${targets.length} domain(s)${toolUrls.length ? ' using waybackurls + passive archive sources' : ' using passive archive fallbacks'}.`,
        success: true,
        error: null,
        result: all.length,
        outputFile: out,
        stderr: log,
        command,
      };
    }

    // Zero archived URLs is valid: some domains simply have no public archive history.
    return {
      message: `Archive collection completed with 0 URLs for ${targets.length} domain(s). This is not a tool crash; Wayback returned no public archive data.`,
      success: true,
      error: null,
      result: 0,
      outputFile: out,
      stderr: log,
      command,
    };
  } catch (error) {
    const msg = errorText(error);
    await saveToolLog(dir, 'waybackurls-error', msg).catch(() => undefined);
    return { message: 'Wayback archive collection failed', success: false, error: msg };
  }
}

async function ensureArchive(dir: string) {
  const archive = path.join(dir, 'waybackurls_archive.txt');
  if (fs.existsSync(archive)) return { message: 'Archive already available.', success: true, error: null, result: (await readLines(archive)).length, outputFile: archive } as RunResult;
  return wayback(dir);
}

async function filterArchive(dir: string, key: string, file: string, pred: (s: string) => boolean) {
  try {
    const prereq = await ensureArchive(dir);
    const input = path.join(dir, 'waybackurls_archive.txt');
    const out = path.join(dir, file);
    const details = await readJson(path.join(dir, 'details.json'));
    const historical = await readLines(input);
    const current = await currentUrlInventory(dir);
    const all = scopedUrls([...targetSeeds(details), ...current.urls, ...historical], details);
    const source = 'current-site+archive';
    const lines = await writeLines(out, all.filter(pred));
    await updateDetails(dir, { [key]: { ...resultObj(lines.length, out), source } });
    return {
      message: `Completed: ${lines.length} result(s) from scoped current-site and archive inventory.`,
      success: true,
      error: null,
      result: lines.length,
      outputFile: out,
    };
  } catch (error) { return { message: 'Filtering URL inventory failed', success: false, error: errorText(error) }; }
}
export const fetchJs = (d: string) => filterArchive(d, 'js', 'waybackurls_js.txt', x => /\.js(?:[?#]|$)/i.test(x));
export const parameter = (d: string) => filterArchive(d, 'params', 'waybackurls_parameter.txt', x => { try { return new URL(x).search.length > 1; } catch { return x.includes('='); } });

function parseJsonLines(raw: string) {
  return raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
}
function nucleiSummaryLine(r: any) {
  const id = r['template-id'] || r.templateID || r.templateId || 'unknown-template';
  const sev = r?.info?.severity || 'info';
  const name = r?.info?.name || id;
  const target = r['matched-at'] || r.url || r.host || r.input || '';
  return `[${sev}] [${id}] ${name}${target ? ` - ${target}` : ''}`;
}

function isNucleiFinding(row: any) {
  return Boolean(row && (row['template-id'] || row.templateID || row.templateId) && row.info && (row['matched-at'] || row.url || row.host || row.input));
}
export function parseNucleiReport(raw: string): any[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter(isNucleiFinding);
    if (parsed && typeof parsed === 'object') return isNucleiFinding(parsed) ? [parsed] : [];
  } catch { /* JSONL below */ }
  return parseJsonLines(trimmed).filter(isNucleiFinding);
}

type NucleiAttackSpec = {
  key: string;
  file: string;
  label: string;
  templateDirs?: string[];
  fallbackTags?: string[];
  automatic?: boolean;
  severity?: string;
  budgetMs: number;
  maxTargets: number;
  input: 'live' | 'params' | 'hosts';
  dast?: boolean;
};

function nucleiTemplatesRoot() {
  const configured = process.env.HUNTERKIT_TEMPLATES;
  if (configured) return path.resolve(ROOT, configured);
  const local = path.join(ROOT, '.tools', 'nuclei-templates');
  return fs.existsSync(local) ? local : path.join(os.homedir(), 'nuclei-templates');
}

function existingTemplatePaths(relPaths: string[] = []) {
  const root = nucleiTemplatesRoot();
  return relPaths.map(rel => path.join(root, rel)).filter(candidate => fs.existsSync(candidate));
}

function ensureNucleiTemplatesInstalled() {
  const root = nucleiTemplatesRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`Nuclei templates are missing at ${root}. Run INSTALL-TOOLS.cmd or: nuclei -update-templates`);
  }
  const entries = fs.readdirSync(root);
  if (!entries.length) {
    throw new Error(`Nuclei templates directory is empty: ${root}. Run: nuclei -update-templates`);
  }
  return root;
}

async function prepareAttackInput(dir: string, spec: NucleiAttackSpec) {
  if (spec.input === 'hosts') {
    const prepared = await scannerHttpCandidates(dir, spec.maxTargets);
    if (!prepared.targets.length) throw new Error('No in-scope web targets are available.');
    const out = path.join(dir, `.nuclei-${spec.key}-input.txt`);
    await writeLines(out, prepared.targets);
    return { file: out, targets: prepared.targets, verifiedTargets: prepared.verified };
  }

  if (spec.input === 'params') {
    const paramFile = path.join(dir, 'waybackurls_parameter.txt');
    if (!(await hasInput(paramFile))) await parameter(dir);
    const details = await readJson(path.join(dir, 'details.json'));
    const params = scopedUrls([...targetSeeds(details), ...await readLines(paramFile)], details).filter(x => new URL(x).search.length > 1).slice(0, spec.maxTargets);
    if (!params.length) throw Object.assign(new Error(`${spec.label} needs parameterized URLs. No active test was sent. Refresh Parameters or supply an explicit target URL containing a query string.`), { skipped: true });
    const out = path.join(dir, `.nuclei-${spec.key}-input.txt`);
    await writeLines(out, params);
    return { file: out, targets: params };
  }

  const prepared = await scannerHttpCandidates(dir, spec.maxTargets);
  if (!prepared.targets.length) throw new Error(`No HTTP/S candidates are available for ${spec.label}.`);
  const out = path.join(dir, `.nuclei-${spec.key}-input.txt`);
  await writeLines(out, prepared.targets);
  return { file: out, targets: prepared.targets, verifiedTargets: prepared.verified };
}

function scanSpecLabel(spec: NucleiAttackSpec, templatePaths: string[]) {
  if (spec.automatic) return 'technology-aware automatic scan';
  if (templatePaths.length) return templatePaths.map(x => path.relative(nucleiTemplatesRoot(), x).replace(/\\/g, '/')).join(', ');
  if (spec.fallbackTags?.length) return `tags: ${spec.fallbackTags.join(',')}`;
  return 'selected Nuclei templates';
}

async function nucleiAttack(dir: string, spec: NucleiAttackSpec) {
  const txt = path.join(dir, spec.file);
  const json = txt.replace(/\.txt$/i, '.json');
  const statusFile = path.join(dir, `${spec.key}-scan-status.json`);
  const startedAt = Date.now();
  const logs = path.join(dir, 'logs');
  const rawOutput = path.join(logs, `${spec.key}-nuclei.raw.jsonl`);
  try {
    await fsp.mkdir(logs, { recursive: true });
    await fsp.writeFile(rawOutput, '');
    await fsp.writeFile(json, '');
    await writeLines(txt, []);
    await updateDetails(dir, { [spec.key]: { ...resultObj(0, txt), running: true, completed: false } });
    const root = ensureNucleiTemplatesInstalled();
    const prepared = await prepareAttackInput(dir, spec);
    const templatePaths = existingTemplatePaths(spec.templateDirs);
    if (spec.templateDirs?.length && !templatePaths.length) {
      throw new Error(`No templates for ${spec.label} at ${root}. Run npm run setup:templates.`);
    }
    const args = [
      '-l', prepared.file, '-jsonl', '-o', rawOutput, '-nc', '-duc', '-ni',
      '-ud', root, '-pt', 'http', '-exclude-tags', 'dos,fuzz,bruteforce',
      '-timeout', '8', '-retries', '0', '-mhe', '30', '-c', '8', '-bs', '8', '-rl', '40',
      '-stats-json', '-si', '5', '-elog', path.join(logs, `${spec.key}-nuclei-errors.log`),
    ];
    if (spec.severity) args.push('-severity', spec.severity);
    if (spec.automatic) args.push('-as');
    for (const t of templatePaths) args.push('-t', t);
    if (!templatePaths.length && spec.fallbackTags?.length) args.push('-tags', spec.fallbackTags.join(','));
    if (spec.dast) args.push('-dast', '-fa', 'low');

    const configuredBudget = Number(process.env.HUNTERKIT_SCAN_TIMEOUT_MS || spec.budgetMs);
    if (!Number.isFinite(configuredBudget) || configuredBudget < 1000 || configuredBudget > 600000) {
      throw new Error('HUNTERKIT_SCAN_TIMEOUT_MS must be between 1000 and 600000 milliseconds.');
    }
    const budgetMs = configuredBudget;
    let proc: ProcessResult;
    let partial = false;
    let timeoutMessage = '';
    try { proc = await runProcess(toolPath('nuclei'), args, { timeout: budgetMs }); }
    catch (e: any) {
      if (!e.timedOut) throw e;
      partial = true; timeoutMessage = errorText(e);
      proc = { code: -1, stdout: e.stdout || '', stderr: e.stderr || '', command: e.command || displayCommand(toolPath('nuclei'), args) };
    }
    const combinedLog = [proc.stdout, proc.stderr, timeoutMessage].filter(Boolean).join('\n');
    await saveToolLog(dir, `${spec.key}-nuclei`, combinedLog);
    if (/\[FTL\]|Could not run nuclei|no valid templates|no templates provided/i.test(combinedLog)) throw new Error(combinedLog.trim());
    const raw = await fsp.readFile(rawOutput, 'utf8');
    const rows = parseNucleiReport(raw || proc.stdout);
    if (raw.trim() && !rows.length) throw new Error('Nuclei wrote an unrecognized report. Review the raw JSONL report and scanner log.');
    const stats = parseJsonLines(combinedLog).filter(row => row.requests !== undefined && row.templates !== undefined).at(-1);
    const requests = stats ? Number(stats.requests) : undefined;
    const requestErrors = stats ? Number(stats.errors) : undefined;
    const loaded = stats ? Number(stats.templates) : Number(combinedLog.match(/Templates loaded for current scan: (\d+)/i)?.[1] || 0);
    if (!partial && !rows.length && (!loaded || requests === 0)) {
      throw new Error(`Nuclei executed no applicable requests (${loaded} template(s), ${requests ?? 'unknown'} requests). Check template selection, parameter inputs, and the scanner log.`);
    }
    if (!partial && !rows.length && requests && requestErrors! >= requests) {
      throw new Error(`All ${requests} Nuclei requests failed. Check the target URL, port, network and logs/${spec.key}-nuclei-errors.log.`);
    }
    // Even a normally exited engine can have failed requests. Keep coverage loss visible.
    if (requestErrors || requests === undefined) partial = true;
    await fsp.writeFile(json, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    await writeLines(txt, rows.map(nucleiSummaryLine));
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const selector = scanSpecLabel(spec, templatePaths);
    const meta = {
      ...resultObj(rows.length, txt), partial, running: false, targets: prepared.targets.length,
      selector, elapsedSeconds, completed: !partial, templates: loaded, requests, requestErrors,
      warning: partial ? timeoutMessage || 'Scanner request statistics show errors or are unavailable; coverage is incomplete.' : undefined,
    };
    await updateDetails(dir, { [spec.key]: meta });
    await fsp.writeFile(statusFile, JSON.stringify({
      ...meta, key: spec.key, label: spec.label, generatedAt: new Date().toISOString(), budgetMs,
      targetCount: prepared.targets.length, verifiedTargetCount: (prepared as any).verifiedTargets ?? prepared.targets.length,
      findings: rows.length, command: proc.command, inputFile: prepared.file, outputFile: json,
    }, null, 2));
    return {
      success: true, error: null, partial, result: rows.length, outputFile: txt, stderr: proc.stderr, command: proc.command,
      message: `${spec.label}: ${rows.length} scanner finding(s) from ${prepared.targets.length} selected target(s), ${loaded} template(s), ${requests ?? 'unknown'} request(s). ${partial ? 'PARTIAL: ' + (timeoutMessage || 'Some requests failed.') : 'Selected scan completed.'}`,
    };
  } catch (error: any) {
    const msg = errorText(error);
    await saveToolLog(dir, `${spec.key}-nuclei-error`, [msg, error?.stdout, error?.stderr].filter(Boolean).join('\n')).catch(() => undefined);
    const meta = { ...resultObj(0, txt), running: false, completed: false, failed: !error?.skipped, skipped: Boolean(error?.skipped), error: msg, elapsedSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)) };
    await updateDetails(dir, { [spec.key]: meta }).catch(() => undefined);
    await fsp.writeFile(statusFile, JSON.stringify(meta, null, 2)).catch(() => undefined);
    return { message: error?.skipped ? `${spec.label} SKIPPED` : `${spec.label} could not complete`, success: Boolean(error?.skipped), skipped: Boolean(error?.skipped), error: msg, outputFile: txt };
  }
}

const ATTACK_SPECS: Record<string, NucleiAttackSpec> = {
  general: {
    key: 'generalScanning', file: 'general_scanning.txt', label: 'General security scan',
    templateDirs: ['http/misconfiguration', 'http/exposures', 'http/exposed-panels'], budgetMs: 180000, maxTargets: 8, input: 'live',
  },
  panels: {
    key: 'exposedPanels', file: 'exposed_panels.txt', label: 'Exposed panels scan',
    templateDirs: ['http/exposed-panels'], fallbackTags: ['panel'], budgetMs: 180000, maxTargets: 10, input: 'live',
  },
  defaults: {
    key: 'defaultCredentials', file: 'default_credentials.txt', label: 'Default-login scan',
    templateDirs: ['http/default-logins'], fallbackTags: ['default-login'], severity: 'low,medium,high,critical', budgetMs: 180000, maxTargets: 5, input: 'live',
  },
  takeover: {
    key: 'subdomainTakeovers', file: 'subdomain_takeovers.txt', label: 'Subdomain takeover scan',
    templateDirs: ['http/takeovers'], fallbackTags: ['takeover'], budgetMs: 180000, maxTargets: 50, input: 'hosts',
  },
  exposure: {
    key: 'exposures', file: 'exposures.txt', label: 'Exposure scan',
    templateDirs: ['http/exposures'], fallbackTags: ['exposure'], budgetMs: 180000, maxTargets: 10, input: 'live',
  },
  cves: {
    key: 'scanningCVEs', file: 'CVEs.txt', label: 'Known vulnerabilities / CVE scan',
    templateDirs: ['http/cves'], fallbackTags: ['cve'], severity: 'medium,high,critical', budgetMs: 180000, maxTargets: 10, input: 'live',
  },
  lfi: {
    key: 'scanningForLFI', file: 'LFI.txt', label: 'LFI scan',
    templateDirs: ['dast/vulnerabilities/lfi'], fallbackTags: ['lfi'], severity: 'medium,high,critical', budgetMs: 180000, maxTargets: 10, input: 'params', dast: true,
  },
  sqli: {
    key: 'sqlInjection', file: 'SQLI.txt', label: 'SQL injection DAST scan',
    templateDirs: ['dast/vulnerabilities/sqli'], fallbackTags: ['sqli'], severity: 'medium,high,critical', budgetMs: 180000, maxTargets: 15, input: 'params', dast: true,
  },
};

export const generalScanning = (d: string) => exclusiveAttack(d, ATTACK_SPECS.general.key, () => nucleiAttack(d, ATTACK_SPECS.general));
export const exposedPanels = (d: string) => exclusiveAttack(d, ATTACK_SPECS.panels.key, () => nucleiAttack(d, ATTACK_SPECS.panels));
export const defaultCredentials = (d: string) => exclusiveAttack(d, ATTACK_SPECS.defaults.key, () => nucleiAttack(d, ATTACK_SPECS.defaults));
export const subdomainTakeovers = (d: string) => exclusiveAttack(d, ATTACK_SPECS.takeover.key, () => nucleiAttack(d, ATTACK_SPECS.takeover));
export const scanningForExposures = (d: string) => exclusiveAttack(d, ATTACK_SPECS.exposure.key, () => nucleiAttack(d, ATTACK_SPECS.exposure));
export const scanningCVEs = (d: string) => exclusiveAttack(d, ATTACK_SPECS.cves.key, () => nucleiAttack(d, ATTACK_SPECS.cves));
export const scanningForLFI = (d: string) => exclusiveAttack(d, ATTACK_SPECS.lfi.key, () => nucleiAttack(d, ATTACK_SPECS.lfi));
export const scanningForSQLi = (d: string) => exclusiveAttack(d, ATTACK_SPECS.sqli.key, () => nucleiAttack(d, ATTACK_SPECS.sqli));

export function parseDalfoxEnvelope(raw: string): { findings: any[]; observations: any[]; incomplete: boolean; meta?: any } {
  if (!raw.trim()) throw new Error('Dalfox produced no JSON report. Check the executable version and scanner log.');
  let objects: any[];
  try { const parsed = JSON.parse(raw); objects = Array.isArray(parsed) ? parsed : [parsed]; }
  catch { objects = parseJsonLines(raw); }
  if (!objects.length) throw new Error('Dalfox returned an invalid JSON report.');
  const envelope = objects.find(row => Array.isArray(row?.findings));
  const meta = objects.find(row => row?.meta)?.meta;
  const rows = objects.flatMap(row => Array.isArray(row?.findings) ? row.findings : row?.type ? [row] : []);
  if (!envelope && !rows.length && !(objects.length === 0)) throw new Error('Unrecognized Dalfox report schema.');
  // R (reflection), A (static AST) and I (information) are observations, not verified XSS.
  const findings = rows.filter(row => String(row?.type).toUpperCase() === 'V');
  return { findings, observations: rows.filter(row => String(row?.type).toUpperCase() !== 'V'), incomplete: Boolean(meta?.incomplete), meta };
}
function parseDalfoxReport(raw: string): any[] { return parseDalfoxEnvelope(raw).findings; }

async function dalfoxScan(dir: string, key: string, file: string) {
  const txt = path.join(dir, file), json = txt.replace(/\.txt$/i, '.json');
  const startedAt = Date.now();
  try {
    await writeLines(txt, []);
    await fsp.writeFile(json, '');
    await updateDetails(dir, { [key]: { ...resultObj(0, txt), running: true, completed: false } });
    const params = path.join(dir, 'waybackurls_parameter.txt');
    if (!(await hasInput(params))) await parameter(dir);
    const details = await readJson(path.join(dir, 'details.json'));
    const candidates = scopedUrls([...targetSeeds(details), ...await readLines(params)], details).filter(x => new URL(x).search.length > 1).slice(0, 25);
    if (!candidates.length) {
      const reason = 'No parameterized URLs were discovered. Supply a target URL with a query string or a page containing GET forms, then refresh Parameters.';
      await fsp.writeFile(json, JSON.stringify({ meta: { candidates: 0, skipped: true, reason }, findings: [] }, null, 2));
      await updateDetails(dir, { [key]: { ...resultObj(0, txt), running: false, skipped: true, candidates: 0, completed: false, warning: reason } });
      return { message: `XSS scan SKIPPED: ${reason}`, success: true, skipped: true, error: null, result: 0, outputFile: txt };
    }
    const version = await runProcess(toolPath('dalfox'), ['--version'], { timeout: 7000 });
    if (!/dalfox\s+(?:v)?3\./i.test(version.stdout + version.stderr)) throw new Error('HunterKit requires Dalfox v3. Run npm run download:tools to install the tested version.');
    const input = path.join(dir, '.dalfox-xss-input.txt');
    await writeLines(input, candidates);
    const args = [
      'scan', input, '--input-type', 'file', '-f', 'json', '-o', json,
      '--no-color', '--dedup-urls', 'signature', '--scan-timeout', '60', '--timeout', '8',
      '--rate-limit', '20', '--retries', '0', '--workers', '10', '--max-concurrent-targets', '3',
      '--skip-mining',
    ];
    let proc: ProcessResult;
    try { proc = await runProcess(toolPath('dalfox'), args, { timeout: 180000, acceptedCodes: [0, 1] }); }
    catch (error: any) {
      await saveToolLog(dir, `${key}-dalfox`, [error?.stdout, error?.stderr, errorText(error)].filter(Boolean).join('\n'));
      throw error;
    }
    await saveToolLog(dir, `${key}-dalfox`, [proc.stdout, proc.stderr].filter(Boolean).join('\n'));
    const report = parseDalfoxEnvelope((await fsp.readFile(json, 'utf8')) || proc.stdout);
    const partial = report.incomplete || Number(report.meta?.failed_requests || 0) > 0;
    if (!partial && !report.findings.length && Number(report.meta?.total_requests) === 0) throw new Error('Dalfox sent no requests. Review the input URLs and scanner log.');
    await writeLines(txt, report.findings.map(f => `[${f.severity || 'high'}] ${f.param || ''} ${f.evidence || f.message_str || ''}`.trim()));
    const meta = {
      ...resultObj(report.findings.length, txt), candidates: candidates.length, running: false,
      partial, completed: !partial, observations: report.observations.length,
      requests: report.meta?.total_requests, requestErrors: report.meta?.failed_requests,
      elapsedSeconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      warning: partial ? 'Dalfox reported incomplete coverage or failed requests. Review the raw report and log.' : undefined,
    };
    await updateDetails(dir, { [key]: meta });
    await fsp.writeFile(path.join(dir, `${key}-scan-status.json`), JSON.stringify({ ...meta, command: proc.command, inputFile: input }, null, 2));
    return { message: `XSS: ${report.findings.length} verified finding(s), ${report.observations.length} observation(s) from ${candidates.length} URL(s).${partial ? ' PARTIAL: coverage is incomplete.' : ''}`, success: true, partial, error: null, result: report.findings.length, outputFile: txt, command: proc.command };
  } catch (error: any) {
    const msg = errorText(error);
    await saveToolLog(dir, `${key}-dalfox-error`, msg).catch(() => undefined);
    const meta = { ...resultObj(0, txt), running: false, completed: false, failed: true, partial: Boolean(error?.timedOut), error: msg };
    await updateDetails(dir, { [key]: meta }).catch(() => undefined);
    await fsp.writeFile(path.join(dir, `${key}-scan-status.json`), JSON.stringify(meta, null, 2)).catch(() => undefined);
    return { message: 'Dalfox scan failed', success: false, error: msg, outputFile: txt };
  }
}
export async function scanningForXSS(dir: string) { return exclusiveAttack(dir, 'XSS', () => dalfoxScan(dir, 'XSS', 'XSS.txt')); }
export async function multiScans(dir: string) { return scanningForSQLi(dir); }

async function jsleakRun(dir: string, key: string, file: string, args: string[], filter?: (s: string) => boolean) {
  try {
    const details = await readJson(path.join(dir, 'details.json'));
    const prepared = await scannerHttpCandidates(dir, 40);
    const jsFile = path.join(dir, 'waybackurls_js.txt');
    if (!fs.existsSync(jsFile)) await fetchJs(dir);
    const lines = scopedUrls([...prepared.targets, ...await readLines(jsFile)], details);
    const maxTargets = Math.min(lines.length, 250);
    const selected = lines.slice(0, maxTargets);
    if (!selected.length) throw new Error('No URL candidates are available for JSLeak.');
    const output = path.join(dir, file);

    // The original Go jsleak supports many URLs from stdin and its own concurrency flag.
    // One bounded process is substantially faster and more reliable than spawning once per URL.
    const p = await runProcess(toolPath('jsleak'), [...args, '-c', '20'], {
      timeout: 180000,
      input: selected.join('\n') + (selected.length ? '\n' : ''),
      acceptedCodes: [0, 1],
    });
    const xs = p.stdout.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const values = key === 'extraLinks' ? scopedUrls(xs.flatMap(line => {
      const match = line.match(/Found link: \[([^\]]+)\] in \[([^\]]+)\]/);
      if (!match) return [];
      try { return [new URL(match[1], match[2]).toString()]; } catch { return []; }
    }), details) : xs.filter(line => /^\[\+\] Found \[/.test(line));
    const uniq = await writeLines(output, values);
    await saveToolLog(dir, `${key}-jsleak-stdout`, p.stdout);
    await saveToolLog(dir, `${key}-jsleak`, p.stderr);
    await updateDetails(dir, { [key]: resultObj(uniq.length, output) });
    const suffix = lines.length > maxTargets ? ` Processed the first ${maxTargets}/${lines.length} live targets to keep the job bounded.` : '';
    return { message: `JSLeak completed: ${uniq.length} result(s).${suffix}`, success: true, error: null, result: uniq.length, outputFile: output, stderr: p.stderr, command: p.command };
  } catch (error) {
    const msg = errorText(error);
    await writeLines(path.join(dir, file), []).catch(() => undefined);
    await saveToolLog(dir, `${key}-jsleak-error`, msg).catch(() => undefined);
    return { message: 'JSLeak failed', success: false, error: msg, outputFile: path.join(dir, file) };
  }
}
export const findSecret = (d: string) => jsleakRun(d, 'findSecrets', 'secrets.txt', ['-s']);
export const extraLinks = (d: string) => jsleakRun(d, 'extraLinks', 'extra_links.txt', ['-e']);

export async function runReconPipeline(dir: string): Promise<RunResult> {
  const details = await readJson(path.join(dir, 'details.json'));
  if (!details?.domain) return { message: 'Recon pipeline failed', success: false, error: 'Project target is missing.' };
  const stages: RunResult['stages'] = [];
  const sf = await subFinder(details.domain, dir);
  stages.push({ name: 'Subfinder', success: sf.success, result: sf.result, message: sf.message });
  const live = await liveSubDomains(dir);
  stages.push({ name: 'HTTPX', success: live.success, result: live.result, message: live.message });
  const wb = await wayback(dir);
  stages.push({ name: 'WaybackURLs', success: wb.success, result: wb.result, message: wb.message });
  const js = await fetchJs(dir);
  stages.push({ name: 'JS inventory', success: js.success, result: js.result, message: js.message });
  const params = await parameter(dir);
  stages.push({ name: 'Parameters', success: params.success, result: params.result, message: params.message });
  const hasLive = live.success && (live.result ?? 0) > 0;
  return {
    message: hasLive
      ? `Recon pipeline completed: ${sf.result ?? 0} subdomain(s), ${live.result ?? 0} live service(s), ${wb.result ?? 0} archived URL(s), ${js.result ?? 0} JS URL(s), ${params.result ?? 0} parameterized URL(s).`
      : `Recon pipeline completed with a connectivity warning: ${sf.result ?? 0} subdomain(s) discovered and ${wb.result ?? 0} archived URL(s) collected, but the preflight HTTP/S probe confirmed no live service. Attack modules can still test bounded HTTP/HTTPS candidates directly; results will identify them as unverified preflight targets.`,
    // Recon itself completed even when the current target is offline/unreachable. Downstream active tools still enforce live-target prerequisites.
    success: true,
    error: null,
    result: live.result ?? 0,
    stages,
  };
}

export async function getProjectScan(name: string) {
  const dir = projectPath(name);
  const cachedFile = path.join(dir, 'cf_scan.json');
  const cached = await readJson(cachedFile);
  if (cached?.scan) return cached;
  const details = await getDetails(name); const ips: any = {}; const tech: any[] = [];
  try {
    const p = await runProcess(toolPath('httpx'), ['-u', details.targetUrl || details.domain, '-silent', '-j', '-duc', '-timeout', '6', '-retries', '1', '-tech-detect', '-ip', '-status-code'], { timeout: 9000 });
    for (const line of p.stdout.split(/\r?\n/).filter(Boolean)) {
      try {
        const j = JSON.parse(line); const address = j.a || j.ip;
        if (address) { const vals = Array.isArray(address) ? address : [address]; for (const ip of vals) ips[ip] = { ipVersion: String(ip).includes(':') ? 'IPv6' : 'IPv4' }; }
        const names = j.tech || j.technologies || [];
        for (const t of names) { const n = typeof t === 'string' ? t : (t?.name || String(t)); if (!tech.some(x => x.name === n)) tech.push({ name: n, website: details.domain }); }
      } catch { /* ignore non-json line */ }
    }
  } catch { /* DNS fallback below */ }
  if (!Object.keys(ips).length) {
    try { for (const a of await dns.lookup(normalizeHost(details.domain), { all: true })) ips[a.address] = { ipVersion: `IPv${a.family}` }; } catch {}
  }
  const scan = { scan: { task: { status: 'Finished' }, meta: { processors: { tech } }, ips } };
  await fsp.writeFile(path.join(dir, 'cf_scan.json'), JSON.stringify(scan, null, 2));
  return scan;
}

const NUCLEI_RESULT_FILES = ['general_scanning.json', 'exposed_panels.json', 'default_credentials.json', 'subdomain_takeovers.json', 'exposures.json', 'CVEs.json', 'LFI.json', 'SQLI.json'];
export async function attackResults(name: string) {
  const dir = projectPath(name); const rows: any[] = []; const seen = new Set<string>();
  const details = await getDetails(name);
  const keys: Record<string, string> = Object.fromEntries(Object.values(ATTACK_SPECS).map(spec => [spec.file.replace(/\.txt$/, '.json'), spec.key]));
  for (const file of NUCLEI_RESULT_FILES) {
    const full = path.join(dir, file); if (!fs.existsSync(full)) continue;
    const raw = await fsp.readFile(full, 'utf8');
    for (const r of parseNucleiReport(raw)) {
      const id = r['template-id'] || r.templateID || r.templateId || 'unknown-template';
      const target = r['matched-at'] || r.url || r.host || r.input || 'unknown-target';
      const fingerprint = `${id}|${target}`;
      const source = { module: keys[file] || file, date: details[keys[file]]?.date || null };
      if (seen.has(fingerprint)) {
        rows.find(row => row['template-id'] === id && row.url === target)?.sources?.push(source);
        continue;
      }
      seen.add(fingerprint);
      rows.push({ ...r, sources: [source], 'template-id': id, info: { name: r?.info?.name || 'Nuclei finding', description: r?.info?.description || r?.info?.name || 'Scanner evidence returned by Nuclei.', severity: r?.info?.severity || 'info', ...r.info }, url: target });
    }
  }
  const xss = path.join(dir, 'XSS.json');
  if (fs.existsSync(xss)) {
    try {
      const findings = parseDalfoxReport(await fsp.readFile(xss, 'utf8'));
      for (const f of findings) {
        const target = f.data || f.target || 'XSS target'; const fp = `dalfox|${f.param || ''}|${target}`; if (seen.has(fp)) continue; seen.add(fp);
        rows.push({ sources: [{ module: 'XSS', date: details.XSS?.date || null }], 'template-id': 'dalfox-xss', info: { name: 'Dalfox XSS verification', description: f.evidence || f.message_str || 'Dalfox returned XSS evidence.', severity: String(f.severity || 'high').toLowerCase() }, url: target });
      }
    } catch {}
  }
  return rows;
}

export async function apiCall(name: string, location: string, type: string) {
  const base = projectPath(name); const full = path.resolve(base, location);
  if (!full.startsWith(base + path.sep) && full !== base) throw new Error('Invalid path');
  if (!fs.existsSync(full)) return { statusCode: 200, body: '', headers: { 'Content-Type': type }, exists: false };
  return { statusCode: 200, body: await fsp.readFile(full, 'utf8'), headers: { 'Content-Type': type }, exists: true };
}

export async function toolDiagnostics() {
  const checks: any[] = [];
  const specs: [string, string[]][] = [['subfinder', ['-version']], ['httpx', ['-version']], ['waybackurls', ['-h']], ['nuclei', ['-version']], ['dalfox', ['--version']], ['jsleak', ['-h']]];
  for (const [name, args] of specs) {
    try {
      const p = await runProcess(toolPath(name), args, { timeout: 7000 });
      const output = (p.stdout + '\n' + p.stderr).replace(/\x1b\[[0-9;]*m/g, '');
      const patterns: Record<string, RegExp> = {
        subfinder: /Current Version:.*\d+\.\d+/i,
        httpx: /Current Version:.*\d+\.\d+/i,
        nuclei: /Nuclei Engine Version:.*3\./i,
        dalfox: /dalfox\s+v?3\./i,
        waybackurls: /Usage of .*waybackurls/i,
        jsleak: /Enable secretFinder/i,
      };
      const ready = patterns[name].test(output);
      checks.push({ name, ready, path: toolPath(name), detail: ready ? output.split(/\r?\n/).find(line => /version|dalfox|Usage of/i.test(line)) || 'Expected tool help is available' : 'Unexpected CLI/version. Run npm run download:tools to install tested binaries.' });
    } catch (e) { checks.push({ name, ready: false, path: toolPath(name), detail: errorText(e) }); }
  }
  const templateDir = nucleiTemplatesRoot();
  const nucleiTemplatesReady = fs.existsSync(templateDir) && fs.readdirSync(templateDir).length > 0;
  return { root: ROOT, projectDir: PROJECT_DIR, binDir: BIN_DIR, tools: checks, browser: findSystemBrowser(), nucleiTemplates: { path: templateDir, ready: nucleiTemplatesReady } };
}

export async function ai(userInput: string) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN, model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3-8b-instruct';
  if (account && token) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
    const r = await axios.post(url, { stream: false, messages: [{ role: 'system', content: 'You are a web security consultant. Explain findings defensively and only for authorized testing.' }, { role: 'user', content: `Help explain, validate, and prevent this finding: ${userInput}` }] }, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000 });
    return r.data;
  }
  return { result: { response: `AI provider is not configured. Finding context: ${userInput}\n\nReview the scanner evidence, confirm reproducibility on an authorized target, then prioritize remediation based on impact and exposure.` } };
}
