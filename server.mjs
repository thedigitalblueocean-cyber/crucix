#!/usr/bin/env node
// Crucix Intelligence Engine — Dev Server
// Serves the Jarvis dashboard, runs sweep cycle, pushes live updates via SSE
import express from 'express';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import config from './crucix.config.mjs';
import { getLocale, currentLanguage, getSupportedLocales } from './lib/i18n.mjs';
import { fullBriefing } from './apis/briefing.mjs';
import { synthesize, generateIdeas } from './dashboard/inject.mjs';
import { MemoryManager } from './lib/delta/index.mjs';
import { createLLMProvider } from './lib/llm/index.mjs';
import { generateLLMIdeas } from './lib/llm/ideas.mjs';
import { TelegramAlerter } from './lib/alerts/telegram.mjs';
import { DiscordAlerter } from './lib/alerts/discord.mjs';
import * as tdbo from './tdbo/index.mjs';
import * as analyst from './tdbo/analyst/index.mjs';
import { EvidenceObject } from './tdbo/cvs512/evidence_object.mjs';
import { WitnessChain } from './tdbo/cvs512/witness_chain.mjs';

// ── TDBO hook wrappers (classes must be called via static methods / instances) ──
const _witnessChainInstance = new WitnessChain();
const createEvidenceObjectHook = (payload, eventType, meta) =>
  EvidenceObject.create(payload, eventType, meta);
const appendWitnessHook = (eo) => _witnessChainInstance.append(eo);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const RUNS_DIR = join(ROOT, 'runs');
const MEMORY_DIR = join(RUNS_DIR, 'memory');

