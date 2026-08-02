'use strict';

/* =========================================================================
 * app.js — אפליקציית עמוד יחיד (SPA) עם 4 עמודים בהחלקה:
 * בית · בריאות הלב · שינה · צעדים. מסתמך על common.js
 * (C, loadHealthData, avg, fmt, shortDate, longDate, minToHm, pearson, $).
 * ========================================================================= */

const state = { data: [], isDemo: false, range: 30 };
const charts = {};

if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = C.grid;
}

function visibleRows() {
  return state.range === 'all' ? state.data : state.data.slice(-state.range);
}
function previousRows() {
  if (state.range === 'all') return [];
  const n = state.range;
  return state.data.slice(-2 * n, -n);
}

/* =========================================================================
 * תוכן מקצועי לכל מדד (מה זה + על מה עלייה/ירידה משפיעות)
 * ========================================================================= */
const METRICS = {
  rhr: {
    label: 'דופק מנוחה (RHR)', unit: 'bpm', decimals: 0, goodUp: false, color: C.red,
    what: 'פעימות הלב בדקה במנוחה מלאה — מדד מרכזי לכושר לב-ריאה. ככל שנמוך יותר, הלב יעיל יותר. טווח טיפוסי 40–70.',
    rise: 'עלייה מתמשכת עשויה להעיד על עייפות מצטברת, לחץ, התייבשות או תחילת מחלה — שווה לשים לב.',
    fall: 'ירידה היא בדרך כלל סימן חיובי — שיפור בכושר ובהתאוששות.',
  },
  hrv: {
    label: 'שונות דופק (HRV)', unit: 'ms', decimals: 0, goodUp: true, color: C.green,
    what: 'ההבדל בזמן בין פעימות הלב, מדד לאיזון מערכת העצבים. HRV גבוה = גוף מאושש. אישי מאוד — השווה לעצמך.',
    rise: 'עלייה מעל הבסיס שלך מעידה על התאוששות טובה ומוכנות גבוהה לפעילות.',
    fall: 'ירידה מתחת לבסיס עשויה להעיד על לחץ, עייפות, אלכוהול או תחילת מחלה — עדיף יום קל יותר.',
  },
  stress_avg: {
    label: 'רמת מתח (Stress)', unit: '/100', decimals: 0, goodUp: false, color: C.orange,
    what: 'הערכת גרמין למתח (0–100) לפי ניתוח HRV לאורך היום. 0–25 מנוחה, 26–50 נמוך, 51–75 בינוני, 76+ גבוה.',
    rise: 'מתח גבוה לאורך זמן קשור לשחיקה ולשינה פחות איכותית — חשוב לשלב הפוגות התאוששות.',
    fall: 'ירידה מעידה על איזון טוב יותר בין עומס להתאוששות.',
  },
  sleep_hours: {
    label: 'שעות שינה', unit: 'שעות', decimals: 1, goodUp: true, color: C.blue,
    what: 'משך השינה הכולל. בזמן הזה הגוף משקם רקמות, מגבש זיכרון ומאזן הורמונים. ההמלצה 7–9 שעות.',
    rise: 'עלייה בשעות השינה משפרת התאוששות, מצב רוח וריכוז — עקביות חשובה יותר מלילה בודד.',
    fall: 'ירידה מתמשכת פוגעת בריכוז ובהתאוששות ומעלה את הורמון הרעב — שווה להקדים שעת שינה.',
  },
  sleep_score: {
    label: 'ציון שינה (Sleep Score)', unit: '/100', decimals: 0, goodUp: true, color: C.blue,
    what: 'ציון מורכב (0–100) משילוב משך השינה, שלביה ורוגע הלב בלילה. 90+ מצוין, 80–89 טוב, 60–79 בינוני.',
    rise: 'ציון עולה מעיד שאיכות השינה משתפרת, לא רק הכמות — סימן טוב להתאוששות.',
    fall: 'ציון יורד רומז על שינה מקוטעת או מעט שינה עמוקה/REM — בדוק לחץ, אלכוהול או פעילות מאוחרת.',
  },
  steps: {
    label: 'צעדים', unit: '', decimals: 0, goodUp: true, color: C.violet,
    what: 'מדד לפעילות היומית הכוללת. יעד נפוץ 8,000–10,000 צעדים. פעילות תומכת בלב, במצב הרוח ובשינה.',
    rise: 'עלייה בפעילות תומכת בבריאות הלב, במצב הרוח ובאיכות השינה.',
    fall: 'ירידה לאורך זמן עלולה לפגוע בכושר ובשינה — גם הליכות קצרות מפוזרות עוזרות.',
  },
};

