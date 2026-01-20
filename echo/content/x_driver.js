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
            if (settings.platforms?.x?.quickTone) {
                // Initialize tone if needed?
            }
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
                
                /* Show tone selector in Detail view OR inside Modal */
                body.echo-x-detail-view .echo-x-tone-select,
                .echo-x-controls-modal .echo-x-tone-select {
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

            // 1. Find all tweets (Feed and Detail)
            const tweets = document.querySelectorAll(window.X_SELECTORS?.tweet || 'article[data-testid="tweet"]');
            tweets.forEach(tweet => {
                if (tweet.querySelector('.echo-x-generate-btn')) return;
                if (window.isXAd?.(tweet)) {
                    // console.log('[Echo X Driver] Skipping ad tweet'); // Reduced log noise
                    return;
                }
                injectManualGenerateButton(tweet);
            });

            // 2. Find Reply Modal Toolbars
            const toolbars = document.querySelectorAll('[data-testid="toolBar"]');
            toolbars.forEach(toolbar => {
                if (toolbar.querySelector('.echo-x-controls')) return;
                injectToolbarControls(toolbar);
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

    // New: Inject controls into the Modal Toolbar
    function injectToolbarControls(toolbar) {
        const container = document.createElement('div');
        container.className = 'echo-x-controls echo-x-controls-modal'; // Special class for modal CSS
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 8px;
        `;

        const { toneSelect, button } = createControls();

        container.appendChild(toneSelect);
        container.appendChild(button);

        toolbar.appendChild(container);

        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            // Find modal context
            const modal = toolbar.closest('[role="dialog"]') || toolbar.parentElement;
            await handleManualGenerate(button, modal, toneSelect.value, true);
        });

        // logger
        // console.log('[Echo X Driver] Injected into Toolbar');
    }

    function injectManualGenerateButton(tweet) {
        if (tweet.querySelector('.echo-x-generate-btn')) return;

        const container = document.createElement('div');
        container.className = 'echo-x-controls';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto; /* Push to right */
        `;

        const { toneSelect, button } = createControls();

        // Button Logic for Feed Tweet (modal NOT open)
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            await handleManualGenerate(button, tweet, toneSelect.value, false);
        });

        container.appendChild(toneSelect);
        container.appendChild(button);

        const actionsBar = tweet.querySelector('[role="group"]');
        if (actionsBar) {
            actionsBar.appendChild(container);
        } else {
            tweet.appendChild(container);
        }
    }

    function createControls() {
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
            /* Display handled by CSS classes */
        `;
        toneSelect.innerHTML = `
            <option value="shitposter">🤪 Shitposter</option>
            <option value="contrarian">🤔 Contrarian</option>
            <option value="builder">🛠️ Builder</option>
        `;

        toneSelect.addEventListener('mouseenter', () => {
            toneSelect.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
            toneSelect.style.color = '#1d9bf0';
        });
        toneSelect.addEventListener('mouseleave', () => {
            toneSelect.style.backgroundColor = 'transparent';
            toneSelect.style.color = '#71767b';
        });

        chrome.storage.local.get('xQuickTone').then(data => {
            toneSelect.value = data.xQuickTone || 'shitposter';
        });

        toneSelect.addEventListener('change', async () => {
            const tone = toneSelect.value;
            await chrome.storage.local.set({ xQuickTone: tone });
            // Also update platform settings
            const { platforms } = await chrome.storage.local.get('platforms');
            if (platforms && platforms.x) {
                platforms.x.quickTone = tone;
                await chrome.storage.local.set({ platforms });
            }
        });

        const button = document.createElement('button');
        button.className = 'echo-x-generate-btn';
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

        return { toneSelect, button };
    }

    async function handleManualGenerate(button, contextElement, tone, isInsideModal = false) {
        if (button.disabled) return;

        try {
            button.disabled = true;
            button.style.cursor = 'wait';
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                </svg>
            `;

            if (!document.querySelector('#echo-spin-style')) {
                const style = document.createElement('style');
                style.id = 'echo-spin-style';
                style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            let tweetData = null;

            if (!isInsideModal) {
                // CASE 1: Feed Tweet Click
                // Extract data BEFORE clicking reply, because clicking reply might shift DOM or focus
                tweetData = window.extractXTweetData?.(contextElement);

                // Click Native Reply to Open Modal
                const replyButton = contextElement.querySelector('div[data-testid="reply"]');
                if (replyButton) {
                    replyButton.click();
                    // Wait for modal to appear and settle
                    await sleep(1000);
                } else {
                    console.warn('[Echo X Driver] Could not find reply button, proceeding anyway');
                }
            } else {
                // CASE 2: Inside Modal Click
                // Try to find the tweet being replied to (usually visible in modal)
                const modal = contextElement.closest('[role="dialog"]');
                const tweetArticle = modal?.querySelector('article[data-testid="tweet"]');
                if (tweetArticle) {
                    tweetData = window.extractXTweetData?.(tweetArticle);
                }
            }

            // Fallback Extraction
            if (!tweetData || !tweetData.content || tweetData.content.length < 5) {
                // If we are in modal, maybe the background page has the tweet?
                // Or try to find any visible article
                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                // The 'main' one usually has larger font or specific location
                if (articles.length > 0) {
                    // Heuristic: use the first visible one
                    tweetData = window.extractXTweetData?.(articles[0]);
                }
            }

            if (!tweetData) throw new Error('Could not extract tweet content');

            console.log('[Echo X Driver] Generating for:', tweetData.postId, 'Tone:', tone);

            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: tweetData,
                platform: 'x',
                quickTone: tone || 'shitposter'
            });

            if (response.error) throw new Error(response.error);
            if (!response.comment) throw new Error('No reply generated');

            // Find the reply textarea (should be visible in modal now)
            await insertReplyText(response.comment);

            showNotification('✨ Reply generated!');
            button.innerHTML = originalHTML;

        } catch (error) {
            console.error('[Echo X Driver] Error:', error);
            showNotification(`Error: ${error.message}`, 'error');
            button.innerHTML = originalHTML;
        } finally {
            button.disabled = false;
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

        // Use clipboard paste method
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
