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

  function switchWorld(name, viaTap) {
    const ai = WORLDS.indexOf(name);
    if (ai < 0) return;
    WORLDS.forEach((w, i) => {
      const el = document.getElementById('w-' + w);
      if (el) el.style.transform = `translateX(${(i - ai) * 100}%)`;
    });
    document.querySelectorAll('.ws-btn').forEach(b => b.classList.toggle('active', b.dataset.world === name));
    if (viaTap && navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }
  document.querySelectorAll('.ws-btn').forEach(b =>
    b.addEventListener('click', () => switchWorld(b.dataset.world, true)));
  switchWorld('hub');

  /* ---------- אייקונים ---------- */
  const IC = {
    heart: '<path d="M12 21s-7-4.5-9.3-9C1 8.5 3 5 6.5 5 9 5 12 8 12 8s3-3 5.5-3C21 5 23 8.5 21.3 12 19 16.5 12 21 12 21z"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    walk: '<path d="M14 4a2 2 0 1 0 0 .01M9 21l1.2-6.2 2.3 1.9V21M7 11l3.6-1 2 3.1 3.2.8"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h4"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  };
  const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  /* ---------- טבעת ---------- */
  const R = 32, CIRC = 2 * Math.PI * R;
  function ring(grad, val, unit, pct, big) {
    const frac = pct == null ? 1 : Math.max(0, Math.min(1, pct / 100));
    const off = CIRC * (1 - frac);
    const id = 'hg-' + Math.random().toString(36).slice(2, 7);
    return `<div class="r-wrap${big ? ' big' : ''}"><svg viewBox="0 0 78 78">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>
      <circle class="r-track" cx="39" cy="39" r="${R}"/>
      <circle class="r-val" cx="39" cy="39" r="${R}" stroke="url(#${id})"
        stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${CIRC.toFixed(1)}" data-off="${off.toFixed(1)}"/>
      </svg><span class="r-txt"><b>${val}</b><small>${unit}</small></span></div>`;
  }
  function animRings() {
    requestAnimationFrame(() => document.querySelectorAll('#hub .r-val[data-off]').forEach(c =>
      c.setAttribute('stroke-dashoffset', c.dataset.off)));
  }

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
  function renderHealth() {
    const st = getState();
    if (!st || !st.data || !st.data.length) return;
    const body = document.getElementById('hub-health-body');
    let score = null;
    try { score = (typeof latest === 'function') ? latest('readiness_score', 2) : null; } catch (_) {}
    if (score == null) { try { score = heuristicReadiness(); } catch (_) {} }
    let verdict = '', lvl = '';
    if (score != null) { try { verdict = verdictOf(score); lvl = 'lvl-' + verdictLevel(score); } catch (_) {} }

    const hrv = lastVal('hrv'), rhr = lastVal('rhr'), steps = lastVal('steps'), sleep = lastVal('sleep_hours');
    let sg = 10000, slg = 8;
    try { sg = goalSteps() || 10000; } catch (_) {}
    try { slg = goalSleep() || 8; } catch (_) {}
    const stepsTxt = steps == null ? '—' : steps >= 1000 ? (steps / 1000).toFixed(1) + 'K' : String(Math.round(steps));

    body.innerHTML = `
      ${verdict ? `<div class="verdict-mini ${lvl}">${verdict}</div>` : ''}
      <div class="rings">
        <div class="ring">${ring(['#4fc294', '#7fdcb4'], hrv == null ? '—' : Math.round(hrv), 'ms', null)}<span class="r-name">${svg(IC.pulse)}HRV</span></div>
        <div class="ring">${ring(['#f2a08a', '#f7c2ac'], rhr == null ? '—' : Math.round(rhr), 'bpm', null)}<span class="r-name">${svg(IC.heart)}דופק</span></div>
        <div class="ring">${ring(['#efc169', '#f6d894'], stepsTxt, 'צעדים', steps == null ? 0 : steps / sg * 100)}<span class="r-name">${svg(IC.walk)}צעדים</span></div>
        <div class="ring">${ring(['#63c3c6', '#93d9db'], sleep == null ? '—' : (+sleep).toFixed(1), 'ש׳', sleep == null ? 0 : sleep / slg * 100)}<span class="r-name">${svg(IC.moon)}שינה</span></div>
      </div>`;
    animRings();
  }
  document.addEventListener('health-ready', renderHealth);
  { const st = getState(); if (st && st.data && st.data.length) renderHealth(); }

  /* ---------- כסף ---------- */
  function renderMoney(s) {
    const body = document.getElementById('hub-money-body');
    const budget = s.weekendBudget || 0, spent = s.weekendSpent || 0, left = s.weekendLeft;
    const frac = budget > 0 ? spent / budget * 100 : 0;
    const grad = left < 0 ? ['#e0634e', '#f0958a']
      : (budget > 0 && left / budget < 0.2) ? ['#cf8a1f', '#e6b24e']
        : ['#7d6fe0', '#aa9cf2'];
    const cTxt = budget > 0 ? (left >= 0 ? '₪' + fmt(left) : 'חריגה') : '—';
    const cSub = budget > 0 ? (left >= 0 ? 'נשאר' : '₪' + fmt(-left)) : 'ללא יעד';
    const note = budget > 0
      ? (left >= 0
        ? `מתוך ₪${fmt(budget)} השבוע, <span class="bud-left">נשאר ₪${fmt(left)}</span> עד מוצ״ש.`
        : `חרגת ב-<span class="bud-left">₪${fmt(-left)}</span> מתקציב סופ״ש.`)
      : 'לא הוגדר תקציב סופ״ש בהגדרות.';
    body.innerHTML = `
      <div class="money-top">
        <div class="m-tile"><small>הכנסות</small><b>₪${fmt(s.income)}</b></div>
        <div class="m-tile"><small>הוצאות</small><b>₪${fmt(s.expenses)}</b></div>
      </div>
      <div class="budget">
        ${ring(grad, cTxt, cSub, budget > 0 ? Math.min(100, frac) : 0, true)}
        <div class="bud-info"><h3>תקציב סופ״ש</h3><p>${note}</p></div>
      </div>`;
    animRings();
  }
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'kesef-summary') renderMoney(e.data);
  });
})();