/* =========================================================================
 * עזרי מגמה
 * ========================================================================= */
/* השוואה לתקופה הקודמת דורשת לפחות 3 ימי נתונים, אחרת ההשוואה מטעה */
function prevCount(key) {
  return previousRows().filter(r => r[key] !== null && r[key] !== undefined).length;
}

function trendOf(key) {
  const def = METRICS[key];
  const current = avg(visibleRows(), key);
  const before = avg(previousRows(), key);
  if (current === null) return { current: null };
  if (before === null || prevCount(key) < 3) return { current, dir: 'flat', hasPrev: false };
  const diff = current - before;
  const shown = fmt(Math.abs(diff), def.decimals);
  const flat = Number(shown.replace(/[^\d.]/g, '')) === 0;
  const pct = before !== 0 ? (diff / before) * 100 : 0;
  const dir = flat ? 'flat' : diff > 0 ? 'rise' : 'fall';
  const good = dir === 'flat' ? null : def.goodUp ? diff > 0 : diff < 0;
  return { current, before, diff, pct, dir, good, hasPrev: true, shown };
}

/* =========================================================================
 * כרטיסי KPI
 * ========================================================================= */
function kpiCard(def) {
  const rows = visibleRows(), prev = previousRows();
  let value, unit = def.unit || '', decimals = def.decimals || 0, deltaHtml = '<span class="kpi-delta">&nbsp;</span>';

  if (def.compute) {
    const r = def.compute(rows);
    value = r.value; unit = r.unit ?? unit; decimals = r.decimals ?? decimals;
  } else {
    value = avg(rows, def.key);
    const before = avg(prev, def.key);
    const enoughPrev = prev.filter(r => r[def.key] !== null && r[def.key] !== undefined).length >= 3;
    if (value !== null && before !== null && enoughPrev) {
      const diff = value - before;
      const shown = fmt(Math.abs(diff), decimals);
      if (Number(shown.replace(/[^\d.]/g, '')) === 0) {
        deltaHtml = '<span class="kpi-delta">ללא שינוי</span>';
      } else {
        const good = def.goodUp ? diff > 0 : diff < 0;
        deltaHtml = `<span class="kpi-delta ${good ? 'good' : 'bad'}">${diff > 0 ? '▲' : '▼'} ${shown}</span>`;
      }
    }
  }
  return `
    <div class="kpi">
      <div class="kpi-top">
        <span class="kpi-ic" style="background:${def.color}22">${def.emoji}</span>
        <span class="kpi-label">${def.label}</span>
      </div>
      <div class="kpi-value">${fmt(value, decimals)}<small>${unit}</small></div>
      ${deltaHtml}
    </div>`;
}
function renderKpis(id, defs) { $(id).innerHTML = defs.map(kpiCard).join(''); }

