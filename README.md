# ShodanAI

ShodanAI is a Discord chat bot that emulates the malevolent AI from System Shock. It uses the Together AI hosted Llama 3 language model via an OpenAI-compatible API to generate responses in Shodan's signature style. Conversation histories are stored locally so the AI can maintain context over multiple interactions.

## Tech Stack

- **Node.js** (ES module syntax; tested with Node 18+)
- **discord.js** v14 for interacting with the Discord API
- **openai** client for calling Together AI's Llama 3 model
- **dotenv** for environment variable management
- **node-fetch** for HTTP requests (used by the OpenAI client)
- Built‑in **fs** module for persisting conversation history in the `convos/` folder

## Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd ShodanAI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create and configure a Discord bot**
   1. Visit the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
   2. Under **Bot**, choose **Add Bot** and confirm.
   3. Enable the **MESSAGE CONTENT** intent on the bot page.
   4. Copy the bot token&mdash;you will place it in the `.env` file next.
   5. Under **OAuth2 → URL Generator**, select the **bot** scope with **Send Messages** permission to generate an invite link. Use that link to add the bot to your server.

4. **Create a `.env` file** in the project root with your credentials:
   ```bash
   DISCORD_TOKEN=your_discord_bot_token
   TOGETHER_API_KEY=your_together_ai_api_key
   ```

5. **Run the bot**
   ```bash
   node bot.js
   ```

The bot will log in to Discord and begin listening for mentions. Conversation logs are saved under `convos/` on each run.

## Usage

Invite the bot to your server and mention it in a channel. When you tag the bot with a question or message, it will reply in the style of SHODAN. Messages and replies are stored so that follow-up conversations maintain context (up to a limit of recent turns).
Use the `/reset` slash command to clear the saved history for the current channel if you want to start fresh.

## License

This project is released under the [MIT License](LICENSE).
