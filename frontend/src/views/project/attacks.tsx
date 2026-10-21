/* eslint-disable react/jsx-props-no-spreading */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { ProjectDetails } from '../../types';
import GeneralScan from './attacks/generalScan';
import ExposedPanels from './attacks/exposedPanels';
import DefaultCredentials from './attacks/defaultCredentials';
import SubdomainTakeovers from './attacks/subdomainTakeovers';
import Exposures from './attacks/exposures';
import VulnsCves from './attacks/vulns&Cves';
import Lfi from './attacks/lfi';
import PotentialXss from './attacks/potentialXss';
import SqlInjection from './attacks/sqlInjection';
import { AttackRunProvider } from './attacks/AttackRunContext';

export default function Attacks() {
  const [details, setDetails] = useState<ProjectDetails>();
  const [error, setError] = useState('');
  const { projectSlug } = useParams();

  const getDetails = async () => {
    try {
      const res = await window.electron.ipcRenderer.invoke('get-project-details', projectSlug);
      setDetails(res);
      setError('');
    } catch (requestError: any) {
      setDetails(undefined);
      setError(requestError?.message || String(requestError));
    }
  };
  useEffect(() => {
    getDetails();
  }, [projectSlug]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-3xl">Attacks</h1>
      <p className="text-sm text-gray-400">Each module scans a limited set of selected inputs. Panel detections and exposures are scanner observations; review their evidence. See Attack Results for completion status, request counts and failures.</p>
      {error && <p className="rounded border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">Could not load this project: {error}</p>}
      {details && (
        <AttackRunProvider>
        <div>
          <h2 className="font-bold text-2xl mb-4 text-center">General</h2>
          <div className="mb-8">
            <div className="grid grid-flow-row grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>General Scanning</CardTitle>
                  <CardDescription>Common HTTP misconfigurations, exposures and panels; no technology-detection prerequisite.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <GeneralScan {...details} />
                </CardContent>
              </Card>
            </div>
          </div>
          <h2 className="font-bold text-2xl mb-4 text-center">
            Misconfigurations and Easy Wins
          </h2>
          <div className="mb-8">
            <div className="grid grid-flow-row grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Hunting Exposed panels</CardTitle>
                  <CardDescription>Checks only exposed-panel templates against live web services.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <ExposedPanels {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Hunting Default Credentials</CardTitle>
                  <CardDescription>
                    Checks default-login templates against a bounded set of live services.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <DefaultCredentials {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Hunting subdomain takeovers</CardTitle>
                  <CardDescription>
                    Checks takeover-specific templates against discovered live hosts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <SubdomainTakeovers {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Hunting for exposures</CardTitle>
                  <CardDescription>Checks common exposure templates without running the full template library.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <Exposures {...details} />
                </CardContent>
              </Card>
            </div>
          </div>
          <h2 className="font-bold text-2xl mb-4 text-center">
            Testing for Vulnerabilities
          </h2>
          <div className="mb-8">
            <div className="grid grid-flow-row grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Scanning for Known Vulns and CVEs</CardTitle>
                  <CardDescription>Known HTTP CVE templates, focused on medium+ severity.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <VulnsCves {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Testing for LFI</CardTitle>
                  <CardDescription>Runs LFI DAST templates against discovered parameterized URLs.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <Lfi {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Hunting XSS</CardTitle>
                  <CardDescription>Dalfox verification against discovered parameterized URLs.</CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <PotentialXss {...details} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Scan for SQL Injection</CardTitle>
                  <CardDescription>
                    Runs bounded Nuclei DAST SQLi checks only against discovered parameterized URLs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-between">
                  <SqlInjection {...details} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        </AttackRunProvider>
      )}
    </div>
  );
}