const KPIS = {
  home: [
    { key: 'sleep_hours', label: 'שעות שינה', unit: 'שעות', decimals: 1, goodUp: true, color: C.blue, emoji: '💤' },
    { key: 'rhr', label: 'דופק מנוחה', unit: 'bpm', goodUp: false, color: C.red, emoji: '❤️' },
    { key: 'hrv', label: 'HRV', unit: 'ms', goodUp: true, color: C.green, emoji: '💚' },
    { key: 'steps', label: 'צעדים', goodUp: true, color: C.violet, emoji: '👣' },
  ],
  heart: [
    { key: 'rhr', label: 'דופק מנוחה', unit: 'bpm', goodUp: false, color: C.red, emoji: '❤️' },
    { key: 'hrv', label: 'HRV', unit: 'ms', goodUp: true, color: C.green, emoji: '💚' },
    { key: 'stress_avg', label: 'רמת מתח', unit: '/100', goodUp: false, color: C.orange, emoji: '🔥' },
    { key: 'body_battery_high', label: 'Body Battery שיא', goodUp: true, color: C.blue, emoji: '🔋' },
  ],
  sleep: [
    { key: 'sleep_hours', label: 'שעות שינה', unit: 'שעות', decimals: 1, goodUp: true, color: C.blue, emoji: '💤' },
    { key: 'sleep_score', label: 'ציון שינה', unit: '/100', goodUp: true, color: C.blue, emoji: '⭐' },
    { key: 'deep_min', label: 'שינה עמוקה', unit: 'דק׳', goodUp: true, color: C.violet, emoji: '🌙' },
    { key: 'rem_min', label: 'REM', unit: 'דק׳', goodUp: true, color: C.teal, emoji: '🧠' },
  ],
  steps: [
    { key: 'steps', label: 'צעדים בממוצע', goodUp: true, color: C.violet, emoji: '👣' },
    { key: 'calories', label: 'קלוריות', unit: 'kcal', goodUp: true, color: C.orange, emoji: '🔥' },
    { key: 'intensity_min', label: 'דקות פעילות', unit: 'דק׳', goodUp: true, color: C.green, emoji: '⚡' },
    {
      label: 'ימים ביעד', color: C.blue, emoji: '🎯',
      compute: rows => {
        const d = rows.filter(r => r.steps != null);
        const hit = d.filter(r => r.steps >= STEPS_GOAL).length;
        return { value: d.length ? Math.round((hit / d.length) * 100) : null, unit: '%', decimals: 0 };
      },
    },
  ],
};

/* =========================================================================
 * גרפים
 * ========================================================================= */
function TT(labelFn) {
  const cb = { title: items => longDate(items[0].raw.iso) };
  if (labelFn) cb.label = labelFn;
  return {
    rtl: true, textDirection: 'rtl',
    backgroundColor: '#ffffff', titleColor: '#0f172a', bodyColor: '#475569',
    borderColor: '#e7edf6', borderWidth: 1, padding: 10, cornerRadius: 10, boxPadding: 4,
    titleFont: { weight: '700' },
    /* קווי עזר (יעד / ממוצע נע) לא מופיעים ב-tooltip כדי לא לעמוס */
    filter: item => !['ממוצע 7 ימים', 'יעד'].includes(item.dataset.label),
    callbacks: cb,
  };
}
function opts(yScale, labelFn, stacked) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: TT(labelFn) },
    scales: {
      x: { stacked: !!stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
      y: Object.assign({ stacked: !!stacked, grid: { color: C.grid }, border: { display: false } }, yScale || {}),
    },
  };
}
function make(id, config) { charts[id]?.destroy(); charts[id] = new Chart($(id), config); }
const points = (rows, key) => rows.map(r => ({ x: shortDate(r.date), y: r[key] ?? null, iso: r.date }));
function goalLine(rows, value) {
  return {
    label: 'יעד',
    data: rows.map(r => ({ x: shortDate(r.date), y: value, iso: r.date })),
    type: 'line', borderColor: C.muted, borderWidth: 1.5, borderDash: [6, 5], pointRadius: 0, fill: false,
  };
}

/* ממוצע נע 7 ימים — מדגיש מגמה ומסנן רעש יומי */
function maSeries(rows, key, win = 7) {
  const v = rows.map(r => r[key]);
  return v.map((_, i) => {
    const w = [];
    for (let j = Math.max(0, i - win + 1); j <= i; j++) {
      const x = v[j];
      if (x !== null && x !== undefined && !Number.isNaN(x)) w.push(x);
    }
    return w.length >= 3 ? w.reduce((a, b) => a + b, 0) / w.length : null;
  });
}
function maLine(rows, key) {
  const ma = maSeries(rows, key);
  return {
    label: 'ממוצע 7 ימים',
    data: rows.map((r, i) => ({ x: shortDate(r.date), y: ma[i], iso: r.date })),
    type: 'line', borderColor: '#334155', borderWidth: 2, borderDash: [5, 4],
    pointRadius: 0, pointHoverRadius: 0, tension: 0.4, fill: false, spanGaps: true,
  };
}
function maLegend(id, color, label) {
  $(id).innerHTML =
    `<span><i style="background:${color}"></i>${label}</span>` +
    `<span><i style="background:#334155"></i>ממוצע נע 7 ימים</span>`;
}
function bar(rows, key, color) {
  return { data: points(rows, key), backgroundColor: color, borderRadius: 5, borderSkipped: false, maxBarThickness: 24 };
}
function line(rows, key, color) {
  return {
    data: points(rows, key), borderColor: color, backgroundColor: color + '22',
    borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: color,
    tension: 0.38, fill: true, spanGaps: true,
  };
}

