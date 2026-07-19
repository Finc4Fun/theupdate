/* ============================================================
   DIME Advisor Brief Dashboard — app.js
   A location- and unit-agnostic open-source briefing dashboard.
   Load a brief JSON (see brief-template.json) to populate.
   ============================================================ */

// ── GLOBAL ERROR HANDLER — catches any JS crash ──
window.onerror = function(msg, src, line, col, err) {
  const el = document.getElementById('js-error-banner');
  if (el) { el.style.display = 'block'; el.textContent = '⚠ JS Error: ' + msg + ' (line ' + line + ')'; }
  console.error('JS CRASH:', msg, 'line:', line, err);
  return false;
};
window.addEventListener('unhandledrejection', e => {
  const el = document.getElementById('js-error-banner');
  if (el) { el.style.display = 'block'; el.textContent = '⚠ Promise Error: ' + e.reason; }
  console.error('Unhandled promise:', e.reason);
});
// ── STATE ──
let briefData = null;
let currentPage = 'overview';

// ── NAV ── (tabs use inline onclick; keyboard shortcuts below)

window.navTo = function navTo(page) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
  currentPage = page;
  requestAnimationFrame(() => {
    flushPendingCharts();
    if (page === 'overview' && window._aorMap) window._aorMap.invalidateSize();
  });
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const dimePages = ['diplomatic','informational','military','economic'];
  const dimeIdx = dimePages.indexOf(currentPage);
  if (e.key === 'ArrowRight' && dimeIdx < dimePages.length - 1) navTo(dimePages[dimeIdx + 1]);
  if (e.key === 'ArrowLeft' && dimeIdx > 0) navTo(dimePages[dimeIdx - 1]);
  if (e.key === 'ArrowLeft' && dimeIdx === 0) navTo('overview');
  if (e.key === 'ArrowRight' && currentPage === 'overview') navTo('diplomatic');
  if (e.key === '0') navTo('overview');
  if (e.key === 'p' || e.key === 'P') navTo('prompts');
  if (e.key === 'l' || e.key === 'L') navTo('leaders');
  if (e.key === 'r' || e.key === 'R') navTo('resources');
});

// ── FILE LOAD ──
document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => loadBrief(JSON.parse(ev.target.result));
  reader.readAsText(file);
});

// ── DRAG & DROP ──
document.addEventListener('dragover', e => { e.preventDefault(); document.getElementById('dropOverlay').classList.add('active'); });
document.addEventListener('dragleave', e => { if (e.relatedTarget === null) document.getElementById('dropOverlay').classList.remove('active'); });
document.addEventListener('drop', e => {
  e.preventDefault();
  document.getElementById('dropOverlay').classList.remove('active');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => loadBrief(JSON.parse(ev.target.result));
  reader.readAsText(file);
});

