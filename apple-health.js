/* =========================================================================
 * apple-health.js — קריאת ריצות מתוך ייצוא הבריאות של האייפון
 *
 * הייצוא (Health ← הפרופיל ← "ייצוא כל הנתונים") הוא ZIP שבתוכו export.xml —
 * קובץ של מאות מגה־בייט שרובו רשומות דופק וצעדים בתדירות של שניות. אנחנו
 * צריכים ממנו רק את אלמנטי ה-<Workout> מסוג ריצה, ולכן סורקים אותו כזרם:
 * קוראים נתח, שולפים ממנו כל אלמנט שלם, וזורקים את מה שכבר עובד. כך הזיכרון
 * נשאר קטן והדפדפן בטלפון מחזיק מעמד.
 *
 * למה regex ולא DOMParser: DOMParser טוען את כל המסמך לזיכרון בבת אחת ונופל
 * על קובץ בגודל הזה. המבנה של אלמנט Workout שטוח ומוכר, ולכן סריקה טקסטואלית
 * מספיקה — ובכל זאת אנחנו מוצאים את גבולות האלמנט בזהירות ולא מניחים שורה אחת.
 * ========================================================================= */

const AH_RUN_TYPE = 'HKWorkoutActivityTypeRunning';
const AH_MI_TO_KM = 1.609344;
/* קצב סביר לריצה, בשניות לק״מ — מסנן רשומות פגומות ורשומות שהן בעצם הליכה */
const AH_MIN_PACE = 150, AH_MAX_PACE = 900;

/* כל התכונות של תגית פתיחה, בבת אחת — זול יותר מ-regex לכל שדה בנפרד */
function ahAttrs(tag) {
  const out = {};
  const re = /([\w:]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[2];
  return out;
}

const ahNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* אלמנט <Workout> אחד → רשומת ריצה בסכמה של האפליקציה, או null אם לא רלוונטי */
function ahRunFrom(el, sinceISO) {
  const headEnd = el.indexOf('>');
  const a = ahAttrs(el.slice(0, headEnd + 1));
  if (a.workoutActivityType !== AH_RUN_TYPE) return null;

  const date = (a.startDate || '').split(' ')[0].split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < sinceISO) return null;

  let minutes = ahNum(a.duration);
  if (minutes != null && /sec/i.test(a.durationUnit || '')) minutes /= 60;
  let km = ahNum(a.totalDistance);
  if (km != null && /mi/i.test(a.totalDistanceUnit || '')) km *= AH_MI_TO_KM;
  let calories = ahNum(a.totalEnergyBurned);
  let avgHr = null, maxHr = null;

  // מ-iOS 16 הסכומים והדופק עברו לאלמנטי WorkoutStatistics ואינם על התגית עצמה
  const re = /<WorkoutStatistics\b([^>]*)>/g;
  let m;
  while ((m = re.exec(el))) {
    const s = ahAttrs(m[1]);
    const t = s.type || '';
    if (t === 'HKQuantityTypeIdentifierHeartRate') {
      avgHr = ahNum(s.average) ?? avgHr;
      maxHr = ahNum(s.maximum) ?? maxHr;
    } else if (t === 'HKQuantityTypeIdentifierDistanceWalkingRunning' && km == null) {
      km = ahNum(s.sum);
      if (km != null && /mi/i.test(s.unit || '')) km *= AH_MI_TO_KM;
    } else if (t === 'HKQuantityTypeIdentifierActiveEnergyBurned' && calories == null) {
      calories = ahNum(s.sum);
    }
  }

  if (!km || !minutes || km < 0.3 || minutes < 3) return null;
  const pace = Math.round(minutes * 60 / km);
  if (pace < AH_MIN_PACE || pace > AH_MAX_PACE) return null;

  const run = { date, km: Math.round(km * 100) / 100, minutes: Math.round(minutes), pace_s: pace, src: 'apple' };
  if (avgHr) run.avg_hr = Math.round(avgHr);
  if (maxHr) run.max_hr = Math.round(maxHr);
  if (calories) run.calories = Math.round(calories);
  return run;
}

/* שולף מהחוצץ כל <Workout> שהגיע במלואו ומחזיר את השארית לסבב הבא */
function ahDrain(buf, runs, sinceISO) {
  for (;;) {
    // [\s>] כדי לא להיתפס על WorkoutStatistics / WorkoutEvent / WorkoutRoute
    const m = /<Workout[\s>]/.exec(buf);
    // אין אלמנט מתחיל — שומרים זנב קצר למקרה שהתגית עצמה נחתכה בין נתחים
    if (!m) return buf.length > 64 ? buf.slice(-64) : buf;

    const start = m.index;
    const gt = buf.indexOf('>', start);
    if (gt === -1) return buf.slice(start);
    let end;
    if (buf[gt - 1] === '/') {
      end = gt + 1;                                  // תגית סוגרת־עצמה, בלי ילדים
    } else {
      const close = buf.indexOf('</Workout>', gt);
      if (close === -1) return buf.slice(start);     // האלמנט עוד לא הסתיים
      end = close + '</Workout>'.length;
    }
    const run = ahRunFrom(buf.slice(start, end), sinceISO);
    if (run) runs.push(run);
    buf = buf.slice(end);
  }
}

/* אותה ריצה נשמרת באפל כמה פעמים — מהשעון, מהטלפון ומאפליקציות צד ג׳.
 * מאחדים לפי יום ומרחק מעוגל, ומעדיפים את הרשומה שיש בה דופק. */
function ahDedupe(runs) {
  const best = new Map();
  for (const r of runs) {
    const key = `${r.date}|${Math.round(r.km * 10)}`;
    const cur = best.get(key);
    if (!cur || (!cur.avg_hr && r.avg_hr)) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* מנתח את export.xml ומחזיר מערך ריצות.
 * opts: { sinceISO, onProgress(pct, found) } */
async function parseAppleRuns(file, opts = {}) {
  const sinceISO = opts.sinceISO || '0000-00-00';
  const onProgress = opts.onProgress || (() => {});
  const runs = [];
  let buf = '';

  // זרם ולא file.text(): TextDecoder עם stream מטפל גם בתו UTF-8 שנחתך בין נתחים
  const reader = file.stream().getReader();
  const dec = new TextDecoder('utf-8');
  let read = 0, lastTick = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    buf = ahDrain(buf + dec.decode(value, { stream: true }), runs, sinceISO);
    // עדכון מסך פעם בכ-4MB — מספיק כדי שייראה חי, בלי להחניק את הרינדור
    if (read - lastTick > 4e6) {
      lastTick = read;
      onProgress(Math.min(99, Math.round(read / file.size * 100)), runs.length);
      await new Promise(r => setTimeout(r));
    }
  }
  ahDrain(buf + dec.decode(), runs, sinceISO);
  onProgress(100, runs.length);
  return ahDedupe(runs);
}
