# Echo - LinkedIn Ghost Writer 🤖

**Your voice, echoed.** An AI-powered LinkedIn comment assistant with vision support, autonomous verification, and human-like behavior.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🧠 **Smart AI Comments** - Generates contextual, non-bot-like comments using GPT-4o-mini or Gemini 1.5 Flash
- 👁️ **Vision Support** - Analyzes images in posts to reference specific visual details
- 🚀 **Auto-Pilot Mode** - Fully autonomous scrolling, liking, and commenting
- 🚫 **Ad Evasion** - Automatically skips promoted posts and ads
- 🎭 **Persona Engine** - Adapts to your custom voice and writing style
- ✅ **Smart Verification** - Confirms successful posting before moving on
- 🔒 **100% Local** - All data stored locally, no cloud dependencies

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
3. Select your provider (OpenAI or Gemini)
4. Click **Save Settings**

### 4. Set Your Voice
In the popup, enter your persona in the "My Voice" field. Examples:
- *"Witty senior engineer who hates buzzwords"*
- *"Supportive founder who loves celebrating small wins"*
- *"Sarcastic tech bro with dry humor"*

## Usage

### Semi-Auto Mode (Recommended)
1. Toggle **Echo Active** ON in the popup
2. Scroll LinkedIn naturally
3. When viewing a post, Echo auto-generates a comment
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

## Project Structure

```
Echo/
├── extension/
│   ├── manifest.json          # Chrome extension manifest
│   ├── background.js          # API calls, prompt engine
│   ├── content/
│   │   ├── content.js         # Main content script
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
- **OpenAI GPT-4o-mini** / **Google Gemini 1.5 Flash**
- **html2canvas** for image capture
- **Chrome Storage API** for local data persistence

## Anti-Bot Protections

Echo is designed to behave like a human:
- ❌ Never starts with "Great post", "Thanks for sharing", etc.
- ❌ No hashtags in comments
- ✅ Short, punchy responses (15-30 words)
- ✅ Uses contractions and sentence fragments
- ✅ References specific visual details in image posts
- ✅ Human-like typing speed with random delays

## Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| API Provider | OpenAI or Gemini | OpenAI |
| Response Length | Short/Medium/Long | Medium |
| Quick Tone | Professional/Friendly/Witty/Thought-provoking | Professional |
| My Voice | Your custom persona description | - |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is for educational and productivity purposes. Use responsibly and in accordance with LinkedIn's Terms of Service. The authors are not responsible for any misuse of this software.

---

**Made with ❤️ by [Shyamol Konwar](https://github.com/shyamolkonwar)**
