'use strict';

/* =========================================================================
 * app.js — אפליקציית עמוד יחיד: בית · שינה · לב והתאוששות · פעילות.
 * מסתמך על common.js (C, loadHealthData, avg, vals, fmt, shortDate,
 * longDate, minToHm, pearson, $).
 * ========================================================================= */

const state = { data: [], isDemo: false, range: 30, page: 0 };
const charts = {};
/* Chart.defaults מוגדרים ב-common.js (מקור יחיד) */

/* קו סמן אנכי (crosshair) בגרירה על הגרף — תחושת "scrubbing" של Apple Health */
if (typeof Chart !== 'undefined') {
  Chart.register({
    id: 'crosshair',
    afterDraw(chart) {
      const act = chart.tooltip?.getActiveElements?.() || [];
      if (!act.length) return;
      const x = act[0].element.x, { top, bottom } = chart.chartArea, c = chart.ctx;
      c.save();
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom);
      c.lineWidth = 1; c.setLineDash([3, 3]);
      c.strokeStyle = 'rgba(240,244,250,.28)';
      c.stroke(); c.restore();
    },
  });
}

/* העדפת תנועה מופחתת — מדלגים על אנימציות (טבעת, ספירה עולה) */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* דגל לדיכוי אנימציית כניסה של הגרפים בעת רינדור חוזר (שינוי טווח) */
let chartAnim = true;

/* רטט קליל למשוב מגע (במכשירים שתומכים) */
function haptic(ms = 8) { try { navigator.vibrate?.(ms); } catch {} }

/* =========================================================================
 * סט אייקוני קו אחיד — מחליף אימוג'י לאורך האפליקציה (מראה בוגר ועקבי)
 * ========================================================================= */
const ICONS = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  heart: '<path d="M3 12h4l2-5 3 9 2-4h7"/>',
  hrv: '<path d="M2 12h3l2-6 3 12 2.5-8 2 5 2-3h3.5"/>',
  walk: '<path d="M13 4a2 2 0 1 0 0 .01M8.5 21l1.2-6.2 2.3 1.9V21M6 10l3.7-1 2 3.2 3.3.8"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  flame: '<path d="M12 3c1 3-2 4-2 7a2 2 0 0 0 4 0c2 2 3 3.5 3 6a5 5 0 0 1-10 0c0-4 3-6 5-13z"/>',
  scale: '<path d="M12 3v3M5 6h14l-2.5 7a4 4 0 0 1-9 0zM8 21h8"/>',
  lungs: '<path d="M12 4v9M8 8c-3 1-4 4-4 8a2 2 0 0 0 4 0zM16 8c3 1 4 4 4 8a2 2 0 0 1-4 0z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11"/>',
  run: '<path d="M14 4a2 2 0 1 0 0 .01M6 21l3-5-2-3 1-4 4 2 2 3M9 13l-2 2"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-11h-6z"/>',
  yoga: '<path d="M12 5a2 2 0 1 0 0-.01M12 8v5M6 21l6-8 6 8M6 12l6 1 6-1"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 15h6M8 21h8M12 15v6"/>',
  chart: '<path d="M3 15l5-6 4 4 5-7 4 5"/><path d="M3 20h18"/>',
  alert: '<path d="M12 3 2 20h20zM12 9v5M12 17h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/>',
  stetho: '<path d="M5 3v5a4 4 0 0 0 8 0V3M9 16v-2M9 16a5 5 0 0 0 10 0v-2M19 12a2 2 0 1 0 0-.01"/>',
  gauge: '<path d="M12 13l4-3M4 18a9 9 0 1 1 16 0z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  vo2: '<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
  drop: '<path d="M12 3s6 6 6 10a6 6 0 0 1-12 0c0-4 6-10 6-10z"/>',
  up: '<path d="M12 5v14M6 11l6-6 6 6"/>',
  down: '<path d="M12 19V5M6 13l6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chartbars: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  floors: '<path d="M3 20h4v-4h4v-4h4v-4h4V4"/>',
};
function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* =========================================================================
 * פרופיל אישי — מקומי בלבד (localStorage)
 * ========================================================================= */
const PROFILE_KEY = 'health_profile_v1';
let profile = {};
function loadProfile() {
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { profile = {}; }
}
function saveProfileObj(p) { profile = p; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {} }
function goalSleep() { return profile.sleepGoal ? Number(profile.sleepGoal) : SLEEP_GOAL_HOURS; }
function goalSteps() { return profile.stepsGoal ? Number(profile.stepsGoal) : STEPS_GOAL; }
function goalStrength() { return profile.strengthGoal ? Number(profile.strengthGoal) : 3; }
function bmi() {
  const w = latestWeight()?.kg ?? profile.weightKg;
  if (!profile.heightCm || !w) return null;
  const h = profile.heightCm / 100;
  return w / (h * h);
}
function bmiCat(b) { return b < 18.5 ? 'תת-משקל' : b < 25 ? 'תקין' : b < 30 ? 'עודף' : 'השמנה'; }
/* דופק מקסימלי — עדיפות לערך אמיתי שהמשתמש הזין, אחרת הערכה 220 פחות גיל */
function maxHR() {
  if (profile.maxHrOverride) return Number(profile.maxHrOverride);
  return profile.age ? 220 - Number(profile.age) : null;
}
/* האם דופק המקס' הוא ערך אמיתי או הערכת גיל */
function maxHrIsReal() { return !!profile.maxHrOverride; }

/* =========================================================================
 * מעקב משקל — יומן מקומי בלבד (localStorage), הזנה ידנית שבועית
 * ========================================================================= */
const WEIGHT_KEY = 'weight_log_v1';
let weights = [];
function loadWeights() {
  try { weights = JSON.parse(localStorage.getItem(WEIGHT_KEY)) || []; } catch { weights = []; }
  if (!Array.isArray(weights)) weights = [];
  weights.sort((a, b) => a.date.localeCompare(b.date));
}
function saveWeights() { try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(weights)); } catch {} }
function addWeight(date, kg) {
  const existing = weights.find(w => w.date === date);
  if (existing) existing.kg = kg; else weights.push({ date, kg });
  weights.sort((a, b) => a.date.localeCompare(b.date));
  saveWeights();
  // המשקל בפרופיל מתעדכן לשקילה האחרונה כדי ש-BMI והטופס יישארו מסונכרנים
  const last = latestWeight();
  if (last) saveProfileObj({ ...profile, weightKg: last.kg });
}
function latestWeight() { return weights.length ? weights[weights.length - 1] : null; }
/* השקילה הקרובה ביותר ל-days ימים אחורה (להשוואת מגמה) */
function weightAt(days) {
  if (!weights.length) return null;
  const target = new Date(latestWeight().date);
  target.setDate(target.getDate() - days);
  const targetISO = target.toISOString().slice(0, 10);
  let best = null;
  for (const w of weights) {
    if (w.date === latestWeight().date) continue;
    if (!best || Math.abs(new Date(w.date) - target) < Math.abs(new Date(best.date) - target)) best = w;
    if (w.date <= targetISO) best = w;
  }
  return best;
}

/* =========================================================================
 * מעקב אימוני כוח — זיהוי אוטומטי מהשעון + סימון ידני (localStorage)
 * ========================================================================= */
const STRENGTH_TYPES = new Set(['strength_training', 'hiit']); // נקודת הרחבה
const STRENGTH_KEY = 'strength_checks_v1';
let strengthChecks = {};
function loadStrength() {
  try { strengthChecks = JSON.parse(localStorage.getItem(STRENGTH_KEY)) || {}; } catch { strengthChecks = {}; }
  if (typeof strengthChecks !== 'object' || !strengthChecks) strengthChecks = {};
}
function saveStrength() { try { localStorage.setItem(STRENGTH_KEY, JSON.stringify(strengthChecks)); } catch {} }
/* התאריכים שבהם השעון תיעד אימון כוח */
function autoStrengthDates() {
  const set = new Set();
  for (const r of state.data)
    for (const w of (r.workouts || []))
      if (STRENGTH_TYPES.has(w.type_key)) set.add(r.date);
  return set;
}
function strengthDone(iso, auto) { return auto.has(iso) || strengthChecks[iso] === true; }
/* תחילת השבוע (ראשון) עבור תאריך נתון */
function weekStartISO(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}


/* =========================================================================
 * עזרי נתונים
 * ========================================================================= */
function visibleRows() { return state.range === 'all' ? state.data : state.data.slice(-state.range); }

/* מדדים מצטברים (צעדים, קלוריות...) חלקיים עד סוף היום — אין לשפוט אותם באמצע היום */
const CUMULATIVE = new Set(['steps', 'calories', 'floors', 'intensity_min']);
const todayISO = () => new Date().toISOString().slice(0, 10);