function renderCharts() {
  const rows = visibleRows();
  const labels = rows.map(r => shortDate(r.date));

  /* לב */
  maLegend('legend-rhr', C.red, 'דופק מנוחה יומי');
  make('chart-rhr', { type: 'line', data: { labels, datasets: [line(rows, 'rhr', C.red), maLine(rows, 'rhr')] },
    options: opts({ grace: '20%' }, i => `דופק מנוחה: ${fmt(i.raw.y)} bpm`) });

  maLegend('legend-hrv', C.green, 'HRV יומי');
  make('chart-hrv', { type: 'line', data: { labels, datasets: [line(rows, 'hrv', C.green), maLine(rows, 'hrv')] },
    options: opts({ grace: '20%' }, i => `HRV: ${fmt(i.raw.y)} ms`) });

  $('legend-stress').innerHTML =
    `<span><i style="background:${C.orange}"></i>סטרס ממוצע</span>` +
    `<span><i style="background:${C.blue}80"></i>טווח Body Battery</span>`;
  make('chart-stress', { type: 'line', data: { labels, datasets: [
    { label: 'Body Battery — שיא', data: points(rows, 'body_battery_high'), borderColor: C.blue + '99',
      backgroundColor: C.blue + '22', borderWidth: 1.5, pointRadius: 0, tension: 0.38, fill: '+1', spanGaps: true },
    { label: 'Body Battery — שפל', data: points(rows, 'body_battery_low'), borderColor: C.blue + '99',
      borderWidth: 1.5, pointRadius: 0, tension: 0.38, fill: false, spanGaps: true },
    { label: 'סטרס ממוצע', data: points(rows, 'stress_avg'), borderColor: C.orange,
      borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: C.orange, tension: 0.38, fill: false, spanGaps: true },
  ] }, options: opts({ min: 0, max: 100 }, i => `${i.dataset.label}: ${fmt(i.raw.y)}`) });

  /* שינה */
  maLegend('legend-sleep', C.blue, 'שעות שינה');
  make('chart-sleep', { type: 'bar', data: { labels, datasets: [
    bar(rows, 'sleep_hours', C.blue), goalLine(rows, SLEEP_GOAL_HOURS), maLine(rows, 'sleep_hours'),
  ] }, options: opts({ beginAtZero: true, suggestedMax: 10 }, i => `שינה: ${fmt(i.raw.y, 1)} שעות`) });

  const stages = [
    { key: 'deep_min', label: 'עמוקה', color: C.blue },
    { key: 'light_min', label: 'קלה', color: C.teal },
    { key: 'rem_min', label: 'REM', color: C.violet },
  ];
  $('legend-stages').innerHTML = stages.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  make('chart-stages', { type: 'bar', data: { labels, datasets: stages.map((s, idx) => ({
    label: s.label, data: points(rows, s.key), backgroundColor: s.color, stack: 'sleep',
    borderRadius: idx === stages.length - 1 ? 5 : 0, borderSkipped: false,
    borderWidth: { top: 2, bottom: 0, left: 0, right: 0 }, borderColor: C.surface, maxBarThickness: 24,
  })) }, options: opts({ beginAtZero: true, ticks: { callback: v => minToHm(v) } },
    i => `${i.dataset.label}: ${minToHm(i.raw.y)} שעות`, true) });

  /* צעדים */
  maLegend('legend-steps', C.violet, 'צעדים יומי');
  make('chart-steps', { type: 'bar', data: { labels, datasets: [
    bar(rows, 'steps', C.violet), goalLine(rows, STEPS_GOAL), maLine(rows, 'steps'),
  ] }, options: opts({ beginAtZero: true }, i => `צעדים: ${fmt(i.raw.y)}`) });

  make('chart-activity', { type: 'bar', data: { labels, datasets: [bar(rows, 'calories', C.orange)] },
    options: opts({ beginAtZero: false, grace: '10%' }, i => `${fmt(i.raw.y)} kcal`) });
}

