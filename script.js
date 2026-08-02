'use strict';

/* =========================================================================
 * script.js — לוגיקת הדשבורד (KPI, גרפים, טבלה, סינון).
 * מסתמך על common.js שנטען לפניו (DATA_URL, C, loadHealthData, avg, fmt,
 * shortDate, longDate, minToHm, $ ...).
 * ========================================================================= */

const state = {
  data: [],
  isDemo: false,
  range: 7,          // 7 | 30 | 'all'
  sortKey: 'date',
  sortDir: -1,       // -1 = יורד (חדש למעלה)
};

const charts = {};   // מופעי Chart.js פעילים, לפי מזהה canvas

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
  const { data, isDemo } = await loadHealthData();
  state.data = data;
  state.isDemo = isDemo;

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('demo-banner').classList.toggle('hidden', !isDemo);

  const last = state.data[state.data.length - 1];
  $('last-updated').textContent = last
    ? `עודכן לאחרונה: ${longDate(last.date)} · ${state.data.length} ימי מדידה`
    : '';

  renderAll();
}

init();
