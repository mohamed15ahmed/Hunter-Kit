// Loopback-only HTTP response fixtures, never a public scan target.
// CVE/default-login/takeover pages mimic matcher signatures, not real deployed products.
import http from 'node:http';
export async function fixtureServer() {
  const state = { vulnerable: true, requests: [] as string[], slow: false };
  const server = http.createServer((req, res) => {
    state.requests.push(req.url || '/');
    const u = new URL(req.url || '/', 'http://localhost');
    let status = 200, type = 'text/html', body = '';
    if (u.pathname === '/lab/' || u.pathname === '/') {
      body = `<html><title>HunterKit local fixture</title>
      <a href="/lab/sqli?id=1">SQLi</a><a href="/lab/lfi?file=welcome.txt">LFI</a>
      <script src="/lab/app.js"></script><form action="/lab/search" method="GET"><input name="q" value="hello"></form>
      <a href="http://outside.invalid/offscope?q=test">external link</a>
      <form action="http://outside.invalid/search"><input name="q" value="test"></form>
      <form action="/login" method="POST"><input type="password" name="pass"></form>
      ${state.vulnerable ? 'No Site For Domain' : ''}</html>`;
    } else if (u.pathname === '/lab/search') {
      let q = u.searchParams.get('q') || '';
      if (!state.vulnerable) q = q.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      body = `<html><body>Search: ${q}</body></html>`;
    } else if (u.pathname === '/lab/sqli') {
      type = 'text/plain';
      body = state.vulnerable && /['";]/.test(u.searchParams.get('id') || '') ? 'sqlite3.OperationalError: unrecognized token' : 'Example row 1';
    } else if (u.pathname === '/lab/lfi') {
      type = 'text/plain';
      body = state.vulnerable && (u.searchParams.get('file') || '').includes('etc/passwd') ? 'root:x:0:0:fixture:/root:/bin/sh\n' : 'Welcome';
    } else if (state.vulnerable && /phpmyadmin\/?$/i.test(u.pathname)) {
      body = '<html><img alt="phpMyAdmin"><input name="pma_username"></html>';
    } else if (state.vulnerable && u.pathname.endsWith('/.env')) {
      type = 'text/plain'; body = 'APP_NAME=HunterKitFixture\nAPP_ENV=testing\n';
    } else if (state.vulnerable && u.pathname.endsWith('/admin/') && req.headers.authorization === 'Basic ' + Buffer.from('admin:admin').toString('base64')) {
      body = 'Welcome to the Apache ActiveMQ Console of <b>fixture</b><h2>Broker</h2>';
    } else if (state.vulnerable && req.url?.includes('etc/passwd')) {
      type = 'text/plain'; body = 'root:x:0:0:fixture:/root:/bin/sh\n';
    } else if (u.pathname === '/lab/app.js') {
      type = 'application/javascript'; body = 'const endpoint = "/api/demo"; const marker = "hunterkit-fixture"; const aws_access_key_id = "AKIA0000000000000000";';
    } else { status = 404; body = 'Not found'; }
    const send = () => { res.writeHead(status, { 'Content-Type': type }); res.end(body); };
    if (state.slow) setTimeout(send, 2000); else send();
  });
  await new Promise<void>(resolve => server.listen(0, '::', resolve));
  const port = (server.address() as any).port;
  return { state, base: `http://localhost:${port}`, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
