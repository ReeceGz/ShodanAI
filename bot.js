// bot.js
import { Client, GatewayIntentBits, Partials, SlashCommandBuilder } from 'discord.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { loadHistory, saveHistory, deleteHistory } from './history.js';

dotenv.config();

// Verify required environment variables
if (!process.env.DISCORD_TOKEN || !process.env.TOGETHER_API_KEY) {
  console.error(
    '❌ Missing environment variables. Ensure your .env contains:\n' +
      '    DISCORD_TOKEN=your_discord_bot_token_here\n' +
      '    TOGETHER_API_KEY=your_together_ai_api_key_here'
  );
  process.exit(1);
}

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Initialize the OpenAI‑compatible client (Together AI)
const openai = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY,
  baseURL: 'https://api.together.xyz/v1'
});

// In-memory map to store conversation history per channel
const history = new Map();
const MAX_TURNS = 10; // user + assistant turns to keep

// Once the bot is ready, register slash commands
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const resetCmd = new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Clear conversation history for this channel');

  try {
    await client.application.commands.create(resetCmd);
    console.log('✅ /reset command registered');
  } catch (err) {
    console.error('Failed to register /reset command:', err);
  }
});

// Listen for incoming messages mentioning the bot
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const mention1 = `<@${client.user.id}>`;
  const mention2 = `<@!${client.user.id}>`;
  let userPrompt = message.content.replace(mention1, '').replace(mention2, '').trim();
  if (!userPrompt) return;

  const convKey = message.channel.id;

  if (!history.has(convKey)) {
    const initialConvo = loadHistory(convKey);
    history.set(convKey, initialConvo);
  }

  const convo = history.get(convKey);
  convo.push({ role: 'user', content: userPrompt });

  const maxEntries = 1 + MAX_TURNS * 2;
  if (convo.length > maxEntries) {
    const removeCount = convo.length - maxEntries;
    convo.splice(1, removeCount);
  }

  try {
    await message.channel.sendTyping();

    const response = await openai.chat.completions.create({
      model: 'meta-llama/Llama-3-8b-chat-hf',
      messages: convo,
      max_tokens: 1024,
      temperature: 0.7
    });

    let botReply = response.choices[0]?.message?.content?.trim() || '';
    if (!botReply) throw new Error('Empty response from Together AI');

    convo.push({ role: 'assistant', content: botReply });

    if (convo.length > maxEntries) {
      const removeCount = convo.length - maxEntries;
      convo.splice(1, removeCount);
    }

    saveHistory(convKey, convo);

    const MAX_DISCORD_CHARS = 2000;
    while (botReply.length > 0) {
      let chunk = botReply.slice(0, MAX_DISCORD_CHARS);
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
    await message.reply('🚨 Sorry, something went wrong while contacting the AI. Please try again later.');
  }
});

// Listen for slash command interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'reset') return;

  const convKey = interaction.channelId;
  history.delete(convKey);
  deleteHistory(convKey);

  await interaction.reply({
    content: '🗑️ Conversation history cleared for this channel.',
    ephemeral: true
  });
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);
