/* ═══════════════════════════════════════════════════════════════
   ADAPT — Multitasking Module
   Three simultaneous tasks:
   1) Pursuit tracking  (canvas – mouse/touch)
   2) Math questions    (arithmetic MCQ)
   3) Alert response    (flash → click)
   ═══════════════════════════════════════════════════════════════ */

const MultitaskModule = (() => {

  /* ── DOM refs ── */
  const startBtn    = () => document.getElementById('mt-start-btn');
  const introEl     = () => document.getElementById('mt-intro');
  const arenaEl     = () => document.getElementById('mt-arena');
  const resultEl    = () => document.getElementById('mt-result');
  const timerEl     = () => document.getElementById('mt-timer');
  const trackScoreEl= () => document.getElementById('mt-track-score');
  const mathScoreEl = () => document.getElementById('mt-math-score');
  const alertScoreEl= () => document.getElementById('mt-alert-score');
  const mathQEl     = () => document.getElementById('mt-math-q');
  const mathOptsEl  = () => document.getElementById('mt-math-opts');
  const alertSignal = () => document.getElementById('mt-alert-signal');
  const alertBtn    = () => document.getElementById('mt-alert-btn');
  const alertText   = () => document.getElementById('mt-alert-text');
  const canvas      = () => document.getElementById('mt-canvas');

  /* ── State ── */
  let state = {};
  let raf = null;
  let countdownInterval = null;
  let mathTimer = null;
  let alertTimer = null;
  let alertWindowTimer = null;

  const DURATION = 120; // seconds

  function reset() {
    state = {
      running: false,
      timeLeft: DURATION,
      // Tracking
      dotX: 200, dotY: 130,
      dotVX: 1.5, dotVY: 1.2,
      cursorX: 200, cursorY: 130,
      trackSamples: [],
      trackTotal: 0,
      // Math
      mathCorrect: 0, mathTotal: 0,
      mathAnswered: false,
      // Alert
      alertCorrect: 0, alertTotal: 0,
      alertActive: false,
      alertMissed: 0,
      alertStartTime: 0,
      alertRTs: [],
    };
  }

  /* ──────────── TRACKING ──────────── */
  function initCanvas() {
    const cvs = canvas();
    if (!cvs) return;
    // Set canvas size based on container
    const parent = cvs.parentElement;
    if (parent) {
      const w = Math.min(parent.clientWidth - 16, 600);
      cvs.width = w;
      cvs.height = Math.round(w * 0.65);
      // Init cursor to center
      state.cursorX = cvs.width / 2;
      state.cursorY = cvs.height / 2;
      state.dotX = cvs.width / 2;
      state.dotY = cvs.height / 2;
    }
    cvs.removeEventListener('mousemove', onCursorMove);
    cvs.removeEventListener('touchmove', onTouchMove);
    cvs.addEventListener('mousemove', onCursorMove);
    cvs.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function onCursorMove(e) {
    if (!state.running) return;
    const cvs = canvas();
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    state.cursorX = (e.clientX - rect.left) * scaleX;
    state.cursorY = (e.clientY - rect.top) * scaleY;
  }

  function onTouchMove(e) {
    if (!state.running) return;
    e.preventDefault();
    const touch = e.touches[0];
    const cvs = canvas();
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    state.cursorX = (touch.clientX - rect.left) * scaleX;
    state.cursorY = (touch.clientY - rect.top) * scaleY;
  }

  function moveDot(cvs) {
    const W = cvs.width, H = cvs.height;
    const speed = 1 + (DURATION - state.timeLeft) / DURATION * 1.5;
    state.dotX += state.dotVX * speed;
    state.dotY += state.dotVY * speed;
    if (state.dotX < 16 || state.dotX > W - 16) state.dotVX *= -1;
    if (state.dotY < 16 || state.dotY > H - 16) state.dotVY *= -1;
    state.dotX = Math.max(16, Math.min(W - 16, state.dotX));
    state.dotY = Math.max(16, Math.min(H - 16, state.dotY));
  }

  function sampleTracking() {
    const dx = state.cursorX - state.dotX;
    const dy = state.cursorY - state.dotY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cvs = canvas();
    const maxDist = Math.sqrt(cvs.width ** 2 + cvs.height ** 2);
    const accuracy = Math.max(0, 1 - dist / (maxDist * 0.4));
    state.trackSamples.push(accuracy);
    state.trackTotal++;
  }

  function avgTracking() {
    if (!state.trackSamples.length) return 0;
    const sum = state.trackSamples.reduce((a, b) => a + b, 0);
    return (sum / state.trackSamples.length * 100);
  }

  function drawCanvas() {
    const cvs = canvas();
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    ctx.clearRect(0, 0, W, H);
    // Background
    ctx.fillStyle = isDark ? '#0d1524' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = isDark ? 'rgba(0,170,255,0.08)' : 'rgba(0,80,180,0.1)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y = 40; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    // Dot
    const dotRadius = 14;
    const grd = ctx.createRadialGradient(state.dotX, state.dotY, 0, state.dotX, state.dotY, dotRadius);
    grd.addColorStop(0, '#ff4444');
    grd.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.beginPath();
    ctx.arc(state.dotX, state.dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(state.dotX, state.dotY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3c3c';
    ctx.fill();

    // Crosshair (cursor)
    const cx = state.cursorX, cy = state.cursorY;
    const dx = cx - state.dotX, dy = cy - state.dotY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const close = dist < 20;
    const crossColor = close ? '#00ff88' : (isDark ? '#00aaff' : '#0066cc');
    ctx.strokeStyle = crossColor;
    ctx.lineWidth = 2;
    const cs = 16;
    // Cross
    ctx.beginPath(); ctx.moveTo(cx - cs, cy); ctx.lineTo(cx + cs, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs); ctx.stroke();
    // Circle
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = close ? 'rgba(0,255,136,0.5)' : 'rgba(0,170,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Accuracy bar
    const acc = avgTracking();
    ctx.fillStyle = isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
    ctx.fillRect(8, H - 16, W - 16, 8);
    const barColor = acc > 70 ? '#00ff88' : acc > 40 ? '#ffd600' : '#ff3c3c';
    ctx.fillStyle = barColor;
    ctx.fillRect(8, H - 16, (W - 16) * (acc / 100), 8);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.strokeRect(8, H - 16, W - 16, 8);
  }

  function renderLoop() {
    if (!state.running) return;
    const cvs = canvas();
    moveDot(cvs);
    sampleTracking();
    drawCanvas();
    // Update tracking score display
    const acc = avgTracking();
    const el = trackScoreEl();
    if (el) el.textContent = acc.toFixed(0) + '%';
    raf = requestAnimationFrame(renderLoop);
  }

  /* ──────────── MATH ──────────── */
  function generateMath() {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;
    switch (op) {
      case '+': a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; answer = a + b; break;
      case '-': a = Math.floor(Math.random() * 50) + 20; b = Math.floor(Math.random() * 20) + 1; answer = a - b; break;
      case '×': a = Math.floor(Math.random() * 9) + 2; b = Math.floor(Math.random() * 9) + 2; answer = a * b; break;
    }
    return { question: `${a} ${op} ${b}`, answer };
  }

  function showMathQuestion() {
    if (!state.running) return;
    const { question, answer } = generateMath();
    const qEl = mathQEl();
    const optsEl = mathOptsEl();
    if (!qEl || !optsEl) return;
    qEl.textContent = question;
    state.mathAnswered = false;
    state.currentAnswer = answer;

    // Generate distractors
    const wrongs = new Set();
    while (wrongs.size < 3) {
      const offset = Math.floor(Math.random() * 20) - 10;
      const w = answer + offset;
      if (w !== answer) wrongs.add(w);
    }
    const choices = [answer, ...wrongs].sort(() => Math.random() - 0.5);

    optsEl.innerHTML = '';
    choices.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'math-opt';
      btn.textContent = val;
      btn.addEventListener('click', () => answerMath(val, btn, answer, optsEl));
      optsEl.appendChild(btn);
    });

    // Auto-skip after 8 seconds
    clearTimeout(mathTimer);
    mathTimer = setTimeout(() => {
      if (!state.mathAnswered && state.running) {
        state.mathTotal++;
        updateMathDisplay();
        showMathQuestion();
      }
    }, 8000);
  }

  function answerMath(chosen, btn, correct, optsEl) {
    if (state.mathAnswered || !state.running) return;
    state.mathAnswered = true;
    clearTimeout(mathTimer);
    state.mathTotal++;
    const isCorrect = chosen === correct;
    if (isCorrect) {
      state.mathCorrect++;
      btn.classList.add('correct');
      ADAPTAudio.playCorrect();
    } else {
      btn.classList.add('wrong');
      ADAPTAudio.playWrong();
      // Show correct answer
      optsEl.querySelectorAll('.math-opt').forEach(b => {
        if (parseInt(b.textContent) === correct) b.classList.add('correct');
      });
    }
    updateMathDisplay();
    // Next question after 1.2s
    mathTimer = setTimeout(() => {
      if (state.running) showMathQuestion();
    }, 1200);
  }

  function updateMathDisplay() {
    const el = mathScoreEl();
    if (el) el.textContent = `${state.mathCorrect}/${state.mathTotal}`;
  }

  /* ──────────── ALERT SIGNAL ──────────── */
  function scheduleAlert() {
    if (!state.running) return;
    const delay = 3000 + Math.random() * 7000;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => {
      if (!state.running) return;
      showAlert();
    }, delay);
  }

  function showAlert() {
    if (state.alertActive || !state.running) return;
    state.alertActive = true;
    state.alertTotal++;
    state.alertStartTime = Date.now();

    const sig = alertSignal();
    const btn = alertBtn();
    const txt = alertText();
    if (!sig || !btn || !txt) return;

    sig.className = 'alert-signal flash-green';
    txt.textContent = '⚠ ALERT — RESPOND!';
    btn.disabled = false;
    ADAPTAudio.playAlert();

    updateAlertDisplay();

    // Miss window: 2.5 seconds
    clearTimeout(alertWindowTimer);
    alertWindowTimer = setTimeout(() => {
      if (state.alertActive && state.running) {
        missAlert();
      }
    }, 2500);
  }

  function missAlert() {
    state.alertActive = false;
    state.alertMissed++;
    const sig = alertSignal();
    const btn = alertBtn();
    const txt = alertText();
    if (sig) { sig.className = 'alert-signal flash-red'; }
    if (txt) txt.textContent = 'MISSED!';
    if (btn) btn.disabled = true;
    ADAPTAudio.playError();
    updateAlertDisplay();
    setTimeout(() => {
      if (sig) { sig.className = 'alert-signal'; }
      if (txt) txt.textContent = 'STANDBY';
      scheduleAlert();
    }, 800);
  }

  function respondToAlert() {
    if (!state.alertActive || !state.running) return;
    clearTimeout(alertWindowTimer);
    const rt = Date.now() - state.alertStartTime;
    state.alertRTs.push(rt);
    state.alertCorrect++;
    state.alertActive = false;

    const sig = alertSignal();
    const btn = alertBtn();
    const txt = alertText();
    if (sig) sig.className = 'alert-signal';
    if (txt) txt.textContent = `✓ ${rt}ms`;
    if (btn) btn.disabled = true;
    ADAPTAudio.playSuccess();
    updateAlertDisplay();

    setTimeout(() => {
      if (sig) sig.className = 'alert-signal';
      if (txt) txt.textContent = 'STANDBY';
      scheduleAlert();
    }, 800);
  }

  function updateAlertDisplay() {
    const el = alertScoreEl();
    if (el) el.textContent = `${state.alertCorrect}/${state.alertTotal}`;
  }

  /* ──────────── TIMER ──────────── */
  function startCountdown() {
    const el = timerEl();
    countdownInterval = setInterval(() => {
      if (!state.running) { clearInterval(countdownInterval); return; }
      state.timeLeft--;
      updateTimerDisplay();
      if (state.timeLeft <= 0) {
        clearInterval(countdownInterval);
        endTest();
      } else if (state.timeLeft <= 10) {
        ADAPTAudio.playCountdown();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = timerEl();
    if (!el) return;
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    el.className = 'module-timer';
    if (state.timeLeft <= 10) el.classList.add('danger');
    else if (state.timeLeft <= 30) el.classList.add('warning');
  }

  /* ──────────── START / END ──────────── */
  function start() {
    reset();
    state.running = true;

    introEl().classList.add('hidden');
    arenaEl().classList.remove('hidden');
    resultEl().classList.add('hidden');

    document.getElementById('status-dot').className = 'status-dot active';
    document.getElementById('status-label').textContent = 'MULTITASK';

    initCanvas();
    renderLoop();
    showMathQuestion();
    scheduleAlert();
    startCountdown();

    // Remove any previous listener before adding new one
    const aBtn = alertBtn();
    aBtn.removeEventListener('click', respondToAlert);
    aBtn.addEventListener('click', respondToAlert);
  }

  function endTest() {
    state.running = false;
    cancelAnimationFrame(raf);
    clearTimeout(mathTimer);
    clearTimeout(alertTimer);
    clearTimeout(alertWindowTimer);

    document.getElementById('status-dot').className = 'status-dot';
    document.getElementById('status-label').textContent = 'READY';

    const trackAcc = avgTracking();
    const mathAcc = state.mathTotal > 0 ? (state.mathCorrect / state.mathTotal * 100) : 0;
    const alertAcc = state.alertTotal > 0 ? (state.alertCorrect / state.alertTotal * 100) : 0;
    const avgAlertRT = state.alertRTs.length > 0
      ? Math.round(state.alertRTs.reduce((a, b) => a + b, 0) / state.alertRTs.length)
      : null;
    const composite = Math.round(trackAcc * 0.4 + mathAcc * 0.35 + alertAcc * 0.25);

    ADAPTStorage.addScore('multitask', {
      composite, trackAcc: Math.round(trackAcc), mathAcc: Math.round(mathAcc),
      alertAcc: Math.round(alertAcc), avgAlertRT,
      mathCorrect: state.mathCorrect, mathTotal: state.mathTotal,
      alertCorrect: state.alertCorrect, alertTotal: state.alertTotal
    });

    // Show result
    const rEl = resultEl();
    rEl.classList.remove('hidden');
    rEl.innerHTML = `
      <div class="result-score" style="color:${composite>=75?'#00ff88':composite>=55?'#ffd600':'#ff3c3c'}">${composite}%</div>
      <div class="result-label">Multitask Composite Score</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Tracking</div><div class="r-val">${trackAcc.toFixed(0)}%</div></div>
        <div class="result-item"><div class="r-label">Math Acc.</div><div class="r-val">${mathAcc.toFixed(0)}%</div></div>
        <div class="result-item"><div class="r-label">Alert Acc.</div><div class="r-val">${alertAcc.toFixed(0)}%</div></div>
        ${avgAlertRT ? `<div class="result-item"><div class="r-label">Avg RT</div><div class="r-val">${avgAlertRT}ms</div></div>` : ''}
      </div>
      <button class="btn-primary" id="mt-retry-btn">Try Again</button>
    `;
    document.getElementById('mt-retry-btn').addEventListener('click', retryTest);
    arenaEl().classList.add('hidden');

    // Fire dashboard update
    if (window.DashboardModule) window.DashboardModule.refresh();
  }

  function retryTest() {
    resultEl().classList.add('hidden');
    introEl().classList.remove('hidden');
    timerEl().textContent = '02:00';
    timerEl().className = 'module-timer';
  }

  function init() {
    startBtn().addEventListener('click', start);
  }

  return { init };
})();
