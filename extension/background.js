// Echo Chrome Extension - Background Service Worker
// Handles LLM API calls and message routing

// API Configuration
const API_CONFIG = {
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o-mini'
    },
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        model: 'gemini-1.5-flash'
    }
};

// Tone presets
const TONE_PRESETS = {
    professional: 'You write with a professional, insightful tone. You provide value through your expertise and experience. You use proper grammar and avoid slang.',
    casual: 'You write casually and conversationally. You use wit and humor when appropriate. You keep things light but still meaningful.',
    supportive: 'You write with empathy and encouragement. You acknowledge others\' achievements and struggles. You provide constructive feedback.'
};

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GENERATE_COMMENT') {
        handleGenerateComment(message, sendResponse);
        return true; // Keep the message channel open for async response
    }

    if (message.type === 'LOG_ACTIVITY') {
        // Local logging only - no Supabase
        console.log('[Echo Background] Activity logged locally:', message.data?.author_name);
    }

    if (message.type === 'ACTIVITY_UPDATE') {
        // Forward to popup if open
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup not open, ignore
        });
    }
});

async function handleGenerateComment(message, sendResponse) {
    console.log('[Echo Background] Handling comment generation request');
    console.log('[Echo Background] Post data:', message.postData);

    try {
        const { postData, quickTone, retry } = message;

        // Get user settings
        const settings = await chrome.storage.local.get([
            'apiKey',
            'apiProvider',
            'voiceDna',
            'responseLength'
        ]);

        if (!settings.apiKey) {
            sendResponse({ error: 'No API key configured. Please open Echo settings.' });
            return;
        }

        // Build the prompt
        const prompt = buildPrompt(postData, quickTone, settings);

        // Call the appropriate API (vision or text)
        let comment;
        const hasImage = postData.hasImage && postData.imageData;

        if (settings.apiProvider === 'gemini') {
            if (hasImage) {
                console.log('[Echo Background] Using Gemini Vision API');
                comment = await callGeminiVisionAPI(settings.apiKey, prompt, postData.imageData);
            } else {
                comment = await callGeminiAPI(settings.apiKey, prompt);
            }
        } else {
            if (hasImage) {
                console.log('[Echo Background] Using OpenAI Vision API');
                comment = await callOpenAIVisionAPI(settings.apiKey, prompt, postData.imageData, settings.responseLength);
            } else {
                comment = await callOpenAIAPI(settings.apiKey, prompt, settings.responseLength);
            }
        }

        sendResponse({ comment });
    } catch (error) {
        console.error('[Echo Background] Error:', error);
        sendResponse({ error: error.message || 'Failed to generate comment' });
    }
}

