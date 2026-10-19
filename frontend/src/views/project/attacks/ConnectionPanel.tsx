import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';

type Props = { projectName: string; target: string };
export default function ConnectionPanel({ projectName, target }: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [discovery, setDiscovery] = useState<any>(null);
  const [error, setError] = useState('');
  async function load() {
    const data = await window.electron.ipcRenderer.invoke('project-diagnostics', { projectName });
    setReport(data.connection); setDiscovery(data.discovery);
  }
  useEffect(() => {
    const refresh = () => load().catch(error => setError(error.message));
    const listener = (event: Event) => {
      const job = (event as CustomEvent).detail;
      if (job.projectName === projectName && ['completed', 'failed'].includes(job.state)) refresh();
    };
    refresh(); window.addEventListener('hunterkit-job-update', listener);
    return () => window.removeEventListener('hunterkit-job-update', listener);
  }, [projectName]);
  async function check() {
    setBusy(true); setError('');
    try {
      const result = await window.electron.ipcRenderer.invoke('connection-check', { projectName });
      if (result.report) setReport(result.report);
      if (result.success === false) setError(result.error || result.message);
      await load();
    } catch (error: any) { setError(error.message || String(error)); }
    finally { setBusy(false); }
  }
  async function download() {
    try {
      const data = await window.electron.ipcRenderer.invoke('project-diagnostics', { projectName });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `HunterKit-${projectName}-diagnostics.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) { setError(error.message || String(error)); }
  }
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Target connection">
    <p className="font-semibold break-all">Target: {target}</p>
    <p className="text-sm text-gray-400">Tool jobs run one at a time. A single ordinary GET with Nuclei checks connectivity before a large scan; it does not test for vulnerabilities.</p>
    <div className="flex gap-3 flex-wrap">
      <Button onClick={check} disabled={busy}>{busy ? 'Checking / waiting in queue...' : 'Check target connection'}</Button>
      <Button variant="outline" onClick={download}>Download diagnostic report</Button>
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {report && <details open={!report.ready}>
      <summary className="cursor-pointer">Connection details — {report.ready ? 'a scanner route responded' : 'attention needed'}</summary>
      <p className="text-xs text-gray-400">Last check: {report.checkedAt}</p>
      {report.targets?.map((item: any) => <div key={item.url} className="text-sm border-t mt-2 pt-2 space-y-1 break-all">
        <p>{item.url}</p>
        <p>Node: {item.node.ok ? `HTTP ${item.node.status}` : item.node.code || 'no response'}; Nuclei: {item.nuclei.ok ? `HTTP ${item.nuclei.status || '?'}` : item.nuclei.code || 'no response'}</p>
        <p>Proxy route: {item.proxySource}</p>
        {item.nuclei.error && <p className="text-amber-400 whitespace-pre-wrap">{item.nuclei.error}</p>}
        {item.suggestion && <p>{item.suggestion}</p>}
      </div>)}
    </details>}
    {discovery && <details>
      <summary className="cursor-pointer">Input discovery details</summary>
      <p className="text-sm mt-2">Fetched pages: {discovery.pagesFetched ?? '?'}; GET parameter URLs: {discovery.parameterUrls ?? '?'}; POST forms: {discovery.postForms ?? '?'}; forms containing passwords: {discovery.passwordForms ?? '?'}</p>
      <p className="text-sm text-gray-400">This discovery pass does not execute page JavaScript, submit POST forms, or use your browser login session. Zero discovered parameters means injection tests may be skipped; it does not establish safety.</p>
    </details>}
  </section>;
}
