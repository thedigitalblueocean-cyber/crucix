/**
 * TDBO AI Analyst - Tool Definitions
 *
 * Defines the available analyst tools that can be invoked via the API.
 * Each tool has a schema, handler, and governance metadata.
 *
 * TDBO Proprietary - The Digital Blue Ocean
 */

import { SweepOrchestrator } from './sweep.mjs';
import { AnalystProvider } from './provider.mjs';
import {
  buildTradeIdeaPrompt,
  buildRiskAssessmentPrompt,
  buildMarketBriefPrompt,
  buildGeopoliticalPrompt
} from './prompts.mjs';

/**
 * Tool registry - defines all available analyst capabilities
 */
const TOOLS = {
  sweep: {
    name: 'sweep',
    description: 'Execute an intelligence sweep across configured OSINT sources',
    parameters: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of sources to sweep (default: all)'
        }
      }
    },
    async handler(params, context) {
      const orchestrator = context.orchestrator || new SweepOrchestrator(context.config);
      const result = await orchestrator.sweep(params);
      return {
        tool: 'sweep',
        sourcesCollected: Object.keys(result).length,
        sources: Object.keys(result),
        timestamp: Date.now()
      };
    }
  },

  analyze: {
    name: 'analyze',
    description: 'Run LLM analysis on collected sweep data',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['brief', 'trade', 'risk', 'geopolitical'],
          description: 'Type of analysis to perform'
        },
        provider: {
          type: 'string',
          description: 'LLM provider to use (default: anthropic)'
        }
      },
      required: ['type']
    },
    async handler(params, context) {
      const orchestrator = context.orchestrator;
      if (!orchestrator || Object.keys(orchestrator.getState()).length === 0) {
        throw new Error('No sweep data available. Run sweep tool first.');
      }
      return await orchestrator.analyze(params.type, {
        provider: params.provider
      });
    }
  },

  status: {
    name: 'status',
    description: 'Get current analyst system status and statistics',
    parameters: { type: 'object', properties: {} },
    async handler(_params, context) {
      const orchestrator = context.orchestrator;
      const provider = context.provider || new AnalystProvider();
      return {
        tool: 'status',
        sweep: orchestrator ? orchestrator.getStats() : null,
        provider: provider.getStats(),
        availableProviders: provider.getAvailableProviders(),
        timestamp: Date.now()
      };
    }
  },

  prompt: {
    name: 'prompt',
    description: 'Generate a prompt from sweep data without running LLM inference',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['trade', 'risk', 'brief', 'geopolitical'],
          description: 'Prompt type to generate'
        }
      },
      required: ['type']
    },
    async handler(params, context) {
      const state = context.orchestrator?.getState() || {};
      let prompt;
      switch (params.type) {
        case 'trade':
          prompt = buildTradeIdeaPrompt(state, params);
          break;
        case 'risk':
          prompt = buildRiskAssessmentPrompt(state, params);
          break;
        case 'geopolitical':
          prompt = buildGeopoliticalPrompt(state, params.region);
          break;
        case 'brief':
        default:
          prompt = buildMarketBriefPrompt(state, params);
          break;
      }
      return {
        tool: 'prompt',
        type: params.type,
        prompt,
        promptLength: prompt.length,
        timestamp: Date.now()
      };
    }
  }
};

/**
 * Get all registered tools
 */
export function getTools() {
  return Object.values(TOOLS).map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

/**
 * Execute a tool by name
 */
export async function executeTool(name, params = {}, context = {}) {
  const tool = TOOLS[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}. Available: ${Object.keys(TOOLS).join(', ')}`);
  }

  const startTime = Date.now();
  try {
    const result = await tool.handler(params, context);
    return {
      success: true,
      ...result,
      executionMs: Date.now() - startTime
    };
  } catch (err) {
    return {
      success: false,
      tool: name,
      error: err.message,
      executionMs: Date.now() - startTime
    };
  }
}

/**
 * Get tool schema for a specific tool
 */
export function getToolSchema(name) {
  const tool = TOOLS[name];
  if (!tool) return null;
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  };
}

export default { getTools, executeTool, getToolSchema };