/* =========================================================================
 * תובנות מקצועיות לכל עמוד
 * ========================================================================= */
const TREND_WORD = { rise: 'עלייה', fall: 'ירידה', flat: 'יציבות' };

function insightCard(key) {
  const def = METRICS[key];
  const t = trendOf(key);
  let chip = '<span class="trend-chip flat">אין נתונים</span>';
  let trendText = 'אין מספיק נתונים בתקופה שנבחרה כדי לזהות מגמה.';
  let affect = '';

  if (t.current !== null && t.hasPrev) {
    const cls = t.dir === 'flat' ? 'flat' : t.good ? 'good' : 'bad';
    const arrow = t.dir === 'rise' ? '▲' : t.dir === 'fall' ? '▼' : '●';
    const pct = t.dir === 'flat' ? '' : ` ${fmt(Math.abs(t.pct), 0)}%`;
    chip = `<span class="trend-chip ${cls}">${arrow}${pct}</span>`;
    if (t.dir === 'flat') {
      trendText = `הערך יציב סביב ${fmt(t.current, def.decimals)}${def.unit ? ' ' + def.unit : ''} — עקביות היא דבר טוב.`;
    } else {
      trendText = `${TREND_WORD[t.dir]} מ-${fmt(t.before, def.decimals)} ל-${fmt(t.current, def.decimals)}${def.unit ? ' ' + def.unit : ''} לעומת התקופה הקודמת.`;
      affect = `<p>💡 ${def[t.dir]}</p>`;
    }
  } else if (t.current !== null) {
    chip = `<span class="trend-chip flat">ממוצע ${fmt(t.current, def.decimals)}</span>`;
    trendText = `הממוצע בתקופה הוא ${fmt(t.current, def.decimals)}${def.unit ? ' ' + def.unit : ''}. בחר טווח ארוך יותר לראות מגמה.`;
  }

  return `
    <article class="insight">
      <h3><span class="dot" style="background:${def.color}"></span>${def.label}${chip}</h3>
      <p class="accent">${trendText}</p>
      <p>${def.what}</p>
      ${affect}
    </article>`;
}
function renderInsights(id, keys) { $(id).innerHTML = keys.map(insightCard).join(''); }

