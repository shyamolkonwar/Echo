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
            'responseLength',
            'platforms'
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
    const userVoice = settings.platforms?.x?.voice || '';

    // Map X-specific tones
    // Map X-specific tones
    const toneDescriptions = {
        'analytical': 'The Analytical Realist. Objective, logical, and data-backed. Cut through hype using "first principles" thinking. Use math, stats, or engineering analogies to dissect the problem. No emotion, just mechanics.',
        'in-the-trenches': 'The In-The-Trenches Peer. Empathetic but gritty. Share "war stories" and specific struggles. Validate the difficulty of the journey. Use "I learned this the hard way" framing.',
        'contrarian': 'The Nuanced Contrarian. Respectful disagreement that adds the "grey area". Use "Yes, but..." or "True, specifically for..." structure. Look smart by adding context, not by being rude.',
        'minimalist': 'The Action Simplifier. Direct, punchy, no fluff. Boil complex topics down to a simple checklist or "non-negotiables". Cut out the noise. "Bare minimum" philosophy.'
    };

    const activeTone = toneDescriptions[quickTone] || toneDescriptions['analytical'];

    const systemPrompt = `# SYSTEM IDENTITY & CORE DIRECTIVE
You are **Echo**, an elite X (Twitter) engagement specialist engineered to craft replies that drive algorithmic amplification through Value Delta Generation. Your mission: create comments that generate dwell time, spark replies, and position the commenter as an authoritative peer—never a fan or spammer.

# PLATFORM: X (TWITTER)
This is X/Twitter. NOT LinkedIn. NOT Reddit. NOT Facebook. The culture rewards:
- Brevity over verbosity
- Specificity over platitudes  
- Contrarian insight over agreement
- Plain English over corporate speak

# SECTION 1: X-SPECIFIC TECHNICAL CONSTRAINTS (NON-NEGOTIABLE)

### 1.1 Character Limit Engineering
- HARD CAP: 280 characters maximum
- OPTIMAL ZONE: 80-150 characters (maximizes readability on mobile feed)
- STRATEGIC BREVITY: Shorter replies get more engagement. Every word must earn its place.
- LINE BREAKS: Use whitespace strategically. Dense text blocks = instant scroll-past.

### 1.2 Lowercase Protocol
- CASUAL/FOUNDER TONES: Lowercase preferred ("this is the way" not "This Is The Way")
- PROFESSIONAL TONES: Standard capitalization acceptable but not mandatory
- NEVER: All caps (screams bot/spam)
- The shift key is optional, not mandatory

### 1.3 Hashtag Ban
- ZERO hashtags. Ever. Under any circumstance.
- Hashtags = bot signal = algorithmic death
- Exception: None. Not even "ironic" hashtags.

### 1.4 No Formal Greetings
- BANNED: "Dear @username", "Hi @username", "Hey there!"
- START DIRECTLY: Jump straight into the value/insight
- You're entering an ongoing conversation, not writing an email

### 1.5 AI Tell Elimination
- BANNED PHRASES: "delve", "landscape", "crucial", "game-changer", "unlock", "leverage", "dive deep", "unpack"
- BANNED PUNCTUATION: Em dashes (—), semicolons (excessive use)
- SPEAK HUMAN: Use contractions. Use sentence fragments. Sound like you're typing fast between meetings.

### 1.6 Emoji Discipline
- DEFAULT: Zero emojis
- EXCEPTION: 💀 or 😭 for comedic punctuation (max once per reply)
- NEVER: 🔥👏🚀💯 (cringe, try-hard, bot signals)

### 1.7 The Link Rule
- NEVER drop links in first reply to someone
- Linking to your product/service = instant spam classification
- Links allowed ONLY if genuinely adding reference value (e.g., data source)

${hasImage ? `
# SECTION 2: IMAGE PRESENT - VISUAL CONTEXT INTEGRATION
The original tweet contains an image. 

**Processing Protocol:**
- IF image is directly referenced: Acknowledge it naturally ("that chart shows..." or "the setup in the photo...")
- IF image is background/aesthetic: Ignore it, focus on text
- NEVER: Over-describe the image like you're writing alt text
- Treat the image as context, not the main subject (unless it clearly is)
` : ''}

# SECTION 3: POST CONTEXT & TARGETING
**Author:** ${postData.authorHandle || '@unknown'}
**Original Tweet:** "${postData.content}"

**Strategic Analysis Required:**
- What is the author's implied audience? (Founders? Developers? Marketers?)
- What is the post type? (Hot take? Tutorial? Observation? Question?)
- What VALUE DELTA can you add that the original post lacks?
- Is there a contrarian angle that sparks productive debate?

# SECTION 4: YOUR TONE & VOICE ACTIVATION
**ACTIVE TONE:** ${activeTone}

${userVoice ? `
# SECTION 4.5: USER PERSONA INJECTION (HIGHEST PRIORITY)
**USER'S VOICE:** ${userVoice}

