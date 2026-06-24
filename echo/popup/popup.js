// Rivtor Founder OS - Popup Script
// Handles UI interactions and storage management

class EchoPopup {
    constructor() {
        this.elements = {};
        this.currentPlatform = 'linkedin'; // Default state
        this.skillCatalog = [];
        this.init();
    }

    async init() {
        // Migrate storage to v2 schema if needed
        await this.migrateStorageToV2();

        this.cacheElements();
        this.bindEvents();
        await this.loadSkillCatalog();
        await this.loadSettings();
        await this.checkOnboarding();
        this.updateActivityLog();
        this.initPlatformBar();
        this.initSettingsNav();
    }

    cacheElements() {
        // Views
        this.elements.mainView = document.getElementById('main-view');
        this.elements.settingsView = document.getElementById('settings-view');
        this.elements.onboardingView = document.getElementById('onboarding-view');

        // Header controls
        this.elements.settingsBtn = document.getElementById('settings-btn');
        this.elements.backBtn = document.getElementById('back-btn');

        // Platform Bar
        this.elements.platformIcons = document.querySelectorAll('.platform-icon');
        this.elements.contextCards = document.querySelectorAll('.context-card');

        // Context Controls (Dynamic per platform)
        // We'll query these dynamically in methods since there are multiples

        // Footer
        this.elements.openDashboard = document.getElementById('open-dashboard');
        this.elements.activityLog = document.getElementById('activity-log');

        // Settings Modal Elements
        this.elements.settingsNavItems = document.querySelectorAll('.nav-item');
        this.elements.settingsSections = document.querySelectorAll('.settings-section');
        this.elements.saveSettings = document.getElementById('save-settings');
        this.elements.cancelSettings = document.getElementById('cancel-settings');

        // Form Inputs
        this.elements.apiKey = document.getElementById('api-key');
        this.elements.toggleKeyVisibility = document.getElementById('toggle-key-visibility');
        this.elements.azureBaseUrl = document.getElementById('azure-base-url');
        this.elements.azureModel = document.getElementById('azure-model');
        this.elements.commentSkill = document.getElementById('comment-skill');
        this.elements.commentSkillDescription = document.getElementById('comment-skill-description');

        // Platform Configs
        this.elements.linkedinVoice = document.getElementById('linkedin-voice');
        this.elements.linkedinLength = document.getElementById('linkedin-length');
        this.elements.linkedinCreatorsOnly = document.getElementById('linkedin-creators-only');

        this.elements.redditVoice = document.getElementById('reddit-voice');
        this.elements.subredditFilter = document.getElementById('subreddit-filter');
        this.elements.subredditBlacklist = document.getElementById('subreddit-blacklist');
        this.elements.redditIgnoreHiring = document.getElementById('reddit-ignore-hiring');

        this.elements.xVoice = document.getElementById('x-voice');
        this.elements.xBlacklist = document.getElementById('x-blacklist');

        // System Configs
        this.elements.delayTimer = document.getElementById('delay-timer');
        this.elements.scrollSpeed = document.getElementById('scroll-speed');

        // Onboarding
        this.elements.onboardingSteps = document.querySelectorAll('.onboarding-step');
        this.elements.onboardApiKey = document.getElementById('onboard-api-key');
        this.elements.onboardVoice = document.getElementById('onboard-voice');
        this.elements.completeOnboarding = document.getElementById('complete-onboarding');
    }

