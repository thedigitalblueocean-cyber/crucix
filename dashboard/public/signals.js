/**
 * Crucix — TDBO Governed Trade Signals Panel
 * Hooks into the existing SSE /events stream.
 * Auto-injects into jarvis.html. No HTML edits needed.
 *
 * v2: EO indication on every signal row + cryptographic status badge (top-right)
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
      position: relative;
    }
    /* ── Panel header ── */
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
      flex-shrink: 0;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    /* ── Cryptographic status badge (top-right corner) ── */
    #tdbo-crypto-badge {
      position: absolute;
      top: 14px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      letter-spacing: 1px;
      color: #3a6080;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      user-select: none;
    }
    #tdbo-crypto-badge .cb-item {
      display: flex;
      align-items: center;
      gap: 3px;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid rgba(0,212,255,0.18);
      background: rgba(0,212,255,0.06);
      cursor: default;
      transition: background 0.2s;
    }
    #tdbo-crypto-badge .cb-item:hover { background: rgba(0,212,255,0.13); }
    #tdbo-crypto-badge .cb-item.ok   { color: #00ff88; border-color: rgba(0,255,136,0.3); background: rgba(0,255,136,0.06); }
    #tdbo-crypto-badge .cb-item.warn { color: #ffaa00; border-color: rgba(255,170,0,0.3); background: rgba(255,170,0,0.06); }
    #tdbo-crypto-badge .cb-item.off  { color: #3a6080; border-color: rgba(100,150,180,0.15); }
    #tdbo-crypto-badge .cb-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    /* ── Signal cards ── */
    .signal-card {
      background: rgba(0,50,80,0.5);
      border: 1px solid rgba(0,212,255,0.15);
      border-left: 3px solid #00d4ff;
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 8px;
      animation: slideIn 0.3s ease;
    }
    .signal-card.long    { border-left-color: #00ff88; }
    .signal-card.short   { border-left-color: #ff4466; }
    .signal-card.hedge   { border-left-color: #ffaa00; }
    .signal-card.monitor { border-left-color: #aaaaff; }
    .signal-card.avoid   { border-left-color: #ff8800; }
    @keyframes slideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

    .signal-header { display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
    .chip {
      font-size: 9px; letter-spacing: 1px; text-transform: uppercase;
      padding: 2px 7px; border-radius: 3px; font-weight: 700;
      white-space: nowrap; flex-shrink: 0;
    }
    .chip-long    { background:#00ff8833; color:#00ff88; border:1px solid #00ff8866; }
    .chip-short   { background:#ff446633; color:#ff4466; border:1px solid #ff446666; }
    .chip-hedge   { background:#ffaa0033; color:#ffaa00; border:1px solid #ffaa0066; }
    .chip-monitor { background:#aaaaff22; color:#aaaaff; border:1px solid #aaaaff44; }
    .chip-avoid   { background:#ff880022; color:#ff8800; border:1px solid #ff880055; }

    /* EO chip — always shown; greyed out when no EO id present */
    .chip-eo {
      background: rgba(0,212,255,0.08);
      color: #00d4ff;
      border: 1px solid rgba(0,212,255,0.28);
      font-size: 8px;
      font-family: monospace;
      cursor: pointer;
      letter-spacing: 0.5px;
      transition: background 0.2s;
    }
    .chip-eo:hover { background: rgba(0,212,255,0.2); }
    .chip-eo.eo-missing {
      color: #2a5060;
      border-color: rgba(0,212,255,0.1);
      background: transparent;
      cursor: default;
    }

    /* State-hash row under each card */
    .signal-hash-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 5px;
      font-size: 8px;
      color: #2a5060;
      font-family: monospace;
      flex-wrap: wrap;
    }
    .signal-hash-row .sh-label { color: #3a7080; letter-spacing: 0.5px; }
    .signal-hash-row .sh-val   { color: #1a8090; }
    .signal-hash-row .sh-val.anchored { color: #00d4ff; cursor: pointer; }
    .signal-hash-row .sh-val.anchored:hover { text-decoration: underline; }

    .signal-title { font-size:12px; color:#c0e0ff; flex:1; line-height:1.4; }
    .signal-meta  { display:flex; gap:12px; font-size:10px; color:#6090b0; align-items:center; flex-wrap:wrap; }
    .conf-bar-wrap { display:flex; align-items:center; gap:6px; }
    .conf-bar { width:60px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden; }
    .conf-bar-fill { height:100%; border-radius:2px; background:linear-gradient(90deg,#00d4ff,#00ff88); }
    .signal-ts { color:#3a6080; font-size:9px; }

    #tdbo-signals-empty { color:#3a6080; font-size:11px; text-align:center; padding:12px 0; }
    #tdbo-signals-stats { display:flex; gap:16px; margin-bottom:12px; font-size:10px; color:#3a6080; flex-wrap:wrap; }
    #tdbo-signals-stats span b { color:#00d4ff; }
  `;

  const MAX_SIGNALS = 20;
  const signals = [];
  let stats = { admitted: 0, refused: 0, sweeps: 0 };

  /* ─── crypto badge state ─── */
  let cryptoState = {
    gateway:    'pending',   // 'ok' | 'warn' | 'off'
    stateHash:  'pending',
    cvs512:     'pending',
    anchor:     'off',
    lastHash:   null,
    lastTx:     null,
  };

  function injectStyle() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ─── Cryptographic status badge ─── */
  function buildCryptoBadge() {
    const badge = document.createElement('div');
    badge.id = 'tdbo-crypto-badge';
    badge.title = 'TDBO 512/CVS cryptographic layer status';
    badge.innerHTML = cryptoBadgeHTML();
    return badge;
  }

  function cryptoBadgeHTML() {
    const items = [
      { id: 'cb-gateway',   label: 'GW',      state: cryptoState.gateway,   tip: 'Execution Gateway (I-1)' },
      { id: 'cb-statehash', label: 'H\u2022',  state: cryptoState.stateHash, tip: 'State Hash (I-3)' },
      { id: 'cb-cvs',       label: 'CVS',     state: cryptoState.cvs512,    tip: 'CVS-512 Evidence Rail' },
      { id: 'cb-anchor',    label: '\u26d3TX', state: cryptoState.anchor,    tip: 'Ethereum anchor' },
    ];
    return items.map(it => {
      const stateClass = it.state === 'ok' ? 'ok' : it.state === 'warn' ? 'warn' : 'off';
      const label = it.state === 'ok'
        ? `\u2714 ${it.label}`
        : it.state === 'warn'
          ? `\u26a0 ${it.label}`
          : `\u25e6 ${it.label}`;
      return `<span class="cb-item ${stateClass}" id="${it.id}" title="${it.tip}"><span class="cb-dot"></span>${label}</span>`;
    }).join('');
  }

  function updateCryptoBadge() {
    const badge = document.getElementById('tdbo-crypto-badge');
    if (!badge) return;
    badge.innerHTML = cryptoBadgeHTML();

    /* Anchor item: if we have a tx, make it a link */
    if (cryptoState.lastTx) {
      const el = document.getElementById('cb-anchor');
      if (el) {
        const tx = cryptoState.lastTx;
        const short = tx.startsWith('dry-run') ? tx : tx.substring(0, 8) + '\u2026';
        const url = tx.startsWith('0x') ? `https://sepolia.etherscan.io/tx/${tx}` : null;
        if (url) {
          el.innerHTML = `<span class="cb-dot"></span><a href="${url}" target="_blank" style="color:inherit;text-decoration:none;">\u26d3 ${short}</a>`;
        } else {
          el.innerHTML = `<span class="cb-dot"></span>\u26d3 ${short}`;
        }
      }
    }
  }

  /* ─── Panel builder ─── */
  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = 'tdbo-signals-panel';
    panel.innerHTML = `
      <h3>
        <span class="dot"></span>TDBO Governed Signals
        <span style="margin-left:auto;font-size:9px;color:#3a6080;font-weight:400;">512/CVS \u00b7 Live</span>
      </h3>
      <div id="tdbo-signals-stats">
        <span>Admitted: <b id="stat-admitted">0</b></span>
        <span>Refused:  <b id="stat-refused">0</b></span>
        <span>Sweeps:   <b id="stat-sweeps">0</b></span>
        <span id="stat-anchor" style="margin-left:auto;"></span>
      </div>
      <div id="tdbo-signals-list">
        <div id="tdbo-signals-empty">Waiting for first governed sweep\u2026</div>
      </div>
    `;
    /* inject crypto badge into header */
    panel.insertBefore(buildCryptoBadge(), panel.firstChild);
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

  /* ─── Chip helpers ─── */
  function dirChip(dir) {
    const d = (dir || 'monitor').toLowerCase();
    const icons = { long:'\u25b2', short:'\u25bc', hedge:'\u2b21', monitor:'\u25c9', avoid:'\u26d4' };
    return `<span class="chip chip-${d}">${icons[d] || '\u25c9'} ${d.toUpperCase()}</span>`;
  }

  /**
   * EO chip — always rendered on every row.
   * If eoId exists: shows truncated hash, click copies full id.
   * If missing:     shows greyed "EO·pending" placeholder.
   */
  function eoChip(eoId) {
    if (eoId) {
      const safe = String(eoId).replace(/'/g, '');
      const short = safe.substring(0, 8) + '\u2026';
      return `<span class="chip chip-eo" title="Evidence Object ID: ${safe} (click to copy)" onclick="navigator.clipboard?.writeText('${safe}').then(()=>{this.textContent='\u2714 copied';setTimeout(()=>{this.innerHTML='\u25aaEO\u00b7${short}'},1200)})">\u25aaEO\u00b7${short}</span>`;
    }
    return `<span class="chip chip-eo eo-missing" title="No Evidence Object attached to this signal yet">\u25aaEO\u00b7pending</span>`;
  }

  /**
   * State-hash row — shown under each card.
   * Displays signal-level state hash if present; falls back to panel-level last hash.
   */
  function hashRow(idea) {
    const h = idea.stateHash || idea.state_hash || cryptoState.lastHash;
    if (!h) return '';
    const short = String(h).substring(0, 16) + '\u2026';
    const anchored = idea.anchorTx || idea.anchor_tx || cryptoState.lastTx;
    const txUrl = anchored && String(anchored).startsWith('0x')
      ? `https://sepolia.etherscan.io/tx/${anchored}`
      : null;
    const hashEl = txUrl
      ? `<span class="sh-val anchored" onclick="window.open('${txUrl}','_blank')" title="Anchored on-chain: ${anchored}">${short}</span>`
      : `<span class="sh-val" title="${h}">${short}</span>`;
    return `
      <div class="signal-hash-row">
        <span class="sh-label">H\u2022</span>${hashEl}
        ${txUrl ? `<span class="sh-label">\u26d3</span><span class="sh-val anchored" onclick="window.open('${txUrl}','_blank')">${String(anchored).substring(0,10)}\u2026</span>` : ''}
      </div>`;
  }

  /* ─── Signal card renderer ─── */
  function renderSignal(idea) {
    const dir = (idea.type || idea.direction || 'monitor').toLowerCase();
    const rawConf = idea.confidence;
    const conf = typeof rawConf === 'number'
      ? (rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf))
      : 0;
    const ts = idea._ts ? new Date(idea._ts).toLocaleTimeString() : '';
    const card = document.createElement('div');
    card.className = `signal-card ${dir}`;
    card.innerHTML = `
      <div class="signal-header">
        ${dirChip(dir)}
        ${eoChip(idea.eoId || idea.eo_id || idea.evidenceId || idea.evidence_id)}
        <span class="signal-title">${idea.title || idea.content || 'Signal'}</span>
      </div>
      <div class="signal-meta">
        <div class="conf-bar-wrap">
          <div class="conf-bar"><div class="conf-bar-fill" style="width:${conf}%"></div></div>
          <span>${conf}% conf</span>
        </div>
        ${idea.timeframe ? `<span>\u23f1 ${idea.timeframe}</span>` : ''}
        ${idea.risk      ? `<span>\u26a0 ${idea.risk}</span>`      : ''}
        <span class="signal-ts">${ts}</span>
      </div>
      ${hashRow(idea)}
    `;
    return card;
  }

  /* ─── List / stats updaters ─── */
  function updateList() {
    const list = document.getElementById('tdbo-signals-list');
    if (!list) return;
    if (signals.length === 0) {
      list.innerHTML = '<div id="tdbo-signals-empty">Waiting for first governed sweep\u2026</div>';
      return;
    }
    list.innerHTML = '';
    for (const s of signals) list.appendChild(renderSignal(s));
  }

  function updateStats() {
    const a  = document.getElementById('stat-admitted');
    const r  = document.getElementById('stat-refused');
    const sw = document.getElementById('stat-sweeps');
    if (a)  a.textContent  = stats.admitted;
    if (r)  r.textContent  = stats.refused;
    if (sw) sw.textContent = stats.sweeps;
  }

  function addSignal(idea) {
    idea._ts = idea._ts || Date.now();
    signals.unshift(idea);
    if (signals.length > MAX_SIGNALS) signals.pop();
    updateList();
  }

  /* ─── Update crypto badge from TDBO status payload ─── */
  function applyTdboStatus(t) {
    if (!t) return;
    /* gateway */
    if (t.ideasAdmitted !== undefined || t.ideasRefused !== undefined) {
      cryptoState.gateway = 'ok';
    }
    /* state hash */
    if (t.lastStateHash) {
      cryptoState.stateHash = 'ok';
      cryptoState.lastHash  = t.lastStateHash;
    }
    /* CVS-512 evidence */
    if (t.lastEvidenceId || t.evidenceCount) {
      cryptoState.cvs512 = 'ok';
    }
    /* anchor */
    if (t.lastAnchorTx) {
      cryptoState.anchor  = t.lastAnchorTx.startsWith('dry-run') ? 'warn' : 'ok';
      cryptoState.lastTx  = t.lastAnchorTx;
    }
    updateCryptoBadge();

    /* Legacy anchor display in stats bar */
    const anchor = document.getElementById('stat-anchor');
    if (anchor && t.lastAnchorTx) {
      const tx    = t.lastAnchorTx;
      const short = tx.startsWith('dry-run') ? tx : tx.substring(0, 10) + '\u2026';
      const url   = tx.startsWith('0x') ? `https://sepolia.etherscan.io/tx/${tx}` : null;
      anchor.innerHTML = url
        ? `\u26d3 <a href="${url}" target="_blank" style="color:#00d4ff;">${short}</a>`
        : `\u26d3 ${short}`;
    }
  }

  /* ─── SSE ─── */
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
        applyTdboStatus(t);
        for (const idea of (msg.data.ideas || [])) {
          if (idea.title || idea.content) addSignal({ ...idea, _ts: idea._ts || Date.now() });
        }
      }

      if (msg.type === 'trade_idea' && msg.data) {
        addSignal({ ...msg.data, _ts: msg.data._ts || Date.now() });
        stats.admitted++;
        updateStats();
        /* if this idea carries a state hash, surface it in crypto badge */
        if (msg.data.stateHash || msg.data.state_hash) {
          cryptoState.stateHash = 'ok';
          cryptoState.lastHash  = msg.data.stateHash || msg.data.state_hash;
        }
        if (msg.data.eoId || msg.data.eo_id || msg.data.evidenceId) {
          cryptoState.cvs512 = 'ok';
        }
        updateCryptoBadge();
      }

      if (msg.type === 'sweep_start') {
        stats.sweeps++;
        updateStats();
        cryptoState.gateway = 'ok';
        updateCryptoBadge();
      }

      if (msg.type === 'tdbo_status') {
        applyTdboStatus(msg.data || {});
      }
    };
    es.onerror = () => setTimeout(connectSSE, 5000);
  }

  /* ─── Boot ─── */
  function boot() {
    mountPanel();

    /* hydrate from /api/data */
    fetch('/api/data')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const t = d.tdbo || {};
        if (t.ideasAdmitted !== undefined) stats.admitted = t.ideasAdmitted;
        if (t.ideasRefused  !== undefined) stats.refused  = t.ideasRefused;
        updateStats();
        applyTdboStatus(t);
        for (const idea of (d.ideas || []).reverse()) {
          if (idea.title || idea.content) addSignal(idea);
        }
      })
      .catch(() => {});

    /* hydrate from /api/tdbo/signals */
    fetch('/api/tdbo/signals')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.stats) { stats = { ...stats, ...data.stats }; updateStats(); }
        for (const s of (data.signals || []).reverse()) addSignal(s);
      })
      .catch(() => {});

    /* poll /api/tdbo/status for crypto badge (every 30 s) */
    function pollStatus() {
      fetch('/api/tdbo/status')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const c = data.components || {};
          if (c.gateway)    cryptoState.gateway   = 'ok';
          if (c.stateHash)  { cryptoState.stateHash = 'ok'; if (c.stateHash.lastHash) cryptoState.lastHash = c.stateHash.lastHash; }
          if (c.witnessChain || c.merkleBatch) cryptoState.cvs512 = 'ok';
          if (c.anchor?.lastTxHash) {
            const tx = c.anchor.lastTxHash;
            cryptoState.anchor = tx.startsWith('dry-run') ? 'warn' : 'ok';
            cryptoState.lastTx = tx;
          }
          updateCryptoBadge();
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