function latest(key, within = 3) {
  let end = state.data.length - 1;
  if (CUMULATIVE.has(key) && state.data[end]?.date === todayISO()) end--;  // דילוג על היום החלקי
  for (let i = end; i >= Math.max(0, end - within + 1); i--) {
    const v = state.data[i]?.[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return null;
}
const lastRow = () => state.data[state.data.length - 1] || {};
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

/* =========================================================================
 * מנוע בסיס אישי וחריגות
 * הבסיס = ממוצע וסטיית תקן על 30 הימים האחרונים. הסטטוס נגזר מ-z-score,
 * כלומר "מה נורמלי *עבורך*" ולא מטבלת ייחוס כללית.
 * ========================================================================= */
const METRICS = {
  sleep_hours:  { label: 'שעות שינה', unit: 'שעות', dec: 1, goodUp: true,  color: C.blue,   emoji: '🌙' },
  sleep_score:  { label: 'ציון שינה', unit: '/100', dec: 0, goodUp: true,  color: C.blue,   emoji: '⭐' },
  rhr:          { label: 'דופק מנוחה', unit: 'bpm', dec: 0, goodUp: false, color: C.red,    emoji: '❤️' },
  hrv:          { label: 'HRV',        unit: 'ms',  dec: 0, goodUp: true,  color: C.green,  emoji: '💚' },
  stress_avg:   { label: 'רמת מתח',    unit: '/100', dec: 0, goodUp: false, color: C.orange, emoji: '🔥' },
  steps:        { label: 'צעדים',      unit: '',    dec: 0, goodUp: true,  color: C.violet, emoji: '👣' },
  spo2_avg:     { label: 'חמצן בדם',   unit: '%',   dec: 0, goodUp: true,  color: C.teal,   emoji: '🫁' },
  respiration_avg: { label: 'קצב נשימה', unit: 'נשימות/דק׳', dec: 1, goodUp: false, color: C.teal, emoji: '💨' },
};

/* ממוצע וסטיית תקן (אוכלוסייה) על ערכי מדד — משותף לבסיס האישי ולעקביות */
function stdev(rows, key) {
  const v = vals(rows, key);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length, min: Math.min(...v), max: Math.max(...v) };
}

function baselineOf(key) {
  let rows = state.data.slice(-30);
  // היום החלקי לא נכנס לבסיס של מדד מצטבר
  if (CUMULATIVE.has(key) && rows[rows.length - 1]?.date === todayISO()) rows = rows.slice(0, -1);
  const b = stdev(rows, key);
  return b && b.n >= 5 ? b : null;
}

/* מצב מדד מול הבסיס האישי: ok | normal | watch | alert */
function statusOf(key, value = null) {
  const def = METRICS[key];
  const v = value ?? latest(key);
  if (v === null || !def) return null;

  // ל-HRV מעדיפים את הטווח המאוזן שגרמין מחשב עבורך
  if (key === 'hrv') {
    const lo = latest('hrv_base_low', 7), hi = latest('hrv_base_high', 7);
    if (lo !== null && hi !== null) {
      if (v < lo) return { key, value: v, level: v < lo * 0.9 ? 'alert' : 'watch', text: 'מתחת לטווח המאוזן שלך', base: { lo, hi } };
      if (v > hi) return { key, value: v, level: 'ok', text: 'מעל הטווח המאוזן שלך', base: { lo, hi } };
      return { key, value: v, level: 'ok', text: 'בטווח המאוזן שלך', base: { lo, hi } };
    }
  }

  const b = baselineOf(key);
  if (!b || b.sd === 0) return { key, value: v, level: 'normal', text: 'אין עדיין בסיס להשוואה' };
  const z = (v - b.mean) / b.sd;
  const good = def.goodUp ? z : -z;   // z בכיוון החיובי עבור המדד
  let level, text;
  if (good >= 1) { level = 'ok'; text = 'טוב מהרגיל שלך'; }
  else if (good > -1) { level = 'normal'; text = 'בטווח הרגיל שלך'; }
  else if (good > -2) { level = 'watch'; text = 'מתחת לרגיל שלך'; }
  else { level = 'alert'; text = 'חריג מהרגיל שלך'; }
  return { key, value: v, level, text, z, base: b };
}

const LEVEL_LABEL = { ok: 'טוב', normal: 'רגיל', watch: 'לשים לב', alert: 'חריג' };

/* ערך + יחידה בתוך משפט: בלי רווח לפני "/100" ובלי לחזור על מילה שכבר בתווית */
function valueText(key, v) {
  const d = METRICS[key];
  const n = fmt(v, d.dec);
  if (!d.unit) return n;
  if (d.unit.startsWith('/')) return n + d.unit;
  if (d.label.includes(d.unit)) return n;
  return `${n} ${d.unit}`;
}

/* רק מה שבאמת חורג — ממוין לפי חומרה */
function anomalies() {
  const out = [];
  for (const key of ['sleep_hours', 'sleep_score', 'rhr', 'hrv', 'stress_avg', 'steps', 'spo2_avg']) {
    const s = statusOf(key);
    if (s && (s.level === 'watch' || s.level === 'alert')) out.push(s);
  }
  return out.sort((a, b) => (a.level === 'alert' ? -1 : 1) - (b.level === 'alert' ? -1 : 1));
}


/* =========================================================================
 * מסך הבית — ציון מרכזי
 * ========================================================================= */
function heuristicReadiness() {
  const recent = state.data.slice(-3);
  const parts = [];
  const s = avg(recent, 'sleep_score'); if (s !== null) parts.push({ w: .4, v: s });
  const st = avg(recent, 'stress_avg'); if (st !== null) parts.push({ w: .3, v: 100 - st });
  const hr = avg(recent, 'hrv'), hb = avg(state.data.slice(-30), 'hrv');
  if (hr !== null && hb) parts.push({ w: .2, v: clamp(50 + ((hr - hb) / hb) * 250, 0, 100) });
  const rr = avg(recent, 'rhr'), rb = avg(state.data.slice(-30), 'rhr');
  if (rr !== null && rb) parts.push({ w: .1, v: clamp(50 + ((rb - rr) / rb) * 400, 0, 100) });
  if (!parts.length) return null;
  const w = parts.reduce((a, p) => a + p.w, 0);
  return Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) / w);
}

const READINESS_LEVEL = {
  READY: 'מוכן', LOW: 'נמוך', MODERATE: 'בינוני', HIGH: 'גבוה', PRIME: 'שיא',
};

/* המשוב המילולי הרשמי של גרמין (Training Readiness feedback) */
const READINESS_FEEDBACK = {
  READY_FOR_ACTION: 'מוכן לפעולה', GOOD_RECOVERY: 'התאוששות טובה',
  FIND_TIME_TO_RELAX: 'מצא זמן להירגע', FOCUS_ON_ENERGY_LEVELS: 'שים לב לרמות האנרגיה',
  EXCELLENT_RECOVERY: 'התאוששות מצוינת', WELL_RECOVERED: 'מאושש היטב',
  READY_FOR_THE_DAY: 'מוכן ליום', TAKE_ON_THE_DAY: 'קדימה, יום מוצלח',
  PRIMED_AND_READY: 'בכושר שיא ומוכן', READY_TO_GO: 'מוכן לצאת לדרך',
};

function verdictOf(score) {
  if (score >= 80) return 'מצוין — הגוף מאושש';
  if (score >= 65) return 'טוב — מוכנות סבירה';
  if (score >= 50) return 'בינוני — שווה לשים לב';
  return 'נמוך — עדיף יום התאוששות';
}

