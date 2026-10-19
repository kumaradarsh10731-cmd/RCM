'use strict';
/* ===== Constants & persistence ===== */
const ROLES = ['Raja', 'Chor', 'Mantri', 'Sipahi'];
const KEY = 'rcms_v1';
const TRANS = { // allowed state transitions (prevents skipping phases)
  MAIN_MENU: ['PLAYER_SETUP', 'SETTINGS', 'LEADERBOARD', 'HOWTO'],
  SETTINGS: ['MAIN_MENU'], HOWTO: ['MAIN_MENU'], LEADERBOARD: ['MAIN_MENU', 'RESULTS'],
  PLAYER_SETUP: ['MAIN_MENU', 'ROLE_REVEAL'],
  ROLE_REVEAL: ['BLACK_LOCK_SCREEN', 'MAIN_MENU'],
  BLACK_LOCK_SCREEN: ['DISCUSSION'], DISCUSSION: ['GUESSING', 'MAIN_MENU'],
  GUESSING: ['RESULTS', 'MAIN_MENU'], RESULTS: ['ROLE_REVEAL', 'LEADERBOARD', 'MAIN_MENU']
};
const DEFAULTS = { names: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  rules: { raja: 1000, chor: 0, mantri: 500, sipahi: 200, timer: 60 }, matches: [], cur: null, muted: false };
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.names && d.rules) return Object.assign({}, DEFAULTS, d); } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save: storage is full or blocked.'); } }
let S = load();               // persistent data (never contains hidden roles)
let G = { state: 'MAIN_MENU' }; // volatile round data (roles live only in memory)
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ===== Helpers ===== */
function rnd(n) { // uniform integer in [0, n): rejection sampling removes modulo bias
  const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
const curMatch = () => S.matches.find(m => m.id === S.cur);

/* ===== Avatars (inline SVG, no external images) ===== */
const AV = {
  Raja: ['#fde9a8', '<path d="M22 38 L26 14 L38 28 L50 8 L62 28 L74 14 L78 38Z" fill="#f5b301" stroke="#b07d00" stroke-width="2"/><circle cx="50" cy="12" r="4" fill="#d6334a"/>'],
  Chor: ['#d9dbe8', '<path d="M20 40 Q50 0 80 40Z" fill="#2b2b3a"/><rect x="26" y="46" width="48" height="14" rx="7" fill="#111"/><circle cx="40" cy="53" r="3" fill="#fff"/><circle cx="60" cy="53" r="3" fill="#fff"/>'],
  Mantri: ['#cfe3ff', '<ellipse cx="50" cy="26" rx="30" ry="18" fill="#2f6fdd"/><path d="M30 34 Q50 46 70 34" fill="none" stroke="#fff" stroke-width="3"/><circle cx="50" cy="12" r="4" fill="#f5b301"/>'],
  Sipahi: ['#ffd6d6', '<path d="M22 44 Q22 8 50 8 Q78 8 78 44Z" fill="#c0392b"/><rect x="18" y="40" width="64" height="7" rx="3" fill="#7b241c"/><rect x="47" y="2" width="6" height="12" fill="#f5b301"/>']
};
function avatar(role) {
  const a = AV[role]; if (!a) return '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e6e8f2"/><text x="50" y="62" font-size="36" text-anchor="middle">?</text></svg>';
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${role}"><circle cx="50" cy="56" r="32" fill="${a[0]}" stroke="#1d2144" stroke-width="2"/>${a[1]}<circle cx="40" cy="58" r="3.5" fill="#1d2144"/><circle cx="60" cy="58" r="3.5" fill="#1d2144"/><path d="M40 72 Q50 80 60 72" fill="none" stroke="#1d2144" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/* ===== Sound (starts only after first tap) ===== */
let AC = null;
function beep(freqs, dur) {
  if (S.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + i * dur;
      o.frequency.value = f; g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur); });
  } catch (e) {}
}
const sTap = () => beep([520], .08), sWin = () => beep([523, 659, 784], .15), sLose = () => beep([300, 200], .2);