// ── LOAD BRIEF ──
function loadBrief(data) {
  briefData = data;
  const meta = data.meta || {};
  const d = data.dime || {};

  // Top bar
  document.getElementById('topUnitLabel').textContent =
    (meta.unit && meta.country) ? meta.unit + ' · ' + meta.country : (meta.unit || meta.country || 'ADVISOR BRIEF');
  const aorLabel = document.getElementById('mapAorLabel');
  if (aorLabel) aorLabel.textContent = meta.country || 'Not Set';
  const alignedLabel = document.getElementById('mapAlignedLabel');
  if (alignedLabel) alignedLabel.textContent = meta.partner_unit ? meta.partner_unit + ' · Aligned' : '';
  const unitPocLabel = document.getElementById('leaders-unit-label');
  if (unitPocLabel) unitPocLabel.textContent = (meta.partner_unit || 'Partner Unit') + ' — Unit POCs';
  document.getElementById('topPeriod').textContent = meta.period || '';
  const fetchedEl = document.getElementById('topDataFetched');
  const ovFetched = document.getElementById('ov-fetched');
  const ovCurrency = document.getElementById('ov-currency');

  if (meta.data_fetched) {
    const fetched = new Date(meta.data_fetched);
    const now = new Date();
    const days = Math.floor((now - fetched) / (1000 * 60 * 60 * 24));
    const ageLabel = days === 0 ? 'Current (today)' : days === 1 ? '1 day old' : `${days} days old`;
    const ageColor = days <= 1 ? '#2d6a35' : days <= 7 ? '#c8a84b' : '#8b2222';
    fetchedEl.innerHTML = `Data: ${meta.data_fetched} &nbsp;<span style="color:${ageColor};font-weight:600;">${ageLabel}</span>`;
    if (ovFetched) ovFetched.textContent = meta.data_fetched;
    if (ovCurrency) { ovCurrency.textContent = ageLabel; ovCurrency.style.color = ageColor; }
  } else {
    fetchedEl.textContent = 'No fetch date in brief';
    if (ovFetched) ovFetched.textContent = '—';
    if (ovCurrency) ovCurrency.textContent = '—';
  }
  document.getElementById('topClassif').textContent = meta.classification || 'UNCLASSIFIED';
  document.getElementById('bottomClassif').textContent = meta.classification || 'UNCLASSIFIED';

  // Overview meta
  document.getElementById('ov-country').textContent = meta.country || '—';
  document.getElementById('ov-period').textContent = meta.period || '—';
  document.getElementById('ov-unit').textContent = meta.unit || '—';
  document.getElementById('ov-classif').textContent = meta.classification || '—';

  // Render each pillar
  const map = {diplomatic:'d', informational:'i', military:'m', economic:'e'};
  Object.entries(map).forEach(([pillar, key]) => {
    const p = d[pillar] || {};
    renderPillar(key, pillar, p);
  });

  // Render key leaders
  renderLeaders(data.leaders || {});

  // Map, live data, and mission resources from the brief
  updateBriefMap(meta.map || null);
  if (meta.country) { fetchGDELT(meta.country); fetchGDELTTone(meta.country); }
  renderResources(data.resources || null);
  loadLiveFeed(data.resources && data.resources.feeds);

  navTo('overview');
}

// ── KEY LEADERS RENDER ──
const DEFAULT_LEADERS = {
  civilian: [
    { name: 'TBD — load brief', title: 'Head of State',        notes: 'Populated from the leaders block of your brief JSON.' },
    { name: 'TBD — load brief', title: 'Head of Government',   notes: 'Populated from the leaders block of your brief JSON.' },
    { name: 'TBD — load brief', title: 'Foreign Minister',     notes: 'Populated from the leaders block of your brief JSON.' },
    { name: 'TBD — load brief', title: 'Defence Minister',     notes: 'Populated from the leaders block of your brief JSON.' }
  ],
  military: [
    { name: 'TBD — load brief', title: 'Chief of Defence',     notes: 'Senior uniformed officer of the partner nation armed forces.' },
    { name: 'TBD — load brief', title: 'Relevant Service Chief', notes: 'Commander of the service that owns your partner unit.' }
  ],
  unit: [
    { name: 'TBD — verify with unit', title: 'Partner Unit Commander', notes: 'Primary counterpart for the advisor team.' },
    { name: 'TBD — verify with unit', title: 'Partner Unit XO / Deputy', notes: 'Day-to-day operations coordination.' },
    { name: 'TBD — verify with unit', title: 'Partner Unit S-3 (Operations)', notes: 'Training and exercise planning POC.' }
  ]
};

function renderLeaders(leaders) {
  const data = {
    civilian: (leaders.civilian && leaders.civilian.length) ? leaders.civilian : DEFAULT_LEADERS.civilian,
    military: (leaders.military && leaders.military.length) ? leaders.military : DEFAULT_LEADERS.military,
    unit:     (leaders.unit && leaders.unit.length)         ? leaders.unit     : DEFAULT_LEADERS.unit
  };

  ['civilian','military','unit'].forEach(section => {
    const el = document.getElementById('leaders-' + section);
    if (!el) return;
    el.innerHTML = '';
    data[section].forEach(p => {
      const initials = (p.name || '?').split(/\s+/).map(s => s[0] || '').slice(0,2).join('').toUpperCase();
      const card = document.createElement('div');
      card.className = 'leader-card';
      card.innerHTML =
        '<div class="leader-photo">' + initials + '</div>' +
        '<div class="leader-body">' +
          '<div class="leader-name">' + (p.name || 'Unknown') + '</div>' +
          '<div class="leader-title">' + (p.title || '') + '</div>' +
          '<div class="leader-notes">' + (p.notes || '') + '</div>' +
        '</div>';
      el.appendChild(card);
    });
  });
}

