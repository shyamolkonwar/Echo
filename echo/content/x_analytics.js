// Echo Chrome Extension - X (Twitter) Analytics Sidebar
// Implements the "Interceptor Strategy" for client-side analytics

(function () {
    'use strict';

    // Only run on X/Twitter
    if (window.ECHO_PLATFORM !== 'x') return;

    console.log('[Echo X Analytics] Loading...');

    // State
    const STATE = {
        isOpen: false,
        currentHandle: null,
        currentUserId: null,
        session: null,
        queryIds: {},
        tweets: [],
        filter: 'recent', // 'recent' or 'all-time'
        isLoading: false
    };

    // Constants
    const SELECTORS = {
        profileHeaderItems: '[data-testid="UserProfileHeader_Items"]',
        mainBundleScript: 'script[src*="main."][src*=".js"]'
    };

    // ==================== INITIALIZATION ====================

    function init() {
        console.log('[Echo X Analytics] Initializing...');

        // Watch for URL changes (SPA navigation)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                handleUrlChange();
            }
        }).observe(document, { subtree: true, childList: true });

        // Initial check
        handleUrlChange();

        // Inject Sidebar Host (Hidden initially)
        injectSidebar();

        // Check for session immediately
        refreshSession();

        // Periodic injection check for button
        setInterval(checkAndInjectTrigger, 1000);
    }

    async function refreshSession() {
        const data = await chrome.storage.local.get('x_session');
        if (data && data.x_session) {
            STATE.session = data.x_session;
        } else {
            console.warn('[Echo X Analytics] No session found. Please browse X to capture headers.');
        }
    }

    function handleUrlChange() {
        // Check if we are on a profile page
        // Pattern: x.com/username (and not /home, /explore, etc)
        const path = window.location.pathname.split('/')[1];
        const reservedPaths = ['home', 'explore', 'notifications', 'messages', 'i', 'compose', 'search', 'settings'];

        if (path && !reservedPaths.includes(path)) {
            STATE.currentHandle = path;
            checkAndInjectTrigger();
        } else {
            STATE.currentHandle = null;
        }
    }

    // ==================== UI INJECTION ====================

    function checkAndInjectTrigger() {
        if (!STATE.currentHandle) return;

        const headerItems = document.querySelector(SELECTORS.profileHeaderItems);
        if (!headerItems || headerItems.querySelector('.echo-analyze-btn')) return;

        // Inject "Analyze" Button
        const btn = document.createElement('button');
        btn.className = 'echo-analyze-btn css-175oi2r r-sdzlij r-1phboty r-rs99b7 r-lrvibr r-15ysp7h r-4wgw6l r-3pj75a r-1loqt21 r-o7ynqc r-6416eg r-1ny4l3l';
        btn.style.cssText = `
            background-color: rgba(0, 0, 0, 0);
            border-color: rgb(83, 100, 113);
            border-width: 1px;
            border-style: solid;
            min-width: 36px;
            min-height: 36px;
            outline-style: none;
            padding-left: 16px;
            padding-right: 16px;
            margin-right: 8px; /* Space from Follow button */
            cursor: pointer;
            margin-left: 8px;
        `;

        // Icon + Text
        btn.innerHTML = `
            <div class="css-1rynq56 r-bcqeeo r-qvutc0" style="text-overflow: unset; color: rgb(239, 243, 244);">
                <span class="css-1qaijid r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-qvutc0" style="text-overflow: unset;">
                    <span style="font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">⚡ Analyze</span>
                </span>
            </div>
        `;

        btn.addEventListener('click', () => toggleSidebar(true));

        // Insert as first item or before specific buttons
        headerItems.insertBefore(btn, headerItems.firstChild);
    }

    function injectSidebar() {
        if (document.getElementById('echo-sidebar-host')) return;

        const host = document.createElement('div');
        host.id = 'echo-sidebar-host';
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });

        // CSS
        const style = document.createElement('style');
        style.textContent = `
            /* --- LAYOUT & ANIMATION --- */
            :host {
                --bg-color: #000000;
                --card-bg: #16181C;
                --text-primary: #E7E9EA;
                --text-secondary: #71767B;
                --accent: #1D9BF0; /* Twitter Blue */
                --border: #2F3336;
            }

            .echo-sidebar {
                position: fixed;
                top: 0;
                right: 0;
                width: 400px;
                height: 100vh;
                background: var(--bg-color);
                border-left: 1px solid var(--border);
                z-index: 2147483647; /* Max Z-Index */
                display: flex;
                flex-direction: column;
                transform: translateX(100%); /* Hidden by default */
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: -10px 0 30px rgba(0,0,0,0.5);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }

            .echo-sidebar.open {
                transform: translateX(0);
            }

            /* --- HEADER --- */
            .sidebar-header {
                padding: 16px;
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(0,0,0,0.8);
                backdrop-filter: blur(10px);
            }

            .user-info h2 {
                color: var(--text-primary);
                font-size: 18px;
                margin: 0;
                font-weight: 700;
            }

            .close-btn {
                background: none;
                border: none;
                color: var(--text-secondary);
                font-size: 24px;
                cursor: pointer;
            }

            /* --- TABS --- */
            .filter-tabs {
                display: flex;
                padding: 12px 16px;
                gap: 10px;
                border-bottom: 1px solid var(--border);
            }

            .tab {
                background: transparent;
                border: none;
                color: var(--text-secondary);
                font-weight: 600;
                padding: 8px 12px;
                cursor: pointer;
                border-radius: 20px;
                transition: all 0.2s;
            }

            .tab.active {
                background: rgba(29, 155, 240, 0.1);
                color: var(--accent);
            }

            /* --- CARD DESIGN --- */
            .content-scroll-area {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }

            .tweet-card {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid transparent;
                transition: border-color 0.2s;
            }

            .tweet-card:hover {
                border-color: var(--border);
            }

            .tweet-meta {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: var(--text-secondary);
                margin-bottom: 8px;
            }

            .score {
                color: #00BA7C; /* Green for success */
                font-weight: 700;
            }

            .tweet-text {
                color: var(--text-primary);
                font-size: 14px;
                line-height: 1.5;
                margin-bottom: 12px;
                white-space: pre-wrap; /* Preserve newlines */
            }

            .tweet-metrics {
                display: flex;
                gap: 16px;
                font-size: 13px;
                color: var(--text-secondary);
                margin-bottom: 12px;
            }

            /* --- ACTION BUTTON --- */
            .action-btn {
                width: 100%;
                padding: 10px;
                background: var(--text-primary);
                color: black;
                border: none;
                border-radius: 20px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: opacity 0.2s;
            }

            .action-btn:hover {
                opacity: 0.9;
            }

            /* --- FOOTER --- */
            .sidebar-footer {
                padding: 12px;
                border-top: 1px solid var(--border);
                background: var(--bg-color);
            }

            .limit-bar {
                font-size: 11px;
                color: var(--text-secondary);
            }

            .progress-track {
                height: 4px;
                background: var(--border);
                border-radius: 2px;
                margin-top: 6px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                background: var(--accent);
            }
            
            /* SKELETON LOADER */
            .skeleton-card {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
            }
            .sk-line {
                height: 12px;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                margin-bottom: 8px;
                animation: pulse 1.5s infinite;
            }
            .width-70 { width: 70%; }
            .width-100 { width: 100%; }
            .width-40 { width: 40%; }
            
            @keyframes pulse {
                0% { opacity: 0.3; }
                50% { opacity: 0.7; }
                100% { opacity: 0.3; }
            }
            
            .empty-state {
                text-align: center;
                color: var(--text-secondary);
                margin-top: 40px;
            }
        `;
        shadow.appendChild(style);

        // HTML
        const container = document.createElement('div');
        container.className = 'echo-sidebar';
        container.innerHTML = `
            <header class="sidebar-header">
                <div class="user-info">
                    <h2 id="target-name">@...</h2>
                    <span class="badge" style="color: var(--text-secondary); font-size: 12px;">Top Posts</span>
                </div>
                <button class="close-btn" id="close-sidebar">×</button>
            </header>

            <div class="filter-tabs">
                <button class="tab active" data-filter="recent">Recent Viral</button>
                <button class="tab" data-filter="all-time">All Time</button>
            </div>

            <div class="content-scroll-area" id="tweets-container">
                <!-- Content injected here -->
            </div>

            <footer class="sidebar-footer">
                <div class="limit-bar">
                    <span>Safe Mode Active</span>
                    <div class="progress-track"><div class="progress-fill" style="width: 100%"></div></div>
                </div>
            </footer>
        `;
        shadow.appendChild(container);

        // Bind Events in Shadow DOM
        const closeBtn = container.querySelector('#close-sidebar');
        closeBtn.addEventListener('click', () => toggleSidebar(false));

        const tabs = container.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                STATE.filter = e.target.dataset.filter;
                renderTweets(); // Re-render with new filter
            });
        });

        // Ghost Reply Click Handler
        container.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn')) {
                const btn = e.target.closest('.action-btn');
                const tweetId = btn.dataset.tweetId;

                // Close Sidebar
                toggleSidebar(false);

                // Navigate
                window.location.href = `/${STATE.currentHandle}/status/${tweetId}`;

                // Wait for Nav, then we can assume user might want to generate.
                // We don't auto-trigger generation messages yet as the page reloads.
                // But user can click the manual button once there.
            }
        });

        STATE.shadowRoot = shadow;
        STATE.sidebarEl = container;
    }

    // ==================== LOGIC ====================

    async function toggleSidebar(open) {
        if (!STATE.shadowRoot) return;

        STATE.isOpen = open;
        const sidebar = STATE.sidebarEl;

        if (open) {
            sidebar.classList.add('open');
            STATE.shadowRoot.getElementById('target-name').textContent = `@${STATE.currentHandle}`;

            // Only scrape if different handle or empty
            if (STATE.tweets.length === 0 || STATE.currentUserId !== STATE.lastScrapedHandle) {
                // Clear UI
                renderLoading();

                // Start Scraping
                try {
                    await startScraping();
                    STATE.lastScrapedHandle = STATE.currentHandle;
                } catch (e) {
                    console.error('[Echo X Analytics] Scraping error:', e);
                    renderError(e.message);
                }
            }
        } else {
            sidebar.classList.remove('open');
        }
    }

    async function startScraping() {
        if (!STATE.session) await refreshSession();
        if (!STATE.session) {
            throw new Error('Missing session. Please browse your X home feed first.');
        }

        // 1. Get Query IDs if needed
        if (!STATE.queryIds.UserTweets) {
            await extractQueryIds();
        }

        // 2. Get User ID
        const userId = await fetchUserId(STATE.currentHandle);
        STATE.currentUserId = userId;

        // 3. Fetch Tweets
        const rawTweets = await fetchUserTweets(userId);

        // 4. Process & Score
        STATE.tweets = processTweets(rawTweets);

        // 5. Render
        renderTweets();
    }

    // ==================== API INTERCEPTOR ====================

    async function extractQueryIds() {
        // Fetch main.js bundle to find current Query IDs
        // Heuristic: search DOM for script tags
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const mainScript = scripts.find(s => s.src.includes('main.') && s.src.includes('.js'));

        if (!mainScript) throw new Error('Could not find main.js bundle');

        console.log('[Echo X Analytics] Fetching main bundle:', mainScript.src);
        const response = await fetch(mainScript.src);
        const text = await response.text();

        // Regex to find Query IDs
        // Support both orders: {queryId, operationName} and {operationName, queryId}
        const findId = (text, opName) => {
            const regex1 = new RegExp(`queryId:"([^"]+)",operationName:"${opName}"`);
            const match1 = text.match(regex1);
            if (match1) return match1[1];

            const regex2 = new RegExp(`operationName:"${opName}",queryId:"([^"]+)"`);
            const match2 = text.match(regex2);
            if (match2) return match2[1];

            return null;
        };

        STATE.queryIds.UserTweets = findId(text, "UserTweets");
        STATE.queryIds.UserByScreenName = findId(text, "UserByScreenName");

        console.log('[Echo X Analytics] Extracted Query IDs:', STATE.queryIds);

        if (!STATE.queryIds.UserTweets) throw new Error('Failed to extract UserTweets Query ID');
    }

    async function fetchUserId(handle) {
        const queryId = STATE.queryIds.UserByScreenName;
        // If we failed to get ID, we might have to hardcode a fallback or fail
        // Fallback Ids often change.

        const variables = { "screen_name": handle, "withSafetyModeUserFields": true };
        const features = { "hidden_profile_likes_enabled": true, "hidden_profile_subscriptions_enabled": true, "responsive_web_graphql_exclude_directive_enabled": true, "verified_phone_label_enabled": false, "subscriptions_verification_info_is_identity_verified_enabled": true, "subscriptions_verification_info_verified_since_enabled": true, "highlights_tweets_tab_ui_enabled": true, "responsive_web_twitter_article_notes_tab_enabled": true, "creator_subscriptions_tweet_preview_api_enabled": true, "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false, "responsive_web_graphql_timeline_navigation_enabled": true };

        const url = `https://x.com/i/api/graphql/${queryId}/UserByScreenName?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;

        const data = await makeAuthorizedRequest(url);
        return data.data.user.result.rest_id;
    }

    async function fetchUserTweets(userId) {
        const queryId = STATE.queryIds.UserTweets;
        let allTweets = [];
        let cursor = null;
        const MAX_PAGES = 3; // roughly 120 tweets

        for (let i = 0; i < MAX_PAGES; i++) {
            const variables = {
                "userId": userId,
                "count": 40,
                "includePromotedContent": false,
                "withQuickPromoteEligibilityTweetFields": true,
                "withVoice": true,
                "withV2Timeline": true
            };

            if (cursor) variables.cursor = cursor;

            const features = { "rweb_lists_timeline_redesign_enabled": true, "responsive_web_graphql_exclude_directive_enabled": true, "verified_phone_label_enabled": false, "creator_subscriptions_tweet_preview_api_enabled": true, "responsive_web_graphql_timeline_navigation_enabled": true, "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false, "tweetypie_unmention_optimization_enabled": true, "responsive_web_edit_tweet_api_enabled": true, "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true, "view_counts_everywhere_api_enabled": true, "longform_notetweets_consumption_enabled": true, "responsive_web_twitter_article_tweet_consumption_enabled": true, "tweet_awards_web_tipping_enabled": false, "freedom_of_speech_not_reach_fetch_enabled": true, "standardized_nudges_misinfo": true, "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true, "longform_notetweets_rich_text_read_enabled": true, "longform_notetweets_inline_media_enabled": true, "responsive_web_media_download_video_enabled": false, "responsive_web_enhance_cards_enabled": false };

            const url = `https://x.com/i/api/graphql/${queryId}/UserTweets?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;

            const data = await makeAuthorizedRequest(url);

            // Extract Instructions
            const instructions = data.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
            const entries = instructions.find(i => i.type === 'TimelineAddEntries')?.entries || [];

            allTweets = allTweets.concat(entries);

            // Get next cursor
            const cursorEntry = entries.find(e => e.entryId.startsWith('cursor-bottom'));
            if (cursorEntry) {
                cursor = cursorEntry.content.value;
            } else {
                break;
            }

            await sleep(500 + Math.random() * 500); // Random delay
        }

        return allTweets;
    }

    async function makeAuthorizedRequest(url) {
        if (!STATE.session) throw new Error('No session');

        const response = await fetch(url, {
            headers: {
                'authorization': STATE.session.bearer,
                'x-csrf-token': STATE.session.csrf,
                'x-twitter-active-user': 'yes',
                'x-twitter-client-language': 'en'
            }
        });

        if (!response.ok) {
            if (response.status === 429) throw new Error('Rate limit exceeded');
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    }

    // ==================== PROCESSING ====================

    function processTweets(rawEntries) {
        return rawEntries
            .map(entry => {
                const result = entry.content?.itemContent?.tweet_results?.result;
                if (!result) return null;

                // Handle Retweets (legacy or core node)
                const legacy = result.legacy;
                if (!legacy) return null;

                // Filters
                if (legacy.retweeted_status_result) return null; // Skip RTs
                if (legacy.in_reply_to_status_id) return null; // Skip Replies
                // Skip Ads - promoted content usually filtered by API param but check
                if (result.promotedMetadata) return null;

                // Scoring
                const likes = legacy.favorite_count || 0;
                const retweets = legacy.retweet_count || 0;
                const replies = legacy.reply_count || 0;

                // Viral Score: Likes + 2x RTs + 3x Replies
                const score = likes + (retweets * 2) + (replies * 3);

                return {
                    id: legacy.id_str,
                    text: legacy.full_text,
                    metrics: { likes, retweets, replies },
                    score,
                    createdAt: new Date(legacy.created_at)
                };
            })
            .filter(t => t !== null)
            .sort((a, b) => b.score - a.score);
    }

    // ==================== RENDERING ====================

    function renderTweets() {
        const container = STATE.shadowRoot.getElementById('tweets-container');
        if (!container) return;

        let displayTweets = STATE.tweets;

        // Filter logic
        if (STATE.filter === 'recent') {
            // Last 30 days only? Or just sort by date then score? 
            // The user wanted "Recent Viral" vs "All time".
            // Since we grabbed the last ~100 tweets, 'all time' is relative to that batch.
            // Let's just define Recent as: Sort by Date, then top score?
            // Or typically Recent Viral means recent high performers.
            // For simplicity, let's treat "All Time" as the Score Sort we already did.
            // "Recent" -> Sort by Date

            const recent = [...STATE.tweets].sort((a, b) => b.createdAt - a.createdAt);
            displayTweets = recent;
        } else {
            // All Time (Viral Score)
            displayTweets = STATE.tweets; // Already sorted by score
        }

        if (displayTweets.length === 0) {
            container.innerHTML = '<div class="empty-state">No tweets found.</div>';
            return;
        }

        const html = displayTweets.map(t => `
            <div class="tweet-card">
                <div class="tweet-meta">
                    <span>${formatDate(t.createdAt)}</span>
                    <span class="score">⚡ ${formatNumber(t.score)}</span>
                </div>
                <div class="tweet-text">${t.text}</div>
                <div class="tweet-metrics">
                    <span>❤️ ${formatNumber(t.metrics.likes)}</span>
                    <span>🔁 ${formatNumber(t.metrics.retweets)}</span>
                    <span>💬 ${formatNumber(t.metrics.replies)}</span>
                </div>
                <button class="action-btn" data-tweet-id="${t.id}">
                    <span>✍️ Draft Reply</span>
                </button>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    function renderLoading() {
        const container = STATE.shadowRoot.getElementById('tweets-container');
        if (container) {
            container.innerHTML = `
                <div class="skeleton-card">
                    <div class="sk-line width-70"></div>
                    <div class="sk-line width-100"></div>
                    <div class="sk-line width-40"></div>
                </div>
                <div class="skeleton-card">
                    <div class="sk-line width-70"></div>
                    <div class="sk-line width-100"></div>
                </div>
            `;
        }
    }

    function renderError(msg) {
        const container = STATE.shadowRoot.getElementById('tweets-container');
        if (container) {
            container.innerHTML = `<div class="empty-state" style="color: #ff4444">${msg}</div>`;
        }
    }

    // ==================== UTILS ====================

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function formatDate(date) {
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
