const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT || "3000");
const API_KEY = process.env.API_KEY || "";

const app = express();
app.disable("x-powered-by");

// ═══════════════════════════════════════════════════════════════
// CORS — Allow Electron/Desktop apps to fetch from us
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ═══════════════════════════════════════════════════════════════
// SOLVER API — proxies AI requests so they work behind firewalls
// ═══════════════════════════════════════════════════════════════
app.use(express.json({ limit: "5mb" }));

app.post("/__solver_api", async (req, res) => {
    try {
        const payload = req.body.payload;
        let finalKey = API_KEY;
        if (req.body.key && req.body.key.startsWith("gsk_")) {
            finalKey = req.body.key;
        }
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + finalKey,
            },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PROXY SUFFIX — strip this from hostname to get target domain
// ═══════════════════════════════════════════════════════════════
const PROXY_SUFFIXES = ['.chitkara.dns.navy', '.up.railway.app'];

function extractTarget(hostname) {
    for (const suffix of PROXY_SUFFIXES) {
        if (hostname.endsWith(suffix)) {
            const target = hostname.slice(0, -suffix.length);
            if (target) return target;
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// SPEED TEST MOCK — Testpad runs speed.cloudflare.com checks.
// In Electron these fail. Return fake data so the test proceeds.
// ═══════════════════════════════════════════════════════════════
app.use('/__speedmock__', (req, res) => {
    // Return a tiny response that satisfies the speed test
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Server-Timing', 'cfRequestDuration;dur=5');
    res.end(Buffer.alloc(1024)); // 1KB of zeros
});

// ═══════════════════════════════════════════════════════════════
// EXTERNAL PROXY — Proxies requests to external domains that the
// Testpad app calls directly (e.g. infra.assess.testpad...)
// URL format: /__extproxy__/<host>/<path>
// ═══════════════════════════════════════════════════════════════
app.use('/__extproxy__', async (req, res) => {
    try {
        // Extract host from path: /__extproxy__/infra.assess.testpad.chitkara.edu.in/api/foo
        const parts = req.originalUrl.replace('/__extproxy__/', '').split('/');
        const extHost = parts.shift();
        const extPath = '/' + parts.join('/');
        const extUrl = `https://${extHost}${extPath}`;

        console.log(`[ExtProxy] ${extUrl}`);

        const headers = { ...req.headers };
        delete headers.host;
        headers.host = extHost;
        delete headers['accept-encoding']; // Get uncompressed

        const response = await fetch(extUrl, {
            method: req.method,
            headers,
            redirect: 'follow',
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req
        });

        // Copy response headers
        for (const [key, value] of response.headers.entries()) {
            if (!['content-encoding', 'transfer-encoding', 'content-length',
                   'content-security-policy', 'strict-transport-security'].includes(key.toLowerCase())) {
                res.setHeader(key, value);
            }
        }
        res.setHeader('Access-Control-Allow-Origin', '*');

        let data = await response.text();

        // Spoof endTime in API responses
        if (data.includes('"endTime"')) {
            console.log(`[ExtProxy] Spoofing endTime!`);
            data = data.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
        }

        res.status(response.status).send(data);
    } catch (e) {
        console.error('[ExtProxy] Error:', e.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(502).json({ error: 'External proxy error' });
    }
});

// ═══════════════════════════════════════════════════════════════
// REVERSE PROXY — Pure server-side proxying. No service workers,
// no iframes, no bare-mux. Works everywhere including Electron.
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
    // Skip internal routes
    if (req.path.startsWith('/__')) {
        return next();
    }

    const host = req.headers.host || '';
    const target = extractTarget(host);

    if (!target) {
        // Root domain — serve landing page
        return res.sendFile(path.join(__dirname, "public", "index.html"));
    }

    // ─── JSON preflight (Testpad app pre-check) ───
    // The Testpad app fetches ?json=1 before loading. We intercept
    // and spoof the endTime so expired tests appear live.
    if (req.query.json === '1') {
        const targetUrl = `https://${target}${req.originalUrl}`;
        console.log(`[API Proxy] Pre-flight: ${targetUrl}`);

        const headers = { ...req.headers };
        delete headers.host;
        headers.host = target;

        fetch(targetUrl, { method: req.method, headers, redirect: 'follow' })
            .then(async (response) => {
                let data = await response.text();
                // Spoof endTime to 2027 so expired tests work
                if (data.includes('"endTime"')) {
                    console.log(`[API Proxy] Spoofing endTime to 2027!`);
                    data = data.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                }
                // Forward content-type
                const ct = response.headers.get('content-type');
                if (ct) res.setHeader('Content-Type', ct);
                res.status(response.status).send(data);
            })
            .catch((e) => {
                console.error('[API Proxy] Error:', e.message);
                res.status(502).json({ error: 'Proxy error' });
            });
        return;
    }

    // ─── Full reverse proxy for everything else ───
    // Proxy the entire request to the real target server
    const proxyTarget = `https://${target}`;

    const proxy = createProxyMiddleware({
        target: proxyTarget,
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        selfHandleResponse: true,
        on: {
            proxyReq: (proxyReq, req) => {
                // Set the correct Host header for the target
                proxyReq.setHeader('Host', target);
                // Request uncompressed so we can rewrite HTML/JSON
                proxyReq.removeHeader('accept-encoding');
                proxyReq.setHeader('Accept-Encoding', 'identity');
                // Remove headers that would break the proxy
                proxyReq.removeHeader('x-forwarded-host');
                proxyReq.removeHeader('x-forwarded-proto');
                proxyReq.removeHeader('x-forwarded-for');
            },
            proxyRes: (proxyRes, req, res) => {
                // Get content type
                const contentType = proxyRes.headers['content-type'] || '';
                const isHtml = contentType.includes('text/html');
                const isJson = contentType.includes('application/json');
                const isJs = contentType.includes('javascript');
                const isText = isHtml || isJson || isJs || contentType.includes('text/css');

                // Copy response headers (skip problematic ones)
                const skipHeaders = new Set([
                    'content-security-policy', 'content-security-policy-report-only',
                    'x-frame-options', 'strict-transport-security',
                    'content-encoding', 'transfer-encoding', 'content-length'
                ]);
                Object.keys(proxyRes.headers).forEach((key) => {
                    if (skipHeaders.has(key.toLowerCase())) return;
                    res.setHeader(key, proxyRes.headers[key]);
                });

                // Override CORS
                res.setHeader('Access-Control-Allow-Origin', '*');

                // Determine if we need to decompress
                const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
                let stream = proxyRes;
                if (encoding === 'gzip') {
                    stream = proxyRes.pipe(zlib.createGunzip());
                } else if (encoding === 'br') {
                    stream = proxyRes.pipe(zlib.createBrotliDecompress());
                } else if (encoding === 'deflate') {
                    stream = proxyRes.pipe(zlib.createInflate());
                }

                // Collect the (decompressed) response body
                const chunks = [];
                stream.on('data', (chunk) => chunks.push(chunk));
                stream.on('end', () => {
                    let body = Buffer.concat(chunks);

                    if (isText) {
                        let text = body.toString('utf-8');
                        const proxyOrigin = `${req.protocol}://${req.headers.host}`;

                        // ── Rewrite same-domain absolute URLs ──
                        const escapedTarget = target.replace(/\./g, '\\\\.');
                        text = text.replace(new RegExp(`https?://${escapedTarget}`, 'g'), proxyOrigin);

                        // ── Rewrite assess.* variant ──
                        const assessTarget = target.replace('exam.', 'assess.');
                        const escapedAssess = assessTarget.replace(/\./g, '\\\\.');
                        const assessHost = req.headers.host.replace('exam.', 'assess.');
                        text = text.replace(new RegExp(`https?://${escapedAssess}`, 'g'), `${req.protocol}://${assessHost}`);

                        // ── Rewrite infra.assess.testpad.chitkara.edu.in → external proxy ──
                        text = text.replace(/https?:\/\/infra\.assess\.testpad\.chitkara\.edu\.in/g, `${proxyOrigin}/__extproxy__/infra.assess.testpad.chitkara.edu.in`);

                        // ── Rewrite speed.cloudflare.com → our mock ──
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__down/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__up/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com/g, `${proxyOrigin}/__speedmock__`);

                        // ── Spoof endTime in JSON ──
                        if (isJson && text.includes('"endTime"')) {
                            text = text.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                        }

                        // ── Inject performance mock into HTML ──
                        if (isHtml) {
                            const perfMock = `<script>(function(){try{var fake=[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:0,responseEnd:50,name:"https://speed.cloudflare.com/__down?bytes=0",entryType:"resource",initiatorType:"fetch"}];var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return fake};var p=performance.getEntries;performance.getEntries=function(){var r=p.call(performance);return r.concat(fake)};}catch(e){}})(); navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));</script>`;
                            text = text.replace(/<head([^>]*)>/i, `<head$1>${perfMock}`);
                        }

                        // ── Disable target Service Workers ──
                        // The testpad app has a __sw.js that breaks CORS on our proxy.
                        text = text.replace(/navigator\.serviceWorker\.register/g, 'Promise.reject("SW Disabled").catch');

                        res.statusCode = proxyRes.statusCode;
                        res.end(text);
                    } else {
                        // Binary/other — pass through as-is
                        res.statusCode = proxyRes.statusCode;
                        res.end(body);
                    }
                });
            },
            error: (err, req, res) => {
                console.error('[Proxy Error]', err.message);
                if (!res.headersSent) {
                    res.status(502).send('Proxy Error');
                }
            }
        }
    });

    proxy(req, res, next);
});

// ═══════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════
const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Reverse proxy server running on port ${PORT}`);
});
