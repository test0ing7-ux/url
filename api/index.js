// Vercel Serverless Function Proxy
const API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";

// ==========================================
// CONFIGURATION
// Replace this with the free domain you get from FreeDNS
// MUST INCLUDE THE LEADING DOT. Example: ".mooo.com"
const PROXY_DOMAIN = ".mooo.com"; 
// ==========================================

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

module.exports = async function handler(req, res) {
    try {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const fullUrl = new URL(req.url, `${protocol}://${host}`);

        // 1. MOCK TESTPAD SECURITY VALIDATION
        if (fullUrl.searchParams.get("json") === "1") {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).send(JSON.stringify({ quiz: true, id: "proxy-test" }));
        }

        // 2. HARDCODED TARGET HOST
        const originalHost = "exam.testpad.chitkarauniversity.edu.in";

        const fetchUrl = "https://" + originalHost + fullUrl.pathname + fullUrl.search;

        // 3. BUILD PROXY REQUEST
        const proxyHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (['host', 'connection', 'x-forwarded-for', 'x-forwarded-proto', 'x-forwarded-port', 'x-vercel-id', 'x-vercel-forwarded-for', 'x-vercel-ip-timezone', 'x-vercel-ip-country'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'origin') {
                proxyHeaders.set(key, value.replace(host, originalHost));
            } else if (key.toLowerCase() === 'referer') {
                proxyHeaders.set(key, value.replace(host, originalHost));
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

        // Read raw body stream
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            if (chunks.length > 0) {
                fetchOptions.body = Buffer.concat(chunks);
            }
        }

        const response = await fetch(fetchUrl, fetchOptions);
        const contentType = response.headers.get("content-type") || "";

        // 4. REBUILD HEADERS
        for (const [key, value] of response.headers.entries()) {
            if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) continue;
            
            if (key.toLowerCase() === 'set-cookie') {
                const cookies = response.headers.getSetCookie();
                const rewrittenCookies = cookies.map(c => c.replace(/domain=[^;]+;?/gi, ""));
                res.setHeader('Set-Cookie', rewrittenCookies);
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
            const buffer = await response.arrayBuffer();
            res.send(Buffer.from(buffer));
        } else {
            res.send();
        }

    } catch (err) {
        console.error(err);
        res.status(502).send("Proxy error: " + err.message);
    }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
