/* ═══════════════════════════════════════════════════════════════
   ADAPT — Reaction Time Test Module
   ─ Green signal → tap/click
   ─ Red signal   → do NOT react
   ─ Yellow signal → press correct key shown
   ═══════════════════════════════════════════════════════════════ */

const ReactionModule = (() => {

  const DURATION = 90;
  let state = {};
  let countdownInterval = null;
  let signalTimeout = null;
  let clearSignalTimeout = null;

  /* ── DOM helpers ── */
  const $id = id => document.getElementById(id);

  function reset() {
    state = {
      running: false,
      timeLeft: DURATION,
      attempts: 0,
      correct: 0,
      rts: [],
      bestRT: null,
      signalActive: false,
      signalType: null,
      signalKey: null,
      signalStart: 0,
      falseTaps: 0,
    };
  }

  const SIGNALS = [
    { type: 'green',  emoji: '🟢', label: 'TAP!',         instruction: 'CLICK / TAP — GREEN SIGNAL!', color: '#00cc66', action: 'click' },
    { type: 'red',    emoji: '🔴', label: 'STOP',          instruction: 'DO NOT REACT — RED SIGNAL!',  color: '#ff3c3c', action: 'none' },
    { type: 'yellow', emoji: '🟡', label: 'PRESS KEY',     instruction: 'PRESS THE KEY: ',             color: '#ffd600', action: 'key' },
    { type: 'blue',   emoji: '🔵', label: 'DOUBLE TAP',    instruction: 'DOUBLE-TAP / DOUBLE-CLICK!',  color: '#00aaff', action: 'dblclick' },
  ];
  const KEYS = ['A','B','C','D','E','F','G'];

  /* ── Show signal ── */
  function showSignal() {
    if (!state.running) return;

    // Clear previous
    clearSignalTimeout && clearTimeout(clearSignalTimeout);
    $id('rt-signal').classList.add('hidden');
    $id('rt-waiting').classList.remove('hidden');
    $id('rt-feedback').classList.add('hidden');
    state.signalActive = false;
    state.signalType = null;

    // Random delay 0.8–3.5s
    const delay = 800 + Math.random() * 2700;
    signalTimeout = setTimeout(() => {
      if (!state.running) return;

      const sig = SIGNALS[Math.floor(Math.random() * SIGNALS.length)];
      const key = KEYS[Math.floor(Math.random() * KEYS.length)];
      state.signalType = sig.type;
      state.signalKey = key;
      state.signalActive = true;
      state.signalStart = Date.now();
      state.attempts++;

      const shapeEl = $id('rt-shape');
      const instrEl = $id('rt-instruction');
      shapeEl.textContent = sig.emoji;
      shapeEl.style.background = sig.color + '33';
      shapeEl.style.border = `4px solid ${sig.color}`;
      instrEl.textContent = sig.action === 'key'
        ? sig.instruction + key
        : sig.instruction;
      instrEl.style.color = sig.color;

      $id('rt-waiting').classList.add('hidden');
      $id('rt-signal').classList.remove('hidden');
      $id('rt-feedback').classList.add('hidden');
      ADAPTAudio.beep(sig.type === 'red' ? 220 : 880, 0.07, 'sine', 0.2);

      updateStats();

      // Auto-miss after 2 seconds (for non-red)
      if (sig.type !== 'red') {
        clearSignalTimeout = setTimeout(() => {
          if (state.signalActive && state.running) {
            missSignal();
          }
        }, 2000);
      } else {
        // Red: if user doesn't tap within 2s → correct (they held off)
        clearSignalTimeout = setTimeout(() => {
          if (state.signalActive && state.running) {
            // No tap = correct for red
            state.correct++;
            state.signalActive = false;
            showFeedback('✓ CORRECT — NO REACT', '#00ff88');
            ADAPTAudio.playCorrect();
            updateStats();
            setTimeout(() => showSignal(), 600);
          }
        }, 2000);
      }
    }, delay);
  }

  function missSignal() {
    if (!state.running) return;
    state.signalActive = false;
    showFeedback('✗ MISSED — TOO SLOW', '#ff8800');
    ADAPTAudio.playError();
    setTimeout(() => showSignal(), 600);
  }

  function handleReact(isDouble = false) {
    if (!state.running) return;

    const fb = $id('rt-feedback');

    if (!state.signalActive) {
      // False tap (no signal active)
      state.falseTaps++;
      showFeedback('✗ FALSE TAP!', '#ff3c3c');
      ADAPTAudio.playWrong();
      return;
    }

    clearTimeout(clearSignalTimeout);
    const rt = Date.now() - state.signalStart;

    if (state.signalType === 'red') {
      // Tapping on red = wrong
      state.signalActive = false;
      $id('rt-signal').classList.add('hidden');
      $id('rt-waiting').classList.remove('hidden');
      showFeedback('✗ WRONG — DON\'T TAP RED!', '#ff3c3c');
      ADAPTAudio.playWrong();
      updateStats();
      setTimeout(() => showSignal(), 800);
      return;
    }

    if (state.signalType === 'blue' && !isDouble) {
      // Need double tap
      return;
    }

    // Correct tap
    state.correct++;
    state.rts.push(rt);
    if (!state.bestRT || rt < state.bestRT) state.bestRT = rt;
    state.signalActive = false;
    $id('rt-signal').classList.add('hidden');
    $id('rt-waiting').classList.remove('hidden');
    showFeedback(`✓ ${rt}ms`, '#00ff88');
    ADAPTAudio.playCorrect();
    updateStats();
    setTimeout(() => showSignal(), 500);
  }

  function handleKeyPress(key) {
    if (!state.running || !state.signalActive) return;
    if (state.signalType === 'yellow') {
      if (key.toUpperCase() === state.signalKey) {
        clearTimeout(clearSignalTimeout);
        const rt = Date.now() - state.signalStart;
        state.correct++;
        state.rts.push(rt);
        if (!state.bestRT || rt < state.bestRT) state.bestRT = rt;
        state.signalActive = false;
        $id('rt-signal').classList.add('hidden');
        $id('rt-waiting').classList.remove('hidden');
        showFeedback(`✓ ${rt}ms — KEY: ${key.toUpperCase()}`, '#00ff88');
        ADAPTAudio.playCorrect();
        updateStats();
        setTimeout(() => showSignal(), 500);
      } else {
        showFeedback(`✗ WRONG KEY (${key.toUpperCase()})`, '#ff3c3c');
        ADAPTAudio.playWrong();
      }
    }
  }

  function showFeedback(msg, color) {
    const fb = $id('rt-feedback');
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = color;
    fb.className = 'rt-feedback';
    fb.classList.remove('hidden');
    clearTimeout(fb._t);
    fb._t = setTimeout(() => fb.classList.add('hidden'), 800);
  }

  function updateStats() {
    const avgRT = state.rts.length > 0
      ? Math.round(state.rts.reduce((a, b) => a + b, 0) / state.rts.length)
      : null;
    const el = id => $id(id);
    el('rt-attempts').textContent = state.attempts;
    el('rt-correct').textContent = state.correct;
    el('rt-avg').textContent = avgRT ? avgRT + 'ms' : '—';
    el('rt-best').textContent = state.bestRT ? state.bestRT + 'ms' : '—';
  }

  /* ── Timer ── */
  function startCountdown() {
    countdownInterval = setInterval(() => {
      if (!state.running) { clearInterval(countdownInterval); return; }
      state.timeLeft--;
      const el = $id('rt-timer');
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
    $id('rt-intro').classList.add('hidden');
    $id('rt-arena').classList.remove('hidden');
    $id('rt-result').classList.add('hidden');
    document.getElementById('status-dot').className = 'status-dot active';
    document.getElementById('status-label').textContent = 'REACTION';

    // Stage click / tap
    const stage = $id('rt-stage');
    stage.addEventListener('click', () => handleReact(false));
    stage.addEventListener('dblclick', () => handleReact(true));

    // Keyboard
    document._rtKeyHandler = e => handleKeyPress(e.key);
    document.addEventListener('keydown', document._rtKeyHandler);

    showSignal();
    startCountdown();
  }

  function endTest() {
    state.running = false;
    clearTimeout(signalTimeout);
    clearTimeout(clearSignalTimeout);
    document.removeEventListener('keydown', document._rtKeyHandler);
    document.getElementById('status-dot').className = 'status-dot';
    document.getElementById('status-label').textContent = 'READY';

    const accuracy = state.attempts > 0 ? (state.correct / state.attempts * 100) : 0;
    const avgRT = state.rts.length > 0
      ? Math.round(state.rts.reduce((a, b) => a + b, 0) / state.rts.length)
      : null;
    const bestRT = state.bestRT;

    ADAPTStorage.addScore('reaction', {
      accuracy: Math.round(accuracy),
      avgRT, bestRT,
      attempts: state.attempts,
      correct: state.correct,
      falseTaps: state.falseTaps
    });

    const rEl = $id('rt-result');
    const color = accuracy >= 80 ? '#00ff88' : accuracy >= 60 ? '#ffd600' : '#ff3c3c';
    rEl.classList.remove('hidden');
    rEl.innerHTML = `
      <div class="result-score" style="color:${color}">${accuracy.toFixed(0)}%</div>
      <div class="result-label">Reaction Accuracy</div>
      <div class="result-breakdown">
        <div class="result-item"><div class="r-label">Best RT</div><div class="r-val">${bestRT ? bestRT+'ms' : '—'}</div></div>
        <div class="result-item"><div class="r-label">Avg RT</div><div class="r-val">${avgRT ? avgRT+'ms' : '—'}</div></div>
        <div class="result-item"><div class="r-label">Correct</div><div class="r-val">${state.correct}/${state.attempts}</div></div>
        <div class="result-item"><div class="r-label">False Taps</div><div class="r-val">${state.falseTaps}</div></div>
      </div>
      <button class="btn-primary" id="rt-retry-btn">Try Again</button>
    `;
    $id('rt-retry-btn').addEventListener('click', () => {
      rEl.classList.add('hidden');
      $id('rt-intro').classList.remove('hidden');
      $id('rt-arena').classList.add('hidden');
      $id('rt-timer').textContent = '01:30';
      $id('rt-timer').className = 'module-timer';
    });
    $id('rt-arena').classList.add('hidden');
    if (window.DashboardModule) window.DashboardModule.refresh();
  }

  function init() {
    $id('rt-start-btn').addEventListener('click', start);
  }

  return { init };
})();
