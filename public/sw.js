/*
 * Service Worker entry point.
 * Must be served from /s/ scope (or same directory as UV files).
 * We importScripts from /uv/ with absolute paths since this SW lives at /sw.js (root).
 */
importScripts('/uv/uv.bundle.js');
importScripts('/uv/uv.config.js');
importScripts(__uv$config.sw || '/uv/uv.sw.js');

const uv = new UVServiceWorker();

async function handleRequest(event) {
    if (uv.route(event)) {
        return await uv.fetch(event);
    }
    return await fetch(event.request);
}

self.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event));
});
