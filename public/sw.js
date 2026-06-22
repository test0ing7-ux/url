// PROXY SERVICE WORKER — intercepts ALL requests at browser engine level
// This runs BELOW JavaScript, so even eval(), webpack, jQuery can't escape it

const PROXY_VERSION = 'v3';
const PROXY_SUFFIXES = ['.chitkara.dns.navy', '.up.railway.app', '.onrender.com', '.hf.space'];

function getProxySuffix(hostname) {
    for (const s of PROXY_SUFFIXES) {
        if (hostname.endsWith(s)) return s;
    }
    return null;
}

function hostnameToProxy(hostname, suffix) {
    return hostname.replace(/-/g, '--').replace(/\./g, '-') + suffix;
}

function shouldBypass(url) {
    const bypass = [
        'accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com',
        'googleapis.com', 'gstatic.com', 'recaptcha.net', 'hcaptcha.com',
        'challenges.cloudflare.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net',
        'fonts.googleapis.com', 'fonts.gstatic.com', 'analytics.google.com',
        'google-analytics.com', 'googletagmanager.com', 'facebook.com', 'fbcdn.net',
        'stripe.com', 'js.stripe.com', 'razorpay.com', 'paypal.com',
        'sentry.io', 'bugsnag.com', 'rollbar.com', 'newrelic.com',
        'groq.com', 'openai.com', 'anthropic.com'
    ];
    try {
        const u = new URL(url);
        for (const b of bypass) {
            if (u.hostname.includes(b)) return true;
        }
        return false;
    } catch(e) { return true; }
}

function tunnelUrl(url, selfHostname) {
    try {
        if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('chrome-extension:')) return url;
        
        const proxySuffix = getProxySuffix(selfHostname);
        if (!proxySuffix) return url; // Not running in proxy context
        
        const parsed = new URL(url);
        
        // Already proxied or same origin
        if (getProxySuffix(parsed.hostname)) return url;
        if (parsed.hostname === selfHostname) return url;
        
        // Skip bypass domains
        if (shouldBypass(url)) return url;
        
        // Skip non-http(s)
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return url;
        
        // Build proxy URL
        const proxied = hostnameToProxy(parsed.hostname, proxySuffix);
        parsed.hostname = proxied;
        if (parsed.protocol === 'http:') parsed.protocol = 'https:';
        return parsed.href;
    } catch(e) { return url; }
}

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const selfHostname = new URL(self.location.href).hostname;
    
    try {
        const tunneled = tunnelUrl(req.url, selfHostname);
        
        if (tunneled === req.url) return; // No rewrite needed
        
        // Rewrite the request to go through the proxy
        const newReq = new Request(tunneled, {
            method: req.method,
            headers: req.headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
            mode: 'cors',
            credentials: 'include',
            redirect: 'follow'
        });
        
        event.respondWith(fetch(newReq));
    } catch(e) {
        // Fallthrough to normal fetch on any error
    }
});
