/**
 * TDBO AI Analyst - Module Entry Point
 *
 * Public API for the analyst subsystem.
 * Exports all components needed to run intelligence sweeps and analysis.
 *
 * TDBO Proprietary - The Digital Blue Ocean
 */

export { AnalystProvider } from './provider.mjs';
export { SweepOrchestrator } from './sweep.mjs';
export { getTools, executeTool, getToolSchema } from './tools.mjs';
export {
  buildTradeIdeaPrompt,
  buildRiskAssessmentPrompt,
  buildMarketBriefPrompt,
  buildGeopoliticalPrompt,
  summarizeSweepState
} from './prompts.mjs';

/**
 * Create a fully configured analyst instance
 */
export function createAnalyst(config = {}) {
  const { SweepOrchestrator: Sweep } = await_import('./sweep.mjs');
  return new Sweep(config);
}

// Convenience: default export bundles everything
export default {
  AnalystProvider: (await import('./provider.mjs')).AnalystProvider,
  SweepOrchestrator: (await import('./sweep.mjs')).SweepOrchestrator
};
