'use strict';
/* =========================================================================
 * hub.js — בקר המעטפת (מתג העולמות) + רינדור מסך-המרכז.
 * מסתמך על גלובלים מ-app.js/common.js (state, latest, verdictOf, fmt…),
 * ועל הודעת postMessage מאיפריים הכסף (kesef-summary).
 * ========================================================================= */
(function () {
  const moneyFrame = document.getElementById('money-frame');
  const WORLDS = ['health', 'hub', 'money']; // סדר פיזי משמאל לימין

  // גישה בטוחה ל-state (const לקסיקלי מ-app.js — לא נחשף על window)
  const getState = () => { try { return state; } catch (_) { return null; } };

  const worldsEl = document.getElementById('worlds');

  function switchWorld(name, viaTap) {
    const ai = WORLDS.indexOf(name);
    if (ai < 0) return;
    WORLDS.forEach((w, i) => {
      const el = document.getElementById('w-' + w);
      if (el) el.style.transform = `translateX(${(i - ai) * 100}%)`;
    });
    // רשת ביטחון: אם דפדפן ישן בכל זאת גלגל את מכל העולמות (overflow:clip לא
    // נתמך → hidden, שניתן לגלילה בקוד), מחזירים אותו למקומו במקום להיתקע.
    if (worldsEl && (worldsEl.scrollLeft || worldsEl.scrollTop)) {
      worldsEl.scrollLeft = 0; worldsEl.scrollTop = 0;
    }
    document.querySelectorAll('.ws-btn').forEach(b => b.classList.toggle('active', b.dataset.world === name));
    if (viaTap && navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }
  document.querySelectorAll('.ws-btn').forEach(b =>
    b.addEventListener('click', () => switchWorld(b.dataset.world, true)));
  switchWorld('hub');

  /* ---------- אייקונים ---------- */
  const IC = {
    heart: '<path d="M12 21s-7-4.5-9.3-9C1 8.5 3 5 6.5 5 9 5 12 8 12 8s3-3 5.5-3C21 5 23 8.5 21.3 12 19 16.5 12 21 12 21z"/>',
    walk: '<path d="M14 4a2 2 0 1 0 0 .01M9 21l1.2-6.2 2.3 1.9V21M7 11l3.6-1 2 3.1 3.2.8"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    bed: '<path d="M3 18V7M3 12h18a2 2 0 0 1 2 2v4M7.5 12V9.5h5V12"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  };
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  /* ---------- שלד ---------- */
  const hub = document.getElementById('hub');
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  }
  function dateLine() {
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const d = new Date();
    return `${greeting()} · יום ${days[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}`;
  }

  hub.innerHTML = `
    <div class="hub-greet">${dateLine()}</div>
    <section class="hub-card" id="hub-money">
      <div class="world-head fin">
        <span class="world-badge">${svg(IC.wallet)}</span>
        <h2>הכסף שלי</h2>
        <button class="world-link" data-go="money">לכל הנתונים ‹</button>
      </div>
      <div id="hub-money-body"><p class="hub-empty">טוען נתונים…</p></div>
      <button class="quick-report" id="hub-quick">${svg(IC.bolt)}לדיווח מהיר</button>
    </section>
    <section class="hub-card" id="hub-health">
      <div class="world-head health">
        <span class="world-badge">${svg(IC.heart)}</span>
        <h2>בריאות</h2>
        <button class="world-link" data-go="health">לכל הנתונים ‹</button>
      </div>
      <div id="hub-health-body"><p class="hub-empty">טוען נתונים…</p></div>
    </section>`;

  hub.addEventListener('click', e => {
    if (e.target.closest('#hub-quick')) {
      switchWorld('money', true);
      try { moneyFrame.contentWindow.postMessage({ type: 'go-report' }, '*'); } catch (_) {}
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) switchWorld(go.dataset.go, true);
  });

  /* ---------- בריאות ---------- */
  function lastVal(key) {
    const st = getState();
    const d = (st && st.data) || [];
    for (let i = d.length - 1; i >= 0; i--) { const v = d[i][key]; if (v != null && !Number.isNaN(v)) return v; }
    return null;
  }
  /* השורה האחרונה שיש בה ערך למפתח — כדי שכל נתוני הלילה יגיעו מאותו לילה */
  function lastRowWith(key) {
    const st = getState();
    const d = (st && st.data) || [];
    for (let i = d.length - 1; i >= 0; i--) { const v = d[i][key]; if (v != null && !Number.isNaN(v)) return d[i]; }
    return null;
  }

  /* שלבי השינה — הצבעים מטוקני הגרפים, מהקל לעמוק */
  const STAGES = [
    { key: 'light_min', label: 'קלה', color: '#93d9db' },
    { key: 'rem_min',   label: 'REM', color: '#8b7be6' },
    { key: 'deep_min',  label: 'עמוקה', color: '#4f8fe8' },
  ];

  /* גל השינה: הצורה דקורטיבית, אבל רוחב כל אזור-צבע הוא החלק האמיתי של השלב */
  const WAVE = 'M0,72 C18,72 26,52 44,52 C62,52 66,20 92,20 C118,20 116,44 140,44'
    + ' C164,44 160,14 188,14 C216,14 214,46 240,46 C262,46 258,66 300,66 L300,80 L0,80 Z';
  function sleepWave(parts) {
    const total = parts.reduce((a, p) => a + p.min, 0);
    if (!total) return '';
    const id = 'sw-' + Math.random().toString(36).slice(2, 7);
    let at = 0;
    const stops = parts.map(p => {
      const from = at; at += p.min / total;
      return `<stop offset="${from.toFixed(4)}" stop-color="${p.color}"/>`
        + `<stop offset="${at.toFixed(4)}" stop-color="${p.color}"/>`;
    }).join('');
    // קווי הפרדה דקים בגבולות בין השלבים — הסימון האנכי שבעיצוב
    let bx = 0;
    const marks = parts.slice(0, -1).map(p => {
      bx += p.min / total;
      return `<line x1="${(bx * 300).toFixed(1)}" y1="6" x2="${(bx * 300).toFixed(1)}" y2="80"
        stroke="rgba(255,255,255,.75)" stroke-width="2"/>`;
    }).join('');
    return `<svg class="sc-wave" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
      <path d="${WAVE}" fill="url(#${id})"/>${marks}</svg>`;
  }

  function renderHealth() {
    const st = getState();
    if (!st || !st.data || !st.data.length) return;
    const body = document.getElementById('hub-health-body');

    const steps = lastVal('steps');
    const row = lastRowWith('sleep_hours') || {};
    const sleep = row.sleep_hours ?? null;
    const score = lastVal('sleep_score');

    // צבע ציון השינה לפי אותם ספי איכות שגרמין מציג
    const sLvl = score == null ? '' : score >= 80 ? ' lvl-good' : score >= 60 ? ' lvl-mid' : ' lvl-low';
    const h = sleep == null ? null : Math.floor(sleep);
    const m = sleep == null ? null : Math.round((sleep - h) * 60);

    const parts = STAGES
      .map(s => ({ ...s, min: Number(row[s.key]) || 0 }))
      .filter(s => s.min > 0);
    const totalMin = parts.reduce((a, p) => a + p.min, 0);

    body.innerHTML = `
      <div class="h-tiles">
        <div class="h-tile">
          <span class="h-tile-top">${svg(IC.walk)}צעדים</span>
          <b>${steps == null ? '—' : fmt(Math.round(steps))}</b>
        </div>
        <div class="h-tile">
          <span class="h-tile-top">${svg(IC.moon)}ציון שינה</span>
          <b class="${sLvl.trim()}">${score == null ? '—' : Math.round(score)}</b>
        </div>
      </div>
      ${sleep == null ? '' : `
      <div class="sleep-card">
        <div class="sc-head">
          <span class="sc-title">${svg(IC.bed)}שינה</span>
          <span class="sc-dur"><b>${h}</b><small>ש׳</small><b>${String(m).padStart(2, '0')}</b><small>דק׳</small></span>
        </div>
        ${sleepWave(parts)}
        ${totalMin ? `<div class="sc-legend">${parts.map(p => `
          <span class="sc-item">
            <span class="sc-row"><i style="background:${p.color}"></i><em>${p.label}</em><b>${Math.round(p.min / totalMin * 100)}%</b></span>
            <small>${Math.floor(p.min / 60)}:${String(p.min % 60).padStart(2, '0')}</small>
          </span>`).join('')}</div>` : ''}
      </div>`}`;
  }
  document.addEventListener('health-ready', renderHealth);
  { const st = getState(); if (st && st.data && st.data.length) renderHealth(); }

  /* ---------- כסף ---------- */
  function renderMoney(s) {
    const body = document.getElementById('hub-money-body');
    body.innerHTML = `
      <div class="money-top">
        <div class="m-tile"><small>הכנסות</small><b>₪${fmt(s.income)}</b></div>
        <div class="m-tile"><small>הוצאות</small><b>₪${fmt(s.expenses)}</b></div>
      </div>`;
  }
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'kesef-summary') renderMoney(e.data);
  });
})();
