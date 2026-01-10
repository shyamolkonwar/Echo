// Echo Auto-Pilot Driver v4.1
// Fully autonomous LinkedIn scrolling and commenting - HUMAN-LIKE BEHAVIOR
// CRITICAL: Slow, deliberate, with proper pauses and robust posting

class AutoPilotDriver {
    constructor() {
        // State
        this.isRunning = false;
        this.shouldStop = false; // Flag for immediate stop
        this.scrollCount = 0;
        this.commentCount = 0;
        this.startTime = null;

        // Limits (conservative for safety)
        this.maxScrolls = 30;
        this.maxDuration = 15 * 60 * 1000; // 15 minutes
        this.maxCommentsPerSession = 8; // Very conservative

        // SLOW Buffer times (in milliseconds) - HUMAN REALISTIC
        this.BUFFER = {
            beforeScroll: { min: 3000, max: 6000 },         // 3-6 seconds before scroll
            afterScroll: { min: 4000, max: 8000 },          // 4-8 seconds read time
            beforeCommentClick: { min: 2000, max: 4000 },   // 2-4 seconds
            beforeTyping: { min: 1500, max: 3000 },         // 1.5-3 seconds
            duringTyping: { min: 50, max: 150 },            // Per character delay
            beforePostClick: { min: 3000, max: 5000 },      // 3-5 seconds review time
            afterPosting: { min: 10000, max: 20000 },       // 10-20 seconds after posting!
            afterFail: { min: 5000, max: 8000 },            // 5-8 seconds after fail
        };

        // Creator tracking
        this.watchedCreators = [];
        this.processedPosts = new Set();
        this.randomCommentChance = 0.08; // 8% chance for non-watched

        // Scroll tracking
        this.noNewPostsCount = 0;
        this.maxNoNewPosts = 5;
    }