    bindEvents() {
        // Settings Toggle
        this.elements.settingsBtn?.addEventListener('click', () => this.toggleSettings(true));
        this.elements.backBtn?.addEventListener('click', () => this.toggleSettings(false));
        this.elements.cancelSettings?.addEventListener('click', () => this.toggleSettings(false));
        this.elements.saveSettings?.addEventListener('click', () => this.saveSettings());

        // API Key Visibility
        this.elements.toggleKeyVisibility?.addEventListener('click', () => this.toggleKeyVisibility());
        this.elements.commentSkill?.addEventListener('change', () => this.updateSkillDescription());

        // Open Dashboard
        this.elements.openDashboard?.addEventListener('click', () => this.openDashboard());

        // Onboarding Navigation
        document.querySelectorAll('[data-next]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextStep = e.target.getAttribute('data-next');
                this.showOnboardingStep(nextStep);
            });
        });

        // Complete Onboarding
        this.elements.completeOnboarding?.addEventListener('click', () => this.completeOnboarding());

        // Platform Context Controls (Delegate event handling)
        document.body.addEventListener('change', (e) => {
            if (e.target.matches('#master-toggle')) this.handleMasterToggle(e);
            if (e.target.matches('#autopilot-toggle')) this.handleAutopilotToggle(e, 'linkedin');
            if (e.target.matches('.reddit-master-toggle')) this.handleMasterToggle(e); // Treat as same for now or separate
            if (e.target.matches('.reddit-autopilot-toggle')) this.handleAutopilotToggle(e, 'reddit');
            if (e.target.name === 'quick-tone') this.handleToneChange(e, 'linkedin');
            if (e.target.name === 'reddit-tone') this.handleToneChange(e, 'reddit');
        });

        // Settings Navigation
        this.elements.settingsNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const section = e.currentTarget.getAttribute('data-section');
                if (section) this.showSettingsSection(section);
            });
        });
    }

    // ==================== VIEW MANAGEMENT ====================

    toggleSettings(show) {
        if (show) {
            this.elements.settingsView.classList.add('active');
            this.elements.mainView.style.display = 'none';
        } else {
            this.elements.settingsView.classList.remove('active');
            this.elements.mainView.style.display = 'block';
        }
    }

    showView(viewName) {
        // Reset all views
        this.elements.mainView.classList.remove('active');
        this.elements.onboardingView.classList.remove('active');
        this.elements.settingsView.classList.remove('active');

        if (viewName === 'onboarding') {
            this.elements.onboardingView.classList.add('active');
        } else if (viewName === 'main') {
            this.elements.mainView.classList.add('active');
            this.elements.mainView.style.display = 'block';
        }
    }

    initSettingsNav() {
        // Handled in bindEvents via delegate or direct bind
    }

    showSettingsSection(sectionId) {
        // Update Nav State
        this.elements.settingsNavItems.forEach(item => {
            if (item.getAttribute('data-section') === sectionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update Section Visibility
        this.elements.settingsSections.forEach(sec => {
            if (sec.getAttribute('data-section') === sectionId) {
                sec.classList.add('active');
            } else {
                sec.classList.remove('active');
            }
        });
    }

    // ==================== PLATFORM BAR ====================

    async initPlatformBar() {
        this.elements.platformIcons.forEach(icon => {
            icon.addEventListener('click', async (e) => {
                const platform = e.currentTarget.getAttribute('data-platform');
                await this.switchPlatform(platform);
            });
        });

        // Auto-detect currently active tab
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                if (tab.url.includes('reddit.com')) {
                    await this.switchPlatform('reddit');
                } else if (tab.url.includes('x.com') || tab.url.includes('twitter.com')) {
                    await this.switchPlatform('x');
                } else {
                    await this.switchPlatform('linkedin');
                }
            } else {
                await this.switchPlatform('linkedin'); // Default
            }
        } catch (err) {
            await this.switchPlatform('linkedin');
        }
    }

    async switchPlatform(platform) {
        this.currentPlatform = platform;

        // Update Icons
        this.elements.platformIcons.forEach(icon => {
            if (icon.getAttribute('data-platform') === platform) {
                icon.classList.add('active');
            } else {
                icon.classList.remove('active');
            }
        });

        // Update Context Cards
        this.elements.contextCards.forEach(card => {
            if (card.getAttribute('data-platform') === platform) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });

        // Save selection
        await chrome.storage.local.set({ currentPlatform: platform });
    }


    // ==================== SETTINGS LOGIC ====================

    async loadSkillCatalog() {
        const fallback = [
            {
                id: 'founder-operator-core',
                name: 'Founder Operator Core',
                description: 'Writes like an operator founder focused on execution reality, practical signal, and restraint.',
                userSelectable: true
            }
        ];

        try {
            const response = await fetch(chrome.runtime.getURL('skills/comment-agent-skills.json'));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.skillCatalog = (data.skills || []).filter(skill => skill.userSelectable !== false);
        } catch (error) {
            console.warn('[Popup] Failed to load skill catalog:', error);
            this.skillCatalog = fallback;
        }

        if (!this.skillCatalog.length) {
            this.skillCatalog = fallback;
        }

        if (this.elements.commentSkill) {
            this.elements.commentSkill.innerHTML = this.skillCatalog.map(skill => `
                <option value="${skill.id}">${skill.name}</option>
            `).join('');
        }

        this.updateSkillDescription();
    }

    async loadSettings() {
        const data = await chrome.storage.local.get([
            'apiKey', 'apiProvider', 'platforms', 'isActive', 'delayTimer', 'scrollSpeed', 'azureBaseUrl', 'azureModel', 'selectedSkill'
        ]);

        const platforms = data.platforms || {
            linkedin: { voice: '', enabled: true, autopilot: false, quickTone: 'human-connection' },
            reddit: { voice: '', enabled: true, autopilot: false, quickTone: 'human-connection', subreddits: [] }
        };

        // 1. General Settings
        if (this.elements.apiKey) this.elements.apiKey.value = data.apiKey || '';

        if (this.elements.azureBaseUrl) {
            this.elements.azureBaseUrl.value = data.azureBaseUrl || 'https://rivtor-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview';
        }

        if (this.elements.azureModel) {
            this.elements.azureModel.value = data.azureModel || 'DeepSeek-V4-Pro';
        }

        if (this.elements.commentSkill) {
            this.elements.commentSkill.value = data.selectedSkill || 'founder-operator-core';
            this.updateSkillDescription();
        }

        if (this.elements.delayTimer) this.elements.delayTimer.value = data.delayTimer || 2;
        if (this.elements.scrollSpeed) this.elements.scrollSpeed.value = data.scrollSpeed || 2;

        // 2. LinkedIn Configs
        if (platforms.linkedin) {
            this.elements.linkedinVoice.value = platforms.linkedin.voice || '';
            this.elements.linkedinLength.value = platforms.linkedin.responseLength || 2;
            if (this.elements.linkedinCreatorsOnly) {
                this.elements.linkedinCreatorsOnly.checked = platforms.linkedin.creatorsOnly || false;
            }
        }

        // 3. Reddit Configs
        if (platforms.reddit) {
            this.elements.redditVoice.value = platforms.reddit.voice || '';
            this.elements.subredditFilter.value = (platforms.reddit.subreddits || []).join(', ');
            this.elements.subredditBlacklist.value = (platforms.reddit.blacklist || []).join(', ');
            if (this.elements.redditIgnoreHiring) {
                this.elements.redditIgnoreHiring.checked = platforms.reddit.ignoreHiring || false;
            }
        }

        // 4. Update Context Controls (Toggles)
        const masterToggle = document.getElementById('master-toggle');
        if (masterToggle) masterToggle.checked = data.isActive || false;
        this.updateStatusIndicator(data.isActive || false);

        // Autopilot Toggle (LinkedIn only - Reddit no longer has autopilot)
        const webAutopilot = document.getElementById('autopilot-toggle');
        if (webAutopilot && platforms.linkedin) webAutopilot.checked = platforms.linkedin.autopilot || false;

        // 5. X Configs
        if (platforms.x) {
            if (this.elements.xVoice) this.elements.xVoice.value = platforms.x.voice || '';
            if (this.elements.xBlacklist) this.elements.xBlacklist.value = (platforms.x.blacklist || []).join(', ');
        }

        // 6. Load Tone Settings into Radio Buttons
        const legacyToneMap = {
            professional: 'human-connection',
            casual: 'human-connection',
            supportive: 'emotional',
            insightful: 'operational-insight',
            enthusiastic: 'light-joke',
            appreciative: 'emotional',
            founder: 'human-connection',
            operator: 'operational-insight',
            contrarian: 'respectful-contrarian',
            'pain-mirror': 'human-connection'
        };

        const linkedinToneRaw = platforms.linkedin?.quickTone || 'human-connection';
        const linkedinTone = legacyToneMap[linkedinToneRaw] || linkedinToneRaw;
        const redditToneMap = {
            sarcastic: 'respectful-contrarian',
            witty: 'light-joke',
            snarky: 'respectful-contrarian',
            cynical: 'reflective',
            informative: 'operational-insight',
            supportive: 'emotional',
            founder: 'human-connection',
            operator: 'operational-insight',
            contrarian: 'respectful-contrarian',
            'pain-mirror': 'human-connection'
        };
        const xToneMap = {
            analytical: 'operational-insight',
            'in-the-trenches': 'shared-scar',
            minimalist: 'human-connection',
            founder: 'human-connection',
            operator: 'operational-insight',
            contrarian: 'respectful-contrarian',
            witty: 'light-joke'
        };

        const redditTone = redditToneMap[platforms.reddit?.quickTone] || platforms.reddit?.quickTone || 'human-connection';
        const xTone = xToneMap[platforms.x?.quickTone] || platforms.x?.quickTone || 'human-connection';

        // Set LinkedIn tone radio
        document.querySelectorAll('input[name="quick-tone"]').forEach(radio => {
            radio.checked = radio.value === linkedinTone;
        });

        // Set Reddit tone radio
        document.querySelectorAll('input[name="reddit-tone"]').forEach(radio => {
            radio.checked = radio.value === redditTone;
        });

        // Set X tone radio
        document.querySelectorAll('input[name="x-tone"]').forEach(radio => {
            radio.checked = radio.value === xTone;
        });

        // Also save to legacy quickTone key for content script compatibility
        await chrome.storage.local.set({ quickTone: linkedinTone, redditQuickTone: redditTone, xQuickTone: xTone });
    }

    async saveSettings() {
        const apiKey = this.elements.apiKey.value.trim();
        const apiProvider = 'azure';
        const delayTimer = parseInt(this.elements.delayTimer.value) || 2;
        const scrollSpeed = parseInt(this.elements.scrollSpeed.value) || 2;
        const azureBaseUrl = this.elements.azureBaseUrl?.value?.trim() || 'https://rivtor-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview';
        const azureModel = this.elements.azureModel?.value?.trim() || 'DeepSeek-V4-Pro';
        const selectedSkill = this.elements.commentSkill?.value || 'founder-operator-core';

        // Get existing platforms data to merge
        const { platforms } = await chrome.storage.local.get('platforms');
        const updatedPlatforms = platforms || { linkedin: {}, reddit: {} };

        // Update LinkedIn
        updatedPlatforms.linkedin = {
            ...updatedPlatforms.linkedin,
            voice: this.elements.linkedinVoice.value.trim(),
            responseLength: parseInt(this.elements.linkedinLength.value) || 2,
            creatorsOnly: this.elements.linkedinCreatorsOnly.checked
        };

        // Update Reddit
        updatedPlatforms.reddit = {
            ...updatedPlatforms.reddit,
            voice: this.elements.redditVoice.value.trim(),
            subreddits: this.elements.subredditFilter.value.split(',').map(s => s.trim()).filter(Boolean),
            blacklist: this.elements.subredditBlacklist.value.split(',').map(s => s.trim()).filter(Boolean),
            ignoreHiring: this.elements.redditIgnoreHiring.checked
        };

        // Update X
        updatedPlatforms.x = {
            ...updatedPlatforms.x,
            voice: this.elements.xVoice?.value?.trim() || '',
            blacklist: this.elements.xBlacklist?.value?.split(',').map(s => s.trim()).filter(Boolean) || []
        };

        await chrome.storage.local.set({
            apiKey,
            apiProvider,
            azureBaseUrl,
            azureModel,
            selectedSkill,
            delayTimer,
            scrollSpeed,
            platforms: updatedPlatforms
        });

        this.showToast('Settings saved successfully!');
        this.toggleSettings(false);
    }

    // ==================== INTERACTION HANDLERS ====================

    async handleMasterToggle(e) {
        const isActive = e.target.checked;
        await chrome.storage.local.set({ isActive });
        this.updateStatusIndicator(isActive);

        // Notify Content Script
        this.sendMessageToActiveTab({ type: 'TOGGLE_ACTIVE', isActive });
    }

    async handleAutopilotToggle(e, platform) {
        const isAutoPilot = e.target.checked;

        // Update storage
        const { platforms } = await chrome.storage.local.get('platforms');
        if (platforms && platforms[platform]) {
            platforms[platform].autopilot = isAutoPilot;
            await chrome.storage.local.set({ platforms });
        }

        // Notify Content Script
        this.sendMessageToActiveTab({ type: 'TOGGLE_AUTOPILOT', isAutoPilot, platform });

        if (isAutoPilot) {
            this.showToast(`${platform === 'linkedin' ? 'LinkedIn' : 'Reddit'} Auto-Pilot Enabled`);
        }
    }

    async handleToneChange(e, platform) {
        const quickTone = e.target.value;
        const { platforms } = await chrome.storage.local.get('platforms');
        if (platforms && platforms[platform]) {
            platforms[platform].quickTone = quickTone;
            await chrome.storage.local.set({ platforms });
        }

        // Also save to legacy storage key for content script compatibility
        if (platform === 'linkedin') {
            await chrome.storage.local.set({ quickTone });
        } else if (platform === 'reddit') {
            await chrome.storage.local.set({ redditQuickTone: quickTone });
        }

        this.sendMessageToActiveTab({ type: 'UPDATE_TONE', quickTone, platform });

        const toneLabels = {
            'human-connection': 'Human Connection',
            'operational-insight': 'Operational Insight',
            emotional: 'Emotional',
            reflective: 'Reflective',
            'light-joke': 'Light Joke',
            'respectful-contrarian': 'Respectful Contrarian',
            'shared-scar': 'Shared Scar'
        };

        this.showToast(`Type set to ${toneLabels[quickTone] || quickTone}`);
    }

    // ==================== UTILS ====================

    updateStatusIndicator(isActive) {
        const indicator = document.getElementById('status-indicator');
        const text = indicator?.querySelector('.status-text');

        // Also update Reddit status indicator if visible
        const redditIndicator = document.getElementById('reddit-status-indicator');
        const redditText = redditIndicator?.querySelector('.status-text');

        if (isActive) {
            indicator?.classList.add('active');
            if (text) text.textContent = 'ACTIVE';

            redditIndicator?.classList.add('active');
            if (redditText) redditText.textContent = 'ACTIVE';
        } else {
            indicator?.classList.remove('active');
            if (text) text.textContent = 'PAUSED';

            redditIndicator?.classList.remove('active');
            if (redditText) redditText.textContent = 'PAUSED';
        }
    }

    async sendMessageToActiveTab(message) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                chrome.tabs.sendMessage(tab.id, message).catch(() => {
                    // Content script might not be loaded, which is expected on non-supported pages
                });
            }
        } catch (err) {
            // Ignore errors
        }
    }

    showToast(message, type = 'success') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        if (type === 'error') toast.style.background = '#DC2626';

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    toggleKeyVisibility() {
        const input = this.elements.apiKey;
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    }

    updateSkillDescription() {
        const selectedId = this.elements.commentSkill?.value || 'founder-operator-core';
        const selectedSkill = this.skillCatalog.find(skill => skill.id === selectedId) || this.skillCatalog[0];
        if (this.elements.commentSkillDescription && selectedSkill) {
            this.elements.commentSkillDescription.textContent = selectedSkill.description;
        }
    }

    openDashboard() {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    }

    async updateActivityLog() {
        const { activityLog } = await chrome.storage.local.get('activityLog');
        const log = activityLog || [];

        if (!this.elements.activityLog) return;

        if (log.length === 0) {
            this.elements.activityLog.innerHTML = '<div class="activity-empty">No activity yet. Enable Founder Mode and browse LinkedIn.</div>';
            return;
        }

        const html = log.slice(0, 5).map(item => `
            <div class="activity-item">
                <svg class="activity-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <div>
                   <div class="activity-text">${item.text}</div>
                   <div class="activity-time">${this.formatTime(item.timestamp)}</div>
                </div>
            </div>
        `).join('');

        this.elements.activityLog.innerHTML = html;
    }

    formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    // ==================== ONBOARDING ====================
    async checkOnboarding() {
        const { onboardingComplete } = await chrome.storage.local.get('onboardingComplete');
        if (!onboardingComplete) {
            this.showView('onboarding');
        }
    }

    showOnboardingStep(step) {
        this.elements.onboardingSteps.forEach(el => el.style.display = 'none');
        const stepEl = document.querySelector(`.onboarding-step[data-step="${step}"]`);
        if (stepEl) stepEl.style.display = 'block';
    }

    async completeOnboarding() {
        const apiKey = this.elements.onboardApiKey.value.trim();
        const voice = this.elements.onboardVoice.value.trim();

        if (!apiKey) {
            this.showToast('Please enter your API key', 'error');
            this.showOnboardingStep('2');
            return;
        }

        // Initialize v2 schema
        const settings = {
            apiKey: apiKey,
            apiProvider: 'azure',
            azureBaseUrl: 'https://rivtor-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
            azureModel: 'DeepSeek-V4-Pro',
            selectedSkill: 'founder-operator-core',
            commentAgentMemory: { generated: [], approved: [], rejected: [], feedback: [] },
            onboardingComplete: true,
            isActive: true,
            platforms: {
                linkedin: { voice: voice, enabled: true, autopilot: false, quickTone: 'human-connection' },
                reddit: { voice: '', enabled: true, autopilot: false, quickTone: 'human-connection' }
            }
        };

        await chrome.storage.local.set(settings);
        this.showToast('Setup complete!');
        this.showView('main');
        await this.loadSettings();
    }

    // ==================== MIGRATION ====================
    async migrateStorageToV2() {
        const { platforms } = await chrome.storage.local.get('platforms');
        if (platforms) return; // Already v2

        console.log('Migrating to v2...');
        const old = await chrome.storage.local.get(['userTone', 'voiceDna', 'apiKey', 'apiProvider']);

        const newSchema = {
            apiProvider: old.apiProvider || 'azure',
            azureBaseUrl: 'https://rivtor-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
            azureModel: 'DeepSeek-V4-Pro',
            selectedSkill: 'founder-operator-core',
            commentAgentMemory: { generated: [], approved: [], rejected: [], feedback: [] },
            platforms: {
                linkedin: {
                    voice: old.userTone || old.voiceDna || '',
                    enabled: true,
                    autopilot: false,
                    quickTone: 'human-connection'
                },
                reddit: {
                    voice: '',
                    enabled: true,
                    autopilot: false
                }
            }
        };

        await chrome.storage.local.set(newSchema);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.echoPopup = new EchoPopup();
});
