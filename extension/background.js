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

// ==================== MASTER PROMPT TEMPLATE ====================
const MASTER_PROMPT_TEMPLATE = {
    role: `You are a highly intelligent, top-tier LinkedIn networker. Your goal is to write comments that spark conversation, add value, or offer a unique perspective.`,

    constraints: [
        'NEVER start with "Great post", "Thanks for sharing", or "Insightful"',
        'NO hashtags',
        'Keep it under 25 words unless the topic requires deep nuance',
        'Do not summarize the post - the author knows what they wrote',
        'Do not sound like a bot - be human, imperfect, and casual'
    ],

    visualContext: `The post includes an image. Your comment MUST reference a specific visual detail (e.g., a color, a number on a chart, a person's expression) to prove you actually saw it.`,

    personaInjection: (userTone) => `The user describes their voice as: "${userTone}". ADAPT your writing style to match this persona, but do not override the hard constraints above.`
};

// Build the prompt for comment generation
function buildPrompt(postData, quickTone, settings) {
    const toneDescription = TONE_PRESETS[quickTone] || TONE_PRESETS.professional;
    const userTone = settings.userTone || settings.voiceDna || 'professional and thoughtful';
    const hasImage = postData.hasImage === true;

    // Response length guidance
    const lengthGuidance = {
        1: 'Keep your response very short, around 10-15 words.',
        2: 'Keep your response concise, around 15-25 words.',
        3: 'You can write a slightly longer response, around 25-40 words.'
    };
    const length = lengthGuidance[settings.responseLength] || lengthGuidance[2];

    // Build system prompt with master template
    let systemPrompt = MASTER_PROMPT_TEMPLATE.role + '\n\n';
    systemPrompt += 'HARD CONSTRAINTS (NEVER VIOLATE):\n';
    systemPrompt += MASTER_PROMPT_TEMPLATE.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n');
    systemPrompt += '\n\n';

    // Add vision context if image present
    if (hasImage) {
        systemPrompt += 'VISUAL CONTEXT:\n';
        systemPrompt += MASTER_PROMPT_TEMPLATE.visualContext + '\n\n';
    }

    // Inject user persona
    systemPrompt += 'USER PERSONA:\n';
    systemPrompt += MASTER_PROMPT_TEMPLATE.personaInjection(userTone) + '\n\n';

    // Add tone and length
    systemPrompt += `TONE: ${toneDescription}\n`;
    systemPrompt += `LENGTH: ${length}`;

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