/* ===== State machine ===== */
function go(state, extra) {
  if (!TRANS[G.state] || !TRANS[G.state].includes(state)) { toast('That step is not allowed right now.'); return false; }
  clearInterval(G.tm);
  if (state === 'MAIN_MENU') G = { state };
  else G = Object.assign({}, G, { state }, extra || {});
  render(); return true;
}

/* ===== Scoring: single function, pure ===== */
function scoreRound(roles, guessIdx, r) {
  const correct = roles[guessIdx] === 'Chor';
  return roles.map(role => {
    let base = 0, bonus = 0;
    if (role === 'Raja') base = r.raja;
    else if (role === 'Sipahi') base = r.sipahi;
    else if (role === 'Chor') base = r.chor;
    else if (role === 'Mantri' && correct) bonus = r.mantri;
    if (role === 'Chor' && !correct) bonus = r.mantri; // Mantri's missed bonus is transferred to the actual Chor (never to the accused)
    return { base, bonus, total: base + bonus };
  });
}
function finalizeRound() {
  if (G.done || G.guess == null || G.state !== 'GUESSING') return; // blocks duplicates / incomplete rounds
  G.done = true;
  const m = curMatch(); if (!m) { toast('No active match found.'); return; }
  const sc = scoreRound(G.roles, G.guess, S.rules);
  const best = Math.max.apply(null, sc.map(s => s.total));
  G.scores = sc; G.correct = G.roles[G.guess] === 'Chor';
  G.winner = sc.map((s, i) => s.total === best ? i : -1).filter(i => i >= 0);
  const prevTotals = m.totals.slice();
  m.rounds++; sc.forEach((s, i) => m.totals[i] += s.total);
  m.history.push({ ts: Date.now(), roles: G.roles.slice(), guess: G.guess, correct: G.correct, gained: sc.map(s => s.total), prev: prevTotals, after: m.totals.slice() });
  m.uploaded = false; save();
  go('RESULTS'); G.correct ? sWin() : sLose();
}

/* ===== Validation ===== */
function readNames(prefix) {
  const out = [];
  for (let i = 0; i < 4; i++) { const el = $(prefix + i); out.push(el ? el.value.trim().replace(/\s+/g, ' ') : ''); }
  if (out.some(n => !n)) { toast('Every player needs a name.'); return null; }
  if (out.some(n => n.length > 12)) { toast('Names can be at most 12 characters.'); return null; }
  if (new Set(out.map(n => n.toLowerCase())).size < 4) { toast('Names must be different from each other.'); return null; }
  return out;
}
function nameInputs(prefix) { return S.names.map((n, i) => `<label class="field">Player ${i + 1}<input id="${prefix}${i}" maxlength="12" value="${esc(n)}" autocomplete="off"></label>`).join(''); }

/* ===== Screens ===== */
function cast() { return '<div class="cast">' + ROLES.map(r => `<div>${avatar(r)}</div>`).join('') + '</div>'; }
const btn = (act, label, cls, extra) => `<button class="btn ${cls || ''}" data-act="${act}" ${extra || ''}>${label}</button>`;

/* Round-by-round calculation display. Reads only SAVED history, so it can never add points. */
function calcHTML(m, latestVisible) {
  if (!m || !m.history || !m.history.length) return '';
  const run = [0, 0, 0, 0];
  const blocks = m.history.map((h, k) => { // older saves without prev/after are rebuilt from gained points
    const prev = h.prev || run.slice(), after = h.after || prev.map((p, i) => p + h.gained[i]);
    after.forEach((v, i) => run[i] = v);
    return { n: k + 1, lines: m.names.map((n, i) => `<div>${esc(n)}: ${prev[i]} + ${h.gained[i]} = <b>${after[i]}</b></div>`).join('') };
  }).reverse();
  const out = blocks.map((b, idx) => (latestVisible && idx === 0)
    ? `<div class="card calc now"><b>Round ${b.n}</b>${b.lines}</div>`
    : `<details class="card calc"><summary>Round ${b.n}</summary>${b.lines}</details>`);
  return `<div class="calcwrap"><b>${latestVisible ? 'Score calculation' : 'Round-by-round scores'}</b>${out.join('')}</div>`;
}

