/**
 * signals.js — TDBO Governed Signals Panel
 * Crucix Intelligence Engine · Session 7 visual patch (Session 7b)
 *
 * Changes from Session 7:
 *   1. EO chip colour — ALL chips (idea-level + sweep-level) use --sg-accent (green).
 *      sweep-level chips previously fell through to --sg-acc2 (blue) because the
 *      .sweep-level override set color:var(--sg-acc2). Removed that override so both
 *      variants render in TDBO teal green.
 *   2. Header control row split into TWO stacked rows so governance badges and
 *      TG/DC/clock never overlap, even on narrow panels:
 *        Row 1 (top):    ● GW ✓ · ● H- ✓ · ● CVS ✓   |   512/CVS Live
 *        Row 2 (bottom): clock  ·  ● TG  ·  ● DC  ·  ☀️
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // CSS
  // ─────────────────────────────────────────────────────────────────────────────
  const CSS = `
    /* ── Panel shell ── */
    #tdbo-signals-panel {
      --sg-bg:     #020408;
      --sg-panel:  rgba(6,14,22,0.96);
      --sg-glass:  rgba(10,20,32,0.72);
      --sg-border: rgba(100,240,200,0.13);
      --sg-bright: rgba(100,240,200,0.30);
      --sg-text:   #e8f4f0;
      --sg-dim:    #6a8a82;
      --sg-accent: #64f0c8;
      --sg-acc2:   #44ccff;
      --sg-warn:   #ffb84c;
      --sg-danger: #ff5f63;
      --sg-mono:   'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', monospace;
      --sg-sans:   'Space Grotesk', sans-serif;
      font-family: var(--sg-sans);
      color: var(--sg-text);
      background: var(--sg-bg);
      border: 1px solid var(--sg-border);
      margin: 10px 12px;
      padding: 0;
    }
    #tdbo-signals-panel.sg-light {
      --sg-bg:     #f2f6f4;
      --sg-panel:  rgba(238,246,244,0.98);
      --sg-glass:  rgba(225,240,238,0.88);
      --sg-border: rgba(20,90,70,0.17);
      --sg-bright: rgba(20,90,70,0.34);
      --sg-text:   #0a2018;
      --sg-dim:    #3a6a60;
      --sg-accent: #0a7055;
      --sg-acc2:   #005a9e;
      --sg-warn:   #995500;
      --sg-danger: #bb0f20;
    }

    /* ── Sweep banner ── */
    #tdbo-signals-panel .sg-banner {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 6px;
      padding: 8px 14px;
      background: var(--sg-panel);
      border-bottom: 1px solid var(--sg-border);
      backdrop-filter: blur(18px);
    }
    #tdbo-signals-panel .sg-brand {
      font-family: var(--sg-mono); font-size: 13px; font-weight: 700;
      letter-spacing: 0.13em; text-transform: uppercase; color: var(--sg-accent);
    }
    #tdbo-signals-panel .sg-meta {
      font-family: var(--sg-mono); font-size: 11px; color: var(--sg-dim);
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    }
    #tdbo-signals-panel .sg-live-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--sg-accent); box-shadow: 0 0 6px var(--sg-accent);
      display: inline-block; animation: sg-blink 1.4s ease-in-out infinite;
    }
    @keyframes sg-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
    #tdbo-signals-panel .sg-sweep-id {
      color: var(--sg-accent); font-weight: 600;
      cursor: pointer; user-select: all;
      border-bottom: 1px dashed rgba(100,240,200,.3);
    }
    #tdbo-signals-panel .sg-clock { color: var(--sg-acc2); font-family: var(--sg-mono); font-size: 11px; }

    /* ── Top-right controls — TWO-ROW layout ── */
    #tdbo-signals-panel .sg-controls {
      display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
    }
    /* Row 1: governance badges + 512/CVS Live label */
    #tdbo-signals-panel .sg-controls-row1 {
      display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;
    }
    /* Row 2: clock + TG + DC + theme */
    #tdbo-signals-panel .sg-controls-row2 {
      display: flex; align-items: center; gap: 6px; flex-wrap: nowrap;
    }

    /* Governance status group (GW · H- · CVS) */
    #tdbo-signals-panel .sg-gov-group {
      display: flex; align-items: center; gap: 5px;
      padding: 3px 9px;
      border: 1px solid var(--sg-border); background: var(--sg-glass);
      backdrop-filter: blur(12px);
    }
    #tdbo-signals-panel .sg-badge {
      font-family: var(--sg-mono); font-size: 10px; font-weight: 600;
      letter-spacing: 0.08em; display: flex; align-items: center; gap: 4px;
      white-space: nowrap;
    }
    #tdbo-signals-panel .sg-badge .sg-bdot {
      width: 5px; height: 5px; border-radius: 50%;
      animation: sg-blink 2s ease-in-out infinite;
    }
    #tdbo-signals-panel .sg-badge.gw   { color: #64f0c8; }
    #tdbo-signals-panel .sg-badge.gw   .sg-bdot { background:#64f0c8; box-shadow:0 0 5px #64f0c8; }
    #tdbo-signals-panel .sg-badge.hmac { color: var(--sg-acc2); }
    #tdbo-signals-panel .sg-badge.hmac .sg-bdot { background:var(--sg-acc2); box-shadow:0 0 5px var(--sg-acc2); }
    #tdbo-signals-panel .sg-badge.cvs  { color: #b388ff; }
    #tdbo-signals-panel .sg-badge.cvs  .sg-bdot { background:#b388ff; box-shadow:0 0 5px #b388ff; }
    #tdbo-signals-panel .sg-badge.off  { opacity: .35; }
    #tdbo-signals-panel .sg-badge.off  .sg-bdot { animation: none; }
    #tdbo-signals-panel .sg-sep { color: var(--sg-dim); opacity: .5; }

    /* 512/CVS Live label (sits next to gov-group in row 1) */
    #tdbo-signals-panel .sg-cvs-live {
      font-family: var(--sg-mono); font-size: 9px; font-weight: 600;
      letter-spacing: 0.1em; color: #b388ff;
      padding: 3px 8px; border: 1px solid rgba(179,136,255,.25);
      background: rgba(179,136,255,.06); white-space: nowrap;
    }

    /* TG / DC pills */
    #tdbo-signals-panel .sg-pill {
      font-family: var(--sg-mono); font-size: 10px; font-weight: 700;
      letter-spacing: 0.1em; padding: 3px 9px; border: 1px solid;
      cursor: pointer; transition: all 0.18s; user-select: none; background: transparent;
    }
    #tdbo-signals-panel .sg-tg {
      color: #ffb74d; border-color: rgba(255,183,77,.45);
      background: rgba(255,183,77,.10);
    }
    #tdbo-signals-panel .sg-tg:hover { background: rgba(255,183,77,.20); }
    #tdbo-signals-panel .sg-tg.sg-off { color: var(--sg-dim); border-color: var(--sg-border); background: transparent; opacity:.5; }
    #tdbo-signals-panel .sg-dc {
      color: #7986cb; border-color: rgba(121,134,203,.45);
      background: rgba(121,134,203,.10);
    }
    #tdbo-signals-panel .sg-dc:hover { background: rgba(121,134,203,.20); }
    #tdbo-signals-panel .sg-dc.sg-off { color: var(--sg-dim); border-color: var(--sg-border); background: transparent; opacity:.5; }

    /* Theme button */
    #tdbo-signals-panel .sg-theme {
      padding: 3px 7px; border: 1px solid var(--sg-border);
      background: var(--sg-glass); color: var(--sg-dim);
      font-size: 13px; cursor: pointer; line-height: 1; transition: all .18s;
    }
    #tdbo-signals-panel .sg-theme:hover { color: var(--sg-text); border-color: var(--sg-bright); }

    /* ── Signal list ── */
    #tdbo-signals-panel .sg-list { padding: 8px 14px 4px; }
    #tdbo-signals-panel .sg-empty {
      padding: 22px 0; text-align: center;
      font-family: var(--sg-mono); font-size: 11px; color: var(--sg-dim);
      letter-spacing: 0.08em;
    }

    /* ── Signal card ── */
    #tdbo-signals-panel .sg-card {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 12px; margin-bottom: 5px;
      border: 1px solid var(--sg-border);
      background: var(--sg-glass); backdrop-filter: blur(10px);
      position: relative; overflow: visible;
      transition: border-color 0.15s;
      animation: sg-slidein 0.28s ease;
    }
    @keyframes sg-slidein { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:none} }
    #tdbo-signals-panel .sg-card::before {
      content:''; position:absolute; top:0; left:0; right:0; height:1px;
      background:linear-gradient(90deg,transparent,rgba(100,240,200,.12),transparent);
      pointer-events:none;
    }
    #tdbo-signals-panel .sg-card:hover { border-color: var(--sg-bright); }

    /* Direction tag */
    #tdbo-signals-panel .sg-dir {
      font-family: var(--sg-mono); font-size: 9px; font-weight: 700;
      letter-spacing: 0.12em; padding: 3px 7px; border: 1px solid;
      flex-shrink: 0; align-self: flex-start; margin-top: 1px;
      white-space: nowrap; text-transform: uppercase;
    }
    #tdbo-signals-panel .sg-dir.long    { color:#64f0c8; border-color:rgba(100,240,200,.35); background:rgba(100,240,200,.06); }
    #tdbo-signals-panel .sg-dir.short   { color:#ff5f63; border-color:rgba(255,95,99,.35);   background:rgba(255,95,99,.06);  }
    #tdbo-signals-panel .sg-dir.hedge   { color:#ffb84c; border-color:rgba(255,184,76,.35);  background:rgba(255,184,76,.06); }
    #tdbo-signals-panel .sg-dir.watch   { color:#44ccff; border-color:rgba(68,204,255,.35);  background:rgba(68,204,255,.06); }
    #tdbo-signals-panel .sg-dir.avoid   { color:#b0bec5; border-color:rgba(176,190,197,.25); background:rgba(176,190,197,.04);}
    #tdbo-signals-panel .sg-dir.monitor { color:#80cbc4; border-color:rgba(128,203,196,.25); background:rgba(128,203,196,.04);}

    /* Body */
    #tdbo-signals-panel .sg-body { flex:1; min-width:0; }
    #tdbo-signals-panel .sg-title {
      font-size:12px; font-weight:600; line-height:1.35; margin-bottom:2px;
      color: var(--sg-text);
    }
    #tdbo-signals-panel .sg-risk {
      font-size:10px; color: var(--sg-warn); line-height:1.3;
      display:flex; align-items:flex-start; gap:4px; margin-top:2px;
    }
    #tdbo-signals-panel .sg-risk::before { content:'⚠'; font-size:9px; flex-shrink:0; margin-top:1px; }

    /* Confidence bar */
    #tdbo-signals-panel .sg-conf-row {
      display:flex; align-items:center; gap:8px; margin-top:6px;
    }
    #tdbo-signals-panel .sg-conf-track {
      flex:1; height:3px; background:rgba(255,255,255,.07); border-radius:2px; overflow:hidden;
    }
    #tdbo-signals-panel .sg-conf-fill {
      height:100%; border-radius:2px;
      background:linear-gradient(90deg,rgba(100,240,200,.4),var(--sg-accent));
      transition:width .4s ease;
    }
    #tdbo-signals-panel .sg-conf-pct {
      font-family:var(--sg-mono); font-size:9px; color:var(--sg-accent);
      white-space:nowrap;
    }

    /* ── EO chip ──
       FIX (Session 7b): ALL chips use --sg-accent (green).
       The previous .sweep-level override set color:var(--sg-acc2) which rendered
       blue and was hard to read. Both idea-level and sweep-level chips now share
       the same green style; sweep-level chips get a slightly lighter background
       tint to remain visually distinguishable without changing the text colour.
    */
    #tdbo-signals-panel .sg-eo {
      font-family:var(--sg-mono); font-size:9px; font-weight:600;
      letter-spacing:0.06em; padding:2px 7px;
      border:1px solid rgba(100,240,200,.30); background:rgba(100,240,200,.08);
      color: var(--sg-accent);
      cursor:pointer; user-select:all; white-space:nowrap; flex-shrink:0;
      align-self:flex-start; margin-top:1px;
      position:relative; transition:background .15s;
    }
    #tdbo-signals-panel .sg-eo:hover { background:rgba(100,240,200,.18); }
    /* sweep-level: same green text, slightly distinct border shade */
    #tdbo-signals-panel .sg-eo.sweep-level {
      color: var(--sg-accent);
      border-color: rgba(100,240,200,.20);
      background: rgba(100,240,200,.05);
    }
    #tdbo-signals-panel .sg-eo.pending {
      color:var(--sg-dim); border-color:var(--sg-border);
      background:transparent; cursor:default;
    }
    /* CSS tooltip on hover */
    #tdbo-signals-panel .sg-eo[data-fid]:hover::after {
      content: attr(data-fid);
      position:absolute; left:0; top:100%; margin-top:3px; z-index:9999;
      background:rgba(6,14,22,.97); border:1px solid rgba(100,240,200,.3);
      padding:3px 8px; font-size:9px; color:var(--sg-accent);
      white-space:nowrap; pointer-events:none; letter-spacing:0.05em;
    }

    /* Timestamp */
    #tdbo-signals-panel .sg-ts {
      font-family:var(--sg-mono); font-size:9px; color:var(--sg-dim);
      white-space:nowrap; flex-shrink:0; align-self:flex-start; margin-top:1px;
    }

    /* Right column (EO + ts) */
    #tdbo-signals-panel .sg-right {
      display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;
    }

    /* ── Merkle footer ── */
    #tdbo-signals-panel .sg-footer {
      display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;
      padding:7px 14px; border-top:1px solid var(--sg-border); background:var(--sg-glass);
      font-family:var(--sg-mono); font-size:9px; color:var(--sg-dim); letter-spacing:.05em;
    }
    #tdbo-signals-panel .sg-merkle { display:flex; align-items:center; gap:6px; }
    #tdbo-signals-panel .sg-mroot {
      color:var(--sg-accent); font-weight:600; cursor:pointer; user-select:all;
      border-bottom:1px dashed rgba(100,240,200,.3);
    }
    #tdbo-signals-panel .sg-anchor-link {
      color:#b388ff; text-decoration:none; font-weight:600;
      border-bottom:1px dashed rgba(179,136,255,.4); transition:color .15s;
    }
    #tdbo-signals-panel .sg-anchor-link:hover { color:#d0b0ff; }
  `;

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────
  const PANEL_ID    = 'tdbo-signals-panel';
  const MAX_SIGNALS = 20;

  let tgOn    = localStorage.getItem('crucix_sg_tg')    !== 'false';
  let dcOn    = localStorage.getItem('crucix_sg_dc')    !== 'false';
  let darkOn  = localStorage.getItem('crucix_sg_theme') !== 'light';
  let clockTmr = null;

  const cryptoState = {
    gateway: 'off', stateHash: 'off', cvs512: 'off', anchor: 'off',
    lastHash: null, lastTx: null, lastEoId: null,
  };

  const signals = [];
  const stats   = { admitted: 0, refused: 0, sweeps: 0 };

  // ─────────────────────────────────────────────────────────────────────────────
  // Style injection
  // ─────────────────────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('tdbo-signals-css')) return;
    const s = document.createElement('style');
    s.id = 'tdbo-signals-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Clock
  // ─────────────────────────────────────────────────────────────────────────────
  function startClock() {
    if (clockTmr) clearInterval(clockTmr);
    function tick() {
      const el = document.getElementById('sg-live-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    }
    tick();
    clockTmr = setInterval(tick, 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  function shortId(id, len) {
    return id ? String(id).substring(0, len || 8) : '';
  }

  function normalizeConf(raw) {
    if (raw === null || raw === undefined) return null;
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (isNaN(n)) return null;
    return n <= 1 ? Math.round(n * 100) : Math.round(n);
  }

  function merkleDisplay(stateHash, sweepId) {
    const src = stateHash || (sweepId ? (sweepId + sweepId).replace(/[^0-9a-f]/gi,'').padEnd(32,'0') : null);
    if (!src) return { short: '—', full: '' };
    const s = String(src);
    return { short: s.substring(0,8) + '…' + s.substring(Math.max(s.length-4,8)), full: s };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EO chip — always green (Session 7b fix)
  // ─────────────────────────────────────────────────────────────────────────────
  function eoChipHTML(idea) {
    const ideaEo  = idea.eoId || idea.eo_id || idea.evidenceId || idea.evidence_id || null;
    const sweepEo = cryptoState.lastEoId || null;
    const eoId    = ideaEo || sweepEo;

    if (!eoId) {
      return `<span class="sg-eo pending">■EO·pending</span>`;
    }

    const safe    = String(eoId).replace(/'/g, '');
    const short   = shortId(safe, 10) + '…';
    const isSweep = !ideaEo;
    const cls     = isSweep ? 'sweep-level' : '';
    const tip     = (isSweep ? 'Sweep EO: ' : 'EO: ') + safe + ' (click to copy)';
    const onclick = `(function(el){
      navigator.clipboard&&navigator.clipboard.writeText('${safe}');
      var t=el.textContent;el.textContent='✓';setTimeout(function(){el.textContent=t},1300);
    })(this)`;

    return `<span class="sg-eo ${cls}" title="${tip}" data-fid="${safe}" onclick="${onclick}">■EO·${short}</span>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Signal card HTML
  // ─────────────────────────────────────────────────────────────────────────────
  function cardHTML(idea) {
    const dir     = (idea.type || idea.direction || 'monitor').toLowerCase();
    const title   = idea.title || idea.content || '—';
    const risk    = idea.risk  || '';
    const confPct = normalizeConf(idea.confidence);
    const ts      = idea._ts
      ? new Date(idea._ts).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })
      : '';

    const confRow = confPct !== null ? `
      <div class="sg-conf-row">
        <div class="sg-conf-track"><div class="sg-conf-fill" style="width:${confPct}%"></div></div>
        <span class="sg-conf-pct">${confPct}% conf</span>
      </div>` : '';

    return `
      <div class="sg-card">
        <span class="sg-dir ${dir}">${dir === 'monitor' ? '◆ MONITOR' : dir.toUpperCase()}</span>
        <div class="sg-body">
          <div class="sg-title">${title}</div>
          ${risk ? `<div class="sg-risk">${risk}</div>` : ''}
          ${confRow}
        </div>
        <div class="sg-right">
          ${eoChipHTML(idea)}
          <span class="sg-ts">${ts}</span>
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Governance badge group HTML
  // ─────────────────────────────────────────────────────────────────────────────
  function govGroupHTML() {
    const gw  = cryptoState.gateway   !== 'off';
    const hm  = cryptoState.stateHash !== 'off';
    const cv  = cryptoState.cvs512    !== 'off';
    return `
      <span class="sg-badge gw  ${gw?'':'off'}"><span class="sg-bdot"></span>GW ${gw?'✓':'○'}</span>
      <span class="sg-sep">·</span>
      <span class="sg-badge hmac ${hm?'':'off'}"><span class="sg-bdot"></span>H- ${hm?'✓':'○'}</span>
      <span class="sg-sep">·</span>
      <span class="sg-badge cvs  ${cv?'':'off'}"><span class="sg-bdot"></span>CVS ${cv?'✓':'○'}</span>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Controls HTML — two-row layout (Session 7b fix for overlap)
  //   Row 1: gov-group badges  +  512/CVS Live label
  //   Row 2: clock  ·  TG  ·  DC  ·  theme toggle
  // ─────────────────────────────────────────────────────────────────────────────
  function controlsHTML() {
    return `
      <div class="sg-controls">
        <div class="sg-controls-row1">
          <div class="sg-gov-group" id="sg-gov-group">${govGroupHTML()}</div>
          <span class="sg-cvs-live">512/CVS Live</span>
        </div>
        <div class="sg-controls-row2">
          <span class="sg-clock" id="sg-live-clock">--:--:--</span>
          <button class="sg-pill sg-tg${tgOn?'':' sg-off'}" id="sg-btn-tg" title="Toggle Telegram dispatch">● TG</button>
          <button class="sg-pill sg-dc${dcOn?'':' sg-off'}" id="sg-btn-dc" title="Toggle Discord dispatch">● DC</button>
          <button class="sg-theme" id="sg-btn-theme" title="Toggle light/dark">${darkOn ? '☀️' : '🌙'}</button>
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Full panel render
  // ─────────────────────────────────────────────────────────────────────────────
  function renderPanel(data) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.classList.toggle('sg-light', !darkOn);

    const tdbo    = data?.tdbo   || {};
    const ideas   = data?.ideas  || [];
    const sweepId = tdbo.sweepId || data?.meta?.sweepId || '';
    const ts      = data?.meta?.timestamp ? new Date(data.meta.timestamp) : new Date();

    const admitted  = tdbo.ideasAdmitted ?? stats.admitted;
    const refused   = tdbo.ideasRefused  ?? stats.refused;
    const evaluated = ideas.length || (admitted + refused);

    if (tdbo.ideasAdmitted !== undefined) stats.admitted = tdbo.ideasAdmitted;
    if (tdbo.ideasRefused  !== undefined) stats.refused  = tdbo.ideasRefused;

    applyTdboStatus(tdbo);

    for (const idea of [...ideas].reverse()) {
      if (idea.title || idea.content) {
        idea._ts = idea._ts || ts.getTime();
        if (!signals.find(s => s.eoId === idea.eoId && s.title === idea.title)) {
          signals.unshift(idea);
          if (signals.length > MAX_SIGNALS) signals.pop();
        }
      }
    }

    const cardsHTML = signals.length
      ? signals.map(cardHTML).join('')
      : `<div class="sg-empty">⏳ AWAITING FIRST GOVERNED SWEEP</div>`;

    const { short: mkShort, full: mkFull } = merkleDisplay(tdbo.stateHash || cryptoState.lastHash, sweepId);
    const anchorTs = ts.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
                   + ' · ' + ts.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    const anchorTx  = cryptoState.lastTx;
    const anchorUrl = anchorTx && String(anchorTx).startsWith('0x')
      ? `https://sepolia.arbiscan.io/tx/${anchorTx}`
      : 'https://sepolia.arbiscan.io/';

    panel.innerHTML = `
      <div class="sg-banner">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="sg-brand">TDBO GOVERNED SIGNALS</span>
          <span class="sg-meta">
            <span class="sg-live-dot"></span>
            Sweep&nbsp;
            <span class="sg-sweep-id" title="${sweepId}"
              onclick="(function(el){navigator.clipboard&&navigator.clipboard.writeText(el.title);var t=el.textContent;el.textContent='✓';setTimeout(function(){el.textContent=t},1200)})(this)"
            >${sweepId ? shortId(sweepId, 8) : '—'}</span>
            &nbsp;·&nbsp;${evaluated} signals evaluated · ${admitted} admitted, ${refused} refused
          </span>
        </div>
        ${controlsHTML()}
      </div>
      <div class="sg-list">${cardsHTML}</div>
      <div class="sg-footer">
        <div class="sg-merkle">
          <span style="opacity:.55">⊙ Merkle root:</span>
          <span class="sg-mroot" title="${mkFull}"
            onclick="(function(el){navigator.clipboard&&navigator.clipboard.writeText(el.title);var t=el.textContent;el.textContent='✓';setTimeout(function(){el.textContent=t},1200)})(this)"
          >${mkShort}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span>Anchored:</span>
          <a class="sg-anchor-link" href="${anchorUrl}" target="_blank" rel="noopener">@ Ethereum L2</a>
          <span style="opacity:.6">${anchorTs}</span>
        </div>
      </div>
    `;

    _wireButtons(panel);
    startClock();
  }

  function _wireButtons(panel) {
    const btnTg    = document.getElementById('sg-btn-tg');
    const btnDc    = document.getElementById('sg-btn-dc');
    const btnTheme = document.getElementById('sg-btn-theme');
    if (btnTg) btnTg.addEventListener('click', function () {
      tgOn = !tgOn; localStorage.setItem('crucix_sg_tg', String(tgOn));
      this.classList.toggle('sg-off', !tgOn);
    });
    if (btnDc) btnDc.addEventListener('click', function () {
      dcOn = !dcOn; localStorage.setItem('crucix_sg_dc', String(dcOn));
      this.classList.toggle('sg-off', !dcOn);
    });
    if (btnTheme) btnTheme.addEventListener('click', function () {
      darkOn = !darkOn; localStorage.setItem('crucix_sg_theme', darkOn ? 'dark' : 'light');
      panel.classList.toggle('sg-light', !darkOn);
      this.textContent = darkOn ? '☀️' : '🌙';
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // applyTdboStatus — v3 field mapping unchanged
  // ─────────────────────────────────────────────────────────────────────────────
  function applyTdboStatus(t) {
    if (!t) return;
    let changed = false;

    const chainLen = t.witnessChainLength ?? null;
    const admitted = t.ideasAdmitted ?? t.total_admitted ?? null;
    if ((chainLen !== null && chainLen > 0) || (admitted !== null && admitted > 0)) {
      cryptoState.gateway = 'ok'; changed = true;
    }

    const hashVal = t.lastStateHash || (typeof t.stateHash === 'string' ? t.stateHash : null);
    if (hashVal) {
      cryptoState.stateHash = 'ok';
      cryptoState.lastHash  = hashVal;
      changed = true;
    }

    const lastEoId = t.lastEvidenceId || t.sweepId || null;
    if (lastEoId || (chainLen !== null && chainLen > 0)) {
      cryptoState.cvs512 = 'ok';
      if (lastEoId) cryptoState.lastEoId = lastEoId;
      changed = true;
    }

    const anchorTx = t.lastAnchorTx || null;
    if (anchorTx) {
      cryptoState.anchor = anchorTx.startsWith('dry-run') ? 'warn' : 'ok';
      cryptoState.lastTx = anchorTx;
      changed = true;
    }

    if (changed) {
      const gg = document.getElementById('sg-gov-group');
      if (gg) gg.innerHTML = govGroupHTML();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SSE
  // ─────────────────────────────────────────────────────────────────────────────
  function connectSSE() {
    let es;
    function connect() {
      es = new EventSource('/events');
      es.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        if (msg.type === 'update' && msg.data) {
          renderPanel(msg.data);
        }

        if (msg.type === 'trade_idea' && msg.data) {
          const idea = { ...msg.data, _ts: msg.data._ts || Date.now() };
          signals.unshift(idea);
          if (signals.length > MAX_SIGNALS) signals.pop();
          stats.admitted++;
          if (msg.data.stateHash || msg.data.state_hash) {
            cryptoState.stateHash = 'ok';
            cryptoState.lastHash  = msg.data.stateHash || msg.data.state_hash;
          }
          if (msg.data.eoId || msg.data.eo_id || msg.data.evidenceId) {
            cryptoState.cvs512   = 'ok';
            cryptoState.lastEoId = msg.data.eoId || msg.data.eo_id || msg.data.evidenceId;
          }
          renderPanel({ ideas: signals, tdbo: { ideasAdmitted: stats.admitted, ideasRefused: stats.refused } });
        }

        if (msg.type === 'sweep_start') {
          stats.sweeps++;
          cryptoState.gateway = 'ok';
          const gg = document.getElementById('sg-gov-group');
          if (gg) gg.innerHTML = govGroupHTML();
        }

        if (msg.type === 'tdbo_status') {
          applyTdboStatus(msg.data || {});
        }
      };
      es.onerror = () => { es.close(); setTimeout(connect, 5000); };
    }
    connect();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mount panel (idempotent)
  // ─────────────────────────────────────────────────────────────────────────────
  function mountPanel() {
    if (document.getElementById(PANEL_ID)) return;
    injectStyle();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="sg-banner">
        <span class="sg-brand">TDBO GOVERNED SIGNALS</span>
        ${controlsHTML()}
      </div>
      <div class="sg-list"><div class="sg-empty">⏳ AWAITING FIRST GOVERNED SWEEP</div></div>
      <div class="sg-footer">
        <div class="sg-merkle"><span style="opacity:.55">⊙ Merkle root:</span><span class="sg-mroot">—</span></div>
        <div><a class="sg-anchor-link" href="https://sepolia.arbiscan.io/" target="_blank" rel="noopener">@ Ethereum L2</a></div>
      </div>`;

    const main = document.getElementById('main');
    if (main) main.insertBefore(panel, main.firstChild);
    else document.body.prepend(panel);

    startClock();
    _wireButtons(panel);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Boot: inline data → /api/data → /api/tdbo/status poll → SSE
  // ─────────────────────────────────────────────────────────────────────────────
  function boot() {
    mountPanel();

    if (window.__CRUCIX_DATA__) {
      renderPanel(window.__CRUCIX_DATA__);
    }

    fetch('/api/data')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) renderPanel(d); })
      .catch(() => {});

    function pollStatus() {
      fetch('/api/tdbo/status')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          applyTdboStatus(d);
          if (d.analyst) applyTdboStatus(d.analyst);
        })
        .catch(() => {});
    }
    pollStatus();
    setInterval(pollStatus, 30000);

    connectSSE();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
