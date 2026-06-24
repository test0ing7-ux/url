// Background service worker — handles API calls and state
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Default API key (user can change in popup)
let API_KEY = "";
let enabled = true;

// Load saved settings
chrome.storage.local.get(["apiKey", "enabled"], (data) => {
    if (data.apiKey) API_KEY = data.apiKey;
    if (data.enabled !== undefined) enabled = data.enabled;
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.apiKey) API_KEY = changes.apiKey.newValue;
    if (changes.enabled) enabled = changes.enabled.newValue;
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SOLVE") {
        if (!enabled || !API_KEY) {
            sendResponse({ error: "Extension disabled or no API key set" });
            return true;
        }
        solveQuestion(msg.question, msg.isWritten).then(answer => {
            sendResponse({ answer });
        }).catch(err => {
            sendResponse({ error: err.message });
        });
        return true; // Keep channel open for async response
    }
    if (msg.type === "GET_STATUS") {
        sendResponse({ enabled, hasKey: !!API_KEY });
        return true;
    }
});

async function solveQuestion(question, isWritten) {
    const MCQ_PROMPT = "You are an expert exam solver. Given a multiple-choice question with options, respond with ONLY the text of the correct option. STRICT RULE: Read ALL options carefully. Eliminate wrong ones first. The answer MUST be the EXACT text of one option — copy it character by character. DO NOT paraphrase. DO NOT include prefixes like 'Option A' or 'The correct answer is'. Output NOTHING BUT the exact option text.";
    const WRITE_PROMPT = "You are an expert exam solver. For code questions, you MUST write COMPLETE, COMPILABLE code in the language the user started. Handle ALL edge cases. STRICT RULE: Output ONLY raw code. NEVER use markdown formatting. NEVER wrap code in backticks. NEVER explain. Just the exact code text to be typed.";

    const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                { role: "system", content: isWritten ? WRITE_PROMPT : MCQ_PROMPT },
                { role: "user", content: question }
            ],
            temperature: 0.1,
            max_tokens: 1500
        })
    });

    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    if (data.choices && data.choices[0]) {
        let ans = data.choices[0].message.content.trim();
        // Strip markdown backticks
        if (ans.startsWith("```")) {
            const firstNl = ans.indexOf("\n");
            if (firstNl !== -1) ans = ans.substring(firstNl + 1);
        }
        if (ans.endsWith("```")) {
            ans = ans.substring(0, ans.lastIndexOf("```"));
        }
        return ans.trim();
    }
    throw new Error("No answer from AI");
}
