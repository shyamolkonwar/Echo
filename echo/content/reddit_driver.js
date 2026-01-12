// Echo Chrome Extension - Reddit Driver
// Orchestrates semi-auto and auto-pilot Reddit automation workflows

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
    let scrollInterval = null;

    // ==================== CONSTANTS ====================
    const SCROLL_DELAY = 5000; // 5 seconds between scrolls
    const POST_PROCESS_DELAY = 3000; // 3 seconds after posting
    const STORAGE_KEY = 'reddit_commented_posts';

    // ==================== INITIALIZATION ====================

    async function init() {
        console.log('[Echo Reddit Driver] Initializing...');

        // Load settings
        const settings = await chrome.storage.local.get([
            'isActive', 'platforms', 'reddit_watched_subreddits'
        ]);

        isActive = settings.isActive || false;
        const redditSettings = settings.platforms?.reddit || {};
        isAutoPilot = redditSettings.autopilot || false;
        isSemiAuto = redditSettings.enabled && !isAutoPilot;
        targetSubreddits = settings.reddit_watched_subreddits || redditSettings.subreddits || [];

        console.log('[Echo Reddit Driver] State:', { isActive, isAutoPilot, isSemiAuto, targetSubreddits });

        if (isActive && (isAutoPilot || isSemiAuto)) {
            startFeedObserver();
            if (isAutoPilot) {
                startAutoScroll();
            }
        }

        // Listen for messages from popup
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    function handleMessage(message, sender, sendResponse) {
        if (message.type === 'TOGGLE_ACTIVE') {
            isActive = message.isActive;
            if (isActive && (isAutoPilot || isSemiAuto)) {
                startFeedObserver();
            } else {
                stopAutoScroll();
            }
        }

        if (message.type === 'TOGGLE_AUTOPILOT' && message.platform === 'reddit') {
            isAutoPilot = message.isAutoPilot;
            isSemiAuto = !isAutoPilot;
            if (isAutoPilot) {
                startAutoScroll();
            } else {
                stopAutoScroll();
            }
        }

        if (message.type === 'UPDATE_SUBREDDITS') {
            targetSubreddits = message.subreddits || [];
        }
    }

    // ==================== FEED OBSERVER ====================

    function startFeedObserver() {
        console.log('[Echo Reddit Driver] Starting feed observer...');

        // Use MutationObserver to watch for new posts
        const observer = new MutationObserver((mutations) => {
            if (!isActive || isProcessing) return;

            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const posts = node.matches?.('shreddit-post, article.w-full')
                            ? [node]
                            : node.querySelectorAll?.('shreddit-post, article.w-full') || [];

                        posts.forEach(post => checkPost(post));
                    }
                });
            });
        });

        // Observe feed container
        const feed = document.querySelector('shreddit-feed, div#main-content, main');
        if (feed) {
            observer.observe(feed, { childList: true, subtree: true });
        }

        // Also scan existing posts
        scanExistingPosts();
    }

    async function scanExistingPosts() {
        const posts = document.querySelectorAll('shreddit-post, article.w-full shreddit-post');
        for (const post of posts) {
            if (isProcessing) break;
            await checkPost(post);
        }
    }

    // ==================== POST MATCHING ====================

    async function checkPost(postElement) {
        if (isProcessing) return;

        try {
            // Extract post data
            const postData = window.extractRedditPostData?.(postElement);
            if (!postData) return;

            // Check if already commented
            if (await hasAlreadyCommented(postData.postId)) {
                console.log(`[Echo Reddit Driver] Already commented on ${postData.postId}, skipping`);
                return;
            }

            // Check if subreddit matches target list
            if (targetSubreddits.length > 0) {
                const subredditLower = postData.subreddit.toLowerCase();
                const matchesTarget = targetSubreddits.some(
                    target => target.toLowerCase().replace(/^r\//, '') === subredditLower
                );

                if (!matchesTarget) {
                    return; // Not a target subreddit
                }
            }

            console.log(`[Echo Reddit Driver] Found matching post: ${postData.postId} in r/${postData.subreddit}`);

            if (isAutoPilot) {
                await processPostAutoPilot(postElement, postData);
            } else if (isSemiAuto) {
                showPostNotification(postElement, postData);
            }
        } catch (error) {
            console.error('[Echo Reddit Driver] Error checking post:', error);
        }
    }

    // ==================== SEMI-AUTO MODE ====================

    function showPostNotification(postElement, postData) {
        // Remove any existing notification
        document.querySelector('.echo-reddit-notification')?.remove();

        // Create notification banner
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

        // Style the notification
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
            .echo-notification-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .echo-notification-btn {
                background: white;
                color: #667eea;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .echo-notification-btn:hover {
                transform: scale(1.05);
            }
            .echo-notification-close {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
            }
        `;
        document.head.appendChild(style);

        // Handle button click
        notification.querySelector('.echo-notification-btn').addEventListener('click', () => {
            notification.remove();
            processSemiAutoPost(postElement, postData);
        });

        notification.querySelector('.echo-notification-close').addEventListener('click', () => {
            notification.remove();
        });

        document.body.appendChild(notification);

        // Auto-hide after 15 seconds
        setTimeout(() => notification.remove(), 15000);
    }

    async function processSemiAutoPost(postElement, postData) {
        isProcessing = true;

        try {
            // Click comment button to navigate to post
            const commentButton = postElement.querySelector('a[data-post-click-location="comments-button"]');
            if (commentButton) {
                commentButton.click();
                await sleep(2000); // Wait for page load
            }

            // Wait for comment box and scroll to it
            await scrollToCommentBox();

            // Generate and insert comment (draft only)
            await generateAndInsertComment(postData, false);

            // Mark as processed but NOT commented (user needs to submit)
            console.log('[Echo Reddit Driver] Semi-auto draft complete. User can now edit and submit.');

        } catch (error) {
            console.error('[Echo Reddit Driver] Semi-auto error:', error);
        } finally {
            isProcessing = false;
        }
    }

    // ==================== AUTO-PILOT MODE ====================

    async function processPostAutoPilot(postElement, postData) {
        isProcessing = true;

        try {
            console.log('[Echo Reddit Driver] Starting auto-pilot flow...');

            // Step 1: Click upvote
            const upvoteBtn = postElement.querySelector('button[upvote]');
            if (upvoteBtn) {
                upvoteBtn.click();
                await sleep(500);
                console.log('[Echo Reddit Driver] Upvoted post');
            }

            // Step 2: Click comment button to navigate
            const commentButton = postElement.querySelector('a[data-post-click-location="comments-button"]');
            if (!commentButton) {
                throw new Error('Comment button not found');
            }
            commentButton.click();
            await sleep(2500); // Wait for page to load

            // Step 3: Scroll to comment box
            await scrollToCommentBox();

            // Step 4: Generate and insert comment
            const success = await generateAndInsertComment(postData, true);
            if (!success) {
                throw new Error('Failed to insert comment');
            }

            // Step 5: Submit the comment
            await sleep(1500);
            const submitted = await window.submitRedditComment?.();
            if (!submitted) {
                throw new Error('Failed to submit comment');
            }

            // Step 6: Mark as commented
            await markAsCommented(postData.postId);
            console.log('[Echo Reddit Driver] Saved post ID:', postData.postId);

            // Step 7: Wait and navigate back
            await sleep(POST_PROCESS_DELAY);
            const backButton = document.querySelector('button[aria-label="Back"]');
            if (backButton) {
                backButton.click();
                console.log('[Echo Reddit Driver] Navigated back to feed');
            }

            // Log activity
            logActivity(`Commented on r/${postData.subreddit}`);

        } catch (error) {
            console.error('[Echo Reddit Driver] Auto-pilot error:', error);
        } finally {
            isProcessing = false;
        }
    }

    // ==================== COMMENT GENERATION ====================

    async function scrollToCommentBox() {
        // Wait for comment box to appear
        let commentBox = null;
        for (let i = 0; i < 20; i++) {
            commentBox = document.querySelector('textarea#innerTextArea, textarea[placeholder*="conversation"], div[contenteditable="true"][role="textbox"]');
            if (commentBox) break;
            await sleep(250);
        }

        if (commentBox) {
            commentBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500);
            commentBox.focus();
        }

        return commentBox;
    }

    async function generateAndInsertComment(postData, autoSubmit) {
        try {
            // Request comment from background script
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: postData,
                platform: 'reddit'
            });

            if (response.error) {
                console.error('[Echo Reddit Driver] AI error:', response.error);
                return false;
            }

            const comment = response.comment;
            if (!comment) {
                console.error('[Echo Reddit Driver] No comment generated');
                return false;
            }

            // Insert the comment
            const inserted = await window.insertRedditComment?.(null, comment);
            return inserted;

        } catch (error) {
            console.error('[Echo Reddit Driver] Comment generation error:', error);
            return false;
        }
    }

    // ==================== AUTO-SCROLL ====================

    function startAutoScroll() {
        if (scrollInterval) return;

        console.log('[Echo Reddit Driver] Starting auto-scroll...');

        scrollInterval = setInterval(() => {
            if (!isActive || !isAutoPilot || isProcessing) return;

            // Smooth scroll down
            window.scrollBy({ top: 600, behavior: 'smooth' });

        }, SCROLL_DELAY);
    }

    function stopAutoScroll() {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
            console.log('[Echo Reddit Driver] Stopped auto-scroll');
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

                // Keep only last 500 post IDs to prevent storage bloat
                if (commented.length > 500) {
                    commented.shift();
                }

                await chrome.storage.local.set({ [STORAGE_KEY]: commented });
            }
        } catch (error) {
            console.error('[Echo Reddit Driver] Error saving commented post:', error);
        }
    }

    // ==================== UTILITIES ====================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function logActivity(text) {
        try {
            const { activityLog } = await chrome.storage.local.get('activityLog');
            const log = activityLog || [];
            log.unshift({ text, timestamp: Date.now(), platform: 'reddit' });

            // Keep only last 50 entries
            if (log.length > 50) log.pop();

            await chrome.storage.local.set({ activityLog: log });

            // Notify popup if open
            chrome.runtime.sendMessage({ type: 'ACTIVITY_UPDATE', log }).catch(() => { });
        } catch (error) {
            // Ignore
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[Echo Reddit Driver] Module loaded');

})();
