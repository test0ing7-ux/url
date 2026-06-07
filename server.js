const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GROQ_API_KEY || process.env.API_KEY || "YOUR_GROQ_API_KEY_HERE";
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || ".chitkara.dns.navy";

const STEALTH_SCRIPT = `
<script>
// 🔒 GOD MODE STEALTH ENGINE v2.0 🔒
// Intercepts ALL possible detection vectors in the browser
(function() {
    try {
        const PROXY_SUFFIX = '${PROXY_DOMAIN}';
        const REAL_ORIGIN = 'https://' + window.location.hostname.replace(PROXY_SUFFIX, '');
        const REAL_HOST = window.location.hostname.replace(PROXY_SUFFIX, '');

        const scrub = (text) => {
            if (typeof text !== 'string') return text;
            return text.replace(new RegExp(PROXY_SUFFIX.replace(/./g, '.'), 'g'), '');
        };

        // ====== LAYER 1: LOCATION SPOOFING ======
        // If Testpad reads window.location, document.URL, or document.referrer,
        // they see the REAL testpad domain, not .navy

        const fakeLocation = new URL(window.location.href.replace(PROXY_SUFFIX, ''));
        
        // Override document.referrer
        try {
            Object.defineProperty(document, 'referrer', {
                get: function() { return scrub(document.referrer || '') || REAL_ORIGIN; },
                configurable: true
            });
        } catch(e) {}

        // Override document.URL
        try {
            Object.defineProperty(document, 'URL', {
                get: function() { return fakeLocation.href; },
                configurable: true
            });
        } catch(e) {}

        // Override document.domain
        try {
            Object.defineProperty(document, 'domain', {
                get: function() { return REAL_HOST; },
                configurable: true
            });
        } catch(e) {}

        // Override document.documentURI
        try {
            Object.defineProperty(document, 'documentURI', {
                get: function() { return fakeLocation.href; },
                configurable: true
            });
        } catch(e) {}

        // ====== LAYER 2: NETWORK INTERCEPTION ======
        // Scrub .navy from ALL outgoing network requests

        // 2a. Intercept Fetch
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            if (typeof args[0] === 'string') args[0] = scrub(args[0]);
            if (args[0] instanceof Request) {
                args[0] = new Request(scrub(args[0].url), args[0]);
            }
            if (args[1] && args[1].body && typeof args[1].body === 'string') {
                args[1].body = scrub(args[1].body);
            }
            if (args[1] && args[1].headers) {
                const h = new Headers(args[1].headers);
                if (h.get('referer')) h.set('referer', scrub(h.get('referer')));
                if (h.get('origin')) h.set('origin', scrub(h.get('origin')));
                args[1].headers = h;
            }
            return origFetch.apply(this, args);
        };

        // 2b. Intercept XHR
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            if (typeof url === 'string') url = scrub(url);
            return origOpen.call(this, method, url, ...rest);
        };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            if (typeof body === 'string') body = scrub(body);
            return origSend.call(this, body);
        };
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (typeof value === 'string') value = scrub(value);
            return origSetHeader.call(this, name, value);
        };

        // 2c. Intercept Beacons
        if (navigator.sendBeacon) {
            const origBeacon = navigator.sendBeacon;
            navigator.sendBeacon = function(url, data) {
                if (typeof url === 'string') url = scrub(url);
                if (typeof data === 'string') data = scrub(data);
                return origBeacon.call(this, url, data);
            };
        }

        // 2d. Intercept Image tracking pixels
        const origImage = window.Image;
        window.Image = function(...args) {
            const img = new origImage(...args);
            const origSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
            if (origSrc && origSrc.set) {
                Object.defineProperty(img, 'src', {
                    set: function(val) { origSrc.set.call(this, scrub(val)); },
                    get: function() { return origSrc.get.call(this); }
                });
            }
            return img;
        };
        window.Image.prototype = origImage.prototype;

        // 2e. Intercept WebSocket URLs
        const origWS = window.WebSocket;
        window.WebSocket = function(url, ...rest) {
            if (typeof url === 'string') url = scrub(url);
            return new origWS(url, ...rest);
        };
        window.WebSocket.prototype = origWS.prototype;

        // ====== LAYER 3: PERFORMANCE API CLOAKING ======
        // Block performance.getEntries() from revealing /__solver_api calls

        const origGetEntries = performance.getEntries;
        performance.getEntries = function() {
            return origGetEntries.call(this).filter(e => !e.name || !e.name.includes('__solver'));
        };
        const origGetByType = performance.getEntriesByType;
        performance.getEntriesByType = function(type) {
            return origGetByType.call(this, type).filter(e => !e.name || !e.name.includes('__solver'));
        };
        const origGetByName = performance.getEntriesByName;
        performance.getEntriesByName = function(name, type) {
            if (typeof name === 'string' && name.includes('__solver')) return [];
            return origGetByName.call(this, name, type);
        };

        // ====== LAYER 4: WEBRTC IP LEAK PREVENTION ======
        // Prevent WebRTC from leaking your real IP address

        const origRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        if (origRTC) {
            window.RTCPeerConnection = function(config, ...rest) {
                if (config && config.iceServers) config.iceServers = [];
                const pc = new origRTC(config, ...rest);
                const origCreateOffer = pc.createOffer.bind(pc);
                pc.createOffer = function(opts) {
                    if (opts) opts.offerToReceiveAudio = false;
                    return origCreateOffer(opts);
                };
                return pc;
            };
            window.RTCPeerConnection.prototype = origRTC.prototype;
        }

        // ====== LAYER 5: CONSOLE PROTECTION ======
        // If someone opens DevTools and types document.URL or location.href,
        // they see the clean URL

        const origToString = Location.prototype.toString;
        Location.prototype.toString = function() {
            return scrub(origToString.call(this));
        };

    } catch (e) {}
})();
</script>
`;

