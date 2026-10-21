import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../components/ui/use-toast';
import { ProjectDetails } from '../../../types';

export default function Secrets(details: ProjectDetails) {
  const { name } = details;
  const [Loading, setLoading] = useState<boolean>(false);
  const { toast } = useToast();
  const RunSecrets = async () => {
    if (Loading) return;
    setLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke('find-secrets', {
        projectName: name,
      });
      toast({ title: res?.message || 'Secret scan completed', description: res?.error || undefined, variant: res?.success === false ? 'destructive' : undefined });
    } catch (error: any) {
      toast({ title: 'Tool request failed', description: error?.message || String(error), variant: 'destructive' });
    } finally { setLoading(false); }
  };
  return (
    // eslint-disable-next-line react/jsx-no-useless-fragment
    <>
      {!Loading ? (
        <Button onClick={RunSecrets}>Process</Button>
      ) : (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Please wait
        </Button>
      )}
    </>
  );
}
