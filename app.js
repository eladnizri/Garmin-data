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
      c.strokeStyle = 'rgba(43,58,51,.22)';
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

/* דרגת איכות (לצביעת המשפט) — בלי מספר, רק גוון */
function verdictLevel(score) {
  if (score >= 80) return 'good';
  if (score >= 65) return 'ok';
  if (score >= 50) return 'mid';
  return 'low';
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
    { name: 'ע׳', v: deep, cls: cls(deep, 'deep') },
    { name: 'ק׳', v: light, cls: cls(light, 'light') },
    { name: 'R', v: rem, cls: cls(rem, 'rem') },
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
      <div class="dash-note">הסנכרון היומי ימלא את הנתונים.</div></div>
      <div class="sec-title" style="margin-top:18px">מדדים</div><div class="dash-rings">${minis}</div>`;
    animateRings(el);
    return;
  }

  // --- מרכז: אבחון איכותי (בלי מספר — כדי לא להעמיס פסיכולוגית) ---
  const level = latest('readiness_level', 2);
  const feedbackTok = latest('readiness_feedback', 2);
  const feedback = feedbackTok ? READINESS_FEEDBACK[feedbackTok] : null;
  const note = feedback
    || (official !== null && level ? `רמת מוכנות לפי גרמין: ${READINESS_LEVEL[level] || level}` : '');

  el.innerHTML = `
    <div class="dash-center">
      <div class="dash-greet">${dateLine}</div>
      <div class="dash-verdict lvl-${verdictLevel(score)}">${verdictOf(score)}</div>
      ${note ? `<div class="dash-note">${note}</div>` : ''}
    </div>
    <div class="sec-title" style="margin-top:18px">מדדים</div>
    <div class="dash-rings">${minis}</div>`;

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
    rtl: true, textDirection: 'rtl', backgroundColor: '#2f3d35', titleColor: '#ffffff',
    bodyColor: 'rgba(255,255,255,.82)', borderColor: 'transparent', borderWidth: 0, padding: 10,
    cornerRadius: 10, boxPadding: 4, titleFont: { weight: '700' },
    // קווים גזורים (ממוצע נע, יעד, טווח) חוזרים על מה שהנקודות כבר אומרות
    filter: i => !['ממוצע 7 ימים', 'יעד', 'טווח מאוזן'].includes(i.dataset.label)
      && !/^מגמת /.test(i.dataset.label),
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
 * ניתוח שלבי השינה — למה חריגה משפיעה ואיך לשפר (מתחת לגרף השלבים)
 * ========================================================================= */
const STAGE_TEXT = {
  deep: {
    name: 'שינה עמוקה',
    lowImpact: 'שינה עמוקה משקמת את הגוף — מחסור בה פוגע בהתאוששות הפיזית, במערכת החיסון ובתחושת הרעננות בבוקר.',
    lowImprove: 'חדר קריר וחשוך, הימנעות מאלכוהול ומארוחה כבדה בערב, ופעילות גופנית במהלך היום — כולם מגבירים שינה עמוקה.',
  },
  rem: {
    name: 'שנת REM',
    lowImpact: 'שנת REM חיונית לזיכרון, ללמידה ולוויסות רגשי — מחסור בה משפיע על ריכוז ועל מצב הרוח.',
    lowImprove: 'שעת שינה קבועה, שינה מספקת (7–8 שעות) והימנעות מאלכוהול — מאריכים את מחזורי ה-REM לפנות בוקר.',
  },
  light: {
    name: 'שינה קלה',
    highImpact: 'חלק גבוה מדי של שינה קלה מעיד על שינה מקוטעת — פחות שינה עמוקה ו-REM, ולכן פחות שיקום למרות הזמן במיטה.',
    highImprove: 'שגרת ערב רגועה, פחות קפאין אחרי הצהריים וסביבת שינה שקטה — מפחיתים יקיצות ומעמיקים את השינה.',
    lowImpact: 'חלק נמוך מהרגיל של שינה קלה — בדרך כלל לא מדאיג, אך שווה מעקב אם הוא מלווה בעייפות.',
    lowImprove: 'שמור על עקביות בשעות השינה.',
  },
};
function stageEntry(stage, dir, sev) {
  const t = STAGE_TEXT[stage];
  return {
    sev, name: t.name,
    headline: dir === 'low' ? 'מתחת לטווח הבריא' : 'גבוהה מהטווח הבריא',
    impact: dir === 'low' ? t.lowImpact : t.highImpact,
    improve: dir === 'low' ? t.lowImprove : t.highImprove,
  };
}
function renderSleepAnalysis() {
  const el = $('stages-analysis');
  const deep = latest('deep_min', 5), light = latest('light_min', 5), rem = latest('rem_min', 5);
  if (deep == null && light == null && rem == null) { el.innerHTML = ''; return; }
  const total = (deep || 0) + (light || 0) + (rem || 0) || 1;
  const pct = v => v / total * 100;
  const items = [];
  if (deep != null && pct(deep) < 15) items.push(stageEntry('deep', 'low', pct(deep) < 10 ? 'alert' : 'watch'));
  if (rem != null && pct(rem) < 18) items.push(stageEntry('rem', 'low', pct(rem) < 13 ? 'alert' : 'watch'));
  if (light != null) {
    const p = pct(light);
    if (p > 65) items.push(stageEntry('light', 'high', p > 72 ? 'alert' : 'watch'));
    else if (p < 45) items.push(stageEntry('light', 'low', p < 40 ? 'alert' : 'watch'));
  }
  if (!items.length) {
    el.innerHTML = `<div class="anom ok"><span class="anom-ic">${icon('check', 17)}</span>
      <span>חלוקת שלבי השינה שלך <b>מאוזנת</b> — עמוקה, קלה ו-REM בטווח הבריא.</span></div>`;
    return;
  }
  el.innerHTML = `<article class="card"><div class="card-head"><h2>ניתוח שלבי השינה</h2>
    <span class="unit">מהלילה האחרון</span></div>
    ${items.map(it => `<div class="sa-item ${it.sev}">
      <div class="sa-head"><span class="sa-dot"></span><b>${it.name}</b> — ${it.headline}</div>
      <div class="sa-row"><span class="sa-k">למה זה משפיע</span><p>${it.impact}</p></div>
      <div class="sa-row"><span class="sa-k">איך לשפר</span><p>${it.improve}</p></div>
    </div>`).join('')}</article>`;
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
  // רצפת התאריך של הכרטיס: ב"הכל" אין רצפה, אחרת התאריך המוקדם ביותר שמוצג
  const fromISO = state.range === 'all' ? '0000-00-00' : (rows.length ? rows[0].date : '0000-00-00');
  const all = [];
  for (const r of rows) for (const w of (r.workouts || [])) all.push({ ...w, date: r.date, src: 'garmin' });
  // אימוני הכוח שדווחו ידנית — באותו טווח תאריכים שמסונן בכרטיס
  for (const s of (sessions || [])) {
    if (s.date < fromISO) continue;
    all.push({ src: 'manual', date: s.date, type: s.programName || 'אימון כוח',
      exCount: (s.entries || []).length, setCount: sessionStats(s).sets });
  }
  if (!all.length) { el.innerHTML = ''; return; }
  all.sort((a, b) => a.date.localeCompare(b.date));
  const recent = all.slice(-8).reverse();
  const totalMin = all.reduce((a, w) => a + (w.minutes || 0), 0);
  const items = recent.map(w => {
    if (w.src === 'manual') {
      return `<li><span class="r-ic">${icon('dumbbell', 18)}</span>
        <span><span class="r-name">${w.type}<span class="r-tag">ידני</span></span><br>
        <span class="r-sub">${shortDate(w.date)} · ${w.exCount} תרגילים</span></span>
        <span class="r-val">${w.setCount}<small>סטים</small></span></li>`;
    }
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
 * ניתוח ריצות — סיווג לפי אזור מאמץ, השוואה בין ריצות, וגרף שיפור.
 * הסיווג נשען על הדופק הממוצע מול אזורי Karvonen האישיים; אינטרוולים
 * אי-אפשר לגזור מדופק ממוצע (הם ממוצעים כמו טמפו) ולכן מתויגים ידנית.
 * ========================================================================= */
const RUN_TAGS_KEY = 'run_tags_v1';
let runTags = {};
function loadRunTags() {
  try { runTags = JSON.parse(localStorage.getItem(RUN_TAGS_KEY)) || {}; } catch { runTags = {}; }
  if (typeof runTags !== 'object' || !runTags) runTags = {};
}
function saveRunTags() { try { localStorage.setItem(RUN_TAGS_KEY, JSON.stringify(runTags)); } catch {} }
/* מזהה יציב לריצה — אין activityId בנתונים, אז תאריך + סדר ביום */
const runId = (date, i) => `${date}#${i}`;

/* --- ריצות היסטוריות מייצוא הבריאות של האייפון ---
 * הן חיות מחוץ ל-health.json בכוונה: הן מכסות רק ימי ריצה מפוזרים, ואם היו
 * נכנסות כשורות רגילות כל גרפי השינה והלב היו נמתחים על שנים עם ימים ריקים.
 * שני מקורות — data/runs_history.json שנשמר בריפו (זמין בכל מכשיר), ו-
 * localStorage מייבוא שנעשה בטלפון עצמו. */
const RUN_HIST_KEY = 'runs_history_v1';
const RUN_HIST_URL = 'data/runs_history.json';
let runHistLocal = [], runHistRepo = [];

function loadRunHistory() {
  try { runHistLocal = JSON.parse(localStorage.getItem(RUN_HIST_KEY)) || []; } catch { runHistLocal = []; }
  if (!Array.isArray(runHistLocal)) runHistLocal = [];
}
function saveRunHistory() { try { localStorage.setItem(RUN_HIST_KEY, JSON.stringify(runHistLocal)); } catch {} }

async function fetchRunHistory() {
  try {
    const res = await fetch(`${RUN_HIST_URL}?t=${Date.now()}`);
    if (!res.ok) return;                       // הקובץ אופציונלי — אין ייבוא, אין בעיה
    const rows = await res.json();
    if (Array.isArray(rows)) runHistRepo = rows.filter(r => r && r.date && r.km && r.minutes);
  } catch { /* ריצה מקומית בלי הקובץ, או אין רשת */ }
}

/* איחוד שני המקורות, בלי כפילויות, בסכמה של אימון רגיל */
function historyRuns() {
  const seen = new Set(), out = [];
  for (const r of [...runHistRepo, ...runHistLocal]) {
    if (!r?.date || !r.km || !r.minutes) continue;
    const key = `${r.date}|${Math.round(r.km * 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, type: 'ריצה', type_key: 'running' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ימים שכבר יש בהם ריצה מהגרמין — הגרמין תמיד מנצח, הוא מפורט יותר */
function garminRunDates() {
  const s = new Set();
  for (const row of state.data)
    for (const w of (row.workouts || [])) if (w.type_key === 'running') s.add(row.date);
  return s;
}

const RUN_TYPES = {
  intervals: { label: 'אינטרוולים', color: C.red },
  tempo:     { label: 'טמפו',       color: C.orange },
  volume:    { label: 'נפח',        color: C.blue },
  easy:      { label: 'קלה',        color: C.green },
};
const RUN_ORDER = ['intervals', 'tempo', 'volume', 'easy'];

/* ספי הסיווג — ניתנים לכוונון בהגדרות, כי מה שנחשב "טמפו" משתנה מרץ לרץ.
 * tempoPct הוא אחוז מרזרבת הדופק (Karvonen), לא מהדופק המקסימלי. */
const RUN_RULES_DEFAULT = { tempoPct: 70, volumeKm: 3, intervalSpread: 0 };
const runRules = () => ({
  tempoPct: profile.runTempoPct || RUN_RULES_DEFAULT.tempoPct,
  volumeKm: profile.runVolumeKm || RUN_RULES_DEFAULT.volumeKm,
  intervalSpread: profile.runIntervalSpread || RUN_RULES_DEFAULT.intervalSpread,
  maxHr: maxHR(),
});

/* עוצמת המאמץ באחוזים מרזרבת הדופק. נופל לאחוז מהדופק המקסימלי
 * כשאין דופק מנוחה — פחות מדויק, אבל עדיף על כלום. */
function runIntensity(bpm, mh = maxHR()) {
  if (!mh || !bpm) return null;
  const rest = Math.round(baselineOf('rhr')?.mean ?? latest('rhr') ?? 0) || null;
  return rest ? (bpm - rest) / (mh - rest) * 100 : bpm / mh * 100;
}
/* אזור מאמץ (1–5) — אותו חישוב שמוצג בכרטיס אזורי הדופק */
function hrZoneOf(bpm) {
  const pct = runIntensity(bpm);
  if (pct === null) return null;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}

/* סדר ההכרעה: תיוג ידני ← פער דופק ← עוצמה ← מרחק ← קלה */
function classifyRun(r, rules = runRules()) {
  if (runTags[r.id] === 'intervals') return 'intervals';
  // באינטרוולים הדופק מזנק ונופל, ולכן הפער בין המקסימלי לממוצע גדול
  if (rules.intervalSpread && r.max_hr && r.avg_hr
      && r.max_hr - r.avg_hr >= rules.intervalSpread) return 'intervals';
  const pct = runIntensity(r.avg_hr, rules.maxHr);
  if (pct !== null && pct >= rules.tempoPct) return 'tempo';
  return (r.km || 0) >= rules.volumeKm ? 'volume' : 'easy';
}

/* יעילות אירובית — מטרים לדקה לכל פעימה. עולה = משתפר. */
function runEff(r) {
  if (!r.km || !r.minutes || !r.avg_hr) return null;
  return (r.km * 1000 / r.minutes) / r.avg_hr;
}
/* קצב בשניות לק״מ — מהגרמין אם קיים, אחרת מחושב ממרחק וזמן */
function runPace(r) {
  if (r.pace_s) return r.pace_s;
  if (r.km && r.minutes) return Math.round(r.minutes * 60 / r.km);
  return null;
}
const paceTxt = s => s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/* תאריך ריצה — שאר האפליקציה מציגה חודשיים אחורה ולכן d.m מספיק לה, אבל
 * היסטוריית הריצות נמתחת על שנתיים ובלי השנה "4.9" הוא דו־משמעי */
function runDate(iso) {
  const y = iso.slice(0, 4);
  return y === todayISO().slice(0, 4) ? shortDate(iso) : `${shortDate(iso)}.${y.slice(2)}`;
}
const runLongDate = iso => `יום ${DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()]}, ${runDate(iso)}`;

/* כל הריצות בטווח המוצג, הישן→חדש, עם סיווג ומדדים גזורים */
function runsInRange() {
  const rows = visibleRows();
  const out = [];
  for (const row of rows) {
    (row.workouts || []).forEach((w, i) => {
      if (w.type_key !== 'running') return;
      out.push({ ...w, date: row.date, id: runId(row.date, i) });
    });
  }
  // הריצות המיובאות קודמות לחלון של הגרמין, ולכן נכנסות רק כשמציגים את הכל
  const from = state.range === 'all' ? '0000-00-00' : (rows[0]?.date || '9999-99-99');
  const taken = garminRunDates();
  historyRuns().forEach(h => {
    if (h.date < from || taken.has(h.date)) return;
    out.push({ ...h, id: `apple#${h.date}#${Math.round(h.km * 10)}` });
  });
  out.sort((a, b) => a.date.localeCompare(b.date));
  for (const r of out) {
    r.pace = runPace(r); r.eff = runEff(r); r.kind = classifyRun(r);
    r.real = isRealRun(r);
  }
  return out;
}