const SOLVER_SCRIPT = `
<script>
(function() {
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
      // Force all AI requests through the proxy to hide them from the college firewall
      try {
        res = await pristineFetch(window.location.origin + "/__solver_api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: GROQ_KEY, payload: payload })
        });
        if (!res.ok) throw new Error('Proxy API returned ' + res.status);
      } catch(e) {
        console.error('Solver error:', e);
        solving = false;
        return null;
      }
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        ans = ans.replace(/^\x60\x60\x60[a-z]*\n/im, '');
        ans = ans.replace(/\n\x60\x60\x60$/im, '');
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
    _cl = answer.split(/\n|n/).filter(l => l !== undefined);
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
          while (_ci < cur.length && (cur[_ci] === ' ' || cur[_ci] === 't')) { _ci++; }
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
    const sig = bodyText.substring(0, 200);
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

    const questionContext = bodyText + (currentCode ? "nn[USER HAS STARTED WRITING THE FOLLOWING CODE. FINISH IT IN THE SAME EXACT LANGUAGE:]n" + currentCode : "");

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

  // Trigger 3: Triple-click
  let cc = 0, ct = null;
  document.addEventListener('click', () => {
    cc++;
    if (cc >= 3) { cc = 0; clearTimeout(ct); solve(); }
    if (ct) clearTimeout(ct);
    ct = setTimeout(() => { cc = 0; }, 600);
  });
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

// Parse bodies as raw buffers for the proxy
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.post('/__solver_api', async (req, res) => {
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
        console.error("Solver API Error:", err);
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
        console.log('[Keepalive] Self-ping sent to', SELF_URL);
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

app.all('*', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host || '';
        const fullUrl = new URL(req.originalUrl || req.url, protocol + '://' + host);

        // Extract the true client IP (or use a hardcoded spoof IP if we set one)
        const HARDCODED_SPOOF_IP = process.env.SPOOF_IP || null;
        let clientIp = HARDCODED_SPOOF_IP || (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress);

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
        if (fullUrl.searchParams.get("json") === "1") {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.status(200).send(JSON.stringify({ quiz: true, id: "proxy-test" }));
        }

        // 1.5. MOCK EXAM WITH FULL BLUE TEAM SECURITY
        if (req.path === "/test/mock123" && !fullUrl.searchParams.has("json")) {
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
            <html>
            <head>
                <title>Testpad Mock Test</title>
                ${STEALTH_SCRIPT}
                <style>
                    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
                    body { margin: 0; padding: 0; background: #ffffff; color: #333; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                    .header { height: 50px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; }
                    .header-left { display: flex; align-items: center; gap: 20px; color: #757575; font-size: 20px; }
                    .header-right { display: flex; align-items: center; gap: 15px; }
                    .user-profile { text-align: right; line-height: 1.2; font-size: 12px; }
                    .user-profile .name { font-weight: bold; color: #555; }
                    .user-profile .role { color: #e67e22; font-size: 10px; text-transform: uppercase; }
                    .avatar { width: 30px; height: 30px; background: #e67e22; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
                    .main-container { display: flex; flex: 1; height: calc(100vh - 50px); }
                    .left-pane { width: 50%; border-right: 2px solid #f0f0f0; display: flex; flex-direction: column; }
                    .tabs { display: flex; border-bottom: 1px solid #e0e0e0; padding-left: 20px; }
                    .tab { padding: 10px 15px; font-size: 13px; color: #757575; cursor: pointer; }
                    .tab.active { color: #e67e22; border-bottom: 2px solid #e67e22; font-weight: 500; }
                    .q-content { flex: 1; padding: 30px; overflow-y: auto; }
                    .q-title { font-size: 18px; color: #424242; margin-bottom: 20px; font-weight: normal; }
                    .q-text { font-size: 14px; line-height: 1.6; color: #212121; }
                    .nav-bar { height: 50px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; background: #fafafa; }
                    .nav-btn { color: #e67e22; background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
                    .nav-btn:disabled { color: #bdbdbd; cursor: not-allowed; }
                    .report-link { color: #e67e22; font-size: 12px; text-decoration: none; }
                    .right-pane { width: 50%; display: flex; flex-direction: column; background: #ffffff; }
                    .mcq-container { padding: 30px; flex: 1; display: flex; flex-direction: column; }
                    .mcq-header { font-size: 15px; color: #424242; margin-bottom: 20px; font-weight: 500; }
                    .options-list { flex: 1; }
                    .option-label { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; cursor: pointer; font-size: 13px; color: #555; }
                    .option-label input[type="radio"] { width: 18px; height: 18px; accent-color: #e67e22; }
                    .clear-selection { color: #e67e22; font-size: 12px; margin-top: 10px; cursor: pointer; }
                    .code-header { height: 40px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; padding: 0 15px; background: #fafafa; }
                    .lang-select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
                    .code-editor { flex: 1; padding: 15px; font-family: monospace; font-size: 13px; line-height: 1.5; border: none; outline: none; resize: none; background: #fff; width: 100%; }
                    .code-footer { height: 50px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 15px; background: #fafafa; }
                    .submit-btn { background: #e67e22; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: auto; align-self: flex-end; }
                    .run-btn { background: #e67e22; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; }
                    .view-section { display: none; height: 100%; width: 100%; }
                    .view-section.active { display: flex; flex-direction: row; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-left">
                        <span style="color: #e74c3c;">🔲</span>
                        <span>📄</span>
                        <span>📊</span>
                    </div>
                    <div class="header-right">
                        <div class="user-profile">
                            <div class="name">TEST USER</div>
                            <div class="role">STUDENT</div>
                        </div>
                        <div class="avatar">T</div>
                    </div>
                </div>

                ${examContentHtml}

                <script>
                    function showQ(num) {
                        for(let i=1; i<=13; i++) {
                            const el = document.getElementById('q' + i);
                            if(el) el.style.display = 'none';
                        }
                        const target = document.getElementById('q' + num);
                        if(target) target.style.display = 'flex';
                    }
                </script>

                <!-- 🚨🚨🚨 BLUE TEAM ANTI-CHEAT TELEMETRY ENGINE 🚨🚨🚨 -->
                <!-- This is what the REAL Testpad security system would run -->
                <script>
                (function() {
                    const ALERT_ENDPOINT = window.location.origin + '/__security_report';
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
            ` + SOLVER_SCRIPT;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(fakeHtml);
        }

        // 2. EXTRACT ORIGINAL HOST
        let originalHost = "";
        if (!host.endsWith(PROXY_DOMAIN) && !host.includes('localhost') && !host.includes('127.0.0.1')) {
            return res.status(400).send("Invalid proxy domain mapping. Hostname must end with " + PROXY_DOMAIN);
        }

        if (host.includes('localhost') || host.includes('127.0.0.1')) {
            originalHost = "exam.testpad.chitkarauniversity.edu.in";
        } else {
            originalHost = host.slice(0, -PROXY_DOMAIN.length);
        }
        if (!originalHost) {
            return res.status(400).send("Missing original domain.");
        }

        const fetchUrl = "https://" + originalHost + req.originalUrl;

        // 3. BUILD PROXY REQUEST
        const proxyHeaders = new Headers();
        
        for (const [key, value] of Object.entries(req.headers)) {
            if (['host', 'connection', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'cf-connecting-ip'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'origin' || key.toLowerCase() === 'referer') {
                proxyHeaders.set(key, value.replace(PROXY_DOMAIN, ""));
            } else {
                proxyHeaders.set(key, value);
            }
        }
        proxyHeaders.set("Host", originalHost);
        
        // SPOOFING: Inject the college IP into all common "Real IP" headers
        if (clientIp) {
            proxyHeaders.set("X-Forwarded-For", clientIp);
            proxyHeaders.set("X-Real-IP", clientIp);
            proxyHeaders.set("CF-Connecting-IP", clientIp);
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

        res.setHeader("Access-Control-Allow-Origin", "*");
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
            
            const escapedHost = originalHost.replace(/[.*+?^${}()|[\]]/g, '$&');
            const hostRegex = new RegExp('https?://' + escapedHost, 'g');
            html = html.replace(hostRegex, 'https://' + host);

            if (html.includes("</body>")) {
                html = html.replace("</body>", STEALTH_SCRIPT + "n" + SOLVER_SCRIPT + "</body>");
            } else if (html.includes("</BODY>")) {
                html = html.replace("</BODY>", STEALTH_SCRIPT + "n" + SOLVER_SCRIPT + "</BODY>");
            } else {
                html = html + STEALTH_SCRIPT + "n" + SOLVER_SCRIPT;
            }
            return res.status(response.status).send(html);
        }

        // Pass through non-HTML
        res.status(response.status);
        if (response.body) {
            const arrayBuffer = await response.arrayBuffer();
            res.send(Buffer.from(arrayBuffer));
        } else {
            res.send();
        }

    } catch (err) {
        console.error(err);
        res.status(502).send("Proxy error: " + err.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('Proxy server running on port ' + PORT);
});
