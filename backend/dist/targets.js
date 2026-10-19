// Keep the URL used by HTTP tools separate from the hostname used by DNS tools.
export function parseTarget(value) {
    const raw = String(value || '').trim();
    if (!raw || /\s/.test(raw))
        throw new Error('Enter a hostname or an HTTP(S) URL.');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw))
        throw new Error('Only HTTP(S) targets are supported.');
    const explicitScheme = /^https?:\/\//i.test(raw);
    const url = new URL(explicitScheme ? raw : `http://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
        throw new Error('Use an HTTP(S) target without embedded credentials.');
    }
    url.hash = '';
    return { domain: url.hostname.toLowerCase(), targetUrl: url.toString(), explicitScheme };
}
export function targetSeeds(details) {
    if (details?.targetUrl) {
        const target = parseTarget(details.targetUrl);
        if (details.explicitScheme !== false)
            return [target.targetUrl];
        const http = new URL(target.targetUrl);
        const https = new URL(http);
        https.protocol = 'https:';
        return [http.toString(), https.toString()];
    }
    // Existing projects stored only a domain. Retain their HTTP + HTTPS behavior.
    const target = parseTarget(details?.domain || '');
    if (/^https?:\/\//i.test(details.domain))
        return [target.targetUrl];
    const https = new URL(target.targetUrl);
    https.protocol = 'https:';
    return [target.targetUrl, https.toString()];
}
export function isScopedUrl(value, details) {
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            return false;
        const root = parseTarget(details?.targetUrl || details?.domain).domain;
        const host = url.hostname.toLowerCase();
        const mayHaveSubdomains = root !== 'localhost' && !root.includes(':') && !/^\d+\.\d+\.\d+\.\d+$/.test(root);
        if (host !== root && !(mayHaveSubdomains && host.endsWith(`.${root}`)))
            return false;
        if (details?.targetUrl) {
            const target = new URL(details.targetUrl);
            // A URL with an explicit scheme is an exact origin, including its port.
            if (details.explicitScheme && url.origin !== target.origin)
                return false;
            if (target.port && url.port !== target.port)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
export function scopedUrls(values, details) {
    return [...new Set(values.filter(value => isScopedUrl(value, details)).map(value => {
            const url = new URL(value);
            url.hash = '';
            return url.toString();
        }))];
}
