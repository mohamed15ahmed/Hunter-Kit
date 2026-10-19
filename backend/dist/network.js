import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { getProxyForUrl } from 'proxy-from-env';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
let windowsProxy;
function loopback(host) { return host === 'localhost' || host === '[::1]' || /^127\./.test(host); }
function bypasses(value, target) {
    return value.split(/[;,]/).map(x => x.trim().toLowerCase()).filter(Boolean).some(entry => {
        if (entry === '*')
            return true;
        if (entry === '<local>')
            return !target.hostname.includes('.') || loopback(target.hostname);
        const host = target.hostname.toLowerCase();
        if (entry.startsWith('*.'))
            return host.endsWith(entry.slice(1));
        return entry === host || entry === target.host.toLowerCase();
    });
}
function readWindowsProxy() {
    if (process.platform !== 'win32')
        return Promise.resolve(null);
    if (windowsProxy && windowsProxy.expires > Date.now())
        return windowsProxy.promise;
    const command = "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $s=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop; [pscustomobject]@{enabled=([bool]$s.ProxyEnable);server=([string]$s.ProxyServer);bypass=([string]$s.ProxyOverride);pacDetected=([bool]$s.AutoConfigURL)} | ConvertTo-Json -Compress";
    const promise = new Promise(resolve => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
            if (error)
                return resolve(null);
            try {
                resolve(JSON.parse(stdout));
            }
            catch {
                resolve(null);
            }
        });
    });
    windowsProxy = { expires: Date.now() + 60000, promise };
    return promise;
}
function validateProxy(value) {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol))
        throw new Error('Proxy must use HTTP, HTTPS or SOCKS5.');
    return url.toString().replace(/\/$/, '');
}
export async function proxyRoute(target) {
    const explicit = process.env.HUNTERKIT_PROXY?.trim();
    if (explicit?.toLowerCase() === 'direct')
        return { url: '', source: 'explicit direct connection' };
    if (explicit)
        return { url: validateProxy(explicit), source: 'HUNTERKIT_PROXY' };
    const inherited = getProxyForUrl(target);
    if (inherited)
        return { url: validateProxy(inherited), source: 'proxy environment / NO_PROXY' };
    const parsed = new URL(target);
    const noProxy = process.env.no_proxy || process.env.NO_PROXY || '';
    if (loopback(parsed.hostname) || bypasses(noProxy, parsed))
        return { url: '', source: 'local / NO_PROXY bypass' };
    const system = await readWindowsProxy();
    if (!system?.enabled || !system.server || bypasses(system.bypass || '', parsed)) {
        return { url: '', source: 'direct', pacDetected: Boolean(system?.pacDetected) };
    }
    const protocol = parsed.protocol.slice(0, -1);
    const parts = system.server.split(';').map(x => x.trim()).filter(Boolean);
    const matching = parts.find(part => part.startsWith(`${protocol}=`));
    const value = matching ? matching.slice(protocol.length + 1) : parts.find(part => !part.includes('='));
    return value ? { url: validateProxy(value), source: 'Windows static proxy', pacDetected: system.pacDetected } : { url: '', source: 'direct', pacDetected: system.pacDetected };
}
export async function axiosTransport(target, allowSelfSigned = false) {
    const route = await proxyRoute(target);
    if (route.url.startsWith('socks5'))
        throw new Error('Node discovery does not support SOCKS5 yet. Configure an HTTP proxy for all tools.');
    return {
        proxy: false,
        httpAgent: route.url ? new HttpProxyAgent(route.url) : new http.Agent(),
        httpsAgent: route.url ? new HttpsProxyAgent(route.url) : new https.Agent({ rejectUnauthorized: !allowSelfSigned }),
    };
}
// CLI tools do not all inherit browser/Windows proxy settings. Pass one resolved route explicitly.
export async function scannerTransport(targets, tool) {
    const routes = await Promise.all(targets.map(target => proxyRoute(target)));
    const unique = [...new Set(routes.map(route => route.url))];
    if (unique.length > 1)
        throw new Error('Selected targets require different proxy routes. Split them into separate projects so every scanner uses the correct connection.');
    const route = routes[0] || { url: '', source: 'direct' };
    return { route, args: route.url ? [tool === 'nuclei' ? '-proxy' : '--proxy', route.url] : [], env: { HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '', http_proxy: '', https_proxy: '', all_proxy: '' } };
}
export function redactNetworkText(value) {
    return value.replace(/\b(https?|socks5h?):\/\/([^\s/@]+(?::[^\s/@]*)?)@/gi, '$1://[redacted]@');
}
export function networkCause(raw) {
    const text = raw.replace(/\x1b\[[0-9;]*m/g, '');
    if (/407|proxy authentication/i.test(text))
        return { code: 'PROXY_AUTH', message: 'The configured proxy requires authentication.' };
    if (/no such host|no address found for host|ENOTFOUND|EAI_AGAIN|lookup .*failed|dns.*(?:fail|error)/i.test(text))
        return { code: 'DNS', message: 'The scanner could not resolve the target hostname.' };
    if (/certificate|x509|CERT_|tls.*(?:fail|error)|handshake/i.test(text))
        return { code: 'TLS', message: 'The HTTPS/TLS connection could not be established.' };
    if (/ECONNREFUSED|connection refused|actively refused|connectex/i.test(text))
        return { code: 'CONNECTION_REFUSED', message: 'The target port refused the connection or the local network policy denied it.' };
    if (/timeout|timed out|deadline|UNREACHABLE/i.test(text))
        return { code: 'TIMEOUT', message: 'The scanner timed out while connecting to the target.' };
    if (/proxy|CONNECT tunnel/i.test(text))
        return { code: 'PROXY', message: 'The proxy could not establish a connection to the target.' };
    return { code: 'NETWORK', message: 'The scanner could not complete an HTTP connection to the target.' };
}
