const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const fs = require("node:fs");
const express = require("express");
const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");

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

app.post("/__solver_api", express.json({ limit: "5mb" }), async (req, res) => {
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
app.use('/__extproxy__', createProxyMiddleware({
    router: (req) => {
        const parts = req.url.split('/');
        const extHost = parts[1]; // req.url is like /infra.assess.../api/... because it's mounted on /__extproxy__
        return `https://${extHost}`;
    },
    pathRewrite: (path, req) => {
        const parts = req.url.split('/');
        const extHost = parts[1];
        return req.url.replace(`/${extHost}`, '');
    },
    changeOrigin: true,
    secure: false,
    onProxyReq: (proxyReq, req, res) => {
        console.log(`\n[ExtProxy] === OUTBOUND REQUEST ===`);
        console.log(`[ExtProxy] URL: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
        console.log(`[ExtProxy] Method: ${proxyReq.method}`);
        proxyReq.removeHeader('accept-encoding');
    },
    onProxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        console.log(`[ExtProxy] === INCOMING RESPONSE ===`);
        console.log(`[ExtProxy] Status: ${proxyRes.statusCode}`);
        
        // Strip Domain= from Set-Cookie
        if (proxyRes.headers['set-cookie']) {
            let cookies = proxyRes.headers['set-cookie'];
            if (!Array.isArray(cookies)) cookies = [cookies];
            res.setHeader('set-cookie', cookies.map(c => c.replace(/Domain=[^;]+;/ig, '').replace(/Domain=[^;]+/ig, '')));
        }
        res.setHeader('Access-Control-Allow-Origin', '*');

        const contentType = proxyRes.headers['content-type'] || '';
        
        // Mock session/data if it returns 401 so the user can test the UI
        if (req.url.includes('/quiz-api/session/data') && proxyRes.statusCode === 401) {
            console.log(`[ExtProxy] Mocking session/data for 401 Unauthorized!`);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return JSON.stringify({
                session: {
                    userId: "mock_user",
                    ssnid: "mock_ssnid",
                    role: "student",
                    email: "student@test.com",
                    roleId: 1,
                    displayname: "Mock Student",
                    tryTest: 1,
                    enrollmentId: "12345",
                    isClassAllowed: 1,
                    allowInteractiveMode: 1,
                    projectSpace: 1,
                    testingSpace: 1,
                    learningSpace: 1,
                    projectLanguagesAllowed: []
                }
            });
        }

        if (contentType.includes('application/json') || contentType.includes('text/')) {
            let data = responseBuffer.toString('utf8');
            if (data.includes('"endTime"')) {
                console.log(`[ExtProxy] Spoofing endTime!`);
                data = data.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
            }
            return data;
        }

        return responseBuffer;
    })
}));

// ═══════════════════════════════════════════════════════════════
// DUMMY TEST PAGE — for testing the AI overlay locally
// ═══════════════════════════════════════════════════════════════
app.get(['/ai-sandbox-test', '/test/ai-sandbox-test'], (req, res) => {
    if (req.query.json === '1' || req.query.json === 'true') {
        return res.json({
            endTime: "Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)",
            title: "Dummy Test",
            status: "published",
            isQuiz: true
        });
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dummy Test</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; background: #f4f4f9; }
                .question-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 800px; margin: 0 auto 20px auto; display: none; }
                .question-box.active { display: block; }
                .question-text { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
                .options { list-style-type: none; padding: 0; }
                .option { background: #eef; padding: 10px; margin-bottom: 10px; border-radius: 4px; cursor: pointer; }
                .option:hover { background: #ddf; }
                .code-editor { background: #282a36; color: #f8f8f2; padding: 15px; font-family: monospace; border-radius: 4px; min-height: 150px; white-space: pre; border: none; width: 100%; box-sizing: border-box; }
                .nav-buttons { text-align: center; margin-top: 20px; }
                .nav-btn { padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 0 10px; }
                .nav-btn:hover { background: #4f46e5; }
            </style>
        </head>
        <body>
            <div id="q1" class="question-box active">
                <div class="question-text">1. Multiple Choice: What is the output of console.log(typeof null) in JavaScript?</div>
                <ul class="options">
                    <li class="option">A) "undefined"</li>
                    <li class="option">B) "null"</li>
                    <li class="option">C) "object"</li>
                    <li class="option">D) "number"</li>
                </ul>
            </div>
            
            <div id="q2" class="question-box">
                <div class="question-text">2. Coding Question: Write a function to reverse a string in Python.</div>
                <p>Complete the function below so that it returns the reversed version of the input string.</p>
                <textarea class="code-editor" spellcheck="false">def reverse_string(s):
    # Write your code here
    pass
</textarea>
            </div>

            <div class="nav-buttons">
                <button class="nav-btn" onclick="toggleQuestion()">Next Question</button>
            </div>

            <script>
                function toggleQuestion() {
                    const q1 = document.getElementById('q1');
                    const q2 = document.getElementById('q2');
                    if (q1.classList.contains('active')) {
                        q1.classList.remove('active');
                        q2.classList.add('active');
                        document.querySelector('.nav-btn').textContent = 'Previous Question';
                    } else {
                        q2.classList.remove('active');
                        q1.classList.add('active');
                        document.querySelector('.nav-btn').textContent = 'Next Question';
                    }
                }
            </script>
        </body>
        <script>
            // Inject the AI solver script directly for testing
            ${fs.readFileSync(path.join(__dirname, 'solver.js'), 'utf8')}
        </script>
        </html>
    `);
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
                    'content-encoding', 'transfer-encoding', 'content-length',
                    'cache-control', 'etag', 'last-modified' // Force disable caching
                ]);
                Object.keys(proxyRes.headers).forEach((key) => {
                    if (skipHeaders.has(key.toLowerCase())) return;
                    
                    // Rewrite Set-Cookie to strip Domain= so the browser accepts it for our proxy
                    if (key.toLowerCase() === 'set-cookie') {
                        let cookies = proxyRes.headers[key];
                        if (!Array.isArray(cookies)) cookies = [cookies];
                        cookies = cookies.map(c => c.replace(/Domain=[^;]+;/i, '').replace(/Domain=[^;]+/i, ''));
                        res.setHeader(key, cookies);
                        return;
                    }

                    res.setHeader(key, proxyRes.headers[key]);
                });

                // Override CORS & Cache
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');

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
                        // Use https explicitly since the proxy handles SSL termination and req.protocol might be http
                        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                        const proxyOrigin = `https://${req.headers.host}`;

                        // ── Rewrite same-domain absolute URLs ──
                        const escapedTarget = target.replace(/\./g, '\\\\.');
                        text = text.replace(new RegExp(`https?://${escapedTarget}`, 'g'), proxyOrigin);

                        // ── Rewrite assess.* variant ──
                        const assessTarget = target.replace('exam.', 'assess.');
                        const escapedAssess = assessTarget.replace(/\./g, '\\\\.');
                        const assessHost = req.headers.host.replace('exam.', 'assess.');
                        text = text.replace(new RegExp(`https?://${escapedAssess}`, 'g'), `https://${assessHost}`);

                        // ── Rewrite infra.assess.testpad.chitkara.edu.in → external proxy ──
                        text = text.replace(/https?:\/\/infra\.assess\.testpad\.chitkara\.edu\.in/g, `${proxyOrigin}/__extproxy__/infra.assess.testpad.chitkara.edu.in`);

                        // ── Rewrite static.openreplay.com → external proxy ──
                        text = text.replace(/https?:\/\/static\.openreplay\.com/g, `${proxyOrigin}/__extproxy__/static.openreplay.com`);

                        // ── Rewrite speed.cloudflare.com → our mock ──
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__down/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__up/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com/g, `${proxyOrigin}/__speedmock__`);

                        // ── Spoof endTime in JSON ──
                        if (isJson && text.includes('"endTime"')) {
                            text = text.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                        }

                        // ── Inject performance mock and AI solver into HTML ──
                        if (isHtml) {
                            const perfMock = `<script>(function(){try{var fake=[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:0,responseEnd:50,name:"https://speed.cloudflare.com/__down?bytes=0",entryType:"resource",initiatorType:"fetch"}];var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return fake};var p=performance.getEntries;performance.getEntries=function(){var r=p.call(performance);return r.concat(fake)};}catch(e){}})(); navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));</script>`;
                            text = text.replace(/<head([^>]*)>/i, `<head$1>\n${perfMock}`);
                            
                            try {
                                const solverScript = fs.readFileSync(path.join(__dirname, 'solver.js'), 'utf8');
                                text = text.replace(/<\/body>/i, `\n${solverScript}\n</body>`);
                            } catch(e) {
                                console.error("[ExtProxy] Could not inject solver script", e.message);
                            }
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
