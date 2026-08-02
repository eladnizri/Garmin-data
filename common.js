'use strict';

/* =========================================================================
 * common.js — קוד משותף לכל העמודים (דשבורד + ניתוח)
 *
 * DATA_URL — מאיפה נטענים הנתונים. ברירת המחדל: קובץ ה-JSON שמתעדכן
 * אוטומטית ע"י ה-GitHub Action. אפשר להחליף לכתובת CSV ציבורית של
 * Google Sheets (File → Share → Publish to web → CSV) — הקוד מזהה לבד.
 * ========================================================================= */
const DATA_URL = 'data/health.json';
const SLEEP_GOAL_HOURS = 8;
const STEPS_GOAL = 10000;

/* צבעי סדרות — עברו ולידציית נגישות מול משטח לבן (#ffffff) */
const C = {
  blue: '#2a78d6',    // צבע ראשי — שינה, Body Battery, שינה עמוקה
  teal: '#1baf7a',    // שינה קלה
  violet: '#4a3aa7',  // REM
  green: '#008300',   // HRV
  red: '#e34948',     // דופק מנוחה
  orange: '#eb6834',  // סטרס
  ink: '#0f172a',
  ink2: '#475569',
  muted: '#94a3b8',
  grid: '#e8edf3',
  surface: '#ffffff',
};

/* =========================================================================
 * נתוני דמו — 14 ימים אחרונים, נוצרים דטרמיניסטית כדי שהעמוד יעבוד
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

async function fetchRows() {
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

/* מחזיר { data, isDemo } — נופל אוטומטית לנתוני דמו אם הטעינה נכשלה */
async function loadHealthData() {
  try {
    return { data: await fetchRows(), isDemo: false };
  } catch (err) {
    console.warn('טעינת נתונים נכשלה, עובר לנתוני דמו:', err.message);
    return { data: buildMockData(), isDemo: true };
  }
}

/* =========================================================================
 * עזרים כלליים
 * ========================================================================= */
const $ = id => document.getElementById(id);

function vals(rows, key) {
  return rows.map(r => r[key]).filter(v => v !== null && v !== undefined && !Number.isNaN(v));
}

function avg(rows, key) {
  const v = vals(rows, key);
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function fmt(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
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

/* מקדם מתאם פירסון בין שני שדות (על ימים שבהם שניהם קיימים) */
function pearson(rows, keyA, keyB) {
  const pairs = rows
    .map(r => [r[keyA], r[keyB]])
    .filter(([a, b]) => a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b));
  const n = pairs.length;
  if (n < 5) return { r: null, n };
  const mean = i => pairs.reduce((s, p) => s + p[i], 0) / n;
  const ma = mean(0), mb = mean(1);
  let num = 0, da = 0, db = 0;
  for (const [a, b] of pairs) {
    num += (a - ma) * (b - mb);
    da += (a - ma) ** 2;
    db += (b - mb) ** 2;
  }
  if (da === 0 || db === 0) return { r: null, n };
  return { r: num / Math.sqrt(da * db), n };
}

/* הגדרות ברירת מחדל ל-Chart.js (אם נטען) */
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.color = C.ink2;
  Chart.defaults.borderColor = C.grid;
  Chart.defaults.animation.duration = 400;
}
