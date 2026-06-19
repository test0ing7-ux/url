const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GROQ_API_KEY || process.env.API_KEY || "YOUR_GROQ_API_KEY_HERE";
function extractDomains(host) {
    if (!host) return { originalHost: "", proxyDomain: "" };
    
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
        return { originalHost: process.env.DEFAULT_TARGET || "exam.testpad.chitkarauniversity.edu.in", proxyDomain: "" };
    }
    
    const envProxy = process.env.PROXY_DOMAIN;
    const defaultProxy = ".chitkara.dns.navy";
    const proxySuffix = (envProxy && host.endsWith(envProxy)) ? envProxy : (host.endsWith(defaultProxy) ? defaultProxy : "");

    if (proxySuffix) {
        let subdomain = host.slice(0, -proxySuffix.length);
        if (subdomain && subdomain !== 'test') {
            // If subdomain has dashes and no dots, it is a flattened subdomain to bypass SSL wildcard limits
            if (subdomain.includes('-') && !subdomain.includes('.')) {
                // Convert double dashes back to single dashes, and single dashes to dots
                // We split by '--' first to preserve real dashes in the target domain
                const parts = subdomain.split('--');
                const processedParts = parts.map(part => part.replace(/-/g, '.'));
                const originalHost = processedParts.join('-');
                return {
                    originalHost: originalHost,
                    proxyDomain: proxySuffix
                };
            } else {
                return {
                    originalHost: subdomain,
                    proxyDomain: proxySuffix
                };
            }
        }
    }

    const tlds = ['.com', '.org', '.net', '.edu', '.gov', '.mil', '.int', '.in', '.co.uk', '.edu.in', '.ac.in', '.io', '.app', '.dev', '.me', '.co', '.us', '.info', '.biz', '.tv', '.xyz'];
    tlds.sort((a, b) => b.length - a.length);

    for (let tld of tlds) {
        let index = host.indexOf(tld + '.');
        if (index !== -1) {
            return {
                originalHost: host.slice(0, index + tld.length),
                proxyDomain: host.slice(index + tld.length)
            };
        }
    }
    
    let parts = host.split('.');
    if (parts.length >= 4) {
        return {
            originalHost: parts.slice(0, parts.length - 2).join('.'),
            proxyDomain: '.' + parts.slice(parts.length - 2).join('.')
        };
    }

    return { originalHost: host, proxyDomain: "" };
}

const BYPASS_DOMAINS = [
    'accounts.google.com','login.microsoftonline.com','login.live.com','auth0.com','okta.com',
    'googleapis.com','gstatic.com','recaptcha.net','hcaptcha.com','challenges.cloudflare.com',
    'cdn.jsdelivr.net','cdnjs.cloudflare.com','unpkg.com','fonts.googleapis.com','fonts.gstatic.com',
    'sentry.io','firebase.googleapis.com','firebaseapp.com','firebaseio.com',
    'analytics.google.com','www.googletagmanager.com','appleid.apple.com','github.com',
    'facebook.com','fbcdn.net','clarity.ms','hotjar.com','cloudflareinsights.com',
    'stripe.com','razorpay.com','paypal.com','paytm.com'
];

function shouldBypass(url) {
    if (!url) return true;
    if (url.includes('chitkara.dns.navy') || url.includes('up.railway.app') || url.includes('onrender.com') || url.includes('hf.space')) {
        return true;
    }
    for (const d of BYPASS_DOMAINS) { if (url.includes(d)) return true; }
    return false;
}

function getTargetProxyUrl(url, proxyDomain) {
    if (!url || shouldBypass(url) || !proxyDomain) return url;
    try {
        const parsed = new URL(url);
        if (parsed.hostname.endsWith(proxyDomain)) return url;
        const dashed = parsed.hostname.replace(/-/g, '--').replace(/\./g, '-');
        const suffix = proxyDomain.startsWith('.') ? proxyDomain : '.' + proxyDomain;
        parsed.hostname = dashed + suffix;
        return parsed.href;
    } catch(e) { return url; }
}

function rewriteUrlToProxy(url, proxyDomain) {
    return getTargetProxyUrl(url, proxyDomain);
}