/* צבע הטבעת לפי הציון */
function ringColor(score) {
  if (score >= 80) return getComputedStyle(document.documentElement).getPropertyValue('--ok').trim() || '#34d399';
  if (score >= 50) return getComputedStyle(document.documentElement).getPropertyValue('--primary-500').trim() || '#6ba3ff';
  return getComputedStyle(document.documentElement).getPropertyValue('--watch').trim() || '#fbbf24';
}
function ringSvg(score) {
  const r = 46, c = 2 * Math.PI * r;
  const col = ringColor(score);
  // מתחילים ריק (offset=c) ומאפשרים ל-CSS להנפיש עד היעד — ה-JS יעדכן ב-rAF
  const target = c * (1 - clamp(score, 0, 100) / 100);
  const start = REDUCED ? target : c;
  return `<svg width="104" height="104" viewBox="0 0 104 104">
    <circle class="ring-track" cx="52" cy="52" r="${r}" fill="none" stroke-width="9"/>
    <circle class="ring-val" cx="52" cy="52" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${start.toFixed(1)}"
      data-target="${target.toFixed(1)}" style="filter:drop-shadow(0 0 7px ${col}88)"/></svg>`;
}
/* ספירה עולה על מספר (מדלג בהעדפת תנועה מופחתת) */
function countUp(el, target, ms = 600) {
  if (REDUCED) { el.textContent = target; return; }
  const start = performance.now();
  function step(now) {
    const t = clamp((now - start) / ms, 0, 1);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* זוג צבעי גרדיאנט לטבעת המוכנות לפי הציון (שומר על משמעות: ירוק/כחול/אדום) */
function readyGrad(score) {
  if (score >= 80) return ['#34d399', '#7ce7c0'];
  if (score >= 50) return ['#5b9dff', '#63e6b0'];
  return ['#fbbf24', '#fb7185'];
}
/* טבעת גדולה (מוכנות) — גרדיאנט זוהר + סימן יעד + קצוות מעוגלים */
function bigRingSvg(score, size = 176) {
  const sw = 13, r = size / 2 - sw / 2 - 2, c = 2 * Math.PI * r, cc = size / 2;
  const [c1, c2] = readyGrad(score);
  const target = c * (1 - clamp(score, 0, 100) / 100);
  const start = REDUCED ? target : c;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="rg-big" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <circle class="ring-track" cx="${cc}" cy="${cc}" r="${r}" fill="none" stroke-width="${sw}"/>
    <circle class="ring-val" cx="${cc}" cy="${cc}" r="${r}" fill="none" stroke="url(#rg-big)" stroke-width="${sw}" stroke-linecap="round"
      transform="rotate(-90 ${cc} ${cc})" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${start.toFixed(1)}"
      data-target="${target.toFixed(1)}" style="filter:drop-shadow(0 0 10px ${c1}88)"/>
    <circle cx="${cc}" cy="${cc - r}" r="3.2" fill="var(--ink)" opacity=".5"/></svg>`;
}

/* טבעת מדד קטנה. grad=[var1,var2] גרדיאנט; fillPct=null → טבעת מלאה (דופק/HRV);
 * anomalous → הדגשה אדומה מסביב; uid → מזהה ייחודי לגרדיאנט. */
function miniRingSvg(grad, fillPct, anomalous, uid, size = 78) {
  const sw = 6, r = size / 2 - sw / 2 - 1, c = 2 * Math.PI * r, cc = size / 2;
  const c1 = cssVar(grad[0], '#4f8ef7'), c2 = cssVar(grad[1], '#7db4ff');
  const gid = `mg-${uid}`;
  const defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
  const alertCol = cssVar('--alert', '#fb7185');
  const halo = anomalous
    ? `<circle cx="${cc}" cy="${cc}" r="${size / 2 - 1.5}" fill="none" stroke="${alertCol}" stroke-width="2.5"
        style="filter:drop-shadow(0 0 6px ${alertCol}aa)"/>` : '';
  const track = `<circle class="ring-track" cx="${cc}" cy="${cc}" r="${r}" fill="none" stroke-width="${sw}"/>`;
  let arc, tick = '';
  if (fillPct === null) {
    arc = `<circle cx="${cc}" cy="${cc}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${sw}"/>`;
  } else {
    const off = c * (1 - clamp(fillPct, 0, 100) / 100);
    const start = REDUCED ? off : c;
    arc = `<circle class="ring-val" cx="${cc}" cy="${cc}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${sw}"
      stroke-linecap="round" transform="rotate(-90 ${cc} ${cc})" stroke-dasharray="${c.toFixed(1)}"
      stroke-dashoffset="${start.toFixed(1)}" data-target="${off.toFixed(1)}"/>`;
    tick = `<circle cx="${cc}" cy="${cc - r}" r="1.9" fill="var(--ink)" opacity=".45"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${halo}${track}${arc}${tick}</svg>`;
}

/* מדדי הטבעות הקטנות סביב המוכנות */
const DASH_METRICS = [
  { key: 'sleep_hours', page: 1, label: 'שינה', ico: 'moon', grad: ['--ring-sleep-1', '--ring-sleep-2'], fill: true,
    goal: () => goalSleep(), disp: v => fmt(v, 1), sub: 'ש׳' },
  { key: 'steps', page: 3, label: 'צעדים', ico: 'walk', grad: ['--ring-steps-1', '--ring-steps-2'], fill: true,
    goal: () => goalSteps(), disp: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : fmt(v), sub: '' },
  { key: 'rhr', page: 2, label: 'דופק', ico: 'heart', grad: ['--ring-rhr-1', '--ring-rhr-2'], fill: false, disp: v => fmt(v), sub: 'bpm' },
  { key: 'hrv', page: 2, label: 'HRV', ico: 'hrv', grad: ['--ring-hrv-1', '--ring-hrv-2'], fill: false, disp: v => fmt(v), sub: 'ms' },
];
/* ברכה לפי שעת היום */
function greeting() { const h = new Date().getHours(); return h < 12 ? 'בוקר טוב' : h < 18 ? 'צהריים טובים' : 'ערב טוב'; }

/* פירוט שלבי השינה של הלילה האחרון + סיווג צבע לפי חלקם מסך השינה:
 * ירוק=תקין · צהוב=סביר · אדום=לא תקין. */
function sleepStages() {
  const deep = latest('deep_min', 5), light = latest('light_min', 5), rem = latest('rem_min', 5);
  if (deep == null && light == null && rem == null) return null;
  const total = (deep || 0) + (light || 0) + (rem || 0) || 1;
  const cls = (v, kind) => {
    if (v == null) return 'muted';
    const p = v / total * 100;
    if (kind === 'light') return (p >= 45 && p <= 65) ? 'ok' : (p >= 40 && p <= 72) ? 'watch' : 'alert';
    if (kind === 'deep') return p >= 15 ? 'ok' : p >= 10 ? 'watch' : 'alert';
    return p >= 18 ? 'ok' : p >= 13 ? 'watch' : 'alert'; // REM
  };
  return [
    { name: 'עמוקה', v: deep, cls: cls(deep, 'deep') },
    { name: 'קלה', v: light, cls: cls(light, 'light') },
    { name: 'REM', v: rem, cls: cls(rem, 'rem') },
  ];
}

function renderDashboard() {
  const el = $('dashboard');
  const official = latest('readiness_score', 2);
  const score = official ?? heuristicReadiness();

  // --- טבעות המדדים הקטנות ---
  const minis = DASH_METRICS.map((m, i) => {
    const s = statusOf(m.key);
    const v = s ? s.value : latest(m.key);
    const anomalous = s && (s.level === 'watch' || s.level === 'alert');
    const fillPct = (m.fill && v !== null) ? clamp(v / m.goal() * 100, 0, 100) : (m.fill ? 0 : null);
    const center = v === null ? '—' : m.disp(v);
    const ringInner = `${miniRingSvg(m.grad, fillPct, anomalous, i)}
      <span class="mini-txt"><b>${center}</b>${m.sub ? `<i>${m.sub}</i>` : ''}</span>`;
    const label = `<span class="mini-label">${icon(m.ico, 14)}${m.label}</span>`;

    // טבעת השינה מתהפכת בלחיצה ומציגה את פירוט שלבי השינה
    if (m.key === 'sleep_hours') {
      const stages = sleepStages();
      const back = stages
        ? `<span class="flip-back">${stages.map(st =>
            `<span class="stg"><i>${st.name}</i><b class="c-${st.cls}">${st.v == null ? '—' : minToHm(st.v)}</b></span>`).join('')}</span>`
        : `<span class="flip-back"><span class="stg-empty">אין נתוני שלבים</span></span>`;
      return `<button class="mini${anomalous ? ' alert' : ''}" data-flip aria-label="פירוט שינה">
        <span class="mini-ring flip3d"><span class="flip-inner">
          <span class="flip-front">${ringInner}</span>${back}</span></span>
        ${label}</button>`;
    }
    return `<button class="mini${anomalous ? ' alert' : ''}" data-goto="${m.page}">
      <span class="mini-ring">${ringInner}</span>${label}</button>`;
  }).join('');

  const last = lastRow();
  const dateLine = last.date ? `${greeting()} · ${longDate(last.date)}` : greeting();

  if (score === null) {
    el.innerHTML = `<div class="dash-center"><div class="dash-greet">${dateLine}</div>
      <div class="dash-verdict">בהמתנה לנתונים</div>
      <div class="dash-note">הסנכרון היומי ימלא את הציון.</div></div>
      <div class="sec-title" style="margin-top:18px">מדדים</div><div class="dash-rings">${minis}</div>`;
    animateRings(el);
    return;
  }

  // --- מרכז: טבעת המוכנות ---
  const level = latest('readiness_level', 2);
  const feedbackTok = latest('readiness_feedback', 2);
  const feedback = feedbackTok ? READINESS_FEEDBACK[feedbackTok] : null;
  const note = feedback
    || (official !== null && level ? `רמת מוכנות לפי גרמין: ${READINESS_LEVEL[level] || level}` : verdictOf(score));

  el.innerHTML = `
    <div class="dash-center">
      <div class="dash-greet">${dateLine}</div>
      <div class="dash-ring">${bigRingSvg(score)}
        <span class="dash-ring-txt"><b>0</b><span>מוכנות</span></span></div>
      <div class="dash-verdict">${verdictOf(score)}</div>
      <div class="dash-note">${note}</div>
    </div>
    <div class="sec-title" style="margin-top:18px">מדדים</div>
    <div class="dash-rings">${minis}</div>`;

  // ספירה עולה על ציון המוכנות
  const scoreEl = el.querySelector('.dash-ring-txt b');
  requestAnimationFrame(() => countUp(scoreEl, score));
  animateRings(el);
}

/* מפעיל את אנימציית המילוי של כל הטבעות (rAF → CSS transition) */
function animateRings(el) {
  requestAnimationFrame(() => {
    el.querySelectorAll('.ring-val[data-target]').forEach(c =>
      c.setAttribute('stroke-dashoffset', c.dataset.target));
  });
}

/* =========================================================================
 * חריגות
 * ========================================================================= */
function renderAnomalies() {
  const list = anomalies();
  const el = $('anomalies');
  if (!list.length) {
    el.innerHTML = `<div class="anom ok"><span class="anom-ic">${icon('check', 17)}</span>
      <span>כל המדדים <b>בטווח הרגיל שלך</b> בימים האחרונים.</span></div>`;
    return;
  }
  el.innerHTML = `<div class="anom-list">${list.map(s => {
    const d = METRICS[s.key];
    const base = s.base && s.base.mean !== undefined
      ? ` (הרגיל שלך: ${fmt(s.base.mean, d.dec)})` : '';
    return `<div class="anom ${s.level}"><span class="anom-ic">${icon(s.level === 'alert' ? 'alert' : 'eye', 17)}</span>
      <span><b>${d.label} ${valueText(s.key, s.value)}</b> — ${s.text}${base}.</span></div>`;
  }).join('')}</div>`;
}

/* =========================================================================
 * תובנה מהצלבת נתונים
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
  { a: 'rhr', b: 'stress_avg',
    pos: 'בימים עם דופק מנוחה גבוה יותר, רמת המתח נטתה להיות גבוהה יותר — שני סימנים לעומס על הגוף.',
    neg: 'דופק מנוחה גבוה ומתח נמוך הופיעו יחד — קשר לא שגרתי, שווה מעקב.' },
];

function bestCorrelation(rows) {
  let best = null;
  for (const p of CORR) {
    const { r, n } = pearson(rows, p.a, p.b);
    if (r !== null && Math.abs(r) >= 0.35 && (!best || Math.abs(r) > Math.abs(best.r))) best = { ...p, r, n };
  }
  return best;
}

/* זיהוי דפוסים רב-יומיים: רצף מתחת/מעל הבסיס, או מגמה מונוטונית */
const PATTERN_KEYS = ['sleep_hours', 'hrv', 'rhr', 'stress_avg', 'sleep_score'];
function detectPatterns() {
  const recent = state.data.slice(-14);
  let best = null; // {len, text}
  for (const key of PATTERN_KEYS) {
    const def = METRICS[key];
    const b = baselineOf(key);
    if (!b || b.sd === 0) continue;
    const series = recent.map(r => r[key]).filter(v => v != null && !Number.isNaN(v));
    if (series.length < 3) continue;

    // רצף ימים אחרונים באותו צד של הבסיס (מעבר לחצי סטיית תקן)
    let run = 0, side = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      const dev = (series[i] - b.mean) / b.sd;
      const s = dev > 0.5 ? 1 : dev < -0.5 ? -1 : 0;
      if (s === 0) break;
      if (side === 0) side = s;
      if (s === side) run++; else break;
    }
    if (run >= 3) {
      const bad = def.goodUp ? side < 0 : side > 0;
      const dir = side < 0 ? 'מתחת ל' : 'מעל ה';
      const suffix = bad ? ' — שווה תשומת לב.' : ' — מגמה חיובית!';
      const text = `${def.label} ${dir}בסיס האישי שלך <b>${run} ימים ברצף</b>${suffix}`;
      if (!best || run > best.len) best = { len: run, text };
    }
  }
  return best;
}

function renderHomeInsight() {
  const pattern = detectPatterns();
  let text;
  if (pattern) {
    text = pattern.text;
  } else {
    const best = bestCorrelation(state.data.slice(-30));
    text = best
      ? (best.r < 0 ? best.neg : best.pos)
      : 'ככל שיצטברו יותר ימי מדידה, כאן יופיעו תובנות אישיות מהצלבת הנתונים שלך.';
  }
  $('insight-home').innerHTML =
    `<div class="insight"><span class="i-ic">${icon('bulb', 19)}</span><p><b>תובנה:</b> ${text}</p></div>`;
}

/* =========================================================================
 * כותרת-על לעמודי הפירוט
 * ========================================================================= */
const HRV_STATUS = { BALANCED: 'מאוזן', UNBALANCED: 'לא מאוזן', LOW: 'נמוך', POOR: 'ירוד' };
function hrvExtra() {
  const st = latest('hrv_status', 7), wk = latest('hrv_weekly_avg', 7);
  const parts = [];
  if (st && HRV_STATUS[st]) parts.push(`<div class="sh-extra">מצב HRV: ${HRV_STATUS[st]}</div>`);
  if (wk !== null) parts.push(`<div class="sh-extra">ממוצע שבועי ${fmt(wk)} ms</div>`);
  // HRV יורד עם הגיל — ההשוואה הנכונה היא לבסיס האישי, לא לטבלה כללית
  parts.push(`<div class="sh-extra" style="color:var(--muted)">HRV יורד עם הגיל — הבסיס האישי שלך הוא ההשוואה הנכונה</div>`);
  return parts.join('');
}
/* קטגוריית כושר כללית למבוגרים לפי דופק מנוחה (לא ייעוץ רפואי) */
function rhrCategory(v) {
  if (v == null) return null;
  if (v < 60) return 'מעולה';
  if (v < 70) return 'טוב';
  if (v < 80) return 'ממוצע';
  return 'גבוה';
}
function statHero(elId, key, extra = '') {
  const def = METRICS[key];
  const s = statusOf(key);
  const b = s && s.base && s.base.mean !== undefined ? s.base : null;
  const el = $(elId);
  if (!s) {
    el.innerHTML = `<div class="sh-label">${def.label}</div><div class="sh-val">—</div>
      <div class="sh-base">אין עדיין מספיק נתונים</div>`;
    return;
  }
  // סרגל: הטווח הרגיל + הסימון של הערך הנוכחי בתוכו
  let bar = '';
  const lo = s.base?.lo ?? (b ? b.mean - b.sd : null);
  const hi = s.base?.hi ?? (b ? b.mean + b.sd : null);
  if (lo !== null && hi !== null) {
    const min = Math.min(lo, s.value) - (hi - lo) * .6;
    const max = Math.max(hi, s.value) + (hi - lo) * .6;
    const pct = x => clamp(((x - min) / (max - min)) * 100, 0, 100);
    bar = `<div class="sh-bar">
      <i class="band" style="inset-inline-start:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></i>
      <i class="mark" style="inset-inline-start:calc(${pct(s.value)}% - 2px)"></i></div>
      <div class="sh-base">הטווח הרגיל שלך: ${fmt(lo, def.dec)}–${fmt(hi, def.dec)} ${def.unit}</div>`;
  }
  el.innerHTML = `
    <div class="sh-top">
      <div>
        <div class="sh-label">${def.label} · אחרון</div>
        <div class="sh-val">${fmt(s.value, def.dec)}<small>${def.unit}</small></div>
      </div>
      <div class="sh-right"><span class="d-status s-${s.level}">${LEVEL_LABEL[s.level]}</span>
        <div class="sh-base">${s.text}</div>${extra}</div>
    </div>${bar}`;
}

/* =========================================================================
 * גרפים
 * ========================================================================= */
function TT(labelFn) {
  const cb = { title: i => longDate(i[0].raw.iso) };
  if (labelFn) cb.label = labelFn;
  return {
    rtl: true, textDirection: 'rtl', backgroundColor: '#1c2537', titleColor: C.ink,
    bodyColor: C.ink2, borderColor: 'rgba(148,163,184,.2)', borderWidth: 1, padding: 10,
    cornerRadius: 10, boxPadding: 4, titleFont: { weight: '700' },
    filter: i => !['ממוצע 7 ימים', 'יעד', 'טווח מאוזן'].includes(i.dataset.label),
    callbacks: cb,
  };
}
function opts(y = {}, labelFn, stacked) {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: chartAnim ? undefined : false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: TT(labelFn) },
    scales: {
      x: { stacked: !!stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: Object.assign({ stacked: !!stacked, grid: { color: C.grid }, border: { display: false } }, y),
    },
  };
}
function make(id, cfg) { charts[id]?.destroy(); charts[id] = new Chart($(id), cfg); }
const points = (rows, key) => rows.map(r => ({ x: shortDate(r.date), y: r[key] ?? null, iso: r.date }));
const constLine = (rows, v, label, color, dash = [6, 5]) => ({
  label, data: rows.map(r => ({ x: shortDate(r.date), y: v, iso: r.date })),
  type: 'line', borderColor: color, borderWidth: 1.5, borderDash: dash, pointRadius: 0, fill: false,
});
function bar(rows, key, color) {
  return { data: points(rows, key), backgroundColor: color, borderRadius: 5, borderSkipped: false, maxBarThickness: 22 };
}
/* מילוי גרדיאנט אנכי מתחת לקו (מהצבע לשקוף) — מראה עשיר יותר ממילוי אחיד */
function gradFill(color) {
  return ctx => {
    const area = ctx.chart.chartArea;
    if (!area) return color + '20';
    const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, color + '55');
    g.addColorStop(1, color + '00');
    return g;
  };
}
/* נקודת סיום מודגשת — רק הנקודה האחרונה גלויה */
const ptLast = ctx => ctx.dataIndex === ctx.dataset.data.length - 1 ? 3.5 : 0;
function line(rows, key, color, filled = true) {
  return {
    data: points(rows, key), borderColor: color,
    backgroundColor: filled ? gradFill(color) : 'transparent',
    borderWidth: 2.5, pointRadius: ptLast, pointHoverRadius: 5,
    pointBackgroundColor: ctx => ctx.dataIndex === ctx.dataset.data.length - 1 ? cssVar('--ink', '#fff') : color,
    pointBorderColor: color, pointBorderWidth: 1.5,
    tension: .38, fill: filled, spanGaps: true,
  };
}
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
    type: 'line', borderColor: C.ma, borderWidth: 2, borderDash: [5, 4],
    pointRadius: 0, pointHoverRadius: 0, tension: .4, fill: false, spanGaps: true,
  };
}
function legend(id, items) {
  $(id).innerHTML = items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
}

function renderCharts() {
  const rows = visibleRows();
  const labels = rows.map(r => shortDate(r.date));

  /* --- שינה --- */
  $('u-sleep').textContent = `יעד ${fmt(goalSleep(), Number.isInteger(goalSleep()) ? 0 : 1)} שעות`;
  legend('legend-sleep', [[C.blue, 'שעות שינה'], [C.ma, 'ממוצע נע 7 ימים']]);
  make('chart-sleep', {
    type: 'bar',
    data: { labels, datasets: [bar(rows, 'sleep_hours', C.blue), constLine(rows, goalSleep(), 'יעד', C.muted), maLine(rows, 'sleep_hours')] },
    options: opts({ beginAtZero: true, suggestedMax: 10 }, i => `שינה: ${fmt(i.raw.y, 1)} שעות`),
  });

  const stages = [['deep_min', 'עמוקה', C.blue], ['light_min', 'קלה', C.teal], ['rem_min', 'REM', C.violet]];
  legend('legend-stages', stages.map(s => [s[2], s[1]]));
  make('chart-stages', {
    type: 'bar',
    data: {
      labels, datasets: stages.map((s, i) => ({
        label: s[1], data: points(rows, s[0]), backgroundColor: s[2], stack: 'sleep',
        borderRadius: i === stages.length - 1 ? 5 : 0, borderSkipped: false,
        borderWidth: { top: 2, bottom: 0, left: 0, right: 0 }, borderColor: C.surface, maxBarThickness: 22,
      })),
    },
    options: opts({ beginAtZero: true, ticks: { callback: v => minToHm(v) } }, i => `${i.dataset.label}: ${minToHm(i.raw.y)} שעות`, true),
  });

  /* --- לב --- */
  const rhrCat = rhrCategory(latest('rhr'));
  $('u-rhr').textContent = rhrCat ? `bpm · ${rhrCat} (רמת כושר)` : 'bpm';
  legend('legend-rhr', [[C.red, 'דופק מנוחה'], [C.ma, 'ממוצע נע 7 ימים']]);
  make('chart-rhr', {
    type: 'line', data: { labels, datasets: [line(rows, 'rhr', C.red), maLine(rows, 'rhr')] },
    options: opts({ grace: '20%' }, i => `דופק מנוחה: ${fmt(i.raw.y)} bpm`),
  });

  // רצועת הטווח המאוזן של גרמין מאחורי גרף ה-HRV
  const bLo = latest('hrv_base_low', 7), bHi = latest('hrv_base_high', 7);
  const hasBand = bLo !== null && bHi !== null;
  const hrvSets = [];
  if (hasBand) {
    hrvSets.push(
      { label: 'טווח מאוזן', data: rows.map(r => ({ x: shortDate(r.date), y: bHi, iso: r.date })),
        type: 'line', borderColor: 'rgba(74,222,128,.30)', borderWidth: 1, borderDash: [4, 4],
        backgroundColor: 'rgba(74,222,128,.10)', pointRadius: 0, fill: '+1' },
      { label: 'טווח מאוזן', data: rows.map(r => ({ x: shortDate(r.date), y: bLo, iso: r.date })),
        type: 'line', borderColor: 'rgba(74,222,128,.30)', borderWidth: 1, borderDash: [4, 4],
        pointRadius: 0, fill: false },
    );
    $('u-hrv').textContent = `ms · טווח מאוזן ${bLo}–${bHi}`;
    legend('legend-hrv', [[C.green, 'HRV לילי'], ['rgba(74,222,128,.4)', 'הטווח המאוזן שלך'], [C.ma, 'ממוצע נע']]);
  } else {
    $('u-hrv').textContent = 'ms · ממוצע לילי';
    legend('legend-hrv', [[C.green, 'HRV לילי'], [C.ma, 'ממוצע נע 7 ימים']]);
  }
  // כשמוצגת רצועת הטווח המאוזן, הקו עצמו ללא מילוי — אחרת שני האזורים מתמזגים
  hrvSets.push(line(rows, 'hrv', C.green, !hasBand), maLine(rows, 'hrv'));
  make('chart-hrv', { type: 'line', data: { labels, datasets: hrvSets }, options: opts({ grace: '20%' }, i => `HRV: ${fmt(i.raw.y)} ms`) });

  legend('legend-stress', [[C.orange, 'מתח ממוצע'], [C.ma, 'ממוצע נע 7 ימים']]);
  make('chart-stress', {
    type: 'line',
    data: { labels, datasets: [line(rows, 'stress_avg', C.orange), maLine(rows, 'stress_avg')] },
    options: opts({ min: 0, max: 100 }, i => `מתח: ${fmt(i.raw.y)}`),
  });

  /* --- פעילות --- */
  $('u-steps').textContent = `יעד ${fmt(goalSteps())}`;
  legend('legend-steps', [[C.violet, 'צעדים'], [C.ma, 'ממוצע נע 7 ימים']]);
  make('chart-steps', {
    type: 'bar',
    data: { labels, datasets: [bar(rows, 'steps', C.violet), constLine(rows, goalSteps(), 'יעד', C.muted), maLine(rows, 'steps')] },
    options: opts({ beginAtZero: true }, i => `צעדים: ${fmt(i.raw.y)}`),
  });

  renderChartTips();
}

/* =========================================================================
 * מסקנה מאוחדת לכל עמוד (מחליפה שלושה כרטיסי תובנה נפרדים)
 * ========================================================================= */
function verdictCard(elId, title, keys) {
  const lines = keys.map(key => {
    const s = statusOf(key);
    if (!s) return null;
    const d = METRICS[key];
    const color = s.level === 'alert' ? 'var(--alert)' : s.level === 'watch' ? 'var(--watch)' : s.level === 'ok' ? 'var(--ok)' : 'var(--muted)';
    // הטיפים עצמם חיים מתחת לגרפים (renderChartTips) — כאן רק סיכום סטטוס
    return `<div class="vline"><span class="vdot" style="background:${color}"></span>
      <span><b>${d.label} ${valueText(key, s.value)}</b> — ${s.text}.</span></div>`;
  }).filter(Boolean);
  $(elId).innerHTML = lines.length
    ? `<div class="verdict-card"><h3>${title}</h3>${lines.join('')}</div>` : '';
}

/* =========================================================================
 * טיפים לשיפור — מוצגים רק מתחת לגרף שהמדד בו חורג (watch/alert).
 * statusOf כבר מקפל את כיוון "הטוב", כך ש-watch/alert תמיד = הצד הבעייתי.
 * ========================================================================= */
const TIPS = {
  sleep_hours: [
    'נסה להקדים את שעת השינה ב-30 דקות הערב — עקביות חשובה מרצף אחד ארוך.',
    'בלי מסכים בחצי השעה שלפני השינה — האור מעכב הירדמות.',
  ],
  sleep_score: [
    'הימנע מארוחה כבדה או אלכוהול ב-3 השעות שלפני השינה.',
    'חדר קריר וחשוך משפר את השינה העמוקה.',
  ],
  rhr: [
    'שתה יותר מים היום והסתפק באימון קל.',
    'דופק מנוחה מוגבר כמה ימים ברצף? ודא שאינך חולה ותן לגוף לנוח.',
  ],
  hrv: [
    '5 דקות נשימה איטית (4–6 נשימות בדקה) לפני השינה מעלות HRV.',
    'יום קל היום — עומס נוסף רק ירחיק את החזרה לטווח.',
  ],
  stress_avg: [
    'שלב הפסקות נשימה של דקה לאורך היום, לא רק בסופו.',
    'הליכה קצרה בחוץ מורידה מתח נמדד יותר מהפסקת מסך.',
  ],
  steps: [
    'פזר הליכות קצרות של 10 דקות — קל יותר מהשלמה בערב.',
    'רד תחנה מוקדם או חנה רחוק — צעדים סמויים מצטברים מהר.',
  ],
};
const CHART_TIPS = {
  'tip-sleep': 'sleep_hours', 'tip-stages': 'sleep_score', 'tip-rhr': 'rhr',
  'tip-hrv': 'hrv', 'tip-stress': 'stress_avg', 'tip-steps': 'steps',
};
function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}
function renderChartTips() {
  const rot = dayOfYear();
  for (const [slot, key] of Object.entries(CHART_TIPS)) {
    const el = $(slot);
    if (!el) continue;
    const s = statusOf(key);
    if (s && (s.level === 'watch' || s.level === 'alert') && TIPS[key]) {
      const tip = TIPS[key][rot % TIPS[key].length];
      el.innerHTML = `<div class="tip-strip ${s.level}"><span class="ts-ic">${icon('bulb', 16)}</span><span><b>טיפ:</b> ${tip}</span></div>`;
    } else {
      el.innerHTML = '';
    }
  }
}

/* =========================================================================
 * שיאים — שורה קומפקטית
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
function trailingStreak(rows, pred) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) { if (pred(rows[i]) === true) n++; else break; }
  return n;
}
const recCard = (emoji, value, label) => `<div class="rec"><span>${emoji}</span><b>${value}</b><small>${label}</small></div>`;
function renderRecords(id, items) {
  const list = items.filter(Boolean);
  $(id).innerHTML = list.length ? `<div class="records">${list.join('')}</div>` : '';
}

/* =========================================================================
 * המלצת שינה — כשממוצע השינה מתחת ליעד, ממליץ להקדים את שעת השינה
 * ========================================================================= */
function renderSleepRec() {
  const el = $('sleep-rec');
  const recent = state.data.slice(-7);
  const avgSleep = avg(recent, 'sleep_hours');
  const goal = goalSleep();
  if (avgSleep === null || avgSleep >= goal - 0.3) { el.innerHTML = ''; return; }
  const gapMin = Math.round((goal - avgSleep) * 60);
  el.innerHTML = `<div class="insight"><span class="i-ic">${icon('moon', 19)}</span>
    <p><b>חוסר שינה:</b> ממוצע ${fmt(avgSleep, 1)} שעות בשבוע האחרון, מתחת ליעד ${fmt(goal, Number.isInteger(goal) ? 0 : 1)}.
    נסה להקדים את שעת השינה בכ-<b>${gapMin} דקות</b> — עקביות חשובה יותר מלילה בודד ארוך.</p></div>`;
}

/* =========================================================================
 * עקביות שינה — סדירות משך השינה (שונות נמוכה = עקבי יותר)
 * ========================================================================= */
function renderSleepConsistency() {
  const el = $('sleep-consistency');
  const b = stdev(state.data.slice(-14), 'sleep_hours');
  if (!b || b.n < 7 || b.mean === 0) { el.innerHTML = ''; return; }
  const cv = b.sd / b.mean;               // מקדם שונות
  const score = Math.round(clamp(100 - cv * 100 * 2.2, 0, 100));
  const label = score >= 85 ? 'מעולה' : score >= 70 ? 'טובה' : score >= 50 ? 'בינונית' : 'משתנה';
  const note = score >= 70
    ? 'שעות השינה שלך יציבות — השעון הביולוגי מודה לך.'
    : 'שעות השינה משתנות מלילה ללילה — עקביות חשובה יותר מרצף ארוך בודד.';
  el.innerHTML = `<article class="card"><div class="card-head"><h2>עקביות שינה</h2>
    <span class="unit">14 ימים אחרונים</span></div>
    <div class="sh-top"><div><div class="sh-val">${score}<small>/100</small></div>
      <div class="sh-base">${note}</div></div>
      <div class="sh-right"><span class="d-status s-${score >= 70 ? 'ok' : score >= 50 ? 'normal' : 'watch'}">${label}</span></div></div></article>`;
}

/* =========================================================================
 * כרטיסים ייעודיים לנתונים החדשים (מוסתרים כשאין נתון)
 * ========================================================================= */
function renderBreathing() {
  const spo2 = latest('spo2_avg', 5), resp = latest('respiration_avg', 5), lowO2 = latest('spo2_low', 5);
  const el = $('sleep-breathing');
  if (spo2 === null && resp === null) { el.innerHTML = ''; return; }
  const rows = [];
  if (spo2 !== null) rows.push(`<li><span class="r-ic">${icon('drop', 18)}</span>
    <span><span class="r-name">רוויון חמצן ממוצע</span>${lowO2 !== null ? `<br><span class="r-sub">שפל ${lowO2}%</span>` : ''}</span>
    <span class="r-val">${fmt(spo2)}<small>%</small></span></li>`);
  if (resp !== null) rows.push(`<li><span class="r-ic">${icon('lungs', 18)}</span>
    <span class="r-name">קצב נשימה בשינה</span>
    <span class="r-val">${fmt(resp, 1)}<small>נשימות/דק׳</small></span></li>`);
  el.innerHTML = `<article class="card"><div class="card-head"><h2>נשימה וחמצן בלילה</h2>
    <span class="unit">מהמדידה האחרונה</span></div><ul class="rows">${rows.join('')}</ul></article>`;
}

const TRAINING_STATUS = {
  PRODUCTIVE: 'מתקדם', PRODUCTIVE_1: 'מתקדם', MAINTAINING: 'שומר על הקיים',
  MAINTAINING_1: 'שומר על הקיים', PEAKING: 'בשיא', OVERREACHING: 'יתר-אימון',
  UNPRODUCTIVE: 'לא פורה', DETRAINING: 'ירידה בכושר', RECOVERY: 'התאוששות',
  STRAINED: 'עומס יתר', NO_STATUS: 'אין סטטוס',
};

function renderWorkouts() {
  const el = $('workouts-card');
  const rows = visibleRows();
  const all = [];
  for (const r of rows) for (const w of (r.workouts || [])) all.push({ ...w, date: r.date });
  if (!all.length) { el.innerHTML = ''; return; }
  const recent = all.slice(-8).reverse();
  const totalMin = all.reduce((a, w) => a + (w.minutes || 0), 0);
  const items = recent.map(w => {
    const bits = [];
    if (w.km) bits.push(`${fmt(w.km, 2)} ק״מ`);
    if (w.avg_hr) bits.push(`דופק ${w.avg_hr}`);
    if (w.calories) bits.push(`${fmt(w.calories)} kcal`);
    const wi = w.type_key && w.type_key.includes('strength') ? 'dumbbell' : 'run';
    return `<li><span class="r-ic">${icon(wi, 18)}</span>
      <span><span class="r-name">${w.type}</span><br><span class="r-sub">${shortDate(w.date)}${bits.length ? ' · ' + bits.join(' · ') : ''}</span></span>
      <span class="r-val">${w.minutes ? `${w.minutes}<small>דק׳</small>` : ''}</span></li>`;
  }).join('');
  el.innerHTML = `<article class="card"><div class="card-head"><h2>אימונים</h2>
    <span class="unit">${all.length} אימונים · ${fmt(totalMin)} דק׳ בתקופה</span></div>
    <ul class="rows">${items}</ul></article>`;
}

/* =========================================================================
 * פרופיל — כרטיס גוף ואזורי דופק
 * ========================================================================= */
function renderBody() {
  const el = $('home-body');
  const b = bmi(), mh = maxHR();
  const has = profile.age || profile.heightCm || profile.weightKg || profile.sleepGoal || profile.stepsGoal;
  if (!has) {
    el.innerHTML = `<button class="prompt-card" id="open-profile"><span class="pc-ic">${icon('profile', 22)}</span>
      <span><span class="pc-t">השלם פרופיל אישי</span><br><span class="pc-v">גיל, גובה ומשקל — לניתוח ויעדים מדויקים יותר</span></span>
      <span class="pc-arrow">‹</span></button>`;
    return;
  }
  const chips = [];
  if (b) chips.push(`<div class="chip"><span class="chip-ic">${icon('scale', 18)}</span><b>${b.toFixed(1)}</b><small>BMI · ${bmiCat(b)}</small></div>`);
  if (mh) chips.push(`<div class="chip"><span class="chip-ic">${icon('heart', 18)}</span><b>${mh}</b><small>דופק מקס׳</small></div>`);
  chips.push(`<div class="chip"><span class="chip-ic">${icon('moon', 18)}</span><b>${fmt(goalSleep(), Number.isInteger(goalSleep()) ? 0 : 1)}</b><small>יעד שינה</small></div>`);
  chips.push(`<div class="chip"><span class="chip-ic">${icon('walk', 18)}</span><b>${fmt(goalSteps())}</b><small>יעד צעדים</small></div>`);
  el.innerHTML = `<article class="card"><div class="body-head"><h2>הפרופיל שלי</h2>
    <button class="link-btn" id="open-profile">עריכה</button></div><div class="chips">${chips.join('')}</div></article>`;
}

function renderHrZones() {
  const el = $('hr-zones'), mh = maxHR();
  if (!mh) { el.innerHTML = ''; return; }
  // דופק מנוחה אישי (ממוצע הבסיס יציב יותר מערך בודד) — לחישוב Karvonen
  const rest = Math.round(baselineOf('rhr')?.mean ?? latest('rhr') ?? 0) || null;
  const zones = [[50, 60, 'התאוששות', C.teal], [60, 70, 'שריפת שומן', C.blue],
                 [70, 80, 'אירובי', C.green], [80, 90, 'אנאירובי', C.orange], [90, 100, 'מקסימלי', C.red]];
  // Karvonen (Heart Rate Reserve): דופק = ((מקס − מנוחה) × אחוז) + מנוחה — מותאם אישית
  // אם אין דופק מנוחה, נופלים לאחוז מהדופק המקסימלי
  const bpm = pct => rest ? Math.round((mh - rest) * pct / 100 + rest) : Math.round(mh * pct / 100);
  const method = rest ? `Karvonen · מנוחה ${rest}` : `אחוז מהמקס׳`;
  const src = maxHrIsReal() ? 'דופק מקס׳' : 'מקס׳ מוערך';
  el.innerHTML = `<article class="card"><div class="card-head"><h2>אזורי דופק לאימון</h2>
    <span class="unit">${src} ${mh} · ${method}</span></div><ul class="rows">${zones.map(z =>
      `<li><span class="zdot" style="background:${z[3]}"></span><span class="r-name">${z[2]}</span>
       <span class="r-val">${bpm(z[0])}–${bpm(z[1])}<small>bpm</small></span></li>`).join('')}</ul></article>`;
}

/* =========================================================================
 * מעקב משקל — כרטיס בעמוד הבית
 * ========================================================================= */
function deltaChip(label, from) {
  if (!from) return '';
  const diff = latestWeight().kg - from.kg;
  if (Math.abs(diff) < 0.05) return `<span class="wd-chip">${label}: ללא שינוי</span>`;
  const dir = diff > 0 ? 'up' : 'down';
  const arrow = diff > 0 ? '▲' : '▼';
  return `<span class="wd-chip ${dir}">${label}: <b>${arrow} ${fmt(Math.abs(diff), 1)} ק״ג</b></span>`;
}
/* =========================================================================
 * אזהרת מחלה / יתר-אימון — כרטיס מותנה: כשכמה סימנים גופניים מצטלבים
 * ========================================================================= */
function renderStrain() {
  const el = $('strain-warning');
  const signals = [];
  const rhr = statusOf('rhr'); if (rhr && (rhr.level === 'watch' || rhr.level === 'alert')) signals.push('דופק מנוחה מוגבר');
  const hrv = statusOf('hrv'); if (hrv && (hrv.level === 'watch' || hrv.level === 'alert')) signals.push('HRV נמוך');
  const resp = statusOf('respiration_avg'); if (resp && (resp.level === 'watch' || resp.level === 'alert')) signals.push('קצב נשימה מוגבר');
  // צריך לפחות שני סימנים מצטלבים כדי לא להקפיץ אזהרות שווא
  if (signals.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="strain-card">
    <span class="strain-ic">${icon('stetho', 22)}</span>
    <div><div class="strain-title">הגוף תחת עומס</div>
    <div class="strain-body">שילוב של ${signals.join(' · ')} — שקול יום מנוחה, שתייה מרובה ושינה מוקדמת.</div></div></div>`;
}

/* שיפוע ליניארי (kg/יום) על השקילות — לתחזית יעד המשקל */
function weightSlope() {
  if (weights.length < 2) return null;
  const t0 = new Date(weights[0].date).getTime();
  const pts = weights.map(w => [(new Date(w.date).getTime() - t0) / 86400000, w.kg]);
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const denom = n * sxx - sx * sx;
  return denom === 0 ? null : (n * sxy - sx * sy) / denom;
}

function renderWeight() {
  const el = $('weight-card');
  const last = latestWeight();
  if (!last) {
    el.innerHTML = `<button class="prompt-card" id="open-weight"><span class="pc-ic">${icon('scale', 22)}</span>
      <span><span class="pc-t">התחל מעקב משקל שבועי</span><br><span class="pc-v">שקילה אחת בשבוע מספיקה למגמה אמינה</span></span>
      <span class="pc-arrow">‹</span></button>`;
    return;
  }
  const deltas = [deltaChip('מהשקילה הקודמת', weights.length >= 2 ? weights[weights.length - 2] : null),
                  deltaChip('מלפני חודש', weightAt(30))].filter(Boolean).join('');
  const daysSince = Math.floor((new Date(todayISO()) - new Date(last.date)) / 86400000);
  const nudge = daysSince > 7 ? `<div class="weight-nudge">עברו ${daysSince} ימים מהשקילה האחרונה</div>` : '';
  const chart = weights.length >= 3 ? '<div class="chart-wrap chart-sm" dir="ltr" style="height:120px;margin-top:10px"><canvas id="chart-weight"></canvas></div>' : '';

  // יעד משקל + תחזית לפי המגמה
  const goal = profile.weightGoal ? Number(profile.weightGoal) : null;
  let goalLine = '';
  if (goal) {
    const slope = weightSlope(); // kg/יום
    const remaining = goal - last.kg;
    let eta;
    if (Math.abs(remaining) < 0.3) eta = '<b>הגעת ליעד!</b>';
    else if (slope === null || Math.abs(slope) < 0.002) eta = 'המגמה יציבה — היעד עדיין לא בהישג';
    else if ((remaining < 0) === (slope < 0)) {
      const weeks = Math.round(Math.abs(remaining / slope) / 7);
      eta = `בקצב הנוכחי — היעד בעוד <b>~${weeks} שבועות</b>`;
    } else eta = 'המגמה מתרחקת מהיעד כרגע';
    goalLine = `<div class="weight-goal">${icon('gauge', 15)} יעד ${fmt(goal, 1)} ק״ג · ${eta}</div>`;
  }

  el.innerHTML = `<article class="card">
    <div class="body-head"><h2>משקל</h2><button class="link-btn" id="open-weight">+ שקילה</button></div>
    <div class="weight-top"><div><div class="weight-val">${fmt(last.kg, 1)}<small>ק״ג</small></div>
      <div class="sh-base">עודכן ${shortDate(last.date)}</div></div></div>
    ${deltas ? `<div class="weight-deltas">${deltas}</div>` : ''}
    ${goalLine}${nudge}${chart}</article>`;
  if (weights.length >= 3) {
    const wRows = weights.map(w => ({ date: w.date }));
    const datasets = [{ data: weights.map(w => ({ x: shortDate(w.date), y: w.kg, iso: w.date })),
      borderColor: C.teal, backgroundColor: gradFill(C.teal), borderWidth: 2.5, pointRadius: 3,
      pointBackgroundColor: C.teal, tension: .3, fill: true }];
    if (goal) datasets.push(constLine(wRows, goal, 'יעד', C.muted));
    make('chart-weight', {
      type: 'line',
      data: { labels: weights.map(w => shortDate(w.date)), datasets },
      options: opts({ grace: '15%' }, i => `משקל: ${fmt(i.raw.y, 1)} ק״ג`),
    });
  }
}

/* =========================================================================
 * מעקב אימוני כוח — לוח V שבועי בעמוד הפעילות
 * ========================================================================= */
function renderStrength() {
  const el = $('strength-card');
  const auto = autoStrengthDates();
  const goal = goalStrength();
  const today = new Date(todayISO());
  const weekStart = new Date(weekStartISO(today));

  // 7 ימי השבוע הנוכחי, ראשון→שבת
  const days = [];
  let doneThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const isFuture = d > today;
    const isToday = iso === todayISO();
    const isAuto = auto.has(iso);
    const done = strengthDone(iso, auto);
    if (done && !isFuture) doneThisWeek++;
    const cls = [done ? 'done' : '', isAuto ? 'auto' : '', isToday ? 'today' : '', isFuture ? 'future' : ''].filter(Boolean).join(' ');
    days.push(`<button class="wday ${cls}" data-iso="${iso}" ${isFuture || isAuto ? 'disabled' : ''}>
      <i>${done ? '✓' : ''}</i><small>${DAY_NAMES[i][0]}</small></button>`);
  }

  // רצף שבועות ביעד (השבוע נספר רק אם כבר עמד ביעד)
  let streak = 0;
  for (let back = 0; back < 12; back++) {
    const ws = new Date(weekStart);
    ws.setDate(weekStart.getDate() - back * 7);
    let cnt = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(ws.getDate() + i);
      if (d > today) continue;
      if (strengthDone(d.toISOString().slice(0, 10), auto)) cnt++;
    }
    if (cnt >= goal) streak++; else break;
  }
  const streakLine = streak >= 2 ? `<div class="strength-streak">${icon('flame', 15)} ${streak} שבועות ברצף ביעד</div>` : '';

  el.innerHTML = `<article class="card">
    <div class="body-head"><h2>אימוני כוח</h2>
      <span class="strength-count"><b>${doneThisWeek}</b>/${goal} השבוע</span></div>
    <div class="week-board">${days.join('')}</div>${streakLine}</article>`;
}