// Render defaults on load
window.addEventListener('load', () => renderLeaders({}));

function renderPillar(key, pillar, p) {
  // Summary
  const sumEl = document.getElementById(key + '-summary');
  if (sumEl) sumEl.textContent = p.summary || '';

  // Overview card
  const ovSum = document.getElementById('ov-' + key + '-summary');
  if (ovSum) ovSum.textContent = p.summary || '';

  // Stats
  const statsEl = document.getElementById(key + '-stats');
  if (statsEl) {
    statsEl.innerHTML = '';
    (p.stats || []).forEach(s => statsEl.appendChild(buildStatCard(s)));
  }

  // Charts (JSON-driven)
  renderPillarCharts(key, p.charts);

  // Items
  const itemsEl = document.getElementById(key + '-items');
  if (itemsEl) {
    itemsEl.innerHTML = '';
    (p.items || []).forEach(item => itemsEl.appendChild(buildItem(item)));
  }

  // Overview pills
  const ovItems = document.getElementById('ov-' + key + '-items');
  if (ovItems) {
    ovItems.innerHTML = '';
    (p.items || []).slice(0, 4).forEach(item => {
      const pill = document.createElement('div');
      pill.className = 'overview-pill';
      pill.innerHTML = `<div class="mini-rag" style="background:${ragColor(item.status)}"></div>${item.title}`;
      ovItems.appendChild(pill);
    });
  }
}

function ragColor(s) {
  return s === 'green' ? '#2d6a35' : s === 'red' ? '#8b2222' : '#b87d1a';
}

function trendSymbol(t) {
  return t === 'up' ? '▲' : t === 'down' ? '▼' : '▶';
}

function buildStatCard(s) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  if (s.type === 'sparkline') {
    card.innerHTML = `
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.label_end || ''}</div>
      <div class="stat-spark"><canvas height="36" style="width:100%;display:block;"></canvas></div>`;
    setTimeout(() => {
      const canvas = card.querySelector('canvas');
      drawChart(canvas, {
        values: s.values,
        years: s.years || s.values.map((_, i) => 'Point ' + (i+1)),
        unit: s.unit || '',
        color: '#c8a84b',
        chartTitle: s.label,
        explain: s.explain || 'Trend over reporting period. Hover each point for the value.'
      });
    }, 80);
  } else {
    const dirClass = s.delta_dir === 'up' ? 'delta-up' : s.delta_dir === 'down' ? 'delta-down' : 'delta-flat';
    const arrow = s.delta_dir === 'up' ? '▲' : s.delta_dir === 'down' ? '▼' : '▶';
    card.innerHTML = `
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
      ${s.delta ? `<div class="stat-delta ${dirClass}">${arrow} ${s.delta}</div>` : ''}`;
  }
  return card;
}

function buildItem(item) {
  const el = document.createElement('div');
  el.className = 'brief-item';
  const tClass = item.trend === 'up' ? 'trend-up' : item.trend === 'down' ? 'trend-down' : 'trend-flat';
  el.innerHTML = `
    <div class="item-indicators">
      <div class="rag rag-${item.status}"></div>
      <div class="trend ${tClass}">${trendSymbol(item.trend)}</div>
    </div>
    <div class="item-body">
      <div class="item-title">${item.title}</div>
      <div class="item-notes">${item.notes}</div>
      ${item.link ? `<a class="item-link" href="${item.link}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">↗ ${formatLinkDomain(item.link)}</a>` : ''}
    </div>`;
  return el;
}

