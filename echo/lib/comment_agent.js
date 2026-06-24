const SKILLS_URL = chrome.runtime.getURL('skills/comment-agent-skills.json');

export const COMMENT_AGENT_DEFAULTS = {
    baseUrl: 'https://rivtor-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
    model: 'DeepSeek-V4-Pro',
    selectedSkill: 'founder-operator-core'
};

const MEMORY_LIMITS = {
    generated: 30,
    approved: 20,
    rejected: 20,
    feedback: 80
};

const AGENT_LIMITS = {
    strategistRounds: 6,
    editorRounds: 4
};

const LEGACY_TONE_MAP = {
    professional: 'human-connection',
    casual: 'human-connection',
    supportive: 'emotional',
    insightful: 'operational-insight',
    enthusiastic: 'light-joke',
    appreciative: 'emotional',
    founder: 'human-connection',
    operator: 'operational-insight',
    contrarian: 'respectful-contrarian',
    'pain-mirror': 'human-connection',
    analytical: 'operational-insight',
    'in-the-trenches': 'shared-scar',
    minimalist: 'human-connection',
    witty: 'light-joke',
    snarky: 'respectful-contrarian',
    sarcastic: 'respectful-contrarian',
    cynical: 'reflective',
    informative: 'operational-insight'
};

const CATEGORY_PROFILES = {
    'human-connection': {
        label: 'Human Connection',
        bias: 'Be grounded, founder-to-founder, and personally human without sounding polished.',
        preferredArchetypes: ['specific-experience', 'empathetic-extension', 'practical-agreement'],
        avoid: 'Do not drift into generic praise or therapy language.'
    },
    'operational-insight': {
        label: 'Operational Insight',
        bias: 'Favor execution detail, process reality, team friction, bottlenecks, or ownership.',
        preferredArchetypes: ['operational-extension', 'tactical-reframe', 'practical-agreement'],
        avoid: 'Do not force operator jargon unless it clearly fits the post.'
    },
    emotional: {
        label: 'Emotional',
        bias: 'Be emotionally present and validating, but still concrete and calm.',
        preferredArchetypes: ['empathetic-extension', 'specific-experience', 'gentle-validation'],
        avoid: 'Do not become dramatic, poetic, or therapeutic.'
    },
    reflective: {
        label: 'Reflective',
        bias: 'Sound thoughtful and measured, with one calm insight that adds perspective.',
        preferredArchetypes: ['reflective-reframe', 'specific-experience', 'practical-agreement'],
        avoid: 'Do not sound abstract, mystical, or inflated.'
    },
    'light-joke': {
        label: 'Light Joke',
        bias: 'A small amount of tasteful wit is allowed if it sharpens the point.',
        preferredArchetypes: ['light-wit', 'specific-experience', 'practical-agreement'],
        avoid: 'Do not become meme-y, sarcastic, or attention-seeking.'
    },
    'respectful-contrarian': {
        label: 'Respectful Contrarian',
        bias: 'Offer one useful counterpoint with calm specificity and zero ego.',
        preferredArchetypes: ['calm-contrarian', 'tactical-reframe', 'narrowing-nuance'],
        avoid: 'Do not disagree for sport, and do not sound combative.'
    },
    'shared-scar': {
        label: 'Shared Scar',
        bias: 'Use a short lived-experience lesson from building under pressure.',
        preferredArchetypes: ['specific-experience', 'operational-extension', 'gentle-validation'],
        avoid: 'Do not invent war stories or overdramatize.'
    }
};

const FALLBACK_SKILLS = {
    version: 1,
    skills: [
        {
            id: 'founder-operator-core',
            name: 'Founder Operator Core',
            description: 'Writes like an operator founder focused on execution reality, practical signal, and founder restraint.',
            userSelectable: true,
            instructions: [
                'Write like someone who has shipped, hired, missed targets, and fixed broken systems.',
                'Anchor the comment to one concrete detail from the post.',
                'If you agree, add why, how, or a missing operational layer.',
                'If you disagree, narrow the claim calmly and specifically.',
                'Prefer execution truth, customer reality, tradeoffs, and team dynamics over motivational framing.',
                'Do not sound like a creator trying to sound founder-y.'
            ],
            preferredArchetypes: [
                'operational-extension',
                'specific-experience',
                'tactical-reframe',
                'calm-contrarian'
            ],
            allowedTools: [
                'get_post_context',
                'get_user_voice_profile',
                'get_platform_constraints',
                'get_category_strategy',
                'classify_post',
                'extract_founder_hooks',
                'find_best_comment_archetypes',
                'get_recent_approved_comments',
                'score_authenticity',
                'detect_ai_slop',
                'check_comment_constraints'
            ]
        },
        {
            id: 'anti-slop-editor',
            name: 'Anti-Slop Editor',
            description: 'Always-on editorial pass that removes generic praise, creator energy, and synthetic polish.',
            userSelectable: false,
            instructions: [
                'Tighten comments until they sound typed, not authored.',
                'Remove generic praise, vague abstractions, and symmetrical social-copy cadence.',
                'Preserve the strongest concrete detail from the original draft.',
                'Choose restraint over flourish every time.'
            ],
            preferredArchetypes: ['editorial-tighten'],
            allowedTools: [
                'get_platform_constraints',
                'get_category_strategy',
                'score_authenticity',
                'detect_ai_slop',
                'check_comment_constraints'
            ]
        },
        {
            id: 'humanizer',
            name: 'Humanizer',
            description: 'Always-on humanization pass that strips AI writing patterns and makes the comment sound more natural, specific, and human-written.',
            userSelectable: false,
            instructions: [
                'Rewrite, do not just trim. Keep the core meaning while making the writing sound naturally human.',
                'Cut signs of AI writing: inflated significance, promotional language, vague attributions, filler phrases, signposting, fake profundity, and tidy rule-of-three rhythm.',
                'Prefer simple constructions, concrete details, varied sentence length, and direct statements over polished social-copy cadence.',
                'Use plain punctuation. No em dash or en dash. No chatbot framing like "here is" or "let me know".',
                'Do not make the writing sterile. The final line should feel typed by a thoughtful founder, not authored by a content model.'
            ],
            preferredArchetypes: ['humanize-and-tighten'],
            allowedTools: [
                'get_post_context',
                'get_user_voice_profile',
                'get_platform_constraints',
                'get_category_strategy',
                'score_authenticity',
                'detect_ai_slop',
                'check_comment_constraints'
            ]
        }
    ]
};

