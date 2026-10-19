/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useParams } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import SubDomainsResults from './jobs/Results/SubDomainsResults';
import { ProjectDetails } from '../../types';

export default function Results() {
  const [details, setDetails] = useState<ProjectDetails>();
  const { projectSlug } = useParams();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-bold text-3xl">Results</h1>
      <div>
        <div className="grid grid-flow-row grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Subdomains</CardTitle>
              <CardDescription>all subdomains of your target.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.subfinder?.date
                        ? formatDistanceToNow(new Date(details.subfinder.date))
                        : ''}
                    </span>
                  </h1>
                  <h1 className="flex flex-col font-semibold">
                    No. of Subdomains found:
                    <span>{details.subfinder?.result || '0'}</span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Live Subdomains</CardTitle>
              <CardDescription>all subdomains of your target.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x-2">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.liveDomains?.date
                        ? formatDistanceToNow(
                            new Date(details.liveDomains.date),
                          )
                        : ''}
                    </span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Screenshots</CardTitle>
              <CardDescription>what is your target look like.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x-2">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.screens?.date
                        ? formatDistanceToNow(new Date(details.screens.date))
                        : ''}
                    </span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Archive</CardTitle>
              <CardDescription>Archive of your target.</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x-2">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.archive?.date
                        ? formatDistanceToNow(new Date(details.archive.date))
                        : ''}
                    </span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Js Files</CardTitle>
              <CardDescription>
                all the js files of your target.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x-2">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.js?.date
                        ? formatDistanceToNow(new Date(details.js.date))
                        : ''}
                    </span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
              <CardDescription>
                all the Parameters of your target.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between">
              {details && (
                <div className="flex flex-col space-x-2">
                  <h1 className="flex flex-col font-semibold">
                    Last Run{' '}
                    <span>
                      {details.params?.date
                        ? formatDistanceToNow(new Date(details.params.date))
                        : ''}
                    </span>
                  </h1>
                </div>
              )}
              <SubDomainsResults />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
