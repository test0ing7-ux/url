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
const API_KEY = process.env.GROQ_API_KEY || process.env.API_KEY || "";
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || '';

function getProxyUrlForDomain(targetDomain, proxyOrigin) {
    return `${proxyOrigin}/__extproxy__/${targetDomain}`;
}

const app = express();
app.disable("x-powered-by");

// ═══════════════════════════════════════════════════════════════
// CORS — Allow Electron/Desktop apps to fetch from us
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// ═══════════════════════════════════════════════════════════════
// REFERER REWRITER — Fixes relative paths from __extproxy__ iframes
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
    if (!req.url.startsWith('/__extproxy__') && req.headers.referer) {
        const match = req.headers.referer.match(/\/__extproxy__\/([a-zA-Z0-9.-]+)\//);
        if (match) {
            const extDomain = match[1];
            return res.redirect(307, `/__extproxy__/${extDomain}${req.url}`);
        }
    }
    next();
});

// ═══════════════════════════════════════════════════════════════
// CADDY ON-DEMAND TLS CHECK — Caddy asks us before issuing a
// certificate: "should I get a cert for this domain?" We only
// approve domains that end with our PROXY_DOMAIN.
// ═══════════════════════════════════════════════════════════════
app.get('/__caddy_check', (req, res) => {
    const domain = req.query.domain || '';
    if (!PROXY_DOMAIN) return res.sendStatus(403);
    if (domain === PROXY_DOMAIN || domain.endsWith('.' + PROXY_DOMAIN)) {
        return res.sendStatus(200);
    }
    res.sendStatus(403);
});

