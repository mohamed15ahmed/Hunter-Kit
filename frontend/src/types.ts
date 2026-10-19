import { ReactNode } from 'react';

export type DashboardMenu = {
  href: string;
  title: string;
  Disabled?: boolean;
  icon: ReactNode;
};

export type jobLoaders = {
  job: string;
  state: boolean;
};

export type JobDetails = {
  run: boolean;
  filePath: string;
  result?: number | string;
  date: string;
};
export interface ProjectDetails {
  // Basic project metadata
  name: string;
  domain: string;
  targetUrl?: string;

  // Recon Jobs
  subfinder?: JobDetails;
  screens?: JobDetails;
  params?: JobDetails;
  liveDomains?: JobDetails;
  archive?: JobDetails;
  js?: JobDetails;

  // Nuclei / Attack Jobs
  generalScanning?: JobDetails;
  exposedPanels?: JobDetails;
  defaultCredentials?: JobDetails;
  subdomainTakeovers?: JobDetails;
  exposures?: JobDetails;
  scanningCVEs?: JobDetails;
  scanningForLFI?: JobDetails;

  // Dalfox‑based Jobs
  XSS?: JobDetails;
  multiScans?: JobDetails;
  sqlInjection?: JobDetails;

  // Metadata
  updatedAt?: string | Date;
}

export type ResultsType = {
  name: string;
  where: string;
  href: string;
};

export const ReconTab = {
  SCREEN: 'Screenshots',
  LIVESUB: 'Live sub-domains',
  SUB: 'Sub-domains',
  PARAMS: 'All Params',
} as const;

export type ReconTabs = keyof typeof ReconTab;