    async init() {
        await this.loadWatchedCreators();

        // Listen for storage changes (for stop signal)
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.watchedCreators) {
                    this.watchedCreators = changes.watchedCreators.newValue || [];
                }
                // Immediate stop when isAutoPilot becomes false
                if (changes.isAutoPilot && changes.isAutoPilot.newValue === false) {
                    console.log('[Echo Driver] STOP signal received from storage');
                    this.shouldStop = true;
                    this.isRunning = false;
                }
            }
        });
    }

    async loadWatchedCreators() {
        const { watchedCreators } = await chrome.storage.local.get('watchedCreators');
        this.watchedCreators = watchedCreators || [];
        console.log('[Echo Driver] Loaded', this.watchedCreators.length, 'watched creators');
    }

    async start() {
        if (this.isRunning) {
            console.log('[Echo Driver] Already running');
            return;
        }

        console.log('[Echo Driver] ====== STARTING AUTO-PILOT v4.1 (ROBUST POSTING) ======');
        this.isRunning = true;
        this.shouldStop = false;
        this.scrollCount = 0;
        this.commentCount = 0;
        this.startTime = Date.now();
        this.noNewPostsCount = 0;
        this.processedPosts.clear();

        await chrome.storage.local.set({ isAutoPilot: true });
        this.showNotification('🐢 Auto-Pilot engaged! Running slow & robust...');

        // Start the main loop
        await this.runMainLoop();
    }

    stop() {
        console.log('[Echo Driver] ====== STOPPING AUTO-PILOT ======');
        console.log(`[Echo Driver] Session: ${this.commentCount} comments, ${this.scrollCount} scrolls`);
        this.isRunning = false;
        this.shouldStop = true;
        chrome.storage.local.set({ isAutoPilot: false });
        this.showNotification(`Stopped. ${this.commentCount} comments posted.`);
    }

    // Check if we should stop - call frequently
    checkShouldStop() {
        if (this.shouldStop || !this.isRunning) {
            console.log('[Echo Driver] Stop condition detected');
            return true;
        }
        return false;
    }

    // ==================== MAIN LOOP ====================
    async runMainLoop() {
        console.log('[Echo Driver] Starting main loop...');

        while (this.isRunning && !this.shouldStop) {
            // Check stop at beginning of each iteration
            if (this.checkShouldStop()) {
                break;
            }

            // Safety limits check
            if (!this.checkSafetyLimits()) {
                break;
            }

            // Step 1: Wait BEFORE scrolling (humans pause to think)
            console.log('[Echo Driver] Pausing before scroll...');
            await this.humanWait('beforeScroll');
            if (this.checkShouldStop()) break;

            // Step 2: Scroll slowly
            const previousPostCount = this.getVisiblePostsCount();
            await this.humanScroll();
            this.scrollCount++;
            console.log(`[Echo Driver] Scroll #${this.scrollCount}`);

            // Step 3: Wait AFTER scrolling (reading time)
            console.log('[Echo Driver] Reading feed...');
            await this.humanWait('afterScroll');
            if (this.checkShouldStop()) break;

            // Step 4: Check for new posts
            const currentPostCount = this.getVisiblePostsCount();
            if (currentPostCount <= previousPostCount) {
                this.noNewPostsCount++;
                console.log(`[Echo Driver] No new posts (${this.noNewPostsCount}/${this.maxNoNewPosts})`);
                if (this.noNewPostsCount >= this.maxNoNewPosts) {
                    this.showNotification('No more new posts. Stopping.');
                    this.stop();
                    break;
                }
            } else {
                this.noNewPostsCount = 0;
            }

            // Step 5: Scan for target
            const target = await this.scanForTargets();
            if (this.checkShouldStop()) break;

            if (target) {
                console.log('[Echo Driver] 🎯 Found target:', target.authorName);

                // Step 6: Process post (SLOW, with all waits)
                const success = await this.processPost(target);

                if (success) {
                    this.commentCount++;
                    console.log(`[Echo Driver] ✅ Comment #${this.commentCount} posted!`);

                    // LONG wait after successful comment
                    console.log('[Echo Driver] 😴 Long pause after posting...');
                    await this.humanWait('afterPosting');
                } else {
                    // Wait after failed attempt too
                    await this.humanWait('afterFail');
                }

                if (this.checkShouldStop()) break;
            }

            // Check session limit
            if (this.commentCount >= this.maxCommentsPerSession) {
                console.log('[Echo Driver] Session limit reached');
                this.showNotification(`🎉 Done! ${this.commentCount} comments posted.`);
                this.stop();
                break;
            }
        }

        console.log('[Echo Driver] Main loop ended');
        this.isRunning = false;
    }

    // Human-like wait with randomness
    async humanWait(bufferType) {
        const buffer = this.BUFFER[bufferType];
        if (!buffer) {
            await this.sleep(2000);
            return;
        }
        const waitTime = this.random(buffer.min, buffer.max);
        console.log(`[Echo Driver] Waiting ${Math.round(waitTime / 1000)}s...`);
        await this.sleep(waitTime);
    }

    // Slow human-like scroll
    async humanScroll() {
        const scrollAmount = this.random(400, 700);

        // Scroll in chunks for more human-like behavior
        const chunks = this.random(2, 4);
        const chunkAmount = Math.floor(scrollAmount / chunks);

        for (let i = 0; i < chunks; i++) {
            if (this.checkShouldStop()) return;

            window.scrollBy({
                top: chunkAmount,
                behavior: 'smooth'
            });
            await this.sleep(this.random(200, 400));
        }
    }

    // ==================== SAFETY CHECKS ====================
    checkSafetyLimits() {
        if (this.scrollCount >= this.maxScrolls) {
            console.log('[Echo Driver] Max scrolls reached');
            this.showNotification('Session limit: Max scrolls');
            this.stop();
            return false;
        }

        if (Date.now() - this.startTime >= this.maxDuration) {
            console.log('[Echo Driver] Max duration reached');
            this.showNotification('Session limit: Time');
            this.stop();
            return false;
        }

        return true;
    }

    getVisiblePostsCount() {
        return document.querySelectorAll('div.feed-shared-update-v2').length;
    }

    // ==================== TARGET SCANNING ====================
    async scanForTargets() {
        const posts = document.querySelectorAll('div.feed-shared-update-v2');

        for (const post of posts) {
            if (this.checkShouldStop()) return null;

            const postId = post.getAttribute('data-urn') || this.generatePostId(post);
            if (this.processedPosts.has(postId)) continue;

            const rect = post.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.top <= window.innerHeight * 0.7;
            if (!isVisible) continue;

            const authorName = this.extractAuthorName(post);
            if (!authorName) continue;

            // Check watched creators
            const matchedCreator = this.watchedCreators.find(creator =>
                authorName.toLowerCase().includes(creator.name.toLowerCase()) ||
                creator.name.toLowerCase().includes(authorName.toLowerCase().split(' ')[0])
            );

            if (matchedCreator) {
                return {
                    element: post,
                    postId,
                    authorName,
                    isWatchedCreator: true,
                    priority: matchedCreator.priority
                };
            }

            // Random chance for non-watched
            if (Math.random() < this.randomCommentChance) {
                return {
                    element: post,
                    postId,
                    authorName,
                    isWatchedCreator: false,
                    priority: 'Random'
                };
            }
        }

        return null;
    }

    extractAuthorName(post) {
        const selectors = [
            '.update-components-actor__name span',
            '.update-components-actor__title span[dir="ltr"]',
            '.feed-shared-actor__name'
        ];

        for (const selector of selectors) {
            const el = post.querySelector(selector);
            if (el && el.innerText.trim()) {
                return el.innerText.trim().split('\n')[0];
            }
        }
        return null;
    }

    extractPostContent(post) {
        const selectors = [
            '.feed-shared-update-v2__description .break-words',
            '.feed-shared-inline-show-more-text',
            '.feed-shared-text-view span[dir="ltr"]',
            '.update-components-text'
        ];

        for (const selector of selectors) {
            const el = post.querySelector(selector);
            if (el && el.innerText.trim()) {
                return el.innerText
                    .replace(/…see more/gi, '')
                    .replace(/see more/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .substring(0, 1500);
            }
        }
        return '';
    }

    generatePostId(post) {
        const index = Array.from(document.querySelectorAll('div.feed-shared-update-v2')).indexOf(post);
        return `echo-auto-${index}-${Date.now()}`;
    }

    // ==================== POST PROCESSING ====================
    async processPost(target) {
        const { element: post, postId, authorName, isWatchedCreator, priority } = target;

        // Mark as processed
        this.processedPosts.add(postId);

        // Extract content
        const content = this.extractPostContent(post);
        if (!content || content.length < 20) {
            console.log('[Echo Driver] Post content too short, skipping');
            return false;
        }

        console.log(`[Echo Driver] Processing: "${authorName}" (${priority})`);
        this.addProcessingIndicator(post);

        try {
            // 1. Wait before clicking comment button
            console.log('[Echo Driver] Preparing to comment...');
            await this.humanWait('beforeCommentClick');
            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(post);
                return false;
            }

            // 2. Open comment box
            const boxOpened = await this.openCommentBox(post);
            if (!boxOpened) {
                console.log('[Echo Driver] Failed to open comment box');
                this.removeProcessingIndicator(post);
                return false;
            }

            // 3. Wait before typing
            console.log('[Echo Driver] Comment box opened, preparing to type...');
            await this.humanWait('beforeTyping');
            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(post);
                return false;
            }

            // 4. Generate comment
            const { quickTone } = await chrome.storage.local.get('quickTone');
            console.log('[Echo Driver] 🤖 Generating comment...');

            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_COMMENT',
                postData: { authorName, content },
                quickTone: quickTone || 'professional'
            });

            if (!response?.comment) {
                console.log('[Echo Driver] Failed to generate:', response?.error);
                this.removeProcessingIndicator(post);
                return false;
            }

            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(post);
                return false;
            }

            // 5. Type comment SLOWLY (character by character)
            console.log('[Echo Driver] ⌨️ Typing comment slowly...');
            await this.typeCommentSlowly(post, response.comment);

            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(post);
                return false;
            }

            // 6. Wait before clicking Post (reviewing)
            console.log('[Echo Driver] 👀 Reviewing comment before posting...');
            await this.humanWait('beforePostClick');

            if (this.checkShouldStop()) {
                this.removeProcessingIndicator(post);
                return false;
            }

            // 7. Click Post button
            console.log('[Echo Driver] 📤 Clicking Post...');
            const posted = await this.clickPostButton();

            // 8. Log locally
            await this.logActivityLocal({
                postPreview: content.substring(0, 50),
                authorName,
                comment: response.comment,
                isWatchedCreator,
                status: posted ? 'Posted' : 'Drafted'
            });

            if (posted) {
                this.showNotification(`✅ Posted on ${authorName}'s post`);
            } else {
                this.showNotification(`⚠️ Drafted for ${authorName} (Click Check Failed)`);
                // Wait longer on fail so user can intervene manually
                await this.sleep(5000);
            }

            this.removeProcessingIndicator(post);
            return posted;

        } catch (error) {
            console.error('[Echo Driver] Error:', error);
            this.removeProcessingIndicator(post);
            return false;
        }
    }

    // ==================== COMMENT BOX ====================
    async openCommentBox(post) {
        let commentBtn = post.querySelector('button[aria-label*="omment"]') ||
            post.querySelector('button.comment-button');

        if (!commentBtn) {
            const buttons = post.querySelectorAll('button');
            for (const btn of buttons) {
                const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
                const text = btn.textContent?.toLowerCase() || '';
                if (label.includes('comment') || text.includes('comment')) {
                    commentBtn = btn;
                    break;
                }
            }
        }

        if (!commentBtn) {
            console.log('[Echo Driver] Comment button not found');
            return false;
        }

        commentBtn.click();
        return await this.waitForEditor(4000);
    }

    async waitForEditor(timeout = 4000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (this.checkShouldStop()) return false;

            const editor = document.querySelector('.ql-editor[contenteditable="true"]') ||
                document.querySelector('div[contenteditable="true"][role="textbox"]');

            if (editor && editor.offsetParent !== null) {
                return true;
            }
            await this.sleep(100);
        }
        return false;
    }

    // Type comment slowly with enhanced event dispatching
    async typeCommentSlowly(post, comment) {
        const editor = document.querySelector('.ql-editor[contenteditable="true"]') ||
            document.querySelector('div[contenteditable="true"][role="textbox"]');

        if (!editor) return;

        editor.focus();
        await this.sleep(300);

        // Clear placeholder
        if (editor.innerHTML === '<p><br></p>' || !editor.innerText.trim()) {
            editor.innerHTML = '';
        }

        // Type character by character with delays
        for (let i = 0; i < comment.length; i++) {
            if (this.checkShouldStop()) break;

            const char = comment[i];
            document.execCommand('insertText', false, char);

            // Random typing delay
            await this.sleep(this.random(30, 80));

            // Occasional longer pause (thinking)
            if (Math.random() < 0.05) {
                await this.sleep(this.random(200, 400));
            }
        }

        // DISPATCH EVENTS - Critical for React/LinkedIn to enable Post button
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        // Small pause after typing
        await this.sleep(1000);

        // Visual feedback
        const form = document.querySelector('.comments-comment-box');
        if (form) {
            form.style.border = '3px solid #10B981';
            form.style.borderRadius = '8px';
            setTimeout(() => { form.style.border = ''; }, 5000);
        }
    }

    // ==================== AUTO-POST ====================
    async clickPostButton() {
        console.log('[Echo Driver] Looking for Post button...');

        // Expanded selectors including Art Deco (LinkedIn standard)
        const postButtonSelectors = [
            'button.comments-comment-box__submit-button',
            'button[data-control-name="submit_comment"]',
            'button[type="submit"][class*="comment"]',
            '.comments-comment-box button[type="submit"]',
            '.comments-comment-texteditor button[type="submit"]',
            'button.artdeco-button--primary',
            'div.comments-comment-box__button-group button'
        ];

        // Retry loop - 5 attempts
        for (let attempt = 1; attempt <= 5; attempt++) {
            if (this.checkShouldStop()) return false;

            let postBtn = null;

            // Strategy 1: Selectors
            for (const selector of postButtonSelectors) {
                const candidates = document.querySelectorAll(selector);
                for (const btn of candidates) {
                    if (btn.offsetParent !== null && !btn.disabled) { // CSS visible and enabled
                        postBtn = btn;
                        break;
                    }
                }
                if (postBtn) break;
            }

            // Strategy 2: Text content fallback
            if (!postBtn) {
                const allButtons = document.querySelectorAll('.comments-comment-box button, .comments-comment-texteditor button, button.artdeco-button');
                for (const btn of allButtons) {
                    const text = btn.textContent?.toLowerCase().trim() || '';
                    if ((text === 'post' || text === 'comment') && !btn.disabled && btn.offsetParent !== null) {
                        postBtn = btn;
                        console.log('[Echo Driver] Found Post button via text:', text);
                        break;
                    }
                }
            }

            if (postBtn && !postBtn.disabled) {
                console.log(`[Echo Driver] 📤 Clicking Post button (Attempt ${attempt})...`);
                postBtn.click();

                // Wait to verify success
                await this.sleep(2000);

                // Check if comment box is gone or clear
                const editor = document.querySelector('.ql-editor[contenteditable="true"]');
                if (!editor || editor.innerText.trim().length === 0) {
                    console.log('[Echo Driver] ✅ Post confirmed success!');
                    return true;
                } else {
                    console.log('[Echo Driver] ⚠️ Clicked but comment box still full. Retrying...');
                }
            } else {
                console.log(`[Echo Driver] Post button not ready/found (Attempt ${attempt}/5)... waiting`);
            }

            // Wait before retry
            await this.sleep(1500);
        }

        console.log('[Echo Driver] ❌ Failed to post after all attempts');
        return false;
    }

    // ==================== LOCAL LOGGING (NO SUPABASE) ====================
    async logActivityLocal(data) {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];
        log.unshift({
            text: `${data.status}: <strong>${data.authorName}</strong>`,
            authorName: data.authorName,
            comment: data.comment,
            status: data.status,
            timestamp: Date.now()
        });
        await chrome.storage.local.set({ activityLog: log.slice(0, 100) });
    }

    // ==================== UI HELPERS ====================
    addProcessingIndicator(post) {
        if (post.querySelector('.echo-auto-indicator')) return;

        const indicator = document.createElement('div');
        indicator.className = 'echo-auto-indicator';
        indicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div class="echo-spinner"></div>
                <span>Processing...</span>
            </div>
        `;
        indicator.style.cssText = `
            position: absolute;
            top: 12px;
            right: 12px;
            padding: 8px 16px;
            background: linear-gradient(135deg, #8B5CF6, #7C3AED);
            color: white;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            font-weight: 500;
            z-index: 1000;
            box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
        `;

        if (!document.getElementById('echo-spinner-styles')) {
            const style = document.createElement('style');
            style.id = 'echo-spinner-styles';
            style.textContent = `
                .echo-spinner {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: echo-spin 0.8s linear infinite;
                }
                @keyframes echo-spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        post.style.position = 'relative';
        post.appendChild(indicator);
    }

    removeProcessingIndicator(post) {
        const indicator = post.querySelector('.echo-auto-indicator');
        if (indicator) indicator.remove();
    }

    showNotification(message) {
        document.querySelectorAll('.echo-driver-notification').forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = 'echo-driver-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 14px 24px;
            background: linear-gradient(135deg, #8B5CF6, #6D28D9);
            color: white;
            border-radius: 12px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
            z-index: 100000;
            animation: slideInUp 0.4s ease;
        `;

        if (!document.getElementById('echo-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'echo-notification-styles';
            style.textContent = `
                @keyframes slideInUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    }

    // ==================== UTILITIES ====================
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

// Export
window.AutoPilotDriver = AutoPilotDriver;