/* חימומים, ריצות שנקטעו והליכות שנרשמו כריצה מעוותות כל ממוצע וכל מגמה.
 * הן נשארות ברשימת ההיסטוריה, מעומעמות, אבל אינן נכנסות לניתוח. */
const RUN_MIN_KM = 1, RUN_MAX_PACE = 480;   // 8:00 דק׳/ק״מ
const isRealRun = r => (r.km || 0) >= RUN_MIN_KM && r.pace != null && r.pace <= RUN_MAX_PACE;

const RUN_HIST_SHOWN = 15;   // כמה ריצות נפרשות לפני "הצגת נוספות"
let runHistOpen = false;
let runChartKind = 'all';    // מסנן סוג הריצה בגרף ההשתפרות

function goalRunKm() { return profile.runGoalKm ? Number(profile.runGoalKm) : null; }
function goalRunPace() { return profile.runGoalPace ? Number(profile.runGoalPace) : null; }

/* כל הריצות שקיימות, בלי תלות בטווח המוצג — בסיס לתצוגה המקדימה בהגדרות.
 * בלי kind: הוא נקבע שם מול ספים שהמשתמש עוד מקליד. */
function allRuns() {
  const out = [];
  for (const row of state.data)
    (row.workouts || []).forEach((w, i) => {
      if (w.type_key === 'running') out.push({ ...w, date: row.date, id: runId(row.date, i) });
    });
  const taken = garminRunDates();
  for (const h of historyRuns())
    if (!taken.has(h.date)) out.push({ ...h, id: `apple#${h.date}#${Math.round(h.km * 10)}` });
  for (const r of out) { r.pace = runPace(r); r.real = isRealRun(r); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* כמה ריצות יש בכלל, בלי קשר לטווח המוצג */
function totalRunCount() {
  let n = 0;
  for (const row of state.data) for (const w of (row.workouts || [])) if (w.type_key === 'running') n++;
  const taken = garminRunDates();
  for (const h of historyRuns()) if (!taken.has(h.date)) n++;
  return n;
}

function renderRuns() {
  const el = $('runs-card');
  const runs = runsInRange();
  if (!runs.length) {
    // הכרטיס לא נעלם כשאין ריצות בטווח — אחרת אי אפשר לדעת שהוא בכלל קיים
    const total = totalRunCount();
    el.innerHTML = `<article class="card">
      <div class="card-head"><h2>ריצות</h2></div>
      <p class="tr-empty">${total
        ? `אין ריצות בטווח הזמן שנבחר. יש <b>${total}</b> ריצות מוקדמות יותר —
           החלף ל"הכל" בסרגל העליון כדי לראות אותן.`
        : `ריצות שתתעד בגרמין יופיעו כאן — מסווגות לפי אזור מאמץ, עם השוואה בין ריצות וגרף השתפרות.
           אפשר גם לייבא ריצות עבר מייצוא הבריאות של האייפון, דרך כרטיס הפרופיל.`}</p>
      ${total ? '<button class="btn-primary tr-wide" id="runs-see-all">הצג את כל התקופה</button>' : ''}
    </article>`;
    return;
  }

  // הניתוח כולו נשען רק על ריצות אמיתיות; החריגות נשארות ברשימה בלבד
  const real = runs.filter(r => r.real);
  const skipped = runs.length - real.length;
  if (!real.length) {
    el.innerHTML = `<article class="card">
      <div class="card-head"><h2>ריצות</h2></div>
      <p class="tr-empty">${runs.length} רשומות בטווח, אבל כולן קצרות מ-${RUN_MIN_KM} ק״מ
        או איטיות מ-${paceTxt(RUN_MAX_PACE)} דק׳/ק״מ — ולכן אינן נכנסות לניתוח.</p>
    </article>`;
    return;
  }

  const last = real[real.length - 1];
  const prevSame = real.slice(0, -1).reverse().find(r => r.kind === last.kind);
  const t = RUN_TYPES[last.kind];

  // התפלגות לפי סוג — האיזון שהאימון נשען עליו
  const counts = {};
  for (const k of RUN_ORDER) counts[k] = real.filter(r => r.kind === k).length;
  const chips = RUN_ORDER.filter(k => counts[k]).map(k =>
    `<span class="run-chip" style="--rc:${RUN_TYPES[k].color}">${RUN_TYPES[k].label}<b>${counts[k]}</b></span>`).join('');

  // השוואה לריצה הקודמת מאותו סוג — זו ההשוואה שמלמדת משהו
  let cmp = '';
  if (prevSame) {
    const bits = [];
    if (last.pace && prevSame.pace) {
      const d = last.pace - prevSame.pace;
      bits.push(Math.abs(d) < 3 ? 'קצב זהה'
        : `קצב ${d < 0 ? 'מהיר' : 'איטי'} ב-${paceTxt(Math.abs(d))} דק׳/ק״מ`);
    }
    if (last.avg_hr && prevSame.avg_hr) {
      const d = last.avg_hr - prevSame.avg_hr;
      if (Math.abs(d) >= 2) bits.push(`דופק ${d < 0 ? 'נמוך' : 'גבוה'} ב-${Math.abs(d)}`);
    }
    if (bits.length) cmp = `<p class="run-cmp">מול ה${t.label} הקודמת (${runDate(prevSame.date)}): ${bits.join(' · ')}.</p>`;
  }

  // יעדים
  const gKm = goalRunKm(), gPace = goalRunPace();
  const weekKm = real.filter(r => r.date >= weekStartISO(new Date(todayISO()))).reduce((a, r) => a + (r.km || 0), 0);
  let goals = '';
  if (gKm) {
    const pct = Math.min(100, weekKm / gKm * 100);
    goals += `<div class="run-goal"><div class="rg-top"><span>נפח השבוע</span>
      <b>${fmt(weekKm, 1)} / ${fmt(gKm, 1)} ק״מ</b></div>
      <div class="rg-bar"><i style="width:${pct}%"></i></div></div>`;
  }
  if (gPace && last.pace) {
    const d = last.pace - gPace;
    goals += `<p class="run-cmp">יעד קצב ${paceTxt(gPace)} — הריצה האחרונה ${Math.abs(d) < 3
      ? 'בדיוק על היעד' : `${paceTxt(Math.abs(d))} ${d < 0 ? 'מתחת ליעד' : 'מעל היעד'}`}.</p>`;
  }

  // הייבוא מהאייפון מביא שנתיים של ריצות — רשימה מלאה תהפוך את הכרטיס לאינסופי
  const ordered = runs.slice().reverse();
  const shown = runHistOpen ? ordered : ordered.slice(0, RUN_HIST_SHOWN);
  const hidden = ordered.length - shown.length;

  const bits = [];
  if (last.km) bits.push(`${fmt(last.km, 2)} ק״מ`);
  if (last.pace) bits.push(`${paceTxt(last.pace)} דק׳/ק״מ`);
  if (last.avg_hr) bits.push(`דופק ${last.avg_hr}`);
  if (last.cadence) bits.push(`${last.cadence} צע׳/דק׳`);
  if (last.elev_gain) bits.push(`${last.elev_gain} מ׳ עלייה`);

  // מסנן הסוג — יעילות של טמפו ושל ריצה קלה אינן בנות־השוואה זו לזו
  const kindsPresent = RUN_ORDER.filter(k => counts[k] >= 2);
  // החלפת טווח יכולה להשאיר בחירה שכבר אין לה ריצות — חוזרים ל"הכל"
  if (runChartKind !== 'all' && !kindsPresent.includes(runChartKind)) runChartKind = 'all';
  const kindFilter = kindsPresent.length > 1
    ? `<div class="run-kinds">${['all', ...kindsPresent].map(k =>
        `<button class="rk-btn${k === runChartKind ? ' active' : ''}" data-kind="${k}"
          ${k === 'all' ? '' : `style="--rc:${RUN_TYPES[k].color}"`}>${k === 'all' ? 'הכל' : RUN_TYPES[k].label}</button>`).join('')}</div>`
    : '';

  el.innerHTML = `<article class="card">
    <div class="card-head"><h2>ריצות</h2>
      <span class="unit">${real.length} ריצות בתקופה</span></div>

    <div class="run-last">
      <div class="rl-top"><span class="run-badge" style="--rc:${t.color}">${t.label}</span>
        <span class="rl-date">${runLongDate(last.date)}</span></div>
      <div class="rl-bits">${bits.join(' · ')}</div>
    </div>
    ${cmp}${goals}

    <div class="run-chips">${chips}</div>

    <div class="tr-sec">
      <div class="tr-sec-head"><h3>גרף השתפרות</h3></div>
      ${kindFilter}
      <div class="legend" id="legend-runs"></div>
      <div class="chart-wrap chart-sm" dir="ltr"><canvas id="chart-runs"></canvas></div>
      <p class="tr-note" id="run-note"></p>
    </div>

    ${monthlyVolumeSection(real)}

    <div class="tr-sec"><h3>היסטוריית ריצות</h3>
      <p class="run-hint">לחיצה על ריצה מסמנת אותה כאינטרוולים ובחזרה.</p>
      <div class="tr-hist">${shown.map(r => {
        const rt = RUN_TYPES[r.kind];
        return `<button class="tr-row run-row${r.real ? '' : ' run-skipped'}" data-run="${r.id}"
          ${r.real ? '' : 'title="קצרה או איטית מדי — לא נכנסת לניתוח"'}>
          <span class="tr-d">${runDate(r.date)}</span>
          <span class="run-dot" style="background:${rt.color}"></span>
          <span class="tr-nm">${rt.label}</span>
          <span class="tr-v">${r.km ? fmt(r.km, 2) + ' ק״מ' : ''}${r.pace ? ' · ' + paceTxt(r.pace) : ''}</span>
        </button>`;
      }).join('')}</div>
      ${hidden > 0 ? `<button class="btn-ghost tr-wide" id="runs-more">הצגת ${hidden} ריצות נוספות</button>` : ''}
      ${skipped ? `<p class="run-hint">${skipped} רשומות מעומעמות — קצרות מ-${RUN_MIN_KM} ק״מ
        או איטיות מ-${paceTxt(RUN_MAX_PACE)}, ולכן מחוץ לניתוח.</p>` : ''}
    </div>
  </article>`;
  renderRunChart(real);
  renderRunVolume(real);
}

/* --- נפח חודשי --- */
const monthKey = iso => iso.slice(0, 7);
const monthLabel = ym => `${+ym.slice(5)}/${ym.slice(2, 4)}`;

/* ק״מ לחודש, כולל חודשים ריקים באמצע — בלעדיהם תקופת הפסקה נראית כרצף */
function monthlyKm(real) {
  if (!real.length) return [];
  const sum = new Map();
  for (const r of real) sum.set(monthKey(r.date), (sum.get(monthKey(r.date)) || 0) + r.km);
  const out = [];
  const [y0, m0] = monthKey(real[0].date).split('-').map(Number);
  const [y1, m1] = monthKey(real[real.length - 1].date).split('-').map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (m = 1, y++) : m++) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ ym, km: sum.get(ym) || 0 });
  }
  return out;
}

