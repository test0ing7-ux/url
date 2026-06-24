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
            html: '<script>(function(){try{var o=performance.getEntriesByName;performance.getEntriesByName=function(n,t){var r=o.call(performance,n,t);if(r&&r.length)return r;return[{transferSize:1000,encodedBodySize:1000,decodedBodySize:1000,duration:50,startTime:performance.now()-50,responseEnd:performance.now(),name:n,entryType:t||"resource",initiatorType:"fetch"}]}}catch(e){}})()</script>',
            injectTo: "head"
        }
    ]
};
