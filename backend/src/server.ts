import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import * as core from './core.js';

dotenv.config({path:path.join(core.ROOT,'.env')});
const app=express(); app.use(cors()); app.use(express.json({limit:'2mb'}));
app.use('/project-files',express.static(core.PROJECT_DIR));
const first=(args:any[])=>Array.isArray(args?.[0])?args[0][0]:args?.[0];
app.post('/api/ipc/:channel',async(req,res)=>{
  try{
    const c=req.params.channel; const args=req.body?.args||[]; const a=first(args)||{};
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
      default: throw new Error(`Unknown IPC channel: ${c}`);
    }
    res.json(out);
  }catch(e:any){console.error(e);res.status(500).json({error:e?.message||String(e)});}
});
app.get('/api/health',(_req,res)=>res.json({ok:true,name:'HunterKit Web Backend',projectDir:core.PROJECT_DIR,binDir:core.BIN_DIR}));
app.get('/api/diagnostics',async(_req,res)=>res.json(await core.toolDiagnostics()));
const frontend=path.join(core.ROOT,'frontend','dist'); if(fs.existsSync(frontend)){app.use(express.static(frontend));app.get('*',(_req,res)=>res.sendFile(path.join(frontend,'index.html')))}
const port=Number(process.env.PORT||4000); app.listen(port,'127.0.0.1',()=>console.log(`HunterKit Web API: http://127.0.0.1:${port}`));