for (const dir of [RUNS_DIR, MEMORY_DIR, join(MEMORY_DIR, 'cold')]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let currentData = null;
let lastSweepTime = null;
let sweepStartedAt = null;
let sweepInProgress = false;
const startTime = Date.now();
const sseClients = new Set();

const memory = new MemoryManager(RUNS_DIR);

const llmProvider = createLLMProvider(config.llm);
const telegramAlerter = new TelegramAlerter(config.telegram);
const discordAlerter = new DiscordAlerter(config.discord || {});

if (llmProvider) console.log(`[Crucix] LLM enabled: ${llmProvider.name} (${llmProvider.model})`);
if (telegramAlerter.isConfigured) {
  console.log('[Crucix] Telegram alerts enabled');
  telegramAlerter.onCommand('/status', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const sourcesOk = currentData?.meta?.sourcesOk || 0;
    const sourcesTotal = currentData?.meta?.sourcesQueried || 0;
    const sourcesFailed = currentData?.meta?.sourcesFailed || 0;
    const llmStatus = llmProvider?.isConfigured ? `\u2705 ${llmProvider.name}` : '\u274c Disabled';
    const nextSweep = lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()
      : 'pending';
    return [
      `\ud83d\udda5\ufe0f *CRUCIX STATUS*`,
      ``,
      `Uptime: ${h}h ${m}m`,
      `Last sweep: ${lastSweepTime ? new Date(lastSweepTime).toLocaleTimeString() + ' UTC' : 'never'}`,
      `Next sweep: ${nextSweep} UTC`,
      `Sweep in progress: ${sweepInProgress ? '\ud83d\udd04 Yes' : '\u23f8\ufe0f No'}`,
      `Sources: ${sourcesOk}/${sourcesTotal} OK${sourcesFailed > 0 ? ` (${sourcesFailed} failed)` : ''}`,
      `LLM: ${llmStatus}`,
      `SSE clients: ${sseClients.size}`,
      `Dashboard: http://localhost:${config.port}`,
    ].join('\n');
  });
  telegramAlerter.onCommand('/sweep', async () => {
    if (sweepInProgress) return '\ud83d\udd04 Sweep already in progress. Please wait.';
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '\ud83d\ude80 Manual sweep triggered. You\'ll receive alerts if anything significant is detected.';
  });
  telegramAlerter.onCommand('/brief', async () => {
    if (!currentData) return '\u23f3 No data yet \u2014 waiting for first sweep to complete.';
    const tg = currentData.tg || {};
    const energy = currentData.energy || {};
    const delta = memory.getLastDelta();
    const ideas = (currentData.ideas || []).slice(0, 3);
    const sections = [
      `\ud83d\udccb *CRUCIX BRIEF*`,
      `_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_`,
      ``,
    ];
    if (delta?.summary) {
      const dirEmoji = { 'risk-off': '\ud83d\udcc9', 'risk-on': '\ud83d\udcc8', 'mixed': '\u2194\ufe0f' }[delta.summary.direction] || '\u2194\ufe0f';
      sections.push(`${dirEmoji} Direction: *${delta.summary.direction.toUpperCase()}* | ${delta.summary.totalChanges} changes, ${delta.summary.criticalChanges} critical`);
      sections.push('');
    }
    const vix = currentData.fred?.find(f => f.id === 'VIXCLS');
    const hy = currentData.fred?.find(f => f.id === 'BAMLH0A0HYM2');
    if (vix || energy.wti) {
      sections.push(`\ud83d\udcca VIX: ${vix?.value || '--'} | WTI: $${energy.wti || '--'} | Brent: $${energy.brent || '--'}`);
      if (hy) sections.push(`  HY Spread: ${hy.value} | NatGas: $${energy.natgas || '--'}`);
      sections.push('');
    }
    if (tg.urgent?.length > 0) {
      sections.push(`\ud83d\udce1 OSINT: ${tg.urgent.length} urgent signals, ${tg.posts || 0} total posts`);
      for (const p of tg.urgent.slice(0, 2)) {
        sections.push(`  \u2022 ${(p.text || '').substring(0, 80)}`);
      }
      sections.push('');
    }
    if (ideas.length > 0) {
      sections.push(`\ud83d\udca1 *Top Ideas:*`);
      for (const idea of ideas) {
        sections.push(`  ${idea.type === 'long' ? '\ud83d\udcc8' : idea.type === 'hedge' ? '\ud83d\udee1\ufe0f' : '\ud83d\udc41\ufe0f'} ${idea.title}`);
      }
    }
    return sections.join('\n');
  });
  telegramAlerter.onCommand('/portfolio', async () => {
    return '\ud83d\udcca Portfolio integration requires Alpaca MCP connection.\nUse the Crucix dashboard or Claude agent for portfolio queries.';
  });
  telegramAlerter.startPolling(config.telegram.botPollingInterval);
}
if (discordAlerter.isConfigured) {
  console.log('[Crucix] Discord bot enabled');
  discordAlerter.onCommand('status', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const sourcesOk = currentData?.meta?.sourcesOk || 0;
    const sourcesTotal = currentData?.meta?.sourcesQueried || 0;
    const sourcesFailed = currentData?.meta?.sourcesFailed || 0;
    const llmStatus = llmProvider?.isConfigured ? `\u2705 ${llmProvider.name}` : '\u274c Disabled';
    const nextSweep = lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()
      : 'pending';
    return [
      `**\ud83d\udda5\ufe0f CRUCIX STATUS**\n`,
      `Uptime: ${h}h ${m}m`,
      `Last sweep: ${lastSweepTime ? new Date(lastSweepTime).toLocaleTimeString() + ' UTC' : 'never'}`,
      `Next sweep: ${nextSweep} UTC`,
      `Sweep in progress: ${sweepInProgress ? '\ud83d\udd04 Yes' : '\u23f8\ufe0f No'}`,
      `Sources: ${sourcesOk}/${sourcesTotal} OK${sourcesFailed > 0 ? ` (${sourcesFailed} failed)` : ''}`,
      `LLM: ${llmStatus}`,
      `SSE clients: ${sseClients.size}`,
      `Dashboard: http://localhost:${config.port}`,
    ].join('\n');
  });
  discordAlerter.onCommand('sweep', async () => {
    if (sweepInProgress) return '\ud83d\udd04 Sweep already in progress. Please wait.';
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '\ud83d\ude80 Manual sweep triggered. You\'ll receive alerts if anything significant is detected.';
  });
  discordAlerter.onCommand('brief', async () => {
    if (!currentData) return '\u23f3 No data yet \u2014 waiting for first sweep to complete.';
    const tg = currentData.tg || {};
    const energy = currentData.energy || {};
    const delta = memory.getLastDelta();
    const ideas = (currentData.ideas || []).slice(0, 3);
    const sections = [`**\ud83d\udccb CRUCIX BRIEF**\n_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_\n`];
    if (delta?.summary) {
      const dirEmoji = { 'risk-off': '\ud83d\udcc9', 'risk-on': '\ud83d\udcc8', 'mixed': '\u2194\ufe0f' }[delta.summary.direction] || '\u2194\ufe0f';
      sections.push(`${dirEmoji} Direction: **${delta.summary.direction.toUpperCase()}** | ${delta.summary.totalChanges} changes, ${delta.summary.criticalChanges} critical\n`);
    }
    const vix = currentData.fred?.find(f => f.id === 'VIXCLS');
    const hy = currentData.fred?.find(f => f.id === 'BAMLH0A0HYM2');
    if (vix || energy.wti) {
      sections.push(`\ud83d\udcca VIX: ${vix?.value || '--'} | WTI: $${energy.wti || '--'} | Brent: $${energy.brent || '--'}`);
      if (hy) sections.push(`  HY Spread: ${hy.value} | NatGas: $${energy.natgas || '--'}`);
      sections.push('');
    }
    if (tg.urgent?.length > 0) {
      sections.push(`\ud83d\udce1 OSINT: ${tg.urgent.length} urgent signals, ${tg.posts || 0} total posts`);
      for (const p of tg.urgent.slice(0, 2)) {
        sections.push(`  \u2022 ${(p.text || '').substring(0, 80)}`);
      }
      sections.push('');
    }
    if (ideas.length > 0) {
      sections.push(`**\ud83d\udca1 Top Ideas:**`);
      for (const idea of ideas) {
        sections.push(`  ${idea.type === 'long' ? '\ud83d\udcc8' : idea.type === 'hedge' ? '\ud83d\udee1\ufe0f' : '\ud83d\udc41\ufe0f'} ${idea.title}`);
      }
    }
    return sections.join('\n');
  });
  discordAlerter.onCommand('portfolio', async () => {
    return '\ud83d\udcca Portfolio integration requires Alpaca MCP connection.\nUse the Crucix dashboard or Claude agent for portfolio queries.';
  });
  discordAlerter.start().catch(err => {
    console.error('[Crucix] Discord bot startup failed (non-fatal):', err.message);
  });
}
const app = express();
app.use(express.static(join(ROOT, 'dashboard/public')));

