const https = require('https');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'D4D proxy is running' }));
    return;
  }

  if (parsed.pathname !== '/fetch') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. Use /fetch?url=YOUR_URL' }));
    return;
  }

  const targetUrl = parsed.query.url;
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No URL provided' }));
    return;
  }

  let parsedTarget;
  try { parsedTarget = new URL(targetUrl); } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid URL' }));
    return;
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };

  function doRequest(targetParsed, cb) {
    const proto = targetParsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: targetParsed.hostname,
      port: targetParsed.port || (targetParsed.protocol === 'https:' ? 443 : 80),
      path: targetParsed.pathname + targetParsed.search,
      method: 'GET',
      headers,
      timeout: 10000
    };
    const r = proto.request(opts, (fetchRes) => {
      if (fetchRes.statusCode >= 300 && fetchRes.statusCode < 400 && fetchRes.headers.location) {
        const loc = fetchRes.headers.location;
        const full = loc.startsWith('http') ? loc : `${targetParsed.protocol}//${targetParsed.hostname}${loc}`;
        try { doRequest(new URL(full), cb); } catch(e) { cb(null, e.message); }
        return;
      }
      let data = '';
      fetchRes.on('data', chunk => { data += chunk; });
      fetchRes.on('end', () => cb(data, null));
    });
    r.on('error', e => cb(null, e.message));
    r.on('timeout', () => { r.destroy(); cb(null, 'Request timed out'); });
    r.end();
  }

  doRequest(parsedTarget, (html, err) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err }));
      return;
    }
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s{2,}/g, ' ').trim().slice(0, 8000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text, source: targetUrl }));
  });
});

server.listen(PORT, () => console.log(`D4D proxy running on port ${PORT}`));
