'use strict';

/* =========================================================================
 * analysis.js — עמוד הניתוח המקצועי.
 * מסתמך על common.js (C, loadHealthData, avg, fmt, longDate, pearson, $ ...).
 *
 * הרעיון: לכל מדד מסבירים "מה זה", מחשבים לאן הוא נע אצל המשתמש בתקופה
 * שנבחרה, ומתאימים הסבר על מה שינוי בכיוון הזה עשוי להשפיע. בנוסף
 * מחשבים מדד מוכנות כללי והצלבות (מתאם) בין מדדים כדי להפיק תובנה אישית.
 * ========================================================================= */

const state = { data: [], isDemo: false, range: 30 };
const sparks = {};  // מופעי Chart.js של הסְפַּרְקליינים

function visibleRows() {
  if (state.range === 'all') return state.data;
  return state.data.slice(-state.range);
}
function previousRows() {
  if (state.range === 'all') return [];
  const n = state.range;
  return state.data.slice(-2 * n, -n);
}

/* =========================================================================
 * הגדרות המדדים — תוכן מקצועי בעברית
 * goodUp: האם ערך גבוה יותר הוא הכיוון החיובי.
 * affects.rise / affects.fall: על מה עלייה / ירידה עשויות להצביע ולהשפיע.
 * ========================================================================= */
