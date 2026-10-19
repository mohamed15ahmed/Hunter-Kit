/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import SubFinderJob from './jobs/subfinder';
import LiveSubdomainsJob from './jobs/liveSubDomains';
import HttpxScreensJob from './jobs/httpxScreens';
import WaybackurlsArchiveJob from './jobs/waybackurlsArchive';
import WaybackurlsJsJob from './jobs/waybackurlsJs';
import WaybackurlsParameterJob from './jobs/waybackurlsParameter';
import { ProjectDetails } from '../../types';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/use-toast';

export default function Recon() {
  const [details, setDetails] = useState<ProjectDetails>();
  const { projectSlug } = useParams();
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const { toast } = useToast();

  const getDetails = async () => {
    const res = await window.electron.ipcRenderer.invoke(
      'get-project-details',
      projectSlug,
    );
    setDetails(res);
  };

  useEffect(() => {
    getDetails();
  }, []);

  const runFullRecon = async () => {
    if (!details?.name) return;
    setPipelineLoading(true);
    try {
      const res = await window.electron.ipcRenderer.invoke('recon-all', { projectName: details.name });
      toast({ title: res?.message || (res?.success ? 'Recon pipeline completed' : 'Recon pipeline stopped'), variant: res?.success === false ? 'destructive' : undefined });
      await getDetails();
    } catch (error: any) {
      toast({ title: error?.message || 'Recon pipeline failed', variant: 'destructive' });
    } finally {
      setPipelineLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Initiate Recon Attacks</h1>
          <p className="text-sm text-muted-foreground mt-1">Run the recommended pipeline once, or execute individual stages below. Dependent tools will now prepare missing inputs automatically.</p>
        </div>
        <Button onClick={runFullRecon} disabled={!details || pipelineLoading} className="min-w-[190px]">
          {pipelineLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running recon</> : <><PlayCircle className="mr-2 h-4 w-4" />Run Full Recon</>}
        </Button>
      </div>
      {details && (
        <div>
          <div className="grid grid-flow-row grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Find Subdomains</CardTitle>
                <CardDescription>
                  Enumurate all subdomains of your target.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.subfinder?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>
                          {formatDistanceToNow(new Date(details?.subfinder?.date))}
                        </span>
                      </h1>
                    )}
                  </div>
                )}
                <SubFinderJob {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Find live Subdomains</CardTitle>
                <CardDescription>
                  Check which subdomains are live?
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.liveDomains?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>
                          {formatDistanceToNow(new Date(details.liveDomains.date))}
                        </span>
                      </h1>
                    )}
                  </div>
                )}
                <LiveSubdomainsJob {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Get Screenshots</CardTitle>
                <CardDescription>
                  See what is your target look like ?
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.screens?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>{formatDistanceToNow(new Date(details.screens.date))}</span>
                      </h1>
                    )}
                  </div>
                )}
                <HttpxScreensJob {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Get Archive</CardTitle>
                <CardDescription>
                  Crawl all the URLs of your target from the wayback machine.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.archive?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>{formatDistanceToNow(new Date(details.archive.date))}</span>
                      </h1>
                    )}
                  </div>
                )}
                <WaybackurlsArchiveJob {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Get Js Files</CardTitle>
                <CardDescription>Get all the js.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.js?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>{formatDistanceToNow(new Date(details.js.date))}</span>
                      </h1>
                    )}
                  </div>
                )}
                <WaybackurlsJsJob {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Get Parameters</CardTitle>
                <CardDescription>Get all the Parameters.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                {details && (
                  <div className="flex flex-col space-x-2">
                    {details?.params?.date && (
                      <h1 className="flex flex-col font-semibold">
                        Last Run{' '}
                        <span>{formatDistanceToNow(new Date(details.params.date))}</span>
                      </h1>
                    )}
                  </div>
                )}
                <WaybackurlsParameterJob {...details} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
