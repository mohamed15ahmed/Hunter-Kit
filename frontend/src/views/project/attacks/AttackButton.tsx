import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { toast } from '../../../components/ui/use-toast';
import { ProjectDetails } from '../../../types';

type Props = {
  details: ProjectDetails;
  channel: string;
  idleLabel?: string;
};

export default function AttackButton({ details, channel, idleLabel = 'Process' }: Props) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  useEffect(() => {
    const listener = (event: Event) => {
      const next = (event as CustomEvent).detail;
      if (next.channel === channel && next.projectName === details.name) setJob(next);
    };
    window.addEventListener('hunterkit-job-update', listener);
    return () => window.removeEventListener('hunterkit-job-update', listener);
  }, [channel, details.name]);

  const run = async () => {
    if (!details.name || loading) return;
    setLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke(channel, { projectName: details.name });
      setLastResult(res);
      if (res?.success === false) {
        toast({
          title: res?.cancelled ? 'Scan cancelled' : res?.blocked ? 'Target connection needs attention' : res?.message || 'Scan could not complete',
          description: res?.error || 'Review the project logs for details.',
          variant: res?.cancelled ? undefined : 'destructive',
        });
        return;
      }
      toast({
        title: res?.message || 'Scan completed',
        description: res?.partial ? 'Partial evidence was saved; the time budget was reached.' : undefined,
      });
    } catch (error: any) {
      toast({
        title: 'Scan request failed',
        description: error?.message || String(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return <div className="flex flex-col gap-2 w-full">{loading ? (
    <Button disabled>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {job?.state === 'queued' ? `Queued (${job.position} ahead)` : 'Running...'}
    </Button>
  ) : <Button onClick={run}>{idleLabel}</Button>}
    {loading && job?.state === 'queued' && <Button variant="outline" onClick={() => fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })}>Cancel queued scan</Button>}
    {lastResult && <p data-testid="attack-run-status" role="status" className={`text-xs break-words ${lastResult.success === false ? 'text-red-400' : 'text-muted-foreground'}`}>{lastResult.message}{lastResult.error ? ` ${lastResult.error}` : ''}</p>}
  </div>;
}
