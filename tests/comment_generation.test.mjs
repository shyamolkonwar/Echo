import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildApiRequest,
    buildCommentPrompt,
    generateComment,
    getPermissionPattern,
    parseApiResponse
} from '../echo/lib/comment_generation.js';

const postData = {
    authorName: 'A builder',
    content: 'We shipped our first prototype from a college hostel and found three early users this week.',
    hasImage: false
};

const userProfile = {
    accountType: 'company',
    identity: 'We are a B2B product team writing from the company account.',
    narrative: 'We care about practical execution, customer proof, and shipping lessons.',
    communicationStyle: 'Direct, calm, specific, and useful. No hype.',
    writingStyle: 'Short paragraphs. Natural sentence rhythm. No em dashes.',
    commentStrategy: 'Add one tactical layer the original post did not cover.',
    signaturePhrases: 'in practice; what we found',
    bannedPhrases: 'game-changer; delve; thought leadership',
    voiceExamples: 'What mattered for us was the feedback loop, not the launch post.'
};

test('prompt uses the supplied profile and hard anti-slop rules instead of a canned narrative', () => {
    const prompt = buildCommentPrompt({ postData, userProfile, platform: 'linkedin', responseLength: 2 });
    const combined = `${prompt.systemPrompt}\n${prompt.userPrompt}`;

    assert.match(combined, /account type: company/i);
    assert.match(combined, /practical execution, customer proof, and shipping lessons/i);
    assert.match(combined, /no em dashes/i);
    assert.match(combined, /delve/i);
    assert.match(combined, /add something the post did not already say/i);
    assert.match(combined, /do not open with praise or agreement/i);
    assert.match(combined, /what mattered for us was the feedback loop/i);
    assert.doesNotMatch(combined, /Hackyard|Shyamol|founder mode/i);
});

test('OpenAI-compatible request uses the user endpoint, model, and bearer auth', () => {
    const request = buildApiRequest({
        apiType: 'openai-compatible',
        endpointUrl: 'https://example.ai/v1/chat/completions',
        apiKey: 'secret',
        model: 'custom-model',
        prompt: buildCommentPrompt({ postData, userProfile, platform: 'linkedin', responseLength: 2 }),
        responseLength: 2
    });

    assert.equal(request.url, 'https://example.ai/v1/chat/completions');
    assert.equal(request.init.headers.Authorization, 'Bearer secret');
    assert.equal(JSON.parse(request.init.body).model, 'custom-model');
});

test('Azure-compatible request preserves API version and uses api-key auth', () => {
    const endpointUrl = 'https://builder-resource.services.ai.azure.com/models/chat/completions?api-version=2025-01-01-preview';
    const request = buildApiRequest({
        apiType: 'azure-openai',
        endpointUrl,
        apiKey: 'secret',
        model: 'builder-model',
        prompt: buildCommentPrompt({ postData, userProfile, platform: 'linkedin', responseLength: 2 }),
        responseLength: 2
    });

    assert.equal(request.url, endpointUrl);
    assert.equal(request.init.headers['api-key'], 'secret');
    assert.equal(request.init.headers.Authorization, undefined);
});

test('Gemini request uses a complete custom endpoint and adds the key once', () => {
    const request = buildApiRequest({
        apiType: 'gemini',
        endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/models/custom:generateContent?alt=json',
        apiKey: 'secret',
        model: '',
        prompt: buildCommentPrompt({ postData, userProfile, platform: 'x', responseLength: 1 }),
        responseLength: 1
    });

    const url = new URL(request.url);
    assert.equal(url.searchParams.get('key'), 'secret');
    assert.equal(url.searchParams.getAll('key').length, 1);
    assert.equal(url.searchParams.get('alt'), 'json');
    assert.ok(JSON.parse(request.init.body).contents);
});

test('one-shot generation makes exactly one request and returns cleaned text', async () => {
    let calls = 0;
    const fetchImpl = async (url, init) => {
        calls += 1;
        assert.equal(url, 'https://example.ai/v1/chat/completions');
        assert.equal(init.method, 'POST');
        return {
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '"The useful next step — show the failed version too. It gives other builders something concrete to learn from."' } }]
            })
        };
    };

    const comment = await generateComment({
        apiType: 'openai-compatible',
        endpointUrl: 'https://example.ai/v1/chat/completions',
        apiKey: 'secret',
        model: 'custom-model',
        postData,
        userProfile,
        platform: 'linkedin',
        responseLength: 2,
        fetchImpl
    });

    assert.equal(calls, 1);
    assert.equal(comment, 'The useful next step, show the failed version too. It gives other builders something concrete to learn from.');
});

test('response parsing supports both API families', () => {
    assert.equal(
        parseApiResponse('openai-compatible', { choices: [{ message: { content: 'Builder reply' } }] }),
        'Builder reply'
    );
    assert.equal(
        parseApiResponse('gemini', { candidates: [{ content: { parts: [{ text: 'Gemini reply' }] } }] }),
        'Gemini reply'
    );
});

test('permission pattern is scoped to the configured endpoint origin', () => {
    assert.equal(
        getPermissionPattern('https://api.example.ai:8443/v1/chat/completions'),
        'https://api.example.ai:8443/*'
    );
});