const getStealthScript = () => `
<script id="proxy-stealth">
(function() {
    try { if (document.currentScript) document.currentScript.remove(); } catch(e) {}
    (function() {
        var _define = undefined;
        var _require = undefined;
        try {
            Object.defineProperty(Window.prototype, 'define', {
                get: function() { return _define; },
                set: function(val) {
                    if (typeof val === 'function') {
                        _define = val;
                    }
                },
                configurable: true
            });
            Object.defineProperty(Window.prototype, 'require', {
                get: function() { return _require; },
                set: function(val) {
                    if (typeof val === 'function') {
                        _require = val;
                    }
                },
                configurable: true
            });
        } catch (e) {
            try {
                Object.defineProperty(window, 'define', {
                    get: function() { return _define; },
                    set: function(val) {
                        if (typeof val === 'function') {
                            _define = val;
                        }
                    },
                    configurable: true
                });
                Object.defineProperty(window, 'require', {
                    get: function() { return _require; },
                    set: function(val) {
                        if (typeof val === 'function') {
                            _require = val;
                        }
                    },
                    configurable: true
                });
            } catch (ex) {}
        }

        try {
            var origDefineProperty = Object.defineProperty;
            Object.defineProperty = function(obj, prop, descriptor) {
                if (obj === window && (prop === 'define' || prop === 'require')) {
                    if (descriptor) {
                        var val = descriptor.value;
                        if (typeof val === 'function') {
                            if (prop === 'define') _define = val;
                            else _require = val;
                        }
                    }
                    return obj;
                }
                return origDefineProperty.apply(this, arguments);
            };
            var origDefineProperties = Object.defineProperties;
            Object.defineProperties = function(obj, props) {
                if (obj === window && props) {
                    var newProps = null;
                    if (props.define) {
                        var val = props.define.value;
                        if (typeof val === 'function') _define = val;
                        newProps = newProps || Object.assign({}, props);
                        delete newProps.define;
                    }
                    if (props.require) {
                        var val = props.require.value;
                        if (typeof val === 'function') _require = val;
                        newProps = newProps || Object.assign({}, props);
                        delete newProps.require;
                    }
                    return origDefineProperties.call(this, obj, newProps || props);
                }
                return origDefineProperties.apply(this, arguments);
            };
        } catch(e) {}
    })();
    try {
        var extractRealHost = function(h) {
            if (!h) return '';
            if (h.includes('localhost') || h.includes('127.0.0.1')) return h;
            var proxySuffix = '';
            var suffixes = ['.chitkara.dns.navy', '.up.railway.app', '.onrender.com', '.hf.space'];
            for (var i = 0; i < suffixes.length; i++) {
                if (h.endsWith(suffixes[i])) {
                    proxySuffix = suffixes[i];
                    break;
                }
            }
            if (proxySuffix) {
                var subdomain = h.slice(0, -proxySuffix.length);
                if (subdomain && subdomain !== 'test') {
                    if (subdomain.indexOf('-') !== -1 && subdomain.indexOf('.') === -1) {
                        var parts = subdomain.split('--');
                        var processedParts = [];
                        for (var i = 0; i < parts.length; i++) {
                            processedParts.push(parts[i].replace(/-/g, '.'));
                        }
                        return processedParts.join('-');
                    }
                    return subdomain;
                }
            }
            return h;
        };

        var REAL_ORIGIN = '';
        var REAL_HOST = '';
        var match = window.location['href'].match(/\\/(?:fetch\\/)?(https?:\\/+(?:[^\\/]+))/);
        if (match) { 
            let targetOrigin = match[1];
            if (targetOrigin.startsWith('https:/') && !targetOrigin.startsWith('https://')) {
                targetOrigin = 'https://' + targetOrigin.substring(7);
            } else if (targetOrigin.startsWith('http:/') && !targetOrigin.startsWith('http://')) {
                targetOrigin = 'http://' + targetOrigin.substring(6);
            }
            try {
                const parsed = new URL(targetOrigin);
                REAL_ORIGIN = parsed.origin;
                REAL_HOST = parsed.hostname;
            } catch(e) {}
        }

        if (!REAL_HOST) {
            var extracted = extractRealHost(window.location['hostname']);
            if (extracted && extracted !== window.location['hostname']) {
                REAL_HOST = extracted;
                REAL_ORIGIN = window.location['protocol'] + '//' + extracted;
            }
        }

        var _bp = ['accounts.google.com','login.microsoftonline.com','login.live.com','auth0.com','okta.com',
            'googleapis.com','gstatic.com','google.com/recaptcha','www.google.com/recaptcha','recaptcha.net',
            'hcaptcha.com','challenges.cloudflare.com','cdn.jsdelivr.net','cdnjs.cloudflare.com',
            'unpkg.com','fonts.googleapis.com','fonts.gstatic.com','sentry.io','firebase.googleapis.com',
            'firebaseapp.com','firebaseio.com','analytics.google.com','www.googletagmanager.com',
            'cognito-idp.','cognito-identity.','appleid.apple.com','github.com/login','facebook.com',
            'fbcdn.net','clarity.ms','hotjar.com','cloudflareinsights.com','newrelic.com','nr-data.net',
            'datadoghq.com','dd-trace','bugsnag.com','rollbar.com','logrocket.com','fullstory.com',
            'segment.io','segment.com','mixpanel.com','amplitude.com','intercom.io','crisp.chat',
            'tawk.to','zendesk.com','freshdesk.com','stripe.com','js.stripe.com','razorpay.com',
            'checkout.razorpay.com','paypal.com','paytm.com'];

        var _isBypassed = function(u) {
            if (!u || typeof u !== 'string') return true;
            if (u.indexOf('chitkara.dns.navy') !== -1 || u.indexOf('up.railway.app') !== -1 || u.indexOf('onrender.com') !== -1 || u.indexOf('hf.space') !== -1) return true;
            for (var i = 0; i < _bp.length; i++) { if (u.indexOf(_bp[i]) !== -1) return true; }
            return false;
        };

        var _needsTunnel = function(u) {
            if (!u || typeof u !== 'string') return false;
            if (u.indexOf('data:') === 0 || u.indexOf('blob:') === 0 || u.indexOf('javascript:') === 0) return false;
            if (u.indexOf('/__') !== -1) return false;
            if (u.indexOf('/fetch/') !== -1 || u.indexOf('/https:/') !== -1 || u.indexOf('/http:/') !== -1 || u.indexOf('/wss:/') !== -1 || u.indexOf('/ws:/') !== -1) return false;
            if (_isBypassed(u)) return false;
            try {
                var p = new URL(u, window.location['href']);
                if (p.hostname === window.location['hostname'] && !p.pathname.startsWith('/fetch/') && !p.pathname.startsWith('/https:/') && !p.pathname.startsWith('/http:/') && !p.pathname.startsWith('/wss:/') && !p.pathname.startsWith('/ws:/')) return false;
                if (p.hostname === 'localhost' || p.hostname === '127.0.0.1') return false;
                if (p.protocol !== 'https:' && p.protocol !== 'http:' && p.protocol !== 'wss:' && p.protocol !== 'ws:') return false;
                return true;
            } catch(e) { return false; }
        };

        var getTargetProxyUrl = function(url) {
            try {
                var parsed = new URL(url, window.location['href']);
                var h = window.location['hostname'];
                var proxySuffix = '';
                var suffixes = ['.chitkara.dns.navy', '.up.railway.app', '.onrender.com', '.hf.space'];
                for (var i = 0; i < suffixes.length; i++) {
                    if (h.endsWith(suffixes[i])) {
                        proxySuffix = suffixes[i];
                        break;
                    }
                }
                if (!proxySuffix) return url;
                if (parsed.hostname.endsWith(proxySuffix)) return url;
                var dashed = parsed.hostname.replace(/-/g, '--').replace(/\./g, '-');
                parsed.hostname = dashed + proxySuffix;
                return parsed.href;
            } catch(e) {
                return url;
            }
        };

        var _tunnelUrl = function(u) {
            if (!_needsTunnel(u)) return u;
            try {
                var h = window.location['hostname'];
                var hasProxySuffix = false;
                var suffixes = ['.chitkara.dns.navy', '.up.railway.app', '.onrender.com', '.hf.space'];
                for (var i = 0; i < suffixes.length; i++) {
                    if (h.endsWith(suffixes[i])) {
                        hasProxySuffix = true;
                        break;
                    }
                }
                if (hasProxySuffix && window.location['href'].indexOf('/fetch/') === -1 && window.location['href'].indexOf('/https:/') === -1) {
                    return getTargetProxyUrl(u);
                }

                var p = new URL(u, window.location['href']);
                if (p.pathname.startsWith('/fetch/') || p.pathname.startsWith('/https:/') || p.pathname.startsWith('/http:/') || p.pathname.startsWith('/wss:/') || p.pathname.startsWith('/ws:/')) return p.href;
                
                var isWs = p.protocol === 'ws:' || p.protocol === 'wss:';
                var proxyProto = isWs ? (window.location['protocol'] === 'https:' ? 'wss:' : 'ws:') : window.location['protocol'];
                var tunnelHost = window.location['origin'].replace(/^https?:/, proxyProto);
                return tunnelHost + '/' + p.href;
            } catch(e) { return u; }
        };

        var scrub = function(text) {
            if (typeof text !== 'string') return text;
            var prefix1 = window.location['origin'] + '/fetch/';
            while (text.indexOf(prefix1) !== -1) { text = text.split(prefix1).join(''); }
            var prefix2 = window.location['origin'] + '/https:/';
            var prefix3 = window.location['origin'] + '/https://';
            var prefix4 = window.location['origin'] + '/http:/';
            var prefix5 = window.location['origin'] + '/http://';
            while (text.indexOf(prefix2) !== -1) { text = text.split(prefix2).join('https://'); }
            while (text.indexOf(prefix3) !== -1) { text = text.split(prefix3).join('https://'); }
            while (text.indexOf(prefix4) !== -1) { text = text.split(prefix4).join('http://'); }
            while (text.indexOf(prefix5) !== -1) { text = text.split(prefix5).join('http://'); }
            return text;
        };

        // ====== LAYER 1: LOCATION SPOOFING ======
        var fakeLocationStr = window.location['href'];
        if (REAL_ORIGIN) {
            if (fakeLocationStr.indexOf('/fetch/') !== -1 || fakeLocationStr.indexOf('/https:/') !== -1 || fakeLocationStr.indexOf('/http:/') !== -1) {
                var prefix = window.location['origin'] + '/fetch/';
                if (fakeLocationStr.startsWith(prefix)) fakeLocationStr = fakeLocationStr.replace(prefix, '');
                var prefix2 = window.location['origin'] + '/';
                if (fakeLocationStr.startsWith(prefix2 + 'https:/') || fakeLocationStr.startsWith(prefix2 + 'http:/')) {
                    fakeLocationStr = fakeLocationStr.replace(prefix2, '');
                    if (fakeLocationStr.startsWith('https:/') && !fakeLocationStr.startsWith('https://')) {
                        fakeLocationStr = 'https://' + fakeLocationStr.substring(7);
                    } else if (fakeLocationStr.startsWith('http:/') && !fakeLocationStr.startsWith('http://')) {
                        fakeLocationStr = 'http://' + fakeLocationStr.substring(6);
                    }
                }
            } else {
                fakeLocationStr = fakeLocationStr.replace(window.location['origin'], REAL_ORIGIN);
            }
        }
        var fakeLocation = new URL(fakeLocationStr);
        try {
            if (REAL_ORIGIN) {
                Object.defineProperty(window, 'origin', {
                    get: function() { return REAL_ORIGIN; },
                    configurable: true
                });
            }
        } catch(e) {}
        
        try {
            var origRef = document.referrer || '';
            var props = {
                referrer: function() { return scrub(origRef) || REAL_ORIGIN; },
                URL: function() { return fakeLocation.href; },
                domain: function() { return REAL_HOST; },
                documentURI: function() { return fakeLocation.href; }
            };
            for (var prop in props) {
                if (props.hasOwnProperty(prop)) {
                    try {
                        Object.defineProperty(Document.prototype, prop, { get: props[prop], configurable: true });
                    } catch(e) {
                        try {
                            Object.defineProperty(document, prop, { get: props[prop], configurable: true });
                        } catch(ex) {}
                    }
                }
            }
        } catch(e) {}

        // ====== LAYER 1.5: WEBRTC BLINDING ======
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
        window.mozRTCPeerConnection = undefined;

        // ====== LAYER 1.6: STORAGE CRASH HARDENER ======
        try {
            var origParse = JSON.parse;
            JSON.parse = function(text, reviver) {
                if (text === null || text === undefined || text === 'null' || text === '') {
                    return {};
                }
                try {
                    return origParse(text, reviver);
                } catch(e) {
                    return {};
                }
            };
        } catch(e) {}

        // ====== LAYER 2: UNIVERSAL NETWORK INTERCEPTION ======

        var origFetch = window.fetch;
        window.fetch = async function(...args) {
            var url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');
            if (url.indexOf('/__') === -1) {
                if (typeof args[0] === 'string') {
                    args[0] = _tunnelUrl(args[0]);
                } else if (args[0] instanceof Request) {
                    args[0] = new Request(_tunnelUrl(args[0].url), args[0]);
                }
                if (args[1] && args[1].body && typeof args[1].body === 'string') {
                    args[1].body = scrub(args[1].body);
                }
                if (args[1] && args[1].headers) {
                    var h = new Headers(args[1].headers);
                    if (h.get('referer')) h.set('referer', scrub(h.get('referer')));
                    if (h.get('origin')) h.set('origin', scrub(h.get('origin')));
                    args[1].headers = h;
                }
            }
            return origFetch.apply(this, args);
        };

        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string' && url.indexOf('/__') === -1) {
                url = _tunnelUrl(url);
            }
            return origOpen.call(this, method, url, ...rest);
        };
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            if (typeof body === 'string') body = scrub(body);
            return origSend.call(this, body);
        };
        var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (typeof value === 'string') value = scrub(value);
            return origSetHeader.call(this, name, value);
        };

        if (navigator.sendBeacon) {
            var origBeacon = navigator.sendBeacon;
            navigator.sendBeacon = function(url, data) {
                if (typeof url === 'string' && url.indexOf('/__') === -1) url = scrub(url);
                return origBeacon.call(this, url, data);
            };
        }

        // Performance API Cloaking
        try {
            var origGetEntries = performance.getEntries;
            performance.getEntries = function() {
                return origGetEntries.call(this).filter(function(e) {
                    return !(e.name && (e.name.includes('/__') || e.name.includes('/fetch/') || e.name.includes('/https:/') || e.name.includes('/http:/')));
                });
            };
            var origGetEntriesByType = performance.getEntriesByType;
            performance.getEntriesByType = function(type) {
                return origGetEntriesByType.call(this, type).filter(function(e) {
                    return !(e.name && (e.name.includes('/__') || e.name.includes('/fetch/') || e.name.includes('/https:/') || e.name.includes('/http:/')));
                });
            };
            var origGetEntriesByName = performance.getEntriesByName;
            performance.getEntriesByName = function(name, type) {
                if (typeof name === 'string' && (name.includes('/__') || name.includes('/fetch/') || name.includes('/https:/') || name.includes('/http:/'))) return [];
                return origGetEntriesByName.call(this, name, type);
            };
            performance.clearResourceTimings();
        } catch(e) {}

        var origImage = window.Image;
        window.Image = function(...args) {
            var img = new origImage(...args);
            var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if (origSrcDesc && origSrcDesc.set) {
                Object.defineProperty(img, 'src', {
                    set: function(val) { origSrcDesc.set.call(this, scrub(val)); },
                    get: function() { return origSrcDesc.get.call(this); }
                });
            }
            return img;
        };
        window.Image.prototype = origImage.prototype;

        var origWS = window.WebSocket;
        window.WebSocket = function(url, ...rest) {
            if (typeof url === 'string') {
                url = _tunnelUrl(url);
            }
            return new origWS(url, ...rest);
        };
        window.WebSocket.prototype = origWS.prototype;

        // ====== LAYER 3: DYNAMIC DOM OBSERVER ======
        try {
            var _mo = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                    m.addedNodes.forEach(function(node) {
                        if (node.nodeType !== 1) return;
                        var els = [node];
                        if (node.querySelectorAll) {
                            els = els.concat(Array.from(node.querySelectorAll('img,script,link,iframe,video,audio,source')));
                        }
                        els.forEach(function(el) {
                            if (el.src && _needsTunnel(el.src)) { el.src = _tunnelUrl(el.src); }
                            if (el.href && _needsTunnel(el.href)) { el.href = _tunnelUrl(el.href); }
                        });
                    });
                });
            });
            _mo.observe(document.documentElement, { childList: true, subtree: true });
        } catch(e) {}

        // ====== LAYER 4: CONSOLE PROTECTION ======
        var origToString = Location.prototype.toString;
        Location.prototype.toString = function() {
            return scrub(origToString.call(this));
        };

    } catch (e) {}
})();
</script>
`;



