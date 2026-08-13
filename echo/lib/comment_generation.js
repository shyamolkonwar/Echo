const API_TYPES = new Set(['openai-compatible', 'azure-openai', 'gemini']);

export function buildCommentPrompt({ postData, userProfile = {}, platform = 'linkedin', responseLength = 2 }) {
    const post = normalizePost(postData);
    const constraints = getPlatformConstraints(platform, responseLength);
    const profile = normalizeUserProfile(userProfile);

    const systemPrompt = [
        'You write one world-class social comment in the voice of the account owner.',
        'The account may be personal or company. Follow the supplied profile exactly instead of using a canned founder, builder, or brand narrative.',
        'Sound like a real human with judgment. The comment should feel typed by someone who knows what they are talking about, not assembled by AI.',
        'Add something the post did not already say. Choose one strong move: a practical next step, a sharper framing, a missing tradeoff, a concrete tactic, a grounded challenge, or a useful question.',
        'Do not summarize the post. Do not restate the author’s point. Do not open with praise or agreement. Skip lines like great post, well said, love this, so true, important point, insightful, or thanks for sharing.',
        'Anti-slop rules: no hashtags, no emojis, no em dashes, no canned closers, no chatbot phrases, no fake profundity, no polished creator-speak, no motivational fluff, no rule-of-three rhythm by default, and no vocabulary such as delve, landscape, crucial, game-changer, unlock, leverage, pivotal, testament, robust, seamless, or thought leadership.',
        'Use plain words, natural sentence rhythm, specific detail, and clean punctuation. Keep the best comments direct, concrete, and slightly imperfect in a human way.',
        'If the profile says company, write like a real company operator or team voice. If the profile says personal, write like the actual person. Never drift into generic startup voice.',
        formatUserProfile(profile),
        constraints,
        'Return only the final comment. No quotation marks, no label, no explanation, and no alternatives.'
    ].join('\n');

    const userPrompt = [
        `Platform: ${platform}`,
        `Author: ${post.author}`,
        `Post: ${post.content}`,
        post.context ? `Context: ${post.context}` : '',
        'Write the comment now.'
    ].filter(Boolean).join('\n');

    return { systemPrompt, userPrompt };
}

export function buildApiRequest({
    apiType,
    endpointUrl,
    apiKey,
    model,
    prompt,
    imageData = null,
    responseLength = 2
}) {
    validateApiSettings({ apiType, endpointUrl, apiKey });

    const maxTokens = responseLength === 1 ? 80 : responseLength === 3 ? 180 : 120;
    const headers = { 'Content-Type': 'application/json' };
    let url = endpointUrl.trim();
    let body;

    if (apiType === 'gemini') {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.set('key', apiKey.trim());
        url = parsedUrl.toString();

        const parts = [{ text: `${prompt.systemPrompt}\n\n${prompt.userPrompt}` }];
        if (imageData) {
            parts.push({
                inline_data: {
                    mime_type: getImageMimeType(imageData),
                    data: stripDataUrl(imageData)
                }
            });
        }

        body = {
            contents: [{ parts }],
            generationConfig: {
                temperature: 0.65,
                maxOutputTokens: maxTokens
            }
        };
    } else {
        if (apiType === 'azure-openai') {
            headers['api-key'] = apiKey.trim();
        } else {
            headers.Authorization = `Bearer ${apiKey.trim()}`;
        }

        const userContent = imageData
            ? [
                { type: 'text', text: prompt.userPrompt },
                { type: 'image_url', image_url: { url: ensureDataUrl(imageData), detail: 'low' } }
            ]
            : prompt.userPrompt;

        body = {
            messages: [
                { role: 'system', content: prompt.systemPrompt },
                { role: 'user', content: userContent }
            ],
            max_tokens: maxTokens,
            temperature: 0.65
        };

        if (model?.trim()) {
            body.model = model.trim();
        }
    }

    return {
        url,
        init: {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        }
    };
}

export async function generateComment({
    apiType,
    endpointUrl,
    apiKey,
    model,
    postData,
    userProfile = {},
    platform = 'linkedin',
    responseLength = 2,
    fetchImpl = fetch
}) {
    const prompt = buildCommentPrompt({ postData, userProfile, platform, responseLength });
    const request = buildApiRequest({
        apiType,
        endpointUrl,
        apiKey,
        model,
        prompt,
        imageData: postData?.hasImage ? postData.imageData : null,
        responseLength
    });

    const response = await fetchImpl(request.url, request.init);
    const payload = await readResponsePayload(response);

    if (!response.ok) {
        throw new Error(extractErrorMessage(payload) || `API request failed with status ${response.status}`);
    }

    const comment = sanitizeComment(parseApiResponse(apiType, payload), platform);
    if (!comment) {
        throw new Error('The API returned an empty comment.');
    }

    return comment;
}

export function parseApiResponse(apiType, payload) {
    if (apiType === 'gemini') {
        return payload?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || '')
            .join('')
            .trim() || '';
    }

    return payload?.choices?.[0]?.message?.content?.trim()
        || payload?.choices?.[0]?.text?.trim()
        || '';
}

