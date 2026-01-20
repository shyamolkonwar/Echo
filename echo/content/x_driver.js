// Echo Chrome Extension - X (Twitter) Driver
// Handles manual comment generation for X/Twitter

(function () {
    'use strict';

    // Only run on X/Twitter
    if (window.ECHO_PLATFORM !== 'x') return;

    console.log('[Echo X Driver] Loading...');

    // State
    let isActive = false;

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

        // Inject styles
        if (!document.querySelector('#echo-x-style')) {
            const style = document.createElement('style');
            style.id = 'echo-x-style';
            // We only show controls in the toolbar now, so no need for complicated hide/show logic based on view
            // But we keep the style block for any future needs or specific toolbar tweaks
            style.textContent = `
                .echo-x-controls-modal .echo-x-tone-select {
                    display: block !important;
                }
            `;
            document.head.appendChild(style);
        }

        const checkAndInjectButtons = () => {
            // We NO LONGER inject into feed tweets.
            // We ONLY looking for Toolbars (Reply composition areas)

            // Find Reply Toolbars
            const toolbars = document.querySelectorAll('[data-testid="toolBar"]');
            toolbars.forEach(toolbar => {
                // Check if we already injected
                if (toolbar.querySelector('.echo-x-controls')) return;

                // Inject controls into toolbar, marked as modal controls
                injectToolbarControls(toolbar);
            });
        };

        // Check immediately
        setTimeout(checkAndInjectButtons, 2000);

        // Observe for new tweets and modals
        const observer = new MutationObserver(() => {
            checkAndInjectButtons();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also check periodically
        setInterval(checkAndInjectButtons, 3000);
    }

    function injectToolbarControls(toolbar) {
        // Find the scrollable list inside the toolbar
        const scrollList = toolbar.querySelector('[data-testid="ScrollSnap-List"]');
        if (!scrollList) {
            console.log('[Echo X Driver] ScrollSnap-List not found in toolbar');
            return;
        }

        // Find the GIF button's parent wrapper - OLD LOGIC REMOVED
        // We now append to the end of the list per user request

        // Ensure we haven't already injected into this specific list
        if (scrollList.querySelector('.echo-x-controls')) return;

        // Create container matching native toolbar item structure
        const container = document.createElement('div');
        container.setAttribute('role', 'presentation');
        container.className = 'css-175oi2r r-14tvyh0 r-cpa5s6 echo-x-controls echo-x-controls-modal';
        container.style.cssText = `
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            align-items: center;
            gap: 4px;
            width: auto !important;
            min-width: 80px;
        `;

        const { toneSelect, button } = createControls();

        container.appendChild(toneSelect);
        container.appendChild(button);

        // Append to the END of the scrollable list
        scrollList.appendChild(container);

        // Button Logic
        button.addEventListener('click', async (e) => {
            e.stopPropagation();
            const modal = toolbar.closest('[role="dialog"]');
            const inlineContext = toolbar.closest('.DraftEditor-root')?.parentElement || toolbar.parentElement;

            const contextStart = modal || inlineContext;

            await handleManualGenerate(button, contextStart, toneSelect.value);
        });
    }

    function createControls() {
        // Create tone selector dropdown
        const toneSelect = document.createElement('select');
        toneSelect.className = 'echo-x-tone-select';
        toneSelect.style.cssText = `
            padding: 4px 8px;
            background: transparent;
            color: #71767b;
            border: 1px solid rgba(29, 155, 240, 0.5);
            border-radius: 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            appearance: none;
            transition: all 0.2s;
            display: block; /* Always visible in toolbar */
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
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
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
            border: 1px solid rgba(29, 155, 240, 0.5);
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-left: 0px;
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

    async function handleManualGenerate(button, contextElement, tone) {
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

            // Inject spin animation if needed
            if (!document.querySelector('#echo-spin-style')) {
                const style = document.createElement('style');
                style.id = 'echo-spin-style';
                style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            // FIND TWEET DATA
            let tweetData = null;

            // Check if we are in a Modal
            if (contextElement && contextElement.getAttribute('role') === 'dialog') {
                // In modal, the tweet being replied to is usually displayed above the input
                // Look for 'article' inside the modal
                const tweetArticle = contextElement.querySelector('article[data-testid="tweet"]');
                if (tweetArticle) {
                    tweetData = window.extractXTweetData?.(tweetArticle);
                }
            }

            // If not found in modal (or not in modal), check for Main Article (Detail View Inline)
            if (!tweetData) {
                // If we are inline (not modal), we are likely replying to the main tweet on page
                // or a specific tweet in the thread. 
                // But usually inline reply at bottom corresponds to the main tweet above.
                // We can find the main tweet by finding the article that is NOT a reply in the context chain?
                // Or simply find 'article[data-testid="tweet"]' that has the main focus

                // Heuristic: The first visible tweet on the page might be it, IF we are in detail view.
                // But safer: look for the article that is PROBABLY the one we are replying to.
                // In detail view, the main tweet has a different structure sometimes.

                const articles = document.querySelectorAll('article[data-testid="tweet"]');
                // The 'main' one usually has larger font or specific location
                // Let's iterate and try to find one that looks like a main tweet or just use the first one?
                if (articles.length > 0) {
                    tweetData = window.extractXTweetData?.(articles[0]);
                }
            }

            if (!tweetData) throw new Error('Could not extract tweet content');

            console.log('[Echo X Driver] Generating for:', tweetData.postId, 'Tone:', tone);

            // Request AI comment generation
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: tweetData,
                platform: 'x',
                quickTone: tone || 'shitposter'
            });

            if (response.error) throw new Error(response.error);
            if (!response.comment) throw new Error('No reply generated');

            // Insert text into the active textarea (contextElement should contain it or be near it)
            // But strict logic: find the textarea associated with THIS toolbar.
            // The button is in the toolbar. The textarea is usually in the same container or parent.
            // We can search globally for the focused textarea OR search relative to button.

            await insertReplyText(response.comment, button);

            showNotification('✨ Reply generated!');
            button.innerHTML = originalHTML;

        } catch (error) {
            console.error('[Echo X Driver] User generation error:', error);
            showNotification(`Error: ${error.message}`, 'error');
            button.innerHTML = originalHTML;
        } finally {
            button.disabled = false;
            button.style.cursor = 'pointer';
        }
    }

    async function insertReplyText(text, buttonContext = null) {
        // Find the appropriate textarea
        let textarea = null;

        if (buttonContext) {
            // Try to find textarea relative to the button (closest container)
            // The toolbar is usually a sibling of the textarea wrapper or inside the same form
            const wrapper = buttonContext.closest('.DraftEditor-root') || buttonContext.closest('[data-testid="tweetTextarea_0_label"]')?.parentElement || buttonContext.closest('.css-175oi2r.r-16y2uox.r-1wbh5a2');
            if (wrapper) {
                textarea = wrapper.querySelector('div[data-testid="tweetTextarea_0"]');
            } else {
                // Try going up further
                const modal = buttonContext.closest('[role="dialog"]');
                if (modal) {
                    textarea = modal.querySelector('div[data-testid="tweetTextarea_0"]');
                }
            }
        }

        // Fallback or Global search if relative failed
        if (!textarea) {
            textarea = document.querySelector('div[data-testid="tweetTextarea_0"]');
        }

        if (!textarea) {
            throw new Error('Could not find reply textarea');
        }

        // Focus the textarea
        textarea.click();
        textarea.focus();
        await sleep(100);

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
