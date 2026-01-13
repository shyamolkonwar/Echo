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
        console.log(`[Echo Reddit Driver] Element type: ${element.tagName}, ID: ${element.id}`);

        // Verify it's a textarea
        if (element.tagName.toLowerCase() !== 'textarea') {
            console.error('[Echo Reddit Driver] typeSlowly requires a TEXTAREA element, got:', element.tagName);
            return;
        }

        element.focus();
        await sleep(random(300, 600));

        // Clear existing content
        element.value = '';

        // Type character by character
        let typedChars = 0;
        for (let i = 0; i < text.length; i++) {
            if (shouldStop) break;

            const char = text[i];
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));

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

        console.log(`[Echo Reddit Driver] Typed ${typedChars} characters into textarea`);
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

            // Step 5: Scroll to comment box
            const commentBox = await scrollToCommentBox();
            if (!commentBox) {
                console.error('[Echo Reddit Driver] Comment box not found');
                return false;
            }

            // Step 6: Thinking pause before typing
            await humanWait('beforeTyping');
            if (shouldStop) return false;

            // Step 7: Generate comment
            console.log('[Echo Reddit Driver] Requesting AI comment generation...');
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: postData,
                platform: 'reddit'
            });

            if (response.error || !response.comment) {
                console.error('[Echo Reddit Driver] AI generation failed:', response.error);
                return false;
            }

            console.log('[Echo Reddit Driver] AI generated comment:', response.comment.substring(0, 100) + '...');

            // Step 8: Type comment SLOWLY (character by character)
            console.log('[Echo Reddit Driver] Starting to type comment...');
            await typeSlowly(response.comment, commentBox);
            console.log('[Echo Reddit Driver] Finished typing comment');
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

        // Wait with timeout - ONLY target TEXTAREA, not contenteditable DIVs
        for (let i = 0; i < 30; i++) {
            // Priority order: specific ID first, then by placeholder
            commentBox = document.querySelector('textarea#innerTextArea') ||
                document.querySelector('textarea[name="text"]') ||
                document.querySelector('textarea[placeholder*="conversation"]') ||
                document.querySelector('shreddit-composer textarea');

            if (commentBox) {
                console.log('[Echo Reddit Driver] Found comment box:', commentBox.id || commentBox.name || commentBox.tagName);
                break;
            }
            await sleep(200);
        }

        if (commentBox) {
            commentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(random(500, 1000));
            commentBox.focus();
        } else {
            console.error('[Echo Reddit Driver] Comment box (textarea) not found after 6 seconds');
        }

        return commentBox;
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
