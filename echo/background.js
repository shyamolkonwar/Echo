// Echo - Background Service Worker
// One request per generated comment.

import { generateComment } from './lib/comment_generation.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GENERATE_COMMENT') {
        handleGenerateComment(message, sendResponse);
        return true;
    }

    if (message.type === 'ACTIVITY_UPDATE') {
        chrome.runtime.sendMessage(message).catch(() => {
        });
    }

    return false;
});

async function handleGenerateComment(message, sendResponse) {
    try {
        const { postData, platform } = message;

        const settings = await chrome.storage.local.get([
            'apiKey',
            'apiFormat',
            'apiEndpoint',
            'apiModel',
            'userProfile',
            'responseLength',
            'platforms'
        ]);

        const apiKey = settings.apiKey?.trim();
        if (!apiKey) {
            sendResponse({ error: 'No API key configured. Open settings and add your key.' });
            return;
        }

        if (!settings.apiEndpoint?.trim()) {
            sendResponse({ error: 'No endpoint configured. Open settings and add the complete API endpoint URL.' });
            return;
        }

        const activePlatform = platform || 'linkedin';
        const responseLength = settings.platforms?.[activePlatform]?.responseLength
            || settings.responseLength
            || 2;

        const comment = await generateComment({
            apiKey,
            apiType: settings.apiFormat || 'openai-compatible',
            endpointUrl: settings.apiEndpoint,
            model: settings.apiModel || '',
            postData,
            userProfile: settings.userProfile || {},
            responseLength,
            platform: activePlatform
        });

        sendResponse({ comment });
    } catch (error) {
        console.error('[Echo Background] Error:', error);
        sendResponse({ error: error.message || 'Failed to generate comment' });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({
            isActive: false,
            isAutoPilot: false,
            responseLength: 2,
            delayTimer: 2,
            activityLog: [],
            watchedCreators: [],
            apiFormat: 'openai-compatible',
            apiEndpoint: '',
            apiModel: ''
        });
    }

    if (chrome.alarms) {
        chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
    }
});

if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'keepAlive') {
        }
    });
}

// X header sniffer (kept for existing X flows)
if (chrome.webRequest && chrome.webRequest.onBeforeSendHeaders) {
    chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            const headers = details.requestHeaders;
            const auth = headers.find(h => h.name.toLowerCase() === 'authorization');
            const csrf = headers.find(h => h.name.toLowerCase() === 'x-csrf-token');

            if (auth && csrf) {
                chrome.storage.local.set({
                    x_session: {
                        bearer: auth.value,
                        csrf: csrf.value,
                        timestamp: Date.now()
                    }
                });
            }
        },
        { urls: ['https://x.com/i/api/*', 'https://twitter.com/i/api/*'] },
        ['requestHeaders']
    );
}