// Extract a clean domain + path snippet for display
function formatLinkDomain(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : '';
    // Trim long paths to last segment for readability
    const last = path.split('/').filter(Boolean).slice(-1)[0] || '';
    return last ? `${host}/${last.length > 30 ? last.substring(0,30) + '…' : last}` : host;
  } catch { return 'Source'; }
}

// ── CHART ENGINE ──
// tooltip element — declared here so chart engine can reference it
const tooltip = document.getElementById('chartTooltip');

function showTooltip(e, title, value, label) {
  document.getElementById('tt-title').textContent = title;
  document.getElementById('tt-value').textContent = value;
  document.getElementById('tt-label').textContent = label;
  tooltip.classList.add('visible');
  positionTooltip(e);
}
function positionTooltip(e) {
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let x = e.clientX + 16, y = e.clientY - th / 2;
  if (x + tw > window.innerWidth - 10) x = e.clientX - tw - 16;
  if (y < 8) y = 8;
  if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}
function hideTooltip() { tooltip.classList.remove('visible'); }

// Pending charts queued when canvas has no width yet (hidden page)
const pendingCharts = [];

function drawChart(canvas, config) {
  if (!config.values || !config.values.length) return;
  const w = canvas.offsetWidth;
  if (!w) {
    // canvas not visible yet — queue for later render
    pendingCharts.push({ canvas, config });
    return;
  }
  _renderChart(canvas, config);
}

function _renderChart(canvas, config) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || 300;
  const hAttr = parseInt(canvas.getAttribute('height')) || 80;
  canvas.width = w * dpr;
  canvas.height = hAttr * dpr;
  canvas.style.height = hAttr + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  _paint(ctx, w, hAttr, config, -1);

  // Hover
  let activeIdx = -1;
  const vals = config.values;
  const padL = 4, padR = 4, padT = 6, padB = 4;
  const pts = vals.map((v, i) => {
    const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
    return {
      x: padL + (i / Math.max(vals.length - 1, 1)) * (w - padL - padR),
      y: padT + (1 - (v - min) / range) * (hAttr - padT - padB),
      v
    };
  });
  const hitW = w / Math.max(vals.length, 1);

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let closest = 0, minD = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < minD) { minD = d; closest = i; } });
    if (minD < hitW) {
      if (closest !== activeIdx) {
        activeIdx = closest;
        ctx.clearRect(0, 0, w, hAttr);
        _paint(ctx, w, hAttr, config, closest);
      }
      const yr = config.years ? config.years[closest] : ('Pt ' + (closest + 1));
      const val = pts[closest].v.toFixed(2).replace(/\.?0+$/, '') + (config.unit ? ' ' + config.unit : '');
      showTooltip(e, (config.chartTitle || '') + (yr ? ' — ' + yr : ''), val, config.explain || '');
    } else {
      if (activeIdx !== -1) { activeIdx = -1; ctx.clearRect(0, 0, w, hAttr); _paint(ctx, w, hAttr, config, -1); }
      hideTooltip();
    }
  };
  canvas.onmouseleave = () => {
    activeIdx = -1;
    hideTooltip();
    ctx.clearRect(0, 0, w, hAttr);
    _paint(ctx, w, hAttr, config, -1);
  };
}

