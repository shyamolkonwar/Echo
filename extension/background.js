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

// Build the prompt for comment generation
function buildPrompt(postData, quickTone, settings) {
    const toneDescription = TONE_PRESETS[quickTone] || TONE_PRESETS.professional;
    const voiceDna = settings.voiceDna || '';

    // Response length guidance
    const lengthGuidance = {
        1: 'Keep your response very short, around 10-15 words.',
        2: 'Keep your response concise, around 15-25 words.',
        3: 'You can write a slightly longer response, around 25-40 words.'
    };
    const length = lengthGuidance[settings.responseLength] || lengthGuidance[2];

    const systemPrompt = `You are a LinkedIn networking expert who writes authentic, engaging comments.

${toneDescription}

${voiceDna ? `Additional voice characteristics from the user: ${voiceDna}` : ''}

STRICT RULES:
- ${length}
- Do NOT use hashtags
- Do NOT start with "Great post" or "Love this" or similar generic openers
- Do NOT sound robotic or formulaic
- DO add genuine value or perspective
- DO be conversational and natural
- DO reference something specific from the post to show you actually read it`;

    const userPrompt = `Here is a LinkedIn post by ${postData.authorName}:

"${postData.content}"

Write a thoughtful, engaging comment on this post following all the rules above.`;

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
            watchedCreators: []
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
