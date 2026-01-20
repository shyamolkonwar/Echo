// Echo X (Twitter) Auto-Pilot Driver v1.0
// Fully autonomous X scrolling and commenting - HUMAN-LIKE BEHAVIOR
// Adapted from LinkedIn driver for X's modal-based UI

class XAutoPilotDriver {
    constructor() {
        // State
        this.isRunning = false;
        this.shouldStop = false;
        this.scrollCount = 0;
        this.commentCount = 0;
        this.startTime = null;

        // Current processing
        this.currentTweet = null;
        this.currentModal = null;
        this.processedTweets = new Set();

        // Safety limits
        this.MAX_POSTS_PER_SESSION = 20;
        this.MAX_POSTS_PER_HOUR = 10;
        this.MIN_DELAY_BETWEEN_POSTS = 3 * 60 * 1000; // 3 minutes
        this.lastCommentTime = 0;

        // X-specific selectors
        this.SELECTORS = {
            tweet: 'article[data-testid="tweet"]',
            replyButton: 'div[data-testid="reply"]',
            replyModal: '[role="dialog"][aria-labelledby]',
            textarea: 'div[data-testid="tweetTextarea_0"]',
            postButton: 'div[data-testid="tweetButton"]',
            closeModal: 'div[data-testid="app-bar-close"]',
            promotedLabel: '[data-testid="placementTracking"]'
        };

        // Human-like timing (milliseconds)
        this.TIMING = {
            scroll: { min: 2000, max: 4000 },
            beforeReply: { min: 1000, max: 3000 },
            beforeTyping: { min: 800, max: 1500 },
            typing: { min: 30, max: 100 }, // per character
            beforePost: { min: 2000, max: 4000 },
            afterPost: { min: 3000, max: 5000 }
        };
    }

    // ==================== INITIALIZATION ====================

