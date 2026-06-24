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
    logErrors: false,
    maintainer: undefined,
});

const app = express();
app.disable("x-powered-by");

// ═══════════════════════════════════════════════════════════════
// STATIC FILES — UV, BareMux, Epoxy transport
// ═══════════════════════════════════════════════════════════════

// Our custom public files FIRST (so our uv.config.js overrides the default)
app.use(express.static(path.join(__dirname, "public")));

// UV client-side files (uv.bundle.js, uv.client.js, uv.handler.js, uv.sw.js)
app.use("/uv/", express.static(uvPath));

// BareMux worker (used by UV's service worker to manage transports)
app.use("/baremux/", express.static(baremuxPath));

// Epoxy transport (WASM-based encrypted WebSocket transport — beats firewalls)
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
// ENTRY POINT — /e/https://anysite.com/path
// Registers the UV Service Worker and redirects transparently
// ═══════════════════════════════════════════════════════════════
app.get("/e/*", (req, res) => {
    // Everything after /e/ is the target URL
    const targetUrl = req.originalUrl.slice(3);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(getBootstrapPage(targetUrl));
});

// Root page — simple search/entry
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP PAGE — registers SW then redirects to proxied site
// ═══════════════════════════════════════════════════════════════
function getBootstrapPage(targetUrl) {
    // Escape for safe embedding in JS string
    const safeUrl = targetUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loading...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
.loader{text-align:center}
.spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
p{color:rgba(255,255,255,.6);font-size:14px}
.error{color:#ef4444;display:none;margin-top:12px;font-size:13px}
</style>
</head>
<body>
<div class="loader">
<div class="spinner"></div>
<p>Connecting...</p>
<p class="error" id="err"></p>
</div>
<script src="/uv/uv.bundle.js"></script>
<script src="/uv/uv.config.js"></script>
<script src="/baremux/index.js"></script>
<script>
(async function() {
    try {
        if (!navigator.serviceWorker) throw new Error('Service Workers not supported');
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            throw new Error('HTTPS required for Service Workers');
        }
        
        // Register UV's service worker
        const reg = await navigator.serviceWorker.register('/sw.js', { 
            scope: __uv$config.prefix,
            updateViaCache: 'none'
        });
        
        // Wait for SW to become active
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
        
        // Set up the transport (Epoxy = encrypted WebSocket, bypasses firewalls)
        const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
        const wispUrl = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/wisp/';
        await conn.setTransport('/epoxy/index.mjs', [{ wisp: wispUrl }]);
        
        // Navigate to the proxied URL
        const target = '${safeUrl}';
        location.href = __uv$config.prefix + __uv$config.encodeUrl(target);
    } catch(e) {
        document.getElementById('err').style.display = 'block';
        document.getElementById('err').textContent = e.message;
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