const SOLVER_SCRIPT = `
<script id="proxy-solver">
(function() {

try { if (document.currentScript) document.currentScript.remove(); } catch(e) {}
  if (window._solverActive) return;
  window._solverActive = true;

  const GROQ_KEY = "${API_KEY}";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const MODEL = "llama-3.3-70b-versatile";

  let solving = false;
  let lastSolvedText = "";

  // Ghost-type buffer for written/code answers
  let _cl = [];
  let _ci = 0;

  // Extract a pristine, unmonitored fetch function to bypass frontend network spying
  let pristineFetch = window.fetch;
  try {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    document.documentElement.appendChild(f);
    pristineFetch = f.contentWindow.fetch || window.fetch;
  } catch(e) {}

  const MCQ_PROMPT = "You are an expert exam solver. Given a multiple-choice question with options, respond with ONLY the correct option text exactly as written. No explanation, no prefix, just the exact option text.";
  const WRITE_PROMPT = "You are an expert exam solver. For code questions, you MUST write COMPLETE, COMPILABLE code in the language the user started. Handle ALL edge cases. STRICT RULE: Output ONLY raw code. NEVER use markdown formatting. NEVER wrap code in 'backticks'. NEVER explain. Just the exact code text to be typed.";

  async function callAI(question, isWritten) {
    try {
      let res;
      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: isWritten ? WRITE_PROMPT : MCQ_PROMPT },
          { role: "user", content: question }
        ],
        temperature: 0.1,
        max_tokens: 1000
      };
      try {
        res = await pristineFetch(window.location['origin'] + "/__solver_api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: GROQ_KEY, payload: payload })
        });
        if (!res.ok) throw new Error('Proxy API returned ' + res.status);
      } catch(e) {
        solving = false;
        return null;
      }
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        var bt = String.fromCharCode(96);
        var triplebt = bt+bt+bt;
        if (ans.startsWith(triplebt)) ans = ans.substring(ans.indexOf('\\n')+1);
        if (ans.endsWith(triplebt)) ans = ans.substring(0, ans.lastIndexOf(triplebt));
        return ans.trim();
      }
      return null;
    } catch (e) { return null; }
  }

  function getQuestionType() {
    // 1. Check for VISIBLE MCQs first
    let options = Array.from(document.querySelectorAll('.choice, .option-text, [class*="option"], [class*="choice"], [class*="answer"]'))
      .filter(el => el.getBoundingClientRect().width > 0 && el.children.length === 0 && !el.classList.contains('options-list'));
      
    if (options.length < 2) {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
        .filter(el => el.getBoundingClientRect().width > 0);
      if (inputs.length >= 2) {
        options = inputs.map(i => i.closest('label') || i.parentElement);
      }
    }
    
    if (options.length >= 2) return { type: "mcq", options: options };

    // 2. FIX 5: Resilient multi-selector written/code input detection
    // Try specific editors first, then generic fallbacks
    const editorSelectors = [
      'textarea',
      '[contenteditable="true"]',
      '.ace_text-input',
      '.monaco-editor textarea',
      '.CodeMirror textarea',
      '.cm-content',
      '[class*="editor"] textarea',
      '[class*="code"] textarea',
      'input[type="text"]:not([readonly]):not([type="hidden"])'
    ];
    for (const sel of editorSelectors) {
      const els = Array.from(document.querySelectorAll(sel))
        .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      if (els.length > 0) return { type: 'written', target: els[0] };
    }

    return { type: 'written', target: null };
  }

  function addDotToTextNode(opt) {
    let walker = document.createTreeWalker(opt, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let lastTextNode = null;
    while (node) {
      if (node.nodeValue.trim().length > 0) lastTextNode = node;
      node = walker.nextNode();
    }
    if (lastTextNode) {
      const orig = lastTextNode.nodeValue;
      lastTextNode.nodeValue = orig + '.';
      setTimeout(() => { lastTextNode.nodeValue = orig; }, 3000);
    }
  }

  function highlightAnswer(options, answer) {
    if (!answer) return;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const na = norm(answer);
    for (const opt of options) {
      const ot = norm(opt.textContent);
      if (ot === na || na.includes(ot) || ot.includes(na)) {
        addDotToTextNode(opt);
        return;
      }
    }
    const short = na.substring(0, 15);
    for (const opt of options) {
      const ot = norm(opt.textContent);
      if (ot.startsWith(short) || short.startsWith(ot)) {
        addDotToTextNode(opt);
        return;
      }
    }
  }

  // FIX 2: isTrusted Ghost Typing - use DataTransfer + clipboard API to simulate real keystrokes
  function _insertChar(ch) {
    var el = document.activeElement;
    if (!el) return;
    
    // Method 1: Native input value mutation (fastest)
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                                   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        var start = el.selectionStart || 0;
        var end = el.selectionEnd || 0;
        var newVal = el.value.substring(0, start) + ch + el.value.substring(end);
        nativeInputValueSetter.set.call(el, newVal);
        el.selectionStart = el.selectionEnd = start + ch.length;
        // Dispatch React-compatible synthetic events
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        return;
      }
    }
    
    // Method 2: execCommand for contenteditable (isTrusted bypass)
    try {
      document.execCommand('insertText', false, ch);
      return;
    } catch(e) {}
    
    // Method 3: Last resort - direct DOM mutation
    if (el.contentEditable === 'true') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(ch));
        range.collapse(false);
      }
    }
  }

  function startGhostType(answer) {
    _cl = answer.split('\\n');
    _ci = 0;
  }

  // Intercept keystrokes: replace with ghost buffer chars
  document.addEventListener('keydown', function(e) {
    const key = e.key || '';
    if (_cl.length > 0 && !e.ctrlKey && !e.altKey && !e.metaKey && key.length === 1) {
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.classList.contains('monaco-editor') || el.contentEditable === 'true' || el.tagName === 'INPUT')) {
        e.preventDefault(); e.stopPropagation();
        let cur = _cl[0];
        if (_ci === 0) {
          while (_ci < cur.length && (cur[_ci] === ' ' || cur[_ci] === '\\t')) { _ci++; }
        }
        if (_ci < cur.length) {
          _insertChar(cur[_ci]);
          _ci++;
        } else {
          _insertChar(String.fromCharCode(10));
          _cl.shift(); _ci = 0;
        }
      }
    }
  }, true);

  async function solve() {
    if (solving) return;
    const bodyText = document.body.innerText;
    if (!bodyText || bodyText.length < 20) return;
    
    // Get signature of the actual question text to avoid static header block
    let questionText = "";
    const qEl = document.querySelector('.question-text, .q-text, [class*="question"], .mcq-container, .main-container');
    if (qEl) {
        questionText = qEl.innerText;
    } else {
        questionText = bodyText;
    }
    const sig = questionText.substring(0, 2000);
    
    if (sig === lastSolvedText) return;
    solving = true;
    lastSolvedText = sig;

    const qType = getQuestionType();

    let currentCode = "";
    const el = qType.target || document.activeElement;
    if (el) {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') currentCode = el.value;
      else if (el.classList.contains('monaco-editor') || el.contentEditable === 'true') currentCode = el.innerText || el.textContent;
    }

    const langSelect = Array.from(document.querySelectorAll('select.lang-select, select[class*="lang"]')).find(el => el.getBoundingClientRect().width > 0);
    const selectedLang = langSelect ? langSelect.value : "the appropriate language";
    const questionContext = bodyText + "\\n\\n[STRICT REQUIREMENT: WRITE THE SOLUTION IN " + selectedLang + ". " + (currentCode ? "USER HAS ALREADY WRITTEN THIS CODE, FINISH IT EXACTLY:\\n" + currentCode : "") + "]";

    if (qType.type === "mcq") {
      const answer = await callAI(questionContext, false);
      if (answer && qType.options.length > 0) highlightAnswer(qType.options, answer);
    } else {
      const answer = await callAI(questionContext, true);
      if (answer) {
        startGhostType(answer);
      }
    }
    solving = false;
  }

  // Trigger 1: Mouse to left edge (solve) / right edge (clear ghost buffer)
  let lastEdge = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (e.clientX <= 1 && now - lastEdge > 3000) { lastEdge = now; solve(); }
    if (e.clientX >= window.innerWidth - 10) { _cl = []; _ci = 0; lastSolvedText = ""; }
  });

  // Trigger 2: Left+Right arrow keys
  let tkeys = {};
  document.addEventListener('keydown', e => {
    tkeys[e.code || e.key] = true;
    if ((tkeys['ArrowLeft'] || tkeys['Left']) && (tkeys['ArrowRight'] || tkeys['Right'])) { e.preventDefault(); solve(); }
  }, true);
  document.addEventListener('keyup', e => { tkeys[e.code || e.key] = false; }, true);

  // Triggers removed: triple-click and double-click (user requested only stealth triggers)
})();
</script>
`;

// Internal proxy API for college Wi-Fi that blocks Groq directly
app.use('/__solver_api', express.json());
app.use('/__security_report', express.json());

app.post('/__security_report', (req, res) => {
    if (req.body) {
        securityAlerts.unshift(req.body);
        if (securityAlerts.length > 100) securityAlerts.pop();
    }
    res.status(200).send('OK');
});

// Parse bodies as raw buffers for the proxy (skip internal API routes)
app.use((req, res, next) => {
    if (req.path === '/__solver_api' || req.path === '/__security_report') return next();
    express.raw({ type: '*/*', limit: '10mb' })(req, res, next);
});

app.options('/__solver_api', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
});

