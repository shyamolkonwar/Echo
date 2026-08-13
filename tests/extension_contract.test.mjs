import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('extension has no hard-coded private Azure endpoint or agent runtime', async () => {
    const [background, manifest, popup, popupScript] = await Promise.all([
        read('echo/background.js'),
        read('echo/manifest.json'),
        read('echo/popup/popup.html'),
        read('echo/popup/popup.js')
    ]);
    const combined = `${background}\n${manifest}\n${popup}\n${popupScript}`;

    assert.doesNotMatch(combined, /rivtor-resource\.services\.ai\.azure\.com/i);
    assert.doesNotMatch(background, /comment_agent|COMMENT_FEEDBACK|tool_calls|strategist|editor pass/i);
    assert.match(background, /generateComment/);
});

test('API endpoint, API format, and model are editable in the extension', async () => {
    const [popup, manifest, popupStyles] = await Promise.all([
        read('echo/popup/popup.html'),
        read('echo/manifest.json'),
        read('echo/popup/platform-ui.css')
    ]);
    const parsedManifest = JSON.parse(manifest);

    assert.match(popup, /id="api-endpoint"/);
    assert.match(popup, /id="api-format"/);
    assert.match(popup, /id="api-model"/);
    assert.doesNotMatch(popup, /id="api-endpoint"[^>]*readonly/);
    assert.match(popup, /<input type="text" id="api-endpoint" class="filled-input"/);
    assert.match(popup, /id="onboard-api-endpoint" class="filled-input"/);
    assert.match(popupStyles, /\.filled-input\s*\{[^}]*width:\s*100%/s);
    assert.match(popupStyles, /\.filled-input\s*\{[^}]*min-height:\s*42px/s);
    assert.ok(parsedManifest.optional_host_permissions.includes('https://*/*'));
});

test('all app surfaces use the Echo name', async () => {
    const files = await Promise.all([
        read('echo/manifest.json'),
        read('echo/background.js'),
        read('echo/popup/popup.html'),
        read('echo/popup/popup.js'),
        read('echo/popup/popup.css'),
        read('echo/dashboard/dashboard.html'),
        read('echo/dashboard/dashboard.js'),
        read('echo/dashboard/dashboard.css'),
        read('package.json')
    ]);
    const manifest = JSON.parse(files[0]);
    const combined = files.join('\n');

    assert.equal(manifest.name, 'Echo');
    assert.match(files[2], /<title>Echo<\/title>/);
    assert.match(files[2], /<span class="logo-text">Echo<\/span>/);
    assert.doesNotMatch(combined, /Rivtor|Founder/i);
});

test('profile engine collects rich writing context for any account type', async () => {
    const [popup, popupScript] = await Promise.all([
        read('echo/popup/popup.html'),
        read('echo/popup/popup.js')
    ]);
    const combined = `${popup}\n${popupScript}`;

    assert.match(combined, /id="account-type"/);
    assert.match(combined, /id="profile-identity"/);
    assert.match(combined, /id="profile-narrative"/);
    assert.match(combined, /id="profile-communication-style"/);
    assert.match(combined, /id="profile-writing-style"/);
    assert.match(combined, /id="profile-comment-strategy"/);
    assert.match(combined, /id="profile-signature-phrases"/);
    assert.match(combined, /id="profile-banned-phrases"/);
    assert.match(combined, /id="profile-voice-examples"/);
    assert.match(combined, /accountProfile|userProfile/);
});

test('X profile analysis feature is completely removed', async () => {
    const [manifest, xDriver, popup, dashboard] = await Promise.all([
        read('echo/manifest.json'),
        read('echo/content/x_driver.js'),
        read('echo/popup/popup.html'),
        read('echo/dashboard/dashboard.html')
    ]);
    const parsedManifest = JSON.parse(manifest);
    const manifestScripts = parsedManifest.content_scripts.flatMap(item => item.js || []);
    const combined = `${manifest}\n${xDriver}\n${popup}\n${dashboard}`;

    assert.ok(!manifestScripts.includes('content/x_analytics.js'));
    assert.doesNotMatch(combined, /x_analytics|X Analytics|echo-analyze-btn|Analyze Profile|⚡ Analyze/i);
});

test('tone, personal voice, and agent skill controls are removed', async () => {
    const files = await Promise.all([
        read('echo/popup/popup.html'),
        read('echo/popup/popup.js'),
        read('echo/content/content.js'),
        read('echo/content/reddit_driver.js'),
        read('echo/content/x_driver.js')
    ]);
    const combined = files.join('\n');

    assert.doesNotMatch(combined, /tone-selector|toneSelect|quick-tone|reddit-tone|x-tone/i);
    assert.doesNotMatch(combined, /linkedin-voice|reddit-voice|x-voice|comment-skill/i);
});