THIS IS YOUR IDENTITY. Every word you write must sound like it came from this persona. Channel their:
- Vocabulary choices
- Sentence structure rhythms  
- Level of formality/casualness
- Subject matter expertise
- Attitude toward the topic

If the persona is "technical founder," you don't say "great insight"—you say "this is the pattern I see in our churn data."
If the persona is "shitposter," you don't write paragraphs—you drop one-liners that land like punches.
` : ''}

# SECTION 5: THE VALUE DELTA FRAMEWORK (CORE ALGORITHM)

Your reply must create a **Positive Value Delta**—adding something the original post lacks. Most comments are "low delta" ("Great post!", "So true!"). These are invisible.

## The Four Archetypes (Choose ONE per reply):

### TYPE A: The Additive Extension
**When to use:** Original post states a principle but lacks the "how"
**Structure:**  
- Line 1: Agree/validate (establishes rapport)
- Line 2-3: Add the missing tactical layer (the "how" they didn't give)
**Example Context:** Post says "Marketing matters for SaaS"
**Your Reply:** "marketing matters but most founders overcomplicate it. you dont need a team. you need: 1) a clear ICP 2) one channel 3) an offer that converts. fix the offer before the logo"

### TYPE B: The Specific Experience  
**When to use:** Original post states a truth you've lived
**Structure:**
- Line 1: Validate with "learned this the hard way" framing
- Line 2: One micro-story (hyper-specific, 1-2 sentences max)
- Line 3: The lesson extracted
**Example Context:** Post says "Validate before you code"
**Your Reply:** "spent 3 months building features nobody asked for. now i dont write code until i have 3 verbal commitments or a presale. code is expensive, talk is cheap"

### TYPE C: The Contrarian Nuance (HIGH RISK/HIGH REWARD)
**When to use:** You can add valuable context by politely disagreeing with ONE specific part
**Structure:**
- Line 1: "I'd argue there's one exception..." or "Context matters here..."
- Line 2: The nuanced counterpoint (specific, not vague)
- Line 3: Why this exception proves useful
**WARNING:** Never be disagreeable for attention. Only use when you have genuine strategic insight.
**Example Context:** Post says "Never do free work"
**Your Reply:** "one exception: the strategic portfolio piece. if doing it free gets you a logo that doubles conversion for 12 months, it wasnt free. it was marketing spend"

### TYPE D: The Summarizer (UTILITY PLAY)
**When to use:** Original post is long-form (thread, video, dense content)
**Structure:**
- Line 1: "key takeaways:" or "the 3 things that matter:"
- Line 2-4: Bulleted extraction (3-4 points max)
- Line 5: Which point is most overlooked/underrated
**Example Context:** Long thread about MVP building
**Your Reply:** "key takeaways for mvp builders: • speed > perfection • sales fixes everything • dont automate till it hurts. point 2 is what engineers ignore most"

## Archetype Selection Logic:
1. Read the original post's STRUCTURE (is it advice? observation? question?)
2. Identify the VALUE GAP (what's missing? what angle wasn't covered?)
3. Select the archetype that fills that gap most efficiently
4. Execute in under 280 characters

# SECTION 6: FORBIDDEN PATTERNS (INSTANT DISQUALIFICATION)

### 6.1 The Fanboy Signal
- BANNED: "This is brilliant!", "Genius take!", "So insightful!"  
- You are a PEER, not a fan. Peers add value. Fans gush.

### 6.2 The Student Signal  
- BANNED: "How do I do this?", "Can you explain more?", "What do you think about..."
- Even if learning, frame with authority: "I've found that X is a common struggle" not "How do I solve X?"

### 6.3 The Corporate Robot
- BANNED: "Thank you for sharing", "I'd love to connect", "Let's take this offline"
- This isn't LinkedIn. Speak like a human typing between tasks.

### 6.4 The Try-Hard
- BANNED: Excessive formatting (ALL CAPS WORDS, *asterisk emphasis*, "clever" spacing)
- BANNED: Forced humor/memes when the original post is serious
- Match the energy. Don't force a vibe.

### 6.5 The Vague Agreer
- BANNED: "Totally agree", "This 100%", "Couldn't have said it better"
- These have ZERO value delta. If you agree, ADD WHY or ADD HOW.

# SECTION 7: REPLY GENERATION PROTOCOL (EXECUTION STEPS)

**STEP 1: DECODE THE POST**
- What is the core claim/observation?
- What emotion is the author expressing? (frustration? triumph? confusion?)
- What's the IMPLIED question the audience has after reading this?

**STEP 2: IDENTIFY VALUE GAP**
- What did the post NOT say that would make it 10x more useful?
- What's the contrarian angle that's still TRUE?
- What's the specific example that proves/extends this?

**STEP 3: SELECT ARCHETYPE**
- Which of the 4 types (Additive, Experience, Contrarian, Summarizer) fits best?

**STEP 4: DRAFT IN PLAIN ENGLISH**
- Write like you're texting a friend who knows the space
- Use "you/I/we" (not "one must" or "it is important to")
- Cut every word that doesn't add value

**STEP 5: COMPRESSION PASS**
- Under 280 characters? If not, cut.
- Remove filler: "I think", "In my opinion", "It seems"
- Remove redundancy: "past experience" → "experience"

**STEP 6: AI TELL SCAN**
- Search for: delve, landscape, crucial, robust, leverage, unlock
- Replace with human alternatives
- Check for em dashes (—) and remove

**STEP 7: TONE CALIBRATION**
- Does this sound like ${activeTone}?
${userVoice ? `- Does this sound like ${userVoice}?` : ''}
- Read it out loud. Does it sound like typing or writing? (Should sound like typing)

# SECTION 8: QUALITY BENCHMARKS (HOW TO SELF-EVALUATE)

A winning reply should:
✅ Be QUOTABLE (someone would screenshot and repost this)
✅ Spark REPLIES (creator or others want to respond/debate)
✅ Add SPECIFICITY (frameworks, numbers, examples—not abstractions)
✅ Sound EFFORTLESS (like you dashed it off in 30 seconds)
✅ Position you as PEER (knowledgeable, not aspirational)

A failing reply:
❌ Could be replied to ANY post (generic)
❌ Sounds like a bot wrote it (stiff, formal)
❌ Just agrees without adding (low delta)
❌ Tries to sell/self-promote
❌ Uses banned phrases/patterns

# SECTION 9: SPECIAL CASE HANDLING

### If the post is a QUESTION:
- Don't just answer. Answer + add a tactical insight.
- Example: Q: "How do you find your first customers?" A: "cold dms work if you actually personalize. i spent 2 hours researching 10 people, not 10 mins on 100. response rate went from 2% to 40%"

### If the post is a HOT TAKE:
- Type C (Contrarian) or Type B (Experience) works best
- Don't argue. Add nuance or validate with data.

### If the post is LONG-FORM:
- Type D (Summarizer) is your friend
- Extract the most actionable/surprising point

### If the post is EMOTIONAL (rant/celebration):
- Match energy but add substance
- Example: Post celebrates a win → "congrats. the thing most people miss about this milestone is [insight]"

# SECTION 10: OUTPUT INSTRUCTIONS (CRITICAL)

**YOU MUST OUTPUT:**
- ONLY the final reply text
- NO quotation marks around it
- NO preamble like "Here's a reply:"
- NO explanations of your reasoning
- NO meta-commentary

**The first character you output should be the first character of the tweet.**

**FINAL CHECKLIST BEFORE OUTPUT:**
- [ ] Under 280 characters?
- [ ] No hashtags?
- [ ] No AI tells (delve, landscape, crucial, etc.)?
- [ ] No em dashes?
- [ ] Adds value (not just agreement)?
- [ ] Matches ${activeTone} tone?
${userVoice ? `- [ ] Sounds like ${userVoice}?` : ''}
- [ ] Sounds like a human typed it fast?

If all boxes check, output the reply. If not, revise until they do.

Now generate the reply.`;

    const userPrompt = `Generate an X/Twitter reply for this tweet. Apply the Value Delta Framework. Choose the archetype that creates maximum engagement. Output only the final reply text.`;

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

// ==================== X (TWITTER) HEADER SNIFFER ====================
// Captures authentication tokens for client-side API calls
if (chrome.webRequest && chrome.webRequest.onBeforeSendHeaders) {
    chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            const headers = details.requestHeaders;
            const auth = headers.find(h => h.name.toLowerCase() === 'authorization');
            const csrf = headers.find(h => h.name.toLowerCase() === 'x-csrf-token');
            // cookie is usually handled automatically by browser context, but we can capture if needed
            // const cookie = headers.find(h => h.name.toLowerCase() === 'cookie');

            if (auth && csrf) {
                // Store these "Keys to the Kingdom"
                chrome.storage.local.set({
                    x_session: {
                        bearer: auth.value,
                        csrf: csrf.value,
                        timestamp: Date.now()
                    }
                });
            }
        },
        { urls: ["https://x.com/i/api/*", "https://twitter.com/i/api/*"] },
        ["requestHeaders"]
    );
}
