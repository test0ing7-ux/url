(function() {

try { if (document.currentScript) document.currentScript.remove(); } catch(e) {}
  if (window._solverActive) return;
  window._solverActive = true;

  console.log("[S] Solver script loaded!");
  console.log("[S] Origin:", window.location.origin);

  const GROQ_KEY = "\${API_KEY}";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const MODEL = "llama-3.3-70b-versatile";

  console.log("[S] API Key present:", GROQ_KEY && GROQ_KEY.length > 5 ? "YES (" + GROQ_KEY.substring(0,8) + "...)" : "NO/EMPTY");

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
    console.log("[S] Pristine fetch: iframe method OK");
  } catch(e) {
    console.warn("[S] Pristine fetch: iframe FAILED, using window.fetch", e.message);
  }

  const MCQ_PROMPT = "You are an expert exam solver. Given a multiple-choice question with options, respond with ONLY the text of the correct option. STRICT RULE: Read ALL options carefully. Eliminate wrong ones first. The answer MUST be the EXACT text of one option — copy it character by character. DO NOT paraphrase. DO NOT include prefixes like 'Option A' or 'The correct answer is'. Output NOTHING BUT the exact option text.";
  const WRITE_PROMPT = "You are an expert exam solver. For code questions, you MUST write COMPLETE, COMPILABLE code in the language the user started. Handle ALL edge cases. STRICT RULE: Output ONLY raw code. NEVER use markdown formatting. NEVER wrap code in 'backticks'. NEVER explain. Just the exact code text to be typed.";

  const GAS_URL = "https://script.google.com/macros/s/AKfycbzrYUNPYFeWYg_Pw1WZov5aryQhxno4pzW7Gd3kKRL4_rSkp21zHA0ByQyLWPy5tXcJ/exec";

  async function callAI(question, isWritten) {
    console.log("[S] callAI() called. isWritten:", isWritten, "prompt length:", question.length);
    try {
      let res;
      let data;
      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: isWritten ? WRITE_PROMPT : MCQ_PROMPT },
          { role: "user", content: question }
        ],
        temperature: 0.1,
        max_tokens: 1500
      };

      // === Attempt 1: Direct proxy route ===
      const apiUrl = window.location['origin'] + "/__solver_api";
      console.log("[S] Attempt 1: Direct proxy", apiUrl);
      let directOk = false;
      try {
        res = await pristineFetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: GROQ_KEY, payload: payload })
        });
        console.log("[S] Direct proxy status:", res.status);
        if (res.ok) {
          data = await res.json();
          if (data.choices && data.choices[0]) {
            directOk = true;
            console.log("[S] Direct proxy SUCCESS");
          } else {
            console.warn("[S] Direct proxy returned no choices:", data.error);
          }
        } else {
          console.warn("[S] Direct proxy HTTP error:", res.status);
        }
      } catch(e) {
        console.warn("[S] Direct proxy NETWORK FAIL:", e.message);
      }

      // === Attempt 2: Google Apps Script fallback ===
      if (!directOk) {
        console.log("[S] Attempt 2: Google Apps Script fallback");
        try {
          res = await pristineFetch(GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: GROQ_KEY, payload: payload }),
            redirect: "follow"
          });
          console.log("[S] GAS status:", res.status);
          if (res.ok) {
            data = await res.json();
            if (data.choices && data.choices[0]) {
              console.log("[S] GAS fallback SUCCESS");
            } else {
              console.error("[S] GAS returned no choices:", data.error);
              solving = false;
              return null;
            }
          } else {
            console.error("[S] GAS HTTP error:", res.status);
            solving = false;
            return null;
          }
        } catch(e) {
          console.error("[S] GAS NETWORK FAIL:", e.message);
          solving = false;
          return null;
        }
      }

      console.log("[S] API response data:", JSON.stringify(data).substring(0, 300));
      if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        console.log("[S] AI raw answer:", ans.substring(0, 200));
        var nl = String.fromCharCode(10);
        var bt = String.fromCharCode(96);
        var triplebt = bt+bt+bt;
        // Strip markdown backticks safely
        if (ans.startsWith(triplebt)) {
          var firstNl = ans.indexOf(nl);
          if (firstNl !== -1) ans = ans.substring(firstNl + 1);
        }
        if (ans.endsWith(triplebt)) {
          ans = ans.substring(0, ans.lastIndexOf(triplebt));
        }
        console.log("[S] AI cleaned answer:", ans.trim().substring(0, 200));
        return ans.trim();
      }
      console.error("[S] No choices in final data! data.error:", data.error);
      return null;
    } catch (e) {
      console.error("[S] callAI exception:", e.message, e);
      return null;
    }
  }

  function getQuestionType() {
    console.log("[S] getQuestionType() called");
    // 1. Check for code editor FIRST
    const editorSelectors = [
      '.CodeMirror',
      '.monaco-editor',
      '.ace_editor',
      '[contenteditable="true"]'
    ];
    let codeTarget = null;
    for (const sel of editorSelectors) {
      const els = Array.from(document.querySelectorAll(sel))
        .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 50 && rect.height > 50 && rect.bottom > 0 && rect.top < window.innerHeight;
        });
      if (els.length > 0) {
        console.log("[S] Found code editor:", sel, "count:", els.length);
        // Find the actual input target inside the editor
        const cmTextarea = els[0].querySelector('textarea');
        codeTarget = cmTextarea || els[0];
        break;
      }
    }
    if (codeTarget) {
      console.log("[S] Question type: WRITTEN (code editor found)");
      return { type: 'written', target: codeTarget };
    }

    // 2. MCQ detection: find radio/checkbox inputs and build option list
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      });
    
    console.log("[S] Radio/checkbox inputs found:", inputs.length);

    if (inputs.length >= 2) {
      // For each input, find the container that holds the option text
      const optionContainers = [];
      for (const inp of inputs) {
        // Walk up to find a meaningful container with text
        let container = inp.closest('label') || inp.parentElement;
        // If the container has very little text, try going one level higher
        if (container && container.textContent.trim().length < 1) {
          container = container.parentElement;
        }
        optionContainers.push(container);
      }
      console.log("[S] Question type: MCQ (" + inputs.length + " options)");
      console.log("[S] Option texts:", optionContainers.map(c => c ? c.textContent.trim().substring(0,50) : 'NULL'));
      return { type: "mcq", options: optionContainers, inputs: inputs };
    }

    // 3. Fallback: look for textarea or text input
    const ta = document.querySelector('textarea');
    if (ta) {
      const rect = ta.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        console.log("[S] Question type: WRITTEN (textarea fallback)");
        return { type: 'written', target: ta };
      }
    }

    console.log("[S] Question type: WRITTEN (no target found!)");
    return { type: 'written', target: null };
  }

  function highlightAnswer(options, answer, inputs) {
    console.log("[S] highlightAnswer() called. AI answer:", answer.substring(0, 100));
    if (!answer) return;
    

    // Build a clean list: for each option, extract ONLY its own text (not nested elements from other options)
    const optData = [];
    for (let i = 0; i < options.length; i++) {
      const el = options[i];
      // Get text content, removing any existing dots we may have added
      let text = el ? el.textContent.trim() : '';
      optData.push({ el: el, text: text, index: i });
    }

    console.log("[S] Options for matching:", optData.map(o => o.text.substring(0,60)));

    const norm = s => s.toLowerCase().replace(/[^a-z0-9.+\-]/g, '').trim();
    const na = norm(answer);
    console.log("[S] Normalized AI answer:", na.substring(0, 80));

    let bestIdx = -1;

    // Pass 1: Exact normalized match
    for (let i = 0; i < optData.length; i++) {
      if (norm(optData[i].text) === na) { bestIdx = i; break; }
    }
    if (bestIdx !== -1) console.log("[S] Match found in Pass 1 (exact):", bestIdx);

    // Pass 2: The answer text is contained within the option or vice-versa, scored by length similarity
    if (bestIdx === -1) {
      let maxScore = 0;
      for (let i = 0; i < optData.length; i++) {
        const ot = norm(optData[i].text);
        if (ot.length === 0) continue;
        if (ot.includes(na) || na.includes(ot)) {
          const score = Math.min(ot.length, na.length) / Math.max(ot.length, na.length);
          if (score > maxScore) { maxScore = score; bestIdx = i; }
        }
      }
      if (bestIdx !== -1) console.log("[S] Match found in Pass 2 (contains):", bestIdx, "score:", maxScore);
    }

    // Pass 3: Pure number extraction match
    if (bestIdx === -1) {
      const ansNums = answer.match(/-?\d+\.?\d*/g);
      if (ansNums) {
        const target = ansNums[0];
        for (let i = 0; i < optData.length; i++) {
          const optNums = optData[i].text.match(/-?\d+\.?\d*/g);
          if (optNums && optNums.includes(target)) { bestIdx = i; break; }
        }
      }
      if (bestIdx !== -1) console.log("[S] Match found in Pass 3 (number):", bestIdx);
    }

    if (bestIdx !== -1) {
      const matchEl = optData[bestIdx].el;
      console.log("[S] MATCHED option " + bestIdx + ":", optData[bestIdx].text.substring(0,60));
      
      // Append a black dot to the matched option container
      const dot = document.createElement('span');
      dot.textContent = ' .';
      dot.style.color = '#000000';
      dot.style.fontWeight = 'bold';
      dot.style.fontSize = '1em';
      dot.className = '_solver_dot';
      matchEl.appendChild(dot);
      setTimeout(() => { if (dot.parentNode) dot.remove(); }, 3000);
    } else {
      console.error("[S] NO MATCH FOUND! AI said:", answer, "Options were:", optData.map(o => o.text));
    }
  }

  function _insertChar(ch) {
    var el = document.activeElement;
    if (!el) { console.warn("[S] _insertChar: no activeElement!"); return; }
    
    // Direct CodeMirror Injection (100% reliable for CodeQuotient)
    try {
      let cmEl = el.closest('.CodeMirror');
      if (cmEl && cmEl.CodeMirror) {
        let cm = cmEl.CodeMirror;
        if (cm.getDoc) {
          cm.getDoc().replaceRange(ch, cm.getDoc().getCursor());
          return;
        } else if (cm.replaceSelection) {
          cm.replaceSelection(ch);
          return;
        }
      }
    } catch(e) { console.warn("[S] CodeMirror insert failed:", e.message); }

    try {
      if (document.execCommand('insertText', false, ch)) {
        return;
      }
    } catch(e) { console.warn("[S] execCommand insertText failed:", e.message); }

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                                   Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        var start = el.selectionStart || 0;
        var end = el.selectionEnd || 0;
        var newVal = el.value.substring(0, start) + ch + el.value.substring(end);
        nativeInputValueSetter.set.call(el, newVal);
        el.selectionStart = el.selectionEnd = start + ch.length;
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        return;
      }
    }
    
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
    console.log("[S] startGhostType() called. Answer length:", answer.length, "lines:", answer.split(String.fromCharCode(10)).length);
    console.log("[S] Active element:", document.activeElement ? document.activeElement.tagName + (document.activeElement.className ? '.' + document.activeElement.className.substring(0,30) : '') : 'NONE');
    // Clear existing code in the editor before ghost-typing
    try {
      var el = document.activeElement;
      if (el) {
        var cmEl = el.closest && el.closest('.CodeMirror');
        if (cmEl && cmEl.CodeMirror) {
          console.log("[S] Clearing CodeMirror editor");
          cmEl.CodeMirror.setValue('');
        } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
          console.log("[S] Clearing textarea/input");
          el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    } catch(e) { console.warn("[S] Clear editor failed:", e.message); }
    _cl = answer.split(String.fromCharCode(10));
    _ci = 0;
    console.log("[S] Ghost type buffer ready. Lines:", _cl.length, "Start typing any key to inject code!");
  }

  document.addEventListener('keydown', function(e) {
    const key = e.key || '';
    if (_cl.length > 0 && !e.ctrlKey && !e.altKey && !e.metaKey && key.length === 1) {
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || el.classList.contains('monaco-editor') || el.contentEditable === 'true' || el.tagName === 'INPUT' || el.closest('.CodeMirror'))) {
        e.preventDefault(); e.stopPropagation();
        let cur = _cl[0];
        if (_ci < cur.length) {
          _insertChar(cur[_ci]);
          _ci++;
        } else {
          _insertChar(String.fromCharCode(10));
          _cl.shift(); _ci = 0;
        }
        if (_cl.length === 0) console.log("[S] Ghost type COMPLETE!");
      }
    }
  }, true);

  async function solve() {
    if (solving) { console.log("[S] solve() skipped — already solving"); return; }
    console.log("[S] ===== SOLVE TRIGGERED =====");
    
    let questionContext = window.getSelection().toString().trim();
    console.log("[S] Selection text length:", questionContext.length);
    if (!questionContext) {
        const qSelectors = '.question-text, .q-text, [class*="question"], .mcq-container, .main-container, .problem-statement, [data-track-load="description_content"]';
        const qEls = Array.from(document.querySelectorAll(qSelectors)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        });
        console.log("[S] Question elements found:", qEls.length, "selectors:", qSelectors);
        if (qEls.length > 0) {
            questionContext = qEls.map(el => el.innerText).join('\n\n');
            console.log("[S] Using question elements. Text length:", questionContext.length);
        } else {
            questionContext = document.body.innerText;
            console.log("[S] FALLBACK: Using full body text. Length:", questionContext.length);
        }
    }
    if (!questionContext || questionContext.length < 10) {
      console.error("[S] ABORTED: Question context too short! Length:", questionContext ? questionContext.length : 0);
      return;
    }
    questionContext = questionContext.substring(0, 4000);
    console.log("[S] Final question context (first 200 chars):", questionContext.substring(0, 200));
    
    solving = true;

    const qType = getQuestionType();
    console.log("[S] Detected question type:", qType.type, "target:", qType.target ? qType.target.tagName : 'null');

    let currentCode = "";
    const el = qType.target || document.activeElement;
    if (el) {
      let cm = el.closest('.CodeMirror');
      if (cm && cm.CodeMirror) {
         currentCode = cm.CodeMirror.getValue();
      } else if (cm) {
         currentCode = cm.innerText || cm.textContent;
      } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
         currentCode = el.value;
      } else if (el.classList.contains('monaco-editor') || el.contentEditable === 'true') {
         currentCode = el.innerText || el.textContent;
      }
    }
    if (currentCode) console.log("[S] Existing code in editor (first 100):", currentCode.substring(0, 100));

    const langSelect = Array.from(document.querySelectorAll('select.lang-select, select[class*="lang"]')).find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const selectedLang = langSelect ? langSelect.value : "the appropriate language";
    console.log("[S] Language:", selectedLang);
    
    const finalPrompt = questionContext + "\n\n[STRICT REQUIREMENT: WRITE THE SOLUTION IN " + selectedLang + ". " + (currentCode ? "USER HAS ALREADY WRITTEN THIS CODE, FINISH IT EXACTLY:\n" + currentCode : "") + "]";

    if (qType.type === "mcq") {
      console.log("[S] Calling AI for MCQ...");
      const answer = await callAI(finalPrompt, false);
      console.log("[S] MCQ answer received:", answer ? answer.substring(0, 100) : "NULL");
      if (answer && qType.options.length > 0) highlightAnswer(qType.options, answer, qType.inputs);
    } else {
      console.log("[S] Calling AI for CODE...");
      const answer = await callAI(finalPrompt, true);
      console.log("[S] CODE answer received:", answer ? answer.substring(0, 100) + "..." : "NULL");
      if (answer) {
        startGhostType(answer);
      } else {
        console.error("[S] No answer received from AI for code question!");
      }
    }
    solving = false;
    console.log("[S] ===== SOLVE COMPLETE =====");
  }

  let leftEdgeTriggered = false;
  document.addEventListener('mousemove', e => {
    if (e.clientX <= 10) {
      if (!leftEdgeTriggered) {
        leftEdgeTriggered = true;
        console.log("[S] LEFT EDGE triggered! clientX:", e.clientX);
        solve();
      }
    } else {
      leftEdgeTriggered = false;
    }
    if (e.clientX >= window.innerWidth - 10) { _cl = []; _ci = 0; }
  });

  let tkeys = {};
  document.addEventListener('keydown', e => {
    tkeys[e.code || e.key] = true;
    if ((tkeys['ArrowLeft'] || tkeys['Left']) && (tkeys['ArrowRight'] || tkeys['Right'])) { e.preventDefault(); console.log("[S] Arrow keys triggered!"); solve(); }
    if (e.ctrlKey && e.altKey && (e.key === 's' || e.code === 'KeyS')) { e.preventDefault(); console.log("[S] Ctrl+Alt+S triggered!"); solve(); }
    if (e.altKey && (e.key === 'x' || e.code === 'KeyX')) { e.preventDefault(); console.log("[S] Alt+X triggered!"); solve(); }
  }, true);
  
  // Block keypress and keyup for ghost-typed characters to prevent duplicate or real keystrokes
  document.addEventListener('keypress', function(e) {
    if (_cl.length > 0 && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key || '').length === 1) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);

  document.addEventListener('keyup', function(e) {
    tkeys[e.code || e.key] = false;
    if (_cl.length > 0 && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key || '').length === 1) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);

  console.log("[S] Solver fully initialized! Triggers: left-edge, Ctrl+Alt+S, Alt+X, Left+Right arrows");

})();
