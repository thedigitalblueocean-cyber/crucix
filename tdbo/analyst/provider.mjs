/**
 * TDBO AI Analyst — Governed Multi-LLM Provider Router
 * Copyright (c) 2026 The Digital Blue Ocean Ltd (DIFC)
 *
 * Routes LLM requests with governance-aware tracking.
 * Every call records provider, model, latency, and token usage.
 * Supports Anthropic, OpenAI, Gemini, and OpenRouter.
 * All calls use raw fetch — zero SDK dependencies.
 *
 * TDBO Proprietary — The Digital Blue Ocean
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
    },
    extractUsage(response) {
      return {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0
      };
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
    },
    extractUsage(response) {
      return {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0
      };
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
    },
    extractUsage(response) {
      return {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0
      };
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
    },
    extractUsage(response) {
      return {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0
      };
    }
  }
};

/**
 * Governed analyst provider — tracks every call for audit.
 */
export class AnalystProvider {
  #defaultProvider;
  #timeout;
  #retries;
  #fallbackOrder;
  #stats;
  #callLog;

  constructor(config = {}) {
    this.#defaultProvider = config.provider || 'anthropic';
    this.#timeout = config.timeout || 30000;
    this.#retries = config.retries || 1;
    this.#fallbackOrder = config.fallbackOrder || [
      'anthropic', 'openai', 'gemini', 'openrouter'
    ];
    this.#stats = { calls: 0, successes: 0, failures: 0, totalInputTokens: 0, totalOutputTokens: 0, byProvider: {} };
    this.#callLog = [];
  }

  /**
   * Call an LLM provider with full governance tracking.
   * Returns { text, provider, model, timestamp, latencyMs, usage }.
   */
  async call(prompt, options = {}) {
    const providerName = options.provider || this.#defaultProvider;
    const providers = options.useFallback
      ? this.#fallbackOrder
      : [providerName];

    let lastError = null;

    for (const name of providers) {
      const provider = PROVIDERS[name];
      if (!provider) continue;

      const apiKey = options.apiKey || process.env[provider.envKey] || null;
      if (!apiKey) continue;

      const config = { ...options, apiKey };

      for (let attempt = 0; attempt <= this.#retries; attempt++) {
        const startTime = Date.now();
        try {
          this.#stats.calls++;
          this.#trackProvider(name, 'call');

          const reqConfig = provider.buildRequest(prompt, config);
          const url = reqConfig.url || provider.url;
          delete reqConfig.url;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

          const response = await fetch(url, {
            ...reqConfig,
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`${name} HTTP ${response.status}: ${errBody.slice(0, 200)}`);
          }

          const data = await response.json();
          const text = provider.extractText(data);
          if (!text) {
            throw new Error(`${name} returned empty response`);
          }

          const usage = provider.extractUsage(data);
          const latencyMs = Date.now() - startTime;

          this.#stats.successes++;
          this.#stats.totalInputTokens += usage.inputTokens;
          this.#stats.totalOutputTokens += usage.outputTokens;
          this.#trackProvider(name, 'success');

          const result = {
            text,
            provider: name,
            model: config.model || 'default',
            timestamp: Date.now(),
            latencyMs,
            usage
          };

          // Audit log (keep last 200 calls)
          this.#callLog.push({
            provider: name,
            model: result.model,
            latencyMs,
            usage,
            timestamp: result.timestamp,
            promptLength: prompt.length,
            responseLength: text.length
          });
          if (this.#callLog.length > 200) this.#callLog.shift();

          return result;

        } catch (err) {
          lastError = err;
          this.#stats.failures++;
          this.#trackProvider(name, 'failure');
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

  #trackProvider(name, event) {
    if (!this.#stats.byProvider[name]) {
      this.#stats.byProvider[name] = { calls: 0, successes: 0, failures: 0 };
    }
    this.#stats.byProvider[name][event === 'call' ? 'calls' : event === 'success' ? 'successes' : 'failures']++;
  }

  getStats() {
    return { ...this.#stats, callLogSize: this.#callLog.length };
  }

  getCallLog(limit = 50) {
    return this.#callLog.slice(-limit);
  }

  getAvailableProviders() {
    return Object.keys(PROVIDERS).filter(
      name => !!process.env[PROVIDERS[name].envKey]
    );
  }
}

export default AnalystProvider;