function monthlyVolumeSection(real) {
  if (monthlyKm(real).length < 2) return '';
  return `<div class="tr-sec">
    <div class="tr-sec-head"><h3>נפח חודשי</h3></div>
    <div class="chart-wrap chart-xs" dir="ltr"><canvas id="chart-run-volume"></canvas></div>
    <p class="tr-note" id="run-vol-note"></p>
  </div>`;
}

function renderRunVolume(real) {
  if (!$('chart-run-volume')) return;
  const months = monthlyKm(real).slice(-12);
  const note = $('run-vol-note');
  if (note) {
    const active = months.filter(m => m.km > 0);
    const mean = active.length ? active.reduce((a, m) => a + m.km, 0) / active.length : 0;
    const best = months.reduce((a, m) => m.km > a.km ? m : a, months[0]);
    note.innerHTML = `ממוצע <b>${fmt(mean, 1)}</b> ק״מ בחודש פעיל · השיא
      ${fmt(best.km, 1)} ק״מ ב-${monthLabel(best.ym)}${months.some(m => !m.km)
        ? ` · ${months.filter(m => !m.km).length} חודשים ללא ריצה` : ''}.`;
  }
  make('chart-run-volume', {
    type: 'bar',
    data: {
      labels: months.map(m => monthLabel(m.ym)),
      datasets: [{
        data: months.map(m => +m.km.toFixed(1)),
        backgroundColor: months.map(m => m.km ? C.blue : 'rgba(0,0,0,.06)'),
        borderRadius: 4, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: chartAnim ? undefined : false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.parsed.y} ק״מ` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => `${v}` }, grid: { color: C.grid }, border: { display: false } },
      },
    },
  });
}

function renderRunChart(runs) {
  const note = $('run-note');
  const wrap = $('chart-runs')?.closest('.chart-wrap');
  const leg = $('legend-runs');
  const kinds = $('runs-card')?.querySelector('.run-kinds');
  let pts = runs.filter(r => r.eff != null && r.pace != null);
  if (runChartKind !== 'all') pts = pts.filter(r => r.kind === runChartKind);
  if (pts.length < 2) {
    if (kinds) kinds.style.display = '';
    charts['chart-runs']?.destroy(); delete charts['chart-runs'];
    if (wrap) wrap.style.display = 'none';
    if (leg) leg.style.display = 'none';
    if (note) note.textContent = pts.length === 1
      ? 'ריצה אחת עם נתוני קצב ודופק — הגרף יופיע אחרי השנייה.'
      : runChartKind === 'all'
        ? 'צריך קצב ודופק משתי ריצות לפחות כדי לשרטט מגמה.'
        : `אין מספיק ריצות מסוג ${RUN_TYPES[runChartKind].label} כדי לשרטט מגמה.`;
    return;
  }
  if (wrap) wrap.style.display = '';
  if (leg) leg.style.display = '';
  if (kinds) kinds.style.display = '';

  // ממוצע נע — הקו שמראה את המגמה מעל ענן הריצות הבודדות.
  // חלון רחב יותר ככל שיש יותר ריצות, אחרת הקו רועש כמעט כמו הנקודות.
  const win = pts.length >= 40 ? 9 : pts.length >= 24 ? 7 : pts.length >= 12 ? 5 : pts.length >= 6 ? 3 : 1;

  /* השוואה בין קצוות המגמה ולא בין שתי ריצות בודדות — ריצה חריגה אחת
   * בקצה הפכה את הסימן של אחוז השיפור */
  const edge = Math.min(5, Math.floor(pts.length / 2));
  const mean = a => a.reduce((s, r) => s + r.eff, 0) / a.length;
  const effA = mean(pts.slice(0, edge)), effB = mean(pts.slice(-edge));
  const dEff = (effB - effA) / effA * 100;
  const span = `${runDate(pts[0].date)}–${runDate(pts[pts.length - 1].date)}`;
  if (note) {
    const scope = runChartKind === 'all' ? '' : ` בריצות ${RUN_TYPES[runChartKind].label}`;
    note.innerHTML = (Math.abs(dEff) < 2
      ? `היעילות האירובית${scope} יציבה לאורך ${span}.`
      : `היעילות האירובית${scope} ${dEff > 0 ? 'עלתה' : 'ירדה'} ב-<b>${fmt(Math.abs(dEff), 1)}%</b>
         לאורך ${span} — ${dEff > 0 ? 'יותר' : 'פחות'} קצב לאותו מאמץ.`)
      + `<small>הושווה ממוצע ${edge} הריצות בכל קצה, לא ריצה בודדת${
          win > 1 ? `. הקו העבה הוא ממוצע נע של ${win} ריצות` : ''}.</small>`;
  }
  legend('legend-runs', [[C.violet, 'יעילות אירובית'], [C.teal, 'קצב']]);
  const gPace = goalRunPace();
  const labels = pts.map(r => runDate(r.date));
  const roll = key => pts.map((_, i) => {
    const from = Math.max(0, i - win + 1);
    const slice = pts.slice(from, i + 1);
    return slice.reduce((s, r) => s + r[key], 0) / slice.length;
  });
  const effMa = roll('eff'), paceMa = roll('pace');
  const faint = win > 1;   // בלי החלקה אין טעם להנמיך את הנקודות עצמן

  const cloud = (label, key, color, axis) => ({
    label, yAxisID: axis, showLine: !faint,
    data: pts.map((r, i) => ({ x: labels[i], y: key === 'eff' ? +r.eff.toFixed(2) : r.pace, iso: r.date })),
    borderColor: faint ? color + '55' : color, borderWidth: faint ? 0 : 2.2,
    pointRadius: faint ? 2 : 3, pointBackgroundColor: faint ? color + '66' : color,
    pointBorderWidth: 0, tension: .3, fill: false,
  });
  const trend = (label, data, color, axis, dash) => ({
    label, yAxisID: axis, data: data.map((y, i) => ({ x: labels[i], y: +y.toFixed(2), iso: pts[i].date })),
    borderColor: color, borderWidth: 2.6, pointRadius: 0, tension: .35, fill: false,
    borderDash: dash || undefined,
  });

  const ds = [cloud('יעילות אירובית', 'eff', C.violet, 'y'), cloud('קצב', 'pace', C.teal, 'y1')];
  if (faint) ds.push(trend('מגמת יעילות', effMa, C.violet, 'y'),
                     trend('מגמת קצב', paceMa, C.teal, 'y1', [5, 4]));
  if (gPace) ds.push({ label: 'יעד', data: labels.map((x, i) => ({ x, y: gPace, iso: pts[i].date })),
    borderColor: C.ma, borderWidth: 1.5, borderDash: [6, 5], pointRadius: 0, fill: false, yAxisID: 'y1' });

  make('chart-runs', {
    type: 'line',
    data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: chartAnim ? undefined : false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false },
        tooltip: TT(i => i.dataset.label === 'קצב' || i.dataset.label === 'יעד'
          ? `${i.dataset.label}: ${paceTxt(i.raw.y)} דק׳/ק״מ` : `יעילות: ${fmt(i.raw.y, 2)}`) },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { position: 'left', grid: { color: C.grid }, border: { display: false },
             ticks: { color: C.violet, font: { size: 10 }, maxTicksLimit: 5 } },
        // ציר הקצב הפוך — קצב נמוך הוא טוב, וכך שני הקווים עולים כשמשתפרים
        y1: { position: 'right', reverse: true, grid: { display: false }, border: { display: false },
              ticks: { color: C.teal, font: { size: 10 }, maxTicksLimit: 4, callback: v => paceTxt(v) } },
      },
    },
  });
}

$('runs-card').addEventListener('click', e => {
  if (e.target.closest('#runs-see-all')) {
    state.range = 'all';
    chartAnim = false; renderAll(); chartAnim = true;
    return;
  }
  if (e.target.closest('#runs-more')) {
    runHistOpen = true;
    chartAnim = false; renderRuns(); chartAnim = true;
    return;
  }
  const kb = e.target.closest('.rk-btn');
  if (kb) {
    runChartKind = kb.dataset.kind;
    haptic(6); renderRuns();
    return;
  }
  const row = e.target.closest('[data-run]');
  if (!row) return;
  const id = row.dataset.run;
  if (runTags[id] === 'intervals') delete runTags[id]; else runTags[id] = 'intervals';
  saveRunTags(); haptic(8);
  renderRuns(); renderActivityRec();
});

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
/* כיוון טוב/רע לשינוי משקל — נקבע לפי יעד המשקל של המשתמש, לא לפי הנחה
 * ש״ירידה = טוב״. עלייה לכיוון היעד = טוב (ירוק); התרחקות = רע (אדום).
 * מחזיר 'good' | 'bad' | null (נייטרלי כשאין יעד או שכבר על היעד). */
function weightDir(diff, fromKg) {
  const goal = profile.weightGoal ? Number(profile.weightGoal) : null;
  if (!goal || fromKg == null) return null;
  const need = goal - fromKg;              // לאן צריך לזוז מהנקודה הקודמת
  if (Math.abs(need) < 0.1) return null;   // כבר על היעד — בלי צביעה
  return (diff > 0) === (need > 0) ? 'good' : 'bad';
}
function deltaChip(label, from) {
  if (!from) return '';
  const diff = latestWeight().kg - from.kg;
  if (Math.abs(diff) < 0.05) return `<span class="wd-chip">${label}: ללא שינוי</span>`;
  const arrow = diff > 0 ? '▲' : '▼';
  const dir = weightDir(diff, from.kg);    // 'good' | 'bad' | null
  const cls = dir ? ` ${dir}` : '';
  return `<span class="wd-chip${cls}">${label}: <b>${arrow} ${fmt(Math.abs(diff), 1)} ק״ג</b></span>`;
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
 * ניתוח אימון — תוכניות, מצב אימון, ומעקב progressive overload.
 * הכול מקומי (localStorage): התוכניות, יומן האימונים, והאימון הפעיל.
 * המפתח לניתוח הוא *שם* התרגיל ולא המזהה, כדי שההיסטוריה תשרוד עריכת תוכנית.
 * ========================================================================= */
const PROGRAMS_KEY = 'strength_programs_v1';
const SESSIONS_KEY = 'strength_sessions_v1';
const ACTIVE_KEY = 'strength_active_v1';
const STEP_KG = 2.5;        // קפיצת המשקל בכפתורי ±
const OVERLOAD_N = 2;       // אימונים מושלמים ברצף לפני הצעת העלאה
const COVER_DAYS = 7;       // חלון מתגלגל לבדיקת כיסוי קבוצות השרירים

/* קבוצות השרירים — ברזולוציה שמתאימה לאימון פול-באדי */
const MUSCLES = {
  chest: 'חזה', back: 'גב', legs: 'רגליים',
  shoulders: 'כתפיים', arms: 'ידיים', core: 'ליבה',
};
const MUSCLE_KEYS = Object.keys(MUSCLES);

/* ניחוש קבוצת השריר משם התרגיל — רק כברירת מחדל, תמיד ניתן לעריכה.
 * הסדר משמעותי: כלל ספציפי חייב להיבדק לפני כלל כללי שעלול לבלוע אותו. */
const MUSCLE_GUESS = [
  { re: /פלאנק|plank|בטן|crunch|קראנצ|ליבה|core|רוסי|russian|לג ?רייז|leg ?raise/i, p: 'core', s: [] },
  { re: /חזה|bench|פרפר|fly|שכיבות סמיכה|push[\s-]?up|מקבילים|dip/i, p: 'chest', s: ['arms', 'shoulders'] },
  { re: /כתף|כתפיים|shoulder|הרמות צד|lateral|מיליטרי|military|ארנולד|arnold/i, p: 'shoulders', s: ['arms'] },
  { re: /דדליפט|deadlift|מתים/i, p: 'back', s: ['legs', 'core'] },
  { re: /מתח|pull[\s-]?up|chin[\s-]?up|חתיר|row|פולי|lat|משיכ|גב/i, p: 'back', s: ['arms'] },
  { re: /סקוואט|squat|רגל|לאנג|lunge|מכרע|ירך|ישבן|glute|תאומים|שוק|calf|hip ?thrust/i, p: 'legs', s: ['core'] },
  { re: /ביספס|בייספס|bicep|טרייספס|טריצפס|tricep|מרפק|curl|hammer|יד קדמית|יד אחורית|ידיים/i, p: 'arms', s: [] },
];
function guessMuscles(name) {
  for (const g of MUSCLE_GUESS) if (g.re.test(name || '')) return { primary: g.p, secondary: g.s.slice() };
  return { primary: '', secondary: [] };
}
/* תרגילים שנשמרו לפני שהיו קבוצות שרירים — משלימים בניחוש בטעינה */
function fillMuscles(ex) {
  if (!ex.primary && !(ex.secondary || []).length) Object.assign(ex, guessMuscles(ex.name));
  if (!Array.isArray(ex.secondary)) ex.secondary = [];
  return ex;
}

let programs = [], sessions = [], active = null;

const uid = () => Math.random().toString(36).slice(2, 9);
function jsonGet(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; }
}
function jsonSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

function loadTraining() {
  programs = jsonGet(PROGRAMS_KEY, []);
  sessions = jsonGet(SESSIONS_KEY, []);
  active = jsonGet(ACTIVE_KEY, null);
  if (!Array.isArray(programs)) programs = [];
  if (!Array.isArray(sessions)) sessions = [];
  for (const p of programs) for (const ex of (p.exercises || [])) fillMuscles(ex);
  for (const s of sessions) for (const e of (s.entries || [])) fillMuscles(e);
  if (active) for (const e of (active.entries || [])) fillMuscles(e);
  sessions.sort((a, b) => a.date.localeCompare(b.date));
}
const savePrograms = () => jsonSet(PROGRAMS_KEY, programs);
const saveSessions = () => jsonSet(SESSIONS_KEY, sessions);
function saveActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

/* 1RM משוער (Epley) — מאחד משקל וחזרות למספר אחד בר-השוואה בין אימונים */
function e1rm(kg, reps) { return kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0; }

/* סיכום תרגיל בתוך אימון. complete = כל הסטים בוצעו במלוא החזרות המתוכננות */
function entryStats(entry) {
  let best = 0, done = 0, full = 0;
  const sets = entry.sets || [];
  for (const s of sets) {
    if (!s.done) continue;
    done++;
    if (s.reps >= (s.pReps ?? s.reps)) full++;
    best = Math.max(best, e1rm(s.kg, s.reps));
  }
  return { best, done, planned: sets.length, complete: sets.length > 0 && full === sets.length };
}
function sessionStats(s) {
  let sets = 0;
  for (const e of (s.entries || [])) sets += entryStats(e).done;
  return { sets };
}

/* היסטוריית תרגיל ל-progressive overload. תרגיל חלופי (sub) נספר לשריר
 * אבל לא כאן — משקלים של תנועה אחרת היו מזהמים את מגמת התרגיל המתוכנן. */
function exerciseHistory(name) {
  const out = [];
  for (const s of sessions) {
    const e = (s.entries || []).find(x => x.name === name && !x.sub);
    if (!e) continue;
    const st = entryStats(e);
    if (st.done) out.push({ date: s.date, entry: e, ...st });
  }
  return out;
}
function allExerciseNames() {
  const set = new Set();
  for (const p of programs) for (const e of (p.exercises || [])) set.add(e.name);
  for (const s of sessions) for (const e of (s.entries || [])) if (!e.sub) set.add(e.name);
  return [...set];
}

/* כיסוי קבוצות השרירים בחלון מתגלגל. עבודה משנית נספרת ככיסוי (כפי שנקבע),
 * אבל נשמרת בנפרד כדי שאפשר יהיה להראות מה קיבל עבודה ישירה ומה לא. */
function muscleCoverage(days = COVER_DAYS) {
  const from = new Date(todayISO());
  from.setDate(from.getDate() - (days - 1));
  const fromISO = from.toISOString().slice(0, 10);
  const out = {};
  for (const k of MUSCLE_KEYS) out[k] = { primary: 0, secondary: 0, sets: 0 };
  for (const s of sessions) {
    if (s.date < fromISO) continue;
    for (const e of (s.entries || [])) {
      const st = entryStats(e);
      if (!st.done) continue;
      if (out[e.primary]) { out[e.primary].primary++; out[e.primary].sets += st.done; }
      for (const g of (e.secondary || [])) if (out[g] && g !== e.primary) { out[g].secondary++; out[g].sets += st.done; }
    }
  }
  return out;
}
/* מה עשית בתרגיל הזה בפעם הקודמת — מוצג במצב אימון */
function prevEntry(name) {
  const h = exerciseHistory(name);
  return h.length ? h[h.length - 1] : null;
}

/* הצעת העלאה: אותו משקל מרבי בשני האימונים האחרונים, ובשניהם כל הסטים
 * הושלמו במלוא החזרות. אז — ורק אז — הגוף מוכן לקפיצה הבאה. */
function overloadSuggestion(name) {
  const h = exerciseHistory(name);
  if (h.length < OVERLOAD_N) return null;
  const recent = h.slice(-OVERLOAD_N);
  if (!recent.every(x => x.complete)) return null;
  const tops = recent.map(x => Math.max(...x.entry.sets.filter(s => s.done).map(s => s.kg)));
  if (new Set(tops).size !== 1 || !tops[0]) return null;
  return { name, from: tops[0], to: tops[0] + STEP_KG };
}
function allSuggestions() {
  return allExerciseNames().map(overloadSuggestion).filter(Boolean);
}

/* ---------- מצב אימון ---------- */
function startWorkout(programId) {
  if (!programs.length) { openProgram(); return; }
  if (active && !confirm('יש אימון פתוח. להתחיל אימון חדש במקומו?')) { openWorkout(); return; }
  const p = programs.find(x => x.id === programId) || programs[0];
  active = {
    id: uid(), date: todayISO(), started: Date.now(),
    programId: p.id, programName: p.name, note: '', idx: 0,
    entries: (p.exercises || []).map(ex => ({
      exId: ex.id, name: ex.name, primary: ex.primary || '', secondary: (ex.secondary || []).slice(),
      sub: null, skipped: false,
      sets: (ex.sets || []).map(s => ({ pReps: s.reps, reps: s.reps, kg: s.kg, done: false })),
    })),
  };
  saveActive();
  openWorkout();
}

/* ---------- ניווט בין התרגילים ---------- */
const entryDone = e => e.sets.length > 0 && e.sets.every(s => s.done);
const entryOpen = e => !e.skipped && !entryDone(e);
/* התרגיל הפתוח הבא, במחזוריות — כך ש"החלף תרגיל" חוזר אחר כך לסדר המקורי */
function nextOpenIdx(from) {
  const n = active.entries.length;
  for (let i = 1; i <= n; i++) {
    const j = (from + i) % n;
    if (entryOpen(active.entries[j])) return j;
  }
  return -1;
}
function goToExercise(i) {
  active.idx = i; tmEdit = null; saveActive();
  snapToCard(i, true);
  renderDots();
}
/* נקרא אחרי סימון סט: אם התרגיל הושלם — מחליק אוטומטית לתרגיל הבא */
function advanceIfDone() {
  const cur = active.entries[active.idx];
  if (!cur || !entryDone(cur)) return false;
  const next = nextOpenIdx(active.idx);
  if (next < 0) return false;
  setTimeout(() => { if (active) goToExercise(next); }, 520);
  return true;
}
/* רק הנקודות — כדי לא לבנות מחדש את הכרטיסים באמצע גלילה */
function renderDots() {
  if (!active) return;
  $('tm-dots').innerHTML = active.entries.map((e, i) => {
    const cls = i === active.idx ? 'cur' : e.skipped ? 'skip' : entryDone(e) ? 'ok' : '';
    return `<button class="tm-dot ${cls}" data-go="${i}" aria-label="${e.name}"></button>`;
  }).join('');
}
/* כל הכרטיסים נמצאים ב-DOM (כדי שההחלקה תהיה גלילה טבעית), ולכן פעולות
 * הכלים חייבות לפעול על הכרטיס שנלחץ — לא על active.idx. */
function skipExercise(ei) {
  const cur = active.entries[ei];
  if (!cur) return;
  cur.skipped = true;
  cur.sets.forEach(s => { s.done = false; });
  const next = nextOpenIdx(ei);
  saveActive();
  renderWorkout();
  if (next < 0) toast('כל התרגילים טופלו'); else goToExercise(next);
}
/* תרגיל חלופי שעובד על אותם שרירים — נספר לקבוצת השריר, לא ל-overload */
function substituteExercise(ei) {
  const cur = active.entries[ei];
  if (!cur) return;
  const name = prompt('איזה תרגיל אתה מבצע במקום?', cur.sub || '');
  if (name === null) return;
  const t = name.trim();
  cur.sub = t || null;
  saveActive();
  renderWorkout();
  if (t) toast(`נרשם: ${t} — נספר ל${MUSCLES[cur.primary] || 'קבוצת השריר'}`);
}
function openWorkout() {
  if (!active) return;
  $('train-mode').classList.remove('hidden');
  document.body.classList.add('tm-open');
  renderWorkout();
}
function closeWorkout() {
  $('train-mode').classList.add('hidden');
  document.body.classList.remove('tm-open');
  tmEdit = null;
}
function discardWorkout() {
  if (!confirm('לבטל את האימון? מה שסימנת לא יישמר.')) return;
  active = null; saveActive(); closeWorkout(); renderTrain();
}
function finishWorkout() {
  if (!active) return;
  const st = sessionStats(active);
  if (!st.sets) {
    if (!confirm('לא סומן אף סט. לסיים בלי לשמור?')) return;
    active = null; saveActive(); closeWorkout(); renderTrain(); return;
  }
  // שומרים רק את מה שבוצע בפועל — סט שלא סומן לא קרה
  const rec = {
    ...active,
    entries: active.entries
      .map(e => ({ ...e, sets: e.sets.filter(s => s.done) }))
      .filter(e => e.sets.length),
  };
  delete rec.started; delete rec.idx;
  rec.entries.forEach(e => { delete e.skipped; });
  sessions.push(rec);
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  saveSessions();
  // אימון כוח שבוצע מסמן גם את לוח ה-V השבועי
  strengthChecks[active.date] = true; saveStrength();
  active = null; saveActive();
  closeWorkout();
  renderStrength(); renderTrain(); renderWorkouts();
  showSummary(rec);
}

/* מצב עריכה של תא משקל בתוך מצב אימון: {ei, si} או null */
let tmEdit = null;

/* מרנדר את כל התרגילים כפייג'ר אופקי — כך שההחלקה היא גלילה טבעית של
 * הדפדפן, באותה מוסכמת scroll-snap שבה עובד הפייג'ר הראשי של האפליקציה. */
function renderWorkout(animate) {
  if (!active) return;
  const es = active.entries;
  const total = es.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = es.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  const pct = total ? Math.round(doneSets / total * 100) : 0;
  $('tm-title').textContent = active.programName;
  $('tm-prog').innerHTML = `<i style="width:${pct}%"></i>`;
  $('tm-count').textContent = `${doneSets}/${total} סטים`;

  $('tm-dots').innerHTML = es.map((e, i) => {
    const cls = i === active.idx ? 'cur' : e.skipped ? 'skip' : entryDone(e) ? 'ok' : '';
    return `<button class="tm-dot ${cls}" data-go="${i}" aria-label="${e.name}"></button>`;
  }).join('');

  if (!es.length) { $('tm-body').innerHTML = '<p class="tm-none">אין תרגילים בתוכנית.</p>'; return; }

  $('tm-body').innerHTML = es.map((e, ei) => {
    const prev = prevEntry(e.name);
    const prevTxt = prev
      ? `${shortDate(prev.date)} · ${prev.entry.sets.filter(s => s.done)
        .map(s => `${fmt(s.kg, s.kg % 1 ? 1 : 0)}×${s.reps}`).join(' · ')}`
      : 'אימון ראשון בתרגיל הזה';
    const sug = overloadSuggestion(e.name);
    const groups = [e.primary, ...(e.secondary || []).filter(g => g !== e.primary)]
      .filter(g => MUSCLES[g])
      .map((g, i) => `<span class="tm-mg ${i ? 'sec' : ''}">${MUSCLES[g]}</span>`).join('');
    const done = e.sets.filter(s => s.done).length;

    return `<section class="tm-card ${e.skipped ? 'skipped' : ''} ${entryDone(e) ? 'complete' : ''}" data-card="${ei}">
      <header class="tm-chead">
        <div class="tm-pos">תרגיל ${ei + 1} מתוך ${es.length}<b>${done}/${e.sets.length}</b></div>
        <h3 class="tm-name">${e.sub || e.name}</h3>
        ${e.sub ? `<p class="tm-subnote">${icon('info', 13)} במקום ${e.name} · נספר לקבוצת השריר בלבד</p>` : ''}
        <div class="tm-mgs">${groups}</div>
        <p class="tm-prev">${e.sub ? '' : prevTxt}</p>
        ${sug && !e.sub ? `<p class="tm-sug">${icon('bolt', 14)} מוכן ל-${fmt(sug.to, sug.to % 1 ? 1 : 0)} ק״ג?</p>` : ''}
        ${e.skipped ? '<p class="tm-skipped">התרגיל דולג. סמן סט כדי לחזור אליו.</p>' : ''}
      </header>

      <div class="tm-sets" data-n="${e.sets.length}">
        ${e.sets.map((s, si) => {
          const editing = tmEdit && tmEdit.ei === ei && tmEdit.si === si;
          const kgTxt = fmt(s.kg, s.kg % 1 ? 1 : 0);
          return `<div class="tm-set ${s.done ? 'done' : ''}" data-ei="${ei}" data-si="${si}">
            <div class="tm-shead">
              <span class="tm-n">סט ${si + 1}</span>
              <button class="tm-ok" data-act="done" aria-label="בוצע">${icon('check', 20)}</button>
            </div>
            <div class="tm-fields">
              <div class="tm-field">
                <button class="tm-pm" data-act="kg-" aria-label="הורדת משקל">−</button>
                <span class="tm-fv">
                  ${editing
                    ? `<input class="tm-kgin" type="number" inputmode="decimal" step="0.5" min="0" value="${s.kg}" aria-label="משקל">`
                    : `<button class="tm-v" data-act="kg=">${kgTxt}</button>`}
                  <small>ק״ג</small>
                </span>
                <button class="tm-pm" data-act="kg+" aria-label="העלאת משקל">+</button>
              </div>
              <div class="tm-field">
                <button class="tm-pm" data-act="rep-" aria-label="פחות חזרות">−</button>
                <span class="tm-fv"><b>${s.reps}</b><small>חזרות</small></span>
                <button class="tm-pm" data-act="rep+" aria-label="יותר חזרות">+</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="tm-tools">
        <button data-tool="skip">${e.skipped ? 'בטל דילוג' : 'דלג על התרגיל'}</button>
        <button data-tool="switch">החלף תרגיל</button>
        <button data-tool="sub">${e.sub ? 'בטל חלופי' : 'מבצע תרגיל אחר'}</button>
      </div>
    </section>`;
  }).join('');

  snapToCard(active.idx, false);
  $('tm-note').value = active.note || '';
  const inp = $('tm-body').querySelector('.tm-kgin');
  if (inp) { inp.focus(); inp.select(); }
}

/* הצמדה לכרטיס — אותה טכניקה כמו snapToPage: מדידת דלתא (אגנוסטי ל-RTL)
 * והשבתה זמנית של ההצמדה בקפיצה מיידית, ש-scroll-snap-stop לא יבלום אותה. */
/* חותמת זמן של הצמדה תכנותית — מאזין הגלילה מתעלם בזמן האנימציה, אחרת
 * מיקום ביניים היה דורס את active.idx וקובע תרגיל שגוי כנוכחי. */
let tmSnapUntil = 0;

function snapToCard(idx, smooth) {
  const body = $('tm-body');
  const card = body.querySelector(`[data-card="${idx}"]`);
  if (!card) return;
  const delta = card.getBoundingClientRect().left - body.getBoundingClientRect().left
    - (body.clientWidth - card.clientWidth) / 2;
  if (Math.abs(delta) < 1) return;
  tmSnapUntil = Date.now() + (smooth ? 800 : 120);
  if (smooth) { body.scrollBy({ left: delta, behavior: 'smooth' }); return; }
  const prevSnap = body.style.scrollSnapType;
  body.style.scrollSnapType = 'none';
  body.scrollBy({ left: delta, behavior: 'instant' });
  body.style.scrollSnapType = prevSnap;
}
/* איזה כרטיס הכי קרוב למרכז — עובד ב-RTL וב-LTR כאחד */
function nearestCard() {
  const body = $('tm-body');
  const mid = body.getBoundingClientRect().left + body.clientWidth / 2;
  let best = 0, bestD = Infinity;
  body.querySelectorAll('[data-card]').forEach(c => {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - mid);
    if (d < bestD) { bestD = d; best = +c.dataset.card; }
  });
  return best;
}

/* בחירה ידנית של תרגיל מתוך התוכנית — אחריו הניווט חוזר לסדר המקורי */
function openSwitcher() {
  if (!active) return;
  $('sw-list').innerHTML = active.entries.map((e, i) => {
    const state = e.skipped ? 'דולג' : entryDone(e) ? 'הושלם' : `${e.sets.filter(s => s.done).length}/${e.sets.length} סטים`;
    return `<button class="sw-row ${i === active.idx ? 'cur' : ''}" data-go="${i}">
      <span class="sw-nm">${e.sub || e.name}</span>
      <span class="sw-st">${state}</span></button>`;
  }).join('');
  $('switch-modal').classList.remove('hidden');
}
function closeSwitcher() { $('switch-modal').classList.add('hidden'); }

/* סיכום בסוף האימון — סטים, השוואה לפעם הקודמת, ושיאים אישיים */
function showSummary(rec) {
  const st = sessionStats(rec);
  const prevSame = sessions.filter(s => s.programId === rec.programId && s.id !== rec.id).pop();
  const pv = prevSame ? sessionStats(prevSame).sets : null;
  const prs = [];
  for (const e of rec.entries) {
    const h = exerciseHistory(e.name);
    const cur = h[h.length - 1];
    const before = h.slice(0, -1);
    if (cur && before.length && cur.best > Math.max(...before.map(x => x.best))) prs.push(e.name);
  }
  const delta = pv == null ? '' : (() => {
    const d = st.sets - pv;
    if (!d) return '<p class="ts-line">אותו מספר סטים כמו בפעם הקודמת.</p>';
    return `<p class="ts-line">${d > 0 ? 'עוד' : 'פחות'} <b>${Math.abs(d)} סטים</b> לעומת הפעם הקודמת.</p>`;
  })();
  $('ts-body').innerHTML = `
    <div class="ts-tiles one">
      <div class="ts-tile"><small>סטים</small><b>${st.sets}</b><i>הושלמו</i></div>
    </div>${delta}
    ${prs.length ? `<p class="ts-pr">${icon('trophy', 16)} שיא אישי חדש: <b>${prs.join(' · ')}</b></p>` : ''}`;
  $('train-summary').classList.remove('hidden');
}

/* כיסוי הגוף ב-7 הימים — הנקודה של תוכנית פול-באדי היא לא לפספס קבוצה */
function coverageMarkup() {
  const cov = muscleCoverage();
  const missing = MUSCLE_KEYS.filter(k => !cov[k].primary && !cov[k].secondary);
  const line = !sessions.length ? ''
    : missing.length === 0
      ? `<p class="tr-note">כל קבוצות השרירים קיבלו עבודה ב-${COVER_DAYS} הימים האחרונים.</p>`
      : `<p class="tr-note">לא קיבלו עבודה: <b>${missing.map(k => MUSCLES[k]).join(' · ')}</b>.</p>`;
  return `<div class="tr-sec">
    <h3>${icon('dumbbell', 15)} כיסוי הגוף · ${COVER_DAYS} ימים</h3>
    <div class="cov-grid">${MUSCLE_KEYS.map(k => {
      const c = cov[k];
      const cls = c.primary ? 'full' : c.secondary ? 'part' : 'none';
      const sub = c.primary ? `${c.sets} סטים` : c.secondary ? 'עקיף בלבד' : 'לא נעבד';
      return `<div class="cov ${cls}"><b>${MUSCLES[k]}</b><small>${sub}</small></div>`;
    }).join('')}</div>${line}</div>`;
}

/* ---------- כרטיס הניתוח בעמוד הפעילות ---------- */
function renderTrain() {
  const el = $('train-card');
  if (!programs.length && !sessions.length) {
    el.innerHTML = `<article class="card train-empty">
      <div class="body-head"><h2>ניתוח אימון</h2></div>
      <p class="tr-empty">הזן את תוכנית האימונים פעם אחת, ומכאן והלאה כל אימון יתועד בלחיצות
        — עם מעקב אחר העלאת המשקלים (progressive overload) וגרף השתפרות לכל תרגיל.</p>
      <button class="btn-primary tr-wide" id="tr-new">יצירת תוכנית אימונים</button>
    </article>`;
    return;
  }
  const sug = allSuggestions();
  const last = sessions[sessions.length - 1];
  const names = allExerciseNames();
  if (!names.includes(state.trainEx)) state.trainEx = names[0] || '';

  const lastTxt = last ? (() => {
    const st = sessionStats(last);
    return `<div class="tr-last"><span>${longDate(last.date)} · ${last.programName}</span>
      <b>${st.sets} סטים</b></div>`;
  })() : '<p class="tr-empty">עוד לא תועד אימון. לחץ "התחל אימון" כדי להתחיל.</p>';

  el.innerHTML = `<article class="card">
    <div class="body-head"><h2>ניתוח אימון</h2>
      <button class="world-link tr-manage" id="tr-manage">תוכניות ‹</button></div>
    ${lastTxt}
    <button class="btn-primary tr-wide" id="tr-start">${active ? 'המשך אימון' : 'התחל אימון'}</button>
    ${coverageMarkup()}
    ${sug.length ? `<div class="tr-sugs"><h3>${icon('bolt', 15)} מוכן להעלות משקל</h3>
      <div class="tr-chips">${sug.map(s => `<span class="tr-chip">${s.name}
        <b>${fmt(s.from, s.from % 1 ? 1 : 0)}→${fmt(s.to, s.to % 1 ? 1 : 0)}</b></span>`).join('')}</div></div>` : ''}
    ${names.length ? `<div class="tr-sec">
      <div class="tr-sec-head"><h3>גרף השתפרות</h3>
        <select id="tr-ex" class="tr-sel">${names.map(n =>
          `<option value="${n}" ${n === state.trainEx ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="legend" id="legend-train"></div>
      <div class="chart-wrap chart-sm" dir="ltr"><canvas id="chart-train"></canvas></div>
      <p class="tr-note" id="tr-exnote"></p>
    </div>` : ''}
    ${sessions.length ? `<div class="tr-sec"><h3>היסטוריה</h3>
      <div class="tr-hist">${sessions.slice(-8).reverse().map(s => {
        const st = sessionStats(s);
        return `<button class="tr-row" data-sid="${s.id}">
          <span class="tr-d">${shortDate(s.date)}</span>
          <span class="tr-nm">${s.programName}</span>
          <span class="tr-v">${st.sets} סטים</span>
          <span class="tr-go">›</span></button>`;
      }).join('')}</div></div>` : ''}
  </article>`;
  renderTrainChart();
}

function renderTrainChart() {
  const name = state.trainEx;
  const h = name ? exerciseHistory(name) : [];
  const note = $('tr-exnote');
  if (!$('chart-train')) return;
  const wrap = $('chart-train').closest('.chart-wrap');
  const leg = $('legend-train');
  if (h.length < 2) {
    charts['chart-train']?.destroy(); delete charts['chart-train'];
    // מקפלים את אזור הגרף — אחרת נשאר חלל ריק גדול בכרטיס
    if (wrap) wrap.style.display = 'none';
    if (leg) leg.style.display = 'none';
    if (note) note.textContent = h.length === 1
      ? 'אימון אחד תועד בתרגיל הזה — הגרף יופיע אחרי השני.'
      : 'עוד לא תועדו אימונים בתרגיל הזה.';
    return;
  }
  if (wrap) wrap.style.display = '';
  if (leg) leg.style.display = '';
  const first = h[0].best, lastB = h[h.length - 1].best;
  const pct = first > 0 ? (lastB - first) / first * 100 : 0;
  if (note) {
    note.innerHTML = Math.abs(pct) < 1
      ? `1RM משוער יציב סביב ${fmt(lastB, 1)} ק״ג.`
      : `1RM משוער ${pct > 0 ? 'עלה' : 'ירד'} ב-<b>${fmt(Math.abs(pct), 1)}%</b>
         מאז ${shortDate(h[0].date)} — מ-${fmt(first, 1)} ל-${fmt(lastB, 1)} ק״ג.`;
  }
  legend('legend-train', [[C.violet, '1RM משוער']]);
  make('chart-train', {
    type: 'line',
    data: {
      labels: h.map(x => shortDate(x.date)),
      datasets: [{
        label: '1RM משוער',
        data: h.map(x => ({ x: shortDate(x.date), y: +x.best.toFixed(1), iso: x.date })),
        borderColor: C.violet, borderWidth: 2.4, pointRadius: 3, pointBackgroundColor: C.violet,
        tension: .3, fill: true, backgroundColor: gradFill(C.violet),
      }],
    },
    options: opts({}, i => `${fmt(i.raw.y, 1)} ק״ג`),
  });
}

/* ---------- עורך התוכניות ---------- */
let pgDraft = null;   // התוכנית שבעריכה (עותק — נשמר רק ב"שמירה")

function openProgram(id) {
  const src = programs.find(p => p.id === id);
  pgDraft = src
    ? JSON.parse(JSON.stringify(src))
    : { id: uid(), name: '', exercises: [{ id: uid(), name: '', sets: [{ reps: 10, kg: 20 }] }] };
  renderProgram();
  $('program-modal').classList.remove('hidden');
}
function closeProgram() { $('program-modal').classList.add('hidden'); pgDraft = null; }

/* בורר קבוצות השריר של תרגיל — מופרד כדי שאפשר יהיה לרענן רק אותו
 * כשהניחוש מתעדכן תוך כדי הקלדת שם התרגיל, בלי לאבד את הפוקוס בשדה. */
function mgMarkup(ex) {
  return `<label class="pg-mglab">שריר ראשי
      <select data-act="primary">
        <option value="">—</option>
        ${MUSCLE_KEYS.map(k => `<option value="${k}" ${ex.primary === k ? 'selected' : ''}>${MUSCLES[k]}</option>`).join('')}
      </select></label>
    <div class="pg-mgsec"><small>משניים</small><div class="pg-mgchips">
      ${MUSCLE_KEYS.filter(k => k !== ex.primary).map(k =>
        `<button class="pg-mgchip ${(ex.secondary || []).includes(k) ? 'on' : ''}"
          data-act="secondary" data-mg="${k}">${MUSCLES[k]}</button>`).join('')}
    </div></div>`;
}

function renderProgram() {
  if (!pgDraft) return;
  $('pg-title').textContent = programs.some(p => p.id === pgDraft.id) ? 'עריכת תוכנית' : 'תוכנית חדשה';
  $('pg-name').value = pgDraft.name || '';
  $('pg-ex').innerHTML = pgDraft.exercises.map((ex, ei) => `
    <div class="pg-card" data-ei="${ei}">
      <div class="pg-exhead">
        <input class="pg-exname" data-act="exname" value="${(ex.name || '').replace(/"/g, '&quot;')}"
          placeholder="שם התרגיל (למשל סקוואט)" aria-label="שם התרגיל">
        <button class="pg-del" data-act="exdel" aria-label="מחיקת תרגיל">✕</button>
      </div>
      <div class="pg-mg">${mgMarkup(ex)}</div>
      <div class="pg-sets">
        <div class="pg-shead"><span>סט</span><span>חזרות</span><span>ק״ג</span><span></span></div>
        ${ex.sets.map((s, si) => `<div class="pg-set" data-si="${si}">
          <span class="pg-n">${si + 1}</span>
          <input type="number" data-act="reps" min="1" max="100" inputmode="numeric" value="${s.reps}" aria-label="חזרות">
          <input type="number" data-act="kg" min="0" max="500" step="0.5" inputmode="decimal" value="${s.kg}" aria-label="משקל">
          <button class="pg-del" data-act="setdel" aria-label="מחיקת סט">✕</button>
        </div>`).join('')}
      </div>
      <button class="pg-add" data-act="setadd">+ סט</button>
    </div>`).join('');
  const other = programs.filter(p => p.id !== pgDraft.id);
  $('pg-list').innerHTML = other.length
    ? `<div class="pg-others"><small>תוכניות קיימות</small>${other.map(p =>
      `<button class="pg-other" data-pid="${p.id}">${p.name || 'ללא שם'}
        <em>${(p.exercises || []).length} תרגילים</em></button>`).join('')}</div>`
    : '';
}

function saveProgram() {
  if (!pgDraft) return;
  pgDraft.name = ($('pg-name').value || '').trim();
  if (!pgDraft.name) { toast('צריך שם לתוכנית'); return; }
  pgDraft.exercises = pgDraft.exercises
    .map(ex => ({ ...ex, name: (ex.name || '').trim(), sets: ex.sets.filter(s => s.reps > 0) }))
    .filter(ex => ex.name && ex.sets.length);
  if (!pgDraft.exercises.length) { toast('צריך לפחות תרגיל אחד עם סט'); return; }
  const i = programs.findIndex(p => p.id === pgDraft.id);
  if (i >= 0) programs[i] = pgDraft; else programs.push(pgDraft);
  savePrograms();
  closeProgram();
  renderTrain();
  toast('התוכנית נשמרה');
}
function deleteProgram() {
  if (!pgDraft || !programs.some(p => p.id === pgDraft.id)) { closeProgram(); return; }
  if (!confirm('למחוק את התוכנית? האימונים שכבר תועדו יישארו.')) return;
  programs = programs.filter(p => p.id !== pgDraft.id);
  savePrograms(); closeProgram(); renderTrain();
}

/* ---------- עריכת אימון שנשמר ---------- */
function openPastSession(sid) {
  const s = sessions.find(x => x.id === sid);
  if (!s) return;
  const st = sessionStats(s);
  const lines = s.entries.map(e => `${e.name}: ${e.sets.map(x =>
    `${fmt(x.kg, x.kg % 1 ? 1 : 0)}×${x.reps}`).join(', ')}`).join('\n');
  const choice = prompt(
    `${longDate(s.date)} · ${s.programName}\n${st.sets} סטים\n\n`
    + `${lines}\n\n${s.note ? `הערה: ${s.note}\n\n` : ''}`
    + 'להמשך עריכה הקלד:\n"מחק" — למחיקת האימון\n"הערה" — לעריכת ההערה',
    '');
  if (choice === null) return;
  const c = choice.trim();
  if (c === 'מחק') {
    if (!confirm('למחוק את האימון הזה מההיסטוריה?')) return;
    sessions = sessions.filter(x => x.id !== sid);
    saveSessions(); renderTrain(); renderWorkouts(); toast('האימון נמחק');
  } else if (c === 'הערה') {
    const n = prompt('הערה לאימון:', s.note || '');
    if (n === null) return;
    s.note = n.trim(); saveSessions(); toast('ההערה עודכנה');
  }
}

/* ---------- חיווט אירועים ---------- */
$('train-card').addEventListener('click', e => {
  if (e.target.closest('#tr-new') || e.target.closest('#tr-manage')) { openProgram(programs[0]?.id); return; }
  if (e.target.closest('#tr-start')) { active ? openWorkout() : startWorkout(programs[0]?.id); return; }
  const row = e.target.closest('.tr-row');
  if (row) openPastSession(row.dataset.sid);
});
$('train-card').addEventListener('change', e => {
  if (e.target.id === 'tr-ex') { state.trainEx = e.target.value; renderTrainChart(); }
});

/* מצב אימון — כל הלחיצות דרך מאזין אחד על הכרטיס */
$('tm-body').addEventListener('click', e => {
  if (!active) return;
  const tool = e.target.closest('[data-tool]');
  if (tool) {
    const card = tool.closest('[data-card]');
    const ei = card ? +card.dataset.card : active.idx;
    const cur = active.entries[ei];
    if (!cur) return;
    const t = tool.dataset.tool;
    if (t === 'skip') {
      if (cur.skipped) { cur.skipped = false; saveActive(); renderWorkout(); } else skipExercise(ei);
    } else if (t === 'switch') openSwitcher();
    else if (t === 'sub') {
      if (cur.sub) { cur.sub = null; saveActive(); renderWorkout(); } else substituteExercise(ei);
    }
    return;
  }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const row = btn.closest('.tm-set');
  if (!row) return;
  const ei = +row.dataset.ei, si = +row.dataset.si;
  const entry = active.entries[ei];
  const s = entry?.sets[si];
  if (!s) return;
  const act = btn.dataset.act;
  if (act === 'kg-') s.kg = Math.max(0, +(s.kg - STEP_KG).toFixed(2));
  else if (act === 'kg+') s.kg = +(s.kg + STEP_KG).toFixed(2);
  else if (act === 'kg=') { tmEdit = { ei, si }; renderWorkout(); return; }
  else if (act === 'rep-') s.reps = Math.max(1, s.reps - 1);
  else if (act === 'rep+') s.reps = s.reps + 1;
  else if (act === 'done') {
    s.done = !s.done;
    if (s.done) entry.skipped = false;   // סימון סט מחזיר תרגיל שדולג
    haptic(s.done ? 12 : 6);
  }
  tmEdit = null;
  saveActive();
  renderWorkout();
  if (act === 'done' && s.done) advanceIfDone();
});
/* נקודות ההתקדמות בכותרת — קפיצה ישירה לתרגיל */
$('tm-dots').addEventListener('click', e => {
  const d = e.target.closest('[data-go]');
  if (d && active) goToExercise(+d.dataset.go);
});
/* החלקה בין תרגילים — הכרטיס שנח במרכז הופך לתרגיל הנוכחי */
{
  let t;
  $('tm-body').addEventListener('scroll', () => {
    if (!active) return;
    clearTimeout(t);
    t = setTimeout(() => {
      if (!active || Date.now() < tmSnapUntil) return;
      const i = nearestCard();
      if (i !== active.idx) { active.idx = i; saveActive(); renderDots(); haptic(6); }
    }, 90);
  }, { passive: true });
}
$('switch-modal').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { closeSwitcher(); return; }
  const row = e.target.closest('[data-go]');
  if (row && active) { closeSwitcher(); goToExercise(+row.dataset.go); }
});
/* קליטת משקל מדויק מהשדה הפתוח */
$('tm-body').addEventListener('change', e => {
  if (!e.target.classList.contains('tm-kgin') || !active || !tmEdit) return;
  const s = active.entries[tmEdit.ei]?.sets[tmEdit.si];
  const v = parseFloat(e.target.value);
  if (s && !Number.isNaN(v) && v >= 0) s.kg = v;
  tmEdit = null; saveActive(); renderWorkout();
});
$('tm-body').addEventListener('keydown', e => {
  if (e.target.classList.contains('tm-kgin') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});
$('tm-note').addEventListener('input', e => { if (active) { active.note = e.target.value; saveActive(); } });
$('tm-finish').addEventListener('click', finishWorkout);
$('tm-close').addEventListener('click', closeWorkout);
$('tm-discard').addEventListener('click', discardWorkout);
$('train-summary').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) $('train-summary').classList.add('hidden');
});

/* עורך התוכנית */
$('program-modal').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { closeProgram(); return; }
  if (e.target.closest('#pg-save')) { saveProgram(); return; }
  if (e.target.closest('#pg-delete')) { deleteProgram(); return; }
  if (e.target.closest('#pg-newex')) {
    pgDraft.exercises.push({ id: uid(), name: '', sets: [{ reps: 10, kg: 20 }] });
    renderProgram(); return;
  }
  if (e.target.closest('#pg-newprog')) { openProgram(); return; }
  const other = e.target.closest('.pg-other');
  if (other) { openProgram(other.dataset.pid); return; }
  const act = e.target.closest('[data-act]');
  if (!act || !pgDraft) return;
  const card = act.closest('.pg-card');
  const ei = card ? +card.dataset.ei : -1;
  const ex = pgDraft.exercises[ei];
  if (!ex) return;
  if (act.dataset.act === 'secondary') {
    const g = act.dataset.mg;
    ex.secondary = (ex.secondary || []).includes(g)
      ? ex.secondary.filter(x => x !== g) : [...(ex.secondary || []), g];
    ex.touchedMg = true;
    card.querySelector('.pg-mg').innerHTML = mgMarkup(ex);
  } else if (act.dataset.act === 'exdel') {
    if (pgDraft.exercises.length === 1) { toast('צריך לפחות תרגיל אחד'); return; }
    pgDraft.exercises.splice(ei, 1); renderProgram();
  } else if (act.dataset.act === 'setadd') {
    const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, kg: 20 };
    ex.sets.push({ ...lastSet }); renderProgram();
  } else if (act.dataset.act === 'setdel') {
    if (ex.sets.length === 1) { toast('צריך לפחות סט אחד'); return; }
    ex.sets.splice(+act.closest('.pg-set').dataset.si, 1); renderProgram();
  }
});
/* שינויי טקסט בעורך נשמרים לטיוטה בלי רינדור מחדש (כדי לא לאבד פוקוס) */
$('program-modal').addEventListener('input', e => {
  const act = e.target.dataset.act;
  if (!act || !pgDraft) return;
  if (act === 'pgname') { pgDraft.name = e.target.value; return; }
  const card = e.target.closest('.pg-card');
  const ex = card && pgDraft.exercises[+card.dataset.ei];
  if (act === 'primary' && ex) {
    ex.primary = e.target.value;
    ex.secondary = (ex.secondary || []).filter(g => g !== ex.primary);
    ex.touchedMg = true;
    card.querySelector('.pg-mg').innerHTML = mgMarkup(ex);
    return;
  }
  if (act === 'exname' && ex) {
    ex.name = e.target.value;
    // ניחוש אוטומטי כל עוד המשתמש לא בחר קבוצה בעצמו
    if (!ex.touchedMg) {
      Object.assign(ex, guessMuscles(ex.name));
      card.querySelector('.pg-mg').innerHTML = mgMarkup(ex);
    }
    return;
  }
  else if (ex) {
    const set = ex.sets[+e.target.closest('.pg-set').dataset.si];
    if (!set) return;
    if (act === 'reps') set.reps = Math.max(1, parseInt(e.target.value, 10) || 0);
    else if (act === 'kg') set.kg = Math.max(0, parseFloat(e.target.value) || 0);
  }
});

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
    let wd;
    if (Math.abs(diff) < 0.05) wd = `<span class="ws-delta flat">ללא שינוי</span>`;
    else {
      const arrow = diff > 0 ? '▲' : '▼';
      const dir = weightDir(diff, wPrev.kg);   // good/bad/null → ירוק/אדום/נייטרלי
      const cls = dir === 'good' ? 'up' : dir === 'bad' ? 'down' : 'flat';
      wd = `<span class="ws-delta ${cls}">${arrow} ${fmt(Math.abs(diff), 1)}</span>`;
    }
    chips.push(`<div class="ws-chip"><small>משקל (שבוע)</small><b>${fmt(wLast.kg, 1)}<small> ק״ג</small></b>${wd}</div>`);
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
/* המלצה לריצה הבאה: מודל 80/20 (רוב קל, מיעוט קשה) מוצלב עם מוכנות היום.
 * מוכנות נמוכה גוברת על האיזון — אין טעם באינטרוולים על גוף לא מאושש. */
function nextRunAdvice(score) {
  const runs = runsInRange().filter(r => r.real);
  if (!runs.length) return null;
  const recent = runs.slice(-10);
  const hard = recent.filter(r => r.kind === 'tempo' || r.kind === 'intervals').length;
  const hardPct = hard / recent.length * 100;
  const daysSince = Math.round((new Date(todayISO()) - new Date(runs[runs.length - 1].date)) / 864e5);

  if (score !== null && score < 50) return 'מוכנות נמוכה — ריצה קלה בזון 2, או יום מנוחה.';
  if (hardPct > 25) return `<b>${Math.round(hardPct)}%</b> מהריצות האחרונות היו קשות (יעד ~20%) — הבאה קלה או נפח.`;
  if (daysSince <= 1) return 'רצת אתמול — ריצה קלה או מנוחה.';
  if (hardPct < 12 && score !== null && score >= 70) return 'האיזון נוטה לקל ומוכנות טובה — זה הזמן לטמפו או אינטרוולים.';
  return 'האיזון בין קל לקשה תקין — המשך לפי התוכנית.';
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
  const runRec = nextRunAdvice(score);
  if (runRec) targets.push(`${icon('run', 16)} ${runRec}`);

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
const PROFILE_FIELDS = ['age', 'heightCm', 'weightKg', 'sleepGoal', 'stepsGoal', 'strengthGoal',
  'weightGoal', 'runGoalKm', 'maxHrOverride', 'runTempoPct', 'runVolumeKm', 'runIntervalSpread'];
/* קצב היעד נשמר בשניות לק״מ אבל מוקלד כ-"5:30" — המרה בשני הכיוונים */
function parsePace(txt) {
  const m = String(txt).trim().match(/^(\d{1,2})[:.](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(txt);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function fillProfileForm() {
  const f = $('profile-form');
  PROFILE_FIELDS.forEach(k => { if (f[k]) f[k].value = profile[k] ?? ''; });
  if (f.sex) f.sex.value = profile.sex || '';
  if (f.runGoalPace) f.runGoalPace.value = profile.runGoalPace ? paceTxt(profile.runGoalPace) : '';
  renderRulePreview();
}

/* תצוגה מקדימה חיה של הסיווג — בלעדיה כוונון הספים הוא ניחוש עיוור:
 * שומרים, סוגרים, מסתכלים, פותחים שוב. */
function renderRulePreview() {
  const el = $('rr-preview');
  if (!el) return;
  const f = $('profile-form');
  const num = (name, dflt) => {
    const v = Number(f[name]?.value);
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const rules = {
    tempoPct: num('runTempoPct', RUN_RULES_DEFAULT.tempoPct),
    volumeKm: num('runVolumeKm', RUN_RULES_DEFAULT.volumeKm),
    intervalSpread: num('runIntervalSpread', 0),
    // הדופק שמוקלד ברגע זה, לא זה שנשמר — הוא מזיז את כל האזורים
    maxHr: num('maxHrOverride', null) || (num('age', null) ? 220 - num('age', 0) : maxHR()),
  };
  const runs = allRuns().filter(r => r.real);
  if (!runs.length) { el.textContent = 'אין עדיין ריצות להצגה מקדימה.'; return; }
  if (!rules.maxHr) {
    el.textContent = 'בלי גיל או דופק מקסימלי אי אפשר לחשב עוצמה — הסיווג ייפול למרחק בלבד.';
    return;
  }
  const counts = {};
  for (const r of runs) { const k = classifyRun(r, rules); counts[k] = (counts[k] || 0) + 1; }
  const hardPct = Math.round(((counts.tempo || 0) + (counts.intervals || 0)) / runs.length * 100);
  el.innerHTML = `${runs.length} הריצות שלך מתחלקות כך: `
    + RUN_ORDER.filter(k => counts[k]).map(k =>
        `<b style="color:${RUN_TYPES[k].color}">${counts[k]} ${RUN_TYPES[k].label}</b>`).join(' · ')
    + `<small>${hardPct}% ריצות קשות. אימון מאוזן שואף ל-~20%.</small>`;
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
  const gp = parsePace(f.runGoalPace.value);
  if (gp) p.runGoalPace = gp;
  saveProfileObj(p); closeProfile(); renderAll();
});
$('profile-clear').addEventListener('click', () => { saveProfileObj({}); fillProfileForm(); closeProfile(); renderAll(); });
$('profile-form').addEventListener('input', renderRulePreview);

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
    strength_programs_v1: programs, strength_sessions_v1: sessions, run_tags_v1: runTags,
    runs_history_v1: runHistLocal,
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
      if (Array.isArray(b.strength_programs_v1)) { programs = b.strength_programs_v1; savePrograms(); }
      if (Array.isArray(b.strength_sessions_v1)) { sessions = b.strength_sessions_v1; saveSessions(); }
      if (b.run_tags_v1 && typeof b.run_tags_v1 === 'object') { runTags = b.run_tags_v1; saveRunTags(); }
      if (Array.isArray(b.runs_history_v1)) { runHistLocal = b.runs_history_v1; saveRunHistory(); }
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

/* --- ייבוא ריצות עבר מייצוא הבריאות של האייפון --- */
const APPLE_YEARS_BACK = 2;   // ריצות ישנות מכך כבר לא מלמדות על הכושר של היום

function downloadRunHistory() {
  const blob = new Blob([JSON.stringify(runHistLocal, null, 1) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'runs_history.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importAppleRuns(file) {
  const st = $('apple-status');
  const since = new Date();
  since.setFullYear(since.getFullYear() - APPLE_YEARS_BACK);
  const sinceISO = since.toISOString().slice(0, 10);

  st.textContent = 'פותח את הקובץ…';
  try {
    const runs = await parseAppleRuns(file, {
      sinceISO,
      onProgress: (pct, found) => { st.textContent = `סורק… ${pct}% · ${found} ריצות עד כה`; },
    });
    if (!runs.length) {
      st.textContent = `לא נמצאו ריצות מ-${APPLE_YEARS_BACK} השנים האחרונות בקובץ.
        ודא שבחרת את export.xml מתוך תיקיית הייצוא.`;
      return;
    }
    runHistLocal = runs;
    saveRunHistory();
    renderAll();
    const taken = garminRunDates();
    const fresh = runs.filter(r => !taken.has(r.date)).length;
    st.innerHTML = `נשמרו <b>${runs.length}</b> ריצות מ-${runDate(runs[0].date)} ואילך
      (${fresh} שאין עליהן נתוני גרמין). עבור לכרטיס הריצות ובחר "הכל" בסרגל הטווח.
      <button type="button" class="btn-ghost" id="apple-dl">⬇️ הורדת הקובץ לשמירה בריפו</button>`;
  } catch (err) {
    console.warn('ייבוא Apple Health נכשל:', err);
    st.textContent = 'קריאת הקובץ נכשלה. ודא שזה export.xml המקורי (לא ה-ZIP ולא export_cda.xml).';
  }
}

$('apple-btn').addEventListener('click', () => $('apple-file').click());
$('apple-file').addEventListener('change', e => { if (e.target.files[0]) importAppleRuns(e.target.files[0]); e.target.value = ''; });
$('apple-status').addEventListener('click', e => { if (e.target.closest('#apple-dl')) downloadRunHistory(); });

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
  renderSleepAnalysis();
  statHero('sleep-hero', 'sleep_hours');
  statHero('heart-hero', 'hrv', hrvExtra());
  statHero('steps-hero', 'steps');
  renderStrength();
  renderTrain();
  renderActivityRec();
  renderRuns();
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

  // מודיע למסך-המרכז (hub.js) שהנתונים מוכנים/התעדכנו
  document.dispatchEvent(new CustomEvent('health-ready'));
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
/* גלילה אל עמוד — scrollBy על הפייג'ר בלבד, לפי הפרש המלבנים.
 * במכוון *לא* scrollIntoView: הוא מגלגל כל מכל-גלילה בשרשרת ההורים ולכן עלול
 * להזיז את #worlds של מסך-המרכז ולהוציא את העולם מהמסך. scrollBy נוגע רק
 * בפייג'ר, וההפרש נמדד בפיקסלים על המסך ולכן נכון גם ב-RTL וגם ב-LTR. */
function snapToPage(idx, smooth) {
  const delta = pages[idx].getBoundingClientRect().left - pager.getBoundingClientRect().left;
  if (!delta) return;
  if (smooth) { pager.scrollBy({ left: delta, behavior: 'smooth' }); return; }
  // קפיצה מיידית: scroll-snap-stop:always מחייב עצירה בכל עמוד בדרך ולכן
  // בולם גלילה תכנותית של יותר מעמוד אחד — משביתים את ההצמדה לרגע, קופצים
  // במדויק, ומחזירים אותה (הנחיתה ממילא בדיוק על נקודת הצמדה).
  const prev = pager.style.scrollSnapType;
  pager.style.scrollSnapType = 'none';
  pager.scrollBy({ left: delta, behavior: 'instant' });
  pager.style.scrollSnapType = prev;
}
function goTo(idx) {
  haptic(10);
  // מעבר לעמוד מתחיל תמיד מראש העמוד המבוקש
  pages[idx].scrollTop = 0;
  // קפיצה לעמוד לא-סמוך (מרחק >1) נעשית מיידית — גלילה חלקה דרך עמודי
  // הגרפים הכבדים באמצע נראית קופצנית; מעבר לעמוד סמוך נשאר חלק ומחובר.
  const far = state.page < 0 || Math.abs(idx - state.page) > 1;
  snapToPage(idx, !far);
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
    snapToPage(idx, true);
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
  loadTraining();
  loadRunTags();
  loadRunHistory();
  const [{ data, isDemo }] = await Promise.all([loadHealthData(), fetchRunHistory()]);
  state.data = data;
  state.isDemo = isDemo;

  $('loading').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('demo-banner').classList.toggle('hidden', !isDemo);

  state.page = -1;
  setActive(0);
  renderAll();
  // התחלה בעמוד הבית (חשוב ב-RTL, שבו ההיסט ההתחלתי אינו בהכרח 0)
  requestAnimationFrame(() => snapToPage(0, false));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
