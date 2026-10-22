import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/use-toast';

export default function IntelligentAnalysis() {
  const { projectSlug } = useParams<{ projectSlug: string }>(); const { toast } = useToast();
  const [report, setReport] = useState<any>(null); const [running, setRunning] = useState(false); const [error, setError] = useState('');
  const load = async () => { try { setReport(await window.electron.ipcRenderer.invoke('get-intelligent-report', projectSlug)); setError(''); } catch (e: any) { setError(e?.message || String(e)); } };
  useEffect(() => { load(); }, [projectSlug]);
  const generate = async () => { setRunning(true); try { const result = await window.electron.ipcRenderer.invoke('generate-intelligent-report', { projectName: projectSlug }); setReport(result); toast({ title: 'Consolidated report generated from saved evidence' }); } catch (e: any) { setError(e?.message || String(e)); } finally { setRunning(false); } };
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">AI & Intelligent Analysis</h1><p className="text-sm text-gray-400">Deduplicates real Security Testing and Penetration Testing evidence, scores risk, and keeps optional AI interpretation separate.</p></div><Button onClick={generate} disabled={running}>{running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{running ? 'Generating…' : 'Generate consolidated report'}</Button></div>
    {error && <p className="rounded border border-red-500/40 p-3 text-red-400">{error}</p>}
    {report && <><div className="rounded border p-4"><div className="font-bold">{report.status}</div><p className="mt-2 text-sm">{report.summary}</p><p className="mt-2 text-xs text-gray-400">{report.evidenceBoundary}</p></div>
      <div className="grid gap-3 md:grid-cols-3"><div className="rounded border p-4"><h2 className="font-semibold">Recon context</h2><p className="text-sm">Live: {report.reconContext?.liveServices?.length || 0} · Parameters: {report.reconContext?.parameterizedUrls?.length || 0} · JS: {report.reconContext?.javascriptUrls?.length || 0}</p></div><div className="rounded border p-4"><h2 className="font-semibold">Tested modules</h2>{report.tested?.map((item: any) => <div key={item.module} className="text-sm">{item.module}: {item.status}</div>)}</div><div className="rounded border p-4"><h2 className="font-semibold">Not tested</h2><p className="text-sm break-words">{report.untested?.join(', ') || 'None'}</p></div></div>
      <div className="rounded border p-4"><h2 className="font-semibold">Optional AI interpretation</h2><div className="text-xs text-gray-400">Provider status: {report.aiInterpretation?.status}</div><p className="mt-2 whitespace-pre-wrap text-sm">{report.aiInterpretation?.text}</p></div>
      <div className="space-y-3">{report.findings?.map((item: any) => <article key={item.id} className="rounded border p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">{item.title}</h2><span className="font-bold">Risk {item.riskScore}/100</span></div><div className="text-xs text-gray-400 break-all">{item.source} · {item.severity} · {item.confidence} · {item.affectedUrl}</div><p className="mt-2 text-sm"><strong>Evidence:</strong> {item.evidence}</p><p className="mt-2 text-sm"><strong>Remediation:</strong> {item.remediation}</p></article>)}</div>
    </>}
  </div>;
}
