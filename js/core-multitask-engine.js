/* ═══════════════════════════════════════════════════════════════
   ADAPT — Core Multitask Engine v2.0
   Runs ALL four tasks simultaneously in real time:
     1. Pursuit Tracking     (mouse/touch canvas)
     2. Continuous Math      (arithmetic MCQ)
     3. Reaction Signals     (colour flash → respond)
     4. Instrument Monitoring (gauge anomaly detection)
   Adaptive difficulty · requestAnimationFrame loop
   ═══════════════════════════════════════════════════════════════ */

const CoreMultitaskEngine = (() => {

  /* ══════════════════ STATE ══════════════════ */
  let S = {};   // main state
  let _raf = null;
  let _timers = {};    // named setTimeout handles
  let _intervals = {}; // named setInterval handles
  let _running = false;
  let _onEnd = null;   // callback(results)

  /* ── Difficulty parameters (adjusted in real time) ── */
  const DIFF = {
    dotSpeed:       1.8,  // px per frame
    mathTimeout:    7000, // ms per question
    alertWindow:    2800, // ms to respond to alert
    alertDelay:     [3000, 9000],
    anomalyDelay:   [4000, 10000],
    anomalyWindow:  3500,
  };

  function resetDiff() {
    DIFF.dotSpeed      = 1.8;
    DIFF.mathTimeout   = 7000;
    DIFF.alertWindow   = 2800;
    DIFF.alertDelay    = [3000, 9000];
    DIFF.anomalyDelay  = [4000, 10000];
    DIFF.anomalyWindow = 3500;
  }

  function hardenDifficulty() {
    DIFF.dotSpeed      = Math.min(4.5, DIFF.dotSpeed + 0.25);
    DIFF.mathTimeout   = Math.max(3500, DIFF.mathTimeout - 300);
    DIFF.alertWindow   = Math.max(1500, DIFF.alertWindow - 150);
    DIFF.alertDelay    = [Math.max(1500, DIFF.alertDelay[0] - 200), Math.max(5000, DIFF.alertDelay[1] - 500)];
    DIFF.anomalyDelay  = [Math.max(2000, DIFF.anomalyDelay[0] - 300), Math.max(6000, DIFF.anomalyDelay[1] - 600)];
    DIFF.anomalyWindow = Math.max(2000, DIFF.anomalyWindow - 200);
  }

  function easenDifficulty() {
    DIFF.dotSpeed      = Math.max(1.2, DIFF.dotSpeed - 0.15);
    DIFF.mathTimeout   = Math.min(8000, DIFF.mathTimeout + 200);
    DIFF.alertWindow   = Math.min(3500, DIFF.alertWindow + 100);
  }

  /* ══════════════════ INIT STATE ══════════════════ */
  function initState(durationSec) {
    S = {
      running: false,
      timeLeft: durationSec,
      totalDuration: durationSec,
      lastDiffCheck: 0,    // timestamp of last difficulty adjustment
      diffCheckInterval: 20000, // check every 20s

      /* ── Tracking ── */
      track: {
        dotX: 200, dotY: 150,
        dotVX: 1.8, dotVY: 1.3,
        cursorX: 200, cursorY: 150,
        samples: [], // accuracy 0–1 per sample
        stabilityHistory: [], // rolling variance
      },

      /* ── Math ── */
      math: {
        correct: 0, total: 0,
        currentAnswer: null,
        answered: false,
        times: [],  // ms per correct answer
      },

      /* ── Reaction ── */
      react: {
        active: false,
        type: null,  // 'green'|'red'|'yellow'|'blue'
        key: null,
        startTime: 0,
        rts: [],
        correct: 0,
        total: 0,
        missed: 0,
        falseTaps: 0,
      },

      /* ── Monitoring ── */
      monitor: {
        caught: 0,
        total: 0,
        missed: 0,
        catchTimes: [],
        activeAnomalies: {}, // name → { startTime, caught }
      },

      /* ── Instruments (live state) ── */
      instruments: {
        altitude: { current: 5000, target: 5000, vel: 0, min: 0, max: 15000, normMin: 2000, normMax: 8000, unit: 'ft',  color: '#00aaff' },
        airspeed: { current: 200,  target: 200,  vel: 0, min: 0, max: 400,   normMin: 120,  normMax: 280,  unit: 'kts', color: '#ff8800' },
        vspeed:   { current: 0,    target: 0,    vel: 0, min: -2000, max: 2000, normMin: -500, normMax: 500, unit: 'fpm', color: '#00ff88' },
      },
    };
  }

  /* ══════════════════ TRACKING ══════════════════ */
  let _trackCanvas = null;

  function initTracking(canvasEl) {
    _trackCanvas = canvasEl;
    if (!_trackCanvas) return;

    const parent = _trackCanvas.parentElement;
    if (parent) {
      const w = Math.min(parent.clientWidth - 8, 640);
      _trackCanvas.width  = w;
      _trackCanvas.height = Math.round(w * 0.55);
    }

    S.track.cursorX = _trackCanvas.width / 2;
    S.track.cursorY = _trackCanvas.height / 2;
    S.track.dotX    = _trackCanvas.width / 2;
    S.track.dotY    = _trackCanvas.height / 2;

    _trackCanvas.removeEventListener('mousemove', _onMouse);
    _trackCanvas.removeEventListener('touchmove', _onTouch);
    _trackCanvas.addEventListener('mousemove', _onMouse);
    _trackCanvas.addEventListener('touchmove', _onTouch, { passive: false });
  }

  function _onMouse(e) {
    if (!_running || !_trackCanvas) return;
    const r = _trackCanvas.getBoundingClientRect();
    S.track.cursorX = (e.clientX - r.left) * (_trackCanvas.width / r.width);
    S.track.cursorY = (e.clientY - r.top)  * (_trackCanvas.height / r.height);
  }

  function _onTouch(e) {
    if (!_running || !_trackCanvas) return;
    e.preventDefault();
    const t = e.touches[0];
    const r = _trackCanvas.getBoundingClientRect();
    S.track.cursorX = (t.clientX - r.left) * (_trackCanvas.width / r.width);
    S.track.cursorY = (t.clientY - r.top)  * (_trackCanvas.height / r.height);
  }

  function _stepTracking() {
    if (!_trackCanvas) return;
    const W = _trackCanvas.width, H = _trackCanvas.height;
    const spd = DIFF.dotSpeed;

    // Add some sinusoidal wobble for realism
    const t = Date.now() / 1000;
    S.track.dotX += S.track.dotVX * spd + Math.sin(t * 1.3) * 0.3;
    S.track.dotY += S.track.dotVY * spd + Math.cos(t * 0.9) * 0.3;

    if (S.track.dotX < 18 || S.track.dotX > W - 18) S.track.dotVX *= -1;
    if (S.track.dotY < 18 || S.track.dotY > H - 18) S.track.dotVY *= -1;
    S.track.dotX = Math.max(18, Math.min(W - 18, S.track.dotX));
    S.track.dotY = Math.max(18, Math.min(H - 18, S.track.dotY));

    // Sample accuracy
    const dx = S.track.cursorX - S.track.dotX;
    const dy = S.track.cursorY - S.track.dotY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt(W * W + H * H) * 0.38;
    const acc = Math.max(0, 1 - dist / maxDist);
    S.track.samples.push(acc);
    if (S.track.samples.length > 600) S.track.samples.shift();
  }

  function _drawTracking() {
    if (!_trackCanvas) return;
    const ctx = _trackCanvas.getContext('2d');
    const W = _trackCanvas.width, H = _trackCanvas.height;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = isDark ? '#0d1524' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(0,170,255,0.07)' : 'rgba(0,80,180,0.09)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Moving dot
    const grd = ctx.createRadialGradient(S.track.dotX, S.track.dotY, 0, S.track.dotX, S.track.dotY, 16);
    grd.addColorStop(0, '#ff4444');
    grd.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.beginPath(); ctx.arc(S.track.dotX, S.track.dotY, 16, 0, Math.PI*2);
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath(); ctx.arc(S.track.dotX, S.track.dotY, 8, 0, Math.PI*2);
    ctx.fillStyle = '#ff3c3c'; ctx.fill();

    // Crosshair
    const cx = S.track.cursorX, cy = S.track.cursorY;
    const dd = Math.hypot(cx - S.track.dotX, cy - S.track.dotY);
    const close = dd < 22;
    const cCol = close ? '#00ff88' : (isDark ? '#00aaff' : '#0066cc');
    ctx.strokeStyle = cCol; ctx.lineWidth = 2;
    const cs = 18;
    ctx.beginPath(); ctx.moveTo(cx - cs, cy); ctx.lineTo(cx + cs, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI*2);
    ctx.strokeStyle = close ? 'rgba(0,255,136,0.5)' : 'rgba(0,170,255,0.4)';
    ctx.lineWidth = 1.5; ctx.stroke();

    // Accuracy bar
    const avgAcc = _trackAvg() / 100;
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
    ctx.fillRect(8, H - 14, W - 16, 8);
    const barCol = avgAcc > 0.7 ? '#00ff88' : avgAcc > 0.4 ? '#ffd600' : '#ff3c3c';
    ctx.fillStyle = barCol;
    ctx.fillRect(8, H - 14, (W - 16) * avgAcc, 8);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    ctx.strokeRect(8, H - 14, W - 16, 8);
  }

  function _trackAvg() {
    if (!S.track.samples.length) return 0;
    return (S.track.samples.reduce((a, b) => a + b, 0) / S.track.samples.length) * 100;
  }

  /* ══════════════════ MATH ══════════════════ */
  const OPS = ['+', '-', '×'];

  function _genMath() {
    const op = OPS[Math.floor(Math.random() * OPS.length)];
    let a, b, ans;
    switch (op) {
      case '+': a = Math.floor(Math.random()*60)+1; b = Math.floor(Math.random()*60)+1; ans = a+b; break;
      case '-': a = Math.floor(Math.random()*60)+20; b = Math.floor(Math.random()*20)+1; ans = a-b; break;
      case '×': a = Math.floor(Math.random()*9)+2; b = Math.floor(Math.random()*9)+2; ans = a*b; break;
    }
    return { q: `${a} ${op} ${b}`, answer: ans };
  }

  function _showMath(qEl, optsEl) {
    if (!_running || !qEl || !optsEl) return;
    const { q, answer } = _genMath();
    S.math.currentAnswer = answer;
    S.math.answered = false;
    S.math.mathShowTime = Date.now();
    qEl.textContent = q;

    const wrongs = new Set();
    while (wrongs.size < 3) {
      const off = Math.floor(Math.random() * 20) - 10;
      if (off !== 0) wrongs.add(answer + off);
    }
    const choices = [answer, ...wrongs].sort(() => Math.random() - 0.5);

    optsEl.innerHTML = '';
    choices.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'math-opt cme-math-opt';
      btn.textContent = val;
      btn.addEventListener('click', () => _answerMath(val, btn, answer, optsEl, qEl));
      optsEl.appendChild(btn);
    });

    clearTimeout(_timers.math);
    _timers.math = setTimeout(() => {
      if (!S.math.answered && _running) {
        S.math.total++;
        _showMath(qEl, optsEl);
      }
    }, DIFF.mathTimeout);
  }

  function _answerMath(chosen, btn, correct, optsEl, qEl) {
    if (S.math.answered || !_running) return;
    S.math.answered = true;
    clearTimeout(_timers.math);
    S.math.total++;
    const ok = chosen === correct;
    if (ok) {
      S.math.correct++;
      const elapsed = Date.now() - (S.math.mathShowTime || Date.now());
      S.math.times.push(elapsed);
      btn.classList.add('correct');
      ADAPTAudio.playCorrect();
    } else {
      btn.classList.add('wrong');
      ADAPTAudio.playWrong();
      optsEl.querySelectorAll('.cme-math-opt').forEach(b => {
        if (parseInt(b.textContent) === correct) b.classList.add('correct');
      });
    }
    _timers.math = setTimeout(() => { if (_running) _showMath(qEl, optsEl); }, 1000);
  }

  /* ══════════════════ REACTION SIGNALS ══════════════════ */
  const REACT_TYPES = [
    { type: 'green',  emoji: '🟢', label: 'CLICK / TAP!',         color: '#00cc66' },
    { type: 'red',    emoji: '🔴', label: 'DO NOT REACT!',         color: '#ff3c3c' },
    { type: 'yellow', emoji: '🟡', label: 'PRESS KEY: ',           color: '#ffd600' },
    { type: 'blue',   emoji: '🔵', label: 'DOUBLE-TAP!',           color: '#00aaff' },
  ];
  const RT_KEYS = ['A','B','C','D','E','F'];

  function _scheduleReact(els) {
    if (!_running) return;
    const [min, max] = DIFF.alertDelay;
    const delay = min + Math.random() * (max - min);
    clearTimeout(_timers.react);
    _timers.react = setTimeout(() => { if (_running) _showReact(els); }, delay);
  }

  function _showReact(els) {
    if (S.react.active || !_running) return;
    const sig = REACT_TYPES[Math.floor(Math.random() * REACT_TYPES.length)];
    const key = RT_KEYS[Math.floor(Math.random() * RT_KEYS.length)];
    S.react.active = true;
    S.react.type   = sig.type;
    S.react.key    = key;
    S.react.startTime = Date.now();
    S.react.total++;

    if (els.signalEl) {
      els.signalEl.style.background = sig.color + '33';
      els.signalEl.style.borderColor = sig.color;
      els.signalEl.style.color = sig.color;
      els.signalEl.textContent = sig.emoji + ' ' + (sig.type === 'yellow' ? sig.label + key : sig.label);
      els.signalEl.classList.add('active');
    }
    ADAPTAudio.beep(sig.type === 'red' ? 220 : 880, 0.07, 'sine', 0.25);

    if (sig.type !== 'red') {
      clearTimeout(_timers.reactWindow);
      _timers.reactWindow = setTimeout(() => {
        if (S.react.active && _running) {
          S.react.missed++;
          S.react.active = false;
          if (els.signalEl) { els.signalEl.classList.remove('active'); els.signalEl.textContent = 'STANDBY'; }
          ADAPTAudio.playError();
          if (els.feedbackEl) { els.feedbackEl.textContent = '✗ MISSED'; els.feedbackEl.style.color = '#ff8800'; }
          _scheduleReact(els);
        }
      }, DIFF.alertWindow);
    } else {
      clearTimeout(_timers.reactWindow);
      _timers.reactWindow = setTimeout(() => {
        if (S.react.active && _running) {
          S.react.correct++;
          S.react.active = false;
          if (els.signalEl) { els.signalEl.classList.remove('active'); els.signalEl.textContent = 'STANDBY'; }
          ADAPTAudio.playCorrect();
          if (els.feedbackEl) { els.feedbackEl.textContent = '✓ HELD'; els.feedbackEl.style.color = '#00ff88'; }
          _scheduleReact(els);
        }
      }, DIFF.alertWindow);
    }
  }

  // Called on stage click/tap
  function reactTap(els, isDouble) {
    if (!_running) return;
    if (!S.react.active) {
      S.react.falseTaps++;
      if (els.feedbackEl) { els.feedbackEl.textContent = '✗ FALSE TAP'; els.feedbackEl.style.color = '#ff3c3c'; }
      ADAPTAudio.playWrong();
      return;
    }
    if (S.react.type === 'red') {
      // Wrong – should not tap
      clearTimeout(_timers.reactWindow);
      S.react.active = false;
      if (els.signalEl) { els.signalEl.classList.remove('active'); els.signalEl.textContent = 'STANDBY'; }
      if (els.feedbackEl) { els.feedbackEl.textContent = '✗ NO TAP ON RED'; els.feedbackEl.style.color = '#ff3c3c'; }
      ADAPTAudio.playWrong();
      _scheduleReact(els);
      return;
    }
    if (S.react.type === 'blue' && !isDouble) return; // wait for double
    clearTimeout(_timers.reactWindow);
    const rt = Date.now() - S.react.startTime;
    S.react.rts.push(rt);
    S.react.correct++;
    S.react.active = false;
    if (els.signalEl) { els.signalEl.classList.remove('active'); els.signalEl.textContent = 'STANDBY'; }
    if (els.feedbackEl) { els.feedbackEl.textContent = `✓ ${rt}ms`; els.feedbackEl.style.color = '#00ff88'; }
    ADAPTAudio.playCorrect();
    _scheduleReact(els);
  }

  function reactKey(key, els) {
    if (!_running || !S.react.active || S.react.type !== 'yellow') return;
    if (key.toUpperCase() === S.react.key) {
      clearTimeout(_timers.reactWindow);
      const rt = Date.now() - S.react.startTime;
      S.react.rts.push(rt);
      S.react.correct++;
      S.react.active = false;
      if (els.signalEl) { els.signalEl.classList.remove('active'); els.signalEl.textContent = 'STANDBY'; }
      if (els.feedbackEl) { els.feedbackEl.textContent = `✓ ${rt}ms KEY:${key.toUpperCase()}`; els.feedbackEl.style.color = '#00ff88'; }
      ADAPTAudio.playCorrect();
      _scheduleReact(els);
    } else {
      if (els.feedbackEl) { els.feedbackEl.textContent = `✗ WRONG KEY (${key.toUpperCase()})`; els.feedbackEl.style.color = '#ff3c3c'; }
      ADAPTAudio.playWrong();
    }
  }

  /* ══════════════════ INSTRUMENT MONITORING ══════════════════ */
  function _updateInstruments() {
    const names = Object.keys(S.instruments);
    names.forEach(n => {
      const inst = S.instruments[n];
      const diff = inst.target - inst.current;
      inst.vel = inst.vel * 0.85 + diff * 0.02;
      inst.current += inst.vel;
      inst.current = Math.max(inst.min, Math.min(inst.max, inst.current));
    });
  }

  function _drawMiniGauge(canvasEl, inst, name) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;
    const cx = W/2, cy = H/2, R = W/2 - 8;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    ctx.clearRect(0,0,W,H);
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
    ctx.fillStyle = isDark ? '#0d1524' : '#dde5f5'; ctx.fill();
    ctx.strokeStyle = isDark ? '#1e3050' : '#aabbd8'; ctx.lineWidth = 1.5; ctx.stroke();

    const sA = Math.PI * 0.75, eA = Math.PI * 2.25, tot = eA - sA;
    const range = inst.max - inst.min;
    if (inst.normMin !== null) {
      const ns = sA + ((inst.normMin - inst.min) / range) * tot;
      const ne = sA + ((inst.normMax - inst.min) / range) * tot;
      ctx.beginPath(); ctx.arc(cx,cy,R-5,ns,ne);
      ctx.strokeStyle = 'rgba(0,255,136,0.25)'; ctx.lineWidth = 5; ctx.stroke();
    }
    const norm = (inst.current - inst.min) / range;
    const na = sA + norm * tot;
    const isAnom = name !== 'heading' && inst.normMin !== null &&
      (inst.current < inst.normMin || inst.current > inst.normMax);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(na);
    ctx.beginPath(); ctx.moveTo(-3,6); ctx.lineTo(0,-(R-12)); ctx.lineTo(3,6); ctx.closePath();
    ctx.fillStyle = isAnom ? '#ff3c3c' : inst.color; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2);
    ctx.fillStyle = inst.color; ctx.fill();
  }

  function triggerAnomaly(name, instCanvases, instValueEls, instFlashEls, instWrapEls) {
    if (!_running) return;
    const inst = S.instruments[name];
    if (S.monitor.activeAnomalies[name]) return;
    const above = Math.random() < 0.5;
    if (above) inst.target = inst.normMax + (inst.max - inst.normMax) * (0.3 + Math.random()*0.5);
    else        inst.target = inst.normMin - (inst.normMin - inst.min) * (0.3 + Math.random()*0.5);

    S.monitor.total++;
    S.monitor.activeAnomalies[name] = { startTime: Date.now(), caught: false };
    if (instFlashEls && instFlashEls[name]) instFlashEls[name].classList.remove('hidden');
    if (instWrapEls && instWrapEls[name])  instWrapEls[name].classList.add('anomaly');
    ADAPTAudio.playWarning();

    clearTimeout(_timers['anom_' + name]);
    _timers['anom_' + name] = setTimeout(() => {
      if (S.monitor.activeAnomalies[name] && !S.monitor.activeAnomalies[name].caught && _running) {
        S.monitor.missed++;
        _clearAnomaly(name, inst, instFlashEls, instWrapEls);
      }
    }, DIFF.anomalyWindow);
  }

  function clickAnomaly(name, inst, instFlashEls, instWrapEls) {
    if (!_running || !S.monitor.activeAnomalies[name]) return;
    const ct = Date.now() - S.monitor.activeAnomalies[name].startTime;
    S.monitor.caught++;
    S.monitor.catchTimes.push(ct);
    S.monitor.activeAnomalies[name].caught = true;
    clearTimeout(_timers['anom_' + name]);
    _clearAnomaly(name, inst, instFlashEls, instWrapEls);
    ADAPTAudio.playSuccess();
    if (instWrapEls && instWrapEls[name]) {
      instWrapEls[name].classList.add('clicked-ok');
      setTimeout(() => instWrapEls[name].classList.remove('clicked-ok'), 700);
    }
  }

  function _clearAnomaly(name, inst, instFlashEls, instWrapEls) {
    delete S.monitor.activeAnomalies[name];
    if (inst.normMin !== null) inst.target = (inst.normMin + inst.normMax) / 2;
    if (instFlashEls && instFlashEls[name]) instFlashEls[name].classList.add('hidden');
    if (instWrapEls  && instWrapEls[name])  { instWrapEls[name].classList.remove('anomaly'); }
  }

  function _scheduleAnomaly(canvases, valueEls, flashEls, wrapEls) {
    if (!_running) return;
    const [min, max] = DIFF.anomalyDelay;
    const delay = min + Math.random() * (max - min);
    clearTimeout(_timers.anomaly);
    _timers.anomaly = setTimeout(() => {
      if (!_running) return;
      const candidates = Object.keys(S.instruments).filter(n => !S.monitor.activeAnomalies[n]);
      if (candidates.length) {
        const name = candidates[Math.floor(Math.random() * candidates.length)];
        triggerAnomaly(name, canvases, valueEls, flashEls, wrapEls);
      }
      _scheduleAnomaly(canvases, valueEls, flashEls, wrapEls);
    }, delay);
  }

  /* ══════════════════ ADAPTIVE DIFFICULTY ══════════════════ */
  function _checkAdaptDifficulty() {
    const now = Date.now();
    if (now - S.lastDiffCheck < S.diffCheckInterval) return;
    S.lastDiffCheck = now;

    const trackScore = _trackAvg();
    const mathAcc    = S.math.total > 0 ? (S.math.correct / S.math.total * 100) : 50;
    const reactAcc   = S.react.total > 0 ? (S.react.correct / S.react.total * 100) : 50;

    const avg = (trackScore + mathAcc + reactAcc) / 3;
    if (avg > 75) hardenDifficulty();
    else if (avg < 45) easenDifficulty();
  }

  /* ══════════════════ TIMER ══════════════════ */
  function _startTimer(timerEl, onDone) {
    _intervals.timer = setInterval(() => {
      if (!_running) { clearInterval(_intervals.timer); return; }
      S.timeLeft--;
      if (timerEl) {
        const m = Math.floor(S.timeLeft / 60);
        const s = S.timeLeft % 60;
        timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        timerEl.className = 'module-timer';
        if (S.timeLeft <= 30) timerEl.classList.add('warning');
        if (S.timeLeft <= 10) { timerEl.classList.add('danger'); ADAPTAudio.playCountdown(); }
      }
      if (S.timeLeft <= 0) {
        clearInterval(_intervals.timer);
        onDone();
      }
    }, 1000);
  }

  /* ══════════════════ MAIN RAF LOOP ══════════════════ */
  function _loop(instCanvases, instValueEls) {
    if (!_running) return;
    _stepTracking();
    _drawTracking();
    _updateInstruments();

    // Draw mini gauges
    if (instCanvases) {
      Object.keys(instCanvases).forEach(n => {
        const cvs = instCanvases[n];
        if (cvs) _drawMiniGauge(cvs, S.instruments[n], n);
      });
    }
    // Update value text
    if (instValueEls) {
      Object.keys(instValueEls).forEach(n => {
        const el = instValueEls[n];
        if (!el) return;
        const inst = S.instruments[n];
        if (n === 'altitude') el.textContent = Math.round(inst.current).toLocaleString() + ' ft';
        else if (n === 'airspeed') el.textContent = Math.round(inst.current) + ' kts';
        else if (n === 'vspeed')   el.textContent = (inst.current >= 0 ? '+' : '') + Math.round(inst.current) + ' fpm';
      });
    }

    _checkAdaptDifficulty();
    _raf = requestAnimationFrame(() => _loop(instCanvases, instValueEls));
  }

  /* ══════════════════ START / STOP ══════════════════ */
  function start(opts) {
    /*
      opts = {
        durationSec, timerEl,
        trackCanvas,
        mathQEl, mathOptsEl,
        reactSignalEl, reactFeedbackEl,
        instCanvases:  { altitude, airspeed, vspeed },
        instValueEls:  { altitude, airspeed, vspeed },
        instFlashEls:  { altitude, airspeed, vspeed },
        instWrapEls:   { altitude, airspeed, vspeed },
        onScoreUpdate, onEnd
      }
    */
    stop();
    resetDiff();
    initState(opts.durationSec);
    _running = true;
    _onEnd   = opts.onEnd || null;

    // Init tracking canvas
    initTracking(opts.trackCanvas);

    // Show first math question
    _showMath(opts.mathQEl, opts.mathOptsEl);

    // Start reaction scheduling
    const reactEls = { signalEl: opts.reactSignalEl, feedbackEl: opts.reactFeedbackEl };
    _scheduleReact(reactEls);

    // Store reactEls on instance for external tap/key handling
    start._reactEls = reactEls;

    // Start anomaly scheduling
    _scheduleAnomaly(opts.instCanvases, opts.instValueEls, opts.instFlashEls, opts.instWrapEls);

    // Store refs for click handling
    start._instCanvases  = opts.instCanvases;
    start._instValueEls  = opts.instValueEls;
    start._instFlashEls  = opts.instFlashEls;
    start._instWrapEls   = opts.instWrapEls;

    // Score update callback every second
    if (opts.onScoreUpdate) {
      _intervals.scoreUpdate = setInterval(() => {
        if (_running) opts.onScoreUpdate(_liveScores());
      }, 1000);
    }

    // RAF loop
    _raf = requestAnimationFrame(() => _loop(opts.instCanvases, opts.instValueEls));

    // Timer
    _startTimer(opts.timerEl, () => _finish(opts));
  }

  function _liveScores() {
    return {
      trackAcc:  Math.round(_trackAvg()),
      mathAcc:   S.math.total > 0 ? Math.round(S.math.correct / S.math.total * 100) : 0,
      reactAcc:  S.react.total > 0 ? Math.round(S.react.correct / S.react.total * 100) : 0,
      monAcc:    S.monitor.total > 0 ? Math.round(S.monitor.caught / S.monitor.total * 100) : 100,
      avgRT:     S.react.rts.length > 0 ? Math.round(S.react.rts.reduce((a,b) => a+b,0) / S.react.rts.length) : null,
      timeLeft:  S.timeLeft,
    };
  }

  function _finish(opts) {
    _running = false;
    cancelAnimationFrame(_raf);
    Object.values(_timers).forEach(t => clearTimeout(t));
    Object.values(_intervals).forEach(t => clearInterval(t));

    const trackAcc   = Math.round(_trackAvg());
    const mathAcc    = S.math.total > 0 ? Math.round(S.math.correct / S.math.total * 100) : 0;
    const avgRT      = S.react.rts.length > 0 ? Math.round(S.react.rts.reduce((a,b)=>a+b,0)/S.react.rts.length) : null;
    const reactScore = ScoringEngine.scoreReaction(S.react.rts, S.react.missed, S.react.falseTaps);
    const monAcc     = S.monitor.total > 0 ? Math.round(S.monitor.caught / S.monitor.total * 100) : 100;
    const avgMathMs  = S.math.times.length > 0 ? Math.round(S.math.times.reduce((a,b)=>a+b,0)/S.math.times.length) : null;

    const trackScore = ScoringEngine.scoreTracking(trackAcc, _stabilityScore());
    const mathScore  = ScoringEngine.scoreMath(S.math.correct, S.math.total, avgMathMs);
    const monScore   = ScoringEngine.scoreMonitoring(S.monitor.caught, S.monitor.total, null, S.monitor.missed);
    const multitaskEff = ScoringEngine.multitaskEfficiency(trackScore, mathScore, reactScore);

    const composite = ScoringEngine.compositeScore({
      tracking:   { score: trackScore },
      math:       { score: mathScore },
      reaction:   { score: reactScore },
      monitoring: { score: monScore },
    });

    const results = {
      composite, multitaskEff,
      trackAcc, trackScore,
      mathAcc, mathScore,
      mathCorrect: S.math.correct, mathTotal: S.math.total,
      reactScore, avgRT,
      reactCorrect: S.react.correct, reactTotal: S.react.total,
      reactMissed: S.react.missed, falseTaps: S.react.falseTaps,
      rts: S.react.rts,
      monAcc, monScore,
      monCaught: S.monitor.caught, monTotal: S.monitor.total, monMissed: S.monitor.missed,
    };

    if (_onEnd) _onEnd(results);
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_raf);
    clearTimeout(_timers.math);
    clearTimeout(_timers.react);
    clearTimeout(_timers.reactWindow);
    clearTimeout(_timers.anomaly);
    Object.keys(_timers).forEach(k => clearTimeout(_timers[k]));
    Object.keys(_intervals).forEach(k => clearInterval(_intervals[k]));
    _timers = {};
    _intervals = {};
  }

  function _stabilityScore() {
    if (S.track.samples.length < 10) return 80;
    // Rolling 2-second windows
    const winSize = 60;
    const windows = [];
    for (let i = winSize; i <= S.track.samples.length; i += winSize) {
      const win = S.track.samples.slice(i - winSize, i);
      const avg = win.reduce((a,b) => a+b, 0) / win.length;
      windows.push(avg);
    }
    return windows.length > 1 ? ScoringEngine.consistencyScore(windows.map(w => w * 100)) : 80;
  }

  /* ── Expose for external click/key events ── */
  function handleReactTap(isDouble) { reactTap(start._reactEls || {}, isDouble); }
  function handleReactKey(key) { reactKey(key, start._reactEls || {}); }
  function handleInstClick(name) {
    const inst = S.instruments[name];
    if (!inst) return;
    clickAnomaly(name, inst, start._instFlashEls, start._instWrapEls);
  }
  function getLiveScores() { return _liveScores(); }
  function isRunning() { return _running; }

  console.log('[CoreMultitaskEngine] initialized – version 2.0');
  return { start, stop, handleReactTap, handleReactKey, handleInstClick, getLiveScores, isRunning };
})();
