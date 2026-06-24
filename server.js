const http = require("node:http");
const path = require("node:path");
const express = require("express");
const { createBareServer } = require("@tomphttp/bare-server-node");
const { uvPath } = require("@titaniumnetwork-dev/ultraviolet");
const { baremuxPath } = require("@mercuryworkshop/bare-mux/node");
const epoxyPath = path.join(__dirname, "node_modules", "@mercuryworkshop", "epoxy-transport", "dist");

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const PORT = parseInt(process.env.PORT || "3000");
const API_KEY = process.env.API_KEY || "";

// ═══════════════════════════════════════════════════════════════
// BARE SERVER (handles all proxied requests from the Service Worker)
// ═══════════════════════════════════════════════════════════════
const bare = createBareServer("/bare/", {
    logErrors: true,
});

const app = express();
app.disable("x-powered-by");

// ═══════════════════════════════════════════════════════════════
// STATIC FILES — UV, BareMux, Transport
// ═══════════════════════════════════════════════════════════════

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Our custom public files FIRST (so our uv.config.js overrides the default)
app.use(express.static(path.join(__dirname, "public")));

// UV client-side files (uv.bundle.js, uv.client.js, uv.handler.js, uv.sw.js)
app.use("/uv/", express.static(uvPath));

// BareMux worker (used by UV's service worker to manage transports)
app.use("/baremux/", express.static(baremuxPath));

// Epoxy transport (encrypted WebSocket via Wisp)
app.use("/epoxy/", express.static(epoxyPath));

// ═══════════════════════════════════════════════════════════════
// SOLVER API — proxies AI requests so they work behind firewalls
// ═══════════════════════════════════════════════════════════════
app.use("/__solver_api", express.json());
app.options("/__solver_api", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
});

app.post("/__solver_api", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
// CATCH-ALL — auto-detect target from hostname, bootstrap UV
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
    // Skip internal UV/bare/static routes
    if (req.path.startsWith('/uv/') || req.path.startsWith('/bare/') || 
        req.path.startsWith('/baremux/') || req.path.startsWith('/epoxy/') ||
        req.path.startsWith('/wisp/') || req.path === '/sw.js' ||
        req.path.startsWith('/__') || req.path.startsWith('/s/')) {
        return next();
    }
    
    const host = req.headers.host || '';
    const target = extractTarget(host);
    
    if (!target) {
        return res.sendFile(path.join(__dirname, "public", "index.html"));
    }
    
    // If the request specifically asks for JSON (like the Electron app pre-flight check)
    // or if it's an API call, we should proxy it directly since the Service Worker isn't running yet.
    if (req.query.json === '1' || req.headers.accept?.includes('application/json')) {
        try {
            const targetHost = req.hostname.replace(".chitkara.dns.navy", "");
            const targetUrl = `https://${targetHost}${req.originalUrl}`;
            console.log(`[API Proxy] Proxying pre-flight request to ${targetUrl}`);
            
            // Forward headers except host
            const headers = { ...req.headers };
            delete headers.host;
            
            fetch(targetUrl, {
                method: req.method,
                headers: headers
            }).then(async response => {
                let data = await response.text();
                
                // --- EXPIRE DATE SPOOFING ---
                // If it's the test details JSON, change endTime so it's always live!
                if (data.includes('"endTime"')) {
                    console.log(`[API Proxy] Spoofing endTime to 2027 to make test live!`);
                    data = data.replace(/"endTime":"[^"]+"/, '"endTime":"Sat May 02 2027 06:30:00 GMT+0000 (Coordinated Universal Time)"');
                }
                
                res.status(response.status).send(data);
            }).catch(e => {
                console.error('[API Proxy] Error:', e);
                res.status(500).json({ error: 'Failed to fetch from target' });
            });
            return;
        } catch (e) {
            console.error('[API Proxy] Error:', e);
            res.status(500).json({ error: 'Failed to fetch from target' });
            return;
        }
    }
    
    // Build the full target URL
    const targetUrl = 'https://' + target + req.originalUrl;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getBootstrapPage(targetUrl));
});

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP PAGE — registers SW then natively redirects
// ═══════════════════════════════════════════════════════════════
function getBootstrapPage(targetUrl) {
    const safeUrl = targetUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Proxy Redirect</title>
</head>
<body style="background:#0a0a0a">
<script src="/uv/uv.bundle.js"></script>
<script src="/uv/uv.config.js"></script>
<script>
(async function() {
    try {
        if (!navigator.serviceWorker) throw new Error('Service Workers not supported');
        
        const reg = await navigator.serviceWorker.register('/sw.js', { 
            scope: __uv$config.prefix,
            updateViaCache: 'none'
        });
        
        const sw = reg.active || reg.waiting || reg.installing;
        if (sw && sw.state !== 'activated') {
            await new Promise(function(resolve) {
                if (sw.state === 'activated') return resolve();
                sw.addEventListener('statechange', function() {
                    if (sw.state === 'activated') resolve();
                });
            });
        }
        await navigator.serviceWorker.ready;
        
        // Natively navigate the browser! Looks completely natural!
        const target = '${safeUrl}';
        const url = __uv$config.prefix + __uv$config.encodeUrl(target);
        location.href = url;
    } catch(e) {
        document.body.innerHTML = '<p style="color:red">' + e.message + '</p>';
        console.error(e);
    }
})();
</script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════
// HTTP SERVER + WISP + BARE UPGRADE HANDLING
// ═══════════════════════════════════════════════════════════════
const server = http.createServer();

// Route HTTP requests
server.on("request", (req, res) => {
    // Bare server handles /bare/ routes
    if (bare.shouldRoute(req)) {
        bare.routeRequest(req, res);
    } else {
        app(req, res);
    }
});

// Route WebSocket upgrades (Bare + Wisp)
server.on("upgrade", (req, socket, head) => {
    if (bare.shouldRoute(req)) {
        bare.routeUpgrade(req, socket, head);
    } else if (req.url && req.url.startsWith("/wisp/")) {
        // Wisp protocol for Epoxy transport
        try {
            const { server: wisp } = require("@mercuryworkshop/wisp-js/server");
            wisp.routeRequest(req, socket, head);
        } catch (e) {
            console.error("Wisp error:", e.message);
            socket.end();
        }
    } else {
        socket.end();
    }
});

server.listen(PORT, () => {
    console.log(`Proxy running on port ${PORT}`);
});
