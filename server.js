const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || ".mooo.com";

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

  const SYSTEM_PROMPT = "You are an expert exam solver. Given a multiple-choice question with options, respond with ONLY the correct option text exactly as written. No explanation, no prefix, just the exact option text.";

  async function callAI(question) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GROQ_KEY
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: question }
          ],
          temperature: 0.1,
          max_tokens: 300
        })
      });
      const data = await res.json();
      if (data.choices && data.choices[0]) return data.choices[0].message.content.trim();
      return null;
    } catch (e) { return null; }
  }

  function extractQuestion() {
    const bodyText = document.body.innerText;
    if (!bodyText || bodyText.length < 20) return null;
    const options = Array.from(document.querySelectorAll('.choice, .option-text, [class*="option"], [class*="choice"], [class*="answer"]'));
    if (options.length >= 2) return { fullText: bodyText, options: options };
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
    if (inputs.length >= 2) {
      return { fullText: bodyText, options: inputs.map(i => i.closest('label') || i.parentElement) };
    }
    return { fullText: bodyText, options: [] };
  }

  function highlightAnswer(options, answer) {
    if (!answer) return;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const na = norm(answer);
    for (const opt of options) {
      const ot = norm(opt.textContent);
      if (ot === na || na.includes(ot) || ot.includes(na)) {
        const orig = opt.textContent;
        opt.textContent = orig + ' /';
        setTimeout(() => { opt.textContent = orig; }, 3000);
        return;
      }
    }
    const short = na.substring(0, 15);
    for (const opt of options) {
      const ot = norm(opt.textContent);
      if (ot.startsWith(short) || short.startsWith(ot)) {
        const orig = opt.textContent;
        opt.textContent = orig + ' /';
        setTimeout(() => { opt.textContent = orig; }, 3000);
        return;
      }
    }
  }

  async function solve() {
    if (solving) return;
    const q = extractQuestion();
    if (!q || !q.fullText || q.fullText.length < 20) return;
    const sig = q.fullText.substring(0, 200);
    if (sig === lastSolvedText) return;
    solving = true;
    lastSolvedText = sig;
    const answer = await callAI(q.fullText);
    if (answer && q.options.length > 0) highlightAnswer(q.options, answer);
    solving = false;
  }

  // Trigger 1: Mouse to left edge
  let lastEdge = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (e.clientX <= 1 && now - lastEdge > 3000) { lastEdge = now; solve(); }
  });

  // Trigger 2: Left+Right arrow keys
  let keys = {};
  document.addEventListener('keydown', e => {
    keys[e.code || e.key] = true;
    if ((keys['ArrowLeft'] || keys['Left']) && (keys['ArrowRight'] || keys['Right'])) { e.preventDefault(); solve(); }
  }, true);
  document.addEventListener('keyup', e => { keys[e.code || e.key] = false; }, true);

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

// Parse bodies as raw buffers
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.all('*', async (req, res) => {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host || '';
        const fullUrl = new URL(req.originalUrl || req.url, protocol + '://' + host);

        // 1. MOCK TESTPAD SECURITY VALIDATION
        if (fullUrl.searchParams.get("json") === "1") {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).send(JSON.stringify({ quiz: true, id: "proxy-test" }));
        }

        // 2. EXTRACT ORIGINAL HOST
        if (!host.endsWith(PROXY_DOMAIN)) {
            // For testing locally or via direct Railway URL
            if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('railway.app') || host.includes('up.railway.app')) {
                return res.status(400).send("Please use the " + PROXY_DOMAIN + " domain to access this proxy.");
            }
            return res.status(400).send("Invalid proxy domain mapping. Hostname must end with " + PROXY_DOMAIN);
        }

        const originalHost = host.slice(0, -PROXY_DOMAIN.length);
        if (!originalHost) {
            return res.status(400).send("Missing original domain.");
        }

        const fetchUrl = "https://" + originalHost + req.originalUrl;

        // 3. BUILD PROXY REQUEST
        const proxyHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (['host', 'connection', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'origin' || key.toLowerCase() === 'referer') {
                proxyHeaders.set(key, value.replace(PROXY_DOMAIN, ""));
            } else {
                proxyHeaders.set(key, value);
            }
        }
        proxyHeaders.set("Host", originalHost);

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
                // Fetch API returns multiple cookies as a single comma-separated string sometimes,
                // but getSetCookie() handles it properly in Node 20+
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
        res.removeHeader("x-frame-options");

        // 5. INJECT SOLVER SCRIPT
        if (contentType.includes("text/html")) {
            let html = await response.text();
            
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
