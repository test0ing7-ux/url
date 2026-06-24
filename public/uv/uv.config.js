// UV Configuration — loaded by both the main page and the service worker
self.__uv$config = {
    prefix: "/s/",
    bare: "/bare/",
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: "/uv/uv.handler.js",
    client: "/uv/uv.client.js",
    bundle: "/uv/uv.bundle.js",
    config: "/uv/uv.config.js",
    sw: "/uv/uv.sw.js",
    inject: [
        {
            host: ".*",
            html: '<script>(function(){try{var fake=[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:0,responseEnd:50,name:"https://speed.cloudflare.com/__down?bytes=0",entryType:"resource",initiatorType:"fetch"}];var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return fake};var p=performance.getEntries;performance.getEntries=function(){var r=p.call(performance);return r.concat(fake)};}catch(e){}})()</script>',
            injectTo: "head"
        }
    ]
};
