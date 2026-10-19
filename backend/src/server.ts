import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import * as core from './core.js';
import { ScanQueue } from './jobs.js';

dotenv.config({path:path.join(core.ROOT,'.env')});
const app=express(); app.use(cors()); app.use(express.json({limit:'2mb'}));
app.use('/project-files',express.static(core.PROJECT_DIR));
const first=(args:any[])=>Array.isArray(args?.[0])?args[0][0]:args?.[0];
async function dispatch(c: string, args: any[]) {
    const a=first(args)||{};
    let out:any;
    switch(c){
      case 'list-projects': out=core.listProjects(); break;
      case 'create-project': out=await core.createProject(a.projectName,a.domain); break;
      case 'get-project-details': out=await core.getDetails(first(args)); break;
      case 'get-project-scan': out=await core.getProjectScan(first(args)); break;
      case 'get-attack-result': out={error:false,results:await core.attackResults(first(args))}; break;
      case 'api-call': out=await core.apiCall(a.projectName,a.location,a.type); break;
      case 'subfinder-process': out=await core.subFinder(a.domain,core.projectPath(a.projectName)); break;
      case 'recon-all': out=await core.runReconPipeline(core.projectPath(a.projectName)); break;
      case 'httpx-live-domain': out=await core.liveSubDomains(core.projectPath(a.projectName)); break;
      case 'httpx-screens': out=await core.screenwin(core.projectPath(a.projectName)); break;
      case 'waybackurls-archive': out=await core.wayback(core.projectPath(a.projectName)); break;
      case 'waybackurls-js': out=await core.fetchJs(core.projectPath(a.projectName)); break;
      case 'waybackurls-parameter': out=await core.parameter(core.projectPath(a.projectName)); break;
      case 'find-secrets': out=await core.findSecret(core.projectPath(a.projectName)); break;
      case 'extra-links': out=await core.extraLinks(core.projectPath(a.projectName)); break;
      case 'general-scan': out=await core.generalScanning(core.projectPath(a.projectName)); break;
      case 'exposed-panels': out=await core.exposedPanels(core.projectPath(a.projectName)); break;
      case 'default-credentials': out=await core.defaultCredentials(core.projectPath(a.projectName)); break;
      case 'exposures': out=await core.scanningForExposures(core.projectPath(a.projectName)); break;
      case 'lfi': out=await core.scanningForLFI(core.projectPath(a.projectName)); break;
      case 'potential-xss': out=await core.scanningForXSS(core.projectPath(a.projectName)); break;
      case 'multi-scans': out=await core.scanningForSQLi(core.projectPath(a.projectName)); break;
      case 'subdomain-takeovers': out=await core.subdomainTakeovers(core.projectPath(a.projectName)); break;
      case 'vulns-cves': out=await core.scanningCVEs(core.projectPath(a.projectName)); break;
      case 'fetch-data': out=await core.ai(a.userInput); break;
      case 'get-project-dir': out=core.PROJECT_DIR; break;
      case 'connection-check': out=await core.checkTargetConnection(core.projectPath(a.projectName)); break;
      case 'project-diagnostics': out=await core.projectDiagnostics(a.projectName); break;
      default: throw new Error(`Unknown IPC channel: ${c}`);
    }
    return out;
}
const actionChannels = new Set(['subfinder-process','recon-all','httpx-live-domain','httpx-screens','waybackurls-archive','waybackurls-js','waybackurls-parameter','find-secrets','extra-links','general-scan','exposed-panels','default-credentials','exposures','lfi','potential-xss','multi-scans','subdomain-takeovers','vulns-cves','connection-check']);
const jobs = new ScanQueue(dispatch);
async function submit(channel: string, args: any[]) {
  if (!actionChannels.has(channel)) throw new Error('Unknown background tool channel.');
  const projectName = first(args)?.projectName;
  await core.getDetails(projectName);
  return jobs.submit(channel, args, projectName);
}
app.post('/api/jobs',async(req,res)=>{
  try { res.status(202).json(await submit(req.body?.channel, req.body?.args || [])); }
  catch(error:any) { res.status(400).json({ error: error?.message || String(error) }); }
});
app.get('/api/jobs/:id',(req,res)=>{
  const job=jobs.view(req.params.id);
  if (!job) return res.status(404).json({error:'Job not found. The backend may have restarted; check saved scan results before rerunning.'});
  res.json(job);
});
app.get('/api/jobs',(req,res)=>res.json(jobs.list(String(req.query.projectName || ''))));
app.delete('/api/jobs/:id',(req,res)=>res.json({cancelled:jobs.cancel(req.params.id)}));
app.post('/api/ipc/:channel',async(req,res)=>{
  try {
    const channel=req.params.channel, args=req.body?.args || [];
    if (actionChannels.has(channel)) {
      const job=await submit(channel,args);
      return res.json(await jobs.wait(job.id));
    }
    res.json(await dispatch(channel,args));
  } catch(error:any) { console.error(error); res.status(500).json({error:error?.message || String(error)}); }
});
app.get('/api/health',(_req,res)=>res.json({ok:true,name:'HunterKit Web Backend',projectDir:core.PROJECT_DIR,binDir:core.BIN_DIR}));
app.get('/api/diagnostics',async(_req,res)=>res.json(await core.toolDiagnostics()));
const frontend=path.join(core.ROOT,'frontend','dist'); if(fs.existsSync(frontend)){app.use(express.static(frontend));app.get('*',(_req,res)=>res.sendFile(path.join(frontend,'index.html')))}
const port=Number(process.env.PORT||4000); app.listen(port,'127.0.0.1',()=>console.log(`HunterKit Web API: http://127.0.0.1:${port}`));