/* =========================================================================
 * סיכום שבועי — השבוע מול השבוע הקודם
 * ========================================================================= */
function weekRows(startOffset) {
  // startOffset=0 → השבוע הנוכחי; 1 → השבוע הקודם
  const today = new Date(todayISO());
  const ws = new Date(weekStartISO(today));
  ws.setDate(ws.getDate() - startOffset * 7);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const wsISO = ws.toISOString().slice(0, 10), weISO = we.toISOString().slice(0, 10);
  return state.data.filter(r => r.date >= wsISO && r.date <= weISO);
}
function wsDelta(cur, prev, dec = 0, invert = false) {
  if (cur === null || prev === null) return '';
  const diff = cur - prev;
  if (Math.abs(diff) < (dec ? 0.05 : 0.5)) return `<span class="ws-delta flat">ללא שינוי</span>`;
  const good = invert ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? '▲' : '▼';
  return `<span class="ws-delta ${good ? 'up' : 'down'}">${arrow} ${fmt(Math.abs(diff), dec)}</span>`;
}
function strengthCountInWeek(rows, auto) {
  const set = new Set();
  for (const r of rows) if (strengthDone(r.date, auto)) set.add(r.date);
  return set.size;
}
function renderWeekSummary() {
  const el = $('week-summary');
  const cur = weekRows(0), prev = weekRows(1);
  if (!cur.length && !prev.length) { el.innerHTML = ''; return; }
  const auto = autoStrengthDates();

  const sleepC = avg(cur, 'sleep_hours'), sleepP = avg(prev, 'sleep_hours');
  const stepsC = avg(cur, 'steps'), stepsP = avg(prev, 'steps');
  const strC = strengthCountInWeek(cur, auto), strP = strengthCountInWeek(prev, auto);
  const intC = cur.reduce((a, r) => a + (r.intensity_min || 0), 0);
  const intP = prev.reduce((a, r) => a + (r.intensity_min || 0), 0);
  const intGoal = 150; // המלצת ה-WHO לדקות פעילות אינטנסיבית בשבוע

  const chips = [];
  chips.push(`<div class="ws-chip"><small>שינה ממוצעת</small><b>${sleepC !== null ? fmt(sleepC, 1) : '—'}<small> ש׳</small></b>${wsDelta(sleepC, sleepP, 1)}</div>`);
  chips.push(`<div class="ws-chip"><small>צעדים ליום</small><b>${stepsC !== null ? fmt(Math.round(stepsC)) : '—'}</b>${wsDelta(stepsC, stepsP)}</div>`);
  chips.push(`<div class="ws-chip"><small>אימוני כוח</small><b>${strC}<small>/${goalStrength()}</small></b>${wsDelta(strC, strP)}</div>`);
  chips.push(`<div class="ws-chip"><small>דקות אינטנסיביות</small><b>${fmt(intC)}<small>/${intGoal}</small></b>
    <div class="ws-bar"><i style="width:${clamp(intC / intGoal * 100, 0, 100)}%"></i></div></div>`);
  // צ׳יפ דלתא-משקל רק כשיש יומן משקל
  const wLast = latestWeight(), wPrev = weightAt(7);
  if (wLast && wPrev) {
    const diff = wLast.kg - wPrev.kg;
    chips.push(`<div class="ws-chip"><small>משקל (שבוע)</small><b>${fmt(wLast.kg, 1)}<small> ק״ג</small></b>${wsDelta(wLast.kg, wPrev.kg, 1, true)}</div>`);
  }

  // סיכום כתוב בסגנון מאמן — מספר את הסיפור, לא רק מציג מספרים
  const bits = [];
  if (sleepC !== null && sleepP !== null) {
    const d = sleepC - sleepP;
    bits.push(Math.abs(d) < 0.2 ? 'השינה יציבה' : d > 0 ? 'השינה השתפרה' : 'השינה ירדה מעט');
  }
  const hrvC = avg(cur, 'hrv'), hrvP = avg(prev, 'hrv');
  if (hrvC !== null && hrvP !== null && hrvP) {
    const pct = Math.round((hrvC - hrvP) / hrvP * 100);
    if (Math.abs(pct) >= 4) bits.push(`ה-HRV ${pct > 0 ? 'עלה' : 'ירד'} ב-${Math.abs(pct)}%`);
  }
  if (strC < goalStrength()) bits.push(`חסרים ${goalStrength() - strC} אימוני כוח ליעד`);
  else if (strC >= goalStrength()) bits.push('עמדת ביעד אימוני הכוח');
  const prose = bits.length ? `<p class="ws-prose">${bits.join(', ')}.</p>` : '';

  el.innerHTML = `<article class="card"><div class="card-head"><h2>הסיכום השבועי שלך</h2>
    <span class="unit">מול השבוע הקודם</span></div>${prose}<div class="ws-grid">${chips.join('')}</div></article>`;
}

