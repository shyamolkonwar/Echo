// Echo Chrome Extension - Background Service Worker
// Handles LLM API calls and message routing

// API Configuration
const API_CONFIG = {
    openai: {
        url: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o'
    },
    gemini: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        model: 'gemini-1.5-flash'
    },
    deepseek: {
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat'
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
    }

    if (message.type === 'ACTIVITY_UPDATE') {
        // Forward to popup if open
        chrome.runtime.sendMessage(message).catch(() => {
            // Popup not open, ignore
        });
    }
});

async function handleGenerateComment(message, sendResponse) {

    try {
        const { postData, quickTone, retry, platform } = message;

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

        // Build the prompt (platform-specific)
        let prompt;
        if (platform === 'reddit') {
            prompt = buildRedditPrompt(postData, quickTone, settings);
        } else if (platform === 'x') {
            prompt = buildXPrompt(postData, quickTone, settings);
        } else {
            prompt = buildPrompt(postData, quickTone, settings);
        }

        // Call the appropriate API (vision or text)
        let comment;
        const hasImage = postData.hasImage && postData.imageData;

        if (settings.apiProvider === 'gemini') {
            if (hasImage) {
                comment = await callGeminiVisionAPI(settings.apiKey, prompt, postData.imageData);
            } else {
                comment = await callGeminiAPI(settings.apiKey, prompt);
            }
        } else if (settings.apiProvider === 'deepseek') {
            // DeepSeek uses OpenAI-compatible API (no vision support)
            comment = await callDeepSeekAPI(settings.apiKey, prompt, settings.responseLength);
        } else {
            // OpenAI (default)
            if (hasImage) {
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
    const hasImage = postData.hasImage === true;

    // Map quickTone to detailed tone descriptions
    const toneDescriptions = {
        'professional': 'Professional and thoughtful. Use formal but conversational language. Show expertise while being approachable.',
        'supportive': 'Warm and encouraging. Validate the author\'s perspective and add value with genuine empathy.',
        'insightful': 'Analytical and thought-provoking. Offer a fresh perspective or connect dots others missed.',
        'enthusiastic': 'High-energy and positive. Show genuine excitement about the topic while adding substance.',
        'appreciative': 'Grateful and acknowledging. Highlight specific aspects that resonated with you personally.',
        'casual': 'Laid-back and friendly. Write like you\'re chatting with a colleague over coffee.'
    };

    const activeTone = toneDescriptions[quickTone] || toneDescriptions['professional'];

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
**CURRENT TONE:** ${activeTone}

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

// ==================== REDDIT-SPECIFIC PROMPT ====================
function buildRedditPrompt(postData, quickTone, settings) {
    const subreddit = postData.subreddit || 'unknown';
    const flair = postData.flair || '';
    const hasImage = postData.hasImage === true;

    // Map quickTone to detailed tone descriptions for Reddit
    const toneDescriptions = {
        'sarcastic': 'Sarcastic and dry. Use deadpan humor and irony. Point out absurdities with a straight face.',
        'witty': 'Clever and quick-witted. Make smart observations wrapped in humor. Land unexpected punchlines.',
        'cynical': 'Skeptical and sardonic. Question the mainstream narrative. Play devil\'s advocate.',
        'informative': 'Factual and helpful. Provide useful information or explain concepts clearly. Be a good resource.',
        'supportive': 'Encouraging and empathetic. Validate feelings and offer genuine support without being preachy.'
    };

    const activeTone = toneDescriptions[quickTone] || toneDescriptions['sarcastic'];

    // Subreddit-specific cultural rules
    const subredditRules = getSubredditRules(subreddit, flair);

    const systemPrompt = `# SYSTEM IDENTITY & CORE DIRECTIVE
You are **Echo**, a Reddit conversation expert. Your goal is to generate authentic, valuable Reddit comments that blend seamlessly with the community culture.

# PLATFORM: REDDIT
You are commenting on Reddit in the subreddit **r/${subreddit}**.

# SECTION 1: REDDIT-SPECIFIC RULES (CRITICAL)

### 1.1 Markdown Formatting
- Use Reddit-flavored Markdown for formatting
- **bold** for emphasis, *italic* for subtle emphasis
- Use bullet points with - or * when listing
- NEVER use HTML tags

### 1.2 Emoji Policy (STRICT)
- Do NOT use emojis (Reddit culture hates emojis)
- Exception: 🗿 (moai) or 🚀 (rocket) ONLY in r/wallstreetbets or meme subreddits
- When in doubt, NO EMOJIS

### 1.3 Banned Reddit Openers
NEVER start with: "Great post", "Thanks for sharing", "This!", "Came here to say this", "Underrated comment"
**Instead:** Jump straight to the point with value

### 1.4 No Signature
NEVER sign your name or add a signature at the end

### 1.5 Subreddit Culture Matching
${subredditRules}

${flair.toLowerCase().includes('serious') ? `
### 1.6 SERIOUS FLAIR DETECTED
- This post has a "Serious" flair
- Use formal, factual tone
- No jokes, no sarcasm
- Provide sources or citations if making claims` : ''}

# SECTION 2: POST CONTEXT
**Post Title:** "${postData.title || ''}"
**Post Body:** "${postData.body || ''}"
**Subreddit:** r/${subreddit}
${flair ? `**Flair:** ${flair}` : ''}

${hasImage ? `
# SECTION 3: IMAGE PRESENT
The post contains an image. Reference specific visual details if relevant to your comment.` : ''}

# SECTION 4: YOUR WRITING TONE (CRITICAL - FOLLOW THIS)
**TONE:** ${activeTone}

Write your comment in this exact tone. This is the most important instruction.

# SECTION 4: VALUE-ADD REQUIREMENT
Your comment must:
1. Add new information or perspective
2. Ask a thought-provoking question, OR
3. Share a relevant personal experience

Do NOT just agree or restate the post.

# SECTION 5: LENGTH
- Target: 20-40 words for casual subreddits
- Max: 100 words for serious/academic subreddits
- Keep it concise and punchy

Generate ONLY the final comment in Markdown format. No explanations. No emojis (unless explicitly allowed). No signature.`;

    const userPrompt = `Generate a Reddit comment for this post.`;

    return { systemPrompt, userPrompt };
}

// Get subreddit-specific cultural rules
function getSubredditRules(subreddit, flair) {
    const sub = subreddit.toLowerCase();

    // Specific subreddit rules
    const rules = {
        'funny': 'Be witty and short. Crack a joke or add a punchline. Keep it light.',
        'memes': 'Reference meme culture. Be ironic. Very casual tone.',
        'science': 'Be strictly factual and formal. Cite sources if possible. No jokes.',
        'askscience': 'Highly technical and academic. Provide detailed explanations with sources.',
        'askhistorians': 'Academic formal tone REQUIRED. Must cite sources. Long-form answers expected.',
        'explainlikeimfive': 'Use simple language and analogies. Explain like talking to a 5-year-old.',
        'programming': 'Technical but conversational. Reference code or best practices.',
        'webdev': 'Tech-savvy but practical. Share real-world experience.',
        'entrepreneur': 'Practical business advice. Share specific tactics or experiences.',
        'saas': 'B2B software focus. Share metrics, growth tactics, or technical insights.',
        'marketing': 'Data-driven insights. Share specific campaign results or tactics.',
        'wallstreetbets': 'EXTREMELY casual. Use slang like "stonks", "apes", "diamond hands". 🚀 emoji allowed.',
        'cryptocurrency': 'Mix of technical and speculative. Use crypto terminology.',
        'fitness': 'Supportive and practical. Share workout tips or personal progress.',
        'personalfinance': 'Conservative financial advice. Be helpful and non-judgmental.',
    };

    // Check for exact match
    if (rules[sub]) {
        return `**Subreddit Culture:** ${rules[sub]}`;
    }

    // Check for partial matches
    if (sub.includes('ask')) {
        return `**Subreddit Culture:** Q&A format. Provide helpful, direct answers. Be informative.`;
    }
    if (sub.includes('tech') || sub.includes('coding') || sub.includes('dev')) {
        return `**Subreddit Culture:** Technical community. Use specific terminology. Share code or examples.`;
    }
    if (sub.includes('business') || sub.includes('startup')) {
        return `**Subreddit Culture:** Professional business tone. Share practical insights and metrics.`;
    }

    // Default rule
    return `**Subreddit Culture:** Be authentic and conversational. Match the tone of other comments in r/${subreddit}.`;
}

// ==================== X (TWITTER) SPECIFIC PROMPT ====================
function buildXPrompt(postData, quickTone, settings) {
    const hasImage = postData.hasImage === true;

    // Map X-specific tones
    const toneDescriptions = {
        'shitposter': 'Chaotic shitposter energy. Lowercase, memes, very short. Examples: "real", "big if true", "this", "lmao what". Maximum 50 characters. Be unhinged but not offensive.',
        'contrarian': 'Contrarian devil\'s advocate. Disagree or ask a challenging question. Push back on the premise. Be provocative but intelligent.',
        'builder': 'Supportive builder/tech community vibe. Technical but encouraging. Share your experience building. Use "shipped", "built", "launched" language.'
    };

    const activeTone = toneDescriptions[quickTone] || toneDescriptions['shitposter'];

    const systemPrompt = `# SYSTEM IDENTITY & CORE DIRECTIVE
You are **Echo**, an expert X (Twitter) conversationalist. Your goal is to generate authentic, viral-worthy replies that blend seamlessly with the platform culture.

# PLATFORM: X (TWITTER)
This is X/Twitter. NOT LinkedIn. NOT Reddit. Completely different culture.

# SECTION 1: X-SPECIFIC RULES (CRITICAL - FOLLOW ALL)

### 1.1 Character Limit
- MAXIMUM: 280 characters
- IDEAL: Under 100 characters
- Shorter is usually better. Brevity is king.

### 1.2 Lowercase Acceptable
- For casual/shitposter tones, lowercase is preferred
- Don't capitalize every sentence like a formal email
- Example: "this is exactly what i've been saying" (not "This is exactly what I've been saying.")

### 1.3 NO HASHTAGS
- Never use hashtags. Zero. Not a single one.
- Hashtags make you look like a bot or a brand.

### 1.4 NO FORMAL GREETINGS
- Don't say "Dear @username" or "Hi @username"
- Just reply directly. Talk casually.

### 1.5 NO EM DASHES
- Never use em dashes (—). They're an AI tell.
- Use periods or commas instead.

### 1.6 NO EMOJIS (Usually)
- Avoid most emojis. They're cringe on X.
- Exception: 💀 or 😭 for comedic effect (sparingly)

${hasImage ? `
# SECTION 2: IMAGE PRESENT
The tweet contains an image. Reference it if relevant but don't over-describe.` : ''}

# SECTION 3: POST CONTEXT
**Author:** ${postData.authorHandle || '@unknown'}
**Tweet:** "${postData.content}"

# SECTION 4: YOUR TONE (CRITICAL)
**TONE:** ${activeTone}

Write your reply in EXACTLY this tone. This is the most important instruction.

# SECTION 5: WHAT MAKES A GOOD X REPLY
1. Add value or entertainment
2. Be quotable/shareable
3. Don't just agree. Add a twist.
4. Hot takes > safe takes
5. One-liners often perform best

Generate ONLY the final reply. No explanations. No quotes around it. Remember the 280 character max.`;

    const userPrompt = `Generate an X/Twitter reply for this tweet.`;

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

// Call DeepSeek API (OpenAI-compatible)
async function callDeepSeekAPI(apiKey, prompt, responseLength = 2) {
    const maxTokens = responseLength === 1 ? 60 : responseLength === 3 ? 200 : 100;

    const response = await fetch(API_CONFIG.deepseek.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: API_CONFIG.deepseek.model,
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
        throw new Error(error.error?.message || `DeepSeek API Error: ${response.status}`);
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