const METRICS = [
  {
    key: 'sleep_hours', icon: '🛏️', title: 'שעות שינה', unit: 'שעות',
    decimals: 1, goodUp: true, color: C.blue,
    what: 'משך השינה הכולל בלילה. בזמן הזה הגוף משקם רקמות, מגבש זיכרון ומאזן הורמונים. ' +
          'ההמלצה למבוגר היא 7–9 שעות. פחות מ-6 שעות באופן קבוע נחשב לחוב שינה מצטבר.',
    affects: {
      rise: 'עלייה בשעות השינה בדרך כלל משפרת את ההתאוששות מאימונים, מייצבת את מצב הרוח ומחדדת ' +
            'ריכוז וזמן תגובה. המשך כך — עקביות חשובה יותר מלילה בודד ארוך.',
      fall: 'ירידה מתמשכת בשעות השינה פוגעת בריכוז ובזמן התגובה, מאטה התאוששות שריר, ומעלה את ' +
            'הורמון הרעב (גרלין) — מה שעלול להוביל לאכילת יתר. גם המערכת החיסונית נחלשת.',
    },
    tips: [
      'שמור על שעת שינה ויקיצה קבועה — גם בסופ"ש.',
      'הימנע ממסכים וקפאין 1–2 שעות לפני השינה.',
      'חדר חשוך וקריר (18–20°C) משפר שינה עמוקה.',
    ],
  },
  {
    key: 'sleep_score', icon: '⭐', title: 'ציון שינה (Sleep Score)', unit: '/100',
    decimals: 0, goodUp: true, color: C.blue,
    what: 'ציון מורכב (0–100) שגרמין מחשב משילוב של משך השינה, שלבי השינה (עמוקה/קלה/REM), ' +
          'תנועתיות ורוגע הלב בלילה. 90+ מצוין, 80–89 טוב, 60–79 בינוני, מתחת ל-60 חלש.',
    affects: {
      rise: 'ציון עולה מעיד שאיכות השינה משתפרת — לא רק הכמות. זה סימן טוב להתאוששות הכוללת.',
      fall: 'ציון יורד למרות מספר שעות סביר מרמז על שינה מקוטעת או מעט מדי שינה עמוקה/REM. ' +
            'שווה לבדוק לחץ, אלכוהול, ארוחה כבדה או פעילות מאוחרת בערב.',
    },
    tips: [
      'שינה עמוקה מושפעת מפעילות גופנית סדירה במהלך היום.',
      'אלכוהול בערב פוגע דווקא בשלב ה-REM.',
    ],
  },
  {
    key: 'rhr', icon: '❤️', title: 'דופק מנוחה (RHR)', unit: 'bpm',
    decimals: 0, goodUp: false, color: C.red,
    what: 'מספר פעימות הלב בדקה במנוחה מלאה (נמדד בעיקר בלילה). מדד מרכזי לכושר לב-ריאה: ' +
          'ככל שהוא נמוך יותר, בדרך כלל הלב יעיל יותר. טווח טיפוסי למבוגר 40–70; ספורטאים לרוב 40–55.',
    affects: {
      rise: 'עלייה מתמשכת (כמה ימים ברצף) בדופק המנוחה יכולה להצביע על עייפות מצטברת, לחץ נפשי, ' +
            'התייבשות, אימון יתר, או תחילת מחלה. זהו אחד הסימנים המוקדמים ששווה לתת לו תשומת לב.',
      fall: 'ירידה בדופק המנוחה היא בדרך כלל סימן חיובי — שיפור בכושר האירובי ובהתאוששות של הגוף.',
    },
    tips: [
      'שתייה מספקת לאורך היום מורידה עומס מהלב.',
      'עלייה של 5+ פעימות מהבסיס האישי לכמה ימים — סימן להאט ולנוח.',
    ],
  },
  {
    key: 'hrv', icon: '💚', title: 'שונות דופק (HRV)', unit: 'ms',
    decimals: 0, goodUp: true, color: C.green,
    what: 'ההבדל בזמן שבין פעימת לב לפעימה. משקף את איזון מערכת העצבים האוטונומית. ' +
          'HRV גבוה מעיד על מערכת פארא-סימפתטית (מנוחה/התאוששות) פעילה — כלומר גוף מאושש. ' +
          'המדד אישי מאוד: השווה לבסיס שלך, לא לאחרים.',
    affects: {
      rise: 'עלייה ב-HRV מעל הבסיס האישי שלך מעידה בדרך כלל על התאוששות טובה ומוכנות גבוהה ' +
            'לפעילות אינטנסיבית. זה יום טוב לאתגר את הגוף.',
      fall: 'ירידה ב-HRV מתחת לבסיס שלך יכולה להעיד על לחץ, עייפות, אימון יתר, שתיית אלכוהול ' +
            'או תחילת מחלה. אם היא נמשכת — עדיף יום קל יותר והתמקדות בהתאוששות.',
    },
    tips: [
      'נשימות איטיות ומדיטציה מעלות HRV לאורך זמן.',
      'אלכוהול ואוכל כבד בלילה מורידים משמעותית את ה-HRV הלילי.',
    ],
  },
  {
    key: 'stress_avg', icon: '🔋', title: 'רמת מתח (Stress)', unit: '/100',
    decimals: 0, goodUp: false, color: C.orange,
    what: 'הערכת גרמין לרמת מתח (0–100) על בסיס ניתוח HRV לאורך היום. ' +
          '0–25 מנוחה, 26–50 נמוך, 51–75 בינוני, 76–100 גבוה. המדד משקלל עומס פיזי ונפשי כאחד.',
    affects: {
      rise: 'רמות מתח גבוהות לאורך זמן קשורות לשחיקה, לשינה פחות איכותית וללחץ דם מוגבר. ' +
            'חשוב לשלב הפוגות התאוששות פעילות במהלך היום — לא רק בסוף.',
      fall: 'ירידה ברמת המתח מעידה על איזון טוב יותר בין עומס להתאוששות. הגוף מקבל יותר זמן להתאושש.',
    },
    tips: [
      'הפסקות נשימה קצרות במהלך היום מורידות מתת מצטבר.',
      'פעילות גופנית מתונה מורידה מתח בסיסי, אך אימון עצים מעלה אותו זמנית.',
    ],
  },
  {
    key: 'steps', icon: '👣', title: 'צעדים ופעילות', unit: '',
    decimals: 0, goodUp: true, color: C.violet,
    what: 'מספר הצעדים היומי הוא מדד לפעילות הכוללת. יעד נפוץ 8,000–10,000 צעדים. ' +
          'ארגון הבריאות העולמי ממליץ על 150 דקות פעילות מתונה בשבוע.',
    affects: {
      rise: 'עלייה בפעילות היומית תומכת בבריאות הלב, במצב הרוח ובאיכות השינה — וגם בשריפת אנרגיה.',
      fall: 'ירידה בפעילות לאורך זמן עלולה לפגוע בכושר, במצב הרוח ובאיכות השינה. ' +
            'גם הליכות קצרות מפוזרות במהלך היום עוזרות.',
    },
    tips: [
      'הליכה של 10 דקות אחרי ארוחה מווסתת סוכר ומשפרת עיכול.',
      'עדיף פעילות מפוזרת על פני היום מאשר "הכל בבת אחת".',
    ],
  },
];

/* =========================================================================
 * מגמה של מדד: השוואת ממוצע התקופה לממוצע התקופה הקודמת
 * ========================================================================= */
