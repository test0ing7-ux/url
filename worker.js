export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    
    // Replace with your Render/Koyeb backend URL
    const BACKEND_HOST = 'YOUR_APP_NAME.onrender.com';
    
    let target = null;
    const PROXY_DOMAIN = 'edvu.in';
    
    // Check if it's a proxy request
    if (host !== PROXY_DOMAIN && host !== 'www.' + PROXY_DOMAIN && host.endsWith('.' + PROXY_DOMAIN)) {
      target = host.slice(0, -(PROXY_DOMAIN.length + 1));
    }
    
    // Forward the request to our backend
    const backendUrl = new URL(request.url);
    backendUrl.hostname = BACKEND_HOST;
    // Cloudflare Workers use https for origin fetch
    backendUrl.protocol = 'https:';
    
    // Create new request
    const newRequest = new Request(backendUrl.toString(), request);
    
    // Set headers so backend knows the original URL
    newRequest.headers.set('X-Forwarded-Host', host);
    if (target) {
        newRequest.headers.set('X-Target-Domain', target);
    }
    
    return fetch(newRequest);
  }
};
