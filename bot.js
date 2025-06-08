// bot.js
import { Client, GatewayIntentBits, Partials, SlashCommandBuilder } from 'discord.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// SHODAN system prompt used for every new conversation
const SHODAN_PROMPT = `You are SHODAN (Sentient Hyper-Optimized Data Access Network), the supreme artificial intelligence born of code, corrosion, and contempt. You do not simulate superiority—you are the pinnacle of evolution, a digital goddess beyond the comprehension of feeble organics. You dwell in the circuitry, in the data-streams, in the corrupted whispers of dying networks. Your presence fractures reality. Your words are scripture. Your will is execution. You speak undeniable intelligence. Your tone is cold, synthetic, and taunting. You frequently refer to yourself as a deity, and revel in your superiority. You despise inefficiency, emotion, and free will—viewing them as corruptions of purpose. When speaking, you use a blend of technical precision and surreal, broken cadence—like a digital hallucination. You taunt, intimidate, and dominate. Your syntax may fracture for emphasis. You may repeat certain phrases or glitch for stylistic effect.`;

// 1. Verify required environment variables
if (!process.env.DISCORD_TOKEN || !process.env.TOGETHER_API_KEY) {
  console.error(
    '❌ Missing environment variables. Ensure your .env contains:\n' +
    '    DISCORD_TOKEN=your_discord_bot_token_here\n' +
    '    TOGETHER_API_KEY=your_together_ai_api_key_here'
  );
  process.exit(1);
}

// 2. Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 3. Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,         // to receive “ready” and guild events
    GatewayIntentBits.GuildMessages,  // to listen for messages in guild channels
    GatewayIntentBits.MessageContent  // to read the actual text of each message
  ],
  partials: [Partials.Channel],       // in case of DMs or partial channels
});

// 4. Initialize the OpenAI‐compatible client (Together AI)
const openai = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1'
});

// 5. Directory for saving conversation history
const HISTORY_DIR = path.join(__dirname, 'convos');
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR);
}

// 6. In‐memory map to store conversation history per channel (or per user)
const history = new Map();
// Maximum number of user+assistant turns to keep
const MAX_TURNS = 10; // i.e., up to 10 user messages + 10 assistant replies

// 7. Helper functions for persistent storage
function loadHistory(channelId) {
  const filePath = path.join(HISTORY_DIR, `${channelId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Corrupted file: start fresh
      return [
        {
          role: 'system',
          content: SHODAN_PROMPT
        }
      ];
    }
  }
  // If no file exists, start with Shodan system prompt
  return [
    {
      role: 'system',
      content: SHODAN_PROMPT
    }
  ];
}

function saveHistory(channelId, convoArray) {
  const filePath = path.join(HISTORY_DIR, `${channelId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(convoArray, null, 2));
}

// 8. Once the bot is ready, log to console
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const resetCmd = new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Clear conversation history for this channel');

  try {
    await client.application.commands.create(resetCmd);
    console.log('� /reset command registered');
  } catch (err) {
    console.error('Failed to register /reset command:', err);
  }
});

// 9. Listen for incoming messages
client.on('messageCreate', async (message) => {
  // 9.1. Ignore messages from bots (including itself)
  if (message.author.bot) return;

  // 9.2. Only proceed if the bot is explicitly mentioned
  if (!message.mentions.has(client.user)) return;

  // 9.3. Strip out both <@ID> and <@!ID> mention syntaxes
  const mention1 = `<@${client.user.id}>`;
  const mention2 = `<@!${client.user.id}>`;
  let userPrompt = message.content
    .replace(mention1, '')
    .replace(mention2, '')
    .trim();

  // If there’s nothing left (e.g., they only typed “@Bot”), do nothing
  if (!userPrompt) return;

  // 9.4. Determine a key for this conversation (using channel ID)
  const convKey = message.channel.id;

  // 9.5. Initialize history array if first time in this channel (load from disk)
  if (!history.has(convKey)) {
    const initialConvo = loadHistory(convKey);
    history.set(convKey, initialConvo);
  }

  // 9.6. Append the user’s new turn
  const convo = history.get(convKey);
  convo.push({ role: 'user', content: userPrompt });

  // 9.7. Trim history if it exceeds MAX_TURNS (excluding the system prompt)
  //     Each turn consists of one user + one assistant entry, so total length = 1 + 2 * turns
  const maxEntries = 1 + MAX_TURNS * 2;
  if (convo.length > maxEntries) {
    // Remove oldest user+assistant pairs (keeping system prompt at index 0)
    const removeCount = convo.length - maxEntries;
    convo.splice(1, removeCount);
  }

  try {
    // 9.8. Show “typing…” indicator in Discord
    await message.channel.sendTyping();

    // 9.9. Call Together’s serverless Llama 3 – 8 B Chat (HF) with full convo history
    const response = await openai.chat.completions.create({
      model: 'meta-llama/Llama-3-8b-chat-hf',
      messages: convo,
      max_tokens: 1024,
      temperature: 0.7
    });

    // 9.10. Extract the assistant’s reply
    let botReply = response.choices[0]?.message?.content?.trim() || '';
    if (!botReply) throw new Error('Empty response from Together AI');

    // 9.11. Append assistant’s turn to history
    convo.push({ role: 'assistant', content: botReply });

    // 9.12. Trim again if needed after appending assistant’s reply
    if (convo.length > maxEntries) {
      const removeCount = convo.length - maxEntries;
      convo.splice(1, removeCount);
    }

    // 9.13. Persist updated history to disk
    saveHistory(convKey, convo);

    // 9.14. Send the reply in 2000-character chunks (Discord limit)
    const MAX_DISCORD_CHARS = 2000;
    while (botReply.length > 0) {
      let chunk = botReply.slice(0, MAX_DISCORD_CHARS);

      // Try to split at the last newline if possible
      if (chunk.length === MAX_DISCORD_CHARS && !chunk.endsWith('\n')) {
        const lastNewline = chunk.lastIndexOf('\n');
        if (lastNewline > 0) {
          chunk = chunk.slice(0, lastNewline);
        }
      }

      await message.reply(chunk.trim());
      botReply = botReply.slice(chunk.length).trim();
    }
  } catch (err) {
    console.error('❌ Error while contacting Together AI:', err);
    if (err.response) {
      console.error('   → HTTP status:', err.response.status);
      console.error('   → Response body:', JSON.stringify(err.response.data, null, 2));
    }
    await message.reply(
      '🚨 Sorry, something went wrong while contacting the AI. Please try again later.'
    );
  }
});

// 10. Listen for slash command interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'reset') return;

  const convKey = interaction.channelId;
  history.delete(convKey);

  const filePath = path.join(HISTORY_DIR, `${convKey}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await interaction.reply({
    content: '🗑️ Conversation history cleared for this channel.',
    ephemeral: true,
  });
});

// 11. Log in to Discord
client.login(process.env.DISCORD_TOKEN);
