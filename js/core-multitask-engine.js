/* ═══════════════════════════════════════════════════════════════
   ADAPT — Core Multitask Engine
   Runs ALL 4 tasks simultaneously in the Simulator:
   1) Target Tracking   (canvas – mouse/touch)
   2) Arithmetic        (MCQ with time pressure)
   3) Alert Response    (flash → click)
   4) Instrument Watch  (mini gauges – click anomalies)

   Exports: window.CoreMultitaskEngine
   ═══════════════════════════════════════════════════════════════ */

const CoreMultitaskEngine = (() => {
  'use strict';

  /* ─────────────── STATE ─────────────── */
  let state = {};
  let raf   = null;

  /* Timers */
  let mathTimer       = null;
  let alertTimer      = null;
  let alertWinTimer   = null;
  let instScheduler   = null;
  let instRafId       = null;

  /* ─────────────── HELPERS ─────────────── */
  const $  = id => document.getElementById(id);
  const cl = (el, add, cls) => el && el.classList[add ? 'remove' : 'add'](cls); // remove 'hidden' = show
  const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';

  /* ─────────────── INIT ─────────────── */
  function init(opts = {}) {
    const {
      difficultyMult = 1.0,
      onScoreUpdate  = null,
      onMathAnswer   = null,
      onAlertMiss    = null,
      onAlertHit     = null,
      onInstHit      = null,
      onInstMiss     = null,
    } = opts;

    state = {
      running: false,
      diffMult: difficultyMult,
      callbacks: { onScoreUpdate, onMathAnswer, onAlertMiss, onAlertHit, onInstHit, onInstMiss },

      /* Tracking */
      track: {
        dotX: 200, dotY: 120,
        dotVX: 1.6, dotVY: 1.3,
        cursorX: 200, cursorY: 120,
        samples: [], total: 0,
      },

      /* Math */
      math: {
        correct: 0, total: 0,
        answered: false,
        currentAnswer: 0,
        startTime: 0,
        times: [],
      },

      /* Alert */
      alert: {
        correct: 0, total: 0, missed: 0,
        active: false,
        startTime: 0,
        rts: [],
      },

      /* Instruments */
      inst: {
        caught: 0, total: 0, missed: 0,
        active: {},       // key=name, val={startTime}
        activeWarns: {},  // key=id, val={startTime}
        catchTimes: [],
        gauges: {
          altitude: { cur: 5000, tgt: 5000, vel: 0, min: 0,    max: 15000, nMin: 2000,  nMax: 8000,  color: '#00aaff' },
          airspeed: { cur: 200,  tgt: 200,  vel: 0, min: 0,    max: 400,   nMin: 120,   nMax: 280,   color: '#ff8800' },
          vspeed:   { cur: 0,    tgt: 0,    vel: 0, min:-2000, max: 2000,  nMin: -500,  nMax: 500,   color: '#00ff88' },
          fuel:     { cur: 75,   tgt: 75,   vel: 0, min: 0,    max: 100,   nMin: 20,    nMax: 100,   color: '#ffd600' },
        },
        warns: { stall: false, fire: false, cabin: false, oil: false },
      },
    };
  }

  /* ─────────────── START / STOP ─────────────── */
  function start(opts = {}) {
    init(opts);
    state.running = true;

    // Setup tracking canvas
    setupTrackCanvas();
    // Start render loop
    raf = requestAnimationFrame(renderLoop);
    // Start math
    showMathQuestion();
    // Schedule first alert
    scheduleAlert();
    // Start instrument animation + anomaly scheduler
    animateInstruments();
    scheduleInstrumentAnomaly();
    // Setup gauge click listeners
    setupInstClickListeners();
  }

  function stop() {
    state.running = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(instRafId);
    clearTimeout(mathTimer);
    clearTimeout(alertTimer);
    clearTimeout(alertWinTimer);
    clearTimeout(instScheduler);
  }

  /* ─────────────── GETTERS ─────────────── */
  function getStats() {
    return {
      trackAccuracy: avgTracking(),
      mathCorrect:   state.math.correct,
      mathTotal:     state.math.total,
      mathAvgTime:   state.math.times.length
        ? state.math.times.reduce((a,b)=>a+b,0)/state.math.times.length : null,
      alertCorrect:  state.alert.correct,
      alertTotal:    state.alert.total,
      alertMissed:   state.alert.missed,
      alertAvgRT:    state.alert.rts.length
        ? Math.round(state.alert.rts.reduce((a,b)=>a+b,0)/state.alert.rts.length) : null,
      alertRTs:      [...state.alert.rts],
      instCaught:    state.inst.caught,
      instTotal:     state.inst.total,
      instMissed:    state.inst.missed,
      instAvgCatch:  state.inst.catchTimes.length
        ? Math.round(state.inst.catchTimes.reduce((a,b)=>a+b,0)/state.inst.catchTimes.length) : null,
    };
  }

  /* ─────────────── DIFFICULTY ─────────────── */
  function setDifficulty(mult) {
    state.diffMult = Math.max(0.5, Math.min(3.0, mult));
    updateDiffDisplay();
  }

  function updateDiffDisplay() {
    const el = $('sim-hud-diff');
    if (el) el.textContent = state.diffMult.toFixed(1) + '×';
  }

  /* ═══════════════════════════════════════════
       TASK 1: TARGET TRACKING
  ═══════════════════════════════════════════ */
  function setupTrackCanvas() {
    const cvs = $('sim-track-canvas');
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (parent) {
      const w = Math.min(parent.clientWidth - 16, 520);
      cvs.width  = w;
      cvs.height = Math.round(w * 0.6);
    }
    state.track.dotX    = cvs.width / 2;
    state.track.dotY    = cvs.height / 2;
    state.track.cursorX = cvs.width / 2;
    state.track.cursorY = cvs.height / 2;

    cvs.removeEventListener('mousemove', onMouseMove);
    cvs.removeEventListener('touchmove', onTouchMove);
    cvs.addEventListener('mousemove', onMouseMove);
    cvs.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onMouseMove(e) {
    if (!state.running) return;
    const cvs = $('sim-track-canvas');
    const r = cvs.getBoundingClientRect();
    state.track.cursorX = (e.clientX - r.left) * (cvs.width / r.width);
    state.track.cursorY = (e.clientY - r.top)  * (cvs.height / r.height);
  }

  function onTouchMove(e) {
    if (!state.running) return;
    e.preventDefault();
    const t = e.touches[0];
    const cvs = $('sim-track-canvas');
    const r = cvs.getBoundingClientRect();
    state.track.cursorX = (t.clientX - r.left) * (cvs.width / r.width);
    state.track.cursorY = (t.clientY - r.top)  * (cvs.height / r.height);
  }

  function moveDot(cvs) {
    const W = cvs.width, H = cvs.height;
    const speed = state.diffMult * 1.4;
    state.track.dotX += state.track.dotVX * speed;
    state.track.dotY += state.track.dotVY * speed;
    if (state.track.dotX < 16 || state.track.dotX > W - 16) state.track.dotVX *= -1;
    if (state.track.dotY < 16 || state.track.dotY > H - 16) state.track.dotVY *= -1;
    state.track.dotX = Math.max(16, Math.min(W-16, state.track.dotX));
    state.track.dotY = Math.max(16, Math.min(H-16, state.track.dotY));
  }

  function sampleTracking(cvs) {
    const dx = state.track.cursorX - state.track.dotX;
    const dy = state.track.cursorY - state.track.dotY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxD = Math.sqrt(cvs.width**2 + cvs.height**2);
    const acc = Math.max(0, 1 - dist / (maxD * 0.35));
    state.track.samples.push(acc);
    state.track.total++;
  }

  function avgTracking() {
    if (!state.track.samples.length) return 0;
    return state.track.samples.reduce((a,b)=>a+b,0) / state.track.samples.length * 100;
  }

  function drawTrack() {
    const cvs = $('sim-track-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const dark = isDark();

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = dark ? '#0a0f1e' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = dark ? 'rgba(0,170,255,0.07)' : 'rgba(0,80,180,0.09)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Target dot — glowing red
    const { dotX: dx, dotY: dy } = state.track;
    const grd = ctx.createRadialGradient(dx, dy, 0, dx, dy, 18);
    grd.addColorStop(0, '#ff4444');
    grd.addColorStop(0.5, 'rgba(255,60,60,0.4)');
    grd.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.beginPath(); ctx.arc(dx, dy, 18, 0, Math.PI*2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.arc(dx, dy, 8, 0, Math.PI*2);
    ctx.fillStyle = '#ff3c3c'; ctx.fill();

    // Crosshair (cursor)
    const cx = state.track.cursorX, cy = state.track.cursorY;
    const dist = Math.sqrt((cx-dx)**2 + (cy-dy)**2);
    const close = dist < 20;
    const col = close ? '#00ff88' : (dark ? '#00aaff' : '#0066cc');
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    const cs = 18;
    ctx.beginPath(); ctx.moveTo(cx-cs, cy); ctx.lineTo(cx+cs, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy-cs); ctx.lineTo(cx, cy+cs); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI*2);
    ctx.strokeStyle = close ? 'rgba(0,255,136,0.5)' : 'rgba(0,170,255,0.4)';
    ctx.lineWidth = 1.5; ctx.stroke();

    // Accuracy bar at bottom
    const acc = avgTracking();
    ctx.fillStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    ctx.fillRect(8, H-12, W-16, 7);
    const bc = acc > 70 ? '#00ff88' : acc > 40 ? '#ffd600' : '#ff3c3c';
    ctx.fillStyle = bc;
    ctx.fillRect(8, H-12, (W-16)*(acc/100), 7);

    // Score display
    const el = $('sim-track-score');
    if (el) el.textContent = acc.toFixed(0) + '%';
  }

  /* ═══════════════════════════════════════════
       TASK 2: ARITHMETIC
  ═══════════════════════════════════════════ */
  function genMath() {
    const d = state.diffMult;
    let a, b, op, ans;
    const roll = Math.random();

    if (d >= 2.0) {
      // Hard: two-step or division
      if (roll < 0.3) {
        a = Math.floor(Math.random()*12)+2; b = Math.floor(Math.random()*12)+2; op='×'; ans=a*b;
      } else if (roll < 0.6) {
        const r = Math.floor(Math.random()*9)+2;
        const q = Math.floor(Math.random()*9)+2;
        a = r*q; b = r; op='÷'; ans=q;
      } else {
        a = Math.floor(Math.random()*100)+20; b = Math.floor(Math.random()*80)+10; op='+'; ans=a+b;
      }
    } else if (d >= 1.3) {
      if (roll < 0.4) {
        a = Math.floor(Math.random()*9)+2; b = Math.floor(Math.random()*9)+2; op='×'; ans=a*b;
      } else {
        a = Math.floor(Math.random()*60)+10; b = Math.floor(Math.random()*40)+1;
        op = Math.random()<0.5 ? '+' : '−'; ans = op==='+'? a+b : a-b;
      }
    } else {
      a = Math.floor(Math.random()*40)+5; b = Math.floor(Math.random()*30)+1;
      op = Math.random()<0.5 ? '+' : '−'; ans = op==='+'? a+b : a-b;
    }
    return { q: `${a} ${op} ${b}`, ans };
  }

  function showMathQuestion() {
    if (!state.running) return;
    const { q, ans } = genMath();
    const qEl   = $('sim-math-q');
    const optsEl= $('sim-math-opts');
    if (!qEl || !optsEl) return;
    qEl.textContent = q + ' = ?';
    state.math.answered    = false;
    state.math.currentAnswer = ans;
    state.math.startTime   = Date.now();

    // Distractors
    const wrongs = new Set();
    while (wrongs.size < 3) {
      const off = Math.floor(Math.random()*20)-10;
      const w = ans + (off || 1);
      if (w !== ans) wrongs.add(w);
    }
    const choices = [ans, ...wrongs].sort(() => Math.random()-0.5);
    optsEl.innerHTML = '';
    choices.forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'sim-math-opt';
      btn.textContent = v;
      btn.addEventListener('click', () => answerMath(v, btn, ans, optsEl));
      optsEl.appendChild(btn);
    });

    // Time bar animation
    const timeLimit = Math.max(4000, 9000 - state.diffMult * 1500);
    startMathTimerBar(timeLimit);

    clearTimeout(mathTimer);
    mathTimer = setTimeout(() => {
      if (!state.math.answered && state.running) {
        state.math.total++;
        updateMathDisplay();
        if (state.callbacks.onMathAnswer) state.callbacks.onMathAnswer(false, 0);
        showMathQuestion();
      }
    }, timeLimit);
  }

  function answerMath(chosen, btn, correct, optsEl) {
    if (state.math.answered || !state.running) return;
    state.math.answered = true;
    clearTimeout(mathTimer);
    const elapsed = Date.now() - state.math.startTime;
    state.math.times.push(elapsed);
    state.math.total++;
    const ok = chosen === correct;
    if (ok) {
      state.math.correct++;
      btn.classList.add('sim-opt-correct');
      ADAPTAudio.playCorrect();
    } else {
      btn.classList.add('sim-opt-wrong');
      ADAPTAudio.playWrong();
      optsEl.querySelectorAll('.sim-math-opt').forEach(b => {
        if (Number(b.textContent) === correct) b.classList.add('sim-opt-correct');
      });
    }
    updateMathDisplay();
    if (state.callbacks.onMathAnswer) state.callbacks.onMathAnswer(ok, elapsed);
    mathTimer = setTimeout(() => { if (state.running) showMathQuestion(); }, 900);
  }

  function updateMathDisplay() {
    const el = $('sim-math-score');
    if (el) el.textContent = `${state.math.correct}/${state.math.total}`;
  }

  function startMathTimerBar(ms) {
    const fill = $('sim-math-timer-fill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '100%';
    requestAnimationFrame(() => {
      fill.style.transition = `width ${ms}ms linear`;
      fill.style.width = '0%';
    });
  }

  /* ═══════════════════════════════════════════
       TASK 3: ALERT RESPONSE
  ═══════════════════════════════════════════ */
  function scheduleAlert() {
    if (!state.running) return;
    // Window shrinks with difficulty
    const minDelay = Math.max(1500, 4000 - state.diffMult * 500);
    const maxDelay = Math.max(3000, 9000 - state.diffMult * 1000);
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { if (state.running) showAlert(); }, delay);
  }

  function showAlert() {
    if (state.alert.active || !state.running) return;
    state.alert.active = true;
    state.alert.total++;
    state.alert.startTime = Date.now();

    const sig = $('sim-alert-signal');
    const btn = $('sim-alert-btn');
    const txt = $('sim-alert-text');
    if (!sig || !btn || !txt) return;

    sig.className = 'sim-alert-signal flash-green';
    txt.textContent = '⚠ ALERT — RESPOND!';
    btn.disabled = false;
    ADAPTAudio.playAlert();
    updateAlertDisplay();

    // Window = 2.5s at diff 1.0, shrinks to 1.2s at diff 2.5
    const window = Math.max(1200, 2500 - (state.diffMult - 1.0) * 866);
    clearTimeout(alertWinTimer);
    alertWinTimer = setTimeout(() => {
      if (state.alert.active && state.running) missAlert();
    }, window);
  }

  function missAlert() {
    state.alert.active = false;
    state.alert.missed++;
    const sig = $('sim-alert-signal');
    const btn = $('sim-alert-btn');
    const txt = $('sim-alert-text');
    if (sig) sig.className = 'sim-alert-signal flash-red';
    if (txt) txt.textContent = 'MISSED!';
    if (btn) btn.disabled = true;
    ADAPTAudio.playError();
    updateAlertDisplay();
    if (state.callbacks.onAlertMiss) state.callbacks.onAlertMiss();
    setTimeout(() => {
      if (!state.running) return;
      if (sig) sig.className = 'sim-alert-signal';
      if (txt) txt.textContent = 'STANDBY';
      scheduleAlert();
    }, 700);
  }

  function respondAlert() {
    if (!state.alert.active || !state.running) return;
    clearTimeout(alertWinTimer);
    const rt = Date.now() - state.alert.startTime;
    state.alert.rts.push(rt);
    state.alert.correct++;
    state.alert.active = false;

    const sig = $('sim-alert-signal');
    const btn = $('sim-alert-btn');
    const txt = $('sim-alert-text');
    const rtEl= $('sim-alert-rt');
    if (sig) sig.className = 'sim-alert-signal';
    if (txt) txt.textContent = `✓ ${rt}ms`;
    if (btn) btn.disabled = true;
    if (rtEl) rtEl.textContent = `Last RT: ${rt}ms`;
    ADAPTAudio.playSuccess();
    updateAlertDisplay();
    if (state.callbacks.onAlertHit) state.callbacks.onAlertHit(rt);

    setTimeout(() => {
      if (!state.running) return;
      if (txt) txt.textContent = 'STANDBY';
      scheduleAlert();
    }, 600);
  }

  function updateAlertDisplay() {
    const el = $('sim-alert-score');
    if (el) el.textContent = `${state.alert.correct}/${state.alert.total}`;
  }

  /* ═══════════════════════════════════════════
       TASK 4: INSTRUMENT MONITORING
  ═══════════════════════════════════════════ */
  function drawMiniGauge(name) {
    const g = state.inst.gauges[name];
    if (!g) return;
    const cvs = $(`sim-c-${name}`);
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const cx = W/2, cy = H/2, R = W/2-6;
    const dark = isDark();

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2);
    ctx.fillStyle = dark ? '#0a0f1e' : '#dde5f5'; ctx.fill();
    ctx.strokeStyle = dark ? '#1e3050' : '#aabbd8'; ctx.lineWidth = 1.5; ctx.stroke();

    // Normal zone arc
    const sa = Math.PI*0.75, ea = Math.PI*2.25, ta = ea-sa;
    const range = g.max - g.min;
    if (g.nMin !== null) {
      const ns = sa + ((g.nMin - g.min)/range)*ta;
      const ne = sa + ((g.nMax - g.min)/range)*ta;
      ctx.beginPath(); ctx.arc(cx, cy, R-4, ns, ne);
      ctx.strokeStyle = 'rgba(0,255,136,0.25)'; ctx.lineWidth = 5; ctx.stroke();
    }

    // Needle
    const isAnom = g.nMin !== null && (g.cur < g.nMin || g.cur > g.nMax);
    const norm = Math.max(0, Math.min(1, (g.cur - g.min)/range));
    const na = sa + norm*ta;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(na);
    ctx.beginPath();
    ctx.moveTo(-2, 5); ctx.lineTo(0, -(R-10)); ctx.lineTo(2, 5); ctx.closePath();
    ctx.fillStyle = isAnom ? '#ff3c3c' : g.color; ctx.fill();
    ctx.restore();

    // Center
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI*2);
    ctx.fillStyle = g.color; ctx.fill();

    // Value text
    const valEl = $(`sim-v-${name}`);
    if (valEl) {
      if (name === 'altitude') valEl.textContent = Math.round(g.cur).toLocaleString();
      else if (name === 'airspeed') valEl.textContent = Math.round(g.cur);
      else if (name === 'vspeed') valEl.textContent = (g.cur>=0?'+':'')+Math.round(g.cur);
      else if (name === 'fuel') valEl.textContent = Math.round(g.cur)+'%';
    }
  }

  function animateInstruments() {
    if (!state.running) return;
    Object.entries(state.inst.gauges).forEach(([name, g]) => {
      const diff = g.tgt - g.cur;
      g.vel = g.vel * 0.85 + diff * 0.02;
      g.cur += g.vel;
      g.cur = Math.max(g.min, Math.min(g.max, g.cur));
      drawMiniGauge(name);
    });
    instRafId = requestAnimationFrame(animateInstruments);
  }

  function scheduleInstrumentAnomaly() {
    if (!state.running) return;
    const delay = Math.max(3000, 8000 - state.diffMult * 1200) + Math.random() * 4000;
    instScheduler = setTimeout(() => {
      if (!state.running) return;
      triggerInstAnomaly();
    }, delay);
  }

  function triggerInstAnomaly() {
    const roll = Math.random();
    if (roll < 0.6) {
      // Gauge anomaly
      const names = Object.keys(state.inst.gauges).filter(n => !state.inst.active[n]);
      if (!names.length) { scheduleInstrumentAnomaly(); return; }
      const name = names[Math.floor(Math.random()*names.length)];
      const g = state.inst.gauges[name];
      if (g.nMin === null) { scheduleInstrumentAnomaly(); return; }
      const above = Math.random() < 0.5;
      if (above) g.tgt = g.nMax + (g.max - g.nMax) * (0.3 + Math.random()*0.5);
      else       g.tgt = g.nMin - (g.nMin - g.min) * (0.3 + Math.random()*0.5);

      state.inst.total++;
      state.inst.active[name] = { startTime: Date.now() };

      const alertEl = $(`sim-a-${name}`);
      const gaugeEl = $(`sim-g-${name}`);
      if (alertEl) alertEl.classList.remove('hidden');
      if (gaugeEl) gaugeEl.classList.add('sim-gauge-anomaly');
      ADAPTAudio.playWarning();
      updateInstDisplay();

      // Miss window
      const window = Math.max(1800, 4000 - state.diffMult * 700);
      setTimeout(() => {
        if (state.inst.active[name] && state.running) {
          state.inst.missed++;
          clearInstAnomaly(name);
          updateInstDisplay();
          if (state.callbacks.onInstMiss) state.callbacks.onInstMiss(name);
        }
      }, window);

    } else {
      // Warning light
      const warnKeys = Object.keys(state.inst.warns).filter(k => !state.inst.warns[k]);
      if (!warnKeys.length) { scheduleInstrumentAnomaly(); return; }
      const k = warnKeys[Math.floor(Math.random()*warnKeys.length)];
      state.inst.warns[k] = true;
      state.inst.total++;
      state.inst.activeWarns[k] = { startTime: Date.now() };

      const el = $(`swl-${k}`);
      if (el) el.classList.add('swl-active');
      ADAPTAudio.playAlert();
      updateInstDisplay();

      const window = Math.max(2000, 5000 - state.diffMult * 800);
      setTimeout(() => {
        if (state.inst.activeWarns[k] && state.running) {
          state.inst.missed++;
          clearWarn(k);
          updateInstDisplay();
          if (state.callbacks.onInstMiss) state.callbacks.onInstMiss(k);
        }
      }, window);
    }

    scheduleInstrumentAnomaly();
  }

  function clearInstAnomaly(name) {
    delete state.inst.active[name];
    const g = state.inst.gauges[name];
    if (g) g.tgt = g.nMin !== null ? (g.nMin + g.nMax) / 2 : g.cur;
    const alertEl = $(`sim-a-${name}`);
    const gaugeEl = $(`sim-g-${name}`);
    if (alertEl) alertEl.classList.add('hidden');
    if (gaugeEl) { gaugeEl.classList.remove('sim-gauge-anomaly'); gaugeEl.classList.remove('sim-gauge-ok'); }
  }

  function clearWarn(k) {
    state.inst.warns[k] = false;
    delete state.inst.activeWarns[k];
    const el = $(`swl-${k}`);
    if (el) { el.classList.remove('swl-active'); el.classList.remove('swl-ack'); }
  }

  function updateInstDisplay() {
    const el = $('sim-inst-score');
    if (el) el.textContent = `${state.inst.caught}/${state.inst.total}`;
  }

  function setupInstClickListeners() {
    // Gauge clicks
    ['altitude','airspeed','vspeed','fuel'].forEach(name => {
      const el = $(`sim-g-${name}`);
      if (el && !el.dataset.simListener) {
        el.dataset.simListener = '1';
        el.addEventListener('click', () => handleInstClick(name));
      }
    });
    // Warning light clicks
    ['stall','fire','cabin','oil'].forEach(k => {
      const el = $(`swl-${k}`);
      if (el && !el.dataset.simListener) {
        el.dataset.simListener = '1';
        el.addEventListener('click', () => handleWarnClick(k));
      }
    });
  }

  function handleInstClick(name) {
    if (!state.running) return;
    if (state.inst.active[name]) {
      const ct = Date.now() - state.inst.active[name].startTime;
      state.inst.catchTimes.push(ct);
      state.inst.caught++;
      clearInstAnomaly(name);
      const gaugeEl = $(`sim-g-${name}`);
      if (gaugeEl) { gaugeEl.classList.add('sim-gauge-ok'); setTimeout(() => gaugeEl.classList.remove('sim-gauge-ok'), 600); }
      ADAPTAudio.playSuccess();
      updateInstDisplay();
      if (state.callbacks.onInstHit) state.callbacks.onInstHit(name, ct);
    }
  }

  function handleWarnClick(k) {
    if (!state.running) return;
    if (state.inst.activeWarns[k]) {
      const ct = Date.now() - state.inst.activeWarns[k].startTime;
      state.inst.catchTimes.push(ct);
      state.inst.caught++;
      clearWarn(k);
      const el = $(`swl-${k}`);
      if (el) { el.classList.add('swl-ack'); setTimeout(() => el.classList.remove('swl-ack'), 800); }
      ADAPTAudio.playSuccess();
      updateInstDisplay();
      if (state.callbacks.onInstHit) state.callbacks.onInstHit(k, ct);
    }
  }

  /* ═══════════════════════════════════════════
       MAIN RENDER LOOP
  ═══════════════════════════════════════════ */
  function renderLoop() {
    if (!state.running) return;
    const cvs = $('sim-track-canvas');
    if (cvs) { moveDot(cvs); sampleTracking(cvs); drawTrack(); }
    if (state.callbacks.onScoreUpdate) state.callbacks.onScoreUpdate(getStats());
    raf = requestAnimationFrame(renderLoop);
  }

  /* ─────────────── Public API ─────────────── */
  return {
    start,
    stop,
    getStats,
    setDifficulty,
    respondAlert,   // called by simulator controller on button click
  };
})();
