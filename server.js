const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GROQ_API_KEY || process.env.API_KEY || "YOUR_GROQ_API_KEY_HERE";
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || ".chitkara.dns.navy";

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

  // Ghost-type buffer for written/code answers (CDP line-by-line approach)
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
        res = await pristineFetch(GROQ_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + GROQ_KEY
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Direct blocked");
      } catch(e) {
        // Fallback: route through our own server if college Wi-Fi blocks Groq
        res = await pristineFetch(window.location.origin + "/__solver_api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: GROQ_KEY, payload: payload })
        });
      }
      const data = await res.json();
      if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        ans = ans.replace(/^\x60\x60\x60[a-z]*\\r?\\n/im, '');
        ans = ans.replace(/\\r?\\n\x60\x60\x60$/im, '');
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

    // 2. Check for VISIBLE Written/Code inputs
    const textAreas = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], .ace_editor, .monaco-editor, .CodeMirror, [class*="editor"], [class*="code"]'))
      .filter(el => el.getBoundingClientRect().width > 0);
    if (textAreas.length > 0) return { type: "written", target: textAreas[0] };
    
    const textInputs = Array.from(document.querySelectorAll('input[type="text"]:not([readonly])'))
      .filter(el => el.getBoundingClientRect().width > 0);
    if (textInputs.length > 0) return { type: "written", target: textInputs[0] };

    return { type: "written", target: null };
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

  function _insertChar(ch) {
    var el = document.activeElement;
    if (!el) return;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      var start = el.selectionStart || 0;
      var end = el.selectionEnd || 0;
      el.value = el.value.substring(0, start) + ch + el.value.substring(end);
      el.selectionStart = el.selectionEnd = start + ch.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, ch);
    }
  }

  function startGhostType(answer) {
    _cl = answer.split(/\\r?\\n/).filter(l => l.trim() !== '');
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

    const questionContext = bodyText + (currentCode ? "\\n\\n[USER HAS STARTED WRITING THE FOLLOWING CODE. FINISH IT IN THE SAME EXACT LANGUAGE:]\\n" + currentCode : "");

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

        // 1. MOCK TESTPAD SECURITY VALIDATION
        if (fullUrl.searchParams.get("json") === "1") {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.status(200).send(JSON.stringify({ quiz: true, id: "proxy-test" }));
        }

        // 1.5. MOCK HTML TEST PAGE (WITH MOCK IP WHITELISTING)
        if (req.path === "/test/mock123" && !fullUrl.searchParams.has("json")) {
            // Simulated Testpad IP Whitelist
            const REQUIRED_IP = process.env.WHITELIST_IP || "1.2.3.4"; // Change this to college IP later
            
            // The mock test now checks the SPOOFED IP, just like the real Testpad would check the spoofed headers
            if (process.env.WHITELIST_IP && clientIp !== REQUIRED_IP) {
                return res.status(403).send(`
                    <h1 style="color:red; text-align:center; margin-top:50px;">403 FORBIDDEN - IP NOT ALLOWED</h1>
                    <p style="text-align:center;">Testpad Security: Your IP (${clientIp}) is not on the college whitelist (${REQUIRED_IP}).</p>
                `);
            }

            const fakeHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Testpad Mock Test</title>
                <style>
                    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
                    body { margin: 0; padding: 0; background: #ffffff; color: #333; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
                    
                    /* Top Header (Mock) */
                    .header { height: 50px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; }
                    .header-left { display: flex; align-items: center; gap: 20px; color: #757575; font-size: 20px; }
                    .header-right { display: flex; align-items: center; gap: 15px; }
                    .user-profile { text-align: right; line-height: 1.2; font-size: 12px; }
                    .user-profile .name { font-weight: bold; color: #555; }
                    .user-profile .role { color: #e67e22; font-size: 10px; text-transform: uppercase; }
                    .avatar { width: 30px; height: 30px; background: #e67e22; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; }
                    
                    /* Main Container */
                    .main-container { display: flex; flex: 1; height: calc(100vh - 50px); }
                    
                    /* Left Pane (Question) */
                    .left-pane { width: 50%; border-right: 2px solid #f0f0f0; display: flex; flex-direction: column; }
                    .tabs { display: flex; border-bottom: 1px solid #e0e0e0; padding-left: 20px; }
                    .tab { padding: 10px 15px; font-size: 13px; color: #757575; cursor: pointer; }
                    .tab.active { color: #e67e22; border-bottom: 2px solid #e67e22; font-weight: 500; }
                    .q-content { flex: 1; padding: 30px; overflow-y: auto; }
                    .q-title { font-size: 18px; color: #424242; margin-bottom: 20px; font-weight: normal; }
                    .q-text { font-size: 14px; line-height: 1.6; color: #212121; }
                    
                    /* Navigation Bar (Bottom of Left Pane) */
                    .nav-bar { height: 50px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; background: #fafafa; }
                    .nav-btn { color: #e67e22; background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 5px; }
                    .nav-btn:disabled { color: #bdbdbd; cursor: not-allowed; }
                    .report-link { color: #e67e22; font-size: 12px; text-decoration: none; }
                    
                    /* Right Pane (Answer/Code) */
                    .right-pane { width: 50%; display: flex; flex-direction: column; background: #ffffff; }
                    
                    /* MCQ Styles */
                    .mcq-container { padding: 30px; flex: 1; display: flex; flex-direction: column; }
                    .mcq-header { font-size: 15px; color: #424242; margin-bottom: 20px; font-weight: 500; }
                    .options-list { flex: 1; }
                    .option-label { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; cursor: pointer; font-size: 13px; color: #555; }
                    .option-label input[type="radio"] { width: 18px; height: 18px; accent-color: #e67e22; }
                    .clear-selection { color: #e67e22; font-size: 12px; margin-top: 10px; cursor: pointer; }
                    
                    /* Code Styles */
                    .code-header { height: 40px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; padding: 0 15px; background: #fafafa; }
                    .lang-select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
                    .code-editor { flex: 1; padding: 15px; font-family: monospace; font-size: 13px; line-height: 1.5; border: none; outline: none; resize: none; background: #fff; width: 100%; }
                    .code-footer { height: 50px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; padding: 0 15px; background: #fafafa; }
                    
                    /* Generic Buttons */
                    .submit-btn { background: #e67e22; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-top: auto; align-self: flex-end; }
                    .run-btn { background: #e67e22; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 13px; }
                    
                    /* View toggles */
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

                <div class="main-container" id="q1" class="view-section active">
                    <!-- MCQ Question 1 -->
                    <div class="left-pane">
                        <div class="tabs">
                            <div class="tab active">Question</div>
                            <div class="tab">Attempts</div>
                        </div>
                        <div class="q-content">
                            <h2 class="q-title">Memory Layout of C Program - 1 🔖</h2>
                            <div class="q-text">
                                Which of the following best describes C language?
                            </div>
                        </div>
                        <div class="nav-bar">
                            <button class="nav-btn" disabled>◀ previous</button>
                            <a href="#" class="report-link">Report a problem</a>
                            <button class="nav-btn" onclick="showQ(2)">next ▶</button>
                        </div>
                    </div>
                    <div class="right-pane">
                        <div class="mcq-container">
                            <div class="mcq-header">Choose any one</div>
                            <div class="options-list">
                                <label class="option-label"><input type="radio" name="ans1"> <span class="option-text">C is a low level language</span></label>
                                <label class="option-label"><input type="radio" name="ans1"> <span class="option-text">C is a high level language with features that support low level programming</span></label>
                                <label class="option-label"><input type="radio" name="ans1"> <span class="option-text">C is a high level language</span></label>
                                <label class="option-label"><input type="radio" name="ans1"> <span class="option-text">C is a very high level language</span></label>
                            </div>
                            <div class="clear-selection">Clear selection</div>
                            <button class="submit-btn">submit</button>
                        </div>
                    </div>
                </div>

                <div class="main-container view-section" id="q2" style="display:none;">
                    <!-- Code Question 2 -->
                    <div class="left-pane">
                        <div class="tabs">
                            <div class="tab active">Question</div>
                            <div class="tab">Attempts</div>
                        </div>
                        <div class="q-content">
                            <h2 class="q-title">Second Maximum in an Array 🔖</h2>
                            <div class="q-text">
                                <p>Write a program to find the 2nd maximum element in an array.</p>
                                <p><b>Note:</b> Print 0, if all the values are same.</p>
                                <br>
                                <div style="background:#f5f5f5; padding:10px; border-radius:4px; font-family:monospace; font-size:12px;">
                                    Input Format:<br>
                                    The first line of input contains an integer N...
                                </div>
                            </div>
                        </div>
                        <div class="nav-bar">
                            <button class="nav-btn" onclick="showQ(1)">◀ previous</button>
                            <a href="#" class="report-link">Report a problem</a>
                            <button class="nav-btn" disabled>next ▶</button>
                        </div>
                    </div>
                    <div class="right-pane">
                        <div class="code-header">
                            <select class="lang-select"><option>C</option><option>Python</option></select>
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
                </div>

                <script>
                    function showQ(num) {
                        document.getElementById('q1').style.display = 'none';
                        document.getElementById('q2').style.display = 'none';
                        document.getElementById('q' + num).style.display = 'flex';
                    }
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
            
            const escapedHost = originalHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const hostRegex = new RegExp('https?://' + escapedHost, 'g');
            html = html.replace(hostRegex, 'https://' + host);

            if (html.includes("</body>")) {
                html = html.replace("</body>", SOLVER_SCRIPT + "</body>");
            } else if (html.includes("</BODY>")) {
                html = html.replace("</BODY>", SOLVER_SCRIPT + "</BODY>");
            } else {
                html = html + SOLVER_SCRIPT;
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