/* =========================================================================
 * כושר ואימון מומלץ — כרטיס מאוחד: נתוני הכושר + ההמלצה של היום.
 * ההמלצה נגזרת גם מהמוכנות וגם מסטטוס האימון (המגמה), ובוחרת מסוגי
 * האימונים שאתה מבצע בפועל.
 * ========================================================================= */
const MY_WORKOUTS = {
  zone2:    { ico: 'run', label: 'ריצת Zone 2', detail: '~5 ק״מ בקצב נוח (אפשר לנהל שיחה)' },
  tempo:    { ico: 'bolt', label: 'ריצת טמפו',   detail: '~3 ק״מ בקצב מאמץ' },
  strength: { ico: 'dumbbell', label: 'אימון כוח',   detail: 'פול-באדי' },
  rest:     { ico: 'yoga', label: 'מנוחה פעילה',  detail: 'הליכה קלה, מתיחות או יוגה' },
};
/* בוחר את אימון היום לפי מוכנות + סטטוס אימון + יתרת יעד הכוח */
function pickSession(score, statusKey, strLeft) {
  const strained = ['STRAINED', 'OVERREACHING', 'UNPRODUCTIVE'].includes(statusKey);
  if (score < 50 || strained)
    return { key: 'rest', why: strained ? 'סטטוס האימון מצביע על עומס — תן לגוף להתאושש' : 'המוכנות נמוכה — עדיף יום מנוחה' };
  if (score >= 70) {
    if (strLeft > 0) return { key: 'strength', why: 'מוכנות טובה ונותרו אימוני כוח להשלים השבוע' };
    return { key: 'tempo', why: 'מוכנות טובה — יום מצוין לאימון איכות' };
  }
  if (strLeft > 0) return { key: 'strength', why: 'מוכנות בינונית ונותרו אימוני כוח ליעד' };
  return { key: 'zone2', why: 'מוכנות בינונית — יום טוב לבניית בסיס אירובי' };
}
function renderActivityRec() {
  const el = $('activity-rec');
  const score = latest('readiness_score', 2) ?? heuristicReadiness();
  if (score === null) { el.innerHTML = ''; return; }

  // נתוני כושר ומגמה
  const vo2 = latest('vo2max', 10), age = latest('fitness_age', 10), st = latest('training_status', 10);
  const statusKey = st ? String(st).toUpperCase().replace(/[^A-Z_0-9]/g, '') : null;
  const statusHeb = statusKey ? (TRAINING_STATUS[statusKey] || st) : null;
  const chips = [];
  if (vo2 !== null) chips.push(`<div class="chip"><span class="chip-ic">${icon('vo2', 18)}</span><b>${fmt(vo2, 1)}</b><small>VO2 Max</small></div>`);
  if (age !== null) chips.push(`<div class="chip"><span class="chip-ic">${icon('calendar', 18)}</span><b>${fmt(age)}</b><small>גיל כושר</small></div>`);
  if (statusHeb) chips.push(`<div class="chip"><span class="chip-ic">${icon('chart', 18)}</span><b style="font-size:.74rem">${statusHeb}</b><small>סטטוס אימון</small></div>`);

  // יעדי השבוע
  const cur = weekRows(0), auto = autoStrengthDates();
  const strDone = strengthCountInWeek(cur, auto), strGoal = goalStrength();
  const strLeft = Math.max(0, strGoal - strDone);
  const intMin = cur.reduce((a, r) => a + (r.intensity_min || 0), 0), intGoal = 150;

  // אימון היום
  const pick = pickSession(score, statusKey, strLeft);
  const w = MY_WORKOUTS[pick.key];
  const tone = pick.key === 'rest' ? 'rest' : (score >= 70 ? 'go' : 'mod');

  const targets = [];
  targets.push(strLeft > 0
    ? `${icon('dumbbell', 16)} עוד <b>${strLeft}</b> אימוני כוח השבוע (${strDone}/${strGoal})`
    : `${icon('dumbbell', 16)} עמדת ביעד אימוני הכוח (${strDone}/${strGoal})`);
  const intLeft = Math.max(0, intGoal - Math.round(intMin));
  targets.push(intLeft > 0
    ? `${icon('run', 16)} עוד <b>${intLeft}</b> דק׳ פעילות אינטנסיבית ליעד ה-150 השבועי`
    : `${icon('run', 16)} מעל יעד ה-WHO (${Math.round(intMin)} דק׳)`);

  el.innerHTML = `<article class="card rec-card rec-${tone}">
    <div class="card-head"><h2>כושר ואימון מומלץ</h2><span class="unit">מוכנות ${score}</span></div>
    ${chips.length ? `<div class="chips" style="margin-bottom:12px">${chips.join('')}</div>` : ''}
    <div class="rec-session">
      <span class="rec-emoji">${icon(w.ico, 24)}</span>
      <div><div class="rec-title">היום: ${w.label}</div>
        <div class="rec-detail">${w.detail}</div>
        <div class="rec-why">${pick.why}</div></div>
    </div>
    <ul class="rec-list">${targets.map(t => `<li>${t}</li>`).join('')}</ul></article>`;
}