let cachedSkillRegistry = null;

export function getInstallStorageDefaults() {
    return {
        apiProvider: 'azure',
        azureBaseUrl: COMMENT_AGENT_DEFAULTS.baseUrl,
        azureModel: COMMENT_AGENT_DEFAULTS.model,
        selectedSkill: COMMENT_AGENT_DEFAULTS.selectedSkill,
        commentAgentMemory: createEmptyMemory()
    };
}

export async function generateFounderComment({ apiKey, postData, quickTone, platform, settings }) {
    const activePlatform = platform || 'linkedin';
    const normalizedTone = normalizeTone(quickTone);
    const registry = await loadSkillRegistry();
    const primarySkill = resolveSkill(registry, settings.selectedSkill || COMMENT_AGENT_DEFAULTS.selectedSkill);
    const editorSkill = resolveSkill(registry, 'anti-slop-editor');
    const humanizerSkill = resolveSkill(registry, 'humanizer');
    const memory = await getAgentMemory();
    const responseLength = settings.platforms?.[activePlatform]?.responseLength || settings.responseLength || 2;
    const context = buildAgentContext({
        postData,
        platform: activePlatform,
        settings,
        skill: primarySkill,
        editorSkill,
        humanizerSkill,
        quickTone: normalizedTone,
        responseLength,
        memory
    });

    const draft = await runStrategistPass({
        apiKey,
        endpoint: settings.azureBaseUrl || COMMENT_AGENT_DEFAULTS.baseUrl,
        model: settings.azureModel || COMMENT_AGENT_DEFAULTS.model,
        context
    });

    const critique = buildCommentCritique(draft.comment, context);

    const edited = await runEditorPass({
        apiKey,
        endpoint: settings.azureBaseUrl || COMMENT_AGENT_DEFAULTS.baseUrl,
        model: settings.azureModel || COMMENT_AGENT_DEFAULTS.model,
        context,
        draft,
        critique
    });

    const finalComment = sanitizeCommentOutput(edited.comment || draft.comment, postData, activePlatform);
    const finalCritique = buildCommentCritique(finalComment, context);

    await saveGeneratedComment({
        context,
        draftComment: draft.comment,
        finalComment,
        draftMeta: draft,
        finalMeta: edited,
        critique: finalCritique
    });

    return {
        comment: finalComment,
        meta: {
            skill: primarySkill.id,
            tone: normalizedTone,
            archetype: edited.archetype || draft.archetype || 'founder-comment',
            authenticityScore: finalCritique.authenticity.total,
            slopScore: finalCritique.slop.score,
            rewrote: critique.shouldRewrite || (edited.comment || '').trim() !== (draft.comment || '').trim()
        }
    };
}

export async function recordCommentFeedback({ action, platform, postData, comment, editedComment, quickTone, meta }) {
    const memory = await getAgentMemory();
    const normalizedAction = action || 'used';
    const entry = {
        action: normalizedAction,
        platform: platform || 'linkedin',
        tone: normalizeTone(quickTone),
        comment: trimString(comment, 500),
        editedComment: trimString(editedComment, 500),
        authorName: trimString(postData?.authorName || postData?.authorHandle || '', 120),
        postSnippet: trimString(postData?.content || postData?.title || postData?.body || '', 220),
        skill: meta?.skill || COMMENT_AGENT_DEFAULTS.selectedSkill,
        timestamp: Date.now()
    };

    memory.feedback.unshift(entry);
    memory.feedback = memory.feedback.slice(0, MEMORY_LIMITS.feedback);

    const finalComment = entry.editedComment || entry.comment;
    if (finalComment && ['used', 'posted', 'approved'].includes(normalizedAction)) {
        memory.approved = prependUnique(memory.approved, {
            platform: entry.platform,
            tone: entry.tone,
            comment: finalComment,
            authorName: entry.authorName,
            postSnippet: entry.postSnippet,
            skill: entry.skill,
            timestamp: entry.timestamp
        }, MEMORY_LIMITS.approved, item => `${item.platform}:${item.comment}`);
    }

    if (finalComment && ['rejected', 'edited-away'].includes(normalizedAction)) {
        memory.rejected = prependUnique(memory.rejected, {
            platform: entry.platform,
            tone: entry.tone,
            comment: finalComment,
            authorName: entry.authorName,
            postSnippet: entry.postSnippet,
            skill: entry.skill,
            timestamp: entry.timestamp
        }, MEMORY_LIMITS.rejected, item => `${item.platform}:${item.comment}`);
    }

    await chrome.storage.local.set({ commentAgentMemory: memory });
}

