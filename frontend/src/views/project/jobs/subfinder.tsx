/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/jsx-no-useless-fragment */
/* eslint-disable react-hooks/rules-of-hooks */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../components/ui/use-toast';
import { ProjectDetails } from '../../../types';

export default function SubFinderJob(details: ProjectDetails) {
  const { name, domain } = details;
  const [Loading, setLoading] = useState<boolean>(false);
  const { toast } = useToast();
  const RunSubFinder = async () => {
    if (Loading) return;
    setLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke(
        'subfinder-process',
        {
          projectName: name,
          domain,
        },
      );
      toast({ title: res?.message || 'Subdomain discovery completed', description: res?.error || undefined, variant: res?.success === false ? 'destructive' : undefined });
    } catch (error: any) {
      toast({ title: 'Tool request failed', description: error?.message || String(error), variant: 'destructive' });
    } finally { setLoading(false); }
  };
  return (
    <>
      {!Loading ? (
        <Button onClick={RunSubFinder}>Process</Button>
      ) : (
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Please wait
        </Button>
      )}
    </>
  );
}
