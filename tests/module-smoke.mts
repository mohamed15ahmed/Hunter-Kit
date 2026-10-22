import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtureServer } from './fixture.js';
import * as core from '../backend/src/core.js';

const fixture = await fixtureServer();
const templates = await fs.mkdtemp(path.join(os.tmpdir(), 'hunterkit-module-smoke-'));
const project = `HK-module-smoke-${process.pid}`;
const selected = [
  'http/cves/2021/CVE-2021-41773.yaml',
  'dast/vulnerabilities/sqli/sqli-error-based.yaml',
  'dast/vulnerabilities/lfi/linux-lfi-fuzz.yaml',
];
for (const relative of selected) {
  const source = path.join(core.ROOT, '.tools', 'nuclei-templates', relative);
  const destination = path.join(templates, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(source, destination);
}
const oldTemplates = process.env.HUNTERKIT_TEMPLATES;
process.env.HUNTERKIT_TEMPLATES = templates;
try {
  await core.createProject(project, `${fixture.base}/lab/`, true);
  const dir = core.projectPath(project);
  const recon = await core.runReconPipeline(dir);
  const security = await core.runSecurityAssessment(dir);
  const sqli = await core.scanningForSQLi(dir);
  const xss = await core.scanningForXSS(dir);
  const intelligent = await core.generateIntelligentReport(project);
  const result = {
    generatedAt: new Date().toISOString(), target: 'loopback authorized signature lab',
    modules: {
      recon: { success: recon.success, stages: recon.stages?.map(stage => ({ name: stage.name, success: stage.success, result: stage.result })) },
      securityTesting: { success: security.success, status: security.status, result: security.result },
      penetrationTesting: { sqli: { success: sqli.success, status: sqli.status, result: sqli.result }, xss: { success: xss.success, status: xss.status, result: xss.result } },
      intelligentAnalysis: { status: intelligent.status, findings: intelligent.findings.length, aiProvider: intelligent.aiInterpretation.status },
    },
  };
  const failed = !recon.success || !security.success || !sqli.success || !xss.success || !String(intelligent.status).startsWith('COMPLETED_');
  await fs.writeFile(path.join(core.ROOT, 'validation', 'module-smoke.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  if (oldTemplates === undefined) delete process.env.HUNTERKIT_TEMPLATES; else process.env.HUNTERKIT_TEMPLATES = oldTemplates;
  await fixture.close(); await fs.rm(core.projectPath(project), { recursive: true, force: true }); await fs.rm(templates, { recursive: true, force: true });
}