function _paint(ctx, w, h, config, highlight) {
  const vals = config.values;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const padL = 4, padR = 4, padT = 6, padB = 4;
  const col = config.color || '#c8a84b';

  const pts = vals.map((v, i) => ({
    x: padL + (i / Math.max(vals.length - 1, 1)) * (w - padL - padR),
    y: padT + (1 - (v - min) / range) * (h - padT - padB),
    v
  }));

  // Area fill
  ctx.beginPath();
  ctx.moveTo(pts[0].x, h - padB);
  ctx.lineTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, h - padB);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(col, 0.08);
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Zero line if values span positive and negative
  if (min < 0 && max > 0) {
    const zy = padT + (1 - (0 - min) / range) * (h - padT - padB);
    ctx.beginPath();
    ctx.moveTo(padL, zy); ctx.lineTo(w - padR, zy);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Dots
  pts.forEach((p, i) => {
    const isHL = i === highlight;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isHL ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = isHL ? '#fff' : col;
    ctx.fill();
    if (isHL) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(col, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Flush pending charts when navigating to a page that has them
function flushPendingCharts() {
  const still = [];
  pendingCharts.forEach(({ canvas, config }) => {
    if (canvas.offsetWidth > 0) _renderChart(canvas, config);
    else still.push({ canvas, config });
  });
  pendingCharts.length = 0;
  still.forEach(p => pendingCharts.push(p));
}

// ── GDELT FETCH ──
// Last 30 days as YYYYMMDD000000 strings
function gdeltDateRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const fmt = d => d.getUTCFullYear()
    + String(d.getUTCMonth()+1).padStart(2,'0')
    + String(d.getUTCDate()).padStart(2,'0')
    + '000000';
  return [fmt(start), fmt(now)];
}

async function gdeltFetch(mode, country) {
  const [start, end] = gdeltDateRange();
  const query = encodeURIComponent('"' + country + '"');
  const direct = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=${mode}&TIMELINESMOOTH=3&format=json&STARTDATETIME=${start}&ENDDATETIME=${end}`;
  // Try direct first; fall back to CORS proxy for file:// usage
  try {
    const res = await fetch(direct);
    if (res.ok) {
      const txt = await res.text();
      if (txt && txt.trim().startsWith('{')) return JSON.parse(txt);
    }
    throw new Error('direct fetch blocked');
  } catch {
    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(direct);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('proxy HTTP ' + res.status);
    const wrap = await res.json();
    return JSON.parse(wrap.contents);
  }
}

async function fetchGDELT(country) {
  if (!country) return;
  const loadEl = document.getElementById('gdeltLoading');
  if (loadEl) { loadEl.style.display = 'block'; loadEl.textContent = 'Fetching GDELT data for ' + country + '...'; }
  try {
    const data = await gdeltFetch('timelinevol', country);
    const timeline = data.timeline || [];
    if (!timeline.length) throw new Error('no data');
    const series = (timeline[0] && timeline[0].data) ? timeline[0].data : [];
    const values = series.map(d => parseFloat(d.value) || 0);
    const labels = series.map(d => d.date ? d.date.substring(0,8) : '');
    document.getElementById('gdeltLoading').style.display = 'none';
    const canvas = document.getElementById('gdeltCanvas');
    canvas.style.display = 'block';
    drawChart(canvas, {
      values, years: labels, color: '#c8a84b', unit: '% of global news',
      chartTitle: country + ' Media Volume',
      explain: 'Percentage of all global news monitored by GDELT that mentions ' + country + '. Source: GDELT DOC 2.0 API (live, last 30 days). Spikes indicate major events drawing international coverage.'
    });
  } catch (err) {
    const el = document.getElementById('gdeltLoading');
    if (el) el.textContent = '⚠ GDELT volume unavailable: ' + err.message;
  }
}

async function fetchGDELTTone(country) {
  if (!country) return;
  const loadEl = document.getElementById('gdeltToneLoading');
  if (loadEl) { loadEl.style.display = 'block'; loadEl.textContent = 'Fetching tone data for ' + country + '...'; }
  try {
    const data = await gdeltFetch('timelinetone', country);
    const timeline = data.timeline || [];
    const series = (timeline[0] && timeline[0].data) ? timeline[0].data : [];
    const values = series.map(d => parseFloat(d.value) || 0);
    const labels = series.map(d => d.date ? d.date.substring(0,8) : '');
    document.getElementById('gdeltToneLoading').style.display = 'none';
    const canvas = document.getElementById('gdeltToneCanvas');
    canvas.style.display = 'block';
    drawChart(canvas, {
      values, years: labels, color: '#4a8a55', unit: 'tone score',
      chartTitle: country + ' Media Tone',
      explain: 'Average emotional tone of global news coverage mentioning ' + country + '. Source: GDELT DOC 2.0 API (live, last 30 days). Negative = hostile/alarming, positive = favorable/calm.'
    });
  } catch (err) {
    const el = document.getElementById('gdeltToneLoading');
    if (el) el.textContent = '⚠ GDELT tone unavailable: ' + err.message;
  }
}

// ── PILLAR CHARTS (JSON-driven) ──
function renderPillarCharts(key, charts) {
  const container = document.getElementById(key + '-charts');
  if (!container) return;
  container.innerHTML = '';
  (charts || []).forEach(c => {
    const panel = document.createElement('div');
    panel.className = 'gdelt-panel';
    panel.innerHTML =
      '<div class="gdelt-panel-header">' +
        '<div class="gdelt-title">' + (c.title || 'Chart') + '</div>' +
        '<div class="live-badge" style="color:var(--text-dim);">Brief Data</div>' +
      '</div>' +
      '<div class="gdelt-chart-area"><canvas height="80"></canvas></div>';
    container.appendChild(panel);
    const canvas = panel.querySelector('canvas');
    drawChart(canvas, {
      values: c.values || [],
      years: c.years || (c.values || []).map((_, i) => 'Pt ' + (i + 1)),
      unit: c.unit || '',
      color: c.color || '#c8a84b',
      chartTitle: c.title || '',
      explain: c.explain || ''
    });
  });
}

// ── MISSION RESOURCES (JSON-driven) ──
function renderResources(res) {
  const section = document.getElementById('mission-resources-section');
  const grid = document.getElementById('mission-resources');
  if (!section || !grid) return;
  grid.innerHTML = '';
  let count = 0;
  ((res && res.links) || []).forEach(group => {
    (group.cards || []).forEach(c => {
      count++;
      const card = document.createElement('div');
      card.className = 'resource-card';
      card.style.cursor = 'pointer';
      card.onclick = () => window.open(c.url, '_blank');
      card.innerHTML =
        '<div class="rc-category">' + (c.tag || group.category || 'Source') + '</div>' +
        '<div class="rc-title">' + (c.title || '') + '</div>' +
        '<div class="rc-desc">' + (c.desc || '') + '</div>' +
        '<div class="rc-url">' + String(c.url || '').replace(/^https?:\/\//, '') + ' ↗</div>';
      grid.appendChild(card);
    });
  });
  section.style.display = count ? '' : 'none';
}

// ── PROMPT CONFIG (mission token substitution) ──
const PROMPT_TOKENS = {
  'cfg-country':  '[COUNTRY]',
  'cfg-unit':     '[YOUR UNIT]',
  'cfg-partner':  '[PARTNER UNIT]',
  'cfg-location': '[LOCATION]'
};
const _promptTemplates = {};

function cachePromptTemplates() {
  document.querySelectorAll('.prompt-text').forEach(el => {
    if (el.id) _promptTemplates[el.id] = el.textContent;
  });
}

function applyPromptConfig() {
  const values = {};
  Object.entries(PROMPT_TOKENS).forEach(([inputId, token]) => {
    const el = document.getElementById(inputId);
    const v = el && el.value.trim();
    values[token] = v || token;
    try { if (el) localStorage.setItem('dime-' + inputId, el.value); } catch (e) {}
  });
  Object.entries(_promptTemplates).forEach(([id, tpl]) => {
    let out = tpl;
    Object.entries(values).forEach(([token, val]) => { out = out.split(token).join(val); });
    const el = document.getElementById(id);
    if (el) el.textContent = out;
  });
}

function restorePromptConfig() {
  Object.keys(PROMPT_TOKENS).forEach(inputId => {
    try {
      const v = localStorage.getItem('dime-' + inputId);
      const el = document.getElementById(inputId);
      if (v && el) el.value = v;
    } catch (e) {}
  });
  applyPromptConfig();
}

// ── COPY PROMPT ──
function copyPrompt(btn, id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy Prompt'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── AOR MAP — Leaflet + CartoDB (markers come from brief JSON) ──
const MAP_LAYERS = {
  dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  terrain:   'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};
let _currentTileLayer = null;

function switchMapLayer(type) {
  if (!window._aorMap) return;
  if (_currentTileLayer) window._aorMap.removeLayer(_currentTileLayer);
  const noSub = type === 'satellite';
  _currentTileLayer = L.tileLayer(MAP_LAYERS[type], {
    subdomains: noSub ? '' : 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(window._aorMap);
  _currentTileLayer.bringToBack();
}

function makeIcon(color, symbol) {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;box-shadow:0 0 8px ${color}88;">${symbol}</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16]
  });
}

function initMap() {
  if (!window.L) return;
  const el = document.getElementById('aorMap');
  if (!el || el._leaflet_id) return;

  const map = L.map('aorMap', { center: [25, 10], zoom: 2, zoomControl: true });
  window._aorMap = map;
  window._briefMarkerLayer = L.layerGroup().addTo(map);
  switchMapLayer('dark');

  const style = document.createElement('style');
  style.textContent = `.map-popup .leaflet-popup-content-wrapper{background:#111;border:1px solid rgba(200,168,75,0.3);border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.6);}.map-popup .leaflet-popup-content{margin:12px 14px;}.map-popup .leaflet-popup-tip{background:#111;}`;
  document.head.appendChild(style);
  setTimeout(() => map.invalidateSize(), 100);

  // If a brief loaded before the map initialized, render it now
  if (window._pendingMapMeta) { updateBriefMap(window._pendingMapMeta); window._pendingMapMeta = null; }
}

function updateBriefMap(m) {
  if (!window._aorMap) { window._pendingMapMeta = m; return; }
  const layer = window._briefMarkerLayer;
  if (layer) layer.clearLayers();
  if (!m) return;
  if (m.center && Array.isArray(m.center) && m.center.length === 2) {
    window._aorMap.setView(m.center, m.zoom || 6);
  }
  const po = { className: 'map-popup', maxWidth: 220, closeButton: false };
  const pp = (t, b) => `<div style="font-family:'Barlow Condensed',sans-serif;"><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c8a84b;margin-bottom:4px;">${t}</div><div style="font-size:12px;color:#aaa;line-height:1.5;">${b}</div></div>`;
  (m.markers || []).forEach(mk => {
    if (typeof mk.lat !== 'number' || typeof mk.lon !== 'number') return;
    L.marker([mk.lat, mk.lon], { icon: makeIcon(mk.color || '#c8a84b', mk.symbol || '●') })
      .addTo(layer)
      .bindPopup(pp(mk.title || '', mk.notes || ''), po);
  });
}

// ── MAP PANE DRAG RESIZE ──
// ── MAP PANE DRAG RESIZE ──
// ── MAP PANE DRAG RESIZE ──
(function() {
  let dragging = false, startX = 0, startW = 0;

  const divider = document.getElementById('mapDivider');
  const mapPane = document.getElementById('mapPane');
  const layout  = document.getElementById('overviewLayout');
  if (!divider || !mapPane || !layout) return;

  divider.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = mapPane.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startX - e.clientX;          // dragging left = map grows
    const newW  = Math.max(180, Math.min(startW + delta, layout.offsetWidth - 220));
    mapPane.style.width = newW + 'px';
    if (window._aorMap) window._aorMap.invalidateSize();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (window._aorMap) window._aorMap.invalidateSize();
  });
})();

// ── MAP FULLSCREEN ──
function toggleMapFullscreen() {
  const pane = document.getElementById('mapPane');
  const btn  = document.getElementById('mapFullscreenBtn');
  const isFS = pane.classList.toggle('map-fullscreen');
  btn.textContent = isFS ? '✕' : '⛶';
  btn.title = isFS ? 'Exit fullscreen' : 'Toggle fullscreen map';
  setTimeout(() => { if (window._aorMap) window._aorMap.invalidateSize(); }, 50);
  // Escape key exits fullscreen
  if (isFS) {
    const esc = e => { if (e.key === 'Escape') { pane.classList.remove('map-fullscreen'); btn.textContent = '⛶'; document.removeEventListener('keydown', esc); if (window._aorMap) window._aorMap.invalidateSize(); } };
    document.addEventListener('keydown', esc);
  }
}

// ── LIVE RSS FEED ──
const DEFAULT_FEEDS = [
  { label: 'NATO',        url: 'https://www.nato.int/cen/natohq/rss.xml',   color: '#1a6aaa' },
  { label: 'ISW',         url: 'https://www.understandingwar.org/feed',     color: '#8b2222' },
  { label: 'EUvsDisinfo', url: 'https://euvsdisinfo.eu/feed/',              color: '#4a8a55' }
];

const CORS_PROXY = 'https://api.allorigins.win/get?url=';

async function fetchRSSFeed(source) {
  try {
    const proxyUrl = CORS_PROXY + encodeURIComponent(source.url);
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const xmlText = json.contents;
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    const items = Array.from(xml.querySelectorAll('item')).slice(0, 3);
    return items.map(item => ({
      title:  item.querySelector('title')?.textContent?.trim()   || 'Untitled',
      link:   item.querySelector('link')?.textContent?.trim()    || '#',
      date:   item.querySelector('pubDate')?.textContent?.trim() || '',
      source: source.label,
      color:  source.color
    }));
  } catch (err) {
    return [{ error: true, source: source.label, msg: err.message }];
  }
}

function formatFeedDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  } catch { return s.substring(0, 16); }
}

