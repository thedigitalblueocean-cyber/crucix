# TDBO AI Analyst

> Intelligence sweep and LLM analysis subsystem for the Crucix governance framework.

## Overview

The Analyst module provides multi-source OSINT intelligence gathering and AI-powered analysis within the TDBO governance layer. All operations are subject to CVS 512 validation and witness chain recording.

## Architecture

```
tdbo/analyst/
  index.mjs      - Module entry point and public API
  provider.mjs   - Multi-LLM provider router (Anthropic, OpenAI, Gemini, OpenRouter, Codex, MiniMax)
  prompts.mjs    - Structured prompt templates for analysis operations
  sweep.mjs      - Intelligence sweep orchestrator (parallel OSINT collection)
  tools.mjs      - Tool definitions and executor for API integration
```

## Modules

### provider.mjs
Routes LLM requests across six providers with automatic fallback, retry logic, and usage statistics. Zero SDK dependencies - all calls use raw `fetch`.

### prompts.mjs
Structured prompt builders for trade ideas, risk assessments, market briefs, and geopolitical analysis. Includes `summarizeSweepState()` for converting raw sweep data into LLM-consumable context.

### sweep.mjs
Orchestrates parallel data collection from OSINT sources (fires, flights, maritime, radiation, conflicts, markets, news, health, SDR). Aggregates results and triggers LLM analysis.

### tools.mjs
Defines the tool registry for API integration. Available tools: `sweep`, `analyze`, `status`, `prompt`.

## Usage

```javascript
import { SweepOrchestrator } from './tdbo/analyst/index.mjs';

const analyst = new SweepOrchestrator({
  provider: 'anthropic',
  timeout: 30000
});

// Run intelligence sweep
const sweepData = await analyst.sweep();

// Analyze collected data
const brief = await analyst.analyze('brief');
const trade = await analyst.analyze('trade');
const risk = await analyst.analyze('risk');
```

## Data Sources

| Source | API | Status |
|--------|-----|--------|
| Fires | NASA FIRMS | Configured |
| Flights | OpenSky Network | Configured |
| Maritime | TBD | Planned |
| Radiation | TBD | Planned |
| Conflicts | ACLED | Configured |
| Markets | TBD | Planned |
| News | TBD | Planned |
| Health | TBD | Planned |
| SDR | TBD | Planned |

## Environment Variables

```
ANTHROPIC_API_KEY    - Anthropic Claude API key
OPENAI_API_KEY       - OpenAI API key
GEMINI_API_KEY       - Google Gemini API key
OPENROUTER_API_KEY   - OpenRouter API key
CODEX_API_KEY        - Codex API key
MINIMAX_API_KEY      - MiniMax API key
```

## Governance

All analyst outputs are recorded in the TDBO witness chain and subject to:
- CVS 512 deterministic validation
- Evidence object creation with five-anchor integrity
- State hash tracking for accountability
- Gateway 512 output gating

## License

TDBO Proprietary - The Digital Blue Ocean Ltd (DIFC)
