/**
 * TDBO AI Analyst - Intelligence Sweep Orchestrator
 *
 * Coordinates parallel data collection from multiple OSINT sources,
 * aggregates results into a unified sweep state, and triggers analysis.
 *
 * TDBO Proprietary - The Digital Blue Ocean
 */

import { AnalystProvider } from './provider.mjs';
import { buildTradeIdeaPrompt, buildRiskAssessmentPrompt, buildMarketBriefPrompt } from './prompts.mjs';

const DEFAULT_SOURCES = [
  'fires', 'flights', 'maritime', 'radiation',
  'conflicts', 'markets', 'news', 'health', 'sdr'
];

const SOURCE_ENDPOINTS = {
  fires: { url: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv', timeout: 10000 },
  flights: { url: 'https://opensky-network.org/api/states/all', timeout: 15000 },
  maritime: { url: null, timeout: 10000 },
  radiation: { url: null, timeout: 10000 },
  conflicts: { url: 'https://api.acleddata.com/acled/read', timeout: 15000 },
  markets: { url: null, timeout: 10000 },
  news: { url: null, timeout: 10000 },
  health: { url: null, timeout: 10000 },
  sdr: { url: null, timeout: 10000 }
};

export class SweepOrchestrator {
  constructor(config = {}) {
    this.sources = config.sources || DEFAULT_SOURCES;
    this.timeout = config.timeout || 30000;
    this.provider = config.provider || new AnalystProvider(config.providerConfig);
    this.state = {};
    this.lastSweep = null;
    this.sweepCount = 0;
    this.errors = [];
  }

  /**
   * Execute a full intelligence sweep across all configured sources
   */
  async sweep(options = {}) {
    const startTime = Date.now();
    const sources = options.sources || this.sources;
    this.errors = [];

    console.log(`[TDBO:Analyst:Sweep] Starting sweep across ${sources.length} sources...`);

    const results = await Promise.allSettled(
      sources.map(source => this._fetchSource(source, options))
    );

    const sweepState = {};
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled' && result.value) {
        sweepState[source] = result.value;
      } else {
        const error = result.reason?.message || 'Unknown error';
        this.errors.push({ source, error, timestamp: Date.now() });
        console.warn(`[TDBO:Analyst:Sweep] ${source} failed: ${error}`);
      }
    });

    this.state = sweepState;
    this.lastSweep = {
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      sourcesAttempted: sources.length,
      sourcesSucceeded: Object.keys(sweepState).length,
      errors: this.errors.length
    };
    this.sweepCount++;

    console.log(
      `[TDBO:Analyst:Sweep] Complete: ${this.lastSweep.sourcesSucceeded}/${sources.length} sources in ${this.lastSweep.duration}ms`
    );

    return sweepState;
  }

  /**
   * Fetch data from a single source
   */
  async _fetchSource(source, options = {}) {
    const endpoint = SOURCE_ENDPOINTS[source];
    if (!endpoint || !endpoint.url) {
      // Source not yet configured - return null silently
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      endpoint.timeout || this.timeout
    );

    try {
      const response = await fetch(endpoint.url, {
        signal: controller.signal,
        headers: options.headers || {}
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        return await response.json();
      }
      return await response.text();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Run analysis on current sweep state using the LLM provider
   */
  async analyze(type = 'brief', options = {}) {
    if (!this.state || Object.keys(this.state).length === 0) {
      throw new Error('No sweep data available. Run sweep() first.');
    }

    let prompt;
    switch (type) {
      case 'trade':
        prompt = buildTradeIdeaPrompt(this.state, options);
        break;
      case 'risk':
        prompt = buildRiskAssessmentPrompt(this.state, options);
        break;
      case 'brief':
      default:
        prompt = buildMarketBriefPrompt(this.state, options);
        break;
    }

    const result = await this.provider.call(prompt, {
      useFallback: true,
      ...options
    });

    // Attempt to parse JSON from LLM response
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result.parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      result.parsed = null;
    }

    return {
      ...result,
      analysisType: type,
      sweepMeta: this.lastSweep
    };
  }

  /**
   * Get current sweep state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Get sweep statistics
   */
  getStats() {
    return {
      sweepCount: this.sweepCount,
      lastSweep: this.lastSweep,
      errors: [...this.errors],
      providerStats: this.provider.getStats()
    };
  }
}

export default SweepOrchestrator;