async function runStrategistPass({ apiKey, endpoint, model, context }) {
    const tools = buildToolset({ context, mode: 'strategist' });
    const messages = [
        {
            role: 'system',
            content: buildStrategistSystemPrompt(context)
        },
        buildContextUserMessage(context)
    ];

    return runToolLoop({
        apiKey,
        endpoint,
        model,
        messages,
        tools,
        finalToolName: 'submit_comment_draft',
        temperature: 0.45,
        maxTokens: 420,
        maxRounds: AGENT_LIMITS.strategistRounds
    });
}

async function runEditorPass({ apiKey, endpoint, model, context, draft, critique }) {
    const tools = buildToolset({ context, mode: 'editor' });
    const messages = [
        {
            role: 'system',
            content: buildEditorSystemPrompt(context, critique)
        },
        {
            role: 'user',
            content: buildEditorUserPrompt(context, draft, critique)
        }
    ];

    return runToolLoop({
        apiKey,
        endpoint,
        model,
        messages,
        tools,
        finalToolName: 'submit_final_comment',
        temperature: 0.35,
        maxTokens: 320,
        maxRounds: AGENT_LIMITS.editorRounds
    });
}

async function runToolLoop({ apiKey, endpoint, model, messages, tools, finalToolName, temperature, maxTokens, maxRounds }) {
    const toolMap = Object.fromEntries(tools.map(tool => [tool.definition.function.name, tool]));
    const conversation = [...messages];

    for (let round = 0; round < maxRounds; round += 1) {
        const response = await callChatCompletion({
            apiKey,
            endpoint,
            model,
            messages: conversation,
            tools: tools.map(tool => tool.definition),
            temperature,
            maxTokens
        });

        const message = response?.choices?.[0]?.message;
        if (!message) {
            throw new Error('Agent returned an empty response.');
        }

        if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
            conversation.push({
                role: 'assistant',
                content: message.content || '',
                tool_calls: message.tool_calls
            });

            const toolMessages = [];
            for (const call of message.tool_calls) {
                const toolName = call.function?.name;
                const tool = toolMap[toolName];
                const args = safeParseJson(call.function?.arguments, {});

                if (!tool) {
                    toolMessages.push({
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify({ error: `Unknown tool: ${toolName}` })
                    });
                    continue;
                }

                const result = await tool.handler(args);
                if (toolName === finalToolName) {
                    return normalizeFinalResult(result, message.content || '');
                }

                toolMessages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(result)
                });
            }

            conversation.push(...toolMessages);
            continue;
        }

        const content = (message.content || '').trim();
        if (content) {
            const parsed = safeParseJson(stripCodeFence(content), null);
            if (parsed && typeof parsed.comment === 'string') {
                return normalizeFinalResult(parsed, content);
            }

            return normalizeFinalResult({ comment: content, archetype: 'direct-response' }, content);
        }
    }

    const fallback = await callChatCompletion({
        apiKey,
        endpoint,
        model,
        messages: [
            ...conversation,
            {
                role: 'user',
                content: 'You are out of tool rounds. Return only JSON with keys comment, archetype, and confidence. Do not call tools.'
            }
        ],
        tools: [],
        temperature,
        maxTokens
    });

    const fallbackContent = fallback?.choices?.[0]?.message?.content?.trim() || '';
    if (fallbackContent) {
        const parsed = safeParseJson(stripCodeFence(fallbackContent), null);
        if (parsed && typeof parsed.comment === 'string') {
            return normalizeFinalResult(parsed, fallbackContent);
        }

        return normalizeFinalResult({ comment: fallbackContent, archetype: finalToolName }, fallbackContent);
    }

    throw new Error('Agent exhausted its reasoning rounds before returning a comment.');
}

