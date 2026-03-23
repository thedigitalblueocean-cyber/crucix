/**
 * TDBO AI Analyst - Multi-LLM Provider Router
 *
 * Routes requests to the appropriate LLM provider based on configuration.
 * Supports Anthropic, OpenAI, Gemini, OpenRouter, Codex, and MiniMax.
 * All calls use raw fetch - zero SDK dependencies.
 *
 * TDBO Proprietary - The Digital Blue Ocean
 */

const PROVIDERS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    buildRequest(prompt, config) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: config.model || 'claude-sonnet-4-20250514',
          max_tokens: config.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      };
    },
    extractText(response) {
      return response.content?.[0]?.text || '';
    }
  },

  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    buildRequest(prompt, config) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o',
          max_tokens: config.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      };
    },
    extractText(response) {
      return response.choices?.[0]?.message?.content || '';
    }
  },

  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    envKey: 'GEMINI_API_KEY',
    buildRequest(prompt, config) {
      const model = config.model || 'gemini-pro';
      return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: config.maxTokens || 4096 }
        })
      };
    },
    extractText(response) {
      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  },

  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    buildRequest(prompt, config) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://crucix.live',
          'X-Title': 'Crucix TDBO Analyst'
        },
        body: JSON.stringify({
          model: config.model || 'anthropic/claude-sonnet-4-20250514',
          max_tokens: config.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      };
    },
    extractText(response) {
      return response.choices?.[0]?.message?.content || '';
    }
  },

  codex: {
    url: 'https://api.openai.com/v1/chat/completions',
    envKey: 'CODEX_API_KEY',
    buildRequest(prompt, config) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o',
          max_tokens: config.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      };
    },
    extractText(response) {
      return response.choices?.[0]?.message?.content || '';
    }
  },

  minimax: {
    url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    envKey: 'MINIMAX_API_KEY',
    buildRequest(prompt, config) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'abab6.5s-chat',
          messages: [{ role: 'user', content: prompt }],
          tokens_to_generate: config.maxTokens || 4096
        })
      };
    },
    extractText(response) {
      return response.choices?.[0]?.message?.content ||
             response.reply || '';
    }
  }
};

export class AnalystProvider {
  constructor(config = {}) {
    this.defaultProvider = config.provider || 'anthropic';
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 1;
    this.fallbackOrder = config.fallbackOrder || [
      'anthropic', 'openai', 'gemini', 'openrouter'
    ];
    this.stats = { calls: 0, successes: 0, failures: 0, byProvider: {} };
  }

  async call(prompt, options = {}) {
    const providerName = options.provider || this.defaultProvider;
    const providers = options.useFallback
      ? this.fallbackOrder
      : [providerName];

    let lastError = null;

    for (const name of providers) {
      const provider = PROVIDERS[name];
      if (!provider) continue;

      const apiKey = options.apiKey ||
        process.env[provider.envKey] || null;
      if (!apiKey) continue;

      const config = { ...options, apiKey };

      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          this.stats.calls++;
          this._trackProvider(name);

          const reqConfig = provider.buildRequest(prompt, config);
          const url = reqConfig.url || provider.url;
          delete reqConfig.url;

          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(), this.timeout
          );

          const response = await fetch(url, {
            ...reqConfig,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(
              `${name} HTTP ${response.status}: ${errBody.slice(0, 200)}`
            );
          }

          const data = await response.json();
          const text = provider.extractText(data);

          if (!text) {
            throw new Error(`${name} returned empty response`);
          }

          this.stats.successes++;
          return {
            text,
            provider: name,
            model: config.model || 'default',
            timestamp: Date.now(),
            latencyMs: Date.now() - (config._startTime || Date.now())
          };
        } catch (err) {
          lastError = err;
          this.stats.failures++;
          console.warn(
            `[TDBO:Analyst:Provider] ${name} attempt ${attempt + 1} failed:`,
            err.message
          );
        }
      }
    }

    throw new Error(
      `All providers failed. Last error: ${lastError?.message || 'unknown'}`
    );
  }

  _trackProvider(name) {
    if (!this.stats.byProvider[name]) {
      this.stats.byProvider[name] = { calls: 0, successes: 0, failures: 0 };
    }
    this.stats.byProvider[name].calls++;
  }

  getStats() {
    return { ...this.stats };
  }

  getAvailableProviders() {
    return Object.keys(PROVIDERS).filter(
      name => !!process.env[PROVIDERS[name].envKey]
    );
  }
}

export default AnalystProvider;
