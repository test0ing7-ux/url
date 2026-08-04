export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    
    // Your Render backend URL (update after deploying to Render)
    const BACKEND_HOST = env.BACKEND_HOST || 'your-app.onrender.com';
    
    let target = null;
    const PROXY_DOMAIN = env.PROXY_DOMAIN || 'cuhp.duckdns.org';
    
    // Check if it's a proxy request (subdomain-based routing)
    if (host !== PROXY_DOMAIN && host !== 'www.' + PROXY_DOMAIN && host.endsWith('.' + PROXY_DOMAIN)) {
      const encoded = host.slice(0, -(PROXY_DOMAIN.length + 1));
      target = encoded.replace(/-/g, '.'); // Decode hyphens back to dots
    }
    
    // Forward the request to our backend
    const backendUrl = new URL(request.url);
    backendUrl.hostname = BACKEND_HOST;
    backendUrl.protocol = 'https:';
    
    // Build headers — pass through everything + add routing info
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', host);
    if (target) {
      headers.set('X-Target-Domain', target);
    }

    // Check if this is a WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade') || '';
    if (upgradeHeader.toLowerCase() === 'websocket') {
      // WebSocket: pass through directly to backend
      return fetch(backendUrl.toString(), {
        method: request.method,
        headers: headers,
      });
    }
    
    // Regular HTTP request
    const newRequest = new Request(backendUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'manual',
    });
    
    return fetch(newRequest);
  }
};
