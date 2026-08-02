'use strict';

/* =========================================================================
 * הגדרות
 * DATA_URL — מאיפה נטענים הנתונים. ברירת המחדל: קובץ ה-JSON שמתעדכן
 * אוטומטית ע"י ה-GitHub Action. אפשר להחליף לכתובת CSV ציבורית של
 * Google Sheets (File → Share → Publish to web → CSV) — הקוד מזהה לבד.
 * ========================================================================= */
const DATA_URL = 'data/health.json';
const SLEEP_GOAL_HOURS = 8;
const STEPS_GOAL = 10000;

/* צבעי סדרות — תואמים ל-style.css, עברו ולידציית נגישות מול #1e293b */
const C = {
  blue: '#3987e5',
  green: '#199e70',
  violet: '#9085e9',
  red: '#e66767',
  orange: '#d95926',
  muted: '#64748b',
  ink2: '#94a3b8',
  grid: '#2b3a52',
  surface: '#1e293b',
};

/* =========================================================================
 * נתוני דמו — 14 ימים אחרונים, נוצרים דטרמיניסטית כדי שהדשבורד יעבוד
 * מיד גם לפני הסנכרון הראשון מגרמין.
 * ========================================================================= */
function buildMockData() {
  const rand = (seed => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  })(42);

  const rows = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const sleepHours = +(6.2 + rand() * 2.4).toFixed(2);
    const deep = Math.round(50 + rand() * 40);
    const rem = Math.round(70 + rand() * 50);
    const light = Math.round(sleepHours * 60 - deep - rem);
    rows.push({
      date: d.toISOString().slice(0, 10),
      sleep_hours: sleepHours,
      sleep_score: Math.round(65 + rand() * 30),
      deep_min: deep,
      light_min: light,
      rem_min: rem,
      awake_min: Math.round(5 + rand() * 20),
      rhr: Math.round(50 + rand() * 8),
      hrv: Math.round(38 + rand() * 25),
      stress_avg: Math.round(20 + rand() * 30),
      body_battery_high: Math.round(70 + rand() * 30),
      body_battery_low: Math.round(5 + rand() * 30),
      steps: Math.round(4000 + rand() * 9000),
      calories: Math.round(2000 + rand() * 700),
      intensity_min: Math.round(rand() * 60),
    });
  }
  return rows;
}

/* =========================================================================
 * טעינה ופארסינג
 * ========================================================================= */

/* מיפוי כותרות CSV נפוצות (Google Sheets / FitnessSyncer) לשדות שלנו */
const CSV_FIELD_MAP = {
  'date': 'date',
  'sleep duration': 'sleep_hours', 'sleep hours': 'sleep_hours',
  'sleep score': 'sleep_score',
  'resting heart rate': 'rhr', 'rhr': 'rhr',
  'hrv': 'hrv',
  'stress': 'stress_avg', 'stress level': 'stress_avg',
  'steps': 'steps',
  'calories': 'calories',
  'deep': 'deep_min', 'light': 'light_min', 'rem': 'rem_min',
  'body battery high': 'body_battery_high', 'body battery low': 'body_battery_low',
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const fields = headers.map(h => CSV_FIELD_MAP[h.toLowerCase()] || null);
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row = {};
    fields.forEach((field, i) => {
      if (!field || cells[i] === undefined || cells[i] === '') return;
      row[field] = field === 'date' ? cells[i] : Number(cells[i]);
    });
    return row;
  }).filter(r => r.date);
}

