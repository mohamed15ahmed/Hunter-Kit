import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AskAi } from '../../components/ai/aiChat';

interface RecordInfo { name: string; description: string; severity: string; }
interface FindingRecord { 'template-id': string; info: RecordInfo; url: string; sources?: Array<{ module: string; date: string | null }>; }
type Grouped = { [url: string]: FindingRecord[] };

type ScanMeta = {
  result?: number;
  run?: boolean;
  date?: string;
  partial?: boolean;
  failed?: boolean;
  error?: string;
  targets?: number;
  candidates?: number;
  selector?: string;
  elapsedSeconds?: number;
  completed?: boolean;
  running?: boolean;
  skipped?: boolean;
  warning?: string;
  templates?: number;
  requests?: number;
  requestErrors?: number;
  observations?: number;
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800', low: 'bg-sky-100 text-sky-800',
  medium: 'bg-yellow-100 text-yellow-800', high: 'bg-red-100 text-red-800',
  critical: 'bg-purple-100 text-purple-800',
};

const scans: Array<[string, string]> = [
  ['generalScanning', 'General'],
  ['exposedPanels', 'Panels'],
  ['defaultCredentials', 'Default logins'],
  ['subdomainTakeovers', 'Takeovers'],
  ['exposures', 'Exposures'],
  ['scanningCVEs', 'CVEs / known vulns'],
  ['scanningForLFI', 'LFI'],
  ['sqlInjection', 'SQL injection'],
  ['XSS', 'XSS'],
];

export default function AttacksResults() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const [records, setRecords] = useState<FindingRecord[]>([]);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setLoading(true); setError('');
        const [res, project] = await Promise.all([
          window.electron.ipcRenderer.invoke('get-attack-result', projectSlug),
          window.electron.ipcRenderer.invoke('get-project-details', projectSlug),
        ]);
        if (live) {
          setRecords(Array.isArray(res?.results) ? res.results : []);
          setDetails(project || {});
        }
      } catch (e: any) {
        if (live) setError(e?.message || String(e));
      } finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [projectSlug]);

  const grouped = useMemo(() => records.reduce((acc: Grouped, record) => {
    const url = record.url || 'Unknown target';
    (acc[url] ||= []).push(record);
    return acc;
  }, {}), [records]);

  const scanRows = scans.flatMap(([key, label]) => {
    const meta = details?.[key] as ScanMeta | undefined;
    return meta?.run ? [{ key, label, meta }] : [];
  });

  if (loading) return <div className="p-4 text-gray-500">Loading scanner results...</div>;
  if (error) return <div className="p-4 text-red-500">Failed to load scanner results: {error}</div>;

  return (
    <div className="p-4">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Attack Results</h1>
          <p className="text-sm text-gray-400">Evidence returned by Nuclei and Dalfox. Panel detections do not establish exploitability. Results retain the latest run of each module; check source and date. A completed scan covers only its selected templates and inputs.</p>
        </div>
        <span className="text-sm font-semibold">{records.length} finding(s)</span>
      </div>

      {scanRows.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
          {scanRows.map(({ key, label, meta }) => {
            const status = meta.running ? 'RUNNING' : meta.failed ? 'FAILED' : meta.skipped ? 'SKIPPED' : meta.partial || meta.completed === false ? 'PARTIAL' : meta.completed === true ? 'COMPLETED' : 'LEGACY / UNKNOWN';
            return (
              <div key={key} className="rounded-lg border p-4 bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{label}</h2>
                  <span className="text-xs font-semibold">{status}</span>
                </div>
                <div className="mt-2 text-2xl font-bold">{meta.result ?? 0}</div>
                <div className="text-xs text-gray-400">scanner finding(s)</div>
                {(meta.targets !== undefined || meta.candidates !== undefined) && <div className="mt-2 text-xs text-gray-400">Input: {meta.targets ?? meta.candidates} target/candidate(s)</div>}
                {meta.date && <div className="text-xs text-gray-400">Last run: {meta.date}</div>}
                {meta.elapsedSeconds !== undefined && <div className="text-xs text-gray-400">Runtime: {meta.elapsedSeconds}s</div>}
                {meta.selector && <div className="mt-1 text-xs text-gray-400 break-words">Profile: {meta.selector}</div>}
                {meta.templates !== undefined && <div className="text-xs text-gray-400">Templates: {meta.templates}</div>}
                {meta.requests !== undefined && <div className="text-xs text-gray-400">Requests: {meta.requests}; failed: {meta.requestErrors ?? 0}</div>}
                {meta.observations !== undefined && <div className="text-xs text-gray-400">Additional XSS observations: {meta.observations} (raw report)</div>}
                {meta.warning && <div className="mt-2 text-xs text-amber-400 break-words">{meta.warning}</div>}
                {meta.error && <div className="mt-2 text-xs text-red-400 break-words">{meta.error}</div>}
              </div>
            );
          })}
        </div>
      )}

      {records.length === 0 ? (
        <div className="rounded-lg border p-6 text-gray-400">No scanner findings have been recorded. COMPLETED + 0 covers only selected inputs/templates; PARTIAL means incomplete coverage; SKIPPED means no active test ran; FAILED needs attention. Old runs without completion metadata are shown as LEGACY / UNKNOWN.</div>
      ) : Object.entries(grouped).map(([url, rows]) => (
        <div key={url} className="mb-8">
          <h2 className="text-lg font-bold mb-3 break-all">{url}</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full">
              <thead className="bg-gray-100/10"><tr><th className="p-3 text-left">Template</th><th className="p-3 text-left">Finding</th><th className="p-3 text-left">Description</th><th className="p-3 text-left">Source / last run</th><th className="p-3">AI</th><th className="p-3">Severity</th></tr></thead>
              <tbody>{rows.map((record, index) => (
                <tr key={`${record['template-id']}-${index}`} className="border-t">
                  <td className="p-3 align-top">{record['template-id']}</td>
                  <td className="p-3 align-top">{record.info?.name}</td>
                  <td className="p-3 align-top max-w-xl">{record.info?.description}</td>
                  <td className="p-3 align-top text-xs">{record.sources?.map(source => <div key={source.module}>{source.module}<br />{source.date || 'Legacy result'}</div>)}</td>
                  <td className="p-3 align-top">{record.info?.description && <AskAi severity={record.info.severity} input={record.info.description} />}</td>
                  <td className="p-3 align-top"><span className={`${severityColors[(record.info?.severity || 'info').toLowerCase()] || ''} px-2 py-1 rounded`}>{record.info?.severity || 'info'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
