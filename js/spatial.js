/* ═══════════════════════════════════════════════════════════════
   ADAPT — Spatial Orientation Module
   Shows aircraft silhouette with bank/pitch, user picks description
   ═══════════════════════════════════════════════════════════════ */

const SpatialModule = (() => {

  const DURATION = 90;
  let state = {};
  let countdownInterval = null;
  let feedbackTimeout = null;

  const $id = id => document.getElementById(id);

  function reset() {
    state = {
      running: false,
      timeLeft: DURATION,
      score: 0,
      correct: 0,
      total: 0,
      streak: 0,
      waitingAnswer: false,
      currentQuestion: null,
    };
  }

  /* ── Question generation ── */
  const BANK_LABELS = {
    '-60': 'Sharp left bank (60°)',
    '-30': 'Moderate left bank (30°)',
    '-15': 'Slight left bank (15°)',
    '0':   'Wings level',
    '15':  'Slight right bank (15°)',
    '30':  'Moderate right bank (30°)',
    '60':  'Sharp right bank (60°)',
  };
  const PITCH_LABELS = {
    '-20': 'Nose-down (descending)',
    '-10': 'Slight nose-down',
    '0':   'Level pitch',
    '10':  'Slight nose-up',
    '20':  'Nose-up (climbing)',
  };

  function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function generateQuestion() {
    const bankValues = [-60, -30, -15, 0, 15, 30, 60];
    const pitchValues = [-20, -10, 0, 10, 20];
    const bank = randomFrom(bankValues);
    const pitch = randomFrom(pitchValues);
    const correctLabel = BANK_LABELS[bank] + ' / ' + PITCH_LABELS[pitch];

    // Generate 3 distractors
    const distractors = new Set();
    while (distractors.size < 3) {
      const b = randomFrom(bankValues);
      const p = randomFrom(pitchValues);
      const label = BANK_LABELS[b] + ' / ' + PITCH_LABELS[p];
      if (label !== correctLabel) distractors.add(label);
    }

    const choices = [correctLabel, ...distractors].sort(() => Math.random() - 0.5);
    return { bank, pitch, correctLabel, choices };
  }

  /* ── Aircraft drawing ── */
  function drawAircraft(bank, pitch) {
    const cvs = $id('sp-canvas');
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const bgCol = isDark ? '#0d1524' : '#dde5f5';
    const lineCol = isDark ? '#00aaff' : '#0055cc';
    const accentCol = isDark ? '#00e5ff' : '#0088ff';
    const horizonNormal = isDark ? 'rgba(0,170,255,0.2)' : 'rgba(0,100,220,0.15)';
    const groundCol = isDark ? 'rgba(139,90,43,0.3)' : 'rgba(180,120,60,0.2)';
    const skyCol = isDark ? 'rgba(0,100,180,0.2)' : 'rgba(100,180,255,0.2)';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);

    // Rotate by bank
    const bankRad = (bank * Math.PI) / 180;
    ctx.rotate(bankRad);

    // Pitch offset
    const pitchOffset = pitch * 3;

    // Artificial horizon background
    const hStart = -pitchOffset;
    // Sky
    ctx.beginPath();
    ctx.rect(-W, -H + hStart, W * 2, H);
    ctx.fillStyle = skyCol;
    ctx.fill();
    // Ground
    ctx.beginPath();
    ctx.rect(-W, hStart, W * 2, H);
    ctx.fillStyle = groundCol;
    ctx.fill();
    // Horizon line
    ctx.beginPath();
    ctx.moveTo(-W, hStart); ctx.lineTo(W, hStart);
    ctx.strokeStyle = isDark ? '#ffd600' : '#cc8800';
    ctx.lineWidth = 2; ctx.stroke();

    // Pitch ladder lines
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.font = '10px Orbitron, monospace';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.textAlign = 'right';
    [-20, -10, 10, 20].forEach(p => {
      const y = hStart - p * 3;
      ctx.beginPath();
      ctx.moveTo(-40, y); ctx.lineTo(40, y);
      ctx.stroke();
      ctx.fillText(Math.abs(p), -44, y + 4);
    });

    ctx.restore();

    // Fixed reference: aircraft symbol (not rotated)
    ctx.save();
    ctx.translate(W / 2, H / 2);

    // Bank angle indicator (arc at top)
    ctx.strokeStyle = accentCol;
    ctx.lineWidth = 1.5;
    const arcR = 110;
    ctx.beginPath();
    ctx.arc(0, 0, arcR, Math.PI, 0, false);
    ctx.stroke();
    // Bank tick marks
    [-60, -45, -30, -15, 0, 15, 30, 45, 60].forEach(angle => {
      const a = ((angle - 90) * Math.PI) / 180;
      const inner = angle % 30 === 0 ? arcR - 10 : arcR - 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * arcR, Math.sin(a) * arcR);
      ctx.strokeStyle = isDark ? 'rgba(0,229,255,0.5)' : 'rgba(0,100,200,0.4)';
      ctx.lineWidth = angle % 30 === 0 ? 2 : 1;
      ctx.stroke();
    });
    // Bank pointer (rotated by bank)
    ctx.save();
    ctx.rotate((bank * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -arcR + 14);
    ctx.lineTo(-6, -arcR + 4);
    ctx.lineTo(6, -arcR + 4);
    ctx.closePath();
    ctx.fillStyle = '#ffd600';
    ctx.fill();
    ctx.restore();

    // Aircraft silhouette (fixed)
    ctx.lineWidth = 3;
    ctx.strokeStyle = lineCol;
    ctx.lineCap = 'round';

    // Fuselage
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(0, 30);
    ctx.stroke();

    // Wings
    ctx.beginPath();
    ctx.moveTo(-70, 5);
    ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0);
    ctx.lineTo(70, 5);
    ctx.stroke();

    // Wing tips
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-70, 5); ctx.lineTo(-60, -5);
    ctx.moveTo(70, 5); ctx.lineTo(60, -5);
    ctx.stroke();

    // Tail
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-25, 25); ctx.lineTo(0, 18); ctx.lineTo(25, 25);
    ctx.stroke();

    // Center dot
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = accentCol; ctx.fill();

    ctx.restore();
  }

  /* ── Show question ── */
  function showQuestion() {
    if (!state.running) return;
    const q = generateQuestion();
    state.currentQuestion = q;
    state.waitingAnswer = true;
    state.total++;

    $id('sp-qnum').textContent = state.total;
    $id('sp-score').textContent = state.score;
    $id('sp-correct').textContent = state.correct;
    $id('sp-streak').textContent = state.streak;
    $id('sp-feedback').textContent = '';
    $id('sp-feedback').style.color = '';

    drawAircraft(q.bank, q.pitch);

    const optsEl = $id('sp-options');
    optsEl.innerHTML = '';
    q.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'sp-opt';
      btn.textContent = choice;
      btn.addEventListener('click', () => answerQuestion(choice, q.correctLabel, q.choices, optsEl));
      optsEl.appendChild(btn);
    });
  }

  function answerQuestion(chosen, correct, choices, optsEl) {
    if (!state.waitingAnswer || !state.running) return;
    state.waitingAnswer = false;
    clearTimeout(feedbackTimeout);

    const timeBonus = Math.round(state.timeLeft / DURATION * 20);
    const isCorrect = chosen === correct;

    // Mark all buttons
    optsEl.querySelectorAll('.sp-opt').forEach(btn => {
      if (btn.textContent === correct) btn.classList.add('correct');
      else if (btn.textContent === chosen && !isCorrect) btn.classList.add('wrong');
      btn.disabled = true;
    });

    if (isCorrect) {
      state.correct++;
      state.streak++;
      const pts = 10 + timeBonus + (state.streak > 3 ? 5 : 0);
      state.score += pts;
      $id('sp-feedback').textContent = `✓ Correct! +${pts} pts`;
      $id('sp-feedback').style.color = '#00ff88';
      ADAPTAudio.playCorrect();
    } else {
      state.streak = 0;
      state.score = Math.max(0, state.score - 5);
      $id('sp-feedback').textContent = '✗ Incorrect';
      $id('sp-feedback').style.color = '#ff3c3c';
      ADAPTAudio.playWrong();
    }

    feedbackTimeout = setTimeout(() => {
      if (state.running) showQuestion();
    }, 1200);
  }

  /* ── Timer ── */
  function startCountdown() {
    countdownInterval = setInterval(() => {
      if (!state.running) { clearInterval(countdownInterval); return; }
      state.timeLeft--;
      const el = $id('sp-timer');
      const m = Math.floor(state.timeLeft / 60);
      const s = state.timeLeft % 60;
      el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.className = 'module-timer';
      if (state.timeLeft <= 10) { el.classList.add('danger'); ADAPTAudio.playCountdown(); }
      else if (state.timeLeft <= 20) el.classList.add('warning');
      if (state.timeLeft <= 0) { clearInterval(countdownInterval); endTest(); }
    }, 1000);
  }

  /* ── Start / End ── */
  function start() {
    reset();
    state.running = true;
    $id('sp-intro').classList.add('hidden');
    $id('sp-arena').classList.remove('hidden');
    $id('sp-result').classList.add('hidden');
    document.getElementById('status-dot').className = 'status-dot active';
    document.getElementById('status-label').textContent = 'SPATIAL';
    showQuestion();
    startCountdown();
  }

  function endTest() {
    state.running = false;
    clearInterval(countdownInterval);
    clearTimeout(feedbackTimeout);
    document.getElementById('status-dot').className = 'status-dot';
    document.getElementById('status-label').textContent = 'READY';

    const accuracy = state.total > 0 ? Math.round(state.correct / state.total * 100) : 0;

    ADAPTStorage.addScore('spatial', {
      score: state.score,
      accuracy,
      correct: state.correct,
      total: state.total,
      maxStreak: state.streak,
    });

    const rEl = $id('sp-result');
    const color = accuracy >= 75 ? '#00ff88' : accuracy >= 55 ? '#ffd600' : '#ff3c3c';
    rEl.classList.remove('hidden');
    rEl.innerHTML = `
      <div class="result-score" style="color:${color}">${state.score} pts</div>
      <div class="result-label">Spatial Score</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Accuracy</div><div class="r-val">${accuracy}%</div></div>
        <div class="result-item"><div class="r-label">Correct</div><div class="r-val">${state.correct}/${state.total}</div></div>
        <div class="result-item"><div class="r-label">Max Streak</div><div class="r-val">${state.streak}</div></div>
      </div>
      <button class="btn-primary" id="sp-retry-btn">Try Again</button>
    `;
    $id('sp-retry-btn').addEventListener('click', () => {
      rEl.classList.add('hidden');
      $id('sp-intro').classList.remove('hidden');
      $id('sp-arena').classList.add('hidden');
      $id('sp-timer').textContent = '01:30';
      $id('sp-timer').className = 'module-timer';
    });
    $id('sp-arena').classList.add('hidden');
    if (window.DashboardModule) window.DashboardModule.refresh();
  }

  function init() {
    $id('sp-start-btn').addEventListener('click', start);
  }

  return { init };
})();