/* =========================================================================
 * מדד מוכנות + מד טבעת (עמוד הבית)
 * ========================================================================= */
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function readiness() {
  const rows = visibleRows();
  const recent = rows.slice(-3);
  const parts = [];
  const bits = [];

  const s = avg(recent, 'sleep_score');
  if (s !== null) { parts.push({ w: 0.4, v: s }); bits.push(`שינה ${fmt(s)}`); }

  const st = avg(recent, 'stress_avg');
  if (st !== null) { parts.push({ w: 0.3, v: 100 - st }); bits.push(`מתח ${fmt(st)}`); }

  const hr = avg(recent, 'hrv'), hb = avg(rows, 'hrv');
  if (hr !== null && hb) { parts.push({ w: 0.2, v: clamp(50 + ((hr - hb) / hb) * 250, 0, 100) }); bits.push(`HRV ${fmt(hr)}`); }

  const rr = avg(recent, 'rhr'), rb = avg(rows, 'rhr');
  if (rr !== null && rb) { parts.push({ w: 0.1, v: clamp(50 + ((rb - rr) / rb) * 400, 0, 100) }); bits.push(`RHR ${fmt(rr)}`); }

  if (!parts.length) return null;
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const score = Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / wsum);
  return { score, sub: bits.join(' · ') };
}
function verdict(score) {
  if (score >= 80) return 'מצוין — הגוף מאושש';
  if (score >= 65) return 'טוב — מוכנות סבירה';
  if (score >= 50) return 'בינוני — שווה לשים לב';
  return 'נמוך — עדיף יום התאוששות';
}
function gaugeSvg(score) {
  const r = 46, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `<svg width="104" height="104" viewBox="0 0 104 104">
    <circle cx="52" cy="52" r="${r}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="9"/>
    <circle cx="52" cy="52" r="${r}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
  </svg>`;
}
function renderReadiness() {
  const el = $('home-readiness');
  const r = readiness();
  if (!r) {
    el.innerHTML = `<div class="readiness-body"><div class="readiness-verdict">בהמתנה לנתונים</div>
      <div class="readiness-sub">הסנכרון היומי ימלא את מדד המוכנות.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="gauge">${gaugeSvg(r.score)}<div class="gauge-num"><b>${r.score}</b><span>מוכנות</span></div></div>
    <div class="readiness-body">
      <div class="readiness-verdict">${verdict(r.score)}</div>
      <div class="readiness-sub">${r.sub} · 3 הימים האחרונים</div>
    </div>`;
}

/* =========================================================================
 * תובנת התקופה (highlight) — מבוססת הצלבת נתונים
 * ========================================================================= */
const CORR = [
  { a: 'sleep_hours', b: 'rhr',
    neg: 'בלילות שבהם ישנת יותר, דופק המנוחה נטה להיות נמוך יותר — השינה תומכת בהתאוששות הלב.',
    pos: 'יותר שעות שינה לוו בדופק מנוחה גבוה יותר — קשר לא שגרתי, שווה מעקב.' },
  { a: 'sleep_hours', b: 'hrv',
    pos: 'יותר שעות שינה הלכו יד ביד עם HRV גבוה יותר — שינה ארוכה משפרת את ההתאוששות.',
    neg: 'יותר שעות שינה לוו ב-HRV נמוך יותר — קשר לא צפוי.' },
  { a: 'stress_avg', b: 'sleep_score',
    neg: 'בימים עם מתח גבוה, ציון השינה שלאחריהם נטה להיות נמוך יותר — מתח פוגע באיכות השינה.',
    pos: 'מתח גבוה וציון שינה גבוה הופיעו יחד — קשר לא שגרתי.' },
  { a: 'steps', b: 'sleep_score',
    pos: 'בימים שבהם צעדת יותר, ציון השינה נטה להיות גבוה יותר — פעילות תומכת בשינה.',
    neg: 'יותר צעדים לוו בציון שינה נמוך יותר — ייתכן שפעילות מאוחרת מדי משפיעה.' },
];
function renderHighlight() {
  const rows = visibleRows();
  let best = null;
  for (const p of CORR) {
    const { r } = pearson(rows, p.a, p.b);
    if (r !== null && Math.abs(r) >= 0.35 && (!best || Math.abs(r) > Math.abs(best.r))) best = { ...p, r };
  }
  let text;
  if (best) {
    text = best.r < 0 ? best.neg : best.pos;
  } else {
    // גיבוי: המדד עם השינוי המשמעותי ביותר
    let top = null;
    for (const key of ['sleep_hours', 'rhr', 'hrv', 'stress_avg', 'steps']) {
      const t = trendOf(key);
      if (t.current !== null && t.hasPrev && t.dir !== 'flat' && (!top || Math.abs(t.pct) > Math.abs(top.pct))) top = { key, ...t };
    }
    if (top) {
      const def = METRICS[top.key];
      text = `${def.label} רשם ${TREND_WORD[top.dir]} של ${fmt(Math.abs(top.pct), 0)}% לעומת התקופה הקודמת — ${top.good ? 'כיוון חיובי' : 'כדאי לשים לב'}.`;
    } else {
      text = 'ככל שיצטברו יותר ימי מדידה, כאן יופיעו תובנות אישיות מהצלבת הנתונים שלך.';
    }
  }
  $('home-highlight').innerHTML = `<span class="hl-ic">💡</span><p><b>תובנת התקופה:</b> ${text}</p>`;
}

/* =========================================================================
 * קיצורי דרך (עמוד הבית)
 * ========================================================================= */
function renderShortcuts() {
  const rows = visibleRows();
  const items = [
    { i: 1, t: 'בריאות הלב', v: `RHR ${fmt(avg(rows, 'rhr'))} · HRV ${fmt(avg(rows, 'hrv'))}`, emoji: '❤️', color: C.red },
    { i: 2, t: 'שינה', v: `${fmt(avg(rows, 'sleep_hours'), 1)} שעות · ציון ${fmt(avg(rows, 'sleep_score'))}`, emoji: '💤', color: C.blue },
    { i: 3, t: 'צעדים ופעילות', v: `${fmt(avg(rows, 'steps'))} צעדים בממוצע`, emoji: '👣', color: C.violet },
  ];
  $('home-shortcuts').innerHTML = items.map(s => `
    <button class="shortcut" data-goto="${s.i}">
      <span class="sc-ic" style="background:${s.color}22">${s.emoji}</span>
      <span><span class="sc-t">${s.t}</span><br><span class="sc-v">${s.v}</span></span>
      <span class="sc-arrow">‹</span>
    </button>`).join('');
}

/* =========================================================================
 * כרטיס "היום" + המלצה יומית (עמוד הבית)
 * ========================================================================= */
function recommendation(last) {
  const r = readiness();
  if (!r) return null;
  let rec;
  if (r.score >= 80) rec = 'הגוף מאושש — יום מצוין לאימון מאתגר או פעילות אינטנסיבית.';
  else if (r.score >= 65) rec = 'מוכנות טובה — אפשר להתאמן כרגיל, עם קשב לסימני עייפות.';
  else if (r.score >= 50) rec = 'מוכנות בינונית — עדיף אימון מתון, שתייה מרובה ושינה מוקדמת הלילה.';
  else rec = 'מוכנות נמוכה — תן לגוף להתאושש: יום קל יותר ושינה מוקדמת.';
  if (last?.sleep_hours != null && last.sleep_hours < 6.5) rec += ' ישנת פחות מ-6.5 שעות אתמול — כדאי להקדים שינה.';
  else if (last?.stress_avg != null && last.stress_avg >= 60) rec += ' רמת המתח אתמול הייתה גבוהה — שלב הפוגות נשימה היום.';
  return rec;
}
function tchip(emoji, label, value) {
  return `<div class="tchip"><span>${emoji}</span><b>${value}</b><small>${label}</small></div>`;
}
function renderToday() {
  const el = $('today-card');
  const last = state.data[state.data.length - 1];
  if (!last) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const chips = [
    last.sleep_hours != null ? tchip('💤', 'שינה', `${fmt(last.sleep_hours, 1)}ש׳`) : '',
    last.rhr != null ? tchip('❤️', 'RHR', fmt(last.rhr)) : '',
    last.hrv != null ? tchip('💚', 'HRV', fmt(last.hrv)) : '',
    last.stress_avg != null ? tchip('🔥', 'סטרס', fmt(last.stress_avg)) : '',
    last.steps != null ? tchip('👣', 'צעדים', fmt(last.steps)) : '',
  ].join('');
  const rec = recommendation(last);
  el.innerHTML = `
    <div class="today-top">
      <div class="today-date">${longDate(last.date)}</div>
      <div class="today-tag">מבט על היום</div>
    </div>
    <div class="today-chips">${chips}</div>
    ${rec ? `<div class="today-rec"><span>💡</span><p>${rec}</p></div>` : ''}`;
}

/* =========================================================================
 * שיאים ורצפים
 * ========================================================================= */
function extremeDay(rows, key, dir) {
  let best = null;
  for (const r of rows) {
    const v = r[key];
    if (v == null || Number.isNaN(v)) continue;
    if (!best || (dir === 'max' ? v > best.v : v < best.v)) best = { v, date: r.date };
  }
  return best;
}
function sumOf(rows, key) { return rows.reduce((a, r) => a + (r[key] || 0), 0); }
function trailingStreak(rows, pred) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) { if (pred(rows[i]) === true) n++; else break; }
  return n;
}
function recItem(emoji, label, val, sub) {
  return `<li><span class="rec-ic">${emoji}</span><span class="rec-label">${label}</span>
    <span class="rec-val">${val}${sub ? ` <small>${sub}</small>` : ''}</span></li>`;
}
function renderRecords(id, title, items) {
  const rows = items.filter(Boolean);
  $(id).innerHTML = rows.length
    ? `<article class="card records-card"><h2 class="rec-title">${title}</h2><ul class="rec-list">${rows.join('')}</ul></article>`
    : '';
}
function heartRecords() {
  const rows = visibleRows();
  const lowRhr = extremeDay(rows, 'rhr', 'min');
  const hiHrv = extremeDay(rows, 'hrv', 'max');
  const calm = extremeDay(rows, 'stress_avg', 'min');
  return [
    lowRhr && recItem('❤️', 'הדופק הנמוך ביותר', `${fmt(lowRhr.v)} bpm`, `ב-${shortDate(lowRhr.date)}`),
    hiHrv && recItem('💚', 'ה-HRV הגבוה ביותר', `${fmt(hiHrv.v)} ms`, `ב-${shortDate(hiHrv.date)}`),
    calm && recItem('🧘', 'היום הרגוע ביותר', `סטרס ${fmt(calm.v)}`, `ב-${shortDate(calm.date)}`),
  ];
}
function sleepRecords() {
  const rows = visibleRows();
  const best = extremeDay(rows, 'sleep_score', 'max');
  const longest = extremeDay(rows, 'sleep_hours', 'max');
  const streak = trailingStreak(rows, r => r.sleep_score != null && r.sleep_score >= 80);
  return [
    best && recItem('⭐', 'הלילה הטוב ביותר', `ציון ${fmt(best.v)}`, `ב-${shortDate(best.date)}`),
    longest && recItem('🛏️', 'השינה הארוכה ביותר', `${fmt(longest.v, 1)} שעות`, `ב-${shortDate(longest.date)}`),
    streak >= 2 && recItem('🔥', 'רצף לילות איכותיים', `${streak} לילות`, 'ציון 80+ ברצף'),
  ];
}
function stepsRecords() {
  const rows = visibleRows();
  const best = extremeDay(rows, 'steps', 'max');
  const streak = trailingStreak(rows, r => r.steps != null && r.steps >= STEPS_GOAL);
  const total = sumOf(rows, 'steps');
  return [
    best && recItem('👣', 'היום הפעיל ביותר', `${fmt(best.v)} צעדים`, `ב-${shortDate(best.date)}`),
    streak >= 2 && recItem('🔥', 'רצף ימים ביעד', `${streak} ימים`, '10,000+ ברצף'),
    total > 0 && recItem('📊', 'סה״כ צעדים בתקופה', fmt(total)),
  ];
}

