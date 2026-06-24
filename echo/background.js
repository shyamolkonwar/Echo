// Rivtor Founder OS - Background Service Worker
// Azure AI founder comment agent

import {
    COMMENT_AGENT_DEFAULTS,
    generateFounderComment,
    getInstallStorageDefaults,
    recordCommentFeedback
} from './lib/comment_agent.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GENERATE_COMMENT') {
        handleGenerateComment(message, sendResponse);
        return true;
    }

    if (message.type === 'COMMENT_FEEDBACK') {
        handleCommentFeedback(message, sendResponse);
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
        const { postData, quickTone, platform } = message;

        const settings = await chrome.storage.local.get([
            'apiKey',
            'apiProvider',
            'responseLength',
            'platforms',
            'azureBaseUrl',
            'azureModel',
            'selectedSkill'
        ]);

        const apiKey = settings.apiKey?.trim();
        if (!apiKey) {
            sendResponse({ error: 'No Azure API key configured. Open settings and add your Azure key.' });
            return;
        }

        const result = await generateFounderComment({
            apiKey,
            postData,
            quickTone,
            settings,
            platform: platform || 'linkedin'
        });

        sendResponse(result);
    } catch (error) {
        console.error('[Rivtor Background] Error:', error);
        sendResponse({ error: error.message || 'Failed to generate founder comment' });
    }
}

async function handleCommentFeedback(message, sendResponse) {
    try {
        await recordCommentFeedback(message);
        sendResponse({ ok: true });
    } catch (error) {
        console.error('[Rivtor Background] Feedback error:', error);
        sendResponse({ error: error.message || 'Failed to save comment feedback' });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.storage.local.set({
            isActive: false,
            isAutoPilot: false,
            quickTone: 'human-connection',
            responseLength: 2,
            delayTimer: 2,
            activityLog: [],
            watchedCreators: [],
            userTone: '',
            voiceDna: '',
            ...getInstallStorageDefaults(),
            azureBaseUrl: COMMENT_AGENT_DEFAULTS.baseUrl,
            azureModel: COMMENT_AGENT_DEFAULTS.model
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