async function loadData() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    rows = parseCsv(text);
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('אין נתונים בקובץ');
  return rows
    .filter(r => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* =========================================================================
 * מצב האפליקציה
 * ========================================================================= */
const state = {
  data: [],
  isDemo: false,
  range: 7,          // 7 | 30 | 'all'
  sortKey: 'date',
  sortDir: -1,       // -1 = יורד (חדש למעלה)
};

const charts = {};   // מופעי Chart.js פעילים, לפי מזהה canvas

/* =========================================================================
 * עזרים
 * ========================================================================= */
const $ = id => document.getElementById(id);

function visibleRows() {
  if (state.range === 'all') return state.data;
  return state.data.slice(-state.range);
}

/* חלון קודם באותו אורך — להשוואת מגמה */
function previousRows() {
  if (state.range === 'all') return [];
  const n = state.range;
  return state.data.slice(-2 * n, -n);
}

function avg(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function fmt(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('he-IL', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${+d}.${+m}`;
}

function longDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return `יום ${DAY_NAMES[date.getDay()]}, ${shortDate(iso)}`;
}

function minToHm(min) {
  if (min === null || min === undefined) return '—';
  return `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
}

/* =========================================================================
 * כרטיסיות KPI
 * ========================================================================= */
const KPI_DEFS = [
  { key: 'sleep_hours', label: 'שעות שינה בממוצע', unit: 'שעות', decimals: 1, goodUp: true, color: C.blue },
  { key: 'sleep_score', label: 'ציון שינה (Sleep Score)', unit: '/100', decimals: 0, goodUp: true, color: C.blue },
  { key: 'rhr', label: 'דופק מנוחה (RHR)', unit: 'bpm', decimals: 0, goodUp: false, color: C.red },
  { key: 'hrv', label: 'שונות דופק (HRV)', unit: 'ms', decimals: 0, goodUp: true, color: C.green },
  { key: 'stress_avg', label: 'רמת מתח ממוצעת', unit: '/100', decimals: 0, goodUp: false, color: C.orange },
  { key: 'steps', label: 'צעדים בממוצע', unit: '', decimals: 0, goodUp: true, color: C.violet },
];

function renderKpis() {
  const rows = visibleRows();
  const prev = previousRows();
  $('kpi-grid').innerHTML = KPI_DEFS.map(def => {
    const current = avg(rows, def.key);
    const before = avg(prev, def.key);

    let deltaHtml = '<span class="kpi-delta">אין השוואה לתקופה קודמת</span>';
    if (current !== null && before !== null) {
      const diff = current - before;
      const shown = fmt(Math.abs(diff), def.decimals);
      if (Number(shown.replace(/[^\d.]/g, '')) === 0) {
        deltaHtml = '<span class="kpi-delta">ללא שינוי לעומת התקופה הקודמת</span>';
      } else {
        const isGood = def.goodUp ? diff > 0 : diff < 0;
        const arrow = diff > 0 ? '▲' : '▼';
        deltaHtml = `<span class="kpi-delta ${isGood ? 'good' : 'bad'}">${arrow} ${shown} לעומת התקופה הקודמת</span>`;
      }
    }

    return `
      <div class="kpi">
        <span class="kpi-label"><i class="kpi-dot" style="background:${def.color}"></i>${def.label}</span>
        <span class="kpi-value">${fmt(current, def.decimals)}<small>${def.unit}</small></span>
        ${deltaHtml}
      </div>`;
  }).join('');
}

/* =========================================================================
 * גרפים (Chart.js)
 * ========================================================================= */
Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
Chart.defaults.color = C.ink2;
Chart.defaults.borderColor = C.grid;
Chart.defaults.animation.duration = 400;

/* אפשרויות משותפות לכל הגרפים; labelFn מעצב את שורת ה-tooltip */
function baseOptions({ y = {}, stacked = false, labelFn = null } = {}) {
  const callbacks = { title: items => longDate(items[0].raw.iso) };
  if (labelFn) callbacks.label = labelFn;
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        backgroundColor: '#0f172a',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        padding: 10,
        titleFont: { weight: '600' },
        callbacks,
      },
    },
    scales: {
      x: {
        stacked,
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      },
      y: { stacked, grid: { color: C.grid }, border: { display: false }, ...y },
    },
  };
}

function makeChart(canvasId, config) {
  charts[canvasId]?.destroy();
  charts[canvasId] = new Chart($(canvasId), config);
}