app.get('/', (req, res) => {
  if (!currentData) {
    res.sendFile(join(ROOT, 'dashboard/public/loading.html'));
  } else {
    const htmlPath = join(ROOT, 'dashboard/public/jarvis.html');
    let html = readFileSync(htmlPath, 'utf-8');
    const locale = getLocale();
    const localeScript = `<script>window.__CRUCIX_LOCALE__ = ${JSON.stringify(locale).replace(/<\/script>/gi, '<\\/script>')};<\/script>`;
    html = html.replace('</head>', `${localeScript}\n</head>`);
    res.type('html').send(html);
  }
});

app.get('/api/data', (req, res) => {
  if (!currentData) return res.status(503).json({ error: 'No data yet \u2014 first sweep in progress' });
  res.json(currentData);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastSweep: lastSweepTime,
    nextSweep: lastSweepTime
      ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toISOString()
      : null,
    sweepInProgress,
    sweepStartedAt,
    sourcesOk: currentData?.meta?.sourcesOk || 0,
    sourcesFailed: currentData?.meta?.sourcesFailed || 0,
    llmEnabled: !!config.llm.provider,
    llmProvider: config.llm.provider,
    telegramEnabled: !!(config.telegram.botToken && config.telegram.chatId),
    refreshIntervalMinutes: config.refreshIntervalMinutes,
    language: currentLanguage,
  });
});

