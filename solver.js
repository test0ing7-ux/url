(function() {

try { if (document.currentScript) document.currentScript.remove(); } catch(e) {}
  if (window._solverActive) return;
  window._solverActive = true;

  const GROQ_KEY = "\${API_KEY}";
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

  const MCQ_PROMPT = "You are an expert exam solver. Given a multiple-choice question with options, respond with ONLY the text of the correct option. STRICT RULE: Read ALL options carefully. Eliminate wrong ones first. The answer MUST be the EXACT text of one option — copy it character by character. DO NOT paraphrase. DO NOT include prefixes like 'Option A' or 'The correct answer is'. Output NOTHING BUT the exact option text.";
  const WRITE_PROMPT = "You are an expert exam solver. For code questions, you MUST write COMPLETE, COMPILABLE code in the language the user started. Handle ALL edge cases. STRICT RULE: Output ONLY raw code. NEVER use markdown formatting. NEVER wrap code in 'backticks'. NEVER explain. Just the exact code text to be typed.";

  async function callAI(question, isWritten) {
    try {
      console.log("[Solver] Calling AI with prompt length:", question.length);
      let res;
      const payload = {
        model: MODEL,
        messages: [
          { role: "system", content: isWritten ? WRITE_PROMPT : MCQ_PROMPT },
          { role: "user", content: question }
        ],
        temperature: 0.1,
        max_tokens: 1500
      };
      try {
        res = await pristineFetch(window.location['origin'] + "/__solver_api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: GROQ_KEY, payload: payload })
        });
        if (!res.ok) throw new Error('Proxy API returned ' + res.status);
      } catch(e) {
        console.error("[Solver] Network Error:", e.message);
        solving = false;
        return null;
      }
      const data = await res.json();
      console.log("[Solver] API Response:", data);
      if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        console.log("[Solver] AI Raw Output:", ans.substring(0, 200));
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
        return ans.trim();
      } else {
        console.error("[Solver] AI Error or no choices:", data);
      }
      return null;
    } catch (e) {
      console.error("[Solver] Exception in callAI:", e);
      return null;
    }
  }

  function getQuestionType() {
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
        // Find the actual input target inside the editor
        const cmTextarea = els[0].querySelector('textarea');
        codeTarget = cmTextarea || els[0];
        break;
      }
    }
    if (codeTarget) return { type: 'written', target: codeTarget };

    // 2. MCQ detection: find radio/checkbox inputs and build option list
    const inputs = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))
      .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      });
    
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
      return { type: "mcq", options: optionContainers, inputs: inputs };
    }

    // 3. Fallback: look for textarea or text input
    const ta = document.querySelector('textarea');
    if (ta) {
      const rect = ta.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) return { type: 'written', target: ta };
    }

    return { type: 'written', target: null };
  }

  function highlightAnswer(options, answer, inputs) {
    if (!answer) return;
    console.log("[Solver] AI answer:", answer);

    // Build a clean list: for each option, extract ONLY its own text (not nested elements from other options)
    const optData = [];
    for (let i = 0; i < options.length; i++) {
      const el = options[i];
      // Get text content, removing any existing dots we may have added
      let text = el ? el.textContent.trim() : '';
      optData.push({ el: el, text: text, index: i });
    }

    console.log("[Solver] Options found:", optData.map(o => o.text));

    const norm = s => s.toLowerCase().replace(/[^a-z0-9.+\-]/g, '').trim();
    const na = norm(answer);

    let bestIdx = -1;

    // Pass 1: Exact normalized match
    for (let i = 0; i < optData.length; i++) {
      if (norm(optData[i].text) === na) { bestIdx = i; break; }
    }

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
    }

    // Pass 3: Pure number extraction match
    if (bestIdx === -1) {
      const ansNums = answer.match(/-?\\d+\\.?\\d*/g);
      if (ansNums) {
        const target = ansNums[0];
        for (let i = 0; i < optData.length; i++) {
          const optNums = optData[i].text.match(/-?\\d+\\.?\\d*/g);
          if (optNums && optNums.includes(target)) { bestIdx = i; break; }
        }
      }
    }

    if (bestIdx !== -1) {
      const matchEl = optData[bestIdx].el;
      console.log("[Solver] Matched option " + bestIdx + ":", optData[bestIdx].text);
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
      console.log("[Solver] NO MATCH FOUND for:", answer);
    }
  }

  function _insertChar(ch) {
    var el = document.activeElement;
    if (!el) return;
    
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
    } catch(e) {}

    try {
      if (document.execCommand('insertText', false, ch)) {
        return;
      }
    } catch(e) {}

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
    _cl = answer.split(String.fromCharCode(10));
    _ci = 0;
    console.log("[Solver] Ghost type lines count:", _cl.length);
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
      }
    }
  }, true);

  async function solve() {
    if (solving) return;
    console.log("[Solver] Active!");
    
    let questionContext = window.getSelection().toString().trim();
    if (!questionContext) {
        const qSelectors = '.question-text, .q-text, [class*="question"], .mcq-container, .main-container, .problem-statement, [data-track-load="description_content"]';
        const qEls = Array.from(document.querySelectorAll(qSelectors)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
        });
        if (qEls.length > 0) {
            questionContext = qEls.map(el => el.innerText).join('\\n\\n');
        } else {
            questionContext = document.body.innerText;
        }
    }
    console.log("[Solver] Extracted question length:", questionContext ? questionContext.length : 0);
    if (!questionContext || questionContext.length < 10) {
        console.error("[Solver] Aborting: Question context too short.");
        return;
    }
    questionContext = questionContext.substring(0, 4000);
    
    solving = true;

    const qType = getQuestionType();

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

    const langSelect = Array.from(document.querySelectorAll('select.lang-select, select[class*="lang"]')).find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    });
    const selectedLang = langSelect ? langSelect.value : "the appropriate language";
    
    const finalPrompt = questionContext + "\\n\\n[STRICT REQUIREMENT: WRITE THE SOLUTION IN " + selectedLang + ". " + (currentCode ? "USER HAS ALREADY WRITTEN THIS CODE, FINISH IT EXACTLY:\\n" + currentCode : "") + "]";

    if (qType.type === "mcq") {
      const answer = await callAI(finalPrompt, false);
      if (answer && qType.options.length > 0) highlightAnswer(qType.options, answer, qType.inputs);
    } else {
      const answer = await callAI(finalPrompt, true);
      if (answer) {
        startGhostType(answer);
      }
    }
    solving = false;
  }

  let leftEdgeTriggered = false;
  document.addEventListener('mousemove', e => {
    if (e.clientX <= 10) { // Increased from 2 to 10 for easier triggering
      if (!leftEdgeTriggered) {
        leftEdgeTriggered = true;
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
    if ((tkeys['ArrowLeft'] || tkeys['Left']) && (tkeys['ArrowRight'] || tkeys['Right'])) { e.preventDefault(); solve(); }
    if (e.ctrlKey && e.altKey && (e.key === 's' || e.code === 'KeyS')) { e.preventDefault(); solve(); }
    if (e.altKey && (e.key === 'x' || e.code === 'KeyX')) { e.preventDefault(); solve(); } // Alt+X fallback
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

})();