// Health check for monitoring
app.get('/__health', (req, res) => {
    res.json({ status: 'ok', domain: PROXY_DOMAIN });
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
// TARGET EXTRACTION
// Hardcoded to testpad for direct domain (edvu.in) access.
// Also supports subdomain-based routing as fallback.
// ═══════════════════════════════════════════════════════════════
const HARDCODED_TARGET = 'exam.testpad.chitkarauniversity.edu.in';

function getOriginalHost(req) {
    let host = req.headers['cf-worker'] || req.headers['x-forwarded-host'] || req.headers.host || '';
    // If the request was routed via a subdomain, Cloudflare worker sets x-target-domain but loses the original host.
    // We reconstruct it to avoid cross-origin issues in the rewritten HTML.
    if (req.headers['x-target-domain'] && req.headers['cf-worker']) {
        host = req.headers['x-target-domain'].replace(/\./g, '-') + '.' + req.headers['cf-worker'];
    }
    return host;
}

function extractTarget(req) {
    let target = HARDCODED_TARGET;
    
    if (req.headers['x-target-domain']) {
        target = req.headers['x-target-domain'];
    } else {
        const hostname = getOriginalHost(req);
        
        // If PROXY_DOMAIN is set and request uses subdomains, decode them
        if (PROXY_DOMAIN && hostname !== PROXY_DOMAIN && hostname !== 'www.' + PROXY_DOMAIN) {
            const suffix = '.' + PROXY_DOMAIN;
            if (hostname.endsWith(suffix)) {
                const encoded = hostname.slice(0, -suffix.length);
                if (encoded) target = encoded.replace(/-/g, '.');
            }
        }
    }
    
    // Testpad React app sometimes makes relative requests to /quiz-api/ 
    // which incorrectly hit exam.testpad (frontend) instead of infra.assess (backend API)
    if (target.startsWith('exam.testpad') && req.url.includes('/quiz-api/')) {
        target = target.replace('exam.testpad', 'infra.assess.testpad');
    }
    
    return target;
}

// ═══════════════════════════════════════════════════════════════
// SPEED TEST MOCK — Testpad runs speed.cloudflare.com checks.
// In Electron these fail. Return fake data so the test proceeds.
// ═══════════════════════════════════════════════════════════════
// MOCK TEST ENVIRONMENT
// ═══════════════════════════════════════════════════════════════
app.get('/mock-test', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    let html = fs.readFileSync(path.join(__dirname, 'mock-test.html'), 'utf8');
    
    // Inject solver script
    try {
        let solverScript = fs.readFileSync(path.join(__dirname, 'solver.js'), 'utf8');
        solverScript = solverScript.replace('${API_KEY}', API_KEY);
        html = html.replace(/<\/body>/i, `\n<script id="proxy-solver">\n${solverScript}\n</script>\n</body>`);
    } catch(e) {
        console.error("Could not inject solver script into mock test", e.message);
    }
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
});

// ═══════════════════════════════════════════════════════════════
app.use('/__speedmock__', (req, res) => {
    // Return a tiny response that satisfies the speed test
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Server-Timing', 'cfRequestDuration;dur=5');
    res.end(Buffer.alloc(1024)); // 1KB of zeros
});

app.all('/__debug', (req, res) => res.json(req.headers));

// ═══════════════════════════════════════════════════════════════
// EXTERNAL PROXY — Proxies requests to external domains that the
// Testpad app calls directly (e.g. infra.assess.testpad...)
// URL format: /__extproxy__/<host>/<path>
// ═══════════════════════════════════════════════════════════════
app.use('/__extproxy__', createProxyMiddleware({
    router: (req) => {
        const parts = req.url.split('/');
        const extHost = parts[1];
        return `https://${extHost}`;
    },
    pathRewrite: (path, req) => {
        const parts = req.url.split('/');
        const extHost = parts[1];
        return req.url.replace(`/${extHost}`, '');
    },
    changeOrigin: true,
    secure: false,
    selfHandleResponse: true,
    on: {
        proxyReq: (proxyReq, req) => {
            const parts = req.url.split('/');
            const extHost = parts[1];
            console.log(`\n[ExtProxy] >>> ${req.method} ${req.url} -> ${extHost}`);
            proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
            const badHeaders = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'cf-ray', 'cf-connecting-ip', 'cf-visitor', 'cf-ipcountry', 'x-real-ip', 'true-client-ip', 'cf-worker', 'cf-ew-via', 'x-railway-edge', 'x-railway-request-id', 'x-request-start'];
            for (const h of badHeaders) proxyReq.removeHeader(h);
            
            if (proxyReq.getHeader('origin')) proxyReq.setHeader('Origin', `https://${extHost}`);
            if (proxyReq.getHeader('referer')) proxyReq.setHeader('Referer', `https://${extHost}/`);
            const browserCookies = req.headers.cookie || '';
            if (browserCookies) proxyReq.setHeader('Cookie', browserCookies);
        },
        proxyRes: (proxyRes, req, res) => {
            const parts = req.url.split('/');
            const extHost = parts[1];
            console.log(`[ExtProxy] <<< ${proxyRes.statusCode} ${req.url}`);

            // Store cookies in server-side jar
            if (proxyRes.headers['set-cookie']) {
                let sc = proxyRes.headers['set-cookie'];
                if (!Array.isArray(sc)) sc = [sc];
                // storeCookies(extHost, sc); // Removed
            }

            const contentType = proxyRes.headers['content-type'] || '';
            const isHtml = contentType.includes('text/html');
            const isJson = contentType.includes('application/json');
            const isJs = contentType.includes('javascript') || req.url.includes('.js');
            const isText = isHtml || isJson || isJs || contentType.includes('text/css') || req.url.includes('.css');

            // ── Copy headers, skip dangerous ones ──
            const skipHeaders = new Set([
                'content-security-policy', 'content-security-policy-report-only',
                'x-frame-options', 'strict-transport-security',
                'content-encoding', 'transfer-encoding', 'content-length',
            ]);
            Object.keys(proxyRes.headers).forEach((key) => {
                if (skipHeaders.has(key.toLowerCase())) return;

                // Rewrite Location
                if (key.toLowerCase() === 'location') {
                    let loc = proxyRes.headers[key];
                    const proxyOrigin = `https://${getOriginalHost(req)}`;
                    // Rewrite absolute testpad URLs
                    loc = loc.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkarauniversity\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                    loc = loc.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkara\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                    // Rewrite relative redirects (e.g. /login -> /__extproxy__/host/login)
                    if (loc.startsWith('/') && !loc.startsWith('/__extproxy__')) {
                        loc = `/__extproxy__/${extHost}${loc}`;
                    }
                    res.setHeader(key, loc);
                    return;
                }

                // Rewrite Set-Cookie
                if (key.toLowerCase() === 'set-cookie') {
                    let cookies = proxyRes.headers[key];
                    if (!Array.isArray(cookies)) cookies = [cookies];
                    cookies = cookies.map(c => {
                        const hasHttpOnly = /;\s*httponly/i.test(c);
                        let nc = c
                            .replace(/;\s*domain=[^;]*/gi, '')
                            .replace(/;\s*secure/gi, '')
                            .replace(/;\s*samesite=[^;]*/gi, '')
                            .replace(/;\s*httponly/gi, '')
                            .replace(/;\s*path=[^;]*/gi, '');
                        nc += '; Path=/; Secure; SameSite=None';
                        if (PROXY_DOMAIN) {
                            nc += `; Domain=.${PROXY_DOMAIN}`;
                        }
                        if (hasHttpOnly) nc += '; HttpOnly';
                        return nc;
                    });
                    res.setHeader(key, cookies);
                    return;
                }

                res.setHeader(key, proxyRes.headers[key]);
            });

            // Override CORS
            res.setHeader('Access-Control-Allow-Origin', '*');

            // ── Decompress the response body ──
            const encoding = (proxyRes.headers['content-encoding'] || '').toLowerCase();
            let stream = proxyRes;
            if (encoding === 'gzip') {
                stream = proxyRes.pipe(zlib.createGunzip());
            } else if (encoding === 'br') {
                stream = proxyRes.pipe(zlib.createBrotliDecompress());
            } else if (encoding === 'deflate') {
                stream = proxyRes.pipe(zlib.createInflate());
            }

            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                let body = Buffer.concat(chunks);



                if (isText) {
                    let text = body.toString('utf-8');
                    // Spoof endTime
                    if (text.includes('"endTime"')) {
                        text = text.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                    }
                    if (isHtml) {
                        const baseTag = !PROXY_DOMAIN ? `<base href="/__extproxy__/${extHost}/">` : '';
                        if (baseTag) {
                            if (text.match(/<head(>|\s[^>]*>)/i)) {
                                text = text.replace(/<head(>|\s[^>]*>)/i, (match, p1) => `<head${p1}\n${baseTag}`);
                            } else {
                                text = `${baseTag}\n${text}`;
                            }
                        }
                    }
                    res.statusCode = proxyRes.statusCode;
                    res.end(text);
                } else {
                    res.statusCode = proxyRes.statusCode;
                    res.end(body);
                }
            });
            stream.on('error', (err) => {
                console.error('[ExtProxy] Stream error:', err.message);
                if (!res.headersSent) res.status(502).send('ExtProxy stream error');
            });
        },
        error: (err, req, res) => {
            console.error('[ExtProxy Error]', err.message);
            if (!res.headersSent) res.status(502).send('ExtProxy Error');
        }
    }
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
                    <li class="option"><label><input type="radio" name="q1" value="A"> A) "undefined"</label></li>
                    <li class="option"><label><input type="radio" name="q1" value="B"> B) "null"</label></li>
                    <li class="option"><label><input type="radio" name="q1" value="C"> C) "object"</label></li>
                    <li class="option"><label><input type="radio" name="q1" value="D"> D) "number"</label></li>
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
        <!-- Inject the AI solver script directly for testing -->
        <script id="proxy-solver">
            ${fs.readFileSync(path.join(__dirname, 'solver.js'), 'utf8').replace('${API_KEY}', API_KEY)}
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

    const host = getOriginalHost(req);
    const target = extractTarget(req);

    // ─── JSON preflight (Testpad app pre-check) ───
    // The Testpad app fetches ?json=1 before loading. We intercept
    // and spoof the endTime so expired tests appear live.
    if (req.query.json === '1' || req.query.json === 1) {
        let targetUrl;
        let targetHost = target;
        let reqUrl = req.originalUrl;
        
        if (req.originalUrl.startsWith('/__extproxy__/')) {
            const match = req.originalUrl.match(/^\/__extproxy__\/([^\/]+)(.*)$/);
            if (match) {
                targetHost = match[1];
                reqUrl = match[2];
            }
        }
        
        targetUrl = `https://${targetHost}${reqUrl}`;
        console.log(`[API Proxy] Pre-flight: ${targetUrl}`);

        const headers = { ...req.headers };
        delete headers.host;
        headers.host = targetHost;
        // Remove Cloudflare/Railway infrastructure headers to avoid Error 1000
        const badHeaders = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'cf-ray', 'cf-connecting-ip', 'cf-visitor', 'cf-ipcountry', 'x-real-ip', 'true-client-ip', 'cf-worker', 'cf-ew-via', 'x-railway-edge', 'x-railway-request-id', 'x-request-start', 'x-target-domain'];
        for (const h of badHeaders) delete headers[h];
        // Set proper origin/referer
        headers.origin = `https://${targetHost}`;
        headers.referer = `https://${targetHost}/`;
        // Merge browser cookies with server-side jar
        const browserCookies = req.headers.cookie || '';
        headers.cookie = browserCookies;
        console.log(`[API Proxy] Cookies: ${headers.cookie ? headers.cookie.substring(0, 80) : 'NONE'}`);

        fetch(targetUrl, { method: req.method, headers, redirect: 'manual' })
            .then(async (response) => {
                // If it's a redirect, we MUST forward the redirect to the browser so the React app
                // sees rawResponse.redirected = true and navigates to the login page!
                if (response.status >= 300 && response.status < 400) {
                    const loc = response.headers.get('location');
                    if (loc) res.setHeader('Location', loc);
                    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
                    if (setCookies.length > 0) {
                        res.setHeader('Set-Cookie', setCookies);
                    }
                    return res.status(response.status).end();
                }

                let data = await response.text();
                // Spoof endTime to 2027 so expired tests work
                if (data.includes('"endTime"') || data.includes('"isExpired"') || data.includes('"isAppOnly"')) {
                    if (data.match(/"isExpired":\s*(true|1|"true")/i) || data.match(/"status":"EXPIRED"/i)) {
                        console.log(`[API Proxy] Spoofing test expiration details!`);
                        data = data.replace(/"endTime":"[^"]+"/g, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                        data = data.replace(/"endTime":\d+/g, '"endTime":1809239400000');
                        data = data.replace(/"isExpired":\s*(true|1|"true")/gi, '"isExpired":false');
                        data = data.replace(/"status":"EXPIRED"/gi, '"status":"LIVE"');
                    }
                    data = data.replace(/"isAppOnly":\s*(true|1|"true")/gi, '"isAppOnly":false');
                }
                // Forward content-type
                const ct = response.headers.get('content-type');
                if (ct) res.setHeader('Content-Type', ct);
                // Rewrite Set-Cookie headers
                const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
                if (setCookies.length > 0) {
                    const rewritten = setCookies.map(c => {
                        const hasHttpOnly = /;\s*httponly/i.test(c);
                        let nc = c
                            .replace(/;\s*domain=[^;]*/gi, '')
                            .replace(/;\s*secure/gi, '')
                            .replace(/;\s*samesite=[^;]*/gi, '')
                            .replace(/;\s*httponly/gi, '')
                            .replace(/;\s*path=[^;]*/gi, '');
                        nc += '; Path=/; Secure; SameSite=None';
                        if (PROXY_DOMAIN) {
                            nc += `; Domain=.${PROXY_DOMAIN}`;
                        }
                        if (hasHttpOnly) nc += '; HttpOnly';
                        return nc;
                    });
                    res.setHeader('Set-Cookie', rewritten);
                }
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
        followRedirects: false,
        selfHandleResponse: true,
        on: {
            proxyReq: (proxyReq, req) => {
                try {
                    // Set the correct Host header for the target
                    proxyReq.setHeader('Host', target);
                    // Merge browser cookies
                    const browserCookies = req.headers.cookie || '';
                    if (browserCookies) {
                        proxyReq.setHeader('Cookie', browserCookies);
                    }
                    console.log(`[Proxy] >>> ${req.method} ${req.url}`);
                    console.log(`[Proxy] >>> Browser cookies: ${browserCookies ? browserCookies.substring(0, 80) : 'NONE'}`);
                    // Request compressed formats we can decode (Cloudflare blocks identity)
                    proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
                    // Remove headers that would break the proxy or trigger Cloudflare blocks
                    const badHeaders = ['x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'cf-ray', 'cf-connecting-ip', 'cf-visitor', 'cf-ipcountry', 'x-real-ip', 'true-client-ip', 'cf-worker', 'cf-ew-via', 'x-railway-edge', 'x-railway-request-id', 'x-request-start', 'if-none-match', 'if-modified-since'];
                    for (const h of badHeaders) {
                        proxyReq.removeHeader(h);
                    }
                    if (proxyReq.getHeader('origin')) proxyReq.setHeader('Origin', `https://${target}`);
                    if (proxyReq.getHeader('referer')) proxyReq.setHeader('Referer', `https://${target}/`);
                } catch (e) {
                    console.log('[Proxy] Warning: header set on redirect, skipping:', e.message);
                }
            },
            proxyRes: (proxyRes, req, res) => {
                console.log(`[Proxy] <<< ${proxyRes.statusCode} ${req.url}`);
                // Cookies
                if (proxyRes.headers['set-cookie']) {
                    let sc = proxyRes.headers['set-cookie'];
                    console.log(`[Proxy] <<< Received cookies for ${target}`);
                }
                // Get content type
                const contentType = proxyRes.headers['content-type'] || '';
                const isHtml = contentType.includes('text/html');
                const isJson = contentType.includes('application/json');
                const isJs = contentType.includes('javascript') || req.url.includes('.js');
                const isText = isHtml || isJson || isJs || contentType.includes('text/css') || req.url.includes('.css');

                // Copy response headers (skip problematic ones)
                const skipHeaders = new Set([
                    'content-security-policy', 'content-security-policy-report-only',
                    'x-frame-options', 'strict-transport-security',
                    'content-encoding', 'transfer-encoding', 'content-length',
                    'cache-control', 'etag', 'last-modified' // Force disable caching
                ]);
                Object.keys(proxyRes.headers).forEach((key) => {
                    if (skipHeaders.has(key.toLowerCase())) return;
                    
                    // Rewrite Location headers to keep user in proxy
                    if (key.toLowerCase() === 'location') {
                        const host = getOriginalHost(req);
                        const proxyOrigin = req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${host}` : `${req.protocol}://${host}`;
                        let loc = proxyRes.headers[key];
                        const escapedTarget = target.replace(/\./g, '\\\\.');
                        loc = loc.replace(new RegExp(`https?://${escapedTarget}`, 'gi'), proxyOrigin);
                        loc = loc.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkarauniversity\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                        loc = loc.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkara\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                        res.setHeader(key, loc);
                        return;
                    }

                    // Rewrite Set-Cookie so sessions work under proxy domain
                    if (key.toLowerCase() === 'set-cookie') {
                        let cookies = proxyRes.headers[key];
                        if (!Array.isArray(cookies)) cookies = [cookies];
                        cookies = cookies.map(c => {
                            const hasHttpOnly = /;\s*httponly/i.test(c);
                            let nc = c
                                .replace(/;\s*domain=[^;]*/gi, '')
                                .replace(/;\s*secure/gi, '')
                                .replace(/;\s*samesite=[^;]*/gi, '')
                                .replace(/;\s*httponly/gi, '')
                                .replace(/;\s*path=[^;]*/gi, '');
                            nc += '; Path=/; Secure; SameSite=None';
                            if (PROXY_DOMAIN) {
                                nc += `; Domain=.${PROXY_DOMAIN}`;
                            }
                            if (hasHttpOnly) nc += '; HttpOnly';
                            return nc;
                        });
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
                    
                    const isApiPath = req.url.includes('/api/') || req.url.includes('quiz-api') || req.url.includes('/__extproxy__/infra');
                    if (isHtml && isApiPath) {
                        res.setHeader('Content-Type', 'application/json');
                        return res.end(JSON.stringify({ error: "Session expired", message: "Please refresh the page to log in again.", type: "error", status: 401 }));
                    }

                    if (isText) {
                        let text = body.toString('utf-8');
                        // Use https explicitly since the proxy handles SSL termination and req.protocol might be http
                        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                        const host = getOriginalHost(req);
                        const proxyOrigin = `https://${host}`;

                        // ── Rewrite absolute testpad URLs ──
                        text = text.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkarauniversity\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                        text = text.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkara\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                        
                        // ── Aggressive postMessage rewrite ──
                        // Replace postMessage target origins with '*' to bypass strictly matched DOM origin errors
                        text = text.replace(/postMessage\(([^,]+),\s*['"]https:\/\/[^'"]+['"]/g, "postMessage($1, '*'");

                        // ── Rewrite assess.* variant ──
                        const assessTarget = target.replace('exam.', 'assess.');
                        const escapedAssess = assessTarget.replace(/\./g, '\\\\.');
                        const assessHost = host.replace('exam.', 'assess.');
                        text = text.replace(new RegExp(`https?://${escapedAssess}`, 'g'), `https://${assessHost}`);

                        // ── Rewrite infra.assess.* variant → external proxy ──
                        const infraTarget = target.replace('exam.', 'infra.assess.');
                        const escapedInfra = infraTarget.replace(/\./g, '\\\\.');
                        text = text.replace(new RegExp(`https?://${escapedInfra}`, 'g'), getProxyUrlForDomain(infraTarget, proxyOrigin));

                        // ── Catch-all for OTHER testpad domains (like login.testpad...) ──
                        text = text.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkarauniversity\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));
                        text = text.replace(/https?:\/\/([a-z0-9.-]+\.testpad\.chitkara\.edu\.in)/gi, (m, p1) => getProxyUrlForDomain(p1, proxyOrigin));

                        // ── Rewrite static.openreplay.com → external proxy ──
                        text = text.replace(/https?:\/\/static\.openreplay\.com/g, `${proxyOrigin}/__extproxy__/static.openreplay.com`);
                        text = text.replace(/https?:\/\/api\.openreplay\.com/g, `${proxyOrigin}/__extproxy__/api.openreplay.com`);

                        // ── Rewrite speed.cloudflare.com → our mock ──
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__down/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com\/__up/g, `${proxyOrigin}/__speedmock__`);
                        text = text.replace(/https?:\/\/speed\.cloudflare\.com/g, `${proxyOrigin}/__speedmock__`);

                        // ── Spoof expiration details in ALL text responses ──
                        if (isText) {
                            // Only spoof timers if the test is actually expired. 
                            // Otherwise, live tests will show 8000+ hours remaining!
                            if (text.match(/"isExpired":\s*(true|1|"true")/i) || text.match(/"status":"EXPIRED"/i)) {
                                text = text.replace(/"endTime":"[^"]+"/g, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                                text = text.replace(/"endTime":\d+/g, '"endTime":1809239400000');
                                text = text.replace(/"isExpired":\s*(true|1|"true")/gi, '"isExpired":false');
                                text = text.replace(/"status":"EXPIRED"/gi, '"status":"LIVE"');
                            }
                            
                            // Always spoof the Desktop App requirement so you can use the browser
                            text = text.replace(/"isAppOnly":\s*(true|1|"true")/gi, '"isAppOnly":false');
                        }

                        // ── Fix css.js define crash ──
                        // css.js throws ReferenceError if define is missing.
                        if (req.url.includes('css.js')) {
                            text = `if(typeof define === 'undefined') { window.define = function() {}; window.define.amd = {}; }\n${text}`;
                        }

                        // ── Inject performance mock, location spoofer, and AI solver into HTML ──
                        if (isHtml) {
                            const isNavigation = req.headers['sec-fetch-dest'] === 'document' || req.headers['sec-fetch-dest'] === 'iframe' || (req.headers.accept && req.headers.accept.includes('text/html') && req.headers['sec-fetch-mode'] === 'navigate') || (!req.headers['sec-fetch-dest'] && !req.headers['x-requested-with']);
                            const isFullPage = isNavigation && /^\s*(<!doctype|<html|<head>|<head\s)/i.test(text);
                            if (isFullPage) { console.log(`[PROXY] Injecting into: ${req.url} | sec-fetch-dest: ${req.headers["sec-fetch-dest"]} | mode: ${req.headers["sec-fetch-mode"]} | x-requested-with: ${req.headers["x-requested-with"]}`);
                                const proxyHost = getOriginalHost(req);
                            // Location spoofer — comprehensive: intercepts all location redirects and rewrites them through proxy
                            const locSpoof = `<script>(function(){
                                var rd='${target}',ro='https://'+rd;
                                var proxyOrigin=window.location.origin;
                                var PD='${PROXY_DOMAIN}';
                                function rewriteUrl(url) {
                                    if (!url || typeof url !== 'string') return url;
                                    return url.replace(new RegExp('https?://([a-z0-9][a-z0-9.-]*\\\\.testpad\\\\.chitkara[a-z]*\\\\.edu\\\\.in)', 'gi'), function(m, host) {
                                        if (PD) return 'https://' + host.split('.').join('-') + '.' + PD;
                                        return proxyOrigin + '/__extproxy__/' + host;
                                    });
                                }
                                try{Object.defineProperty(document,'referrer',{get:function(){return ro+'/'}});}catch(e){}
                                try{Object.defineProperty(document,'domain',{get:function(){return rd},set:function(){}});}catch(e){}
                                var oA=window.location.assign,oR=window.location.replace;
                                if(oA)window.location.assign=function(u){return oA.call(window.location,rewriteUrl(u))};
                                if(oR)window.location.replace=function(u){return oR.call(window.location,rewriteUrl(u))};
                                var oO=window.open;window.open=function(u,n,f){return oO.call(window,rewriteUrl(u),n,f)};
                                var oX=XMLHttpRequest.prototype.open;
                                XMLHttpRequest.prototype.open=function(){arguments[1]=rewriteUrl(arguments[1]);return oX.apply(this,arguments)};
                                var oF=window.fetch;
                                window.fetch=function(i,o){if(typeof i==='string')i=rewriteUrl(i);return oF.call(window,i,o)};
                            })();</script>`;
                            const perfMock = `<script>(function(){try{var fake=[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:0,responseEnd:50,name:"https://speed.cloudflare.com/__down?bytes=0",entryType:"resource",initiatorType:"fetch"}];var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return fake};var p=performance.getEntries;performance.getEntries=function(){var r=p.call(performance);return r.concat(fake)};}catch(e){}})(); navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));</script>`;
                            const electronMock = `<script>window.api = { _sendToMain: function(){}, _receiveFromMain: function(){}, _removeListener: function(){}, _invoke: function(){ return Promise.resolve(); }, updateAppConfig: function(){}, remoteAction: function(){}, _record: function(){}, _stopRecording: function(){}, _setQuizId: function(){}, checkForVirtualAdapter: function(){ return Promise.resolve(false); }, _checkIfVM: function(){ return Promise.resolve(false); } };</script>`;
                            // Super robust postMessage mock that overrides targetOrigin safely
                            const pmMock = `<script>(function(){
                                var origPM = Window.prototype.postMessage;
                                Window.prototype.postMessage = function(msg, targetOrigin, transfer) {
                                    if (typeof targetOrigin === 'string' && targetOrigin.startsWith('http')) {
                                        targetOrigin = '*';
                                    } else if (targetOrigin && typeof targetOrigin === 'object' && targetOrigin.targetOrigin) {
                                        targetOrigin.targetOrigin = '*';
                                    }
                                    return origPM.call(this, msg, targetOrigin, transfer);
                                };
                            })();</script>`;
                            // Socket.IO mock — testpad uses sockets for answer submission; we mock it and forward via HTTP
                            const socketMock = `<script>(function(){
                                var handlers={};
                                var mockSocket={
                                    connected:true,
                                    id:'proxy_mock_'+Math.random().toString(36).substr(2),
                                    on:function(ev,fn){
                                        if(!handlers[ev])handlers[ev]=[];
                                        handlers[ev].push(fn);
                                        if(ev==='connect'&&mockSocket.connected)setTimeout(fn,10);
                                        return mockSocket;
                                    },
                                    off:function(ev,fn){if(handlers[ev])handlers[ev]=handlers[ev].filter(function(f){return f!==fn});return mockSocket},
                                    emit:function(ev){
                                        var args=Array.prototype.slice.call(arguments,1);
                                        console.log('[SocketMock] emit:',ev,args.length?JSON.stringify(args[0]).substring(0,200):'');
                                        return mockSocket;
                                    },
                                    disconnect:function(){mockSocket.connected=false;return mockSocket},
                                    connect:function(){mockSocket.connected=true;return mockSocket},
                                    io:{engine:{transport:{name:'polling'}}}
                                };
                                window.io=function(){console.log('[SocketMock] io() called');return mockSocket};
                                window.io.connect=window.io;
                                window.socket=mockSocket;
                            })();</script>`;
                            // jQuery selectpicker + CodeMirror stubs — prevents crashes when plugins don't load through proxy
                            const pluginStubs = `<script>(function(){
                                function patchJQ(jq){if(jq&&jq.fn&&!jq.fn.selectpicker){jq.fn.selectpicker=function(){return this}}}
                                if(window.jQuery)patchJQ(window.jQuery);
                                var origJQ=window.jQuery;
                                try{Object.defineProperty(window,'jQuery',{get:function(){return origJQ},set:function(v){origJQ=v;patchJQ(v)},configurable:true});}catch(e){}
                                try{Object.defineProperty(window,'$',{get:function(){return origJQ},set:function(v){origJQ=v;patchJQ(v)},configurable:true});}catch(e){}
                                if(typeof CodeMirror==='undefined'){window.CodeMirror=function(el,opts){
                                    var ta=document.createElement('textarea');ta.className='CodeMirror-mock';ta.style.cssText='width:100%;min-height:200px;font-family:monospace;padding:10px;border:1px solid #ccc;';
                                    if(typeof el==='function'){el=null;}
                                    if(el&&el.appendChild)el.appendChild(ta);
                                    var val=opts&&opts.value||'';
                                    ta.value=val;
                                    return{getValue:function(){return ta.value},setValue:function(v){ta.value=v},getDoc:function(){return{getCursor:function(){return{line:0,ch:ta.value.length}},replaceRange:function(t,p){ta.value+=t}}},on:function(){},off:function(){},refresh:function(){},focus:function(){ta.focus()},replaceSelection:function(t){ta.value+=t},setOption:function(){},getOption:function(){return null},toTextArea:function(){}};
                                };window.CodeMirror.fromTextArea=function(ta,opts){var v=ta.value||'';ta.style.display='none';var cm=window.CodeMirror(ta.parentNode,Object.assign({},opts,{value:v}));return cm};window.CodeMirror.defineMode=function(){};window.CodeMirror.defineMIME=function(){};window.CodeMirror.defaults={};}
                            })();</script>`;
                            const injected = `${locSpoof}\n${perfMock}\n${electronMock}\n${pmMock}\n${socketMock}\n${pluginStubs}`;
                            // Try injecting after <head>, fallback to before <html>, fallback to prepend
                            if (/<head(>|\s[^>]*>)/i.test(text)) {
                                text = text.replace(/<head(>|\s[^>]*>)/i, (match, p1) => `<head${p1}\n${injected}`);
                            } else if (/<html([^>]*)>/i.test(text)) {
                                text = text.replace(/<html([^>]*)>/i, (match, p1) => `<html${p1}>\n<head>\n${injected}\n</head>`);
                            } else {
                                text = `<head>\n${injected}\n</head>\n` + text;
                            }
                            
                            try {
                                let solverScript = fs.readFileSync(path.join(__dirname, 'solver.js'), 'utf8');
                                solverScript = solverScript.replace('${API_KEY}', API_KEY);
                                text = text.replace(/<\/body>/i, () => `\n<script id="proxy-solver">\n${solverScript}\n</script>\n</body>`);
                            } catch(e) {
                                console.error("[ExtProxy] Could not inject solver script", e.message);
                            }
                            } // end isFullPage
                        }

                        // ── Disable target Service Workers ──
                        // The testpad app has a __sw.js that breaks CORS on our proxy.
                        text = text.replace(/navigator\.serviceWorker\.register/g, 'Promise.reject("SW Disabled").catch');

                        // ── Fix isChitkara hostname check ──
                        // Force it to match the target domain so the app works correctly through the proxy
                        text = text.replace(/===\s*window\.location\.hostname/g, `=== "${target}"`);
                        text = text.replace(/window\.location\.hostname\s*===/g, `"${target}" ===`);

                        // ── Rewrite JS-level window.location.href = "https://real-domain/..." assignments ──
                        // Catch hardcoded redirect URLs in JavaScript that would break out of the proxy
                        text = text.replace(new RegExp('window\\.location\\.href\\s*=\\s*[\\x27"]https?://([a-z0-9.-]+\\.testpad\\.chitkarauniversity\\.edu\\.in)([^\\x27"]*)[\\x27"]', 'g'), (m, host, path) => {
                            const proxyOrigin = `https://${getOriginalHost(req)}`;
                            return `window.location.href="${getProxyUrlForDomain(host, proxyOrigin)}${path}"`;
                        });
                        text = text.replace(new RegExp('window\\.location\\.replace\\s*\\(\\s*[\\x27"]https?://([a-z0-9.-]+\\.testpad\\.chitkarauniversity\\.edu\\.in)([^\\x27"]*)[\\x27"]\\s*\\)', 'g'), (m, host, path) => {
                            const proxyOrigin = `https://${getOriginalHost(req)}`;
                            return `window.location.replace("${getProxyUrlForDomain(host, proxyOrigin)}${path}")`;
                        });
                        text = text.replace(new RegExp('window\\.location\\s*=\\s*[\\x27"]https?://([a-z0-9.-]+\\.testpad\\.chitkarauniversity\\.edu\\.in)([^\\x27"]*)[\\x27"]', 'g'), (m, host, path) => {
                            const proxyOrigin = `https://${getOriginalHost(req)}`;
                            return `window.location="${getProxyUrlForDomain(host, proxyOrigin)}${path}"`;
                        });

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
server.setMaxListeners(0); // Prevent EventEmitter warnings from proxy connections

server.listen(PORT, () => {
    console.log(`Reverse proxy server running on port ${PORT}`);
    console.log(`PROXY_DOMAIN: ${PROXY_DOMAIN || '(not set)'}`);
    console.log(`API_KEY: ${API_KEY ? 'present' : 'NOT SET'}`);
});