async function loadLiveFeed(customFeeds) {
  const grid     = document.getElementById('liveFeedGrid');
  const loading  = document.getElementById('feedLoading');
  const badge    = document.querySelector('.live-badge');
  const ts       = document.getElementById('feedTimestamp');
  if (!grid) return;
  const feeds = (customFeeds && customFeeds.length) ? customFeeds : DEFAULT_FEEDS;

  try {
    const results = await Promise.allSettled(
      feeds.map(s => fetchRSSFeed(s).catch(e => [{error:true, source:s.label, msg:e.message}]))
    );
    const allItems = [];
    results.forEach(r => { if (r.status === 'fulfilled') r.value.forEach(item => allItems.push(item)); });
    const good = allItems.filter(i => !i.error).sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    const bad  = allItems.filter(i => i.error);

    if (loading) loading.style.display = 'none';

    if (good.length === 0) {
      grid.innerHTML = '<div class="feed-error">⚠ RSS sources unreachable. Try running via local server: python3 -m http.server 8080</div>';
    } else {
      grid.innerHTML = '';
      good.forEach(item => {
        const el = document.createElement('div');
        el.className = 'feed-item';
        el.onclick = () => window.open(item.link, '_blank');
        el.innerHTML =
          '<div class="feed-source-badge" style="color:' + item.color + ';">' + item.source + '</div>' +
          '<div class="feed-body">' +
            '<div class="feed-title">' + item.title + '</div>' +
            '<div class="feed-date">' + formatFeedDate(item.date) + '</div>' +
          '</div>' +
          '<div style="color:var(--text-muted);font-size:0.82rem;padding-top:2px;">↗</div>';
        grid.appendChild(el);
      });
      if (bad.length > 0) {
        const e = document.createElement('div');
        e.className = 'feed-error';
        e.textContent = '⚠ Could not reach: ' + bad.map(b => b.source).join(', ');
        grid.appendChild(e);
      }
    }
    if (badge) badge.innerHTML = '<span class="live-dot" style="display:inline-block;"></span> ' + good.length + ' articles loaded';
    if (ts) ts.textContent = 'Last fetched: ' + new Date().toLocaleTimeString();
  } catch (err) {
    if (loading) loading.textContent = '⚠ Feed error: ' + err.message;
  }
}

// ── INIT ──
window.addEventListener('load', () => {
  initMap();
  loadLiveFeed();
  cachePromptTemplates();
  restorePromptConfig();
  renderResources(null);
});