/* =========================================================================
 * רינדור כולל
 * ========================================================================= */
function renderAll() {
  document.querySelectorAll('.seg-btn').forEach(b => {
    const v = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
    b.classList.toggle('active', v === state.range);
  });
  renderToday();
  renderReadiness();
  renderKpis('home-kpis', KPIS.home);
  renderHighlight();
  renderShortcuts();
  renderKpis('heart-kpis', KPIS.heart);
  renderKpis('sleep-kpis', KPIS.sleep);
  renderKpis('steps-kpis', KPIS.steps);
  renderCharts();
  renderRecords('heart-records', '🏆 שיאים', heartRecords());
  renderRecords('sleep-records', '🏆 שיאים ורצפים', sleepRecords());
  renderRecords('steps-records', '🏆 שיאים ורצפים', stepsRecords());
  renderInsights('heart-insights', ['rhr', 'hrv', 'stress_avg']);
  renderInsights('sleep-insights', ['sleep_hours', 'sleep_score']);
  renderInsights('steps-insights', ['steps']);
}

/* =========================================================================
 * ניווט: החלקה + סנכרון עם הטאבים
 * ========================================================================= */
const pager = $('pager');
const tabs = [...document.querySelectorAll('.tab')];
const pages = [...document.querySelectorAll('.page')];

function setActive(idx) {
  tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
  $('page-title').textContent = pages[idx].dataset.title;
}
function goTo(idx) { pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' }); }

tabs.forEach(t => t.addEventListener('click', () => goTo(Number(t.dataset.index))));
$('home-shortcuts').addEventListener('click', e => {
  const b = e.target.closest('[data-goto]');
  if (b) goTo(Number(b.dataset.goto));
});

let scrollRaf = null;
pager.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = null;
    const idx = Math.round(pager.scrollLeft / pager.clientWidth);
    setActive(idx);
  });
}, { passive: true });

/* בורר טווח */
$('range-filter').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  state.range = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
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
  $('today').textContent = last ? `עודכן ${shortDate(last.date)}` : '';

  setActive(0);
  renderAll();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