/* נקודות עם תאריך ISO צמוד, כדי שה-tooltip יציג תאריך מלא */
const points = (rows, key) => rows.map(r => ({ x: shortDate(r.date), y: r[key] ?? null, iso: r.date }));

function goalLineDataset(rows, value, label) {
  return {
    label,
    data: rows.map(r => ({ x: shortDate(r.date), y: value, iso: r.date })),
    type: 'line',
    borderColor: C.muted,
    borderWidth: 1.5,
    borderDash: [6, 5],
    pointRadius: 0,
    fill: false,
  };
}

function renderCharts() {
  const rows = visibleRows();
  const labels = rows.map(r => shortDate(r.date));

  /* --- שעות שינה + קו יעד --- */
  makeChart('chart-sleep', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'שעות שינה',
          data: points(rows, 'sleep_hours'),
          backgroundColor: C.blue,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 26,
        },
        goalLineDataset(rows, SLEEP_GOAL_HOURS, 'יעד'),
      ],
    },
    options: baseOptions({
      y: { beginAtZero: true, suggestedMax: 10 },
      labelFn: item => item.dataset.type === 'line'
        ? `יעד: ${SLEEP_GOAL_HOURS} שעות`
        : `שינה: ${fmt(item.raw.y, 1)} שעות`,
    }),
  });

  /* --- שלבי שינה (מוערם) --- */
  const stageDefs = [
    { key: 'deep_min', label: 'שינה עמוקה', color: C.blue },
    { key: 'light_min', label: 'שינה קלה', color: C.green },
    { key: 'rem_min', label: 'REM', color: C.violet },
  ];
  $('legend-stages').innerHTML = stageDefs
    .map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  makeChart('chart-stages', {
    type: 'bar',
    data: {
      labels,
      datasets: stageDefs.map((s, i) => ({
        label: s.label,
        data: points(rows, s.key),
        backgroundColor: s.color,
        stack: 'sleep',
        borderRadius: i === stageDefs.length - 1 ? 4 : 0,
        borderSkipped: false,
        /* רווח 2px בין מקטעי הערימה — גבול בצבע המשטח */
        borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
        borderColor: C.surface,
        maxBarThickness: 26,
      })),
    },
    options: baseOptions({
      stacked: true,
      y: { beginAtZero: true, ticks: { callback: v => minToHm(v) } },
      labelFn: item => `${item.dataset.label}: ${minToHm(item.raw.y)} שעות`,
    }),
  });

  /* --- דופק מנוחה --- */
  makeChart('chart-rhr', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'RHR',
        data: points(rows, 'rhr'),
        borderColor: C.red,
        backgroundColor: 'rgba(230,103,103,0.12)',
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: C.red,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      }],
    },
    options: baseOptions({
      y: { grace: '15%' },
      labelFn: item => `דופק מנוחה: ${fmt(item.raw.y)} bpm`,
    }),
  });

  /* --- HRV --- */
  makeChart('chart-hrv', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'HRV',
        data: points(rows, 'hrv'),
        borderColor: C.green,
        backgroundColor: 'rgba(25,158,112,0.12)',
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: C.green,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      }],
    },
    options: baseOptions({
      y: { grace: '15%' },
      labelFn: item => `HRV: ${fmt(item.raw.y)} ms`,
    }),
  });

  /* --- סטרס + Body Battery (סקאלה משותפת 0–100) --- */
  $('legend-stress').innerHTML = [
    `<span><i style="background:${C.orange}"></i>סטרס ממוצע</span>`,
    `<span><i style="background:rgba(57,135,229,0.5)"></i>טווח Body Battery</span>`,
  ].join('');
  makeChart('chart-stress', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Body Battery — שיא',
          data: points(rows, 'body_battery_high'),
          borderColor: 'rgba(57,135,229,0.65)',
          backgroundColor: 'rgba(57,135,229,0.18)',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.35,
          fill: '+1',
          spanGaps: true,
        },
        {
          label: 'Body Battery — שפל',
          data: points(rows, 'body_battery_low'),
          borderColor: 'rgba(57,135,229,0.65)',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: 'סטרס ממוצע',
          data: points(rows, 'stress_avg'),
          borderColor: C.orange,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: C.orange,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
      ],
    },
    options: baseOptions({
      y: { min: 0, max: 100 },
      labelFn: item => `${item.dataset.label}: ${fmt(item.raw.y)}`,
    }),
  });

  /* --- צעדים + קו יעד --- */
  makeChart('chart-steps', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'צעדים',
          data: points(rows, 'steps'),
          backgroundColor: C.violet,
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: 26,
        },
        goalLineDataset(rows, STEPS_GOAL, 'יעד'),
      ],
    },
    options: baseOptions({
      y: { beginAtZero: true },
      labelFn: item => item.dataset.type === 'line'
        ? `יעד: ${fmt(STEPS_GOAL)} צעדים`
        : `צעדים: ${fmt(item.raw.y)}`,
    }),
  });
}