export function getPermissionPattern(endpointUrl) {
    const url = validateEndpoint(endpointUrl);
    return `${url.protocol}//${url.host}/*`;
}

function validateApiSettings({ apiType, endpointUrl, apiKey }) {
    if (!API_TYPES.has(apiType)) {
        throw new Error('Choose a supported API format.');
    }
    validateEndpoint(endpointUrl);
    if (!apiKey?.trim()) {
        throw new Error('Add an API key in extension settings.');
    }
}

function validateEndpoint(endpointUrl) {
    if (!endpointUrl?.trim()) {
        throw new Error('Add an endpoint URL in extension settings.');
    }

    let url;
    try {
        url = new URL(endpointUrl.trim());
    } catch {
        throw new Error('The endpoint URL is invalid.');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('The endpoint must use HTTP or HTTPS.');
    }

    return url;
}

function normalizePost(postData = {}) {
    const content = [postData.content, postData.title, postData.body]
        .filter(Boolean)
        .join('\n\n')
        .trim()
        .slice(0, 8000);

    if (!content) {
        throw new Error('No post content was found.');
    }

    const author = (postData.authorName || postData.authorHandle || postData.handle || 'Unknown account')
        .toString()
        .trim()
        .slice(0, 160);

    const context = [
        postData.subreddit ? `Subreddit: ${postData.subreddit}` : '',
        postData.flair ? `Flair: ${postData.flair}` : '',
        postData.hasImage ? 'The post includes an image. Refer to it only when a concrete visual detail is available.' : ''
    ].filter(Boolean).join(' | ');

    return { author, content, context };
}

function normalizeUserProfile(userProfile = {}) {
    return {
        accountType: userProfile.accountType === 'company' ? 'company' : 'personal',
        identity: normalizeProfileField(userProfile.identity),
        narrative: normalizeProfileField(userProfile.narrative),
        communicationStyle: normalizeProfileField(userProfile.communicationStyle),
        writingStyle: normalizeProfileField(userProfile.writingStyle),
        commentStrategy: normalizeProfileField(userProfile.commentStrategy),
        signaturePhrases: normalizeProfileField(userProfile.signaturePhrases),
        bannedPhrases: normalizeProfileField(userProfile.bannedPhrases),
        voiceExamples: normalizeProfileField(userProfile.voiceExamples, 1800)
    };
}

function normalizeProfileField(value, maxLength = 600) {
    return (value || '')
        .toString()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function formatUserProfile(profile) {
    const lines = [
        `Account type: ${profile.accountType}`,
        `Identity / context: ${profile.identity || 'Not provided.'}`,
        `Narrative: ${profile.narrative || 'Not provided.'}`,
        `Communication style: ${profile.communicationStyle || 'Not provided.'}`,
        `Writing style: ${profile.writingStyle || 'Not provided.'}`,
        `Comment strategy: ${profile.commentStrategy || 'Not provided.'}`,
        `Signature phrases: ${profile.signaturePhrases || 'None provided.'}`,
        `Never use: ${profile.bannedPhrases || 'None provided.'}`,
        `Voice examples: ${profile.voiceExamples || 'None provided.'}`
    ];

    return ['User profile to mirror exactly:', ...lines].join('\n');
}

function getPlatformConstraints(platform, responseLength) {
    if (platform === 'x') {
        return 'Keep the reply under 240 characters. One or two tight sentences only. Start with the useful point immediately.';
    }

    if (platform === 'reddit') {
        return responseLength === 1
            ? 'Keep it to 1 or 2 natural sentences.'
            : 'Keep it concise enough to read quickly. Use at most 3 natural sentences.';
    }

    const wordRange = responseLength === 1 ? '20 to 30' : responseLength === 3 ? '35 to 55' : '25 to 40';
    return `Write ${wordRange} words in 2 or 3 natural sentences.`;
}

function sanitizeComment(value, platform) {
    let text = (value || '')
        .replace(/^```(?:text)?\s*/i, '')
        .replace(/```$/i, '')
        .replace(/^(?:comment|reply|linkedin comment|x reply)\s*:\s*/i, '')
        .trim();

    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1).trim();
    }

    text = text
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '$1')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+([,.!?])/g, '$1')
        .trim();

    if (platform === 'x' && text.length > 280) {
        const clipped = text.slice(0, 280);
        const lastSpace = clipped.lastIndexOf(' ');
        text = (lastSpace > 200 ? clipped.slice(0, lastSpace) : clipped).trim();
    }

    return text;
}

function ensureDataUrl(imageData) {
    return imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
}

function stripDataUrl(imageData) {
    return imageData.includes(',') ? imageData.slice(imageData.indexOf(',') + 1) : imageData;
}

function getImageMimeType(imageData) {
    const match = imageData.match(/^data:([^;]+);base64,/i);
    return match?.[1] || 'image/jpeg';
}

async function readResponsePayload(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function extractErrorMessage(payload) {
    return payload?.error?.message
        || payload?.error?.details?.[0]?.message
        || payload?.message
        || '';
}