/* =========================================================================
 * מודאל פרופיל
 * ========================================================================= */
const PROFILE_FIELDS = ['age', 'heightCm', 'weightKg', 'sleepGoal', 'stepsGoal', 'strengthGoal', 'weightGoal', 'maxHrOverride'];
function fillProfileForm() {
  const f = $('profile-form');
  PROFILE_FIELDS.forEach(k => { if (f[k]) f[k].value = profile[k] ?? ''; });
  if (f.sex) f.sex.value = profile.sex || '';
}
function openProfile() { fillProfileForm(); $('profile-modal').classList.remove('hidden'); }
function closeProfile() { $('profile-modal').classList.add('hidden'); }

$('profile-btn').addEventListener('click', openProfile);
$('profile-modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeProfile(); });
$('home-body').addEventListener('click', e => { if (e.target.closest('#open-profile')) openProfile(); });
$('profile-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, p = {};
  PROFILE_FIELDS.forEach(k => { const v = f[k].value.trim(); if (v !== '') p[k] = Number(v); });
  if (f.sex.value) p.sex = f.sex.value;
  saveProfileObj(p); closeProfile(); renderAll();
});
$('profile-clear').addEventListener('click', () => { saveProfileObj({}); fillProfileForm(); closeProfile(); renderAll(); });

