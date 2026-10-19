const ACTION_CHANNELS = new Set([
  'subfinder-process', 'recon-all', 'httpx-live-domain', 'httpx-screens',
  'waybackurls-archive', 'waybackurls-js', 'waybackurls-parameter',
  'find-secrets', 'extra-links', 'general-scan', 'exposed-panels',
  'default-credentials', 'exposures', 'lfi', 'potential-xss', 'multi-scans',
  'subdomain-takeovers', 'vulns-cves',
]);

const invoke = async (channel: string, ...args: any[]) => {
  if (channel === 'open-link') {
    const url = args?.[0]?.url;
    if (url) window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
    return true;
  }

  const controller = new AbortController();
  // Tool jobs have their own backend process deadlines; this client deadline is only a final safety net.
  const requestTimeout = ACTION_CHANNELS.has(channel) ? 15 * 60_000 : channel === 'fetch-data' ? 45_000 : 25_000;
  const requestTimer = window.setTimeout(() => controller.abort(), requestTimeout);
  try {
    const response = await fetch(`/api/ipc/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }

    if (!response.ok) {
      const message = payload?.error || payload?.message || `Request failed (${response.status})`;
      if (ACTION_CHANNELS.has(channel)) {
        window.alert(message);
        return { success: false, message: 'Tool execution failed', error: message };
      }
      throw new Error(message);
    }

    if (payload && typeof payload === 'object' && payload.success === false) {
      const detail = payload.error ? `\n\n${payload.error}` : '';
      window.alert(`${payload.message || 'Tool execution failed'}${detail}`);
    }
    return payload;
  } catch (error: any) {
    if (ACTION_CHANNELS.has(channel)) {
      const message = error?.message || String(error);
      window.alert(`Tool request failed\n\n${message}`);
      return { success: false, message: 'Tool request failed', error: message };
    }
    throw error;
  } finally {
    window.clearTimeout(requestTimer);
  }
};
(window as any).electron = { ipcRenderer: { invoke, sendMessage: () => undefined, on: () => () => undefined, once: () => undefined } };