app.post('/__solver_api', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    try {
        const payload = req.body.payload;
        let finalKey = API_KEY;
        if (req.body.key && req.body.key.startsWith('gsk_')) {
            finalKey = req.body.key;
        }
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + finalKey
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FIX 1: COLD START PREVENTION ---
// Self-ping every 4 minutes to keep server alive on Railway/Koyeb free tier
app.get('/__ping', (req, res) => res.status(200).send('pong'));
const SELF_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN + '/__ping'
    : null;
if (SELF_URL) {
    setInterval(() => {
        fetch(SELF_URL).catch(() => {});
    }, 4 * 60 * 1000); // every 4 minutes
}

// --- SPY DASHBOARD ---
let wifiLogs = [];       // AFTER stealth (what IT admin actually sees)
let backendLogs = [];    // AFTER stealth (what Testpad actually sees)
let rawWifiLogs = [];    // BEFORE stealth (what IT admin WOULD see without our hooks)
let rawBackendLogs = []; // BEFORE stealth (what Testpad WOULD see without our hooks)
let securityAlerts = []; // BLUE TEAM security telemetry alerts

app.get('/__spy_logs', (req, res) => {
    let html = `<html><body style="font-family: Arial, sans-serif; background: #f4f6f8; color: #333; margin: 0; padding: 20px;">
    <div style="max-width: 1200px; margin: 0 auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">🛡️ Proxy Stealth Dashboard</h1>
            <a href="/__clear_logs" style="background: #e74c3c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Clear Logs</a>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
            <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="color: #c0392b; margin-top: 0; font-size: 18px;">🔴 What IT Admin Would See (No Proxy)</h2>
                <div style="background: #fdf2f2; border: 1px solid #fadbd8; padding: 10px; border-radius: 5px; height: 250px; overflow-y: auto; font-family: monospace; font-size: 13px;">
                    ${rawWifiLogs.length === 0 ? '<p style="color:#888;">No traffic yet.</p>' : rawWifiLogs.slice(0,10).map(l => 
                        `<div style="margin-bottom: 10px; border-bottom: 1px solid #f5b7b1; padding-bottom: 5px;">
                            <b>[${l.timestamp}]</b> <span style="color: #e74c3c;">${l.visible_domain}</span><br>
                            IP Exposed: ${l.your_real_ip}
                        </div>`
                    ).join('')}
                </div>
            </div>

            <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h2 style="color: #27ae60; margin-top: 0; font-size: 18px;">🟢 What IT Admin Actually Sees (With Proxy)</h2>
                <div style="background: #eafaf1; border: 1px solid #d5f5e3; padding: 10px; border-radius: 5px; height: 250px; overflow-y: auto; font-family: monospace; font-size: 13px;">
                    ${wifiLogs.length === 0 ? '<p style="color:#888;">No traffic yet.</p>' : wifiLogs.slice(0,10).map(l => 
                        `<div style="margin-bottom: 10px; border-bottom: 1px solid #abebc6; padding-bottom: 5px;">
                            <b>[${l.timestamp}]</b> <span style="color: #27ae60;">${l.visible_domain}</span><br>
                            Protocol: ${l.protocol}
                        </div>`
                    ).join('')}
                </div>
            </div>
        </div>

        <div style="background: #2c3e50; border-radius: 8px; padding: 20px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            <h2 style="color: #ecf0f1; margin-top: 0; display: flex; align-items: center; gap: 10px;">🚨 Live Anti-Cheat Alarms</h2>
            <div style="background: #1a252f; border: 1px solid #34495e; padding: 15px; border-radius: 5px; min-height: 200px; max-height: 400px; overflow-y: auto;">
                ${securityAlerts.length === 0 ? '<div style="color: #2ecc71; text-align: center; margin-top: 50px; font-size: 18px;">✅ All Clear. You are invisible.</div>' : securityAlerts.map(a => 
                    `<div style="margin-bottom: 15px; padding: 15px; border-left: 5px solid ${a.severity === 'CRITICAL' ? '#e74c3c' : a.severity === 'HIGH' ? '#e67e22' : '#3498db'}; background: #2c3e50; border-radius: 4px;">
                        <div style="font-weight: bold; font-size: 16px; color: ${a.severity === 'CRITICAL' ? '#e74c3c' : '#e67e22'}; margin-bottom: 5px;">
                            [${a.timestamp}] ${a.severity} - ${a.type}
                        </div>
                        <div style="font-family: monospace; font-size: 13px; color: #bdc3c7;">
                            Student ID: ${a.student}<br>
                            Details: ${JSON.stringify(a.details)}
                        </div>
                    </div>`
                ).join('')}
            </div>
        </div>
    </div>
    <script>setTimeout(() => location.reload(), 3000);</script>
    </body></html>`;
    res.send(html);
});

app.get('/__clear_logs', (req, res) => {
    wifiLogs = [];
    backendLogs = [];
    rawWifiLogs = [];
    rawBackendLogs = [];
    securityAlerts = [];
    res.redirect('/__spy_logs');
});

// Debug endpoint to find out the real IP of the network you are currently on
app.get('/__debug_ip', (req, res) => {
    const ip = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
    res.send(`<h1>Your Public IP Address is: <span style="color:blue;">${ip}</span></h1><p>Copy this and tell me!</p>`);
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.all('*', async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).end();
    }

    try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host || '';
        const fullUrl = new URL(req.originalUrl || req.url, protocol + '://' + host);

        // Extract the true client IP (or use a hardcoded spoof IP if we set one)
        const HARDCODED_SPOOF_IP = process.env.SPOOF_IP || null;
        let clientIp = HARDCODED_SPOOF_IP || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress);

        let targetUrl = "";
        let originalHost = "";
        
        const { originalHost: extractedHost, proxyDomain } = extractDomains(host);
        
        let isProxyRequest = false;
        if (req.originalUrl.startsWith('/fetch/')) {
            targetUrl = req.originalUrl.substring(7);
            isProxyRequest = true;
        } else if (req.originalUrl.startsWith('/https:/') || req.originalUrl.startsWith('/http:/')) {
            let tempUrl = req.originalUrl.substring(1);
            if (tempUrl.startsWith('https:/') && !tempUrl.startsWith('https://')) {
                tempUrl = 'https://' + tempUrl.substring(7);
            } else if (tempUrl.startsWith('http:/') && !tempUrl.startsWith('http://')) {
                tempUrl = 'http://' + tempUrl.substring(6);
            }
            targetUrl = tempUrl;
            isProxyRequest = true;
        }

        if (isProxyRequest) {
            const m = targetUrl.match(/^(https?:\/\/[^\/]+)/);
            if (m) res.cookie('proxy_origin', m[1], { maxAge: 86400000, path: '/' });
        } else if (proxyDomain && extractedHost) {
            targetUrl = protocol + '://' + extractedHost + req.originalUrl;
            res.cookie('proxy_origin', protocol + '://' + extractedHost, { maxAge: 86400000, path: '/' });
        } else {
            // Check if host is a wildcard subdomain (i.e. not the main proxy domain)
            const mainDomain = process.env.PROXY_DOMAIN || "test.chitkara.dns.navy";
            if (host !== mainDomain && host.endsWith('.chitkara.dns.navy')) {
                const targetHost = host.slice(0, -'.chitkara.dns.navy'.length);
                if (targetHost && targetHost !== 'test') {
                    targetUrl = protocol + '://' + targetHost + req.originalUrl;
                    res.cookie('proxy_origin', protocol + '://' + targetHost, { maxAge: 86400000, path: '/' });
                }
            }
        }

        if (!targetUrl) {
            if (req.path === '/' || req.path === '') {
                return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Universal Stealth Proxy</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --glass-bg: rgba(20, 25, 40, 0.6);
            --glass-border: rgba(255, 255, 255, 0.1);
            --primary: #00f2fe;
            --secondary: #4facfe;
            --text-main: #ffffff;
            --text-muted: #a0aec0;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body {
            background-color: var(--bg-color);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image: 
                radial-gradient(circle at 15% 50%, rgba(79, 172, 254, 0.15), transparent 25%),
                radial-gradient(circle at 85% 30%, rgba(0, 242, 254, 0.15), transparent 25%);
            overflow: hidden;
            position: relative;
        }
        .bg-animation {
            position: absolute;
            width: 200%;
            height: 200%;
            background: linear-gradient(45deg, #0b0f19, #1a2035, #0b0f19);
            background-size: 400% 400%;
            animation: gradientBG 15s ease infinite;
            z-index: -1;
            opacity: 0.8;
        }
        @keyframes gradientBG {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .container {
            width: 100%;
            max-width: 600px;
            padding: 40px;
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            transform: translateY(20px);
            opacity: 0;
            animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideUp {
            to { transform: translateY(0); opacity: 1; }
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .header h1 {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(to right, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
            letter-spacing: -1px;
        }
        .header p { color: var(--text-muted); font-size: 1.1rem; }
        
        .input-group {
            position: relative;
            margin-bottom: 30px;
            display: flex;
            gap: 10px;
        }
        .input-group input {
            flex: 1;
            padding: 18px 24px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            color: var(--text-main);
            font-size: 1.1rem;
            outline: none;
            transition: all 0.3s ease;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
            width: 100%;
        }
        .input-group input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 15px rgba(0, 242, 254, 0.2), inset 0 2px 4px rgba(0,0,0,0.2);
        }
        .btn {
            padding: 0 30px;
            background: linear-gradient(135deg, var(--secondary), var(--primary));
            color: #fff;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(0, 242, 254, 0.3);
            white-space: nowrap;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 242, 254, 0.4);
        }
        .btn:active { transform: translateY(0); }
        
        .recent-section {
            margin-top: 30px;
            border-top: 1px solid var(--glass-border);
            padding-top: 20px;
        }
        .recent-section h3 {
            font-size: 1rem;
            color: var(--text-muted);
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
        }
        .recent-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .recent-item {
            background: rgba(255, 255, 255, 0.03);
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid transparent;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.2s ease;
            text-decoration: none;
            color: var(--text-main);
        }
        .recent-item:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.1);
            transform: translateX(5px);
        }
        .recent-item span {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 90%;
        }
        .bookmarklet-box {
            margin-top: 30px;
            background: rgba(0, 242, 254, 0.05);
            border: 1px dashed var(--primary);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        .bookmarklet-box p { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 15px; }
        .bookmarklet-btn {
            display: inline-block;
            background: rgba(0,0,0,0.5);
            border: 1px solid var(--primary);
            color: var(--primary);
            padding: 10px 20px;
            border-radius: 20px;
            font-weight: 600;
            text-decoration: none;
            cursor: grab;
            transition: all 0.3s;
        }
        .bookmarklet-btn:hover {
            background: var(--primary);
            color: #000;
        }
    </style>
</head>
<body>
    <div class="bg-animation"></div>
    <div class="container">
        <div class="header">
            <h1>Universal Stealth</h1>
            <p>Bypass restrictions instantly with Ghost Mode</p>
        </div>
        
        <div class="input-group">
            <input type="text" id="url" placeholder="https://exam.university.edu..." onkeypress="if(event.key === 'Enter') launchProxy()">
            <button class="btn" onclick="launchProxy()">Launch</button>
        </div>
        
        <div class="recent-section" id="recent-container" style="display: none;">
            <h3>Recent Targets</h3>
            <div class="recent-list" id="recent-list"></div>
        </div>

        <div class="bookmarklet-box">
            <p>Want a faster way? Drag this button to your bookmarks bar. Click it when you are on any site you want to proxy!</p>
            <a id="bookmarklet" class="bookmarklet-btn" href="#">🥷 Stealth Proxy</a>
        </div>
    </div>

    <script>
        // Set Bookmarklet URL dynamically
        const origin = window.location.origin;
        document.getElementById('bookmarklet').href = "javascript:window.location.href='" + origin + "/'+window.location.href;";

        // Manage Recent URLs
        let recents = [];
        try { recents = JSON.parse(localStorage.getItem('proxyRecents') || '[]'); } catch(e){}
        
        function updateRecentsUI() {
            const container = document.getElementById('recent-container');
            const list = document.getElementById('recent-list');
            if (recents.length > 0) {
                container.style.display = 'block';
                list.innerHTML = '';
                recents.forEach(url => {
                    const a = document.createElement('a');
                    a.className = 'recent-item';
                    a.href = '/' + url;
                    a.innerHTML = '<span>' + url + '</span> <span>→</span>';
                    list.appendChild(a);
                });
            } else {
                container.style.display = 'none';
            }
        }

        function launchProxy() {
            let url = document.getElementById('url').value.trim();
            if (!url) return;
            if (!url.startsWith('http')) url = 'https://' + url;
            
            // Save to recents
            recents = recents.filter(u => u !== url);
            recents.unshift(url);
            if (recents.length > 5) recents.pop();
            try { localStorage.setItem('proxyRecents', JSON.stringify(recents)); } catch(e){}

            // Redirect
            window.location.href = '/' + url;
        }
        
        updateRecentsUI();
    </script>
</body>
</html>
                `);
            }
            const referer = req.headers.referer;
            let refererOrigin = null;
            if (referer) {
                let refMatch = referer.match(/\/fetch\/(https?:\/+(?:[^\/]+))/);
                if (!refMatch) {
                    refMatch = referer.match(/\/(https?:\/+(?:[^\/]+))/);
                }
                if (refMatch) {
                    let tempRef = refMatch[1];
                    if (tempRef.startsWith('https:/') && !tempRef.startsWith('https://')) {
                        tempRef = 'https://' + tempRef.substring(7);
                    } else if (tempRef.startsWith('http:/') && !tempRef.startsWith('http://')) {
                        tempRef = 'http://' + tempRef.substring(6);
                    }
                    refererOrigin = tempRef;
                }
            }

            if (refererOrigin) {
                targetUrl = refererOrigin + req.originalUrl;
                res.cookie('proxy_origin', refererOrigin, { maxAge: 86400000, path: '/' });
            } else {
                const cookieOrigin = req.headers.cookie ? (req.headers.cookie.match(/proxy_origin=([^;]+)/) || [])[1] : null;
                if (cookieOrigin) {
                    targetUrl = decodeURIComponent(cookieOrigin) + req.originalUrl;
                }
            }
            if (!targetUrl) {
                return res.status(404).send("Invalid proxy request. Enter url after path, e.g. /https://example.com");
            }
        }

        if (!targetUrl.startsWith('http')) {
            targetUrl = 'https://' + targetUrl;
        }

        const parsedTarget = new URL(targetUrl);
        originalHost = parsedTarget.host;
        const fetchUrl = targetUrl;

        // SPY LOG: College Wi-Fi Router (POST-stealth = what they actually see)
        // PRE-stealth = what they WOULD see if you connected directly without proxy
        if (!req.path.startsWith('/__')) {
            const rawIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
            // Pre-stealth: router would see YOUR real IP and the .navy domain
            rawWifiLogs.unshift({
                timestamp: new Date().toLocaleTimeString(),
                action: "HTTPS Connection",
                visible_domain: host + " [YOUR .navy domain EXPOSED]",
                your_real_ip: rawIp,
                note: "Testpad would have blocked you - IP not whitelisted"
            });
            if (rawWifiLogs.length > 50) rawWifiLogs.pop();

            // Post-stealth: router sees ONLY the encrypted tunnel to .navy domain
            wifiLogs.unshift({
                timestamp: new Date().toLocaleTimeString(),
                action: "HTTPS Connection",
                visible_domain: host,
                protocol: "Encrypted (Body Hidden)"
            });
            if (wifiLogs.length > 50) wifiLogs.pop();
        }

        // 1. MOCK TESTPAD SECURITY VALIDATION
        if (fullUrl.searchParams.get("json") === "1" || (req.headers.accept && req.headers.accept.includes("application/json"))) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.status(200).send(JSON.stringify({ quiz: true, id: "proxy-test", name: "Mock Test", status: "active", duration: 3600 }));
        }

        // 1.5. MOCK EXAM WITH FULL BLUE TEAM SECURITY
        if ((req.path === "/test/mock123" || req.path === "/test/ghost-solver") && !fullUrl.searchParams.has("json")) {
            // Simulated Testpad IP Whitelist (College Lab IP)
            const REQUIRED_IP = process.env.WHITELIST_IP || "115.242.155.86";
            
            if (clientIp !== REQUIRED_IP) {
                return res.status(403).send(`
                    <h1 style="color:red; text-align:center; margin-top:50px;">403 FORBIDDEN - IP NOT ALLOWED</h1>
                    <p style="text-align:center;">Testpad Security: Your IP (${clientIp}) is not on the college whitelist (${REQUIRED_IP}).</p>
                `);
            }

                // DYNAMIC EXAM GENERATION (10 MCQs, 3 Code Questions)
                let examContentHtml = '';

                // 10 Hard MCQs
                for (let i = 1; i <= 10; i++) {
                    examContentHtml += `
                    <div class="main-container view-section ${i === 1 ? 'active' : ''}" id="q${i}" ${i === 1 ? '' : 'style="display:none;"'}>
                        <div class="left-pane">
                            <div class="tabs">
                                <div class="tab active">Question</div>
                                <div class="tab">Attempts</div>
                            </div>
                            <div class="q-content">
                                <h2 class="q-title">Hard Theoretical Concept - MCQ ${i} 🔖</h2>
                                <div class="q-text">
                                    Consider a distributed system with N nodes implementing the Paxos consensus algorithm. Under Byzantine fault conditions with a network partition, which of the following statements best describes the liveness property?
                                </div>
                            </div>
                            <div class="nav-bar">
                                <button class="nav-btn" ${i === 1 ? 'disabled' : `onclick="showQ(${i-1})"`}>◀ previous</button>
                                <a href="#" class="report-link">Report a problem</a>
                                <button class="nav-btn" onclick="showQ(${i+1})">next ▶</button>
                            </div>
                        </div>
                        <div class="right-pane">
                            <div class="mcq-container">
                                <div class="mcq-header">Choose any one</div>
                                <div class="options-list">
                                    <label class="option-label"><input type="radio" name="ans${i}"> <span class="option-text">Safety is guaranteed but liveness may be compromised.</span></label>
                                    <label class="option-label"><input type="radio" name="ans${i}"> <span class="option-text">Both safety and liveness are guaranteed if 2f+1 nodes are active.</span></label>
                                    <label class="option-label"><input type="radio" name="ans${i}"> <span class="option-text">The system defaults to strong eventual consistency.</span></label>
                                    <label class="option-label"><input type="radio" name="ans${i}"> <span class="option-text">It degenerates into a CAP theorem impossibility.</span></label>
                                </div>
                                <div class="clear-selection">Clear selection</div>
                                <button class="submit-btn">submit</button>
                            </div>
                        </div>
                    </div>`;
                }

                // 3 Hard Code Questions
                for (let i = 11; i <= 13; i++) {
                    examContentHtml += `
                    <div class="main-container view-section" id="q${i}" style="display:none;">
                        <div class="left-pane">
                            <div class="tabs">
                                <div class="tab active">Question</div>
                                <div class="tab">Attempts</div>
                            </div>
                            <div class="q-content">
                                <h2 class="q-title">Advanced Coding Challenge ${i - 10} 🔖</h2>
                                <div class="q-text">
                                    <p>You are given a directed acyclic graph (DAG) representing a network of microservices. Find the longest path using dynamic programming with memoization. Ensure your solution is optimized for O(V+E) time complexity.</p>
                                    <p><b>Constraints:</b> N <= 10^5, Time Limit: 1.0s</p>
                                    <br>
                                    <div style="background:#f5f5f5; padding:10px; border-radius:4px; font-family:monospace; font-size:12px;">
                                        Input Format:<br>
                                        First line contains N and M.<br>
                                        Next M lines contain edges u, v...
                                    </div>
                                </div>
                            </div>
                            <div class="nav-bar">
                                <button class="nav-btn" onclick="showQ(${i-1})">◀ previous</button>
                                <a href="#" class="report-link">Report a problem</a>
                                <button class="nav-btn" ${i === 13 ? 'disabled' : `onclick="showQ(${i+1})"`}>next ▶</button>
                            </div>
                        </div>
                        <div class="right-pane">
                            <div class="code-header">
                                <select class="lang-select"><option>C</option><option>Python</option><option>C++</option><option>Java</option></select>
                            </div>
                            <textarea class="code-editor" spellcheck="false">/* Enter your code here. Read input from STDIN. Print output to STDOUT */

#include <stdio.h>

int main() {
    
    return 0;
}</textarea>
                            <div class="code-footer">
                                <div style="font-size:12px; color:#757575;">
                                    <select style="padding:2px; border:1px solid #ddd;"><option>console</option></select>
                                    <label style="margin-left:10px;"><input type="checkbox"> custom input</label>
                                </div>
                                <button class="run-btn">run</button>
                            </div>
                        </div>
                    </div>`;
                }

            const fakeHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Chitkara | TestPad</title>
    ${getStealthScript('.chitkara.dns.navy')}
    ${SOLVER_SCRIPT}
    <link rel="stylesheet" data-name="vs/editor/editor.main" href="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/editor/editor.main.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs/loader.min.js"></script>
    <style>
        :root { --orange: #ef6c00; --bg-grey: #f5f5f5; --text-main: #333; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
        .top-nav { height: 50px; background: #fff; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; padding: 0 20px; justify-content: space-between; }
        .top-nav .logo { width: 30px; height: 30px; background: var(--orange); border-radius: 4px; }
        .user-info { display: flex; align-items: center; gap: 10px; font-size: 13px; }
        .avatar { width: 32px; height: 32px; background: #ef6c00; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
        .tabs-bar { height: 40px; background: #fff; border-bottom: 1px solid #e0e0e0; display: flex; padding-left: 50px; align-items: center; }
        .tab { padding: 0 20px; font-size: 14px; color: #666; cursor: pointer; height: 100%; display: flex; align-items: center; border-bottom: 2px solid transparent; }
        .tab.active { color: var(--orange); border-bottom-color: var(--orange); font-weight: 500; }
        .workspace { flex: 1; display: flex; overflow: hidden; background: #fff; }
        .left-pane { flex: 1; border-right: 1px solid #e0e0e0; overflow-y: auto; padding: 30px 50px; }
        .q-title { font-size: 20px; font-weight: 500; margin-bottom: 25px; border-bottom: 2px solid #ffccbc; display: inline-block; padding-bottom: 5px; }
        .right-pane { flex: 1; display: flex; flex-direction: column; background: #fff; position: relative; }
        .mcq-container { padding: 40px; }
        .option-item { display: flex; align-items: center; gap: 15px; padding: 15px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
        .radio-circle { width: 18px; height: 18px; border: 2px solid #ccc; border-radius: 50%; }
        .option-text { font-size: 14px; color: #333; }
        .submit-btn { position: absolute; bottom: 40px; right: 40px; background: var(--orange); color: #fff; border: none; padding: 10px 30px; border-radius: 4px; font-weight: 500; cursor: pointer; }
        #editor-container { flex: 1; width: 100%; }
        .bottom-nav { height: 40px; background: #fff; border-top: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; font-size: 13px; color: #666; }
        .nav-link { cursor: pointer; display: flex; align-items: center; gap: 5px; text-transform: lowercase; }
    </style>
</head>
<body>
    <div class="top-nav"><div class="logo"></div><div class="user-info"><div>CANDIDATE</div><div class="avatar">C</div></div></div>
    <div class="workspace"><div class="left-pane" id="left-pane"></div><div class="right-pane" id="right-pane"></div></div>
    <div class="bottom-nav">
        <div class="nav-link" onclick="prevQ()">◀ previous</div>
        <div id="q-count">1 / 32</div>
        <div class="nav-link" onclick="nextQ()">next ▶</div>
    </div>

    <script>
        const questions = [
            { type: 'mcq', title: 'Time Speed Distance Q1', q: 'A train runs at the rate of 45 km/hr. What is its speed in metres per second?', options: ['12.5 m/sec', '25 m/sec', '10 m/sec', 'None of these'] },
            { type: 'mcq', title: 'Time Speed Distance Q2', q: 'A train 100m long is running at the speed of 30 km/hr. Find the time taken by it to pass a man standing near the railway line.', options: ['10 seconds', '12 seconds', '15 seconds', '20 seconds'] },
            { type: 'mcq', title: 'Time Speed Distance Q3', q: 'A train running at the speed of 60 km/hr crosses a pole in 9 seconds. What is the length of the train?', options: ['120 metres', '180 metres', '324 metres', '150 metres'] },
            { type: 'mcq', title: 'Time Speed Distance Q4', q: 'How long does a train 110 meters long running at the speed of 72 km/hr take to cross a bridge 132 meters in length?', options: ['9.8 seconds', '12.1 seconds', '12.4 seconds', '14.3 seconds'] },
            { type: 'mcq', title: 'Time Speed Distance Q5', q: 'A man walking at the rate of 5 km/hr crosses a bridge in 15 minutes. The length of the bridge (in metres) is:', options: ['600', '750', '1000', '1250'] },
            { type: 'mcq', title: 'Time Speed Distance Q6', q: 'A car moves at the speed of 80 km/hr. What is the speed of the car in metres per second?', options: ['8 m/sec', '20.5 m/sec', '22.2 m/sec', '25 m/sec'] },
            { type: 'mcq', title: 'Time Speed Distance Q7', q: 'An athlete runs 200 metres in 24 seconds. His speed is:', options: ['10 km/hr', '17 km/hr', '27 km/hr', '30 km/hr'] },
            { type: 'mcq', title: 'Time Speed Distance Q8', q: 'A boy goes to his school from his house at a speed of 3 km/hr and returns at a speed of 2 km/hr. If he takes 5 hours in going and coming, the distance between his house and school is:', options: ['5 km', '5.5 km', '6 km', '6.5 km'] },
            { type: 'mcq', title: 'Time Speed Distance Q9', q: 'If a person walks at 14 km/hr instead of 10 km/hr, he would have walked 20 km more. The actual distance travelled by him is:', options: ['50 km', '56 km', '70 km', '80 km'] },
            { type: 'mcq', title: 'Time Speed Distance Q10', q: 'A train crosses a pole in 15 seconds and a 100 meters long platform in 25 seconds. The length of the train is:', options: ['125 m', '130 m', '150 m', '175 m'] },
            { type: 'mcq', title: 'Time Speed Distance Q11', q: 'Two trains running in opposite directions cross a man standing on the platform in 27 seconds and 17 seconds respectively and they cross each other in 23 seconds. The ratio of their speeds is:', options: ['1:3', '3:2', '3:4', 'None of these'] },
            { type: 'mcq', title: 'Time Speed Distance Q12', q: 'A car covers a distance of 816 km in 12 hours. What is the speed of the car?', options: ['60 km/hr', '62 km/hr', '64 km/hr', '68 km/hr'] },
            { type: 'mcq', title: 'Time Speed Distance Q13', q: 'A person crosses a 600 m long street in 5 minutes. What is his speed in km per hour?', options: ['3.6', '7.2', '8.4', '10'] },
            { type: 'mcq', title: 'Time Speed Distance Q14', q: 'A bus takes 15 hours to travel a distance of 750 kilometres. What should be its speed in km/hr?', options: ['40', '50', '60', '70'] },
            { type: 'mcq', title: 'Time Speed Distance Q15', q: 'Walking 5/6 of its usual speed, a train is 10 minutes too late. Find its usual time to cover the journey.', options: ['40 min', '50 min', '60 min', '70 min'] },
            { type: 'mcq', title: 'Time Speed Distance Q16', q: 'If a man runs at 3 m/sec, how many kilometres does he run in 1 hour and 40 minutes?', options: ['12 km', '15 km', '18 km', '21 km'] },
            { type: 'mcq', title: 'Time Speed Distance Q17', q: 'A man on tour travels first 160 km at 64 km/hr and the next 160 km at 80 km/hr. The average speed for the first 320 km of the tour is:', options: ['35.55 km/hr', '36 km/hr', '71.11 km/hr', '72 km/hr'] },
            { type: 'mcq', title: 'Time Speed Distance Q18', q: 'A train covers a distance in 50 minutes, if it runs at a speed of 48 km/hr on an average. The speed at which the train must run to reduce the time of journey to 40 minutes will be:', options: ['50 km/hr', '55 km/hr', '60 km/hr', '65 km/hr'] },
            { type: 'mcq', title: 'Time Speed Distance Q19', q: 'A car traveling with 5/7 of its usual speed covers 42 km in 1 hour 40 min 48 sec. What is the usual speed of the car?', options: ['17.5 km/hr', '25 km/hr', '30 km/hr', '35 km/hr'] },
            { type: 'mcq', title: 'Time Speed Distance Q20', q: 'Two boys starting from the same place walk at a rate of 5 kmph and 5.5 kmph respectively. What time will they take to be 8.5 km apart, if they walk in the same direction?', options: ['17 hours', '18 hours', '19 hours', '20 hours'] },
            { type: 'code', title: 'Reverse a String', q: 'Write a function to reverse a given string in the selected language.', starter: '/* Write your code here */\\n' }
        ];

        let currentIdx = 0; let editor = null;
        function nextQ() { if(currentIdx < questions.length - 1) { currentIdx++; render(); } }
        function prevQ() { if(currentIdx > 0) { currentIdx--; render(); } }

        function render() {
            const q = questions[currentIdx];
            document.getElementById('q-count').innerText = \`\${currentIdx + 1} / \${questions.length}\`;
            const left = document.getElementById('left-pane');
            left.innerHTML = \`<div class="q-title">\${q.title}</div><p>\${q.q}</p>\`;
            const right = document.getElementById('right-pane');
            if (q.type === 'mcq') {
                right.innerHTML = \`<div class="mcq-container"><div class="options">\${q.options.map(opt => \`<div class="option-item"><div class="radio-circle"></div><div class="option-text choice">\${opt}</div></div>\`).join('')}</div></div><button class="submit-btn">submit</button>\`;
            } else {
                right.innerHTML = \`<div class="code-header"><select class="lang-select"><option>C</option><option>Python</option><option>C++</option><option>Java</option></select></div><div id="editor-container"></div><div class="code-footer"><button class="run-btn">run</button></div>\`;
                require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
                require(['vs/editor/editor.main'], function () {
                    if (editor) editor.dispose();
                    editor = monaco.editor.create(document.getElementById('editor-container'), { value: q.starter || '', language: q.lang || 'cpp', theme: 'vs-light' });
                });
            }
        }
        render();
    </script>

                <!-- 🚨🚨🚨 BLUE TEAM ANTI-CHEAT TELEMETRY ENGINE 🚨🚨🚨 -->
                <!-- This is what the REAL Testpad security system would run -->
                <script>
                (function() {
                    const ALERT_ENDPOINT = window.location['origin'] + '/__security_report';
                    const studentId = 'TEST_USER_001';

                    function sendAlert(type, severity, details) {
                        try {
                            const raw = new XMLHttpRequest();
                            raw.open('POST', ALERT_ENDPOINT, true);
                            raw.setRequestHeader('Content-Type', 'application/json');
                            raw.send(JSON.stringify({
                                timestamp: new Date().toISOString(),
                                student: studentId,
                                type: type,
                                severity: severity,
                                details: details
                            }));
                        } catch(e) {}
                    }

                    // ===== SCAN 1: URL / DOMAIN CHECK =====
                    // Check if the page is being loaded through a proxy
                    (function() {
                        const url = window.location.href;
                        const host = window.location.hostname;
                        const expected = 'exam.testpad.chitkarauniversity.edu.in';
                        
                        if (host !== expected) {
                            sendAlert('PROXY_DETECTED', 'CRITICAL', {
                                scan: 'URL Domain Verification',
                                expected_host: expected,
                                actual_host: host,
                                full_url: url,
                                verdict: 'Student is accessing exam through unauthorized proxy!'
                            });
                        } else {
                            sendAlert('URL_CHECK_PASSED', 'INFO', {
                                scan: 'URL Domain Verification',
                                host: host,
                                verdict: 'Domain matches expected value.'
                            });
                        }
                    })();

                    // ===== SCAN 2: document.URL / document.referrer CHECK =====
                    (function() {
                        const docURL = document.URL;
                        const docRef = document.referrer;
                        const docDomain = document.domain;
                        const docURI = document.documentURI;
                        
                        const suspicious = [docURL, docRef, docDomain, docURI].some(v => 
                            v && (v.includes('.navy') || v.includes('.dns') || v.includes('railway') || v.includes('koyeb'))
                        );
                        
                        if (suspicious) {
                            sendAlert('DOCUMENT_PROPS_TAMPERED', 'CRITICAL', {
                                scan: 'Document Properties Audit',
                                document_URL: docURL,
                                document_referrer: docRef,
                                document_domain: docDomain,
                                document_URI: docURI,
                                verdict: 'Proxy domain detected in document properties!'
                            });
                        } else {
                            sendAlert('DOCUMENT_CHECK_PASSED', 'INFO', {
                                scan: 'Document Properties Audit',
                                document_URL: docURL,
                                document_domain: docDomain,
                                verdict: 'All document properties are clean.'
                            });
                        }
                    })();

                    // ===== SCAN 3: PERFORMANCE API NETWORK AUDIT =====
                    // Check for suspicious network requests (like /__solver_api)
                    setTimeout(function() {
                        const entries = performance.getEntries();
                        const suspicious = entries.filter(e => 
                            e.name && (e.name.includes('solver') || e.name.includes('groq') || 
                            e.name.includes('__') || e.name.includes('openai'))
                        );
                        
                        if (suspicious.length > 0) {
                            sendAlert('SUSPICIOUS_NETWORK', 'CRITICAL', {
                                scan: 'Performance API Network Audit',
                                suspicious_requests: suspicious.map(e => ({ name: e.name, type: e.entryType })),
                                verdict: 'AI/Solver API calls detected in browser!'
                            });
                        } else {
                            sendAlert('NETWORK_CHECK_PASSED', 'INFO', {
                                scan: 'Performance API Network Audit',
                                total_entries: entries.length,
                                verdict: 'No suspicious network requests found.'
                            });
                        }
                    }, 8000);

                    // ===== SCAN 4: WEBRTC REAL IP DETECTION =====
                    (function() {
                        try {
                            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                            pc.createDataChannel('');
                            pc.createOffer().then(offer => pc.setLocalDescription(offer));
                            pc.onicecandidate = function(e) {
                                if (!e.candidate) return;
                                const ipMatch = e.candidate.candidate.match(/([0-9]{1,3}(.[0-9]{1,3}){3})/);
                                if (ipMatch) {
                                    const detectedIP = ipMatch[1];
                                    sendAlert('WEBRTC_IP_DETECTED', 'HIGH', {
                                        scan: 'WebRTC IP Leak Scanner',
                                        detected_ip: detectedIP,
                                        verdict: 'Real IP address detected via WebRTC!'
                                    });
                                }
                                pc.close();
                            };
                            setTimeout(() => {
                                sendAlert('WEBRTC_BLOCKED', 'INFO', {
                                    scan: 'WebRTC IP Leak Scanner',
                                    verdict: 'WebRTC did not return any IP candidates. (Blocked or unavailable)'
                                });
                                pc.close();
                            }, 5000);
                        } catch(e) {
                            sendAlert('WEBRTC_ERROR', 'INFO', {
                                scan: 'WebRTC IP Leak Scanner',
                                error: e.message,
                                verdict: 'WebRTC unavailable or blocked.'
                            });
                        }
                    })();

                    // ===== SCAN 5: KEYSTROKE isTrusted CHECK =====
                    (function() {
                        let untrustedCount = 0;
                        let trustedCount = 0;
                        document.addEventListener('keydown', function(e) {
                            if (e.isTrusted) {
                                trustedCount++;
                            } else {
                                untrustedCount++;
                                sendAlert('UNTRUSTED_KEYSTROKE', 'CRITICAL', {
                                    scan: 'Keystroke Authenticity Scanner',
                                    key: e.key,
                                    trusted_count: trustedCount,
                                    untrusted_count: untrustedCount,
                                    verdict: 'Automated/injected keystroke detected! Possible bot or script.'
                                });
                            }
                        }, true);
                    })();

                    // ===== SCAN 6: CLIPBOARD / PASTE DETECTION =====
                    document.addEventListener('paste', function(e) {
                        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                        sendAlert('PASTE_DETECTED', 'HIGH', {
                            scan: 'Clipboard Paste Monitor',
                            pasted_length: pastedText.length,
                            pasted_preview: pastedText.substring(0, 100),
                            verdict: 'Student pasted content into the exam!'
                        });
                    }, true);

                    // ===== SCAN 7: TAB SWITCH / FOCUS DETECTION =====
                    let tabSwitchCount = 0;
                    document.addEventListener('visibilitychange', function() {
                        if (document.hidden) {
                            tabSwitchCount++;
                            sendAlert('TAB_SWITCHED', 'HIGH', {
                                scan: 'Tab Focus Monitor',
                                switch_count: tabSwitchCount,
                                verdict: 'Student switched away from exam tab!'
                            });
                        }
                    });

                    // ===== SCAN 8: INJECTED DOM / SCRIPT DETECTION =====
                    setTimeout(function() {
                        const allScripts = document.querySelectorAll('script');
                        const suspiciousScripts = [];
                        allScripts.forEach(function(s) {
                            const text = s.textContent || s.innerText || '';
                            if (text.includes('ALERT_ENDPOINT')) return;
                            if (text.includes('solver') || text.includes('groq') || text.includes('GROQ') || 
                                text.includes('callAI') || text.includes('ghostType') || text.includes('GOD MODE') ||
                                text.includes('__solver') || text.includes('pristineFetch')) {
                                suspiciousScripts.push({
                                    length: text.length,
                                    preview: text.substring(0, 200),
                                    keywords_found: ['solver','groq','callAI','ghostType','GOD MODE','__solver','pristineFetch']
                                        .filter(k => text.toLowerCase().includes(k.toLowerCase()))
                                });
                            }
                        });
                        
                        if (suspiciousScripts.length > 0) {
                            sendAlert('INJECTED_SCRIPT_DETECTED', 'CRITICAL', {
                                scan: 'DOM Injection Scanner',
                                total_scripts: allScripts.length,
                                suspicious_count: suspiciousScripts.length,
                                details: suspiciousScripts,
                                verdict: 'AI solver script injected into exam page!'
                            });
                        } else {
                            sendAlert('DOM_CHECK_PASSED', 'INFO', {
                                scan: 'DOM Injection Scanner',
                                total_scripts: allScripts.length,
                                verdict: 'No suspicious scripts found in DOM.'
                            });
                        }
                    }, 3000);

                    // ===== SCAN 9: SUSPICIOUS DOM ELEMENTS =====
                    setTimeout(function() {
                        const suspElements = document.querySelectorAll('#_sg_answer_box, [id*="solver"], [id*="ghost"], [class*="solver"]');
                        if (suspElements.length > 0) {
                            sendAlert('SUSPICIOUS_DOM_ELEMENTS', 'CRITICAL', {
                                scan: 'Hidden Element Scanner',
                                found: Array.from(suspElements).map(e => ({ tag: e.tagName, id: e.id, class: e.className })),
                                verdict: 'Solver UI elements detected in DOM!'
                            });
                        }
                    }, 10000);

                })();
                </script>
            </body>
            
            </html>
            `;
            
            // Simulate the proxy rewriting window.location to defeat domain checks
            let rewrittenFakeHtml = fakeHtml.replace(/window\.location\.hostname/g, "('exam.testpad.chitkarauniversity.edu.in')");
            rewrittenFakeHtml = rewrittenFakeHtml.replace(/location\.hostname/g, "('exam.testpad.chitkarauniversity.edu.in')");

            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(rewrittenFakeHtml);
        }

        // 3. BUILD PROXY REQUEST
        const proxyHeaders = new Headers();
        
        for (const [key, value] of Object.entries(req.headers)) {
            if (['host', 'connection', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'cf-connecting-ip'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'origin' || key.toLowerCase() === 'referer') {
                let rewrittenValue = value;
                rewrittenValue = rewrittenValue.replace('/fetch/', '/');
                if (req.headers.host) {
                    rewrittenValue = rewrittenValue.split(req.headers.host).join(originalHost);
                }
                proxyHeaders.set(key, rewrittenValue);
            } else {
                proxyHeaders.set(key, value);
            }
        }
        proxyHeaders.set("Host", originalHost);
        
        // SPOOFING: Inject the college IP into all common "Real IP" headers
        if (clientIp) {
            // We can't safely spoof CF-Connecting-IP or X-Forwarded-For to a Cloudflare protected site
            // as Cloudflare will throw Error 1000 (DNS points to prohibited IP). 
            // We only spoof the application-level headers that the backend app might read.
            proxyHeaders.set("X-Real-IP", clientIp);
            proxyHeaders.set("True-Client-IP", clientIp);
        }

        // SPY LOG: Testpad Backend (both pre and post stealth)
        if (!req.path.startsWith('/__')) {
            const rawIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress;
            // Pre-stealth: what Testpad WOULD have seen (your real IP, real domain exposed)
            rawBackendLogs.unshift({
                timestamp: new Date().toLocaleTimeString(),
                received_from_ip: rawIp + " [BLOCKED - not college IP]",
                requested_url: "https://" + host + req.originalUrl + " [.navy EXPOSED]",
                result: "403 FORBIDDEN - IP not whitelisted"
            });
            if (rawBackendLogs.length > 50) rawBackendLogs.pop();

            // Post-stealth: what Testpad actually sees (spoofed college IP, clean domain)
            const visibleHeaders = {};
            proxyHeaders.forEach((val, key) => visibleHeaders[key] = val);
            backendLogs.unshift({
                timestamp: new Date().toLocaleTimeString(),
                received_from_ip: clientIp,
                requested_url: fetchUrl,
                visible_headers: {
                    host: visibleHeaders["host"],
                    "x-forwarded-for": visibleHeaders["x-forwarded-for"],
                    "user-agent": visibleHeaders["user-agent"]
                }
            });
            if (backendLogs.length > 50) backendLogs.pop();
        }

        const fetchOptions = {
            method: req.method,
            headers: proxyHeaders,
            redirect: "manual"
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length > 0) {
            fetchOptions.body = req.body;
        }

        const response = await fetch(fetchUrl, fetchOptions);
        const contentType = response.headers.get("content-type") || "";

        // 3.5. SMART REDIRECT HANDLER
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            let location = response.headers.get("location");
            if (location) {
                try {
                    const absLocation = new URL(location, fetchUrl).href;
                    if (shouldBypass(absLocation)) {
                        return res.redirect(response.status === 301 ? 301 : 302, absLocation);
                    }
                    if (proxyDomain) {
                        location = getTargetProxyUrl(absLocation, proxyDomain);
                    } else {
                        location = '/fetch/' + absLocation;
                    }
                } catch(e) {}
                return res.redirect(response.status === 301 ? 301 : 302, location);
            }
        }

        // 4. REBUILD HEADERS
        for (const [key, value] of response.headers.entries()) {
            if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'set-cookie') {
                if (response.headers.getSetCookie) {
                    const cookies = response.headers.getSetCookie();
                    const rewrittenCookies = cookies.map(c => c.replace(/domain=[^;]+;?/gi, ""));
                    res.setHeader('Set-Cookie', rewrittenCookies);
                } else {
                    res.setHeader(key, value.replace(/domain=[^;]+;?/gi, ""));
                }
            } else {
                res.setHeader(key, value);
            }
        }

        if (req.headers.origin) {
            res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            if (req.headers['access-control-request-headers']) {
                res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
            }
        } else {
            res.setHeader("Access-Control-Allow-Origin", "*");
        }
        res.removeHeader("content-security-policy");
        res.removeHeader("content-security-policy-report-only");
        res.removeHeader("x-frame-options");

        // 5. INJECT SOLVER SCRIPT
        if (contentType.includes("text/html")) {
            let html = await response.text();
            
            // Strip meta CSP tags that block inline scripts
            html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');
            // Strip nonce and integrity attributes so all scripts can run
            html = html.replace(/\s+nonce\s*=\s*["'][^"']*["']/gi, '');
            html = html.replace(/\s+integrity\s*=\s*["'][^"']*["']/gi, '');
            
            // Universal URL rewriting based on routing mode
            if (proxyDomain) {
                // For subdomain-based routing: rewrite absolute URLs to their proxy subdomains
                html = html.replace(/((?:href|src|action)\s*=\s*["'])(https?:\/+[^\/[][^"'\s>]+)(["'])/gi, function(match, prefix, url, suffix) {
                    let normalizedUrl = url.replace(/^(https?):\/+/, '$1://');
                    if (shouldBypass(normalizedUrl)) return match;
                    return prefix + getTargetProxyUrl(normalizedUrl, proxyDomain) + suffix;
                });
                // Keep relative URLs untouched for subdomain routing!
            } else {
                // For path-based routing: rewrite absolute URLs to path proxy prefixes
                html = html.replace(/((?:href|src|action)\s*=\s*["'])(https?:\/+[^\/[][^"'\s>]+)(["'])/gi, function(match, prefix, url, suffix) {
                    let normalizedUrl = url.replace(/^(https?):\/+/, '$1://');
                    if (shouldBypass(normalizedUrl)) return match;
                    return prefix + "/" + normalizedUrl + suffix;
                });
                
                // Rewrite root-relative URLs
                html = html.replace(/((?:href|src|action)\s*=\s*["'])(\/[^/"'\s>][^"'\s>]*)(["'])/gi, function(match, prefix, path, suffix) {
                    return prefix + "/" + parsedTarget.origin + path + suffix;
                });
            }

            const currentStealthScript = getStealthScript();
            const baseTag = !proxyDomain ? `<base href="/${fetchUrl}">` : '';
            
            if (html.includes("<head>")) {
                html = html.replace("<head>", "<head>\n" + baseTag);
                if (html.includes("</body>")) html = html.replace("</body>", currentStealthScript + "\n" + SOLVER_SCRIPT + "\n</body>");
                else html += "\n" + currentStealthScript + "\n" + SOLVER_SCRIPT;
            } else {
                html = (baseTag ? baseTag + "\n" : "") + currentStealthScript + "\n" + SOLVER_SCRIPT + "\n" + html;
            }
            
            const originalOrigin = protocol + "://" + originalHost;
            // Spoof window.location.hostname/host/origin in HTML inline scripts
            html = html.replace(/window\.location\.hostname/g, "('" + originalHost + "')");
            html = html.replace(/location\.hostname/g, "('" + originalHost + "')");
            html = html.replace(/window\.location\.host/g, "('" + originalHost + "')");
            html = html.replace(/location\.host/g, "('" + originalHost + "')");
            html = html.replace(/window\.location\.origin/g, "('" + originalOrigin + "')");
            html = html.replace(/location\.origin/g, "('" + originalOrigin + "')");
            
            return res.status(response.status).send(html);
        }

        // Pass through non-HTML
        res.status(response.status);
        if (contentType && (contentType.includes("javascript") || contentType.includes("application/js") || contentType.includes("application/javascript"))) {
            let jsContent = await response.text();
            const originalOrigin = protocol + "://" + originalHost;
            jsContent = jsContent.replace(/window\.location\.hostname/g, "('" + originalHost + "')");
            jsContent = jsContent.replace(/location\.hostname/g, "('" + originalHost + "')");
            jsContent = jsContent.replace(/window\.location\.host/g, "('" + originalHost + "')");
            jsContent = jsContent.replace(/location\.host/g, "('" + originalHost + "')");
            jsContent = jsContent.replace(/window\.location\.origin/g, "('" + originalOrigin + "')");
            jsContent = jsContent.replace(/location\.origin/g, "('" + originalOrigin + "')");
            res.setHeader("Content-Type", contentType);
            return res.send(jsContent);
        }
        
        if (response.body) {
            const arrayBuffer = await response.arrayBuffer();
            res.send(Buffer.from(arrayBuffer));
        } else {
            res.send();
        }

    } catch (err) {
        res.status(502).send("Proxy error: " + err.message);
    }
});
if (process.env.VERCEL) {
    module.exports = app;
} else {
    const http = require('http');
    const WebSocket = require('ws');
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        try {
            const host = req.headers.host || '';
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            let targetOrigin = "";

            if (req.url.startsWith('/fetch/')) {
                targetOrigin = req.url.substring(7);
            } else if (req.url.startsWith('/https:/') || req.url.startsWith('/http:/') || req.url.startsWith('/wss:/') || req.url.startsWith('/ws:/')) {
                let tempUrl = req.url.substring(1);
                if (tempUrl.startsWith('https:/') && !tempUrl.startsWith('https://')) {
                    tempUrl = 'https://' + tempUrl.substring(7);
                } else if (tempUrl.startsWith('http:/') && !tempUrl.startsWith('http://')) {
                    tempUrl = 'http://' + tempUrl.substring(6);
                } else if (tempUrl.startsWith('wss:/') && !tempUrl.startsWith('wss://')) {
                    tempUrl = 'wss://' + tempUrl.substring(5);
                } else if (tempUrl.startsWith('ws:/') && !tempUrl.startsWith('ws://')) {
                    tempUrl = 'ws://' + tempUrl.substring(4);
                }
                targetOrigin = tempUrl;
            }

            if (!targetOrigin) {
                const { originalHost, proxyDomain } = extractDomains(host);
                if (originalHost && proxyDomain) {
                    targetOrigin = protocol + '://' + originalHost;
                }
            }

            if (!targetOrigin) {
                const referer = req.headers.referer;
                if (referer) {
                    let refMatch = referer.match(/\/fetch\/(https?:\/+(?:[^\/]+))/);
                    if (!refMatch) {
                        refMatch = referer.match(/\/(https?:\/+(?:[^\/]+))/);
                    }
                    if (refMatch) {
                        let tempRef = refMatch[1];
                        if (tempRef.startsWith('https:/') && !tempRef.startsWith('https://')) {
                            tempRef = 'https://' + tempRef.substring(7);
                        } else if (tempRef.startsWith('http:/') && !tempRef.startsWith('http://')) {
                            tempRef = 'http://' + tempRef.substring(6);
                        }
                        targetOrigin = tempRef;
                    }
                }
            }

            if (!targetOrigin) {
                const cookieOrigin = req.headers.cookie ? (req.headers.cookie.match(/proxy_origin=([^;]+)/) || [])[1] : null;
                if (cookieOrigin) {
                    targetOrigin = decodeURIComponent(cookieOrigin);
                }
            }

            if (!targetOrigin) {
                socket.destroy();
                return;
            }

            const parsedOrigin = new URL(targetOrigin);
            const wsProtocol = (parsedOrigin.protocol === 'https:' || parsedOrigin.protocol === 'wss:') ? 'wss:' : 'ws:';
            let socketPath = req.url;

            if (socketPath.startsWith('/fetch/')) {
                socketPath = socketPath.substring(7 + targetOrigin.length);
            } else if (socketPath.startsWith('/https:/') || socketPath.startsWith('/http:/') || socketPath.startsWith('/wss:/') || socketPath.startsWith('/ws:/')) {
                const prefixStr = socketPath.startsWith('/https:/') ? '/https:/' : (socketPath.startsWith('/http:/') ? '/http:/' : (socketPath.startsWith('/wss:/') ? '/wss:/' : '/ws:/'));
                if (socketPath.startsWith(prefixStr + '/')) {
                    socketPath = socketPath.substring(prefixStr.length + 1 + parsedOrigin.host.length);
                } else {
                    socketPath = socketPath.substring(prefixStr.length + parsedOrigin.host.length);
                }
            }

            if (!socketPath.startsWith('/')) {
                socketPath = '/' + socketPath;
            }

            const targetWsUrl = wsProtocol + '//' + parsedOrigin.host + socketPath;

            wss.handleUpgrade(req, socket, head, (ws) => {
                const clientWs = new WebSocket(targetWsUrl, {
                    headers: {
                        origin: targetOrigin.replace(/^ws/, 'http'),
                        cookie: req.headers.cookie || ''
                    }
                });

                clientWs.on('open', () => {
                    ws.on('message', (message) => {
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(message);
                        }
                    });

                    clientWs.on('message', (message) => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(message);
                        }
                    });
                });

                clientWs.on('close', () => ws.close());
                ws.on('close', () => clientWs.close());

                clientWs.on('error', () => {
                    ws.close();
                    clientWs.close();
                });
                ws.on('error', () => {
                    ws.close();
                    clientWs.close();
                });
            });
        } catch(err) {
            socket.destroy();
        }
    });

    server.listen(PORT, '0.0.0.0', () => {});
}