/* --- מודאל שקילה --- */
function openWeight() {
  const f = $('weight-form');
  f.date.value = todayISO();
  f.date.max = todayISO();
  f.kg.value = latestWeight()?.kg ?? '';
  $('weight-modal').classList.remove('hidden');
}
function closeWeight() { $('weight-modal').classList.add('hidden'); }
$('weight-card').addEventListener('click', e => { if (e.target.closest('#open-weight')) openWeight(); });
$('weight-modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeWeight(); });
$('weight-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, kg = Number(f.kg.value), date = f.date.value;
  if (!kg || !date) return;
  addWeight(date, kg);
  haptic(12);
  closeWeight();
  renderWeight(); renderBody(); renderWeekSummary();
});

/* --- סימון ידני של אימון כוח --- */
$('strength-card').addEventListener('click', e => {
  const btn = e.target.closest('.wday');
  if (!btn || btn.disabled) return;
  const iso = btn.dataset.iso;
  strengthChecks[iso] = !strengthChecks[iso];
  if (!strengthChecks[iso]) delete strengthChecks[iso];
  haptic(12);
  saveStrength();
  renderStrength(); renderWeekSummary();
});

/* --- הסבר על גרפים (לחיצה על שם הגרף) --- */
const CHART_INFO = {
  sleep_hours: { title: 'שעות שינה', what: 'סך שעות השינה בפועל בלילה, כפי שהשעון מזהה.',
    help: 'שינה היא הזמן שבו הגוף מתקן את עצמו — חוסר שינה פוגע בהתאוששות, במצב הרוח ובביצועים.',
    conclude: 'עקביות (אותה שעת שינה) חשובה יותר מלילה בודד ארוך. חוסר מצטבר מסמן שכדאי להקדים את השינה.' },
  stages: { title: 'שלבי שינה', what: 'פירוק השינה לשלבים: עמוקה, קלה ו-REM.',
    help: 'שינה עמוקה משקמת את הגוף, REM את המוח והזיכרון. האיזון ביניהם מעיד על איכות השינה.',
    conclude: 'מעט שינה עמוקה למרות שעות רבות = שינה מקוטעת. אלכוהול וארוחה כבדה פוגעים בעיקר בשינה העמוקה.' },
  rhr: { title: 'דופק מנוחה', what: 'מספר פעימות הלב בדקה במנוחה מוחלטת, נמדד בעיקר בשינה.',
    help: 'מדד רגיש למצב הגוף: מתח, מחלה, התייבשות או אימון קשה מעלים אותו; כושר טוב ומנוחה מורידים אותו.',
    conclude: 'מגמת ירידה לאורך זמן = שיפור בכושר ובהתאוששות. עלייה של כמה ימים ברצף = סימן מוקדם לעומס או מחלה.' },
  hrv: { title: 'שונות דופק (HRV)', what: 'השונות בזמן שבין פעימה לפעימה. ערך גבוה יותר = מערכת עצבים גמישה ומאוששת.',
    help: 'אחד המדדים הטובים למוכנות הגוף לעומס — יורד כשאתה עייף, לחוץ, חולה או אחרי אלכוהול.',
    conclude: 'מעל הבסיס האישי שלך = יום טוב להעמיס. מתחת אליו = עדיף יום קל. ההשוואה תמיד לבסיס שלך, כי HRV אישי מאוד.' },
  stress_avg: { title: 'רמת מתח', what: 'ציון של גרמין (0–100) הנגזר משילוב הדופק וה-HRV לאורך היום.',
    help: 'מראה כמה זמן הגוף היה במצב "לחץ" מול "רגיעה" — עוזר לזהות ימים עמוסים ולתזמן התאוששות.',
    conclude: 'ערכים גבוהים לאורך זמן פוגעים בשינה ובהתאוששות. הפוגות נשימה והליכה קצרה בחוץ מורידות אותו.' },
  steps: { title: 'צעדים', what: 'מספר הצעדים היומי — מדד לפעילות הכללית שלך לאורך היום.',
    help: 'תנועה מצטברת תומכת בלב, במשקל ובשינה, גם בלי אימון ייעודי.',
    conclude: 'עקביות עדיפה על "הכול בבת אחת". פיזור הליכות קצרות מצטבר מהר ליעד היומי.' },
};
function openInfo(key) {
  const info = CHART_INFO[key];
  if (!info) return;
  $('info-title').textContent = info.title;
  $('info-body').innerHTML = `
    <div class="info-sec"><h3>מה זה?</h3><p>${info.what}</p></div>
    <div class="info-sec"><h3>איך זה עוזר לך?</h3><p>${info.help}</p></div>
    <div class="info-sec"><h3>מה אפשר להסיק?</h3><p>${info.conclude}</p></div>`;
  $('info-modal').classList.remove('hidden');
}
$('pager').addEventListener('click', e => {
  const t = e.target.closest('[data-info]');
  if (t) openInfo(t.dataset.info);
});
$('info-modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) $('info-modal').classList.add('hidden'); });

/* --- ייצוא / ייבוא גיבוי (מקומי בלבד) --- */
function exportBackup() {
  const backup = {
    version: 1, exportedAt: new Date().toISOString(),
    profile, weight_log_v1: weights, strength_checks_v1: strengthChecks,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `health-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const b = JSON.parse(reader.result);
      if (typeof b !== 'object' || !b) throw new Error('bad');
      if (!confirm('הייבוא ידרוס את הנתונים המקומיים הנוכחיים. להמשיך?')) return;
      if (b.profile) saveProfileObj(b.profile);
      if (Array.isArray(b.weight_log_v1)) { weights = b.weight_log_v1; saveWeights(); }
      if (b.strength_checks_v1 && typeof b.strength_checks_v1 === 'object') { strengthChecks = b.strength_checks_v1; saveStrength(); }
      loadProfile();
      closeProfile();
      renderAll();
      alert('הנתונים יובאו בהצלחה.');
    } catch { alert('קובץ לא תקין.'); }
  };
  reader.readAsText(file);
}
$('export-btn').addEventListener('click', exportBackup);
$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });

/* =========================================================================
 * רינדור כולל
 * ========================================================================= */
function renderAll() {
  document.querySelectorAll('#range-filter .seg-btn').forEach(b => {
    const v = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
    b.classList.toggle('active', v === state.range);
  });

  // בית
  renderDashboard();
  renderStrain();
  renderAnomalies();
  renderWeekSummary();
  renderHomeInsight();
  renderWeight();
  renderBody();

  // עמודי פירוט
  renderSleepRec();
  renderSleepConsistency();
  statHero('sleep-hero', 'sleep_hours');
  statHero('heart-hero', 'hrv', hrvExtra());
  statHero('steps-hero', 'steps');
  renderStrength();
  renderActivityRec();
  renderCharts();
  renderBreathing();
  renderWorkouts();
  renderHrZones();

  verdictCard('sleep-insight', 'מה זה אומר', ['sleep_hours', 'sleep_score']);
  verdictCard('heart-insight', 'מה זה אומר', ['rhr', 'hrv', 'stress_avg']);
  verdictCard('steps-insight', 'מה זה אומר', ['steps']);

  const rows = visibleRows();
  const sleepStreak = trailingStreak(rows, r => r.sleep_score != null && r.sleep_score >= 80);
  renderRecords('sleep-records', [
    sleepStreak >= 2 && recCard(icon('flame', 22), `${sleepStreak}`, 'רצף לילות 80+'),
  ]);

  const bestSteps = extremeDay(rows, 'steps', 'max');
  const stepStreak = trailingStreak(rows, r => r.steps != null && r.steps >= goalSteps());
  const totalSteps = rows.reduce((a, r) => a + (r.steps || 0), 0);
  // מדדים מצטברים — בלי היום החלקי (כמו ב-CUMULATIVE)
  const fullRows = rows[rows.length - 1]?.date === todayISO() ? rows.slice(0, -1) : rows;
  const calVals = vals(fullRows, 'calories');
  const avgCal = calVals.length ? Math.round(calVals.reduce((a, b) => a + b, 0) / calVals.length) : null;
  const totalFloors = fullRows.reduce((a, r) => a + (r.floors || 0), 0);
  renderRecords('steps-records', [
    bestSteps && recCard(icon('walk', 22), fmt(bestSteps.v), `היום הפעיל · ${shortDate(bestSteps.date)}`),
    stepStreak >= 2 && recCard(icon('flame', 22), `${stepStreak}`, 'רצף ימים ביעד'),
    totalSteps > 0 && recCard(icon('chartbars', 22), fmt(totalSteps), 'סה״כ בתקופה'),
    avgCal && recCard(icon('flame', 22), fmt(avgCal), 'קק״ל ליום בממוצע'),
    totalFloors > 0 && recCard(icon('floors', 22), fmt(totalFloors), 'קומות בתקופה'),
  ]);
}

/* =========================================================================
 * ניווט — אגנוסטי לכיוון (RTL/LTR) כדי שההחלקה תתאים לסדר הטאבים
 * ========================================================================= */
const pager = $('pager');
const tabs = [...document.querySelectorAll('.tab')];
const pages = [...document.querySelectorAll('.page')];

function setActive(idx) {
  if (idx === state.page) return;
  state.page = idx;
  tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
  $('tabbar').style.setProperty('--tab-idx', idx);
  $('page-title').textContent = pages[idx].dataset.title;
  $('page-sub').textContent = pages[idx].dataset.sub || '';
  // בורר הטווח רלוונטי רק לעמודים עם גרפים
  $('range-filter').classList.toggle('hidden', idx === 0);
}
function goTo(idx) {
  haptic(10);
  // מעבר לעמוד מתחיל תמיד מראש העמוד המבוקש
  pages[idx].scrollTop = 0;
  pages[idx].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  setActive(idx);
}
/* איזה עמוד קרוב ביותר לתחילת המכל — עובד גם ב-RTL וגם ב-LTR */
function currentIndex() {
  const box = pager.getBoundingClientRect();
  let best = 0, bestD = Infinity;
  pages.forEach((p, i) => {
    const d = Math.abs(p.getBoundingClientRect().left - box.left);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

tabs.forEach(t => t.addEventListener('click', () => goTo(Number(t.dataset.index))));
$('dashboard').addEventListener('click', e => {
  const flip = e.target.closest('[data-flip]');
  if (flip) { flip.classList.toggle('flipped'); haptic(8); return; }
  const b = e.target.closest('[data-goto]');
  if (b) goTo(Number(b.dataset.goto));
});

let raf = null, scrollEndTimer = null;
pager.addEventListener('scroll', () => {
  if (!raf) raf = requestAnimationFrame(() => { raf = null; setActive(currentIndex()); });
  clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(onScrollEnd, 110);
}, { passive: true });

/* אחרי שההחלקה נעצרת: מיישרים לעמוד הקרוב (מונע "תקיעה" בין עמודים),
 * וכשנוחתים על הבית — מריצים מחדש את אנימציית הטבעות. */
function onScrollEnd() {
  const idx = currentIndex();
  setActive(idx);
  const off = pages[idx].getBoundingClientRect().left - pager.getBoundingClientRect().left;
  if (Math.abs(off) > 6) {
    // תיקון עדין: העמוד לא התיישב במלואו — מחליקים אליו במדויק
    pages[idx].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  } else if (idx === 0) {
    renderDashboard(); // כניסה מחדש לבית → הטבעות מתמלאות מחדש
  }
}

$('range-filter').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  state.range = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
  // בלי אנימציית כניסה בבנייה מחדש של 6 גרפים — מונע תקיעה בזמן החלפת טווח
  chartAnim = false; renderAll(); chartAnim = true;
});

/* =========================================================================
 * סנכרון אמיתי מגרמין — מפעיל את ה-GitHub Action מהדפדפן, ממתין לסיומו,
 * ומושך את הנתונים הטריים. דורש טוקן GitHub אישי שנשמר רק במכשיר (localStorage)
 * ונשלח אך ורק ל-api.github.com.
 * ========================================================================= */
const GH = { owner: 'eladnizri', repo: 'Garmin-data', wf: 'sync-garmin.yml' };
const TOKEN_KEY = 'gh_token_v1';
const ghToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
const setGhToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toast(msg, sticky = false) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  if (!sticky) toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function ghApi(path, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${ghToken()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}

/* מפעיל את ה-Action וממתין שיסתיים; מחזיר true בהצלחה, זורק שגיאה אחרת */
async function triggerGarminSync(onStatus) {
  const disp = await ghApi(`/repos/${GH.owner}/${GH.repo}/actions/workflows/${GH.wf}/dispatches`,
    { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  if (disp.status === 401 || disp.status === 403) throw new Error('TOKEN');
  if (disp.status !== 204) throw new Error('DISPATCH');
  const since = Date.now() - 90000; // סובלנות להפרש שעונים
  await sleep(4000);
  for (let i = 0; i < 45; i++) { // עד ~4.5 דקות
    const r = await ghApi(`/repos/${GH.owner}/${GH.repo}/actions/runs?event=workflow_dispatch&per_page=5`);
    if (r.ok) {
      const j = await r.json();
      const run = (j.workflow_runs || []).find(w => new Date(w.created_at).getTime() >= since);
      if (run) {
        if (run.status === 'completed') {
          if (run.conclusion === 'success') return true;
          throw new Error('RUN_FAILED');
        }
        onStatus?.(run.status);
      }
    }
    await sleep(6000);
  }
  throw new Error('TIMEOUT');
}

/* מושך את health.json העדכני ישירות דרך ה-API (עוקף את השהיית ה-CDN של Pages) */
async function fetchHealthFromApi() {
  const r = await ghApi(`/repos/${GH.owner}/${GH.repo}/contents/data/health.json?ref=main&t=${Date.now()}`);
  if (!r.ok) return null;
  const j = await r.json();
  try {
    const txt = decodeURIComponent(escape(atob((j.content || '').replace(/\n/g, ''))));
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr.filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date)) : null;
  } catch { return null; }
}

let syncing = false;
async function syncNow() {
  if (syncing) return;
  if (!ghToken()) { openToken(); return; }
  syncing = true;
  haptic(10);
  const btn = $('sync-btn');
  btn.classList.add('spinning');
  toast('מסנכרן מגרמין… זה עשוי לקחת 1–2 דקות', true);
  try {
    await triggerGarminSync(st => toast(st === 'in_progress' ? 'מושך נתונים מגרמין…' : 'הסנכרון בתור…', true));
    let data = await fetchHealthFromApi();
    if (!data) ({ data } = await loadHealthData());
    state.data = data;
    state.isDemo = false;
    $('demo-banner').classList.add('hidden');
    renderAll();
    const last = lastRow().date;
    toast(`הנתונים עודכנו · אחרון ${last ? shortDate(last) : ''}`);
  } catch (e) {
    if (e.message === 'TOKEN') { setGhToken(''); toast('הטוקן לא תקין או חסר הרשאה — הזן מחדש'); openToken(); }
    else if (e.message === 'RUN_FAILED') toast('הסנכרון בגרמין נכשל (אולי הגבלת קצב) — נסה שוב מאוחר יותר');
    else if (e.message === 'TIMEOUT') toast('הסנכרון עדיין רץ — בדוק שוב בעוד רגע');
    else toast('הסנכרון נכשל — בדוק חיבור לרשת');
  } finally {
    btn.classList.remove('spinning');
    syncing = false;
  }
}
$('sync-btn').addEventListener('click', syncNow);

/* --- מודאל טוקן הסנכרון --- */
function openToken() {
  $('token-input').value = ghToken();
  $('token-remove').classList.toggle('hidden', !ghToken());
  $('token-modal').classList.remove('hidden');
}
function closeToken() { $('token-modal').classList.add('hidden'); }
$('token-modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeToken(); });
$('token-form').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('token-input').value.trim();
  if (!t) return;
  setGhToken(t);
  closeToken();
  syncNow();
});
$('token-remove').addEventListener('click', () => { setGhToken(''); closeToken(); toast('הטוקן נמחק'); });

/* =========================================================================
 * אתחול
 * ========================================================================= */
async function init() {
  loadProfile();
  loadWeights();
  loadStrength();
  const { data, isDemo } = await loadHealthData();
  state.data = data;
  state.isDemo = isDemo;

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('demo-banner').classList.toggle('hidden', !isDemo);

  state.page = -1;
  setActive(0);
  renderAll();
  // התחלה בעמוד הבית (חשוב ב-RTL, שבו ההיסט ההתחלתי אינו בהכרח 0)
  requestAnimationFrame(() => pages[0].scrollIntoView({ inline: 'start', block: 'nearest' }));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
