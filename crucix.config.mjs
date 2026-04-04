// Crucix Configuration — all settings with env var overrides

import "./apis/utils/env.mjs"; // Load .env first

export default {
  port: parseInt(process.env.PORT) || 3117,
  refreshIntervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 15,

  llm: {
    provider: process.env.LLM_PROVIDER || null, // anthropic | openai | gemini | codex | openrouter | minimax | mistral | ollama
    apiKey: process.env.LLM_API_KEY || null,    // For openai set LLM_PROVIDER=openai and LLM_API_KEY=sk-...
    model: process.env.LLM_MODEL || null,
    baseUrl: process.env.OLLAMA_BASE_URL || null,
  },

  // CVS-512 On-chain anchor (Arbitrum Sepolia testnet)
  // Set all three to exit dry-run and flip I-4 to LIVE:
  //   ANCHOR_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
  //   ANCHOR_CONTRACT_ADDRESS=0x<deployed CVS512Anchor address>
  //   ANCHOR_PRIVATE_KEY=0x<funded Arbitrum Sepolia wallet key>
  anchor: {
    rpcUrl:          process.env.ANCHOR_RPC_URL          || null,
    contractAddress: process.env.ANCHOR_CONTRACT_ADDRESS || null,
    privateKey:      process.env.ANCHOR_PRIVATE_KEY      || null,
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || null,
    chatId: process.env.TELEGRAM_CHAT_ID || null,
    botPollingInterval: parseInt(process.env.TELEGRAM_POLL_INTERVAL) || 5000,
    channels: process.env.TELEGRAM_CHANNELS || null, // Comma-separated extra channel IDs
  },

  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || null,
    channelId: process.env.DISCORD_CHANNEL_ID || null,
    guildId: process.env.DISCORD_GUILD_ID || null, // Server ID (for instant slash command registration)
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || null, // Fallback: webhook-only alerts (no bot needed)
  },

  // Delta engine thresholds — override defaults from lib/delta/engine.mjs
  // Set to null to use built-in defaults
  delta: {
    thresholds: {
      numeric: {
        // Example overrides (uncomment to customize):
        // vix: 3,       // more sensitive to VIX moves
        // wti: 5,       // less sensitive to oil moves
      },
      count: {
        // urgent_posts: 3,     // need ±3 urgent posts to flag
        // thermal_total: 1000, // need ±1000 thermal detections
      },
    },
  },
};
