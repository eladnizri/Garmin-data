'use strict';

/* =========================================================================
 * app.js — אפליקציית עמוד יחיד: בית · שינה · לב והתאוששות · פעילות.
 * מסתמך על common.js (C, loadHealthData, avg, vals, fmt, shortDate,
 * longDate, minToHm, pearson, $).
 * ========================================================================= */

const state = { data: [], isDemo: false, range: 30, page: 0 };
const charts = {};
/* Chart.defaults מוגדרים ב-common.js (מקור יחיד) */

/* העדפת תנועה מופחתת — מדלגים על אנימציות (טבעת, ספירה עולה) */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* דגל לדיכוי אנימציית כניסה של הגרפים בעת רינדור חוזר (שינוי טווח) */
let chartAnim = true;

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
function maxHR() { return profile.age ? 220 - Number(profile.age) : null; }

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

function baselineOf(key) {
  let rows = state.data.slice(-30);
  // היום החלקי לא נכנס לבסיס של מדד מצטבר
  if (CUMULATIVE.has(key) && rows[rows.length - 1]?.date === todayISO()) rows = rows.slice(0, -1);
  const v = vals(rows, key);
  if (v.length < 5) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length, min: Math.min(...v), max: Math.max(...v) };
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
 * ספרקליין זעיר (SVG) — קל בהרבה ממופע Chart.js לכל שורה
 * ========================================================================= */
