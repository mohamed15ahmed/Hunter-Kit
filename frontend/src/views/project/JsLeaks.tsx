/* eslint-disable react/jsx-props-no-spreading */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import Secrets from './jsLeaksJob/secrets';
import EndPoints from './jsLeaksJob/Endpoint';
import { ProjectDetails } from '../../types';
import { Button } from '../../components/ui/button';

export default function JsLeaks() {
  const [details, setDetails] = useState<ProjectDetails>();
  const { projectSlug } = useParams();
  const [outputs, setOutputs] = useState({ secrets: '', links: '' });
  const [error, setError] = useState('');
  const refreshOutputs = async () => {
    try {
      const [secrets, links] = await Promise.all(['secrets.txt', 'extra_links.txt'].map(location => window.electron.ipcRenderer.invoke('api-call', { projectName: projectSlug, location, type: 'text/plain' })));
      setOutputs({ secrets: secrets.body || '', links: links.body || '' }); setError('');
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const getDetails = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('get-project-details', projectSlug);
      setDetails(res);
    } catch (requestError: any) {
      setDetails(undefined);
      setError(requestError?.message || String(requestError));
    }
  };

  useEffect(() => {
    getDetails(); refreshOutputs();
  }, [projectSlug]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-3xl">JsLeaks</h1>
      <p className="text-sm text-gray-400">Reads in-scope pages and discovered JavaScript. Secret patterns are candidates to review, not proof that a credential is valid.</p>
      {details && (
        <div>
          <div className="grid grid-flow-row grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Find Secrets</CardTitle>
                <CardDescription>wanna find secrets ?</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                <Secrets {...details} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Find EndPoints</CardTitle>
                <CardDescription>
                  Unveiling extra and hidden endpoints
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between">
                <EndPoints {...details} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <Button onClick={refreshOutputs}>Refresh saved JS results</Button>
      {error && <p className="text-red-400">{error}</p>}
      <h2 className="font-semibold">Secret candidates</h2>
      <pre className="whitespace-pre-wrap break-all border rounded p-3 text-xs">{outputs.secrets || 'No saved secret candidates.'}</pre>
      <h2 className="font-semibold">Discovered endpoints</h2>
      <pre className="whitespace-pre-wrap break-all border rounded p-3 text-xs">{outputs.links || 'No saved endpoints.'}</pre>
    </div>
  );
}
