// Echo Chrome Extension - Reddit Driver
// Orchestrates semi-auto and auto-pilot Reddit automation workflows
// HUMAN-LIKE BEHAVIOR with curvy, unpredictable delays

(function () {
    'use strict';

    // Only run on Reddit
    if (window.getPlatform && window.getPlatform() !== 'reddit') return;

    console.log('[Echo Reddit Driver] Loading...');

    // ==================== STATE ====================
    let isActive = false;
    let isAutoPilot = false;
    let isSemiAuto = false;
    let targetSubreddits = [];
    let isProcessing = false;
    let shouldStop = false;

    // Session limits (conservative)
    let scrollCount = 0;
    let commentCount = 0;
    let startTime = null;
    const MAX_SCROLLS = 40;
    const MAX_COMMENTS_PER_SESSION = 6;
    const MAX_DURATION = 20 * 60 * 1000; // 20 minutes

    // ==================== HUMAN-LIKE BUFFER TIMING ====================
    // Curvy, variable delays to avoid detection
    const BUFFER = {
        beforeScroll: { min: 4000, max: 9000 },           // 4-9 seconds before scroll
        afterScroll: { min: 5000, max: 12000 },           // 5-12 seconds read time
        beforeCommentClick: { min: 2000, max: 5000 },     // 2-5 seconds thinking
        waitForPageLoad: { min: 3000, max: 5000 },        // 3-5 seconds page load
        beforeTyping: { min: 2000, max: 4000 },           // 2-4 seconds before typing
        duringTyping: { min: 40, max: 120 },              // Per character delay
        typingPause: { min: 300, max: 800 },              // Occasional thinking pause
        beforeSubmit: { min: 3000, max: 6000 },           // 3-6 seconds review time
        afterPosting: { min: 12000, max: 25000 },         // 12-25 seconds after posting!
        afterFail: { min: 5000, max: 10000 },             // 5-10 seconds after fail
        beforeBack: { min: 2000, max: 4000 },             // Before clicking back
        afterBack: { min: 8000, max: 15000 },             // 8-15 seconds rest after back
    };

    const STORAGE_KEY = 'reddit_commented_posts';

    // ==================== INITIALIZATION ====================

    async function init() {
        console.log('[Echo Reddit Driver] Initializing...');

        await refreshStateFromStorage();

        console.log('[Echo Reddit Driver] State:', { isActive, isAutoPilot, isSemiAuto, targetSubreddits });

        if (isActive && isAutoPilot) {
            startAutoPilotLoop();
        } else if (isActive && isSemiAuto) {
            startFeedObserver();
        }

        // Always start manual button observer (works on post detail pages)
        startManualButtonObserver();

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(handleMessage);

        // Listen for storage changes (handles popup close scenarios)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                console.log('[Echo Reddit Driver] Storage changed:', changes);

                // Handle isActive changes
                if (changes.isActive !== undefined) {
                    isActive = changes.isActive.newValue;
                    if (!isActive) {
                        shouldStop = true;
                    } else if (isAutoPilot && !isProcessing) {
                        shouldStop = false;
                        startAutoPilotLoop();
                    }
                }

                // Handle platforms.reddit changes
                if (changes.platforms?.newValue?.reddit) {
                    const redditSettings = changes.platforms.newValue.reddit;
                    isAutoPilot = redditSettings.autopilot || false;
                    isSemiAuto = redditSettings.enabled && !isAutoPilot;

                    if (!isAutoPilot) {
                        shouldStop = true;
                    } else if (isActive && !isProcessing) {
                        shouldStop = false;
                        startAutoPilotLoop();
                    }
                }
            }
        });
    }

    // Refresh state from storage (called periodically to ensure sync)
    async function refreshStateFromStorage() {
        try {
            const settings = await chrome.storage.local.get([
                'isActive', 'platforms', 'reddit_watched_subreddits'
            ]);

            isActive = settings.isActive || false;
            const redditSettings = settings.platforms?.reddit || {};
            isAutoPilot = redditSettings.autopilot || false;
            isSemiAuto = redditSettings.enabled && !isAutoPilot;
            targetSubreddits = settings.reddit_watched_subreddits || redditSettings.subreddits || [];

            return { isActive, isAutoPilot, isSemiAuto };
        } catch (error) {
            console.error('[Echo Reddit Driver] Error reading storage:', error);
            return { isActive: false, isAutoPilot: false, isSemiAuto: false };
        }
    }

    function handleMessage(message, sender, sendResponse) {
        console.log('[Echo Reddit Driver] Received message:', message.type);

        if (message.type === 'TOGGLE_ACTIVE') {
            isActive = message.isActive;
            if (!isActive) {
                shouldStop = true;
            } else if (isAutoPilot && !isProcessing) {
                shouldStop = false;
                startAutoPilotLoop();
            }
        }

        if (message.type === 'TOGGLE_AUTOPILOT' && message.platform === 'reddit') {
            isAutoPilot = message.isAutoPilot;
            isSemiAuto = !isAutoPilot;
            if (isAutoPilot && isActive && !isProcessing) {
                shouldStop = false;
                startAutoPilotLoop();
            } else if (!isAutoPilot) {
                shouldStop = true;
            }
        }

        if (message.type === 'UPDATE_SUBREDDITS') {
            targetSubreddits = message.subreddits || [];
        }
    }

    // ==================== MANUAL GENERATE BUTTON ====================

    function startManualButtonObserver() {
        console.log('[Echo Reddit Driver] Starting manual button observer...');

        // Check if we're on a post detail page
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
        const observer = new MutationObserver((mutations) => {
            if (isAutoPilot) return; // Skip if autopilot is running
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
        // Don't inject if button already exists
        if (document.querySelector('.echo-reddit-generate-btn')) return;

        const button = document.createElement('button');
        button.className = 'echo-reddit-generate-btn';
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>Generate with Echo</span>
        `;
        button.title = 'Generate AI comment for this post';
        button.type = 'button';

        // Style the button
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
            margin: 8px 0;
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

        button.addEventListener('click', async () => await handleManualGenerate(button, composer));

        // Find a good place to insert the button - after the composer
        const composerParent = composer.parentElement;
        if (composerParent) {
            composerParent.insertBefore(button, composer.nextSibling);
        } else {
            // Fallback: insert after the form
            const form = document.querySelector('faceplate-form[action*="create-comment"]');
            if (form && form.parentElement) {
                form.parentElement.appendChild(button);
            }
        }

        console.log('[Echo Reddit Driver] Manual generate button injected');
    }

    async function handleManualGenerate(button, composer) {
        if (button.disabled) return;

        try {
            // Set loading state
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

            // Add spin animation if not already present
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

            console.log('[Echo Reddit Driver] Manual generate for post:', postData.postId);

            // Request AI comment generation
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: postData,
                platform: 'reddit'
            });

            if (response.error) throw new Error(response.error);
            if (!response.comment) throw new Error('No comment generated');

            console.log('[Echo Reddit Driver] Generated comment:', response.comment.substring(0, 50) + '...');

            // Find the comment box and insert the text
            const commentBox = await findAndActivateCommentBox();
            if (!commentBox) throw new Error('Could not find comment box');

            // Insert the comment using the proper method for Lexical
            await insertCommentIntoEditor(commentBox, response.comment);

            showNotification('✨ Comment generated! Review and post when ready.');

            // Restore button
            button.innerHTML = originalHTML;

        } catch (error) {
            console.error('[Echo Reddit Driver] Manual generation error:', error);
            showNotification(`Error: ${error.message}`, 'error');
            button.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Generate with Echo</span>
            `;
        } finally {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        }
    }

    async function findAndActivateCommentBox() {
        // Click the textarea wrapper first to expand it
        const triggers = ['div.text-area-wrapper', 'textarea#innerTextArea', 'shreddit-composer'];
        for (const selector of triggers) {
            const trigger = document.querySelector(selector);
            if (trigger) {
                trigger.click();
                await sleep(500);
                break;
            }
        }

        // Wait for Lexical editor to appear
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

        // Fallback to textarea
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
            // This is the most reliable method for complex editors

            // First clear existing content
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false);
            await sleep(50);

            // Method 1: Try clipboard API + paste event
            try {
                // Copy text to clipboard
                await navigator.clipboard.writeText(text);

                // Simulate paste
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: new DataTransfer()
                });
                pasteEvent.clipboardData.setData('text/plain', text);
                element.dispatchEvent(pasteEvent);

                await sleep(100);

                // Check if it worked
                if (element.textContent.includes(text.substring(0, 20))) {
                    console.log('[Echo Reddit Driver] Paste simulation succeeded');
                    return;
                }
            } catch (e) {
                console.log('[Echo Reddit Driver] Clipboard API failed, trying fallback');
            }

            // Method 2: Use document.execCommand('insertText')
            element.focus();
            const success = document.execCommand('insertText', false, text);
            if (success && element.textContent.includes(text.substring(0, 20))) {
                console.log('[Echo Reddit Driver] execCommand insertText succeeded');
                return;
            }

            // Method 3: Direct DOM manipulation as last resort
            console.log('[Echo Reddit Driver] Using direct DOM manipulation');
            element.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);

            // Dispatch events to notify Lexical
            element.dispatchEvent(new InputEvent('input', {
                inputType: 'insertText',
                data: text,
                bubbles: true
            }));
        }

        // Final events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ==================== MAIN AUTO-PILOT LOOP ====================

    async function startAutoPilotLoop() {
        // CRITICAL: Must have BOTH isActive AND isAutoPilot to start
        if (!isActive) {
            console.log('[Echo Reddit Driver] Cannot start: isActive is false');
            return;
        }
        if (!isAutoPilot) {
            console.log('[Echo Reddit Driver] Cannot start: isAutoPilot is false');
            return;
        }
        if (isProcessing) {
            console.log('[Echo Reddit Driver] Already processing, skipping');
            return;
        }

        isProcessing = true;
        shouldStop = false;
        scrollCount = 0;
        commentCount = 0;
        startTime = Date.now();

        showNotification('🐢 Reddit Auto-Pilot engaged! Running slow & human-like...');
        console.log('[Echo Reddit Driver] Starting auto-pilot loop...');

        while (!shouldStop) {
            // Re-verify state from storage FIRST (handles popup close)
            const currentState = await refreshStateFromStorage();

            // CRITICAL: Stop if EITHER isActive OR isAutoPilot is false
            if (!currentState.isActive) {
                console.log('[Echo Reddit Driver] isActive is now false, stopping loop');
                break;
            }
            if (!currentState.isAutoPilot) {
                console.log('[Echo Reddit Driver] isAutoPilot is now false, stopping loop');
                break;
            }

            // Safety limits
            if (!checkSafetyLimits()) break;

            // Step 1: Wait before scrolling (humans pause to think)
            await humanWait('beforeScroll');

            // Check again after long wait
            if (shouldStop || !isActive || !isAutoPilot) {
                console.log('[Echo Reddit Driver] Stop signal received during wait');
                break;
            }

            // Step 2: Human-like scroll
            await humanScroll();
            scrollCount++;

            // Step 3: Wait after scroll (reading time)
            await humanWait('afterScroll');

            // Check again after long wait
            if (shouldStop || !isActive || !isAutoPilot) {
                console.log('[Echo Reddit Driver] Stop signal received during wait');
                break;
            }

            // Step 4: Scan for target posts
            const target = await scanForTargetPost();
            if (shouldStop || !isActive || !isAutoPilot) break;

            if (target) {
                console.log(`[Echo Reddit Driver] Found target: ${target.postData.postId}`);

                // Step 5: Process post with full human-like flow
                const success = await processPostAutoPilot(target.element, target.postData);

                if (success) {
                    commentCount++;
                    // LONG rest after successful comment
                    await humanWait('afterPosting');
                } else {
                    await humanWait('afterFail');
                }

                // Check after processing
                if (shouldStop || !isActive || !isAutoPilot) break;
            }

            // Check session limit
            if (commentCount >= MAX_COMMENTS_PER_SESSION) {
                showNotification(`🎉 Done! ${commentCount} comments posted.`);
                break;
            }
        }

        isProcessing = false;
        console.log('[Echo Reddit Driver] Auto-pilot loop ended');
    }

    // ==================== SAFETY CHECKS ====================

    function checkSafetyLimits() {
        if (scrollCount >= MAX_SCROLLS) {
            showNotification('Session limit: Max scrolls reached');
            return false;
        }

        if (Date.now() - startTime >= MAX_DURATION) {
            showNotification('Session limit: Time exceeded');
            return false;
        }

        return true;
    }

    // ==================== HUMAN-LIKE BEHAVIORS ====================

    async function humanWait(bufferType) {
        const buffer = BUFFER[bufferType];
        if (!buffer) {
            await sleep(random(2000, 4000));
            return;
        }
        const waitTime = random(buffer.min, buffer.max);
        console.log(`[Echo Reddit Driver] Waiting ${waitTime}ms (${bufferType})`);
        await sleep(waitTime);
    }

    async function humanScroll() {
        // Variable scroll amount
        const scrollAmount = random(300, 700);

        // Scroll in chunks for more human-like behavior
        const chunks = random(2, 4);
        const chunkAmount = Math.floor(scrollAmount / chunks);

        for (let i = 0; i < chunks; i++) {
            if (shouldStop) return;

            window.scrollBy({
                top: chunkAmount,
                behavior: 'smooth'
            });

            // Variable pause between chunks
            await sleep(random(200, 500));
        }
    }

    async function typeSlowly(text, element) {
        console.log(`[Echo Reddit Driver] typeSlowly called with ${text.length} characters`);
        console.log(`[Echo Reddit Driver] Element type: ${element.tagName}, ID: ${element.id}, ContentEditable: ${element.isContentEditable}`);

        // Verify it's a textarea or contenteditable div
        const isTextarea = element.tagName.toLowerCase() === 'textarea';
        const isContentEditable = element.isContentEditable || element.getAttribute('contenteditable') === 'true';

        if (!isTextarea && !isContentEditable) {
            console.error('[Echo Reddit Driver] typeSlowly requires TEXTAREA or ContentEditable, got:', element.tagName);
            return;
        }

        element.focus();
        await sleep(random(300, 600));

        // Clear existing content safely
        if (isTextarea) {
            element.value = '';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // For Lexical, select all and delete via selection
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false); // Delete selection using deprecated but working method
            await sleep(100);
        }

        // Ensure focus again
        element.focus();
        await sleep(100);

        // Type character by character
        let typedChars = 0;
        for (let i = 0; i < text.length; i++) {
            if (shouldStop) break;

            const char = text[i];

            if (isTextarea) {
                element.value += char;
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                // For ContentEditable / Lexical:
                // Method: Dispatch InputEvent with insertText type - this is the modern standard
                const inputEvent = new InputEvent('beforeinput', {
                    inputType: 'insertText',
                    data: char,
                    bubbles: true,
                    cancelable: true,
                });
                element.dispatchEvent(inputEvent);

                // Also dispatch the 'input' event that follows a successful beforeinput
                const afterInputEvent = new InputEvent('input', {
                    inputType: 'insertText',
                    data: char,
                    bubbles: true,
                });
                element.dispatchEvent(afterInputEvent);
            }

            typedChars++;

            // Random typing delay
            await sleep(random(BUFFER.duringTyping.min, BUFFER.duringTyping.max));

            // Occasional thinking pause (5% chance)
            if (Math.random() < 0.05) {
                await sleep(random(BUFFER.typingPause.min, BUFFER.typingPause.max));
            }
        }

        // Final events to ensure framework detects changes
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        console.log(`[Echo Reddit Driver] Typed ${typedChars} characters into ${isTextarea ? 'textarea' : 'RTE'}`);
    }

    // ==================== TARGET SCANNING ====================

    async function scanForTargetPost() {
        // Use the updated selectors from reddit_logic.js directly if needed, or rely on window.extractRedditPostData
        // Selector needs to match the new DOM structure: article containing shreddit-post
        const posts = document.querySelectorAll('article shreddit-post, shreddit-post');

        console.log(`[Echo Reddit Driver] Scanning ${posts.length} visible posts...`);

        for (const post of posts) {
            if (shouldStop) return null;

            const postData = window.extractRedditPostData?.(post);
            if (!postData) {
                // console.log('[Echo Reddit Driver] Failed to extract data from post');
                continue;
            }

            // Check if already commented
            if (await hasAlreadyCommented(postData.postId)) {
                // console.log(`[Echo Reddit Driver] Already commented: ${postData.postId}`);
                continue;
            }

            // Check if subreddit matches target list
            if (targetSubreddits.length > 0) {
                const subredditLower = postData.subreddit.toLowerCase().replace(/^r\//, '').trim();
                const matchesTarget = targetSubreddits.some(
                    target => target.toLowerCase().replace(/^r\//, '').trim() === subredditLower
                );

                if (!matchesTarget) {
                    console.log(`[Echo Reddit Driver] Skipping r/${postData.subreddit} (Not in targets: ${targetSubreddits.join(', ')})`);
                    continue;
                }
            }

            // Check visibility (only process visible posts)
            // const rect = post.getBoundingClientRect();
            // const isVisible = rect.top >= 0 && rect.top <= window.innerHeight * 0.7;
            // if (!isVisible) {
            //     console.log(`[Echo Reddit Driver] Skipping ${postData.postId} (Not visible enough)`);
            //     continue;
            // }

            return { element: post, postData };
        }

        console.log('[Echo Reddit Driver] No matching target found in this scan');
        return null;
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
        notification.innerHTML = `
            <div class="echo-notification-content">
                <span class="echo-notification-icon">🔔</span>
                <span class="echo-notification-text">Echo found a post in <strong>r/${postData.subreddit}</strong></span>
                <button class="echo-notification-btn">Generate Comment</button>
                <button class="echo-notification-close">×</button>
            </div>
        `;

        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            animation: slideIn 0.3s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .echo-notification-content { display: flex; align-items: center; gap: 12px; }
            .echo-notification-btn {
                background: white; color: #667eea; border: none;
                padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer;
            }
            .echo-notification-btn:hover { transform: scale(1.05); }
            .echo-notification-close {
                background: rgba(255,255,255,0.2); border: none; color: white;
                width: 24px; height: 24px; border-radius: 50%; cursor: pointer; font-size: 16px;
            }
        `;
        document.head.appendChild(style);

        notification.querySelector('.echo-notification-btn').addEventListener('click', () => {
            notification.remove();
            processSemiAutoPost(postElement, postData);
        });

        notification.querySelector('.echo-notification-close').addEventListener('click', () => {
            notification.remove();
        });

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 15000);
    }

    async function processSemiAutoPost(postElement, postData) {
        isProcessing = true;

        try {
            const commentButton = postElement.querySelector('a[data-post-click-location="comments-button"]');
            if (commentButton) {
                commentButton.click();
                await humanWait('waitForPageLoad');
            }

            await scrollToCommentBox();
            await generateAndInsertComment(postData, false);

            console.log('[Echo Reddit Driver] Semi-auto draft complete.');

        } catch (error) {
            console.error('[Echo Reddit Driver] Semi-auto error:', error);
        } finally {
            isProcessing = false;
        }
    }

    // ==================== AUTO-PILOT POST PROCESSING ====================

    async function processPostAutoPilot(postElement, postData) {
        try {
            console.log('[Echo Reddit Driver] Processing post with human-like flow...');

            // Step 1: Thinking pause before clicking
            await humanWait('beforeCommentClick');
            if (shouldStop) return false;

            // Step 3: Click comment button to navigate
            // Try multiple selectors for the comment button
            let commentButton = postElement.querySelector('a[data-post-click-location="comments-button"]') ||
                postElement.querySelector('a[name="comments-action-button"]') ||
                postElement.querySelector('a[aria-label*="comment"]') ||
                postElement.querySelector('a[href*="/comments/"]');

            // Fallback: search by text content
            if (!commentButton) {
                const links = postElement.querySelectorAll('a');
                for (const link of links) {
                    const text = link.textContent.toLowerCase();
                    const href = link.getAttribute('href') || '';
                    if (text.includes('comment') || href.includes('/comments/')) {
                        commentButton = link;
                        break;
                    }
                }
            }

            if (!commentButton) {
                console.error('[Echo Reddit Driver] Comment button not found');
                console.log('[Echo Reddit Driver] Post HTML:', postElement.innerHTML.substring(0, 500));
                return false;
            }

            console.log('[Echo Reddit Driver] Clicking comment button...');
            commentButton.click();

            // Step 4: Wait for page to load (variable time)
            await humanWait('waitForPageLoad');
            if (shouldStop) return false;

            // Step 4b: Now upvote on the POST DETAIL page (not feed)
            const upvoteBtn = document.querySelector('button[upvote], shreddit-post button[upvote]');
            if (upvoteBtn) {
                console.log('[Echo Reddit Driver] Clicking upvote...');
                upvoteBtn.click();
                await sleep(random(500, 1000));
            }

            // Step 5: Click the comment box to trigger button injection
            console.log('[Echo Reddit Driver] Clicking comment box to trigger button...');
            const triggers = ['div.text-area-wrapper', 'textarea#innerTextArea', 'shreddit-composer'];
            for (const selector of triggers) {
                const trigger = document.querySelector(selector);
                if (trigger) {
                    trigger.click();
                    await sleep(1000);
                    break;
                }
            }
            if (shouldStop) return false;

            // Step 6: Thinking pause before generating
            await humanWait('beforeTyping');
            if (shouldStop) return false;

            // Step 7: Wait for the Echo generate button to appear and click it
            let generateBtn = null;
            for (let i = 0; i < 30; i++) { // Wait up to 3 seconds
                generateBtn = document.querySelector('.echo-reddit-generate-btn');
                if (generateBtn) break;
                await sleep(100);
            }

            if (!generateBtn) {
                // Button didn't appear, inject it manually
                const composer = document.querySelector('shreddit-composer, [data-testid="comment-composer"]');
                if (composer) {
                    injectManualGenerateButton(composer);
                    await sleep(500);
                    generateBtn = document.querySelector('.echo-reddit-generate-btn');
                }
            }

            if (!generateBtn) {
                console.error('[Echo Reddit Driver] Generate button not found');
                return false;
            }

            console.log('[Echo Reddit Driver] Clicking Echo generate button...');
            generateBtn.click();

            // Step 8: Wait for comment to be generated and inserted
            // The handleManualGenerate function will handle this, we just need to wait
            let commentInserted = false;
            for (let i = 0; i < 60; i++) { // Wait up to 30 seconds for AI generation
                await sleep(500);

                // Check if button is no longer loading (means generation complete)
                if (!generateBtn.disabled) {
                    // Check if text was inserted
                    const lexicalDiv = document.querySelector('div[data-lexical-editor="true"]');
                    const textarea = document.querySelector('textarea#innerTextArea');
                    const hasContent = (lexicalDiv && lexicalDiv.textContent.trim().length > 10) ||
                        (textarea && textarea.value.trim().length > 10);
                    if (hasContent) {
                        commentInserted = true;
                        break;
                    }
                }

                if (shouldStop) return false;
            }

            if (!commentInserted) {
                console.error('[Echo Reddit Driver] Comment generation/insertion timed out');
                return false;
            }

            console.log('[Echo Reddit Driver] Comment inserted successfully!');

            // Step 8b: CRITICAL - Click the comment box again to make content visible
            // The Lexical editor sometimes doesn't show content until focused
            const lexicalDiv = document.querySelector('div[data-lexical-editor="true"]');
            if (lexicalDiv) {
                console.log('[Echo Reddit Driver] Clicking comment box to reveal content...');
                lexicalDiv.click();
                await sleep(300);
                lexicalDiv.focus();
                await sleep(300);
            }

            if (shouldStop) return false;

            // Step 9: Review pause before submitting
            await humanWait('beforeSubmit');
            if (shouldStop) return false;

            // Step 10: Submit the comment
            const submitted = await window.submitRedditComment?.();
            if (!submitted) {
                console.error('[Echo Reddit Driver] Failed to submit');
                return false;
            }

            console.log('[Echo Reddit Driver] Comment submitted successfully!');

            // NOW mark as commented (after successful submission)
            await markAsCommented(postData.postId);
            logActivity(`Commented on r/${postData.subreddit}`);

            // Step 11: Wait before going back
            await humanWait('beforeBack');

            // Step 12: Navigate back to feed
            const backButton = document.querySelector('button[aria-label="Back"]');
            if (backButton) {
                backButton.click();
                await humanWait('afterBack');
            }

            return true;

        } catch (error) {
            console.error('[Echo Reddit Driver] Auto-pilot error:', error);
            return false;
        }
    }

    // ==================== COMMENT BOX HELPERS ====================

    async function scrollToCommentBox() {
        let commentBox = null;

        // Step 1: Try clicking the comment composer area to trigger lazy-load / expansion
        // The textarea-wrapper or trigger-button click will expand the collapsed textarea
        // into the full Lexical RTE
        const composerTriggers = [
            'div.text-area-wrapper',  // The wrapper around the collapsed textarea
            'textarea#innerTextArea', // The collapsed textarea itself
            '[data-testid="trigger-button"]',
            'faceplate-textarea-input',
            'shreddit-composer',
            '[data-testid="comment-composer"]',
        ];

        for (const selector of composerTriggers) {
            const trigger = document.querySelector(selector);
            if (trigger) {
                console.log('[Echo Reddit Driver] Clicking composer trigger:', selector);
                trigger.click();
                await sleep(1500); // Give time for the RTE to fully load
                break;
            }
        }

        // Step 2: Wait for the Lexical editor div to appear (this is the real target)
        // The Lexical editor has data-lexical-editor="true" attribute
        for (let i = 0; i < 100; i++) { // 100 * 200ms = 20 seconds
            // Look specifically for the Lexical editor div
            const lexicalDiv = document.querySelector('div[data-lexical-editor="true"][contenteditable="true"]');
            const slotDiv = document.querySelector('div[slot="rte"][contenteditable="true"]');
            const roleDiv = document.querySelector('div[contenteditable="true"][role="textbox"]');

            commentBox = lexicalDiv || slotDiv || roleDiv;

            // Fallback to textarea if RTE doesn't load
            if (!commentBox) {
                const textarea = document.querySelector('textarea#innerTextArea');
                if (textarea && textarea.offsetHeight > 0) {
                    commentBox = textarea;
                }
            }

            if (commentBox) {
                const rect = commentBox.getBoundingClientRect();
                const isLexical = commentBox.getAttribute('data-lexical-editor') === 'true';

                // TRUST the Lexical div even if height is 0 - clicking it will activate it
                // Only reject if it's a non-Lexical element with 0 height
                if (isLexical || rect.height > 0) {
                    console.log('[Echo Reddit Driver] Found comment box:', {
                        id: commentBox.id || 'no-id',
                        tagName: commentBox.tagName,
                        contentEditable: commentBox.getAttribute('contenteditable'),
                        lexicalEditor: isLexical,
                        height: rect.height
                    });
                    break;
                } else if (i > 25) {
                    // After 5 seconds, just use whatever we found
                    console.log('[Echo Reddit Driver] Using element despite height 0 (timeout fallback)');
                    break;
                } else {
                    console.log('[Echo Reddit Driver] Found element but height is 0, continuing...');
                    commentBox = null;
                }
            }

            // Log progress every 2 seconds
            if (i % 10 === 0 && i > 0) {
                console.log(`[Echo Reddit Driver] Still waiting for Lexical editor... ${i * 0.2}s elapsed`);
            }

            await sleep(200);
        }

        if (commentBox) {
            // NOTE: Removing scrollIntoView - we're already on post detail page
            // and scrolling during comment generation is confusing

            // CRITICAL: Click the comment box to activate it before typing
            // This puts the cursor inside and activates the Lexical editor
            console.log('[Echo Reddit Driver] Clicking comment box to place cursor...');
            commentBox.click();
            await sleep(500);

            // Focus to ensure keyboard events are captured
            commentBox.focus();
            await sleep(300);

            // Double-check we have focus
            if (document.activeElement !== commentBox) {
                console.log('[Echo Reddit Driver] Focus not on comment box, retrying...');
                commentBox.click();
                await sleep(200);
                commentBox.focus();
            }
        } else {
            console.error('[Echo Reddit Driver] Comment box not found after 20 seconds');
            // Debug info
            const composers = document.querySelectorAll('shreddit-composer');
            console.log(`[Echo Reddit Driver] Found ${composers.length} shreddit-composer elements`);
            const lexicalDivs = document.querySelectorAll('div[data-lexical-editor]');
            console.log(`[Echo Reddit Driver] Found ${lexicalDivs.length} lexical editor divs`);
        }

        return commentBox;
    }

    /**
     * Find comment box by piercing Shadow DOMs
     */
    function findCommentBoxInShadowRoots() {
        // Roots to check
        const hosts = document.querySelectorAll('shreddit-composer, shreddit-app, faceplate-form, div[id^="comment-composer"], comment-body-header');

        for (const host of hosts) {
            if (host.shadowRoot) {
                // Check for RTE DIV first
                const rte = host.shadowRoot.querySelector('div[contenteditable="true"][role="textbox"], div[contenteditable="true"]');
                if (rte) return rte;

                const textarea = host.shadowRoot.querySelector('textarea#innerTextArea, textarea[name="text"], textarea');
                if (textarea) return textarea;

                // Nested shadow roots? (Reddit usually shallow, but good to check children)
                const nestedHosts = host.shadowRoot.querySelectorAll('faceplate-form, div, shreddit-composer, reddit-rte');
                for (const nested of nestedHosts) {
                    if (nested.shadowRoot) {
                        const nestedRte = nested.shadowRoot.querySelector('div[contenteditable="true"]');
                        if (nestedRte) return nestedRte;

                        const nestedTextarea = nested.shadowRoot.querySelector('textarea');
                        if (nestedTextarea) return nestedTextarea;
                    }
                    // Sometimes it's just in a slot/light DOM but hidden
                    const slotRte = nested.querySelector && nested.querySelector('div[contenteditable="true"]');
                    if (slotRte) return slotRte;

                    const slotTextarea = nested.querySelector && nested.querySelector('textarea');
                    if (slotTextarea) return slotTextarea;
                }
            } else {
                // Check if it's a light DOM child we missed
                const lightRte = host.querySelector('div[contenteditable="true"]');
                if (lightRte) return lightRte;

                const lightTextarea = host.querySelector('textarea');
                if (lightTextarea) return lightTextarea;
            }
        }
        return null;
    }

    async function generateAndInsertComment(postData, autoSubmit) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: postData,
                platform: 'reddit'
            });

            if (response.error || !response.comment) {
                console.error('[Echo Reddit Driver] AI error:', response.error);
                return false;
            }

            const commentBox = document.querySelector('textarea#innerTextArea, textarea[placeholder*="conversation"]');
            if (commentBox) {
                await typeSlowly(response.comment, commentBox);
            }

            return true;

        } catch (error) {
            console.error('[Echo Reddit Driver] Comment generation error:', error);
            return false;
        }
    }

    // ==================== DUPLICATE PREVENTION ====================

    async function hasAlreadyCommented(postId) {
        try {
            const { [STORAGE_KEY]: commented } = await chrome.storage.local.get(STORAGE_KEY);
            return (commented || []).includes(postId);
        } catch (error) {
            return false;
        }
    }

    async function markAsCommented(postId) {
        try {
            const { [STORAGE_KEY]: existing } = await chrome.storage.local.get(STORAGE_KEY);
            const commented = existing || [];

            if (!commented.includes(postId)) {
                commented.push(postId);
                if (commented.length > 500) commented.shift();
                await chrome.storage.local.set({ [STORAGE_KEY]: commented });
            }
        } catch (error) {
            console.error('[Echo Reddit Driver] Error saving:', error);
        }
    }

    // ==================== UTILITIES ====================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function showNotification(text) {
        const existing = document.querySelector('.echo-status-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'echo-status-notification';
        notification.textContent = text;
        notification.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: #1a1a2e; color: white; padding: 12px 20px;
            border-radius: 8px; z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    async function logActivity(text) {
        try {
            const { activityLog } = await chrome.storage.local.get('activityLog');
            const log = activityLog || [];
            log.unshift({ text, timestamp: Date.now(), platform: 'reddit' });
            if (log.length > 50) log.pop();
            await chrome.storage.local.set({ activityLog: log });
            chrome.runtime.sendMessage({ type: 'ACTIVITY_UPDATE', log }).catch(() => { });
        } catch (error) { }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[Echo Reddit Driver] Module loaded');

})();
