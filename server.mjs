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
import { synthesize, synthesizeFast, generateIdeas } from './dashboard/inject.mjs';
import { MemoryManager } from './lib/delta/index.mjs';
import { createLLMProvider } from './lib/llm/index.mjs';
import { generateLLMIdeas } from './lib/llm/ideas.mjs';
import { TelegramAlerter } from './lib/alerts/telegram.mjs';
import { DiscordAlerter } from './lib/alerts/discord.mjs';
import * as tdbo from './tdbo/index.mjs';
import * as analyst from './tdbo/analyst/index.mjs';
import { EvidenceObject } from './tdbo/cvs512/evidence_object.mjs';
import { WitnessChain } from './tdbo/cvs512/witness_chain.mjs';

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
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60);
    const sourcesOk = currentData?.meta?.sourcesOk || 0;
    const sourcesTotal = currentData?.meta?.sourcesQueried || 0;
    const sourcesFailed = currentData?.meta?.sourcesFailed || 0;
    const llmStatus = llmProvider?.isConfigured ? `\u2705 ${llmProvider.name}` : '\u274c Disabled';
    const nextSweep = lastSweepTime ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toLocaleTimeString() : 'pending';
    return [`\ud83d\udda5\ufe0f *CRUCIX STATUS*`, ``, `Uptime: ${h}h ${m}m`, `Last sweep: ${lastSweepTime ? new Date(lastSweepTime).toLocaleTimeString() + ' UTC' : 'never'}`, `Next sweep: ${nextSweep} UTC`, `Sweep in progress: ${sweepInProgress ? '\ud83d\udd04 Yes' : '\u23f8\ufe0f No'}`, `Sources: ${sourcesOk}/${sourcesTotal} OK${sourcesFailed > 0 ? ` (${sourcesFailed} failed)` : ''}`, `LLM: ${llmStatus}`, `SSE clients: ${sseClients.size}`, `Dashboard: http://localhost:${config.port}`].join('\n');
  });
  telegramAlerter.onCommand('/sweep', async () => {
    if (sweepInProgress) return '\ud83d\udd04 Sweep already in progress. Please wait.';
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '\ud83d\ude80 Manual sweep triggered.';
  });
  telegramAlerter.onCommand('/brief', async () => {
    if (!currentData) return '\u23f3 No data yet \u2014 waiting for first sweep to complete.';
    const tg = currentData.tg || {}, energy = currentData.energy || {};
    const delta = memory.getLastDelta(), ideas = (currentData.ideas || []).slice(0, 3);
    const sections = [`\ud83d\udccb *CRUCIX BRIEF*`, `_${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC_`, ``];
    if (delta?.summary) { const d = { 'risk-off': '\ud83d\udcc9', 'risk-on': '\ud83d\udcc8', 'mixed': '\u2194\ufe0f' }[delta.summary.direction] || '\u2194\ufe0f'; sections.push(`${d} Direction: *${delta.summary.direction.toUpperCase()}* | ${delta.summary.totalChanges} changes`); sections.push(''); }
    const vix = currentData.fred?.find(f => f.id === 'VIXCLS'), hy = currentData.fred?.find(f => f.id === 'BAMLH0A0HYM2');
    if (vix || energy.wti) { sections.push(`\ud83d\udcca VIX: ${vix?.value || '--'} | WTI: $${energy.wti || '--'} | Brent: $${energy.brent || '--'}`); if (hy) sections.push(`  HY Spread: ${hy.value} | NatGas: $${energy.natgas || '--'}`); sections.push(''); }
    if (tg.urgent?.length > 0) { sections.push(`\ud83d\udce1 OSINT: ${tg.urgent.length} urgent signals`); for (const p of tg.urgent.slice(0, 2)) sections.push(`  \u2022 ${(p.text || '').substring(0, 80)}`); sections.push(''); }
    if (ideas.length > 0) { sections.push(`\ud83d\udca1 *Top Ideas:*`); for (const idea of ideas) sections.push(`  ${idea.type === 'long' ? '\ud83d\udcc8' : idea.type === 'hedge' ? '\ud83d\udee1\ufe0f' : '\ud83d\udc41\ufe0f'} ${idea.title}`); }
    return sections.join('\n');
  });
  telegramAlerter.onCommand('/portfolio', async () => '\ud83d\udcca Portfolio integration requires Alpaca MCP connection.');
  telegramAlerter.startPolling(config.telegram.botPollingInterval);
}
if (discordAlerter.isConfigured) {
  console.log('[Crucix] Discord bot enabled');
  discordAlerter.onCommand('status', async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60);
    return [`**\ud83d\udda5\ufe0f CRUCIX STATUS**\n`, `Uptime: ${h}h ${m}m`, `LLM: ${llmProvider?.isConfigured ? `\u2705 ${llmProvider.name}` : '\u274c Disabled'}`, `SSE clients: ${sseClients.size}`].join('\n');
  });
  discordAlerter.onCommand('sweep', async () => {
    if (sweepInProgress) return '\ud83d\udd04 Sweep already in progress.';
    runSweepCycle().catch(err => console.error('[Crucix] Manual sweep failed:', err.message));
    return '\ud83d\ude80 Manual sweep triggered.';
  });
  discordAlerter.onCommand('portfolio', async () => '\ud83d\udcca Portfolio integration requires Alpaca MCP connection.');
  discordAlerter.start().catch(err => console.error('[Crucix] Discord bot startup failed (non-fatal):', err.message));
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
    nextSweep: lastSweepTime ? new Date(new Date(lastSweepTime).getTime() + config.refreshIntervalMinutes * 60000).toISOString() : null,
    sweepInProgress, sweepStartedAt,
    sourcesOk: currentData?.meta?.sourcesOk || 0,
    sourcesFailed: currentData?.meta?.sourcesFailed || 0,
    llmEnabled: !!config.llm.provider, llmProvider: config.llm.provider,
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
  res.json({ current: currentLanguage, supported: getSupportedLocales() });
});

