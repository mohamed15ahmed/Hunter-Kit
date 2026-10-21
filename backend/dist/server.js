import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import * as core from './core.js';
dotenv.config({ path: path.join(core.ROOT, '.env') });
const app = express();
const localHost = (value) => {
    try {
        const hostname = new URL(`http://${value}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
        return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
    }
    catch {
        return false;
    }
};
export const allowedBrowserOrigin = (origin) => {
    try {
        const url = new URL(origin);
        return url.protocol === 'http:' && localHost(url.host);
    }
    catch {
        return false;
    }
};
// A public web page must not be able to drive the local scanner or read its project files.
// Requests without Origin are retained for the CLI/tests; browsers send Origin on cross-origin POSTs.
app.use((req, res, next) => {
    if (!req.headers.host || !localHost(req.headers.host)) {
        res.status(403).json({ error: 'HunterKit only accepts local host requests.' });
        return;
    }
    const origin = req.headers.origin;
    if (origin && !allowedBrowserOrigin(origin)) {
        res.status(403).json({ error: 'HunterKit rejected a non-local browser origin.' });
        return;
    }
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/project-files', express.static(core.PROJECT_DIR));
const first = (args) => Array.isArray(args?.[0]) ? args[0][0] : args?.[0];
const projectActionChannels = new Set([
    'subfinder-process', 'recon-all', 'httpx-live-domain', 'httpx-screens',
    'waybackurls-archive', 'waybackurls-js', 'waybackurls-parameter',
    'find-secrets', 'extra-links', 'general-scan', 'exposed-panels',
    'default-credentials', 'exposures', 'lfi', 'potential-xss', 'multi-scans',
    'subdomain-takeovers', 'vulns-cves',
]);
const activeProjectJobs = new Map();
app.post('/api/ipc/:channel', async (req, res) => {
    let lockedProject;
    try {
        const c = req.params.channel;
        const args = req.body?.args || [];
        const a = first(args) || {};
        if (projectActionChannels.has(c)) {
            const project = core.projectPath(a.projectName);
            const active = activeProjectJobs.get(project);
            if (active) {
                res.status(409).json({ success: false, busy: true, activeChannel: active, message: `Another tool (${active}) is already running for this project.`, error: 'Wait for it to finish before starting another tool.' });
                return;
            }
            activeProjectJobs.set(project, c);
            lockedProject = project;
        }
        let out;
        switch (c) {
            case 'list-projects':
                out = core.listProjects();
                break;
            case 'create-project':
                out = await core.createProject(a.projectName, a.domain);
                break;
            case 'get-project-details':
                out = await core.getDetails(first(args));
                break;
            case 'get-project-scan':
                out = await core.getProjectScan(first(args));
                break;
            case 'get-attack-result':
                out = { error: false, results: await core.attackResults(first(args)) };
                break;
            case 'api-call':
                out = await core.apiCall(a.projectName, a.location, a.type);
                break;
            case 'subfinder-process':
                out = await core.subFinder(a.domain, core.projectPath(a.projectName));
                break;
            case 'recon-all':
                out = await core.runReconPipeline(core.projectPath(a.projectName));
                break;
            case 'httpx-live-domain':
                out = await core.liveSubDomains(core.projectPath(a.projectName));
                break;
            case 'httpx-screens':
                out = await core.screenwin(core.projectPath(a.projectName));
                break;
            case 'waybackurls-archive':
                out = await core.wayback(core.projectPath(a.projectName));
                break;
            case 'waybackurls-js':
                out = await core.fetchJs(core.projectPath(a.projectName));
                break;
            case 'waybackurls-parameter':
                out = await core.parameter(core.projectPath(a.projectName));
                break;
            case 'find-secrets':
                out = await core.findSecret(core.projectPath(a.projectName));
                break;
            case 'extra-links':
                out = await core.extraLinks(core.projectPath(a.projectName));
                break;
            case 'general-scan':
                out = await core.generalScanning(core.projectPath(a.projectName));
                break;
            case 'exposed-panels':
                out = await core.exposedPanels(core.projectPath(a.projectName));
                break;
            case 'default-credentials':
                out = await core.defaultCredentials(core.projectPath(a.projectName));
                break;
            case 'exposures':
                out = await core.scanningForExposures(core.projectPath(a.projectName));
                break;
            case 'lfi':
                out = await core.scanningForLFI(core.projectPath(a.projectName));
                break;
            case 'potential-xss':
                out = await core.scanningForXSS(core.projectPath(a.projectName));
                break;
            case 'multi-scans':
                out = await core.scanningForSQLi(core.projectPath(a.projectName));
                break;
            case 'subdomain-takeovers':
                out = await core.subdomainTakeovers(core.projectPath(a.projectName));
                break;
            case 'vulns-cves':
                out = await core.scanningCVEs(core.projectPath(a.projectName));
                break;
            case 'fetch-data':
                out = await core.ai(a.userInput);
                break;
            case 'get-project-dir':
                out = core.PROJECT_DIR;
                break;
            default: throw new Error(`Unknown IPC channel: ${c}`);
        }
        res.json(out);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: e?.message || String(e) });
    }
    finally {
        if (lockedProject)
            activeProjectJobs.delete(lockedProject);
    }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'HunterKit Web Backend', projectDir: core.PROJECT_DIR, binDir: core.BIN_DIR }));
app.get('/api/diagnostics', async (_req, res) => res.json(await core.toolDiagnostics()));
const frontend = path.join(core.ROOT, 'frontend', 'dist');
if (fs.existsSync(frontend)) {
    app.use(express.static(frontend));
    app.get('*', (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
}
const port = Number(process.env.PORT || 4000);
app.listen(port, '127.0.0.1', () => console.log(`HunterKit Web API: http://127.0.0.1:${port}`));
