/**
 * Crucix — TDBO Governed Trade Signals Panel
 * Hooks into the existing SSE /events stream.
 * Auto-injects into jarvis.html. No HTML edits needed.
 */
(function () {
  'use strict';

  const CSS = `
    #tdbo-signals-panel {
      background: rgba(0,20,40,0.92);
      border: 1px solid rgba(0,212,255,0.25);
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #e0f0ff;
    }
    #tdbo-signals-panel h3 {
      margin: 0 0 12px 0;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #00d4ff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #tdbo-signals-panel h3 .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #00ff88;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .signal-card {
      background: rgba(0,50,80,0.5);
      border: 1px solid rgba(0,212,255,0.15);
      border-left: 3px solid #00d4ff;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 8px;
      animation: slideIn 0.3s ease;
    }
    .signal-card.long   { border-left-color: #00ff88; }
    .signal-card.short  { border-left-color: #ff4466; }
    .signal-card.hedge  { border-left-color: #ffaa00; }
    .signal-card.monitor{ border-left-color: #aaaaff; }
    @keyframes slideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    .signal-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
    .chip { font-size:9px; letter-spacing:1px; text-transform:uppercase; padding:2px 7px; border-radius:3px; font-weight:700; }
    .chip-long    { background:#00ff8833; color:#00ff88; border:1px solid #00ff8866; }
    .chip-short   { background:#ff446633; color:#ff4466; border:1px solid #ff446666; }
    .chip-hedge   { background:#ffaa0033; color:#ffaa00; border:1px solid #ffaa0066; }
    .chip-monitor { background:#aaaaff22; color:#aaaaff; border:1px solid #aaaaff44; }
    .chip-eo { background:rgba(0,212,255,0.1); color:#00d4ff; border:1px solid rgba(0,212,255,0.3); font-size:8px; font-family:monospace; cursor:pointer; }
    .chip-eo:hover { background:rgba(0,212,255,0.2); }
    .signal-title { font-size:12px; color:#c0e0ff; flex:1; line-height:1.4; }
    .signal-meta { display:flex; gap:12px; font-size:10px; color:#6090b0; align-items:center; flex-wrap:wrap; }
    .conf-bar-wrap { display:flex; align-items:center; gap:6px; }
    .conf-bar { width:60px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; }
    .conf-bar-fill { height:100%; border-radius:2px; background:linear-gradient(90deg,#00d4ff,#00ff88); }
    .signal-ts { color:#3a6080; font-size:9px; }
    #tdbo-signals-empty { color:#3a6080; font-size:11px; text-align:center; padding:12px 0; }
    #tdbo-signals-stats { display:flex; gap:16px; margin-bottom:12px; font-size:10px; color:#3a6080; }
    #tdbo-signals-stats span b { color:#00d4ff; }
  `;

  const MAX_SIGNALS = 20;
  const signals = [];
  let stats = { admitted: 0, refused: 0, sweeps: 0 };

  function injectStyle() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'tdbo-signals-panel';
    panel.innerHTML = `
      <h3><span class="dot"></span>TDBO Governed Signals
        <span style="margin-left:auto;font-size:9px;color:#3a6080;font-weight:400;">512/CVS · Live</span>
      </h3>
      <div id="tdbo-signals-stats">
        <span>Admitted: <b id="stat-admitted">0</b></span>
        <span>Refused: <b id="stat-refused">0</b></span>
        <span>Sweeps: <b id="stat-sweeps">0</b></span>
        <span id="stat-anchor" style="margin-left:auto;"></span>
      </div>
      <div id="tdbo-signals-list">
        <div id="tdbo-signals-empty">Waiting for first governed sweep…</div>
      </div>
    `;
    return panel;
  }

  function mountPanel() {
    injectStyle();
    const panel = buildPanel();
    const anchors = ['#signals-panel','#ideas-section','#trade-ideas','.ideas-container','main','body'];
    for (const sel of anchors) {
      const el = document.querySelector(sel);
      if (el) {
        if (sel === 'body' || sel === 'main') { el.prepend(panel); }
        else { el.parentNode.insertBefore(panel, el.nextSibling); }
        return;
      }
    }
    document.body.prepend(panel);
  }

  function dirChip(dir) {
    const d = (dir || 'monitor').toLowerCase();
    const icons = { long:'▲', short:'▼', hedge:'⬡', monitor:'◉' };
    return `<span class="chip chip-${d}">${icons[d]||'◉'} ${d.toUpperCase()}</span>`;
  }

  function eoChip(eoId) {
    if (!eoId) return '';
    const short = eoId.substring(0,8) + '…';
    return `<span class="chip chip-eo" title="EO: ${eoId}" onclick="navigator.clipboard?.writeText('${eoId}')">■EO·${short}</span>`;
  }

  function renderSignal(idea) {
    const dir = (idea.type || idea.direction || 'monitor').toLowerCase();
    const conf = Math.round((idea.confidence || 0) * 100);
    const ts = idea._ts ? new Date(idea._ts).toLocaleTimeString() : '';
    const card = document.createElement('div');
    card.className = `signal-card ${dir}`;
    card.innerHTML = `
      <div class="signal-header">
        ${dirChip(dir)}
        ${eoChip(idea.eoId || idea.eo_id)}
        <span class="signal-title">${idea.title || idea.content || 'Signal'}</span>
      </div>
      <div class="signal-meta">
        <div class="conf-bar-wrap">
          <div class="conf-bar"><div class="conf-bar-fill" style="width:${conf}%"></div></div>
          <span>${conf}% conf</span>
        </div>
        ${idea.timeframe ? `<span>⏱ ${idea.timeframe}</span>` : ''}
        ${idea.risk ? `<span>⚠ ${idea.risk}</span>` : ''}
        <span class="signal-ts">${ts}</span>
      </div>
    `;
    return card;
  }

  function updateList() {
    const list = document.getElementById('tdbo-signals-list');
    if (!list) return;
    if (signals.length === 0) {
      list.innerHTML = '<div id="tdbo-signals-empty">Waiting for first governed sweep…</div>';
      return;
    }
    list.innerHTML = '';
    for (const s of signals) list.appendChild(renderSignal(s));
  }

  function updateStats() {
    const a = document.getElementById('stat-admitted');
    const r = document.getElementById('stat-refused');
    const sw = document.getElementById('stat-sweeps');
    if (a) a.textContent = stats.admitted;
    if (r) r.textContent = stats.refused;
    if (sw) sw.textContent = stats.sweeps;
  }

  function addSignal(idea) {
    idea._ts = idea._ts || Date.now();
    signals.unshift(idea);
    if (signals.length > MAX_SIGNALS) signals.pop();
    updateList();
  }

  function connectSSE() {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg.type === 'update' && msg.data) {
        const t = msg.data.tdbo || {};
        if (t.ideasAdmitted !== undefined) stats.admitted = t.ideasAdmitted;
        if (t.ideasRefused  !== undefined) stats.refused  = t.ideasRefused;
        updateStats();
        // Surface all ideas from any source (tdbo-analyst, llm, or unlabelled)
        for (const idea of (msg.data.ideas || [])) {
          if (idea.title || idea.content) {
            addSignal({ ...idea, _ts: idea._ts || Date.now() });
          }
        }
        // Anchor tx link
        const anchor = document.getElementById('stat-anchor');
        if (anchor && t.lastAnchorTx) {
          const tx = t.lastAnchorTx;
          const short = tx.startsWith('dry-run') ? tx : tx.substring(0,10) + '…';
          const url = tx.startsWith('0x') ? `https://sepolia.etherscan.io/tx/${tx}` : null;
          anchor.innerHTML = url
            ? `⛓ <a href="${url}" target="_blank" style="color:#00d4ff;">${short}</a>`
            : `⛓ ${short}`;
        }
      }

      if (msg.type === 'trade_idea' && msg.data) {
        addSignal({ ...msg.data, _ts: msg.data._ts || Date.now() });
        stats.admitted++;
        updateStats();
      }

      if (msg.type === 'sweep_start') {
        stats.sweeps++;
        updateStats();
      }
    };
    es.onerror = () => setTimeout(connectSSE, 5000);
  }

  function boot() {
    mountPanel();

    // Prefetch latest data: populate stats + ideas from top-level ideas array
    fetch('/api/data')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const t = d.tdbo || {};
        if (t.ideasAdmitted !== undefined) stats.admitted = t.ideasAdmitted;
        if (t.ideasRefused  !== undefined) stats.refused  = t.ideasRefused;
        updateStats();
        for (const idea of (d.ideas || []).reverse()) {
          if (idea.title || idea.content) addSignal(idea);
        }
      })
      .catch(() => {});

    // Also hydrate from the governed signals ring buffer
    fetch('/api/tdbo/signals')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.stats) { stats = { ...stats, ...data.stats }; updateStats(); }
        for (const s of (data.signals || []).reverse()) addSignal(s);
      })
      .catch(() => {});

    connectSSE();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
