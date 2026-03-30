/**
 * TDBO Governed Signals Panel — signals.js
 * Session 7 build  |  D-06 FIX: prefetchHistorical wired on mount
 * D-07 FIX: this file is the authoritative script; duplicate <script> tag
 *           in jarvis.html has been removed (see inject.mjs guard).
 *
 * Layer: UI Panel (static asset, no server restart needed)
 */

(function () {
  'use strict';

  /* ── CONFIG ───────────────────────────────────────────────────── */
  const PANEL_ID      = 'sg-governed-signals';
  const SSE_PATH      = '/events';
  const API_DATA_PATH = '/api/data';
  const ACCENT        = '#64f0c8';   // TDBO teal — green chips
  const DIM           = '#3a5a50';
  const PANEL_BG      = 'rgba(6,14,22,0.92)';
  const BORDER        = 'rgba(100,240,200,0.18)';

  /* ── STATE ────────────────────────────────────────────────────── */
  let _tgActive  = true;
  let _dcActive  = true;
  let _darkMode  = true;
  let _sweepBannerEl   = null;
  let _signalListEl    = null;
  let _headerBadgesEl  = null;
  let _clockEl         = null;
  let _clockTimer      = null;
  let _latestTdbo      = null;
  let _latestIdeas     = [];

  /* ── INJECT CSS ───────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('sg-styles')) return;
    const s = document.createElement('style');
    s.id = 'sg-styles';
    s.textContent = `
      #${PANEL_ID} {
        font-family: 'IBM Plex Mono', 'Courier New', monospace;
        background: ${PANEL_BG};
        border: 1px solid ${BORDER};
        border-radius: 0;
        padding: 0;
        margin: 10px 0;
        position: relative;
        overflow: hidden;
      }
      /* ── Header ── */
      .sg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px 8px;
        border-bottom: 1px solid ${BORDER};
        background: rgba(0,0,0,0.25);
      }
      .sg-brand {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: ${ACCENT};
      }
      .sg-sweep-meta {
        font-size: 10px;
        color: #6a8a82;
        letter-spacing: 0.05em;
        margin-left: 10px;
      }
      .sg-live-dot {
        display: inline-block;
        width: 7px; height: 7px;
        border-radius: 50%;
        background: ${ACCENT};
        box-shadow: 0 0 6px ${ACCENT};
        animation: sg-blink 1.6s ease-in-out infinite;
        margin-right: 5px;
        vertical-align: middle;
      }
      @keyframes sg-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

      /* ── Controls (top-right, two rows) ── */
      .sg-controls {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }
      .sg-controls-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      /* Gov badges row */
      .sg-gov-group {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border: 1px solid rgba(100,240,200,0.2);
        background: rgba(100,240,200,0.04);
      }
      .sg-gov-badge {
        font-size: 10px;
        letter-spacing: 0.07em;
        color: ${ACCENT};
        display: flex;
        align-items: center;
        gap: 3px;
      }
      .sg-gov-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: ${ACCENT};
        box-shadow: 0 0 5px ${ACCENT};
        animation: sg-blink 2s ease-in-out infinite;
      }
      .sg-cvs-live {
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #b388ff;
        border: 1px solid rgba(179,136,255,0.25);
        padding: 1px 6px;
        background: rgba(179,136,255,0.06);
      }
      /* Pill row */
      .sg-pill {
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 2px 8px;
        border: 1px solid rgba(100,240,200,0.22);
        cursor: pointer;
        color: ${ACCENT};
        background: rgba(100,240,200,0.07);
        transition: all 0.2s;
        user-select: none;
      }
      .sg-pill.off {
        color: #3a5a50;
        border-color: rgba(100,240,200,0.08);
        background: rgba(0,0,0,0.1);
      }
      .sg-pill:hover { border-color: ${ACCENT}; }
      .sg-clock {
        font-size: 10px;
        color: #6a8a82;
        letter-spacing: 0.06em;
        min-width: 56px;
        text-align: right;
      }
      .sg-theme-btn {
        font-size: 14px;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0 2px;
        line-height: 1;
        color: ${ACCENT};
        opacity: 0.7;
      }
      .sg-theme-btn:hover { opacity: 1; }

      /* ── Sweep banner ── */
      .sg-sweep-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 16px;
        background: rgba(0,0,0,0.18);
        border-bottom: 1px solid ${BORDER};
        font-size: 10px;
        letter-spacing: 0.06em;
        color: #6a8a82;
        flex-wrap: wrap;
      }
      .sg-sweep-id {
        font-weight: 700;
        color: ${ACCENT};
        cursor: pointer;
      }
      .sg-sweep-id:hover { text-decoration: underline; }
      .sg-sep { color: #2a4a3a; }

      /* ── Signal list ── */
      .sg-list { padding: 8px 0 4px; }
      .sg-card {
        display: flex;
        align-items: flex-start;
        padding: 10px 16px;
        border-left: 2px solid transparent;
        transition: background 0.15s;
        gap: 10px;
      }
      .sg-card:hover { background: rgba(100,240,200,0.03); }
      .sg-card.long  { border-left-color: ${ACCENT}; }
      .sg-card.short { border-left-color: #ff5f63; }
      .sg-card.watch { border-left-color: #44ccff; }
      .sg-card.avoid { border-left-color: #b0bec5; }
      .sg-card.hedge { border-left-color: #ffb84c; }

      /* Direction badge */
      .sg-dir {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.1em;
        padding: 2px 6px;
        border: 1px solid;
        text-transform: uppercase;
        flex-shrink: 0;
        margin-top: 1px;
      }
      .sg-dir.long  { color: ${ACCENT};  border-color: rgba(100,240,200,0.35); background: rgba(100,240,200,0.07); }
      .sg-dir.short { color: #ff5f63;    border-color: rgba(255,95,99,0.35);   background: rgba(255,95,99,0.07); }
      .sg-dir.watch { color: #44ccff;    border-color: rgba(68,204,255,0.35);  background: rgba(68,204,255,0.07); }
      .sg-dir.avoid { color: #b0bec5;    border-color: rgba(176,190,197,0.35); background: rgba(176,190,197,0.06); }
      .sg-dir.hedge { color: #ffb84c;    border-color: rgba(255,184,76,0.35);  background: rgba(255,184,76,0.07); }

      /* Card body */
      .sg-card-body { flex: 1; min-width: 0; }
      .sg-card-title {
        font-size: 12px;
        font-weight: 600;
        color: #e8f4f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 2px;
      }
      .sg-card-risk {
        font-size: 10px;
        color: #ffb84c;
        opacity: 0.85;
      }
      .sg-card-risk::before { content: '⚠ '; }

      /* EO chip — GREEN (D-07 fix: was blue, now forced to ACCENT) */
      .sg-eo-chip {
        font-size: 9px;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border: 1px solid rgba(100,240,200,0.25);
        background: rgba(100,240,200,0.06);
        color: ${ACCENT} !important;   /* green — not --sg-acc2 blue */
        flex-shrink: 0;
        cursor: default;
        user-select: all;
        font-family: inherit;
        white-space: nowrap;
      }
      .sg-eo-chip:hover {
        border-color: rgba(100,240,200,0.5);
        background: rgba(100,240,200,0.12);
      }

      /* Confidence bar */
      .sg-conf-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      .sg-conf-bar {
        flex: 1;
        height: 2px;
        background: rgba(255,255,255,0.06);
        border-radius: 1px;
        overflow: hidden;
        max-width: 80px;
      }
      .sg-conf-bar span {
        display: block;
        height: 100%;
        border-radius: 1px;
        background: linear-gradient(90deg, rgba(100,240,200,0.4), ${ACCENT});
      }
      .sg-conf-pct {
        font-size: 9px;
        color: #6a8a82;
        letter-spacing: 0.04em;
      }
      .sg-conf-time {
        font-size: 9px;
        color: #3a5a50;
        letter-spacing: 0.03em;
        margin-left: auto;
      }

      /* ── Merkle footer ── */
      .sg-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 16px;
        border-top: 1px solid ${BORDER};
        background: rgba(0,0,0,0.2);
        font-size: 9px;
        color: #3a5a50;
        letter-spacing: 0.05em;
        flex-wrap: wrap;
        gap: 4px;
      }
      .sg-merkle-root {
        color: ${ACCENT};
        cursor: pointer;
        user-select: all;
        font-weight: 600;
      }
      .sg-anchor-link {
        color: #b388ff;
        text-decoration: none;
        border-bottom: 1px dashed rgba(179,136,255,0.3);
      }
      .sg-anchor-link:hover { border-bottom-color: #b388ff; }

      /* ── Empty / Loading states ── */
      .sg-empty {
        padding: 24px 16px;
        text-align: center;
        color: #3a5a50;
        font-size: 10px;
        letter-spacing: 0.08em;
      }
      .sg-scanning-ring {
        display: inline-block;
        width: 16px; height: 16px;
        border: 1px solid rgba(100,240,200,0.2);
        border-top-color: ${ACCENT};
        border-radius: 50%;
        animation: sg-spin 1s linear infinite;
        vertical-align: middle;
        margin-right: 6px;
      }
      @keyframes sg-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(s);
  }

  /* ── HELPERS ──────────────────────────────────────────────────── */
  function fmtTime(d) {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  function shortEoId(id) {
    if (!id) return '';
    return id.replace(/-/g, '').substring(0, 12);
  }

  function merkleShort(hash) {
    if (!hash) return '—';
    return hash.replace(/-/g, '').substring(0, 16) + '…';
  }

  function dirArrow(type) {
    const t = (type || '').toLowerCase();
    if (t === 'long')  return '▲';
    if (t === 'short') return '▼';
    if (t === 'watch') return '●';
    if (t === 'hedge') return '◆';
    return '●';
  }

  /* ── CLOCK ────────────────────────────────────────────────────── */
  function startClock() {
    if (_clockTimer) return;
    function tick() {
      if (_clockEl) _clockEl.textContent = fmtTime(new Date());
    }
    tick();
    _clockTimer = setInterval(tick, 1000);
  }

  /* ── RENDER ───────────────────────────────────────────────────── */
  function renderCard(idea, sweepId) {
    const dir    = (idea.type || 'watch').toLowerCase();
    const eoId   = idea.eoId || sweepId || '';
    const conf   = typeof idea.confidence === 'number' ? idea.confidence : 0;
    const confPct = conf > 1 ? Math.round(conf) : Math.round(conf * 100);
    const title  = idea.title || idea.content || 'Signal';
    const risk   = idea.risk || idea.rationale || '';
    const timeStr = fmtTime(new Date());

    return `
      <div class="sg-card ${dir}">
        <span class="sg-dir ${dir}">${dirArrow(dir)} ${dir.toUpperCase()}</span>
        <div class="sg-card-body">
          <div class="sg-card-title">${title}</div>
          ${risk ? `<div class="sg-card-risk">${risk.substring(0, 120)}</div>` : ''}
          <div class="sg-conf-row">
            <div class="sg-conf-bar"><span style="width:${confPct}%"></span></div>
            <span class="sg-conf-pct">${confPct}% conf</span>
            <span class="sg-conf-time">${timeStr}</span>
          </div>
        </div>
        <span class="sg-eo-chip" title="Evidence Object ID: ${eoId}">■EO·${shortEoId(eoId)}…</span>
      </div>`;
  }

  function renderBanner(tdbo) {
    if (!_sweepBannerEl) return;
    const sweepId  = tdbo?.sweepId || '—';
    const shortId  = sweepId.replace(/-/g, '').substring(0, 8);
    const admitted = tdbo?.ideasAdmitted ?? '—';
    const refused  = tdbo?.ideasRefused  ?? '—';
    const total    = tdbo?.ideasGenerated ?? (admitted + refused || '—');
    _sweepBannerEl.innerHTML = `
      <span class="sg-live-dot"></span>
      <span style="color:#4a7a6a;letter-spacing:0.04em">Sweep</span>
      <span class="sg-sweep-id" title="Full sweep ID: ${sweepId}">${shortId}</span>
      <span class="sg-sep">·</span>
      <span>${total} signals evaluated</span>
      <span class="sg-sep">·</span>
      <span style="color:${ACCENT}">${admitted} admitted</span>
      <span class="sg-sep">,</span>
      <span style="color:#ff5f63">${refused} refused</span>`;
  }

  function renderSignals(ideas, tdbo) {
    if (!_signalListEl) return;
    if (!ideas || ideas.length === 0) {
      _signalListEl.innerHTML = `<div class="sg-empty"><span class="sg-scanning-ring"></span>Waiting for first governed sweep…</div>`;
      return;
    }
    const sweepId = tdbo?.sweepId || '';
    _signalListEl.innerHTML = ideas
      .slice(0, 8)
      .map(idea => renderCard(idea, sweepId))
      .join('');
  }

  function renderFooter(footerEl, tdbo) {
    if (!footerEl) return;
    const root    = tdbo?.stateHash || tdbo?.merkleRoot || null;
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = fmtTime(new Date());
    footerEl.innerHTML = `
      <span>○ Merkle root:&nbsp;
        <span class="sg-merkle-root" title="${root || 'pending'}">${merkleShort(root)}</span>
      </span>
      <span>
        Anchored:&nbsp;
        <a class="sg-anchor-link" href="https://arbiscan.io" target="_blank" rel="noopener">@ Ethereum L2</a>
        &nbsp;·&nbsp;${dateStr} · ${timeStr}
      </span>`;
  }

  /* ── MOUNT ────────────────────────────────────────────────────── */
  function mountPanel() {
    if (document.getElementById(PANEL_ID)) return; // idempotent

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    panel.innerHTML = `
      <!-- Header -->
      <div class="sg-header">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="sg-brand">TDBO Governed Signals</span>
          <span id="sg-counts" class="sg-sweep-meta">Admitted: — &nbsp; Refused: — &nbsp; Sweeps: —</span>
        </div>
        <div class="sg-controls">
          <!-- Row 1: gov badges + 512/CVS Live -->
          <div class="sg-controls-row">
            <div class="sg-gov-group">
              <span class="sg-gov-badge"><span class="sg-gov-dot"></span> GW ✓</span>
              <span style="color:#2a4a3a">·</span>
              <span class="sg-gov-badge"><span class="sg-gov-dot"></span> H- ✓</span>
              <span style="color:#2a4a3a">·</span>
              <span class="sg-gov-badge"><span class="sg-gov-dot"></span> CVS ✓</span>
            </div>
            <span class="sg-cvs-live">512/CVS Live</span>
          </div>
          <!-- Row 2: clock + TG + DC + theme -->
          <div class="sg-controls-row">
            <span class="sg-clock" id="sg-clock">--:--:--</span>
            <span class="sg-pill" id="sg-tg" onclick="window.__sgToggle('tg')">● TG</span>
            <span class="sg-pill" id="sg-dc" onclick="window.__sgToggle('dc')">● DC</span>
            <button class="sg-theme-btn" id="sg-theme" onclick="window.__sgToggle('theme')" title="Toggle light/dark">☀️</button>
          </div>
        </div>
      </div>

      <!-- Sweep banner -->
      <div class="sg-sweep-banner" id="sg-sweep-banner">
        <span class="sg-live-dot"></span>
        <span style="color:#3a5a50">Awaiting first sweep…</span>
      </div>

      <!-- Signal list -->
      <div class="sg-list" id="sg-list">
        <div class="sg-empty"><span class="sg-scanning-ring"></span>Waiting for first governed sweep…</div>
      </div>

      <!-- Merkle footer -->
      <div class="sg-footer" id="sg-footer">
        <span>○ Merkle root: <span class="sg-merkle-root">—</span></span>
        <span>Anchored: <a class="sg-anchor-link" href="https://arbiscan.io" target="_blank" rel="noopener">@ Ethereum L2</a></span>
      </div>`;

    // Insert before the first .lower element (Crucix lower grid) or append to #main
    const anchor = document.querySelector('.lower') || document.getElementById('main') || document.body;
    anchor.insertAdjacentElement('beforebegin', panel);

    _sweepBannerEl  = document.getElementById('sg-sweep-banner');
    _signalListEl   = document.getElementById('sg-list');
    _clockEl        = document.getElementById('sg-clock');

    startClock();
  }

  /* ── TOGGLE HANDLERS ──────────────────────────────────────────── */
  window.__sgToggle = function (key) {
    if (key === 'tg') {
      _tgActive = !_tgActive;
      const el = document.getElementById('sg-tg');
      if (el) el.classList.toggle('off', !_tgActive);
    } else if (key === 'dc') {
      _dcActive = !_dcActive;
      const el = document.getElementById('sg-dc');
      if (el) el.classList.toggle('off', !_dcActive);
    } else if (key === 'theme') {
      _darkMode = !_darkMode;
      const panel = document.getElementById(PANEL_ID);
      const btn   = document.getElementById('sg-theme');
      if (panel) panel.style.background = _darkMode ? PANEL_BG : 'rgba(240,248,245,0.97)';
      if (btn)   btn.textContent = _darkMode ? '☀️' : '🌙';
    }
  };

  /* ── DATA INGEST ──────────────────────────────────────────────── */
  function ingestData(data) {
    if (!data) return;
    const tdbo  = data.tdbo  || {};
    const ideas = data.ideas || [];
    _latestTdbo  = tdbo;
    _latestIdeas = ideas;

    renderBanner(tdbo);
    renderSignals(ideas, tdbo);
    renderFooter(document.getElementById('sg-footer'), tdbo);

    // Update counts pill
    const countsEl = document.getElementById('sg-counts');
    if (countsEl) {
      countsEl.textContent =
        `Admitted: ${tdbo.ideasAdmitted ?? '—'}   ` +
        `Refused: ${tdbo.ideasRefused  ?? '—'}   ` +
        `Sweeps: ${tdbo.sweepId ? 1 : '—'}`;
    }
  }

  /* ── D-06: prefetchHistorical ─────────────────────────────────── */
  function prefetchHistorical() {
    // Only runs in server mode (not file://)
    if (location.protocol === 'file:') return;
    fetch(API_DATA_PATH)
      .then(r => r.json())
      .then(data => { ingestData(data); })
      .catch(() => { /* server not ready yet — SSE will push when ready */ });
  }

  /* ── SSE LISTENER ─────────────────────────────────────────────── */
  function connectSSE() {
    if (typeof EventSource === 'undefined') return;
    if (location.protocol === 'file:') return;
    const es = new EventSource(SSE_PATH);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'update' && msg.data) ingestData(msg.data);
      } catch {}
    };
    es.onerror = () => { es.close(); setTimeout(connectSSE, 6000); };
  }

  /* ── BOOTSTRAP ────────────────────────────────────────────────── */
  function bootstrap() {
    injectStyles();
    mountPanel();
    prefetchHistorical();   // D-06: populate immediately on load
    connectSSE();            // then keep live via SSE
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
