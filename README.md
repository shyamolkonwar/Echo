# Echo - Multi-Platform Ghost Writer 🤖

**Your voice, echoed.** An AI-powered comment assistant for LinkedIn & Reddit with vision support, autonomous verification, and human-like behavior.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🌐 **Multi-Platform Support** - Works seamlessly on both LinkedIn and Reddit
- 🧠 **Smart AI Comments** - Generates contextual, non-bot-like comments using GPT-4o, Gemini 1.5 Flash, or DeepSeek
- 👁️ **Vision Support** - Analyzes images in posts to reference specific visual details
- 🎯 **Manual Generate Button** - On-demand AI comment generation with a single click
- 🚀 **Auto-Pilot Mode** - Fully autonomous scrolling, liking, and commenting
- 🔄 **Semi-Auto Mode** - Auto-generates comments as you scroll, you review and post
- 🚫 **Ad Evasion** - Automatically skips promoted posts and ads
- 🎭 **Persona Engine** - Adapts to your custom voice and writing style
- ✅ **Smart Verification** - Confirms successful posting before moving on
- 🔒 **100% Local** - All data stored locally, no cloud dependencies
- 🛡️ **Duplicate Prevention** - Tracks commented posts to avoid duplicate comments

### Reddit-Specific Features
- 📝 **Markdown Support** - Comments formatted in Reddit-flavored Markdown
- 🎯 **Subreddit Watchlist** - Only comment on posts from specified subreddits
- 🧩 **Cultural Intelligence** - Adapts tone to each subreddit's culture (r/science vs r/funny)
- 🏷️ **Flair Detection** - Automatically switches to formal tone for "Serious" flairs
- ⏱️ **Smart Rate Limiting** - 10-15 min delays to avoid Reddit shadowbans
- 🚫 **Anti-Emoji** - Respects Reddit's no-emoji culture (except 🗿 🚀 in specific contexts)

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/shyamolkonwar/Echo.git
cd Echo
```

### 2. Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `extension` folder from the cloned repository

### 3. Configure API Key
1. Click the Echo extension icon in your Chrome toolbar
2. Enter your API key:
   - **OpenAI**: Get from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Google Gemini**: Get from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   - **DeepSeek**: Get from [platform.deepseek.com](https://platform.deepseek.com)
3. Select your provider (OpenAI, Gemini, or DeepSeek)
4. Click **Save Settings**

### 4. Set Your Voice
In the popup, enter your persona in the "My Voice" field. Examples:
- *"Witty senior engineer who hates buzzwords"*
- *"Supportive founder who loves celebrating small wins"*
- *"Sarcastic tech bro with dry humor"*

## Usage

### Manual Generate Button (New!)
1. Navigate to any LinkedIn post
2. Click the comment button to open the comment box
3. Click **"Generate with Echo"** button
4. Review the AI-generated comment
5. Click Post when ready

**Note:** Manual button works independently - no need to toggle Echo Active or Auto-Pilot!

### Semi-Auto Mode (Recommended)
1. Toggle **Echo Active** ON in the popup
2. Scroll LinkedIn naturally
3. When viewing a post (80% visible for 2 seconds), Echo auto-generates a comment
4. Review and click Post manually

### Auto-Pilot Mode
1. Toggle **Echo Active** ON
2. Toggle **Auto-Pilot** ON
3. Sit back and watch! Echo will:
   - Scroll your feed automatically
   - Like posts before commenting
   - Type comments slowly (human-like)
   - Verify successful posting
   - Skip ads and promoted content

### Reddit Mode
1. Click the Echo extension icon
2. Select **Reddit** in the Platform selector
3. Enter your watched subreddits (e.g., `SaaS, webdev, marketing`)
4. Toggle **Echo Active** ON
5. Navigate to Reddit and scroll
6. Echo will only comment on posts from your watched subreddits
7. Comments will be formatted in Markdown and adapt to each subreddit's culture

**Important:** Ensure you have 50+ karma before using Reddit automation to avoid shadowbans.

## Project Structure

```
Echo/
├── extension/
│   ├── manifest.json          # Chrome extension manifest
│   ├── background.js          # API calls, prompt engine
│   ├── content/
│   │   ├── content.js         # Main content script, manual button
│   │   ├── content.css        # Extension styles
│   │   └── driver.js          # Auto-pilot driver
│   ├── popup/
│   │   ├── popup.html         # Extension popup UI
│   │   └── popup.js           # Popup logic
│   ├── dashboard/
│   │   ├── dashboard.html     # Settings dashboard
│   │   └── dashboard.js       # Dashboard logic
│   └── libs/
│       └── html2canvas.min.js # Image capture library
└── docs/
    └── visionModel.txt        # Vision module documentation
```

## Key Technologies

- **Chrome Extensions API** (Manifest V3)
- **OpenAI GPT-4o** / **Google Gemini 1.5 Flash** / **DeepSeek Chat**
- **html2canvas** for image capture
- **Chrome Storage API** for local data persistence

## Anti-Bot Protections

Echo is designed to behave like a human:
- ❌ Never starts with "Great post", "Thanks for sharing", etc.
- ❌ No hashtags or em dashes in comments
- ✅ Short, punchy responses (15-30 words)
- ✅ Uses contractions and sentence fragments
- ✅ References specific visual details in image posts
- ✅ Human-like typing speed with random delays
- ✅ Persistent duplicate comment prevention

## Configuration Options

| Setting | Description | Options |
|---------|-------------|---------|
| API Provider | AI model provider | OpenAI / Gemini / DeepSeek |
| Response Length | Comment length | Short / Medium / Long |
| Quick Tone | Comment style | Professional / Friendly / Witty / Thought-provoking |
| My Voice | Your custom persona | Free text description |

## Features Comparison

| Feature | Manual Button | Semi-Auto | Auto-Pilot |
|---------|--------------|-----------|------------|
| User Control | Full | High | Low |
| Speed | On-demand | Medium | Fast |
| Requires Active Toggle | ❌ No | ✅ Yes | ✅ Yes |
| Auto-scrolls | ❌ No | ❌ No | ✅ Yes |
| Auto-posts | ❌ No | ❌ No | ✅ Yes |
| Best For | Selective engagement | Daily browsing | Mass engagement |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is for educational and productivity purposes. Use responsibly and in accordance with LinkedIn's Terms of Service. The authors are not responsible for any misuse of this software.

---

**Made with ❤️ by [Shyamol Konwar](https://github.com/shyamolkonwar)**