function buildToolset({ context, mode }) {
    const allowedTools = new Set(mode === 'editor'
        ? [
            ...(context.editorSkill.allowedTools || []),
            ...(context.humanizerSkill?.allowedTools || [])
        ]
        : context.skill.allowedTools || []);

    const sharedTools = [
        createTool('get_post_context', 'Returns the normalized post context so you can anchor your comment to real details.', {
            type: 'object',
            properties: {
                focus: { type: 'string', description: 'Optional focus area such as content, author, media, or metadata.' }
            },
            additionalProperties: false
        }, async () => buildPostContextPayload(context)),
        createTool('get_user_voice_profile', 'Returns the structured founder voice profile and recent approved comment examples.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => context.voiceProfile),
        createTool('get_platform_constraints', 'Returns platform-specific style, length, and banned-pattern constraints.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => context.constraints),
        createTool('get_category_strategy', 'Returns how the selected category should bias the comment strategy.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => context.categoryProfile),
        createTool('classify_post', 'Classifies the post type, emotional register, audience, and value gap.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => classifyPost(context.postData, context.platform)),
        createTool('extract_founder_hooks', 'Extracts concrete hooks, founder-relevant angles, and anchor phrases from the post.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => extractFounderHooks(context.postData, context.platform)),
        createTool('find_best_comment_archetypes', 'Returns the best comment archetypes for this post and selected category.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => findBestCommentArchetypes(context)),
        createTool('get_recent_approved_comments', 'Returns recent approved comments from memory so style stays founder-consistent.', {
            type: 'object',
            properties: {},
            additionalProperties: false
        }, async () => getRecentApprovedComments(context)),
        createTool('score_authenticity', 'Scores how founder-native, specific, and human a candidate comment feels.', {
            type: 'object',
            properties: {
                comment: { type: 'string', description: 'The candidate comment to score.' }
            },
            required: ['comment'],
            additionalProperties: false
        }, async ({ comment }) => scoreAuthenticity(comment, context)),
        createTool('detect_ai_slop', 'Flags generic praise, synthetic polish, buzzwords, and low-signal AI patterns.', {
            type: 'object',
            properties: {
                comment: { type: 'string', description: 'The candidate comment to inspect.' }
            },
            required: ['comment'],
            additionalProperties: false
        }, async ({ comment }) => detectAISlop(comment, context)),
        createTool('check_comment_constraints', 'Checks length, banned patterns, platform fit, and hard writing constraints.', {
            type: 'object',
            properties: {
                comment: { type: 'string', description: 'The candidate comment to validate.' }
            },
            required: ['comment'],
            additionalProperties: false
        }, async ({ comment }) => checkCommentConstraints(comment, context))
    ];

    const finalTool = mode === 'editor'
        ? createTool('submit_final_comment', 'Submit the final edited founder comment when it is ready.', {
            type: 'object',
            properties: {
                comment: { type: 'string', description: 'The final comment text.' },
                archetype: { type: 'string', description: 'The final response archetype.' },
                confidence: { type: 'number', description: 'Confidence from 0 to 1.' },
                editNotes: { type: 'string', description: 'Short summary of what changed in the edit pass.' }
            },
            required: ['comment'],
            additionalProperties: false
        }, async (args) => args)
        : createTool('submit_comment_draft', 'Submit the best draft comment after using tools and choosing a strategy.', {
            type: 'object',
            properties: {
                comment: { type: 'string', description: 'The draft comment text.' },
                archetype: { type: 'string', description: 'The chosen response archetype.' },
                confidence: { type: 'number', description: 'Confidence from 0 to 1.' },
                thesis: { type: 'string', description: 'Short summary of the point the comment is making.' }
            },
            required: ['comment'],
            additionalProperties: false
        }, async (args) => args);

    return [
        ...sharedTools.filter(tool => allowedTools.has(tool.definition.function.name)),
        finalTool
    ];
}

function buildStrategistSystemPrompt(context) {
    return [
        'You are Founder Comment Agent.',
        'Write comments like a real founder with scar tissue, operating context, and restraint.',
        'Use tools before drafting so your comment is anchored to the actual post, the user voice, and the active category strategy.',
        'Do not output generic praise, polished creator-speak, or random startup jargon.',
        `Active skill: ${context.skill.name}. ${context.skill.description}`,
        `Skill instructions: ${context.skill.instructions.join(' ')}`,
        `Selected category: ${context.categoryProfile.label}. ${context.categoryProfile.bias}`,
        `Avoid: ${context.categoryProfile.avoid}`,
        `Preferred archetypes: ${context.skill.preferredArchetypes.join(', ')}`,
        'The comment must add value: a practical layer, a lived-experience scar, a calm nuance, or a sharper framing.',
        'When you are ready, call submit_comment_draft with the draft comment. Do not answer in plain text.'
    ].join('\n');
}

function buildEditorSystemPrompt(context, critique) {
    const issues = critique.issues.length ? critique.issues.join('; ') : 'No major issues, but still tighten the comment.';
    return [
        'You are Anti-Slop Founder Editor.',
        `Primary editorial skill: ${context.editorSkill.name}. ${context.editorSkill.description}`,
        `Editor instructions: ${context.editorSkill.instructions.join(' ')}`,
        `Humanizer skill: ${context.humanizerSkill.name}. ${context.humanizerSkill.description}`,
        `Humanizer instructions: ${context.humanizerSkill.instructions.join(' ')}`,
        'Tighten the draft until it sounds typed by a founder, not authored by AI.',
        'Preserve the strongest concrete point. Remove generic praise, synthetic polish, and any sentence that could fit dozens of posts.',
        `Current issues to resolve: ${issues}`,
        `Authenticity score: ${critique.authenticity.total}/100. Slop score: ${critique.slop.score}/100.`,
        'When the comment is ready, call submit_final_comment. Do not answer in plain text.'
    ].join('\n');
}

function buildContextUserMessage(context) {
    const postSummary = buildPostContextPayload(context);
    const promptText = [
        'Study the post and draft one founder-native comment.',
        `Platform: ${context.platform}`,
        `Selected category: ${context.categoryProfile.label}`,
        `Response length mode: ${context.responseLength}`,
        'Use the tools instead of guessing. Then return the draft through submit_comment_draft.'
    ].join('\n');

    if (context.postData?.hasImage && context.postData?.imageData) {
        return {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `${promptText}\n\nStructured context:\n${JSON.stringify(postSummary, null, 2)}`
                },
                {
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${context.postData.imageData}`,
                        detail: 'low'
                    }
                }
            ]
        };
    }

    return {
        role: 'user',
        content: `${promptText}\n\nStructured context:\n${JSON.stringify(postSummary, null, 2)}`
    };
}

function buildEditorUserPrompt(context, draft, critique) {
    return JSON.stringify({
        platform: context.platform,
        category: context.categoryProfile.label,
        skill: context.skill.name,
        draftComment: draft.comment,
        draftArchetype: draft.archetype || 'unknown',
        critique,
        hardConstraints: context.constraints,
        postContext: buildPostContextPayload(context)
    }, null, 2);
}

function buildAgentContext({ postData, platform, settings, skill, editorSkill, humanizerSkill, quickTone, responseLength, memory }) {
    const categoryProfile = CATEGORY_PROFILES[quickTone] || CATEGORY_PROFILES['human-connection'];
    const voiceProfile = buildVoiceProfile(settings, platform, memory);
    return {
        platform,
        postData,
        quickTone,
        responseLength,
        skill,
        editorSkill,
        humanizerSkill,
        settings,
        memory,
        categoryProfile,
        constraints: getPlatformConstraints(platform, responseLength),
        voiceProfile
    };
}

function buildVoiceProfile(settings, platform, memory) {
    const rawVoice = (settings.platforms?.[platform]?.voice || '').trim();
    const approvedExamples = memory.approved
        .filter(item => item.platform === platform)
        .slice(0, 4)
        .map(item => item.comment);

    return {
        summary: rawVoice || 'No custom voice profile saved yet. Default to a calm founder in the trenches.',
        traits: inferVoiceTraits(rawVoice),
        preferredPronouns: inferPronounBias(rawVoice),
        recentApprovedExamples: approvedExamples,
        editingPatterns: inferEditingPatterns(memory.feedback, platform)
    };
}

function buildPostContextPayload(context) {
    return {
        platform: context.platform,
        authorName: context.postData?.authorName || context.postData?.authorHandle || 'Unknown',
        title: context.postData?.title || '',
        content: context.postData?.content || context.postData?.body || '',
        body: context.postData?.body || '',
        subreddit: context.postData?.subreddit || '',
        flair: context.postData?.flair || '',
        hasImage: Boolean(context.postData?.hasImage),
        voiceProfile: context.voiceProfile.summary,
        selectedCategory: context.categoryProfile.label
    };
}

function classifyPost(postData, platform) {
    const text = getPostText(postData);
    const lower = text.toLowerCase();
    const type = inferPostType(lower);
    const audience = inferAudience(lower, platform);
    const emotionalRegister = inferEmotionalRegister(lower);
    const valueGap = inferValueGap(lower, type);

    return {
        postType: type,
        audience,
        emotionalRegister,
        valueGap,
        likelyIntent: inferLikelyIntent(type, emotionalRegister),
        riskLevel: emotionalRegister === 'vulnerable' ? 'high' : (type === 'hot-take' ? 'medium' : 'normal')
    };
}

function extractFounderHooks(postData, platform) {
    const text = getPostText(postData);
    const lower = text.toLowerCase();
    const hooks = [];
    const categories = [
        ['execution', ['ship', 'execute', 'execution', 'deadline', 'launch', 'build']],
        ['customers', ['customer', 'users', 'buyer', 'client', 'churn']],
        ['team', ['hire', 'hiring', 'manager', 'team', 'ownership']],
        ['growth', ['distribution', 'pipeline', 'sales', 'marketing', 'conversion']],
        ['product', ['product', 'feature', 'roadmap', 'ux', 'feedback']],
        ['funding', ['fundraise', 'runway', 'investor', 'burn', 'arr', 'revenue']]
    ];

    for (const [label, keywords] of categories) {
        if (keywords.some(keyword => lower.includes(keyword))) {
            hooks.push(label);
        }
    }

    return {
        platform,
        hooks,
        anchorPhrases: extractAnchorPhrases(text),
        numbers: text.match(/\b\d+[\d,.%]*\b/g) || [],
        strongestAngle: hooks[0] || 'founder-judgment'
    };
}

function findBestCommentArchetypes(context) {
    const classification = classifyPost(context.postData, context.platform);
    const preferred = new Set(context.categoryProfile.preferredArchetypes);

    if (classification.postType === 'question') {
        preferred.add('tactical-reframe');
    }
    if (classification.postType === 'milestone') {
        preferred.add('specific-experience');
    }
    if (classification.postType === 'hot-take') {
        preferred.add('calm-contrarian');
        preferred.add('narrowing-nuance');
    }
    if (classification.emotionalRegister === 'vulnerable') {
        preferred.add('gentle-validation');
    }

    return {
        recommended: Array.from(preferred).slice(0, 5),
        classification
    };
}

function getRecentApprovedComments(context) {
    return context.memory.approved
        .filter(item => item.platform === context.platform)
        .slice(0, 5)
        .map(item => ({
            comment: item.comment,
            tone: item.tone,
            skill: item.skill,
            authorName: item.authorName
        }));
}

function buildCommentCritique(comment, context) {
    const constraints = checkCommentConstraints(comment, context);
    const slop = detectAISlop(comment, context);
    const authenticity = scoreAuthenticity(comment, context);
    const issues = [];

    if (constraints.violations.length) {
        issues.push(...constraints.violations.map(item => `Constraint: ${item}`));
    }
    if (slop.issues.length) {
        issues.push(...slop.issues.map(item => `Slop: ${item}`));
    }
    if (!authenticity.anchorPresent) {
        issues.push('The comment is not clearly anchored to a concrete detail from the post.');
    }
    if (authenticity.total < 68) {
        issues.push('Founder signal is too weak or too polished.');
    }

    return {
        constraints,
        slop,
        authenticity,
        shouldRewrite: constraints.violations.length > 0 || slop.score >= 35 || authenticity.total < 68 || !authenticity.anchorPresent,
        issues: unique(issues)
    };
}

function scoreAuthenticity(comment, context) {
    const text = (comment || '').trim();
    const lower = text.toLowerCase();
    let total = 62;
    const reasons = [];
    const anchorPresent = hasAnchorOverlap(text, getPostText(context.postData));

    if (anchorPresent) {
        total += 12;
        reasons.push('Anchors to post details.');
    } else {
        total -= 14;
        reasons.push('Missing a clear anchor to the post.');
    }

    if (/\b(i|we|you)\b/i.test(text)) {
        total += 5;
        reasons.push('Uses direct founder-to-founder framing.');
    }

    if (extractFounderHooks(context.postData, context.platform).hooks.some(hook => lower.includes(hook.replace('-', ' ')))) {
        total += 6;
        reasons.push('Includes founder-relevant operating language.');
    }

    if (/[0-9%]/.test(text)) {
        total += 4;
        reasons.push('Uses concrete detail or quantification.');
    }

    if (startsWithGenericPraise(lower)) {
        total -= 22;
        reasons.push('Starts with generic praise.');
    }

    if (/(game changer|leverage|unlock|landscape|thought leadership|incredible insight|so true)/i.test(text)) {
        total -= 18;
        reasons.push('Contains hype or creator-speak.');
    }

    const sentences = splitSentences(text);
    if (sentences.length > 2 && context.platform !== 'reddit') {
        total -= 8;
        reasons.push('Too many sentences for the platform.');
    }

    return {
        total: clamp(total, 0, 100),
        anchorPresent,
        reasons
    };
}

function detectAISlop(comment, context) {
    const text = (comment || '').trim();
    const lower = text.toLowerCase();
    const issues = [];
    let score = 8;

    if (startsWithGenericPraise(lower)) {
        issues.push('Generic praise opener.');
        score += 28;
    }
    if (/(game changer|unlock|leverage|landscape|crucial|incredible insight|deeply resonates)/i.test(text)) {
        issues.push('Buzzword-heavy or polished social-copy language.');
        score += 20;
    }
    if (/(let'?s dive in|let'?s explore|here'?s what you need to know|without further ado|the real question is|at its core|what really matters|the heart of the matter)/i.test(text)) {
        issues.push('Signposting or fake profundity.');
        score += 16;
    }
    if (/(i hope this helps|let me know|would you like|here is a|certainly!?|of course!?)/i.test(text)) {
        issues.push('Chatbot correspondence artifact.');
        score += 22;
    }
    if (/(vibrant|rich cultural|groundbreaking|breathtaking|must-visit|renowned|stunning|enhancing its|showcasing)/i.test(text)) {
        issues.push('Promotional or advertisement-like language.');
        score += 16;
    }
    if (/(highlighting|underscoring|emphasizing|ensuring|reflecting|symbolizing|contributing to|fostering|showcasing)/i.test(text)) {
        issues.push('Superficial -ing analysis padding.');
        score += 12;
    }
    if (/(it'?s not just|not only .* but|the language of|the currency of|the architecture of|becomes a trap|is not a tool but a mirror)/i.test(text)) {
        issues.push('Formulaic aphorism or contrast pattern.');
        score += 14;
    }
    if (!hasAnchorOverlap(text, getPostText(context.postData))) {
        issues.push('Could fit many unrelated posts because the anchor is weak.');
        score += 22;
    }
    if (splitSentences(text).length === 1 && text.length > 170 && context.platform !== 'reddit') {
        issues.push('Dense single-sentence construction feels synthetic.');
        score += 8;
    }
    if (/(\bnot just\b.*\bbut\b)|(\bthe real.*is\b)/i.test(text)) {
        issues.push('Formulaic contrast pattern.');
        score += 8;
    }

    return {
        score: clamp(score, 0, 100),
        issues
    };
}

function checkCommentConstraints(comment, context) {
    const text = (comment || '').trim();
    const violations = [];
    const words = text.split(/\s+/).filter(Boolean);

    if (!text) {
        violations.push('Comment is empty.');
    }
    if (/[#]/.test(text)) {
        violations.push('Hashtags are not allowed.');
    }
    if (/[\u{1F300}-\u{1FAFF}]/u.test(text)) {
        violations.push('Emoji are not allowed.');
    }
    if (/[\u2014]/.test(text)) {
        violations.push('Em dash is not allowed.');
    }
    if (startsWithGenericPraise(text.toLowerCase())) {
        violations.push('Starts with generic praise.');
    }
    if (!hasAnchorOverlap(text, getPostText(context.postData))) {
        violations.push('Needs one clearer anchor to the post.');
    }

    if (context.platform === 'linkedin' && words.length > context.constraints.maxWords) {
        violations.push(`LinkedIn comment exceeds ${context.constraints.maxWords} words.`);
    }
    if (context.platform === 'x' && text.length > context.constraints.maxChars) {
        violations.push(`X reply exceeds ${context.constraints.maxChars} characters.`);
    }
    if (context.platform === 'reddit' && words.length > context.constraints.maxWords) {
        violations.push(`Reddit comment exceeds ${context.constraints.maxWords} words.`);
    }

    return {
        platform: context.platform,
        violations,
        wordCount: words.length,
        characterCount: text.length
    };
}

function getPlatformConstraints(platform, responseLength) {
    if (platform === 'x') {
        return {
            maxChars: 299,
            targetChars: responseLength === 1 ? 110 : responseLength === 3 ? 220 : 160,
            sentenceGuidance: 'One short sentence or two short sentences maximum.',
            bannedPatterns: ['hashtags', 'emoji', 'generic praise', 'em dash']
        };
    }

    if (platform === 'reddit') {
        return {
            maxWords: responseLength === 1 ? 35 : responseLength === 3 ? 85 : 55,
            targetWords: responseLength === 1 ? 18 : responseLength === 3 ? 45 : 28,
            sentenceGuidance: 'Keep it concise and human. Usually one or two sentences.',
            bannedPatterns: ['generic praise', 'promotion', 'em dash']
        };
    }

    return {
        maxWords: responseLength === 1 ? 28 : responseLength === 3 ? 42 : 34,
        targetWords: responseLength === 1 ? 16 : responseLength === 3 ? 28 : 22,
        sentenceGuidance: 'One short sentence or two short sentences maximum.',
        bannedPatterns: ['hashtags', 'emoji', 'generic praise', 'em dash']
    };
}

async function callChatCompletion({ apiKey, endpoint, model, messages, tools, temperature, maxTokens }) {
    const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens
    };

    if (Array.isArray(tools) && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        let message = `Azure API error: ${response.status}`;

        try {
            const errorJson = await response.json();
            message = errorJson?.error?.message || message;
        } catch (error) {
            const errorText = await response.text();
            if (errorText) {
                message = errorText;
            }
        }

        throw new Error(message);
    }

    return response.json();
}

async function loadSkillRegistry() {
    if (cachedSkillRegistry) {
        return cachedSkillRegistry;
    }

    try {
        const response = await fetch(SKILLS_URL);
        if (!response.ok) {
            throw new Error(`Failed to load skills: ${response.status}`);
        }

        const registry = await response.json();
        cachedSkillRegistry = registry?.skills?.length ? registry : FALLBACK_SKILLS;
        return cachedSkillRegistry;
    } catch (error) {
        console.warn('[Comment Agent] Falling back to bundled skills:', error);
        cachedSkillRegistry = FALLBACK_SKILLS;
        return cachedSkillRegistry;
    }
}

function resolveSkill(registry, skillId) {
    return registry.skills.find(skill => skill.id === skillId) || registry.skills[0] || FALLBACK_SKILLS.skills[0];
}

async function getAgentMemory() {
    const { commentAgentMemory } = await chrome.storage.local.get('commentAgentMemory');
    return {
        ...createEmptyMemory(),
        ...(commentAgentMemory || {})
    };
}

async function saveGeneratedComment({ context, draftComment, finalComment, draftMeta, finalMeta, critique }) {
    const memory = await getAgentMemory();
    const entry = {
        platform: context.platform,
        tone: context.quickTone,
        skill: context.skill.id,
        authorName: trimString(context.postData?.authorName || context.postData?.authorHandle || '', 120),
        postSnippet: trimString(getPostText(context.postData), 220),
        draftComment: trimString(draftComment, 500),
        finalComment: trimString(finalComment, 500),
        archetype: finalMeta.archetype || draftMeta.archetype || '',
        authenticityScore: critique.authenticity.total,
        slopScore: critique.slop.score,
        timestamp: Date.now()
    };

    memory.generated = prependUnique(memory.generated, entry, MEMORY_LIMITS.generated, item => `${item.platform}:${item.finalComment}`);
    await chrome.storage.local.set({ commentAgentMemory: memory });
}

function createTool(name, description, parameters, handler) {
    return {
        definition: {
            type: 'function',
            function: {
                name,
                description,
                parameters
            }
        },
        handler
    };
}

function createEmptyMemory() {
    return {
        generated: [],
        approved: [],
        rejected: [],
        feedback: []
    };
}

function normalizeTone(quickTone) {
    return LEGACY_TONE_MAP[quickTone] || quickTone || 'human-connection';
}

function inferVoiceTraits(rawVoice) {
    const lower = (rawVoice || '').toLowerCase();
    return unique([
        lower.includes('short') || lower.includes('concise') ? 'prefers short sentences' : '',
        lower.includes('direct') ? 'direct' : '',
        lower.includes('operator') ? 'operator-minded' : '',
        lower.includes('founder') ? 'founder-native' : '',
        lower.includes('humor') || lower.includes('joke') ? 'light wit allowed' : '',
        lower.includes('no buzzword') || lower.includes('avoid polished') ? 'cuts buzzwords' : ''
    ].filter(Boolean));
}

function inferPronounBias(rawVoice) {
    const lower = (rawVoice || '').toLowerCase();
    if (lower.includes('we ')) return 'we';
    if (lower.includes('i ')) return 'i';
    return 'mixed';
}

function inferEditingPatterns(feedback, platform) {
    const relevant = (feedback || []).filter(item => item.platform === platform).slice(0, 10);
    const patterns = [];
    if (relevant.some(item => item.action === 'edited-away')) {
        patterns.push('User often rewrites outputs heavily. Stay conservative.');
    }
    if (relevant.some(item => item.action === 'posted')) {
        patterns.push('Posted comments are useful examples for future tone matching.');
    }
    return patterns;
}

function inferPostType(lower) {
    if (lower.includes('unpopular opinion') || lower.includes('hot take')) return 'hot-take';
    if (/\?/.test(lower)) return 'question';
    if (/(launched|hit \$|reached|grew to|crossed)/.test(lower)) return 'milestone';
    if (/(learned|lesson|mistake|realized)/.test(lower)) return 'lesson';
    if (/(burnout|hard|struggle|pain|tough)/.test(lower)) return 'reflection';
    if (/(how to|framework|playbook|tips|thread)/.test(lower)) return 'tactical';
    return 'observation';
}

function inferAudience(lower, platform) {
    if (platform === 'reddit') return 'community';
    if (/(founder|startup|arr|runway|hire|customer)/.test(lower)) return 'founders';
    if (/(engineer|dev|api|code|infra)/.test(lower)) return 'technical';
    if (/(sales|marketing|growth|pipeline|lead)/.test(lower)) return 'growth';
    return 'operators';
}

function inferEmotionalRegister(lower) {
    if (/(burnout|grief|scared|afraid|anxious|hard year|struggle)/.test(lower)) return 'vulnerable';
    if (/(excited|grateful|proud|celebrate|thrilled)/.test(lower)) return 'celebratory';
    if (/(frustrated|annoying|broken|sucks|hate)/.test(lower)) return 'frustrated';
    if (/(think|tradeoff|nuance|data|system)/.test(lower)) return 'analytical';
    return 'calm';
}

function inferValueGap(lower, type) {
    if (type === 'question') return 'practical answer with earned nuance';
    if (type === 'milestone') return 'what the milestone hides operationally';
    if (type === 'hot-take') return 'narrowing nuance and concrete exception';
    if (type === 'reflection') return 'validation plus one grounded operational truth';
    if (/(thread|tips|framework|playbook)/.test(lower)) return 'one overlooked tactical layer';
    return 'one specific extension tied to execution reality';
}

function inferLikelyIntent(type, emotionalRegister) {
    if (type === 'question') return 'get help or crowd perspective';
    if (type === 'milestone') return 'share progress and meaning';
    if (type === 'hot-take') return 'provoke discussion';
    if (emotionalRegister === 'vulnerable') return 'share lived reality and be understood';
    return 'share an observation with peers';
}

function extractAnchorPhrases(text) {
    const sentences = splitSentences(text)
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 14)
        .slice(0, 4);

    return sentences.map(sentence => trimString(sentence, 120));
}

function getPostText(postData) {
    return [postData?.title || '', postData?.content || '', postData?.body || '']
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function hasAnchorOverlap(comment, postText) {
    const commentWords = meaningfulWords(comment);
    const postWords = new Set(meaningfulWords(postText));
    let matches = 0;

    for (const word of commentWords) {
        if (postWords.has(word)) {
            matches += 1;
            if (matches >= 2) return true;
        }
    }

    return false;
}

function meaningfulWords(text) {
    return (text || '')
        .toLowerCase()
        .match(/[a-z][a-z0-9-]{3,}/g)?.filter(word => !STOP_WORDS.has(word)) || [];
}

const STOP_WORDS = new Set([
    'this', 'that', 'with', 'from', 'your', 'have', 'what', 'when', 'where', 'there', 'their', 'about', 'would',
    'could', 'should', 'really', 'just', 'into', 'because', 'still', 'after', 'before', 'while', 'been', 'being',
    'great', 'love', 'like', 'post', 'founder', 'startup', 'comment', 'write'
]);

function startsWithGenericPraise(lower) {
    return /^(great post|love this|so true|this is great|well said|spot on|absolutely|great point)/i.test(lower.trim());
}

function sanitizeCommentOutput(text, postData = {}, platform = 'linkedin') {
    if (!text) return '';

    let output = text.trim();
    output = stripCodeFence(output);
    output = output.replace(/^['"`]+|['"`]+$/g, '').trim();
    output = output.replace(/[\u2014]/g, '-');
    output = output.replace(/^\s*here'?s (my )?comment:\s*/i, '');
    output = output.replace(/^\s*comment:\s*/i, '');
    output = output.replace(/\n{3,}/g, '\n\n');

    const source = getPostText(postData).toLowerCase();
    if (!source.includes('rivtor')) {
        output = output.replace(/\brivtor\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    }

    if (platform === 'linkedin') {
        output = enforceLinkedInLength(output, 45);
    }
    if (platform === 'x') {
        output = enforceMaxChars(output, 299);
    }
    if (platform === 'reddit') {
        output = enforceWordCap(output, 85);
    }

    return output.trim();
}

function enforceLinkedInLength(text, hardMaxWords = 45) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= hardMaxWords) return text;

    const sentences = splitSentences(text);
    let kept = '';
    for (const sentence of sentences) {
        const next = kept ? `${kept} ${sentence}` : sentence;
        if (next.split(/\s+/).filter(Boolean).length <= hardMaxWords) {
            kept = next;
        } else {
            break;
        }
    }

    return kept || words.slice(0, hardMaxWords).join(' ');
}

function enforceWordCap(text, maxWords) {
    const words = text.split(/\s+/).filter(Boolean);
    return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ');
}

function enforceMaxChars(text, maxChars) {
    if (text.length <= maxChars) return text;
    const sliced = text.slice(0, maxChars);
    const lastSpace = sliced.lastIndexOf(' ');
    return lastSpace > Math.floor(maxChars * 0.6) ? sliced.slice(0, lastSpace).trim() : sliced.trim();
}

function normalizeFinalResult(result, rawContent) {
    if (typeof result === 'string') {
        return { comment: result.trim(), rawContent };
    }

    return {
        comment: (result.comment || '').trim(),
        archetype: result.archetype || '',
        confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
        thesis: result.thesis || result.editNotes || '',
        rawContent
    };
}

function splitSentences(text) {
    return (text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
}

function safeParseJson(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function stripCodeFence(text) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function trimString(value, maxLength) {
    const text = (value || '').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function prependUnique(list, item, limit, keyFn) {
    const key = keyFn(item);
    const filtered = (list || []).filter(existing => keyFn(existing) !== key);
    return [item, ...filtered].slice(0, limit);
}

function unique(list) {
    return Array.from(new Set(list));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