/* =========================================================================
 * טבלת היסטוריה
 * ========================================================================= */
const TABLE_COLS = [
  { key: 'date', label: 'תאריך', render: r => longDate(r.date) },
  { key: 'sleep_hours', label: 'שינה', render: r => r.sleep_hours != null ? `${fmt(r.sleep_hours, 1)} ש׳` : '—' },
  { key: 'sleep_score', label: 'ציון', render: r => fmt(r.sleep_score) },
  { key: 'rhr', label: 'RHR', render: r => fmt(r.rhr) },
  { key: 'hrv', label: 'HRV', render: r => fmt(r.hrv) },
  { key: 'stress_avg', label: 'סטרס', render: r => fmt(r.stress_avg) },
  { key: 'body_battery_high', label: 'Battery', render: r => fmt(r.body_battery_high) },
  { key: 'steps', label: 'צעדים', render: r => fmt(r.steps) },
  { key: 'calories', label: 'קלוריות', render: r => fmt(r.calories) },
];

function renderTable() {
  const rows = [...visibleRows()].sort((a, b) => {
    const va = a[state.sortKey], vb = b[state.sortKey];
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return cmp * state.sortDir;
  });

  $('history-head').innerHTML = TABLE_COLS.map(col => {
    const arrow = col.key === state.sortKey ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '';
    return `<th data-key="${col.key}">${col.label}${arrow}</th>`;
  }).join('');

  $('history-body').innerHTML = rows.map(r =>
    `<tr>${TABLE_COLS.map(col => {
      const value = col.render(r);
      return `<td class="${value === '—' ? 'dim' : ''}">${value}</td>`;
    }).join('')}</tr>`
  ).join('');

  $('history-head').querySelectorAll('th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir *= -1;
      } else {
        state.sortKey = key;
        state.sortDir = key === 'date' ? -1 : 1;
      }
      renderTable();
    });
  });
}

/* =========================================================================
 * סינון טווח ורינדור כולל
 * ========================================================================= */
function renderAll() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    const value = btn.dataset.range === 'all' ? 'all' : Number(btn.dataset.range);
    btn.classList.toggle('active', value === state.range);
  });
  renderKpis();
  renderCharts();
  renderTable();
}

$('range-filter').addEventListener('click', event => {
  const btn = event.target.closest('.range-btn');
  if (!btn) return;
  state.range = btn.dataset.range === 'all' ? 'all' : Number(btn.dataset.range);
  renderAll();
});

/* =========================================================================
 * אתחול
 * ========================================================================= */
async function init() {
  try {
    state.data = await loadData();
  } catch (err) {
    console.warn('טעינת נתונים נכשלה, עובר לנתוני דמו:', err.message);
    state.data = buildMockData();
    state.isDemo = true;
  }

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('demo-banner').classList.toggle('hidden', !state.isDemo);

  const last = state.data[state.data.length - 1];
  $('last-updated').textContent = last
    ? `עודכן לאחרונה: ${longDate(last.date)} · ${state.data.length} ימי מדידה`
    : '';

  renderAll();
}

init();
