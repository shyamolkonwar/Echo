// Echo Chrome Extension - Reddit Driver
// Orchestrates semi-auto and manual Reddit comment generation
// NO AUTOPILOT - Only manual and semi-auto modes

(function () {
    'use strict';

    // Only run on Reddit
    if (window.getPlatform && window.getPlatform() !== 'reddit') return;

    console.log('[Echo Reddit Driver] Loading...');

    // ==================== STATE ====================
    let isActive = false;
    let isSemiAuto = false;
    let targetSubreddits = [];
    let isProcessing = false;

    const STORAGE_KEY = 'reddit_commented_posts';

    // ==================== INITIALIZATION ====================

    async function init() {
        console.log('[Echo Reddit Driver] Initializing...');

        await refreshStateFromStorage();

        console.log('[Echo Reddit Driver] State:', { isActive, isSemiAuto, targetSubreddits });

        if (isActive && isSemiAuto) {
            startFeedObserver();
        }

        // Always start manual button observer (works on post detail pages)
        startManualButtonObserver();

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(handleMessage);

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                console.log('[Echo Reddit Driver] Storage changed:', changes);

                if (changes.isActive !== undefined) {
                    isActive = changes.isActive.newValue;
                }

                if (changes.platforms?.newValue?.reddit) {
                    const redditSettings = changes.platforms.newValue.reddit;
                    isSemiAuto = redditSettings.enabled || false;
                }
            }
        });
    }

    async function refreshStateFromStorage() {
        try {
            const settings = await chrome.storage.local.get([
                'isActive', 'platforms', 'reddit_watched_subreddits'
            ]);

            isActive = settings.isActive || false;
            const redditSettings = settings.platforms?.reddit || {};
            isSemiAuto = redditSettings.enabled || false;
            targetSubreddits = settings.reddit_watched_subreddits || redditSettings.subreddits || [];

            return { isActive, isSemiAuto };
        } catch (error) {
            console.error('[Echo Reddit Driver] Error reading storage:', error);
            return { isActive: false, isSemiAuto: false };
        }
    }

    function handleMessage(message, sender, sendResponse) {
        console.log('[Echo Reddit Driver] Received message:', message.type);

        if (message.type === 'TOGGLE_ACTIVE') {
            isActive = message.isActive;
        }

        if (message.type === 'UPDATE_SUBREDDITS') {
            targetSubreddits = message.subreddits || [];
        }
    }

    // ==================== MANUAL GENERATE BUTTON ====================

    function startManualButtonObserver() {
        console.log('[Echo Reddit Driver] Starting manual button observer...');

        const checkAndInjectButton = () => {
            // Only inject on post detail pages (URLs like /r/subreddit/comments/...)
            if (!window.location.pathname.includes('/comments/')) return;

            // Find the comment composer
            const composer = document.querySelector('shreddit-composer, [data-testid="comment-composer"]');
            if (composer && !document.querySelector('.echo-reddit-generate-btn')) {
                injectManualGenerateButton(composer);
            }
        };

        // Check immediately
        setTimeout(checkAndInjectButton, 1000);

        // Observe for dynamic loading
        const observer = new MutationObserver(() => {
            checkAndInjectButton();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Also check on URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(checkAndInjectButton, 1500);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    function injectManualGenerateButton(composer) {
        if (document.querySelector('.echo-reddit-generate-btn')) return;

        // Create container for button and tone selector
        const container = document.createElement('div');
        container.className = 'echo-reddit-controls';
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 8px 0;
        `;

        // Create tone selector dropdown
        const toneSelect = document.createElement('select');
        toneSelect.className = 'echo-reddit-tone-select';
        toneSelect.style.cssText = `
            padding: 8px 12px;
            background: #1a1a1b;
            color: white;
            border: 1px solid #343536;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 30px;
        `;
        toneSelect.innerHTML = `
            <option value="sarcastic">😏 Sarcastic</option>
            <option value="witty">🎭 Witty</option>
            <option value="cynical">🙄 Cynical</option>
            <option value="informative">📚 Informative</option>
            <option value="supportive">🤝 Supportive</option>
        `;

        // Load saved tone
        chrome.storage.local.get('redditQuickTone').then(data => {
            toneSelect.value = data.redditQuickTone || 'sarcastic';
        });

        // Save tone on change
        toneSelect.addEventListener('change', async () => {
            const tone = toneSelect.value;
            await chrome.storage.local.set({ redditQuickTone: tone });

            // Also update platforms storage
            const { platforms } = await chrome.storage.local.get('platforms');
            if (platforms && platforms.reddit) {
                platforms.reddit.quickTone = tone;
                await chrome.storage.local.set({ platforms });
            }
        });

        // Create generate button
        const button = document.createElement('button');
        button.className = 'echo-reddit-generate-btn';
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>Generate</span>
        `;
        button.title = 'Generate AI comment for this post';
        button.type = 'button';

        button.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: linear-gradient(135deg, #FF4500 0%, #FF5722 100%);
            color: white;
            border: none;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-shadow: 0 2px 8px rgba(255, 69, 0, 0.3);
            transition: all 0.2s ease;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-1px)';
            button.style.boxShadow = '0 4px 12px rgba(255, 69, 0, 0.4)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 8px rgba(255, 69, 0, 0.3)';
        });

        button.addEventListener('click', async () => await handleManualGenerate(button, toneSelect.value));

        container.appendChild(toneSelect);
        container.appendChild(button);

        const composerParent = composer.parentElement;
        if (composerParent) {
            composerParent.insertBefore(container, composer.nextSibling);
        } else {
            const form = document.querySelector('faceplate-form[action*="create-comment"]');
            if (form && form.parentElement) {
                form.parentElement.appendChild(container);
            }
        }

        console.log('[Echo Reddit Driver] Manual generate button with tone selector injected');
    }

    async function handleManualGenerate(button, tone) {
        if (button.disabled) return;

        try {
            button.disabled = true;
            button.style.opacity = '0.7';
            button.style.cursor = 'wait';
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                </svg>
                <span>Generating...</span>
            `;

            if (!document.querySelector('#echo-spin-style')) {
                const style = document.createElement('style');
                style.id = 'echo-spin-style';
                style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
                document.head.appendChild(style);
            }

            // Extract post data
            const post = document.querySelector('shreddit-post, [data-post-id]');
            if (!post) throw new Error('Could not find post element');

            const postData = window.extractRedditPostData?.(post);
            if (!postData || !postData.content || postData.content.length < 10) {
                throw new Error('Could not extract post content');
            }

            console.log('[Echo Reddit Driver] Manual generate for post:', postData.postId, 'with tone:', tone);

            // Request AI comment generation with tone
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: postData,
                platform: 'reddit',
                quickTone: tone || 'witty'
            });

            if (response.error) throw new Error(response.error);
            if (!response.comment) throw new Error('No comment generated');

            console.log('[Echo Reddit Driver] Generated comment:', response.comment.substring(0, 50) + '...');

            // Find the comment box and insert the text
            const commentBox = await findAndActivateCommentBox();
            if (!commentBox) throw new Error('Could not find comment box');

            // Insert the comment
            await insertCommentIntoEditor(commentBox, response.comment);

            showNotification('✨ Comment generated! Review and post when ready.');

            button.innerHTML = originalHTML;

        } catch (error) {
            console.error('[Echo Reddit Driver] Manual generation error:', error);
            showNotification(`Error: ${error.message}`, 'error');
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Generate</span>
            `;
        } finally {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    async function findAndActivateCommentBox() {
        const triggers = ['div.text-area-wrapper', 'textarea#innerTextArea', 'shreddit-composer'];
        for (const selector of triggers) {
            const trigger = document.querySelector(selector);
            if (trigger) {
                trigger.click();
                await sleep(500);
                break;
            }
        }

        for (let i = 0; i < 20; i++) {
            const lexicalDiv = document.querySelector('div[data-lexical-editor="true"][contenteditable="true"]');
            if (lexicalDiv) {
                lexicalDiv.click();
                await sleep(200);
                lexicalDiv.focus();
                return lexicalDiv;
            }
            await sleep(100);
        }

        const textarea = document.querySelector('textarea#innerTextArea');
        if (textarea && textarea.offsetHeight > 0) {
            textarea.click();
            textarea.focus();
            return textarea;
        }

        return null;
    }

    async function insertCommentIntoEditor(element, text) {
        const isTextarea = element.tagName.toLowerCase() === 'textarea';

        element.focus();
        await sleep(100);

        if (isTextarea) {
            element.value = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // For Lexical editor - use clipboard paste simulation
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false);
            await sleep(50);

            // Method 1: Clipboard API + paste event
            try {
                await navigator.clipboard.writeText(text);

                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: new DataTransfer()
                });
                pasteEvent.clipboardData.setData('text/plain', text);
                element.dispatchEvent(pasteEvent);

                await sleep(100);

                if (element.textContent.includes(text.substring(0, 20))) {
                    console.log('[Echo Reddit Driver] Paste simulation succeeded');
                    return;
                }
            } catch (e) {
                console.log('[Echo Reddit Driver] Clipboard API failed, trying fallback');
            }

            // Method 2: execCommand
            element.focus();
            const success = document.execCommand('insertText', false, text);
            if (success && element.textContent.includes(text.substring(0, 20))) {
                console.log('[Echo Reddit Driver] execCommand insertText succeeded');
                return;
            }

            // Method 3: Direct DOM manipulation
            console.log('[Echo Reddit Driver] Using direct DOM manipulation');
            element.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);

            element.dispatchEvent(new InputEvent('input', {
                inputType: 'insertText',
                data: text,
                bubbles: true
            }));
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ==================== FEED OBSERVER (Semi-Auto) ====================

    function startFeedObserver() {
        console.log('[Echo Reddit Driver] Starting semi-auto feed observer...');

        const observer = new MutationObserver((mutations) => {
            if (!isActive || isProcessing) return;

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const posts = node.matches?.('shreddit-post, article.w-full')
                            ? [node]
                            : node.querySelectorAll?.('shreddit-post, article.w-full') || [];

                        posts.forEach(post => checkPostForSemiAuto(post));
                    }
                });
            });
        });

        const feed = document.querySelector('shreddit-feed, div#main-content, main');
        if (feed) {
            observer.observe(feed, { childList: true, subtree: true });
        }
    }

    async function checkPostForSemiAuto(postElement) {
        const postData = window.extractRedditPostData?.(postElement);
        if (!postData) return;

        if (await hasAlreadyCommented(postData.postId)) return;

        if (targetSubreddits.length > 0) {
            const subredditLower = postData.subreddit.toLowerCase();
            const matchesTarget = targetSubreddits.some(
                target => target.toLowerCase().replace(/^r\//, '') === subredditLower
            );
            if (!matchesTarget) return;
        }

        showPostNotification(postElement, postData);
    }

    // ==================== NOTIFICATION (Semi-Auto) ====================

    function showPostNotification(postElement, postData) {
        document.querySelector('.echo-reddit-notification')?.remove();

        const notification = document.createElement('div');
        notification.className = 'echo-reddit-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #FF4500 0%, #FF5722 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(255, 69, 0, 0.4);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;

        notification.innerHTML = `
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
            <div style="font-weight: 600; margin-bottom: 8px;">📍 Target Post Found!</div>
            <div style="font-size: 13px; margin-bottom: 12px; opacity: 0.9;">
                r/${postData.subreddit}<br>
                <em style="display: block; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${postData.title?.substring(0, 50) || 'View post'}...
                </em>
            </div>
            <button class="echo-notification-btn" style="
                background: white;
                color: #FF4500;
                border: none;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
            ">Generate Comment</button>
        `;

        notification.querySelector('.echo-notification-btn').addEventListener('click', async () => {
            notification.remove();
            await processSemiAutoPost(postElement, postData);
        });

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 15000);
    }

    async function processSemiAutoPost(postElement, postData) {
        isProcessing = true;

        try {
            const commentButton = postElement.querySelector('a[data-post-click-location="comments-button"]') ||
                postElement.querySelector('a[href*="/comments/"]');
            if (commentButton) {
                commentButton.click();
                await sleep(3000);
            }

            // Wait for page to load and button to appear
            await sleep(2000);

            // Find and click the generate button
            const generateBtn = document.querySelector('.echo-reddit-generate-btn');
            if (generateBtn) {
                generateBtn.click();
            } else {
                showNotification('Navigate to the post and use the Generate button', 'info');
            }

        } catch (error) {
            console.error('[Echo Reddit Driver] Semi-auto error:', error);
        } finally {
            isProcessing = false;
        }
    }

    // ==================== HELPERS ====================

    async function hasAlreadyCommented(postId) {
        try {
            const data = await chrome.storage.local.get(STORAGE_KEY);
            const commented = data[STORAGE_KEY] || [];
            return commented.includes(postId);
        } catch {
            return false;
        }
    }

    async function markAsCommented(postId) {
        try {
            const data = await chrome.storage.local.get(STORAGE_KEY);
            const commented = data[STORAGE_KEY] || [];
            commented.push(postId);
            if (commented.length > 100) commented.splice(0, commented.length - 100);
            await chrome.storage.local.set({ [STORAGE_KEY]: commented });
        } catch (error) {
            console.error('[Echo Reddit Driver] Error marking as commented:', error);
        }
    }

    function showNotification(message, type = 'success') {
        const existing = document.querySelector('.echo-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `echo-notification ${type === 'error' ? 'echo-notification-error' : ''}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#DC2626' : '#191919'};
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

    window.redditDriver = { init };
    console.log('[Echo Reddit Driver] Module loaded');

})();