app.get('/api/tdbo/status', (req, res) => {
  const baseStatus = tdbo.getStatus ? tdbo.getStatus() : {};
  const analystStatus = analyst.getAnalystStats ? analyst.getAnalystStats() : {};
  res.json({ ...baseStatus, analyst: analystStatus });
});

app.get('/api/locales', (req, res) => {
  res.json({
    current: currentLanguage,
    supported: getSupportedLocales(),
  });
});

app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

async function runSweepCycle() {
  if (sweepInProgress) {
    console.log('[Crucix] Sweep already in progress, skipping');
    return;
  }
  sweepInProgress = true;
  sweepStartedAt = new Date().toISOString();
  broadcast({ type: 'sweep_start', timestamp: sweepStartedAt });
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Crucix] Starting sweep at ${new Date().toLocaleTimeString()}`);
  console.log(`${'='.repeat(60)}`);
  try {
    // 1. Run the full briefing sweep
    const rawData = await fullBriefing();
    // 2. Save to runs/latest.json
    writeFileSync(join(RUNS_DIR, 'latest.json'), JSON.stringify(rawData, null, 2));
    lastSweepTime = new Date().toISOString();
    // 3. Synthesize into dashboard format
    console.log('[Crucix] Synthesizing dashboard data...');
    const synthesized = await synthesize(rawData);

    // 3b. TDBO 512/CVS: export sweep state + run governed analyst
    const sweepData = {
      sources: (Array.isArray(rawData.sources)
        ? rawData.sources
        : Object.values(rawData.sources || {})
      ).map(src => ({
        id: src.id || src.source_id,
        source_id: src.source_id || src.id,
        events: Array.isArray(src.events) ? src.events : [],
        count: Array.isArray(src.events) ? src.events.length : 0,
      })),
      market: rawData.market || {},
      alerts: rawData.alerts || [],
    };

    // onSweepComplete returns an EvidenceObject (frozen); extract id as sweep_id
    const sweepEvidence = await Promise.resolve(tdbo.onSweepComplete(sweepData));
    sweepData.sweep_id = sweepEvidence?.id || `sweep_${Date.now()}`;
    const sweepStateHash = sweepEvidence?.evidence_hash || null;
    console.log(`[TDBO] Sweep EO id: ${sweepData.sweep_id}`);

    const analysisResults = await analyst.analyzeSweep(sweepData, (output) => {
      if (output.type === 'trade_idea') {
        const idea = output.data;
        if (!synthesized.ideas) synthesized.ideas = [];
        synthesized.ideas.push({
          title: idea.content,
          type: (idea.direction || 'monitor').toLowerCase(),
          source: 'tdbo-analyst',
          eoId: idea.eo_id,
          confidence: idea.confidence,
          timeframe: idea.timeframe,
        });
        if (telegramAlerter.isConfigured) {
          telegramAlerter.sendManualAlert(
            `\ud83d\udca1 TRADE IDEA (${idea.direction || 'MONITOR'})\n` +
            `${idea.content}\n` +
            `Confidence: ${(idea.confidence * 100).toFixed(0)}% | Sources: ${(idea.sources_cited || []).join(', ')}\n` +
            `Timeframe: ${idea.timeframe || 'N/A'} | Risk: ${idea.risk || 'N/A'}\n` +
            `EO: ${idea.eo_id}`
          ).catch(() => {});
        }
        if (discordAlerter.isConfigured) {
          discordAlerter.sendManualAlert(
            `\ud83d\udca1 TRADE IDEA (${idea.direction || 'MONITOR'})\n` +
            `${idea.content}\n` +
            `Confidence: ${(idea.confidence * 100).toFixed(0)}% | Sources: ${(idea.sources_cited || []).join(', ')}\n` +
            `Timeframe: ${idea.timeframe || 'N/A'} | Risk: ${idea.risk || 'N/A'}\n` +
            `EO: ${idea.eo_id}`
          ).catch(() => {});
        }
      } else if (output.type === 'alert') {
        // Future: map governed alerts into existing Telegram/Discord pipelines
      }
    });

    synthesized.tdbo = {
      sweepId: sweepData.sweep_id,
      stateHash: sweepStateHash,
      ideasGenerated: analysisResults?.ideas?.length || 0,
      ideasAdmitted: analysisResults?.ideas?.filter(i => i.status === 'ADMITTED').length || 0,
      ideasRefused: analysisResults?.ideas?.filter(i => i.status === 'REFUSED').length || 0,
    };

    // 4. Delta computation + memory
    const delta = memory.addRun(synthesized);
    synthesized.delta = delta;

    // 5. LLM-powered trade ideas (original Crucix LLM path — runs in parallel to TDBO analyst)
    if (llmProvider?.isConfigured) {
      try {
        console.log('[Crucix] Generating LLM trade ideas...');
        const previousIdeas = memory.getLastRun()?.ideas || [];
        const llmIdeas = await generateLLMIdeas(llmProvider, synthesized, delta, previousIdeas);
        if (llmIdeas) {
          synthesized.ideas = llmIdeas;
          synthesized.ideasSource = 'llm';
          console.log(`[Crucix] LLM generated ${llmIdeas.length} ideas`);
        } else {
          synthesized.ideas = synthesized.ideas || [];
          synthesized.ideasSource = 'llm-failed';
        }
      } catch (llmErr) {
        console.error('[Crucix] LLM ideas failed (non-fatal):', llmErr.message);
        synthesized.ideas = synthesized.ideas || [];
        synthesized.ideasSource = 'llm-failed';
      }
    } else {
      synthesized.ideas = synthesized.ideas || [];
      synthesized.ideasSource = 'disabled';
    }

    // 6. Alert evaluation
    if (delta?.summary?.totalChanges > 0) {
      if (telegramAlerter.isConfigured) {
        telegramAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => {
          console.error('[Crucix] Telegram alert error:', err.message);
        });
      }
      if (discordAlerter.isConfigured) {
        discordAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => {
          console.error('[Crucix] Discord alert error:', err.message);
        });
      }
    }
    memory.pruneAlertedSignals();
    currentData = synthesized;
    broadcast({ type: 'update', data: currentData });
    console.log(`[Crucix] Sweep complete \u2014 ${currentData.meta.sourcesOk}/${currentData.meta.sourcesQueried} sources OK`);
    console.log(`[Crucix] ${currentData.ideas.length} ideas (${synthesized.ideasSource}) | ${currentData.news.length} news | ${currentData.newsFeed.length} feed items`);
    if (delta?.summary) console.log(`[Crucix] Delta: ${delta.summary.totalChanges} changes, ${delta.summary.criticalChanges} critical, direction: ${delta.summary.direction}`);
    console.log(`[Crucix] Next sweep at ${new Date(Date.now() + config.refreshIntervalMinutes * 60000).toLocaleTimeString()}`);
  } catch (err) {
    console.error('[Crucix] Sweep failed:', err.message);
    broadcast({ type: 'sweep_error', error: err.message });
  } finally {
    sweepInProgress = false;
  }
}

async function start() {
  const port = config.port;

  // === TDBO 512/CVS + Analyst Init ===
  await tdbo.init({
    anchorInterval:   4,
    anchorRpc:        process.env.ANCHOR_RPC_URL,
    anchorContract:   process.env.ANCHOR_CONTRACT_ADDRESS,
    anchorPrivateKey: process.env.ANCHOR_PRIVATE_KEY,
  });

  // Register sources and LLM providers into the DOS manifest
  const resolvedLlmProvider = process.env.LLM_PROVIDER || config.llm?.provider;
  const sourceIds = Array.isArray(config.sources)
    ? config.sources.map(s => s.id || s.name || String(s))
    : (typeof config.sources === 'number' ? Array.from({ length: config.sources }, (_, i) => `source_${i + 1}`) : []);
  tdbo.registerManifest(
    sourceIds,
    resolvedLlmProvider ? [resolvedLlmProvider] : []
  );

  analyst.initAnalyst(
    {
      provider: resolvedLlmProvider,
      apiKey:   process.env.LLM_API_KEY   || config.llm?.apiKey,
      model:    process.env.LLM_MODEL     || config.llm?.model,
    },
    {
      gateLlmOutput:        tdbo.gateLlmOutput,
      createEvidenceObject: createEvidenceObjectHook,
      appendWitness:        appendWitnessHook,
    }
  );

  console.log(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551 CRUCIX INTELLIGENCE ENGINE              \u2551
  \u2551 Local Palantir \u00b7 26 Sources             \u2551
  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
  \u2551 Dashboard: http://localhost:${port}${' '.repeat(14 - String(port).length)}\u2551
  \u2551 Health:    http://localhost:${port}/api/health${' '.repeat(4 - String(port).length)}\u2551
  \u2551 Refresh:   Every ${config.refreshIntervalMinutes} min${' '.repeat(20 - String(config.refreshIntervalMinutes).length)}\u2551
  \u2551 LLM:       ${(config.llm.provider || 'disabled').padEnd(31)}\u2551
  \u2551 Telegram:  ${config.telegram.botToken ? 'enabled' : 'disabled'}${' '.repeat(config.telegram.botToken ? 24 : 23)}\u2551
  \u2551 Discord:   ${config.discord?.botToken ? 'enabled' : config.discord?.webhookUrl ? 'webhook only' : 'disabled'}${' '.repeat(config.discord?.botToken ? 24 : config.discord?.webhookUrl ? 20 : 23)}\u2551
  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
  `);

  const server = app.listen(port);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Crucix] FATAL: Port ${port} is already in use!`);
      console.error(`[Crucix] A previous Crucix instance may still be running.`);
      console.error(`[Crucix] Fix: taskkill /F /IM node.exe (Windows)`);
      console.error(`[Crucix] kill $(lsof -ti:${port}) (macOS/Linux)`);
      console.error(`[Crucix] Or change PORT in .env\n`);
    } else {
      console.error(`[Crucix] Server error:`, err.stack || err.message);
    }
    process.exit(1);
  });
  server.on('listening', async () => {
    console.log(`[Crucix] Server running on http://localhost:${port}`);
    const openCmd = process.platform === 'win32' ? 'cmd /c start ""' :
      process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${openCmd} "http://localhost:${port}"`, (err) => {
      if (err) console.log('[Crucix] Could not auto-open browser:', err.message);
    });
    try {
      const existing = JSON.parse(readFileSync(join(RUNS_DIR, 'latest.json'), 'utf8'));
      const data = await synthesize(existing);
      currentData = data;
      console.log('[Crucix] Loaded existing data from runs/latest.json \u2014 dashboard ready instantly');
      broadcast({ type: 'update', data: currentData });
    } catch {
      console.log('[Crucix] No existing data found \u2014 first sweep required');
    }
    console.log('[Crucix] Running initial sweep...');
    runSweepCycle().catch(err => {
      console.error('[Crucix] Initial sweep failed:', err.message || err);
    });
    setInterval(runSweepCycle, config.refreshIntervalMinutes * 60 * 1000);
  });
}

process.on('unhandledRejection', (err) => {
  console.error('[Crucix] Unhandled rejection:', err?.stack || err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[Crucix] Uncaught exception:', err?.stack || err?.message || err);
});
start().catch(err => {
  console.error('[Crucix] FATAL \u2014 Server failed to start:', err?.stack || err?.message || err);
  process.exit(1);
});
