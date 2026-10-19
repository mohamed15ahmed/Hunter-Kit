const ACTION_CHANNELS = new Set([
  'subfinder-process', 'recon-all', 'httpx-live-domain', 'httpx-screens',
  'waybackurls-archive', 'waybackurls-js', 'waybackurls-parameter',
  'find-secrets', 'extra-links', 'general-scan', 'exposed-panels',
  'default-credentials', 'exposures', 'lfi', 'potential-xss', 'multi-scans',
  'subdomain-takeovers', 'vulns-cves', 'connection-check',
]);

async function request(url: string, init?: RequestInit, timeout = 25000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload?.error || `Request failed (${response.status})`), { status: response.status });
    return payload;
  } finally { window.clearTimeout(timer); }
}

async function runTool(channel: string, args: any[]) {
  const projectName = (Array.isArray(args[0]) ? args[0][0] : args[0])?.projectName;
  const update = (job: any) => window.dispatchEvent(new CustomEvent('hunterkit-job-update', { detail: { ...job, channel, projectName } }));
  try {
    let job = await request('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, args }) });
    let failures = 0;
    while (true) {
      update(job);
      if (['completed', 'failed', 'cancelled'].includes(job.state)) return job.result;
      await new Promise(resolve => window.setTimeout(resolve, 800));
      try { job = await request(`/api/jobs/${encodeURIComponent(job.id)}`); failures = 0; }
      catch (error: any) {
        if (error.status === 404 || ++failures >= 3) throw error;
        update({ ...job, message: 'Reconnecting to scan status...' });
      }
    }
  } catch (error: any) {
    const result = { success: false, message: 'Could not retrieve the tool job result.', error: error?.message || String(error) };
    update({ state: 'failed', result }); return result;
  }
}

const invoke = async (channel: string, ...args: any[]) => {
  if (channel === 'open-link') {
    const url = args?.[0]?.url;
    if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
    return true;
  }
  if (ACTION_CHANNELS.has(channel)) return runTool(channel, args);
  return request(`/api/ipc/${encodeURIComponent(channel)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }),
  }, channel === 'fetch-data' ? 45000 : 25000);
};
(window as any).electron = { ipcRenderer: { invoke, sendMessage: () => undefined, on: () => () => undefined, once: () => undefined } };
