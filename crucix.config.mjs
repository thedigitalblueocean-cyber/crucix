// Crucix Configuration — all settings with env var overrides

import "./apis/utils/env.mjs"; // Load .env first

export default {
  port: parseInt(process.env.PORT) || 3117,
  refreshIntervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 15,

  llm: {
    provider: process.env.LLM_PROVIDER || null, // anthropic | openai | gemini | codex | openrouter | minimax | mistral | ollama
    apiKey: process.env.LLM_API_KEY || null,
    model: process.env.LLM_MODEL || null,
    baseUrl: process.env.OLLAMA_BASE_URL || null,
  },

  // CVS-512 Anchor — wires TDBO governance layer to Arbitrum Sepolia
  // Set all 3 vars in .env to exit dry-run and flip I-4 LIVE
  anchor: {
    rpcUrl:          process.env.ANCHOR_RPC_URL          || null,
    contractAddress: process.env.ANCHOR_CONTRACT_ADDRESS  || null,
    privateKey:      process.env.ANCHOR_PRIVATE_KEY       || null,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || null,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
    botPollingInterval: parseInt(process.env.TELEGRAM_POLL_INTERVAL) || 5000,
    channels: process.env.TELEGRAM_CHANNELS || null,
  },

  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
    guildId: process.env.DISCORD_GUILD_ID || null,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  },

  // Delta engine thresholds — override defaults from lib/delta/engine.mjs
  delta: {
    thresholds: {
      numeric: {},
      count: {},
    },
  },
};
