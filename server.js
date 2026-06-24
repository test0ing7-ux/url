const http = require("node:http");
const path = require("node:path");
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

                // Copy response headers
                Object.keys(proxyRes.headers).forEach((key) => {
                    // Skip headers that would break things
                    if (['content-security-policy', 'content-security-policy-report-only',
                         'x-frame-options', 'strict-transport-security',
                         'content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) {
                        return;
                    }
                    res.setHeader(key, proxyRes.headers[key]);
                });

                // Override CORS
                res.setHeader('Access-Control-Allow-Origin', '*');

                // Collect the response body
                const chunks = [];
                proxyRes.on('data', (chunk) => chunks.push(chunk));
                proxyRes.on('end', () => {
                    let body = Buffer.concat(chunks);

                    if (isHtml) {
                        let html = body.toString('utf-8');

                        // Rewrite absolute URLs in HTML so they stay on our proxy
                        // e.g. https://exam.testpad.chitkarauniversity.edu.in/... 
                        //    → https://exam.testpad.chitkarauniversity.edu.in.chitkara.dns.navy/...
                        const escapedTarget = target.replace(/\./g, '\\.');
                        const urlRegex = new RegExp(`https?://${escapedTarget}`, 'g');
                        const proxyOrigin = `${req.protocol}://${req.headers.host}`;
                        html = html.replace(urlRegex, proxyOrigin);

                        // Also rewrite the assess.* variant that the app uses
                        const assessTarget = target.replace('exam.', 'assess.');
                        const escapedAssess = assessTarget.replace(/\./g, '\\.');
                        const assessRegex = new RegExp(`https?://${escapedAssess}`, 'g');
                        const assessHost = req.headers.host.replace('exam.', 'assess.');
                        html = html.replace(assessRegex, `${req.protocol}://${assessHost}`);

                        // Inject performance mock for Testpad speed test
                        const perfMock = `<script>(function(){try{var fake=[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:0,responseEnd:50,name:"https://speed.cloudflare.com/__down?bytes=0",entryType:"resource",initiatorType:"fetch"}];var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return fake};var p=performance.getEntries;performance.getEntries=function(){var r=p.call(performance);return r.concat(fake)};}catch(e){}})()</script>`;
                        html = html.replace(/<head([^>]*)>/i, `<head$1>${perfMock}`);

                        res.statusCode = proxyRes.statusCode;
                        res.end(html);
                    } else if (isJson) {
                        let json = body.toString('utf-8');
                        // Spoof endTime in JSON responses too
                        if (json.includes('"endTime"')) {
                            json = json.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                        }
                        res.statusCode = proxyRes.statusCode;
                        res.end(json);
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
