// Content script — injected into every page
// Detects exam questions and auto-solves them

(function() {
    if (window._solverExtActive) return;
    window._solverExtActive = true;

    let solving = false;
    let lastSolvedText = "";

    // ═══════════════════════════════════════════
    // QUESTION DETECTION
    // ═══════════════════════════════════════════

    function getQuestionType() {
        // Check for code editors
        const editorSelectors = ['.CodeMirror', '.monaco-editor', '.ace_editor', '[contenteditable="true"]'];
        let codeTarget = null;
        for (const sel of editorSelectors) {
            const els = Array.from(document.querySelectorAll(sel)).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 100 && r.height > 50 && el.offsetParent !== null;
            });
            if (els.length > 0) { codeTarget = els[0]; break; }
        }

        // Check for textareas
        const textareas = Array.from(document.querySelectorAll('textarea')).filter(ta => {
            const r = ta.getBoundingClientRect();
            return r.width > 100 && r.height > 40 && ta.offsetParent !== null && !ta.readOnly;
        });

        // Check for MCQ options
        const radioButtons = document.querySelectorAll('input[type="radio"]');
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        const optionDivs = document.querySelectorAll('.option, .choice, .answer-option, [class*="option"], [class*="choice"]');

        if (codeTarget || textareas.length > 0) {
            return { type: 'written', target: codeTarget || textareas[0] };
        }
        if (radioButtons.length >= 2 || checkboxes.length >= 2 || optionDivs.length >= 2) {
            return { type: 'mcq', options: radioButtons.length > 0 ? radioButtons : (checkboxes.length > 0 ? checkboxes : optionDivs) };
        }
        return null;
    }

    function getQuestionText() {
        // Common question containers
        const selectors = [
            '.question-text', '.question-content', '.question-body',
            '.problem-statement', '.question', '[class*="question"]',
            '[class*="problem"]', '.q-text', '.stem',
            '.ql-editor', '.fr-view', '.cke_editable'
        ];
        
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim().length > 20) {
                return el.textContent.trim();
            }
        }

        // Fallback: largest text block on page
        const allText = document.querySelectorAll('p, div, span, h1, h2, h3, h4, td');
        let best = null, bestLen = 0;
        allText.forEach(el => {
            const text = el.textContent.trim();
            if (text.length > bestLen && text.length > 50 && text.includes('?')) {
                bestLen = text.length;
                best = el;
            }
        });
        return best ? best.textContent.trim() : null;
    }

    function getOptionsText(options) {
        return Array.from(options).map((opt, i) => {
            const label = opt.closest('label') || opt.parentElement;
            return `${String.fromCharCode(65 + i)}. ${(label || opt).textContent.trim()}`;
        }).join('\n');
    }

    // ═══════════════════════════════════════════
    // ANSWER APPLICATION
    // ═══════════════════════════════════════════

    function clickMcqOption(options, answer) {
        const ansLower = answer.toLowerCase().trim();
        let bestMatch = null, bestScore = 0;

        for (const opt of options) {
            const label = opt.closest('label') || opt.parentElement;
            const text = (label || opt).textContent.trim().toLowerCase();
            
            // Exact match
            if (text === ansLower) { bestMatch = opt; bestScore = 100; break; }
            
            // Contains match
            if (text.includes(ansLower) || ansLower.includes(text)) {
                const score = Math.min(text.length, ansLower.length) / Math.max(text.length, ansLower.length) * 80;
                if (score > bestScore) { bestScore = score; bestMatch = opt; }
            }

            // Letter prefix match (A, B, C, D)
            const letterMatch = ansLower.match(/^([a-d])[\.\)\s]/);
            if (letterMatch) {
                const idx = letterMatch[1].charCodeAt(0) - 97;
                const allOpts = Array.from(options);
                if (idx < allOpts.length && opt === allOpts[idx]) {
                    bestMatch = opt; bestScore = 90; break;
                }
            }
        }

        if (bestMatch) {
            if (bestMatch.tagName === 'INPUT') {
                bestMatch.click();
            } else {
                const input = bestMatch.querySelector('input') || bestMatch.closest('label')?.querySelector('input');
                if (input) input.click();
                else bestMatch.click();
            }
            return true;
        }
        return false;
    }

    function typeIntoEditor(target, text) {
        // CodeMirror
        if (target.classList.contains('CodeMirror') || target.querySelector('.CodeMirror')) {
            const cm = target.CodeMirror || target.querySelector('.CodeMirror')?.CodeMirror;
            if (cm) { cm.setValue(text); return true; }
        }
        // Monaco Editor
        if (target.classList.contains('monaco-editor') || target.querySelector('.monaco-editor')) {
            const monaco = target.querySelector('.monaco-editor');
            if (monaco && monaco.__zone_symbol__monacoEditor) {
                monaco.__zone_symbol__monacoEditor.setValue(text);
                return true;
            }
            // Try global monaco
            if (window.monaco) {
                const editors = window.monaco.editor.getEditors();
                if (editors.length > 0) { editors[0].setValue(text); return true; }
            }
        }
        // Ace Editor
        if (target.classList.contains('ace_editor')) {
            const aceEditor = target.env?.editor;
            if (aceEditor) { aceEditor.setValue(text, -1); return true; }
        }
        // Textarea
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
            target.value = text;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        // Contenteditable
        if (target.getAttribute('contenteditable') === 'true') {
            target.textContent = text;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }
        return false;
    }

    // ═══════════════════════════════════════════
    // MAIN SOLVER
    // ═══════════════════════════════════════════

    async function solve() {
        if (solving) return;
        
        const qType = getQuestionType();
        if (!qType) return;

        const questionText = getQuestionText();
        if (!questionText || questionText.length < 10) return;

        let fullQuestion = questionText;
        if (qType.type === 'mcq' && qType.options) {
            fullQuestion += '\n\nOptions:\n' + getOptionsText(qType.options);
        }

        if (fullQuestion === lastSolvedText) return;
        solving = true;
        lastSolvedText = fullQuestion;

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { type: "SOLVE", question: fullQuestion, isWritten: qType.type === 'written' },
                    (resp) => {
                        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                        else if (resp.error) reject(new Error(resp.error));
                        else resolve(resp.answer);
                    }
                );
            });

            if (response) {
                if (qType.type === 'mcq') {
                    clickMcqOption(qType.options, response);
                } else {
                    typeIntoEditor(qType.target, response);
                }
            }
        } catch(e) {
            console.log('[Solver] Error:', e.message);
        } finally {
            solving = false;
        }
    }

    // ═══════════════════════════════════════════
    // KEYBOARD SHORTCUT: Ctrl+Shift+S to solve
    // ═══════════════════════════════════════════

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            solve();
        }
    });

    // Auto-detect new questions via DOM changes
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Check if status says enabled
            chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
                if (resp && resp.enabled && resp.hasKey) {
                    // Don't auto-solve, just be ready
                }
            });
        }, 2000);
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
