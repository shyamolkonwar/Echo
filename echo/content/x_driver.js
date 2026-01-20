// Echo Chrome Extension - X (Twitter) Driver
// Handles manual comment generation for X/Twitter

(function () {
    'use strict';

    // Only run on X/Twitter
    if (window.ECHO_PLATFORM !== 'x') return;

    console.log('[Echo X Driver] Loading...');

    // State
    let isActive = false;

    const STORAGE_KEY = 'x_replied_tweets';

    // ==================== INITIALIZATION ====================

    async function init() {
        console.log('[Echo X Driver] Initializing...');

        await refreshStateFromStorage();

        // Start manual button observer
        startManualButtonObserver();

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(handleMessage);

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.isActive !== undefined) {
                isActive = changes.isActive.newValue;
            }
        });
    }

    async function refreshStateFromStorage() {
        try {
            const settings = await chrome.storage.local.get(['isActive', 'platforms']);
            isActive = settings.isActive || false;
            return { isActive };
        } catch (error) {
            console.error('[Echo X Driver] Error reading storage:', error);
            return { isActive: false };
        }
    }

    function handleMessage(message, sender, sendResponse) {
        console.log('[Echo X Driver] Received message:', message.type);
        if (message.type === 'TOGGLE_ACTIVE') {
            isActive = message.isActive;
        }
    }

    // ==================== MANUAL GENERATE BUTTON ====================

    function startManualButtonObserver() {
        console.log('[Echo X Driver] Starting manual button observer...');

        // Inject styles for conditional display
        if (!document.querySelector('#echo-x-style')) {
            const style = document.createElement('style');
            style.id = 'echo-x-style';
            style.textContent = `
                /* Hide tone selector by default (Feed view) */
                .echo-x-tone-select {
                    display: none !important;
                }
                
                /* Show tone selector in Detail view */
                body.echo-x-detail-view .echo-x-tone-select {
                    display: block !important;
                }
            `;
            document.head.appendChild(style);
        }

        const checkAndInjectButtons = () => {
            // Update view state based on URL
            if (window.location.pathname.includes('/status/')) {
                document.body.classList.add('echo-x-detail-view');
            } else {
                document.body.classList.remove('echo-x-detail-view');
            }

            // Find all tweets on the page
            const tweets = document.querySelectorAll(window.X_SELECTORS?.tweet || 'article[data-testid="tweet"]');

            tweets.forEach(tweet => {
                // Skip if button already exists
                if (tweet.querySelector('.echo-x-generate-btn')) return;

                // Skip ads
                if (window.isXAd?.(tweet)) {
                    console.log('[Echo X Driver] Skipping ad tweet');
                    return;
                }

                injectManualGenerateButton(tweet);
            });
        };

        // Check immediately
        setTimeout(checkAndInjectButtons, 2000);

        // Observe for new tweets
        const observer = new MutationObserver(() => {
            checkAndInjectButtons();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also check periodically (X loads content dynamically)
        setInterval(checkAndInjectButtons, 3000);
    }

    function injectManualGenerateButton(tweet) {
        if (tweet.querySelector('.echo-x-generate-btn')) return;

        // Create container for tone selector and button
        const container = document.createElement('div');
        container.className = 'echo-x-controls';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto; /* Push to right */
        `;

        // Create tone selector dropdown
        const toneSelect = document.createElement('select');
        toneSelect.className = 'echo-x-tone-select';
        toneSelect.style.cssText = `
            padding: 4px 8px;
            background: transparent;
            color: #71767b;
            border: 1px solid transparent;
            border-radius: 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            appearance: none;
            transition: all 0.2s;
        `;
        toneSelect.innerHTML = `
            <option value="shitposter">🤪 Shitposter</option>
            <option value="contrarian">🤔 Contrarian</option>
            <option value="builder">🛠️ Builder</option>
        `;

        // Hover effect for tone selector
        toneSelect.addEventListener('mouseenter', () => {
            toneSelect.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
            toneSelect.style.color = '#1d9bf0';
        });
        toneSelect.addEventListener('mouseleave', () => {
            toneSelect.style.backgroundColor = 'transparent';
            toneSelect.style.color = '#71767b';
        });

        // Load saved tone
        chrome.storage.local.get('xQuickTone').then(data => {
            toneSelect.value = data.xQuickTone || 'shitposter';
        });

        // Save tone on change
        toneSelect.addEventListener('change', async () => {
            const tone = toneSelect.value;
            await chrome.storage.local.set({ xQuickTone: tone });

            const { platforms } = await chrome.storage.local.get('platforms');
            if (platforms && platforms.x) {
                platforms.x.quickTone = tone;
                await chrome.storage.local.set({ platforms });
            }
        });

        // Create generate button
        const button = document.createElement('button');
        button.className = 'echo-x-generate-btn';
        // Icon only for compactness in feed? Or keep text? User liked the button.
        // Let's keep it but make it blend better with actions bar or stand out as "the AI action"
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
        `;
        button.title = 'Generate AI reply';
        button.type = 'button';
        button.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            background: transparent;
            color: #71767b;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
            button.style.color = '#1d9bf0';
        });

        button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = 'transparent';
            button.style.color = '#71767b';
        });

        button.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent tweet click
            await handleManualGenerate(button, tweet, toneSelect.value);
        });

        container.appendChild(toneSelect);
        container.appendChild(button);

        // Find a good place to insert - INTO the actions bar
        const actionsBar = tweet.querySelector('[role="group"]');
        if (actionsBar) {
            // Check if we can append directly
            actionsBar.appendChild(container);
        } else {
            // Fallback: append to tweet
            tweet.appendChild(container);
        }

        console.log('[Echo X Driver] Generate button injected');
    }

    async function handleManualGenerate(button, tweet, tone) {
        if (button.disabled) return;

        try {
            button.disabled = true;
            button.style.opacity = '0.7';
            button.style.cursor = 'wait';
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                </svg>
            `;

            // Inject spin animation if needed
            if (!document.querySelector('#echo-spin-style')) {
                const style = document.createElement('style');
                style.id = 'echo-spin-style';
                style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            // Extract tweet data
            const tweetData = window.extractXTweetData?.(tweet);
            if (!tweetData || !tweetData.content || tweetData.content.length < 5) {
                throw new Error('Could not extract tweet content');
            }

            console.log('[Echo X Driver] Manual generate for tweet:', tweetData.postId, 'with tone:', tone);

            // Request AI comment generation
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: tweetData,
                platform: 'x',
                quickTone: tone || 'shitposter'
            });

            if (response.error) throw new Error(response.error);
            if (!response.comment) throw new Error('No reply generated');

            console.log('[Echo X Driver] Generated reply:', response.comment.substring(0, 50) + '...');

            // Click the reply button to open reply modal
            const replyButton = tweet.querySelector('div[data-testid="reply"]');
            if (replyButton) {
                replyButton.click();
                await sleep(1000);
            }

            // Find the reply textarea and insert text
            await insertReplyText(response.comment);

            showNotification('✨ Reply generated! Review and post when ready.');
            button.innerHTML = originalHTML;

        } catch (error) {
            console.error('[Echo X Driver] Manual generation error:', error);
            showNotification(`Error: ${error.message}`, 'error');
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Generate Reply</span>
            `;
        } finally {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    async function insertReplyText(text) {
        // Wait for the reply textarea to appear
        let textarea = null;
        for (let i = 0; i < 30; i++) {
            textarea = document.querySelector('div[data-testid="tweetTextarea_0"]');
            if (textarea) break;
            await sleep(100);
        }

        if (!textarea) {
            throw new Error('Could not find reply textarea');
        }

        // Focus the textarea
        textarea.click();
        await sleep(200);
        textarea.focus();
        await sleep(200);

        // Use clipboard paste method (same as Reddit - works for Draft.js editors)
        try {
            await navigator.clipboard.writeText(text);

            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData.setData('text/plain', text);
            textarea.dispatchEvent(pasteEvent);

            await sleep(100);

            // Check if it worked
            if (textarea.textContent.includes(text.substring(0, 20))) {
                console.log('[Echo X Driver] Clipboard paste succeeded');
                return;
            }
        } catch (e) {
            console.log('[Echo X Driver] Clipboard API failed, trying fallback');
        }

        // Fallback: execCommand
        textarea.focus();
        const success = document.execCommand('insertText', false, text);
        if (success) {
            console.log('[Echo X Driver] execCommand succeeded');
            return;
        }

        // Last resort: Direct DOM
        console.log('[Echo X Driver] Using direct DOM manipulation');
        const editable = textarea.querySelector('[contenteditable="true"]') || textarea;
        editable.innerHTML = '';
        const p = document.createElement('span');
        p.textContent = text;
        editable.appendChild(p);

        editable.dispatchEvent(new InputEvent('input', {
            inputType: 'insertText',
            data: text,
            bubbles: true
        }));
    }

    // ==================== HELPERS ====================

    function showNotification(message, type = 'success') {
        const existing = document.querySelector('.echo-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'echo-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#f4212e' : '#1d9bf0'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== ENTRY POINT ====================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.xDriver = { init };
    console.log('[Echo X Driver] Module loaded');

})();