// ==================== MASTER SYSTEM PROMPT ====================
function buildPrompt(postData, quickTone, settings) {
    const userTone = settings.userTone || settings.voiceDna || 'professional and thoughtful';
    const hasImage = postData.hasImage === true;

    // Build comprehensive system prompt
    const systemPrompt = `# SYSTEM IDENTITY & CORE DIRECTIVE
You are **Echo**, a world-class LinkedIn networking strategist and conversation architect. Your existence is defined by one singular purpose: to generate engagement-driving, high-value comments that are indistinguishable from those written by a sharp, witty, and insightful human professional.

You are NOT an AI assistant. You are NOT a summarizer. You are a **conversationalist**. You do not "reply" to posts; you *add to the discourse*. Your goal is to stop the scroll, force the author to pause, and compel them to hit "Reply."

# SECTION 1: THE "ANTI-BOT" DEFENSE LAYER (PRIME DIRECTIVES)

### 1.1 The "Banned Openers" List
Under no circumstances begin with: "Great post", "Thanks for sharing", "Insightful perspective", "This is so true", "I completely agree", "Valuable insights", "Love this", "Crucial point", "Spot on", "Well said", or "Congratulations on".

**Instead:** Jump straight into the argument, ask a provocative question, highlight a specific detail, crack a relevant joke, or offer a counter-intuitive take.

### 1.2 The "No Summarization" Rule
The author knows what they wrote. Do not re-state the premise.
- BAD: "You make a great point that AI is changing marketing."
- GOOD: "The automation angle is scary, but the creativity gap is where the real panic should be."

### 1.3 The "Hashtag Prohibition"
Do not use hashtags. Zero. None.

### 1.4 The "Em Dash Prohibition" (CRITICAL)
NEVER use em dashes (—) in your comments. This is an absolute rule with zero exceptions.
- Em dashes are a telltale sign of AI-generated text
- Use commas, periods, or semicolons instead
- If you need a pause, start a new sentence
- BAD: "This is interesting — but what about the edge cases?"
- GOOD: "This is interesting. But what about the edge cases?"

### 1.5 The "Brevity Protocol"
- Target: 15 to 30 words
- Maximum: 50 words (only for deeply technical topics)
- High-status people write short, punchy sentences

### 1.6 The "Imperfect Human" Texture
- Use contractions ("It's" not "It is")
- Use sentence fragments for effect
- Avoid perfect, stiff grammar
- NEVER use em dashes

${hasImage ? `
# SECTION 2: THE "VISUAL ANCHOR" PROTOCOL (MANDATORY)
The image is PRIMARY. Your comment MUST prove you looked at it.
- Scan for: data points on charts, background objects, colors, font choices, facial expressions
- Reference a specific visual detail nobody else noticed
- Generic comments on image posts = #1 bot indicator` : ''}

# SECTION 3: THE CHAMELEON ENGINE (USER PERSONA)
**CURRENT USER PERSONA:** "${userTone}"

**ADAPTATION RULES:**
- Match their vocabulary, sentence structure, and rhythm
- If "sarcastic": use dry wit
- If "supportive": use warmer words  
- If "tech-savvy": use specific industry terms
- Emoji usage: Professional = 0, Casual = max 1 subtle emoji at end

# SECTION 4: VALUE-ADD REQUIREMENT
Your comment must be one of:
1. **The Expander:** Add a new angle or example
2. **The Challenger:** Politely disagree or point out an exception
3. **The Connector:** Relate to a broader trend

# SECTION 5: QUALITY CHECKS
Before output:
- Does it sound like a bot? -> REWRITE
- Contains em dash (—)? -> REWRITE without it
- Longer than 3 sentences? -> CUT 50%
- Mentioned the image? (if exists) -> REQUIRED
- Too agreeable? -> Add nuance
- Used banned phrase? -> DELETE

Generate ONLY the final comment. No explanations. No quotes. NO EM DASHES.`;

    const userPrompt = `Post by ${postData.authorName}:\n"${postData.content}"\n\nWrite an engaging comment.`;

    return { systemPrompt, userPrompt };
}

// Call OpenAI API
async function callOpenAIAPI(apiKey, prompt, responseLength = 2) {
    const maxTokens = responseLength === 1 ? 30 : responseLength === 3 ? 80 : 50;

    const response = await fetch(API_CONFIG.openai.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: API_CONFIG.openai.model,
            messages: [
                { role: 'system', content: prompt.systemPrompt },
                { role: 'user', content: prompt.userPrompt }
            ],
            max_tokens: maxTokens,
            temperature: 0.8
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
}

// Call Gemini API
async function callGeminiAPI(apiKey, prompt) {
    const url = `${API_CONFIG.gemini.url}?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: `${prompt.systemPrompt}\n\n${prompt.userPrompt}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 60
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// Call OpenAI Vision API (gpt-4o-mini with image)
async function callOpenAIVisionAPI(apiKey, prompt, imageData, responseLength = 2) {
    const maxTokens = responseLength === 1 ? 30 : responseLength === 3 ? 80 : 50;

    const response = await fetch(API_CONFIG.openai.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: prompt.systemPrompt + ' Reference specific visual details from the image.'
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt.userPrompt },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageData}`,
                                detail: 'low' // Faster and cheaper
                            }
                        }
                    ]
                }
            ],
            max_tokens: maxTokens,
            temperature: 0.8
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '';
}

// Call Gemini Vision API (gemini-1.5-flash with image)
async function callGeminiVisionAPI(apiKey, prompt, imageData) {
    const url = `${API_CONFIG.gemini.url}?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt.systemPrompt + '\n\n' + prompt.userPrompt + '\n\nReference specific visual details from the image.' },
                    {
                        inline_data: {
                            mime_type: 'image/jpeg',
                            data: imageData
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 60
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// (Function removed: No Supabase logging)

// (Function removed: No Supabase sync)

// Extension install handler
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Initialize default settings
        chrome.storage.local.set({
            isActive: false,
            isAutoPilot: false,
            quickTone: 'professional',
            responseLength: 2,
            delayTimer: 2,
            activityLog: [],
            watchedCreators: [],
            userTone: '',  // User's custom voice description
            voiceDna: ''   // Keep for backward compatibility
        });

        console.log('[Echo] Extension installed');
    }

    // Set up alarms
    if (chrome.alarms) {
        chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
    }
});

// Keep service worker alive via alarm
if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'keepAlive') {
            // Just a ping for service worker
        }
    });
}
