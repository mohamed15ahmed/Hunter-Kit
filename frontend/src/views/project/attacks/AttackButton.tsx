import { Loader2 } from 'lucide-react';
import { useState } from 'react';
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

  const run = async () => {
    if (!details.name || loading) return;
    setLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke(channel, { projectName: details.name });
      setLastResult(res);
      if (res?.success === false) {
        toast({
          title: res?.message || 'Scan could not complete',
          description: res?.error || 'Review the project logs for details.',
          variant: 'destructive',
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
      Running...
    </Button>
  ) : <Button onClick={run}>{idleLabel}</Button>}
    {lastResult && <p role="status" className={`text-xs break-words ${lastResult.success === false ? 'text-red-400' : 'text-muted-foreground'}`}>{lastResult.message}{lastResult.error ? ` ${lastResult.error}` : ''}</p>}
  </div>;
}