app.get('/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
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
  if (sweepInProgress) { console.log('[Crucix] Sweep already in progress, skipping'); return; }
  sweepInProgress = true;
  sweepStartedAt = new Date().toISOString();
  broadcast({ type: 'sweep_start', timestamp: sweepStartedAt });
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Crucix] Starting sweep at ${new Date().toLocaleTimeString()}`);
  console.log(`${'='.repeat(60)}`);
  try {
    const rawData = await fullBriefing();
    writeFileSync(join(RUNS_DIR, 'latest.json'), JSON.stringify(rawData, null, 2));
    lastSweepTime = new Date().toISOString();
    console.log('[Crucix] Synthesizing dashboard data...');
    const synthesized = await synthesize(rawData);

    const sweepData = {
      sources: (Array.isArray(rawData.sources) ? rawData.sources : Object.values(rawData.sources || {})).map(src => ({
        id: src.id || src.source_id, source_id: src.source_id || src.id,
        events: Array.isArray(src.events) ? src.events : [], count: Array.isArray(src.events) ? src.events.length : 0,
      })),
      market: rawData.market || {}, alerts: rawData.alerts || [],
    };

    const sweepEvidence = await Promise.resolve(tdbo.onSweepComplete(sweepData));
    sweepData.sweep_id = sweepEvidence?.id || `sweep_${Date.now()}`;
    const sweepStateHash = sweepEvidence?.evidence_hash || null;
    console.log(`[TDBO] Sweep EO id: ${sweepData.sweep_id}`);

    const analysisResults = await analyst.analyzeSweep(sweepData, (output) => {
      if (output.type === 'trade_idea') {
        const idea = output.data;
        if (!synthesized.ideas) synthesized.ideas = [];
        synthesized.ideas.push({ title: idea.content, type: (idea.direction || 'monitor').toLowerCase(), source: 'tdbo-analyst', eoId: idea.eo_id, confidence: idea.confidence, timeframe: idea.timeframe });
        const alertMsg = `\ud83d\udca1 TRADE IDEA (${idea.direction || 'MONITOR'})\n${idea.content}\nConfidence: ${(idea.confidence * 100).toFixed(0)}% | EO: ${idea.eo_id}`;
        if (telegramAlerter.isConfigured) telegramAlerter.sendManualAlert(alertMsg).catch(() => {});
        if (discordAlerter.isConfigured) discordAlerter.sendManualAlert(alertMsg).catch(() => {});
      }
    });

    synthesized.tdbo = {
      sweepId: sweepData.sweep_id, stateHash: sweepStateHash,
      ideasGenerated: analysisResults?.ideas?.length || 0,
      ideasAdmitted: analysisResults?.ideas?.filter(i => i.status === 'ADMITTED').length || 0,
      ideasRefused: analysisResults?.ideas?.filter(i => i.status === 'REFUSED').length || 0,
    };

    const delta = memory.addRun(synthesized);
    synthesized.delta = delta;

    if (llmProvider?.isConfigured) {
      try {
        console.log('[Crucix] Generating LLM trade ideas...');
        const previousIdeas = memory.getLastRun()?.ideas || [];
        const llmIdeas = await generateLLMIdeas(llmProvider, synthesized, delta, previousIdeas);
        if (llmIdeas) { synthesized.ideas = llmIdeas; synthesized.ideasSource = 'llm'; console.log(`[Crucix] LLM generated ${llmIdeas.length} ideas`); }
        else { synthesized.ideas = synthesized.ideas || []; synthesized.ideasSource = 'llm-failed'; }
      } catch (llmErr) { console.error('[Crucix] LLM ideas failed (non-fatal):', llmErr.message); synthesized.ideas = synthesized.ideas || []; synthesized.ideasSource = 'llm-failed'; }
    } else { synthesized.ideas = synthesized.ideas || []; synthesized.ideasSource = 'disabled'; }

    if (delta?.summary?.totalChanges > 0) {
      if (telegramAlerter.isConfigured) telegramAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => console.error('[Crucix] Telegram alert error:', err.message));
      if (discordAlerter.isConfigured) discordAlerter.evaluateAndAlert(llmProvider, delta, memory).catch(err => console.error('[Crucix] Discord alert error:', err.message));
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

  await tdbo.init({ anchorInterval: 4 });
  analyst.initAnalyst(
    { provider: process.env.LLM_PROVIDER || config.llm?.provider, apiKey: process.env.LLM_API_KEY || config.llm?.apiKey, model: process.env.LLM_MODEL || config.llm?.model },
    { gateLlmOutput: tdbo.gateLlmOutput, createEvidenceObject: createEvidenceObjectHook, appendWitness: appendWitnessHook }
  );

  // === FAST PRELOAD: populate currentData BEFORE server starts listening ===
  // synthesizeFast() has zero network calls — processes cached runs/latest.json only (~50ms).
  // This guarantees /api/data returns 200 (not 503) on the very first browser request,
  // so the DOMContentLoaded fetch in jarvis.html always succeeds and init() is called.
  try {
    const existing = JSON.parse(readFileSync(join(RUNS_DIR, 'latest.json'), 'utf8'));
    console.log('[Crucix] Preloading cached data (fast path, no RSS fetch)...');
    currentData = await synthesizeFast(existing);
    console.log(`[Crucix] \u2705 Dashboard ready instantly \u2014 ${currentData.meta?.sourcesOk || 0}/${currentData.meta?.sourcesQueried || 0} sources from cache`);
  } catch {
    console.log('[Crucix] No existing data found \u2014 first sweep required');
  }

  console.log(`
  \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
  \u2551 CRUCIX INTELLIGENCE ENGINE              \u2551
  \u2551 Local Palantir \u00b7 26 Sources             \u2551
  \u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
  \u2551 Dashboard: http://localhost:${port}${' '.repeat(14 - String(port).length)}\u2551
  \u2551 Health:    http://localhost:${port}/api/health${' '.repeat(4 - String(port).length)}\u2551
  \u2551 Signals:   http://localhost:${port}/api/tdbo/signals  \u2551
  \u2551 Refresh:   Every ${config.refreshIntervalMinutes} min${' '.repeat(20 - String(config.refreshIntervalMinutes).length)}\u2551
  \u2551 LLM:       ${(config.llm.provider || 'disabled').padEnd(31)}\u2551
  \u2551 Anchor:    ${'dry-run'.padEnd(31)}\u2551
  \u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d
  `);

  const server = app.listen(port);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Crucix] FATAL: Port ${port} is already in use!`);
      console.error(`[Crucix] kill $(lsof -ti:${port}) (macOS/Linux)`);
      console.error(`[Crucix] Or change PORT in .env\n`);
    } else {
      console.error('[Crucix] Server error:', err.stack || err.message);
    }
    process.exit(1);
  });
  server.on('listening', () => {
    console.log(`[Crucix] Server running on http://localhost:${port}`);
    if (currentData) broadcast({ type: 'update', data: currentData });
    console.log('[Crucix] Running sweep cycle...');
    runSweepCycle().catch(err => console.error('[Crucix] Initial sweep failed:', err.message || err));
    setInterval(runSweepCycle, config.refreshIntervalMinutes * 60 * 1000);
  });
}

process.on('unhandledRejection', (err) => console.error('[Crucix] Unhandled rejection:', err?.stack || err?.message || err));
process.on('uncaughtException', (err) => console.error('[Crucix] Uncaught exception:', err?.stack || err?.message || err));
start().catch(err => { console.error('[Crucix] FATAL \u2014 Server failed to start:', err?.stack || err?.message || err); process.exit(1); });