    async init() {
        console.log('[X Autopilot] Initializing...');
        await this.loadProcessedTweets();

        // Listen for storage changes to detect stop signal
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.isActive) {
                if (changes.isActive.newValue === false) {
                    console.log('[X Autopilot] Received stop signal');
                    this.shouldStop = true;
                }
            }
        });
    }

    async loadProcessedTweets() {
        try {
            const data = await chrome.storage.local.get('x_commented_tweets');
            if (data.x_commented_tweets) {
                this.processedTweets = new Set(data.x_commented_tweets);
            }
        } catch (error) {
            console.error('[X Autopilot] Error loading processed tweets:', error);
        }
    }

    // ==================== START/STOP ====================

    async start() {
        if (this.isRunning) {
            console.log('[X Autopilot] Already running');
            return;
        }

        console.log('[X Autopilot] Starting autonomous mode...');
        this.isRunning = true;
        this.shouldStop = false;
        this.startTime = Date.now();
        this.commentCount = 0;
        this.scrollCount = 0;

        // isActive is already set by the popup, don't set it again
        this.showNotification('🤖 X Autopilot activated');

        // Start main loop
        this.runMainLoop().catch(error => {
            console.error('[X Autopilot] Fatal error:', error);
            this.stop();
        });
    }

    stop() {
        console.log('[X Autopilot] Stopping...');
        this.isRunning = false;
        this.shouldStop = true;
        this.currentTweet = null;
        this.currentModal = null;

        // Don't set isActive false - let the popup manage this state
        this.showNotification('⏸️ X Autopilot stopped');
    }

    checkShouldStop() {
        return this.shouldStop || !this.isRunning;
    }

    // ==================== MAIN LOOP ====================

    async runMainLoop() {
        console.log('[X Autopilot] Main loop started');

        while (this.isRunning && !this.shouldStop) {
            try {
                // Safety checks
                if (!this.checkSafetyLimits()) {
                    console.log('[X Autopilot] Safety limits reached');
                    this.stop();
                    break;
                }

                if (this.checkShouldStop()) break;

                // Scan for target tweets
                const targets = await this.scanForTargets();

                if (targets.length > 0) {
                    console.log(`[X Autopilot] Found ${targets.length} potential targets`);

                    // Process first target
                    const success = await this.processPost(targets[0]);

                    if (success) {
                        this.commentCount++;
                        this.lastCommentTime = Date.now();

                        // Wait before next action
                        await this.humanWait('afterPost');
                    }
                } else {
                    console.log('[X Autopilot] No targets found, scrolling...');
                }

                if (this.checkShouldStop()) break;

                // Human-like scroll
                await this.humanScroll();
                this.scrollCount++;

                // Breathing room between cycles
                await this.sleep(this.random(1000, 2000));

            } catch (error) {
                console.error('[X Autopilot] Loop error:', error);
                await this.sleep(5000); // Wait before retry
            }
        }

        console.log('[X Autopilot] Main loop ended');
        this.isRunning = false;
    }

    // ==================== HUMAN-LIKE BEHAVIOR ====================

    async humanWait(type) {
        const timing = this.TIMING[type] || { min: 1000, max: 2000 };
        const delay = this.random(timing.min, timing.max);
        await this.sleep(delay);
    }

    async humanScroll() {
        // Scroll by a random amount
        const scrollDistance = this.random(300, 600);
        window.scrollBy({
            top: scrollDistance,
            behavior: 'smooth'
        });

        await this.humanWait('scroll');
    }

    // ==================== SAFETY CHECKS ====================

    checkSafetyLimits() {
        const runtime = Date.now() - this.startTime;
        const runtimeHours = runtime / (1000 * 60 * 60);

        // Max posts per session
        if (this.commentCount >= this.MAX_POSTS_PER_SESSION) {
            this.showNotification('⏸️ Session limit reached');
            return false;
        }

        // Max posts per hour
        if (runtimeHours > 0 && (this.commentCount / runtimeHours) > this.MAX_POSTS_PER_HOUR) {
            this.showNotification('⏸️ Hourly limit reached');
            return false;
        }

        // Min delay between posts
        const timeSinceLastComment = Date.now() - this.lastCommentTime;
        if (this.lastCommentTime > 0 && timeSinceLastComment < this.MIN_DELAY_BETWEEN_POSTS) {
            return false; // Just wait, don't stop
        }

        return true;
    }

    // ==================== TARGET SCANNING ====================

    async scanForTargets() {
        const tweets = document.querySelectorAll(this.SELECTORS.tweet);
        const targets = [];

        for (const tweet of tweets) {
            if (this.checkShouldStop()) break;

            // Skip if already processed
            const tweetId = this.generateTweetId(tweet);
            if (this.processedTweets.has(tweetId)) continue;

            // Skip ads
            if (this.isAdTweet(tweet)) {
                console.log('[X Autopilot] Skipping ad tweet');
                continue;
            }

            // Check if tweet is visible
            const rect = tweet.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > window.innerHeight) continue;

            // Extract content
            const content = this.extractTweetContent(tweet);
            if (!content || content.length < 20) continue;

            // Valid target
            targets.push({
                element: tweet,
                tweetId: tweetId,
                content: content
            });

            // Limit scan to 3 targets at a time
            if (targets.length >= 3) break;
        }

        return targets;
    }

    isAdTweet(tweet) {
        // Check for promoted label
        const promotedLabel = tweet.querySelector(this.SELECTORS.promotedLabel);
        if (promotedLabel) return true;

        // Check for "Ad" or "Promoted" text
        const tweetText = tweet.textContent.toLowerCase();
        if (tweetText.includes('promoted') || tweetText.includes('·ad·')) {
            return true;
        }

        return false;
    }

    extractTweetContent(tweet) {
        try {
            // Use existing extraction logic
            if (window.extractXTweetData) {
                const data = window.extractXTweetData(tweet);
                return data?.content || '';
            }

            // Fallback
            const textElement = tweet.querySelector('[data-testid="tweetText"]');
            return textElement?.textContent?.trim() || '';
        } catch (error) {
            console.error('[X Autopilot] Error extracting content:', error);
            return '';
        }
    }

    generateTweetId(tweet) {
        // Try to get tweet ID from URL or data attributes
        const link = tweet.querySelector('a[href*="/status/"]');
        if (link) {
            const match = link.href.match(/\/status\/(\d+)/);
            if (match) return match[1];
        }

        // Fallback to content hash
        const content = this.extractTweetContent(tweet);
        return this.hashString(content);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'x_' + Math.abs(hash).toString(36);
    }

    // ==================== POST PROCESSING ====================

    async processPost(target) {
        const { element: tweet, tweetId, content } = target;

        // Mark as processed immediately
        this.processedTweets.add(tweetId);
        await this.saveTweetId(tweetId);

        this.currentTweet = tweet;
        this.addProcessingIndicator(tweet);

        try {
            // 1. Wait before clicking reply (reading the tweet)
            await this.humanWait('beforeReply');
            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 2. Click reply button and wait for modal
            const modalOpened = await this.openReplyModal(tweet);
            if (!modalOpened) {
                console.log('[X Autopilot] Could not open reply modal');
                this.removeProcessingIndicator(tweet);
                return false;
            }

            if (this.checkShouldStop()) {
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 3. Wait before typing (thinking)
            await this.humanWait('beforeTyping');
            if (this.checkShouldStop()) {
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 4. Generate comment
            const tweetData = window.extractXTweetData ? window.extractXTweetData(tweet) : { content };
            const { xQuickTone } = await chrome.storage.local.get('xQuickTone');

            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: tweetData,
                platform: 'x',
                quickTone: xQuickTone || 'shitposter'
            });

            if (!response?.comment) {
                console.log('[X Autopilot] No comment generated');
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            if (this.checkShouldStop()) {
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 5. Type comment slowly
            await this.typeCommentSlowly(response.comment);

            if (this.checkShouldStop()) {
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 6. Wait before posting (reviewing)
            await this.humanWait('beforePost');

            if (this.checkShouldStop()) {
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

            // 7. Click Post button
            const posted = await this.clickPostButton();

            if (posted) {
                this.showNotification(`✅ Posted reply to tweet`);
                this.removeProcessingIndicator(tweet);
                this.currentTweet = null;
                this.currentModal = null;
                return true;
            } else {
                console.log('[X Autopilot] Failed to post');
                await this.closeReplyModal();
                this.removeProcessingIndicator(tweet);
                return false;
            }

        } catch (error) {
            console.error('[X Autopilot] Error processing post:', error);
            await this.closeReplyModal();
            this.removeProcessingIndicator(tweet);
            this.currentTweet = null;
            this.currentModal = null;
            return false;
        }
    }

    // ==================== MODAL INTERACTION ====================

    async openReplyModal(tweet) {
        // Find reply button
        const replyButton = tweet.querySelector(this.SELECTORS.replyButton);
        if (!replyButton) {
            console.log('[X Autopilot] Reply button not found');
            return false;
        }

        // Click reply button
        replyButton.click();
        await this.sleep(500);

        // Wait for modal to appear
        for (let i = 0; i < 20; i++) {
            const modal = document.querySelector(this.SELECTORS.replyModal);
            if (modal) {
                this.currentModal = modal;
                console.log('[X Autopilot] Reply modal opened');

                // Wait for textarea to be ready
                await this.sleep(500);
                const textarea = modal.querySelector(this.SELECTORS.textarea);
                if (textarea) {
                    return true;
                }
            }
            await this.sleep(200);
        }

        console.log('[X Autopilot] Modal did not appear');
        return false;
    }

    async closeReplyModal() {
        try {
            const closeButton = document.querySelector(this.SELECTORS.closeModal);
            if (closeButton) {
                closeButton.click();
                await this.sleep(500);
            }
            this.currentModal = null;
        } catch (error) {
            console.error('[X Autopilot] Error closing modal:', error);
        }
    }

    async typeCommentSlowly(comment) {
        // Find textarea
        let textarea = null;

        if (this.currentModal) {
            textarea = this.currentModal.querySelector(this.SELECTORS.textarea);
        }

        if (!textarea) {
            textarea = document.querySelector(this.SELECTORS.textarea);
        }

        if (!textarea) {
            console.log('[X Autopilot] Textarea not found');
            return false;
        }

        // Focus textarea
        textarea.click();
        textarea.focus();
        await this.sleep(200);

        // Type character by character
        for (let i = 0; i < comment.length; i++) {
            if (this.checkShouldStop()) break;

            const char = comment[i];

            // Use execCommand for typing
            document.execCommand('insertText', false, char);

            // Random typing delay
            const delay = this.random(this.TIMING.typing.min, this.TIMING.typing.max);
            await this.sleep(delay);

            // Occasional thinking pause
            if (Math.random() < 0.05) {
                await this.sleep(this.random(200, 500));
            }
        }

        // Dispatch events to trigger React updates
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

        // Wait for UI to update (Post button to enable)
        await this.sleep(1000);

        console.log('[X Autopilot] Typed comment');
        return true;
    }

    async clickPostButton() {
        // Find Post button
        let postButton = null;

        // Try primary selector
        if (this.currentModal) {
            postButton = this.currentModal.querySelector(this.SELECTORS.postButton);
        }

        // Fallback to global
        if (!postButton) {
            postButton = document.querySelector(this.SELECTORS.postButton);
        }

        // Text-based fallback
        if (!postButton) {
            const buttons = document.querySelectorAll('button, div[role="button"]');
            for (const btn of buttons) {
                const text = btn.textContent?.toLowerCase().trim();
                if (text === 'post' || text === 'reply') {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        postButton = btn;
                        break;
                    }
                }
            }
        }

        if (!postButton) {
            console.log('[X Autopilot] Post button not found');
            return false;
        }

        // Check if button is disabled
        if (postButton.getAttribute('aria-disabled') === 'true' || postButton.disabled) {
            console.log('[X Autopilot] Post button is disabled');
            await this.sleep(1000);

            // Retry once
            if (postButton.getAttribute('aria-disabled') === 'true' || postButton.disabled) {
                console.log('[X Autopilot] Post button still disabled after wait');
                return false;
            }
        }

        // Click Post button
        console.log('[X Autopilot] Clicking Post button');
        postButton.click();

        // Wait and verify posting
        await this.sleep(1000);

        // Verification: Check if modal closed (success indicator)
        const modalStillExists = document.querySelector(this.SELECTORS.replyModal);

        if (!modalStillExists) {
            console.log('[X Autopilot] Modal closed - post successful');
            return true;
        }

        // Check for error messages
        const errorElements = document.querySelectorAll('[role="alert"], [data-testid="error"]');
        if (errorElements.length > 0) {
            console.log('[X Autopilot] Error detected after posting');
            return false;
        }

        // Wait a bit more and check again
        await this.sleep(2000);
        const modalAfterWait = document.querySelector(this.SELECTORS.replyModal);

        if (!modalAfterWait) {
            console.log('[X Autopilot] Modal closed after delay - post successful');
            return true;
        }

        console.log('[X Autopilot] Modal still open - post may have failed');
        return false;
    }

    // ====================

    async saveTweetId(tweetId) {
        try {
            const data = await chrome.storage.local.get('x_commented_tweets');
            const tweets = data.x_commented_tweets || [];
            tweets.push(tweetId);
            await chrome.storage.local.set({ x_commented_tweets: tweets });
        } catch (error) {
            console.error('[X Autopilot] Error saving tweet ID:', error);
        }
    }

    // ==================== UTILITIES ====================

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    addProcessingIndicator(tweet) {
        tweet.style.border = '3px solid #1d9bf0';
        tweet.style.borderRadius = '16px';
        tweet.style.transition = 'all 0.3s ease';
    }

    removeProcessingIndicator(tweet) {
        if (tweet) {
            tweet.style.border = '';
            tweet.style.borderRadius = '';
        }
    }

    showNotification(message) {
        const existing = document.querySelector('.echo-x-autopilot-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'echo-x-autopilot-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #1d9bf0;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(29, 155, 240, 0.4);
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            animation: slideIn 0.3s ease;
        `;

        // Add animation
        if (!document.querySelector('#echo-notification-style')) {
            const style = document.createElement('style');
            style.id = 'echo-notification-style';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

// Export
window.XAutoPilotDriver = XAutoPilotDriver;
console.log('[X Autopilot] Driver class loaded');