const SCREENS = {
  MAIN_MENU: () => `<h1>RAJA CHOR<br>MANTRI SIPAHI</h1>${cast()}<p class="c mut">Four players, one phone.</p>
    ${btn('play', 'Play Game', 'acc')}${btn('lb', 'Leaderboard', 'sec')}${btn('how', 'How to Play', 'sec')}${btn('settings', 'Settings', 'sec')}${btn('resetLocal', 'Reset Local Scores', 'bad')}`,

  HOWTO: () => `<h2>How to Play</h2><div class="card"><p>1. Each player secretly sees one role: Raja, Chor, Mantri or Sipahi.</p>
    <p>2. Talk it over. Nobody says their role out loud (the Raja and Mantri become known at guessing).</p>
    <p>3. The Raja asks the Mantri to name the Chor. The Mantri picks in secret; the Raja confirms.</p>
    <p>4. Roles are revealed and points are given. Raja and Sipahi earn points, the Chor earns none, and the Mantri earns a bonus only for a correct guess.</p>
    <p class="mut">This is a party game on a shared phone. It cannot stop a player from peeking at the screen.</p></div>${btn('menu', 'Back', 'sec')}`,

  SETTINGS: () => { const r = S.rules; const f = (k, l) => `<label class="field">${l}<input id="r_${k}" type="number" inputmode="numeric" min="0" value="${r[k]}"></label>`;
    return `<h2>Settings</h2><div class="card">${nameInputs('sn')}</div><div class="card">${f('raja', 'Raja points')}${f('chor', 'Chor points')}${f('sipahi', 'Sipahi points')}${f('mantri', 'Mantri bonus (correct guess only)')}${f('timer', 'Discussion timer (10-600 seconds)')}</div>
    ${btn('saveSettings', 'Save Settings', 'acc')}${btn('menu', 'Back', 'sec')}`; },

  PLAYER_SETUP: () => `<h2>Players</h2><p class="c mut">Enter four different names.</p><div class="card">${nameInputs('pn')}</div>${btn('start', 'Start Match', 'acc')}${btn('menu', 'Back', 'sec')}`,

  ROLE_REVEAL: () => {
    const n = esc(S.names[G.i]);
    if (G.step === 'pass') return `<div class="lock">&#128241;</div><h2>Give the phone to ${n}.</h2><p class="c mut">Only ${n} should look at the screen.</p>
      ${btn('reveal', 'Reveal My Role', 'acc', 'id="revealBtn" disabled')}`;
    if (G.step === 'show') { const role = G.roles[G.i]; return `<h2>${n}, you are</h2><div class="big">${avatar(role)}</div><div class="role">${role}</div>${btn('hide', 'Hide Role &amp; Lock')}`; }
    return `<div class="lock">&#128274;</div><h2>Role hidden</h2><p class="c mut">Pass the phone to the next player.</p>${btn('next', G.i < 3 ? 'Next Player' : 'Finish', 'acc')}`;
  },

  BLACK_LOCK_SCREEN: () => `<div class="black"><h2>Sabhi Players Ready?</h2>${btn('toDiscuss', 'Continue')}</div>`,

  DISCUSSION: () => `<h2>Discussion</h2><p class="c mut">Talk and accuse each other. Roles stay secret.</p><div class="timer" id="tm">${G.left}</div>
    <p class="c mut">seconds left</p>${btn('toGuess', 'Start Guessing', 'acc')}`,

  GUESSING: () => {
    const raja = G.roles.indexOf('Raja'), man = G.roles.indexOf('Mantri');
    const head = `<div class="card"><div class="pick">${avatar('Raja')}<div><b>${esc(S.names[raja])}</b><div class="mut">Raja</div></div></div>
      <div class="pick">${avatar('Mantri')}<div><b>${esc(S.names[man])}</b><div class="mut">Mantri</div></div></div></div>`;
    if (G.gstep === 'select') return `<h2>Find the Chor</h2>${head}<p class="c">${esc(S.names[raja])} asks ${esc(S.names[man])}: who is the Chor?<br><b>${esc(S.names[man])}</b>, choose privately.</p>
      ${[0, 1, 2, 3].filter(i => i !== man).map(i => btn('pick', esc(S.names[i]), 'sec', `data-i="${i}"`)).join('')}`;
    return `<h2>Answer locked in</h2>${head}<div class="lock">&#128274;</div><p class="c">The answer is hidden. <b>${esc(S.names[raja])}</b>, confirm it as final?</p>
      ${btn('confirm', 'Confirm Final Answer', 'acc')}${btn('changePick', 'Mantri: change answer', 'sec')}`;
  },

  RESULTS: () => {
    const m = curMatch(), man = G.roles.indexOf('Mantri'), chor = G.roles.indexOf('Chor');
    const rows = G.roles.map((role, i) => { const s = G.scores[i];
      return `<div class="card res ${G.winner.includes(i) ? 'win' : ''}">${avatar(role)}<div><b>${esc(S.names[i])}${G.winner.includes(i) ? ' (winner)' : ''}</b><span class="mut">${role}</span></div>
      <div class="pts">base ${s.base} + bonus ${s.bonus}<strong>+${s.total}</strong>total ${m.totals[i]}</div></div>`; }).join('');
    return `<div class="banner ${G.correct ? 'ok' : 'no'}">${G.correct ? 'Correct! Chor caught.' : 'Wrong Guess!' + (S.rules.mantri > 0 ? `<br>Mantri loses ${S.rules.mantri} bonus points.<br>Chor receives +${S.rules.mantri} points.` : '')}</div>
      <p class="c">${esc(S.names[man])} guessed <b>${esc(S.names[G.guess])}</b>. The Chor was <b>${esc(S.names[chor])}</b>.</p>${rows}
      <p class="c mut">Round ${m.rounds} complete</p>${calcHTML(m, true)}${btn('nextRound', 'Next Round', 'acc')}${btn('lb', 'Leaderboard', 'sec')}${btn('menu', 'Main Menu', 'sec')}${btn('newMatch', 'New Match (reset scores)', 'bad')}`;
  },

  LEADERBOARD: () => {
    const ms = S.matches.slice().reverse();
    const local = ms.length ? ms.map(m => `<div class="card"><b>${new Date(m.ts).toLocaleString()}</b> <span class="mut">${m.rounds} rounds</span>
      <table>${m.names.map((n, i) => [n, m.totals[i]]).sort((a, b) => b[1] - a[1]).map(x => `<tr><td>${esc(x[0])}</td><td>${x[1]}</td></tr>`).join('')}</table>${calcHTML(m, false)}</div>`).join('')
      : '<p class="c mut">No matches yet. Play a round to create one.</p>';
    const rows = ONLINE.rows ? ONLINE.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${x.total}</td><td>${x.rounds}</td></tr>`).join('') : '';
    return `<h2>Leaderboard</h2><div class="card"><b>Online</b><p class="mut">${esc(ONLINE.msg)}</p>
      ${rows ? `<table><tr><th>#</th><th>Name</th><th>Score</th><th>Rounds</th></tr>${rows}</table>` : ''}
      <div class="row">${btn('refreshOnline', 'Refresh', 'sec')}${btn('upload', 'Upload My Match', 'sec')}</div></div>
      <b>This phone</b>${local}${ms.length ? btn('clearHist', 'Clear History', 'bad') : ''}${btn('back', 'Back', 'sec')}`;
  }
};

/* ===== Render (one render path, one delegated listener = no stale handlers) ===== */
function render() {
  $('app').innerHTML = SCREENS[G.state]();
  window.scrollTo(0, 0);
  if (G.state === 'ROLE_REVEAL' && G.step === 'pass') setTimeout(() => { const b = $('revealBtn'); if (b) b.disabled = false; }, 1200); // anti-accidental reveal
  if (G.state === 'DISCUSSION') {
    G.tm = setInterval(() => { G.left--; const t = $('tm'); if (t) t.textContent = Math.max(G.left, 0);
      if (G.left <= 0) { clearInterval(G.tm); beep([880, 880], .2); } }, 1000);
  }
  $('mute').textContent = S.muted ? 'Sound off' : 'Sound on';
}

/* ===== Actions ===== */
const ACT = {
  menu: () => go('MAIN_MENU'),
  back: () => go(G.done ? 'RESULTS' : 'MAIN_MENU'),
  mute: () => { S.muted = !S.muted; save(); $('mute').textContent = S.muted ? 'Sound off' : 'Sound on'; },
  play: () => go('PLAYER_SETUP'), how: () => go('HOWTO'), settings: () => go('SETTINGS'),
  lb: () => { if (go('LEADERBOARD')) ACT.refreshOnline(); },
  resetLocal: () => { if (confirm('Delete ALL local scores and match history? This cannot be undone.')) { S.matches = []; S.cur = null; save(); toast('Local scores cleared.'); } },
  clearHist: () => { if (confirm('Clear all saved match history on this phone?')) { S.matches = []; S.cur = null; save(); G.done = false; G.state = 'LEADERBOARD'; render(); } },
  saveSettings: () => {
    const names = readNames('sn'); if (!names) return;
    const r = {}; for (const k of ['raja', 'chor', 'sipahi', 'mantri', 'timer']) { const v = Number($('r_' + k).value);
      if (!Number.isInteger(v) || v < 0 || v > 100000) return toast('Use whole numbers from 0 to 100000 for points.'); r[k] = v; }
    if (r.timer < 10 || r.timer > 600) return toast('Timer must be 10 to 600 seconds.');
    S.names = names; S.rules = r; save(); toast('Settings saved.'); go('MAIN_MENU');
  },
  start: () => {
    const names = readNames('pn'); if (!names) return;
    S.names = names; const id = 'm' + Date.now();
    S.matches.push({ id, ts: Date.now(), names: names.slice(), totals: [0, 0, 0, 0], rounds: 0, history: [], uploaded: false }); S.cur = id; save();
    beginRound();
  },
  nextRound: () => { if (!G.done) return; beginRound(); },
  newMatch: () => { if (confirm('Reset scores and start a new match? The old match stays in history.')) { G.state = 'MAIN_MENU'; G = { state: 'MAIN_MENU' }; go('PLAYER_SETUP'); } },
  reveal: () => { if (G.step === 'pass') { G.step = 'show'; render(); beep([660, 880], .1); } },
  hide: () => { if (G.step === 'show') { G.step = 'lock'; render(); } },
  next: () => { if (G.step !== 'lock') return; if (G.i < 3) { G.i++; G.step = 'pass'; render(); } else go('BLACK_LOCK_SCREEN'); },
  toDiscuss: () => go('DISCUSSION', { left: S.rules.timer }),
  toGuess: () => go('GUESSING', { gstep: 'select', guess: null, done: false }),
  pick: el => { const i = Number(el.dataset.i), man = G.roles.indexOf('Mantri');
    if (G.gstep !== 'select' || i === man || ![0, 1, 2, 3].includes(i)) return toast('Invalid choice.'); G.guess = i; G.gstep = 'confirm'; render(); },
  changePick: () => { if (!G.done) { G.guess = null; G.gstep = 'select'; render(); } },
  confirm: () => finalizeRound(),
  refreshOnline: () => onlineFetch(), upload: () => onlineUpload()
};
function beginRound() {
  const roles = shuffle(ROLES);
  const from = G.state; if (!TRANS[from].includes('ROLE_REVEAL')) { G = { state: 'PLAYER_SETUP' }; }
  go('ROLE_REVEAL', { roles, i: 0, step: 'pass', guess: null, done: false, scores: null });
}
$('app').addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const f = ACT[el.dataset.act]; if (!f) return;
  sTap(); try { f(el); } catch (err) { toast('Something went wrong: ' + err.message); }
});
$('mute').addEventListener('click', () => { ACT.mute(); });

/* ===== Back button blocking (best effort) and refresh safety ===== */
history.pushState({ g: 1 }, '', location.pathname);
window.addEventListener('popstate', () => { history.pushState({ g: 1 }, '', location.pathname); toast('Back is disabled during a round.'); });
// Roles are never written to storage, so a refresh drops the round (no points) and returns to the menu.
window.addEventListener('beforeunload', e => { if (['ROLE_REVEAL', 'DISCUSSION', 'GUESSING'].includes(G.state)) { e.preventDefault(); e.returnValue = ''; } });

/* ===== Online leaderboard (Firebase anonymous auth + Firestore) ===== */
const ONLINE = { ready: false, db: null, uid: null, rows: null, msg: 'Checking setup...' };
function netBadge() { const n = $('net'), on = navigator.onLine && ONLINE.ready; n.textContent = on ? 'Online' : 'Offline'; n.className = 'net' + (on ? ' on' : ''); }
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
async function onlineInit() {
  const c = window.FIREBASE_CONFIG;
  if (!c || !c.apiKey || !c.projectId) { ONLINE.msg = 'Online leaderboard is not set up. Add your Firebase config to firebase-config.js (see README). Local play works fully.'; return false; }
  if (!navigator.onLine) { ONLINE.msg = 'You are offline. Local scores still work.'; return false; }
  if (ONLINE.ready) return true;
  try {
    const v = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
    if (!window.firebase) { await loadScript(v + 'app-compat.js'); await loadScript(v + 'auth-compat.js'); await loadScript(v + 'firestore-compat.js'); }
    if (!firebase.apps.length) firebase.initializeApp(c);
    const cred = await firebase.auth().signInAnonymously();
    ONLINE.uid = cred.user.uid; ONLINE.db = firebase.firestore(); ONLINE.ready = true; ONLINE.msg = 'Connected.'; return true;
  } catch (e) { ONLINE.ready = false; ONLINE.msg = 'Could not connect: ' + e.message + ' (check config, Anonymous sign-in, and rules).'; return false; }
}
async function onlineFetch() {
  ONLINE.msg = 'Loading...'; if (G.state === 'LEADERBOARD') render();
  if (await onlineInit()) {
    try { const snap = await ONLINE.db.collection('scores').orderBy('total', 'desc').limit(20).get();
      ONLINE.rows = snap.docs.map(d => d.data()); ONLINE.msg = ONLINE.rows.length ? 'Top 20 scores (server data).' : 'No scores uploaded yet.';
    } catch (e) { ONLINE.msg = 'Could not read scores: ' + e.message; }
  }
  netBadge(); if (G.state === 'LEADERBOARD') render();
}
async function onlineUpload() {
  const m = curMatch(); if (!m || m.rounds < 1) return toast('Finish at least one round first.');
  if (m.uploaded) return toast('This match is already uploaded.');
  if (!(await onlineInit())) { netBadge(); render(); return toast('Cannot upload right now. See the message above.'); }
  try {
    const b = ONLINE.db.batch();
    m.names.forEach((n, i) => b.set(ONLINE.db.collection('scores').doc(), { uid: ONLINE.uid, name: n, total: m.totals[i], rounds: m.rounds, matchId: m.id, ts: firebase.firestore.FieldValue.serverTimestamp() }));
    await b.commit(); // resolves only after the server accepts the write
    m.uploaded = true; save(); toast('Uploaded. Server confirmed.'); onlineFetch();
  } catch (e) { toast('Upload failed: ' + e.message); }
}
window.addEventListener('online', () => { netBadge(); }); window.addEventListener('offline', () => { netBadge(); });
onlineInit().then(netBadge);

/* ===== Boot: always start at the menu; hidden roles are never restored ===== */
render(); netBadge();