function trendOf(def) {
  const rows = visibleRows();
  const prev = previousRows();
  const current = avg(rows, def.key);
  const before = avg(prev, def.key);
  if (current === null) return { current: null };

  if (before === null) return { current, dir: 'flat', hasPrev: false };

  const diff = current - before;
  const shownAbs = fmt(Math.abs(diff), def.decimals);
  const roundedToZero = Number(shownAbs.replace(/[^\d.]/g, '')) === 0;
  const pct = before !== 0 ? (diff / before) * 100 : 0;

  let dir = 'flat';
  if (!roundedToZero) dir = diff > 0 ? 'rise' : 'fall';

  const good = dir === 'flat' ? null : (def.goodUp ? diff > 0 : diff < 0);
  return { current, before, diff, pct, dir, good, hasPrev: true, shownAbs };
}

/* =========================================================================
 * מדד מוכנות כללי — הערכה משוקללת (heuristic), לא ציון רפואי
 * משלב: ציון שינה, היפוך רמת המתח, ו-HRV/RHR ביחס לבסיס האישי.
 * ========================================================================= */
function readinessScore() {
  const rows = visibleRows();
  const recent = rows.slice(-3);          // 3 הימים האחרונים
  const drivers = [];

  const parts = [];

  const sScore = avg(recent, 'sleep_score');
  if (sScore !== null) {
    parts.push({ w: 0.4, v: sScore });
    drivers.push({ color: C.blue, text: `ציון שינה אחרון ${fmt(sScore)}` });
  }

  const stress = avg(recent, 'stress_avg');
  if (stress !== null) {
    parts.push({ w: 0.3, v: 100 - stress });
    drivers.push({ color: C.orange, text: `רמת מתח ${fmt(stress)} (נמוך = טוב)` });
  }

  // HRV ביחס לבסיס האישי (ממוצע כל התקופה) → 50 ± סטייה
  const hrvRecent = avg(recent, 'hrv');
  const hrvBase = avg(rows, 'hrv');
  if (hrvRecent !== null && hrvBase) {
    const rel = clamp(50 + ((hrvRecent - hrvBase) / hrvBase) * 250, 0, 100);
    parts.push({ w: 0.2, v: rel });
    const sign = hrvRecent >= hrvBase ? 'מעל' : 'מתחת ל';
    drivers.push({ color: C.green, text: `HRV ${fmt(hrvRecent)} — ${sign}בסיס שלך (${fmt(hrvBase)})` });
  }

  // RHR ביחס לבסיס — נמוך מהבסיס = חיובי
  const rhrRecent = avg(recent, 'rhr');
  const rhrBase = avg(rows, 'rhr');
  if (rhrRecent !== null && rhrBase) {
    const rel = clamp(50 + ((rhrBase - rhrRecent) / rhrBase) * 400, 0, 100);
    parts.push({ w: 0.1, v: rel });
    const sign = rhrRecent <= rhrBase ? 'מתחת ל' : 'מעל';
    drivers.push({ color: C.red, text: `דופק מנוחה ${fmt(rhrRecent)} — ${sign}בסיס שלך (${fmt(rhrBase)})` });
  }

  if (!parts.length) return null;
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  const score = Math.round(parts.reduce((s, p) => s + p.w * p.v, 0) / wsum);
  return { score, drivers };
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function verdictOf(score) {
  if (score >= 80) return { label: 'מצוין — הגוף מאושש', color: C.green };
  if (score >= 65) return { label: 'טוב — מוכנות סבירה', color: C.blue };
  if (score >= 50) return { label: 'בינוני — שווה לשים לב', color: C.orange };
  return { label: 'נמוך — עדיף יום התאוששות', color: C.red };
}

function renderReadiness() {
  const el = $('readiness');
  const r = readinessScore();
  if (!r) { el.innerHTML = '<p class="readiness-label">אין מספיק נתונים למדד מוכנות.</p>'; return; }
  const v = verdictOf(r.score);
  el.innerHTML = `
    <div class="readiness-top">
      <div>
        <div class="readiness-score" style="color:${v.color}">${r.score}<small>/100</small></div>
        <div class="readiness-label">מדד מוכנות משוקלל · 3 הימים האחרונים</div>
      </div>
      <div class="readiness-verdict" style="color:${v.color}">${v.label}</div>
    </div>
    <div class="meter"><div class="meter-fill" style="width:${r.score}%;background:${v.color}"></div></div>
    <ul class="readiness-drivers">
      ${r.drivers.map(d => `<li><span class="bullet" style="background:${d.color}"></span>${d.text}</li>`).join('')}
    </ul>`;
}

/* =========================================================================
 * כרטיסי תובנה + ספרקליין לכל מדד
 * ========================================================================= */
function sparkline(canvasId, rows, key, color) {
  sparks[canvasId]?.destroy();
  const data = rows.map(r => r[key] ?? null);
  sparks[canvasId] = new Chart($(canvasId), {
    type: 'line',
    data: {
      labels: rows.map(r => shortDate(r.date)),
      datasets: [{
        data, borderColor: color, borderWidth: 2,
        backgroundColor: color + '22',
        pointRadius: 0, tension: 0.35, fill: true, spanGaps: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, grace: '10%' } },
      elements: { line: { borderJoinStyle: 'round' } },
    },
  });
}

const TREND_WORD = { rise: 'עלייה', fall: 'ירידה', flat: 'יציבות' };

function renderInsights() {
  const rows = visibleRows();
  $('insights').innerHTML = METRICS.map(def => {
    const t = trendOf(def);
    const now = t.current === null ? '—' : fmt(t.current, def.decimals);

    let badge = '<span class="trend-badge flat">אין נתונים</span>';
    let trendText = 'אין מספיק נתונים בתקופה שנבחרה.';
    let affectKey = null;

    if (t.current !== null && t.hasPrev) {
      const cls = t.dir === 'flat' ? 'flat' : (t.good ? 'good' : 'bad');
      const arrow = t.dir === 'rise' ? '▲' : t.dir === 'fall' ? '▼' : '●';
      const pctTxt = t.dir === 'flat' ? '' : ` (${fmt(Math.abs(t.pct), 0)}%)`;
      badge = `<span class="trend-badge ${cls}">${arrow} ${TREND_WORD[t.dir]}${pctTxt}</span>`;

      if (t.dir === 'flat') {
        trendText = `הערך נשאר יציב סביב ${now}${def.unit ? ' ' + def.unit : ''} לעומת התקופה הקודמת — עקביות היא דבר טוב.`;
        affectKey = null;
      } else {
        const verdict = t.good ? 'כיוון חיובי עבורך' : 'כיוון ששווה לשים אליו לב';
        trendText = `${TREND_WORD[t.dir]} מ-${fmt(t.before, def.decimals)} ל-${now}${def.unit ? ' ' + def.unit : ''} ` +
                    `(${fmt(Math.abs(t.pct), 0)}%) לעומת התקופה הקודמת — ${verdict}.`;
        affectKey = t.dir;
      }
    } else if (t.current !== null) {
      badge = `<span class="trend-badge flat">ממוצע ${now}</span>`;
      trendText = `הממוצע בתקופה הוא ${now}${def.unit ? ' ' + def.unit : ''}. בחר "30 ימים" או "הכל" כדי לראות מגמה.`;
    }

    const affectHtml = affectKey ? `
      <div class="insight-block affect">
        <h4>💡 על מה זה עשוי להשפיע</h4>
        <p>${def.affects[affectKey]}</p>
      </div>` : '';

    const sparkId = `spark-${def.key}`;
    return `
      <div class="insight">
        <div class="insight-head">
          <span style="font-size:1.4rem">${def.icon}</span>
          <div>
            <div class="insight-title">${def.title}</div>
            ${badge}
          </div>
          <div class="insight-now"><b style="color:${def.color}">${now}</b><br><small>${def.unit || 'ממוצע'}</small></div>
        </div>
        <div class="insight-spark" dir="ltr"><canvas id="${sparkId}"></canvas></div>
        <div class="insight-block">
          <h4>📖 מה זה</h4>
          <p>${def.what}</p>
        </div>
        <div class="insight-block">
          <h4>📊 המגמה שלך</h4>
          <p>${trendText}</p>
        </div>
        ${affectHtml}
        <div class="insight-block">
          <h4>✅ טיפים</h4>
          <ul class="insight-tips">${def.tips.map(t => `<li>${t}</li>`).join('')}</ul>
        </div>
      </div>`;
  }).join('');

  // ציור הספרקליינים אחרי שה-DOM עודכן
  METRICS.forEach(def => sparkline(`spark-${def.key}`, rows, def.key, def.color));
}

/* =========================================================================
 * הצלבות נתונים (מתאם פירסון) עם פירוש מילולי
 * ========================================================================= */
const CORR_PAIRS = [
  {
    a: 'sleep_hours', b: 'rhr',
    neg: 'בלילות שבהם ישנת יותר, דופק המנוחה נטה להיות נמוך יותר — סימן שהשינה תומכת בהתאוששות הלב.',
    pos: 'בלילות שבהם ישנת יותר, דופק המנוחה דווקא נטה להיות גבוה יותר — לא הקשר הרגיל, שווה מעקב.',
  },
  {
    a: 'sleep_hours', b: 'hrv',
    pos: 'יותר שעות שינה הלכו יד ביד עם HRV גבוה יותר — כלומר שינה ארוכה משפרת את ההתאוששות של מערכת העצבים.',
    neg: 'יותר שעות שינה לוו דווקא ב-HRV נמוך יותר — קשר לא צפוי, ייתכן שגורם אחר (כמו מחלה) משפיע.',
  },
  {
    a: 'stress_avg', b: 'sleep_score',
    neg: 'בימים עם רמת מתח גבוהה, ציון השינה שלאחריהם נטה להיות נמוך יותר — מתח פוגע באיכות השינה.',
    pos: 'רמת מתח גבוהה וציון שינה גבוה הופיעו יחד — קשר לא שגרתי, שווה מעקב לאורך זמן.',
  },
  {
    a: 'steps', b: 'sleep_score',
    pos: 'בימים שבהם צעדת יותר, ציון השינה נטה להיות גבוה יותר — פעילות גופנית תומכת בשינה איכותית.',
    neg: 'ימים עם יותר צעדים לוו בציון שינה נמוך יותר — ייתכן שפעילות מאומצת מדי או מאוחרת מדי משפיעה.',
  },
  {
    a: 'sleep_score', b: 'hrv',
    pos: 'ציון שינה גבוה הלך יד ביד עם HRV גבוה — שני סימנים שמאשרים התאוששות איכותית.',
    neg: 'ציון שינה גבוה לווה דווקא ב-HRV נמוך — קשר לא צפוי בין המדדים.',
  },
  {
    a: 'stress_avg', b: 'body_battery_high',
    neg: 'בימים עם מתח גבוה, שיא ה-Body Battery היה נמוך יותר — מתח שוחק את מאגרי האנרגיה.',
    pos: 'מתח גבוה ו-Body Battery גבוה הופיעו יחד — קשר לא שגרתי.',
  },
];

function strengthLabel(abs) {
  if (abs >= 0.6) return 'קשר חזק';
  if (abs >= 0.45) return 'קשר בינוני';
  return 'קשר מתון';
}

function renderCorrelations() {
  const rows = visibleRows();
  const found = [];
  for (const pair of CORR_PAIRS) {
    const { r, n } = pearson(rows, pair.a, pair.b);
    if (r === null || Math.abs(r) < 0.3) continue;
    const text = r < 0 ? pair.neg : pair.pos;
    found.push({ text, r, n, abs: Math.abs(r) });
  }
  found.sort((x, y) => y.abs - x.abs);

  const el = $('correlations');
  if (!found.length) {
    el.innerHTML = `<div class="corr"><p>עדיין לא נמצאו קשרים מובהקים בין המדדים בתקופה שנבחרה. ` +
      `ככל שיצטברו יותר ימי מדידה (נסה "30 ימים" או "הכל"), התובנות כאן יהיו מדויקות יותר.</p></div>`;
    return;
  }
  el.innerHTML = found.slice(0, 4).map(f => `
    <div class="corr">
      <p>${f.text}</p>
      <div class="corr-meta">${strengthLabel(f.abs)} · מתאם ${f.r.toFixed(2)} · מבוסס על ${f.n} ימים</div>
    </div>`).join('');
}

/* =========================================================================
 * סינון ורינדור כולל
 * ========================================================================= */
function renderAll() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    const value = btn.dataset.range === 'all' ? 'all' : Number(btn.dataset.range);
    btn.classList.toggle('active', value === state.range);
  });
  renderReadiness();
  renderInsights();
  renderCorrelations();
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
    ? `מבוסס על נתונים עד ${longDate(last.date)} · ${state.data.length} ימי מדידה`
    : '';

  renderAll();
}

init();