function sparkSvg(key, color) {
  const v = state.data.slice(-14).map(r => r[key]).filter(x => x !== undefined);
  const nums = v.filter(x => x !== null);
  if (nums.length < 2) return '';
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const W = 62, H = 26, pad = 3;
  const pts = v.map((x, i) => {
    if (x === null) return null;
    const px = (i / (v.length - 1)) * W;
    const py = H - pad - ((x - min) / span) * (H - pad * 2);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).filter(Boolean);
  return `<svg class="d-spark" viewBox="0 0 ${W} ${H}" fill="none" aria-hidden="true">
    <polyline points="${pts.join(' ')}" stroke="${color}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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

function renderHero() {
  const official = latest('readiness_score', 2);
  const score = official ?? heuristicReadiness();
  const el = $('hero');
  if (score === null) {
    el.innerHTML = `<div class="hero-body"><div class="hero-verdict">בהמתנה לנתונים</div>
      <div class="hero-note">הסנכרון היומי ימלא את הציון.</div></div>`;
    return;
  }
  // ההערה מסבירה *ממה* מורכב הציון — לא חוזרת על פסק הדין
  const level = latest('readiness_level', 2);
  // המשוב הרשמי של גרמין מקבל עדיפות, עם נפילה חיננית לרמה או לנהגים
  const feedbackTok = latest('readiness_feedback', 2);
  const feedback = feedbackTok ? READINESS_FEEDBACK[feedbackTok] : null;
  const drivers = [];
  const s3 = avg(state.data.slice(-3), 'sleep_score');
  if (s3 !== null) drivers.push(`שינה ${fmt(s3)}`);
  const st3 = avg(state.data.slice(-3), 'stress_avg');
  if (st3 !== null) drivers.push(`מתח ${fmt(st3)}`);
  const hv = latest('hrv'); if (hv !== null) drivers.push(`HRV ${fmt(hv)}`);
  const note = feedback
    ? feedback
    : (official !== null && level
      ? `רמת מוכנות לפי גרמין: ${READINESS_LEVEL[level] || level}`
      : (drivers.length ? drivers.join(' · ') : 'לפי 3 הימים האחרונים'));
  const last = lastRow();
  el.innerHTML = `
    <div class="ring">${ringSvg(score)}<div class="ring-txt"><b>0</b><span>מוכנות</span></div></div>
    <div class="hero-body">
      <div class="hero-verdict">${verdictOf(score)}</div>
      <div class="hero-note">${note}</div>
      <div class="hero-src">${official !== null ? 'ציון רשמי של גרמין' : 'הערכה משוקללת'} · ${last.date ? longDate(last.date) : ''}</div>
    </div>`;
  // הנפשת הטבעת (rAF כדי לתת ל-CSS להנפיש מהמצב ההתחלתי) והספירה העולה
  const valCircle = el.querySelector('.ring-val');
  const scoreEl = el.querySelector('.ring-txt b');
  requestAnimationFrame(() => {
    if (valCircle) valCircle.setAttribute('stroke-dashoffset', valCircle.dataset.target);
    countUp(scoreEl, score);
  });
}

/* =========================================================================
 * שורות תחומים — כל מספר מופיע כאן פעם אחת
 * ========================================================================= */
const DOMAINS = [
  { page: 1, key: 'sleep_hours', name: 'שינה', emoji: '🌙', color: C.blue,
    fmtv: v => `${fmt(v, 1)}<small>שעות</small>` },
  { page: 2, key: 'rhr', name: 'דופק מנוחה', emoji: '❤️', color: C.red,
    fmtv: v => `${fmt(v)}<small>bpm</small>` },
  { page: 2, key: 'hrv', name: 'שונות דופק (HRV)', emoji: '💚', color: C.green,
    fmtv: v => `${fmt(v)}<small>ms</small>` },
  { page: 3, key: 'steps', name: 'צעדים', emoji: '👣', color: C.violet,
    fmtv: v => `${fmt(v)}` },
];

function renderDomains() {
  $('domains').innerHTML = DOMAINS.map(d => {
    const s = statusOf(d.key);
    const v = s ? s.value : null;
    const lvl = s ? s.level : 'normal';
    return `<button class="domain" data-goto="${d.page}">
      <span class="d-ic" style="background:${d.color}1a">${d.emoji}</span>
      <span class="d-main">
        <span class="d-name">${d.name}</span>
        <span class="d-val">${v === null ? '—' : d.fmtv(v)}</span>
      </span>
      ${sparkSvg(d.key, d.color)}
      <span class="d-status s-${lvl}">${LEVEL_LABEL[lvl]}</span>
    </button>`;
  }).join('');
}

/* =========================================================================
 * חריגות
 * ========================================================================= */
function renderAnomalies() {
  const list = anomalies();
  const el = $('anomalies');
  if (!list.length) {
    el.innerHTML = `<div class="anom ok"><span class="anom-ic">✓</span>
      <span>כל המדדים <b>בטווח הרגיל שלך</b> בימים האחרונים.</span></div>`;
    return;
  }
  el.innerHTML = `<div class="anom-list">${list.map(s => {
    const d = METRICS[s.key];
    const base = s.base && s.base.mean !== undefined
      ? ` (הרגיל שלך: ${fmt(s.base.mean, d.dec)})` : '';
    return `<div class="anom ${s.level}"><span class="anom-ic">${s.level === 'alert' ? '⚠️' : '👀'}</span>
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

function renderHomeInsight() {
  const rows = state.data.slice(-30);
  const best = bestCorrelation(rows);
  const text = best
    ? (best.r < 0 ? best.neg : best.pos)
    : 'ככל שיצטברו יותר ימי מדידה, כאן יופיעו תובנות אישיות מהצלבת הנתונים שלך.';
  $('insight-home').innerHTML =
    `<div class="insight"><span class="i-ic">💡</span><p><b>תובנה:</b> ${text}</p></div>`;
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
  return parts.join('');
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
function line(rows, key, color, filled = true) {
  return {
    data: points(rows, key), borderColor: color, backgroundColor: color + '2e',
    borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: color,
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
      el.innerHTML = `<div class="tip-strip ${s.level}"><span>💡</span><span><b>טיפ:</b> ${tip}</span></div>`;
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
 * כרטיסים ייעודיים לנתונים החדשים (מוסתרים כשאין נתון)
 * ========================================================================= */
function renderBreathing() {
  const spo2 = latest('spo2_avg', 5), resp = latest('respiration_avg', 5), lowO2 = latest('spo2_low', 5);
  const el = $('sleep-breathing');
  if (spo2 === null && resp === null) { el.innerHTML = ''; return; }
  const rows = [];
  if (spo2 !== null) rows.push(`<li><span class="r-ic">🫁</span>
    <span><span class="r-name">רוויון חמצן ממוצע</span>${lowO2 !== null ? `<br><span class="r-sub">שפל ${lowO2}%</span>` : ''}</span>
    <span class="r-val">${fmt(spo2)}<small>%</small></span></li>`);
  if (resp !== null) rows.push(`<li><span class="r-ic">💨</span>
    <span class="r-name">קצב נשימה בשינה</span>
    <span class="r-val">${fmt(resp, 1)}<small>נשימות/דק׳</small></span></li>`);
  el.innerHTML = `<article class="card"><div class="card-head"><h2>נשימה וחמצן בלילה</h2>
    <span class="unit">מהמדידה האחרונה</span></div><ul class="rows">${rows.join('')}</ul></article>`;
}

const READINESS_FACTORS = [
  ['readiness_sleep', 'שינה', '🌙'], ['readiness_sleep_history', 'היסטוריית שינה', '📅'],
  ['readiness_recovery', 'התאוששות', '🔄'], ['readiness_hrv', 'HRV', '💚'],
  ['readiness_stress', 'היסטוריית מתח', '🔥'], ['readiness_load', 'עומס אימונים', '🏋️'],
];
function renderReadinessFactors() {
  const el = $('readiness-factors');
  const rows = READINESS_FACTORS.map(([key, name, emoji]) => {
    const v = latest(key, 2);
    if (v === null) return null;
    return `<li><span class="r-ic">${emoji}</span><span class="r-name" style="min-width:88px">${name}</span>
      <span class="fbar"><i style="width:${clamp(v, 0, 100)}%"></i></span>
      <span class="r-val" style="min-width:38px">${fmt(v)}<small>%</small></span></li>`;
  }).filter(Boolean);
  const recovery = latest('recovery_hours', 2);
  el.innerHTML = rows.length
    ? `<article class="card"><div class="card-head"><h2>ממה מורכב ציון המוכנות</h2>
        ${recovery !== null ? `<span class="unit">זמן התאוששות ${fmt(recovery)} ש׳</span>` : ''}</div>
        <ul class="rows">${rows.join('')}</ul></article>` : '';
}

const TRAINING_STATUS = {
  PRODUCTIVE: 'מתקדם', PRODUCTIVE_1: 'מתקדם', MAINTAINING: 'שומר על הקיים',
  MAINTAINING_1: 'שומר על הקיים', PEAKING: 'בשיא', OVERREACHING: 'יתר-אימון',
  UNPRODUCTIVE: 'לא פורה', DETRAINING: 'ירידה בכושר', RECOVERY: 'התאוששות',
  STRAINED: 'עומס יתר', NO_STATUS: 'אין סטטוס',
};
function renderFitness() {
  const vo2 = latest('vo2max', 10), age = latest('fitness_age', 10), st = latest('training_status', 10);
  const el = $('fitness-card');
  if (vo2 === null && age === null && st === null) { el.innerHTML = ''; return; }
  const chips = [];
  if (vo2 !== null) chips.push(`<div class="chip"><span>🫀</span><b>${fmt(vo2, 1)}</b><small>VO2 Max</small></div>`);
  if (age !== null) chips.push(`<div class="chip"><span>🎂</span><b>${fmt(age)}</b><small>גיל כושר</small></div>`);
  if (st !== null) {
    const key = String(st).toUpperCase().replace(/[^A-Z_0-9]/g, '');
    chips.push(`<div class="chip"><span>📈</span><b style="font-size:.74rem">${TRAINING_STATUS[key] || st}</b><small>סטטוס אימון</small></div>`);
  }
  el.innerHTML = `<article class="card"><div class="card-head"><h2>כושר ומגמה</h2>
    <span class="unit">לפי גרמין</span></div><div class="chips">${chips.join('')}</div></article>`;
}

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
    return `<li><span class="r-ic">🏃</span>
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
    el.innerHTML = `<button class="prompt-card" id="open-profile"><span style="font-size:1.3rem">👤</span>
      <span><span class="pc-t">השלם פרופיל אישי</span><br><span class="pc-v">גיל, גובה ומשקל — לניתוח ויעדים מדויקים יותר</span></span>
      <span class="pc-arrow">‹</span></button>`;
    return;
  }
  const chips = [];
  if (b) chips.push(`<div class="chip"><span>⚖️</span><b>${b.toFixed(1)}</b><small>BMI · ${bmiCat(b)}</small></div>`);
  if (mh) chips.push(`<div class="chip"><span>❤️</span><b>${mh}</b><small>דופק מקס׳</small></div>`);
  chips.push(`<div class="chip"><span>🌙</span><b>${fmt(goalSleep(), Number.isInteger(goalSleep()) ? 0 : 1)}</b><small>יעד שינה</small></div>`);
  chips.push(`<div class="chip"><span>👣</span><b>${fmt(goalSteps())}</b><small>יעד צעדים</small></div>`);
  el.innerHTML = `<article class="card"><div class="body-head"><h2>הפרופיל שלי</h2>
    <button class="link-btn" id="open-profile">עריכה</button></div><div class="chips">${chips.join('')}</div></article>`;
}

function renderHrZones() {
  const el = $('hr-zones'), mh = maxHR();
  if (!mh) { el.innerHTML = ''; return; }
  const zones = [[50, 60, 'התאוששות', C.teal], [60, 70, 'שריפת שומן', C.blue],
                 [70, 80, 'אירובי', C.green], [80, 90, 'אנאירובי', C.orange], [90, 100, 'מקסימלי', C.red]];
  el.innerHTML = `<article class="card"><div class="card-head"><h2>אזורי דופק לאימון</h2>
    <span class="unit">דופק מקס׳ ${mh}</span></div><ul class="rows">${zones.map(z =>
      `<li><span class="zdot" style="background:${z[3]}"></span><span class="r-name">${z[2]}</span>
       <span class="r-val">${Math.round(mh * z[0] / 100)}–${Math.round(mh * z[1] / 100)}<small>bpm</small></span></li>`).join('')}</ul></article>`;
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
function renderWeight() {
  const el = $('weight-card');
  const last = latestWeight();
  if (!last) {
    el.innerHTML = `<button class="prompt-card" id="open-weight"><span style="font-size:1.3rem">⚖️</span>
      <span><span class="pc-t">התחל מעקב משקל שבועי</span><br><span class="pc-v">שקילה אחת בשבוע מספיקה למגמה אמינה</span></span>
      <span class="pc-arrow">‹</span></button>`;
    return;
  }
  const deltas = [deltaChip('מהשקילה הקודמת', weights.length >= 2 ? weights[weights.length - 2] : null),
                  deltaChip('מלפני חודש', weightAt(30))].filter(Boolean).join('');
  const daysSince = Math.floor((new Date(todayISO()) - new Date(last.date)) / 86400000);
  const nudge = daysSince > 7 ? `<div class="weight-nudge">⏳ עברו ${daysSince} ימים מהשקילה האחרונה</div>` : '';
  const chart = weights.length >= 3 ? '<div class="chart-wrap chart-sm" dir="ltr" style="height:120px;margin-top:10px"><canvas id="chart-weight"></canvas></div>' : '';
  el.innerHTML = `<article class="card">
    <div class="body-head"><h2>משקל</h2><button class="link-btn" id="open-weight">+ שקילה</button></div>
    <div class="weight-top"><div><div class="weight-val">${fmt(last.kg, 1)}<small>ק״ג</small></div>
      <div class="sh-base">עודכן ${shortDate(last.date)}</div></div></div>
    ${deltas ? `<div class="weight-deltas">${deltas}</div>` : ''}
    ${nudge}${chart}</article>`;
  if (weights.length >= 3) {
    make('chart-weight', {
      type: 'line',
      data: { labels: weights.map(w => shortDate(w.date)),
        datasets: [{ data: weights.map(w => ({ x: shortDate(w.date), y: w.kg, iso: w.date })),
          borderColor: C.teal, backgroundColor: C.teal + '2e', borderWidth: 2.5, pointRadius: 3,
          pointBackgroundColor: C.teal, tension: .3, fill: true }] },
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
  const streakLine = streak >= 2 ? `<div class="strength-streak">🔥 ${streak} שבועות ברצף ביעד</div>` : '';

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

  el.innerHTML = `<article class="card"><div class="card-head"><h2>השבוע שלי</h2>
    <span class="unit">מול השבוע הקודם</span></div><div class="ws-grid">${chips.join('')}</div></article>`;
}

/* =========================================================================
 * מודאל פרופיל
 * ========================================================================= */
const PROFILE_FIELDS = ['age', 'heightCm', 'weightKg', 'sleepGoal', 'stepsGoal', 'strengthGoal'];
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
  saveStrength();
  renderStrength(); renderWeekSummary();
});

/* =========================================================================
 * רינדור כולל
 * ========================================================================= */
function renderAll() {
  document.querySelectorAll('.seg-btn').forEach(b => {
    const v = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
    b.classList.toggle('active', v === state.range);
  });

  // בית
  renderHero();
  renderDomains();
  renderAnomalies();
  renderWeekSummary();
  renderHomeInsight();
  renderWeight();
  renderBody();

  // עמודי פירוט
  statHero('sleep-hero', 'sleep_hours');
  statHero('heart-hero', 'hrv', hrvExtra());
  statHero('steps-hero', 'steps');
  renderStrength();
  renderCharts();
  renderBreathing();
  renderReadinessFactors();
  renderFitness();
  renderWorkouts();
  renderHrZones();

  verdictCard('sleep-insight', 'מה זה אומר', ['sleep_hours', 'sleep_score']);
  verdictCard('heart-insight', 'מה זה אומר', ['rhr', 'hrv', 'stress_avg']);
  verdictCard('steps-insight', 'מה זה אומר', ['steps']);

  const rows = visibleRows();
  const bestSleep = extremeDay(rows, 'sleep_score', 'max');
  const longest = extremeDay(rows, 'sleep_hours', 'max');
  const sleepStreak = trailingStreak(rows, r => r.sleep_score != null && r.sleep_score >= 80);
  renderRecords('sleep-records', [
    bestSleep && recCard('⭐', fmt(bestSleep.v), `הלילה הטוב · ${shortDate(bestSleep.date)}`),
    longest && recCard('🛏️', `${fmt(longest.v, 1)}ש׳`, `הארוך ביותר · ${shortDate(longest.date)}`),
    sleepStreak >= 2 && recCard('🔥', `${sleepStreak}`, 'רצף לילות 80+'),
  ]);

  const lowRhr = extremeDay(rows, 'rhr', 'min');
  const hiHrv = extremeDay(rows, 'hrv', 'max');
  const calm = extremeDay(rows, 'stress_avg', 'min');
  renderRecords('heart-records', [
    lowRhr && recCard('❤️', fmt(lowRhr.v), `דופק נמוך · ${shortDate(lowRhr.date)}`),
    hiHrv && recCard('💚', fmt(hiHrv.v), `HRV גבוה · ${shortDate(hiHrv.date)}`),
    calm && recCard('🧘', fmt(calm.v), `הכי רגוע · ${shortDate(calm.date)}`),
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
    bestSteps && recCard('👣', fmt(bestSteps.v), `היום הפעיל · ${shortDate(bestSteps.date)}`),
    stepStreak >= 2 && recCard('🔥', `${stepStreak}`, 'רצף ימים ביעד'),
    totalSteps > 0 && recCard('📊', fmt(totalSteps), 'סה״כ בתקופה'),
    avgCal && recCard('🔥', fmt(avgCal), 'קק״ל ליום בממוצע'),
    totalFloors > 0 && recCard('🪜', fmt(totalFloors), 'קומות בתקופה'),
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
$('domains').addEventListener('click', e => {
  const b = e.target.closest('[data-goto]');
  if (b) goTo(Number(b.dataset.goto));
});

let raf = null;
pager.addEventListener('scroll', () => {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = null; setActive(currentIndex()); });
}, { passive: true });

$('range-filter').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  state.range = b.dataset.range === 'all' ? 'all' : Number(b.dataset.range);
  // בלי אנימציית כניסה בבנייה מחדש של 6 גרפים — מונע תקיעה בזמן החלפת טווח
  chartAnim = false; renderAll(); chartAnim = true;
});

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
