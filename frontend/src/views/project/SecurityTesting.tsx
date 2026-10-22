import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/use-toast';

type Finding = { id: string; category: string; title: string; kind: string; severity: string; confidence: string; affectedUrl: string; evidence: string; remediation: string; observedAt: string; scanner?: string };
type Report = { status?: string; startedAt?: string; finishedAt?: string; durationMs?: number; testedUrls?: string[]; tools?: Array<{ name: string; version: string }>; vulnerabilityCount?: number; observationCount?: number; findings?: Finding[]; errors?: string[] };

export default function SecurityTesting() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { toast } = useToast();
  const [report, setReport] = useState<Report>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke('api-call', { projectName: projectSlug, location: 'security-assessment.json', type: 'application/json' });
      setReport(result?.body ? JSON.parse(result.body) : {}); setError('');
    } catch (e: any) { setError(e?.message || String(e)); }
  };
  useEffect(() => { load(); }, [projectSlug]);
  const run = async () => {
    if (running) return; setRunning(true); setError('');
    try {
      const result = await window.electron.ipcRenderer.invoke('security-assessment', { projectName: projectSlug });
      toast({ title: result?.message || 'Security Testing finished', description: result?.error || undefined, variant: result?.success === false ? 'destructive' : undefined });
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setRunning(false); }
  };
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Security Testing</h1><p className="text-sm text-gray-400">Evidence-based checks for headers, TLS, CORS, HTTP methods and known vulnerabilities. Missing headers remain observations unless exploit evidence exists.</p></div><Button onClick={run} disabled={running}>{running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{running ? 'Testing…' : 'Run Security Testing'}</Button></div>
    {error && <p className="rounded border border-red-500/40 p-3 text-red-400">{error}</p>}
    <div className="grid gap-3 md:grid-cols-4">
      <div className="rounded border p-4"><div className="text-xs text-gray-400">Status</div><div className="font-bold break-words">{report.status || 'NOT RUN'}</div></div>
      <div className="rounded border p-4"><div className="text-xs text-gray-400">Vulnerabilities</div><div className="text-2xl font-bold">{report.vulnerabilityCount ?? 0}</div></div>
      <div className="rounded border p-4"><div className="text-xs text-gray-400">Observations</div><div className="text-2xl font-bold">{report.observationCount ?? 0}</div></div>
      <div className="rounded border p-4"><div className="text-xs text-gray-400">Tested URLs</div><div className="text-2xl font-bold">{report.testedUrls?.length ?? 0}</div></div>
    </div>
    {report.errors?.map((value, index) => <p key={index} className="text-sm text-amber-400">{value}</p>)}
    {report.tools?.length ? <div className="text-xs text-gray-400">Tools: {report.tools.map(tool => `${tool.name} ${tool.version}`).join(' · ')} · Finished: {report.finishedAt}</div> : null}
    <div className="space-y-3">{report.findings?.map(item => <article key={item.id} className="rounded border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{item.title}</h2><span className="rounded bg-white/10 px-2 py-1 text-xs">{item.kind} · {item.severity} · {item.confidence} confidence</span></div>
      <div className="mt-2 text-xs text-gray-400 break-all">{item.category} · {item.scanner} · {item.affectedUrl} · {item.observedAt}</div>
      <p className="mt-3 text-sm break-words"><strong>Evidence:</strong> {item.evidence}</p>
      <p className="mt-2 text-sm break-words"><strong>Remediation:</strong> {item.remediation}</p>
    </article>)}</div>
    {!report.findings?.length && <div className="rounded border p-5 text-gray-400">No saved Security Testing findings. Run the module to record tested inputs and a final status.</div>}
  </div>;
}
