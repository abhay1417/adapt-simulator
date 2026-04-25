/* ═══════════════════════════════════════════════════════════════
   ADAPT — Simulator Controller
   Orchestrates the Full 15-minute ADAPT test:
   - Runs CoreMultitaskEngine
   - Manages phases & difficulty ramp
   - Drives StressSystem
   - Collects scores via ScoringEngine
   - Saves session to Storage
   ═══════════════════════════════════════════════════════════════ */

const SimulatorController = (() => {
  'use strict';

  const TOTAL_SECONDS = 900; // 15 minutes

  /* ── Phase definitions ── */
  const PHASES = [
    { name: 'WARM-UP',    start: 0,   end: 120,  diffStart: 0.8, diffEnd: 1.0, stressStart: 5,  stressEnd: 20 },
    { name: 'BASELINE',   start: 120, end: 300,  diffStart: 1.0, diffEnd: 1.3, stressStart: 20, stressEnd: 40 },
    { name: 'PRESSURE',   start: 300, end: 540,  diffStart: 1.3, diffEnd: 1.8, stressStart: 40, stressEnd: 65 },
    { name: 'HIGH LOAD',  start: 540, end: 750,  diffStart: 1.8, diffEnd: 2.2, stressStart: 65, stressEnd: 80 },
    { name: 'PEAK LOAD',  start: 750, end: 900,  diffStart: 2.2, diffEnd: 2.6, stressStart: 80, stressEnd: 95 },
  ];

  /* ── State ── */
  let state = {};
  let countdownInterval = null;

  const $ = id => document.getElementById(id);

  /* ─────────────── RESET ─────────────── */
 function reset() {
  // 🚫 Prevent reset while simulator is running
  if (state.running) {
    console.warn("Reset blocked during active session");
    return;
  }

  console.log("RESET CALLED ❗");

  state = {
    running: false,
    elapsed: 0,
    timeLeft: TOTAL_SECONDS,
    currentPhaseIdx: 0,
    recentScores: [],
    liveScore: 0,
    peakScore: 0,
  };
}

  /* ─────────────── START ─────────────── */
  function start() {
    reset();
    state.running = true;

    // Show arena
    $('sim-intro').classList.add('hidden');
    $('sim-arena').classList.remove('hidden');
    $('sim-results').classList.add('hidden');

    // Status indicator
    const dot   = $('status-dot');
    const label = $('status-label');
    if (dot)   dot.className   = 'status-dot danger';
    if (label) label.textContent = 'SIMULATOR';

    // Show global HUD timer in header
    const hudWrap = $('hud-timer-wrap');
    if (hudWrap) hudWrap.classList.remove('hidden');

    // Start engine
    CoreMultitaskEngine.start({
      difficultyMult: PHASES[0].diffStart,
      onScoreUpdate:  onScoreUpdate,
      onMathAnswer:   onMathAnswer,
      onAlertMiss:    onAlertMiss,
      onAlertHit:     onAlertHit,
      onInstHit:      onInstHit,
      onInstMiss:     onInstMiss,
    });

    // Wire alert button
    const alertBtn = $('sim-alert-btn');
    if (alertBtn) {
      alertBtn.removeEventListener('click', CoreMultitaskEngine.respondAlert);
      alertBtn.addEventListener('click', CoreMultitaskEngine.respondAlert);
    }

    // Start stress system
    ADAPTStress.start({ initialLevel: PHASES[0].stressStart });

    // Countdown
    updateTimerDisplay();
    countdownInterval = setInterval(tick, 1000);
  }

 function tick() {
  // Stop loop if not running
  if (!state.running) {
    clearInterval(countdownInterval);
    return;
  }

  // Update time
  state.elapsed++;
  state.timeLeft = TOTAL_SECONDS - state.elapsed;

  // Update UI
  updateTimerDisplay();
  updatePhase();
  updateLiveScore();

  // 🔴 When time ends
  if (state.timeLeft <= 0) {
    clearInterval(countdownInterval);

    console.log("TEST COMPLETED");

    state.running = false;

    // ✅ Show results instead of going back to main page
    const arena = $('sim-arena');
    const results = $('sim-results');

    if (arena) arena.classList.add('hidden');
    if (results) results.classList.remove('hidden');

    // ❌ DO NOT call endTest() (it was redirecting you)
    // endTest();

    return;
  }
}

  /* ─────────────── PHASE MANAGEMENT ─────────────── */
  function updatePhase() {
    let idx = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (state.elapsed >= PHASES[i].start) idx = i;
    }
    const phase = PHASES[idx];

    // Update HUD phase label
    const phaseEl = $('sim-hud-phase');
    if (phaseEl) phaseEl.textContent = phase.name;

    // Interpolate difficulty within phase
    const phaseProgress = (state.elapsed - phase.start) / (phase.end - phase.start);
    const diff = phase.diffStart + (phase.diffEnd - phase.diffStart) * Math.min(1, phaseProgress);

    // Adaptive: tweak diff by recent performance
    let adaptiveDiff = diff;
    if (state.recentScores.length >= 3) {
      const adaptMult = ADAPTScoring.getDifficultyMultiplier(state.recentScores.slice(-5));
      adaptiveDiff = Math.max(0.5, Math.min(3.0, diff * (0.7 + adaptMult * 0.3)));
    }
    CoreMultitaskEngine.setDifficulty(adaptiveDiff);

    // Interpolate stress
    const stress = phase.stressStart + (phase.stressEnd - phase.stressStart) * Math.min(1, phaseProgress);
    ADAPTStress.setLevel(stress);

    state.currentPhaseIdx = idx;
  }

  /* ─────────────── CALLBACKS FROM ENGINE ─────────────── */
  function onScoreUpdate(stats) {
    // Update live score display periodically
  }

  function onMathAnswer(correct, timeMs) {
    // Add to recent scores rolling window
    const pts = correct ? Math.max(50, 100 - timeMs / 80) : 20;
    pushRecentScore(pts);
  }

  function onAlertMiss() {
    pushRecentScore(0);
  }

  function onAlertHit(rt) {
    const pts = Math.max(30, 100 - rt / 15);
    pushRecentScore(pts);
  }

  function onInstHit(name, catchTime) {
    const pts = Math.max(40, 100 - catchTime / 40);
    pushRecentScore(pts);
  }

  function onInstMiss(name) {
    pushRecentScore(10);
  }

  function pushRecentScore(v) {
    state.recentScores.push(v);
    if (state.recentScores.length > 10) state.recentScores.shift();
  }

  /* ─────────────── LIVE SCORE ─────────────── */
  function updateLiveScore() {
    const stats = CoreMultitaskEngine.getStats();
    const trackAcc = stats.trackAccuracy || 0;
    const mathAcc  = stats.mathTotal > 0 ? stats.mathCorrect / stats.mathTotal * 100 : 50;
    const alertAcc = stats.alertTotal > 0 ? stats.alertCorrect / stats.alertTotal * 100 : 50;
    const instAcc  = stats.instTotal  > 0 ? stats.instCaught  / stats.instTotal  * 100 : 50;

    const live = Math.round(trackAcc*0.3 + mathAcc*0.25 + alertAcc*0.25 + instAcc*0.2);
    state.liveScore = live;
    if (live > state.peakScore) state.peakScore = live;

    const el = $('sim-hud-score');
    if (el) el.textContent = live;
  }

  /* ─────────────── TIMER DISPLAY ─────────────── */
  function updateTimerDisplay() {
    const t = state.timeLeft;
    const m = Math.floor(t / 60);
    const s = t % 60;
    const str = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    const simTimer  = $('sim-timer');
    const hudTimer  = $('sim-hud-time');
    const globalHud = $('hud-global-timer');

    [simTimer, hudTimer, globalHud].forEach(el => {
      if (!el) return;
      el.textContent = str;
      el.className = el.className.replace(/\s*(danger|warning)/g, '');
      if (t <= 60)  el.classList.add('danger');
      else if (t <= 180) el.classList.add('warning');
    });

    if (t <= 60 && t % 2 === 0) ADAPTAudio.playCountdown();
  }

function endTest() {
  // 🛑 Prevent multiple calls
  if (!state.running) {
    console.warn("endTest ignored (already stopped)");
    return;
  }

  console.log("END TEST TRIGGERED");

  // Stop state
  state.running = false;

  // Stop systems safely
  try { CoreMultitaskEngine.stop(); } catch (e) { console.warn(e); }
  try { ADAPTStress.stop(); } catch (e) { console.warn(e); }

  // Stop timer
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // UI status reset (header only)
  const dot   = $('status-dot');
  const label = $('status-label');
  if (dot)   dot.className = 'status-dot';
  if (label) label.textContent = 'READY';

  const hudWrap = $('hud-timer-wrap');
  if (hudWrap) hudWrap.classList.add('hidden');

  // 🔴 IMPORTANT: Ensure we DO NOT go back to intro
  const arena  = $('sim-arena');
  const intro  = $('sim-intro');
  const result = $('sim-results');

  if (arena)  arena.classList.add('hidden');
  if (intro)  intro.classList.add('hidden');     // keep intro hidden
  if (result) result.classList.remove('hidden'); // show results only

  // Gather stats
  let stats = {};
  try {
    stats = CoreMultitaskEngine.getStats() || {};
  } catch (e) {
    console.warn("Stats fetch failed", e);
  }

  // Score via engine (guard missing values)
  const scored = ADAPTScoring.scoreSession({
    tracking:    { avgAccuracy: stats.trackAccuracy || 0 },
    math:        { correct: stats.mathCorrect || 0, total: stats.mathTotal || 0, avgTimeMs: stats.mathAvgTime || 0 },
    alerts:      { correct: stats.alertCorrect || 0, total: stats.alertTotal || 0, avgRT: stats.alertAvgRT || 0, rts: stats.alertRTs || [], missed: stats.alertMissed || 0 },
    monitoring:  { caught: stats.instCaught || 0, total: stats.instTotal || 0, avgCatchTimeMs: stats.instAvgCatch || 0 },
    reactionRTs: stats.alertRTs || [],
    penalties: {
      missedAlerts:      stats.alertMissed || 0,
      monitoringMissed:  stats.instMissed || 0,
    }
  });

  // Multitask efficiency
  const taskScores = [
    Math.min(100, stats.trackAccuracy || 0),
    (stats.mathTotal  > 0) ? (stats.mathCorrect / stats.mathTotal) * 100 : 0,
    (stats.alertTotal > 0) ? (stats.alertCorrect / stats.alertTotal) * 100 : 0,
    (stats.instTotal  > 0) ? (stats.instCaught  / stats.instTotal)  * 100 : 0,
  ];
  const efficiency = ADAPTScoring.multitaskEfficiency(taskScores);

  // Save to storage (guarded)
  try {
    ADAPTStorage.addScore('simulator', {
      composite:  scored.composite,
      breakdown:  scored.breakdown,
      efficiency: Math.round(efficiency),
      peakScore:  state.peakScore || 0,
      rawStats:   stats,
      duration:   state.elapsed || 0,
    });

    if (stats.mathTotal > 0) {
      ADAPTStorage.addScore('multitask', {
        composite:  scored.breakdown?.trackingScore || 0,
        trackAcc:   Math.round(stats.trackAccuracy || 0),
        mathAcc:    Math.round((stats.mathTotal ? (stats.mathCorrect / stats.mathTotal) * 100 : 0)),
        alertAcc:   Math.round((stats.alertTotal ? (stats.alertCorrect / stats.alertTotal) * 100 : 0)),
        avgAlertRT: stats.alertAvgRT || 0,
      });
    }
  } catch (e) {
    console.warn("Storage save failed", e);
  }

  // Refresh dashboard safely
  try {
    if (window.DashboardModule) window.DashboardModule.refresh();
  } catch (e) {
    console.warn(e);
  }

  // Render results
  try {
    showResults(scored, stats, efficiency);
  } catch (e) {
    console.warn("showResults failed", e);
  }
}

  /* ─────────────── SHOW RESULTS ─────────────── */
  function showResults(result, stats, efficiency) {
    $('sim-arena').classList.add('hidden');
    $('sim-results').classList.remove('hidden');

    const { composite, breakdown, rating, penalties } = result;
    const scoreEl  = $('sim-result-score');
    const ratingEl = $('sim-result-rating');

    if (scoreEl) {
      scoreEl.textContent = composite + '%';
      scoreEl.style.color  = rating.color;
    }
    if (ratingEl) {
      ratingEl.textContent = rating.label + ' — ' + rating.grade;
      ratingEl.style.color  = rating.color;
    }

    // Breakdown
    const bdEl = $('sim-result-breakdown');
    if (bdEl) {
      const items = [
        { label: 'Tracking',     val: breakdown.trackingScore    + '%', icon: '🎯' },
        { label: 'Arithmetic',   val: breakdown.mathScore        + '%', icon: '➕' },
        { label: 'Alert RT',     val: breakdown.alertScore       + '%', icon: '⚡' },
        { label: 'Monitoring',   val: breakdown.monitoringScore  + '%', icon: '🛩' },
        { label: 'Consistency',  val: breakdown.consistencyScore + '%', icon: '📊' },
        { label: 'Efficiency',   val: Math.round(efficiency)     + '%', icon: '🧠' },
      ];
      bdEl.innerHTML = items.map(it => `
        <div class="sim-result-item">
          <div class="sim-result-item-icon">${it.icon}</div>
          <div class="sim-result-item-label">${it.label}</div>
          <div class="sim-result-item-val">${it.val}</div>
        </div>
      `).join('');
    }

    // Skills (raw stats)
    const skEl = $('sim-result-skills');
    if (skEl) {
      const rows = [
        { label: 'Math Correct',    val: `${stats.mathCorrect}/${stats.mathTotal}` },
        { label: 'Alert Response',  val: `${stats.alertCorrect}/${stats.alertTotal}` },
        { label: 'Avg Alert RT',    val: stats.alertAvgRT ? stats.alertAvgRT + 'ms' : '—' },
        { label: 'Instruments',     val: `${stats.instCaught}/${stats.instTotal}` },
        { label: 'Duration',        val: Math.floor(state.elapsed/60) + 'm ' + (state.elapsed%60) + 's' },
      ];
      if (penalties && penalties.length) {
        rows.push({ label: 'Penalties', val: penalties.map(p => `${p.label} ${p.pts}`).join(', ') });
      }
      skEl.innerHTML = `<table class="sim-stats-table">` +
        rows.map(r => `<tr><td>${r.label}</td><td>${r.val}</td></tr>`).join('') +
        `</table>`;
    }

    // Buttons
    const retryBtn = $('sim-retry-btn');
    const dashBtn  = $('sim-dashboard-btn');
    if (retryBtn) {
      retryBtn.onclick = () => {
        $('sim-results').classList.add('hidden');
        $('sim-intro').classList.remove('hidden');
        $('sim-timer').textContent = '15:00';
        $('sim-timer').className   = 'module-timer';
      };
    }
    if (dashBtn) {
      dashBtn.onclick = () => {
        if (window.switchTab) window.switchTab('dashboard');
      };
    }

    // Play completion sound
    ADAPTAudio.playSuccess();
    setTimeout(() => ADAPTAudio.playSuccess(), 300);
  }

  /* ─────────────── INIT ─────────────── */
  function init() {
    const startBtn = $('sim-start-btn');
    if (startBtn) startBtn.addEventListener('click', start);
  }

  return { init, start, endTest };
})();
