/* ═══════════════════════════════════════════════════════════════
   ADAPT — Full Simulator Controller
   Orchestrates CoreMultitaskEngine in the Simulator tab
   Handles UI, stress ramp, HUD, session result, history save
   ═══════════════════════════════════════════════════════════════ */

const SimulatorController = (() => {

  const $id = id => document.getElementById(id);

  let _sessionDuration = 600; // seconds (default 10 min)
  let _keyHandler = null;
  let _dblTapTimer = null;
  let _lastTap = 0;

  /* ── Stress ramp schedule (% of session elapsed → stress level) ── */
  const STRESS_RAMP = [
    { at: 0,    level: 1 },
    { at: 0.25, level: 2 },
    { at: 0.50, level: 3 },
    { at: 0.70, level: 4 },
    { at: 0.85, level: 5 },
  ];

  let _stressInterval = null;

  function _updateStress(timeLeft, totalDuration) {
    const elapsed = (totalDuration - timeLeft) / totalDuration;
    let level = 1;
    STRESS_RAMP.forEach(r => { if (elapsed >= r.at) level = r.level; });
    AdaptStressSystem.setLevel(level);
  }

  /* ── Show/hide UI sections ── */
  function _showIntro()    { $id('sim-intro').classList.remove('hidden'); $id('sim-arena').classList.add('hidden'); $id('sim-result').classList.add('hidden'); }
  function _showArena()    { $id('sim-intro').classList.add('hidden'); $id('sim-arena').classList.remove('hidden'); $id('sim-result').classList.add('hidden'); }
  function _showResult()   { $id('sim-intro').classList.add('hidden'); $id('sim-arena').classList.add('hidden'); $id('sim-result').classList.remove('hidden'); }

  /* ── Collect DOM element refs ── */
  function _getEls() {
    return {
      timerEl:      $id('sim-timer'),
      trackCanvas:  $id('sim-track-canvas'),
      mathQEl:      $id('sim-math-q'),
      mathOptsEl:   $id('sim-math-opts'),
      reactSignalEl:   $id('sim-react-signal'),
      reactFeedbackEl: $id('sim-react-feedback'),
      instCanvases: {
        altitude: $id('sim-canvas-altitude'),
        airspeed: $id('sim-canvas-airspeed'),
        vspeed:   $id('sim-canvas-vspeed'),
      },
      instValueEls: {
        altitude: $id('sim-val-altitude'),
        airspeed: $id('sim-val-airspeed'),
        vspeed:   $id('sim-val-vspeed'),
      },
      instFlashEls: {
        altitude: $id('sim-flash-altitude'),
        airspeed: $id('sim-flash-airspeed'),
        vspeed:   $id('sim-flash-vspeed'),
      },
      instWrapEls: {
        altitude: $id('sim-wrap-altitude'),
        airspeed: $id('sim-wrap-airspeed'),
        vspeed:   $id('sim-wrap-vspeed'),
      },
      // HUD
      hudTrack:   $id('sim-hud-track'),
      hudMath:    $id('sim-hud-math'),
      hudReact:   $id('sim-hud-react'),
      hudMon:     $id('sim-hud-mon'),
      hudStress:  $id('sim-hud-stress'),
      hudComposite: $id('sim-hud-composite'),
    };
  }

  /* ── Live HUD update ── */
  function _updateHUD(els, scores) {
    if (!els) return;
    if (els.hudTrack) _setHUD(els.hudTrack, scores.trackAcc || 0, '%');
    if (els.hudMath)  _setHUD(els.hudMath,  scores.mathAcc  || 0, '%');
    if (els.hudReact) _setHUD(els.hudReact, scores.reactAcc || 0, '%');
    if (els.hudMon)   _setHUD(els.hudMon,   scores.monAcc   || 100,'%');
    if (els.hudComposite) {
      const avg = Math.round(((scores.trackAcc||0)+(scores.mathAcc||0)+(scores.reactAcc||0)+(scores.monAcc||100))/4);
      _setHUD(els.hudComposite, avg, '%', true);
    }
  }

  function _setHUD(el, val, unit, big) {
    if (!el) return;
    el.textContent = val + (unit || '');
    const col = val >= 75 ? '#00ff88' : val >= 50 ? '#ffd600' : '#ff3c3c';
    el.style.color = col;
    el.style.textShadow = `0 0 8px ${col}`;
  }

  /* ── Start session ── */
  function startSession(durationSec) {
    _sessionDuration = durationSec;

    const els = _getEls();
    _showArena();

    // Status dot
    const dot = $id('status-dot');
    const lbl = $id('status-label');
    if (dot) dot.className = 'status-dot danger';
    if (lbl) lbl.textContent = 'SIMULATOR';

    // Start stress
    AdaptStressSystem.start(1, els.hudStress);

    // Bind reaction stage
    const reactStage = $id('sim-react-stage');
    if (reactStage) {
      reactStage.addEventListener('click', _onReactTap);
      reactStage.addEventListener('dblclick', _onReactDbl);
    }

    // Bind instrument click
    ['altitude','airspeed','vspeed'].forEach(n => {
      const wrap = els.instWrapEls[n];
      if (wrap && !wrap.dataset.simListener) {
        wrap.dataset.simListener = '1';
        wrap.addEventListener('click', () => CoreMultitaskEngine.handleInstClick(n));
      }
    });

    // Keyboard
    _keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      CoreMultitaskEngine.handleReactKey(e.key);
    };
    document.addEventListener('keydown', _keyHandler);

    // Stress ramp
    _stressInterval = setInterval(() => {
      if (!CoreMultitaskEngine.isRunning()) { clearInterval(_stressInterval); return; }
      const ls = CoreMultitaskEngine.getLiveScores();
      _updateStress(ls.timeLeft, _sessionDuration);
    }, 5000);

    // Start engine
    CoreMultitaskEngine.start({
      durationSec: _sessionDuration,
      timerEl:      els.timerEl,
      trackCanvas:  els.trackCanvas,
      mathQEl:      els.mathQEl,
      mathOptsEl:   els.mathOptsEl,
      reactSignalEl:   els.reactSignalEl,
      reactFeedbackEl: els.reactFeedbackEl,
      instCanvases: els.instCanvases,
      instValueEls: els.instValueEls,
      instFlashEls: els.instFlashEls,
      instWrapEls:  els.instWrapEls,
      onScoreUpdate: (scores) => _updateHUD(els, scores),
      onEnd: (results) => _onSessionEnd(results, els),
    });
  }

  function _onReactTap() { CoreMultitaskEngine.handleReactTap(false); }
  function _onReactDbl() { CoreMultitaskEngine.handleReactTap(true); }

  /* ── Session end ── */
  function _onSessionEnd(results, els) {
    AdaptStressSystem.stop();
    clearInterval(_stressInterval);
    document.removeEventListener('keydown', _keyHandler);

    const dot = $id('status-dot');
    const lbl = $id('status-label');
    if (dot) dot.className = 'status-dot';
    if (lbl) lbl.textContent = 'READY';

    // Save to storage
    ADAPTStorage.addScore('simulator', {
      composite:    results.composite,
      multitaskEff: results.multitaskEff,
      trackScore:   results.trackScore,
      mathScore:    results.mathScore,
      reactScore:   results.reactScore,
      monScore:     results.monScore,
      duration:     _sessionDuration,
      avgRT:        results.avgRT,
    });

    _renderResult(results);
    _showResult();

    if (window.DashboardModule) window.DashboardModule.refresh();
  }

  /* ── Result screen ── */
  function _renderResult(r) {
    const el = $id('sim-result');
    if (!el) return;
    const rt = ScoringEngine.rating(r.composite);
    const stars = '★'.repeat(rt.stars) + '☆'.repeat(5 - rt.stars);

    el.innerHTML = `
      <div class="sim-result-header">
        <div class="sim-result-score" style="color:${rt.color};text-shadow:0 0 20px ${rt.color}">
          ${r.composite}<span style="font-size:0.5em">%</span>
        </div>
        <div class="sim-result-rating" style="color:${rt.color}">${rt.label}</div>
        <div class="sim-result-stars" style="color:${rt.color}">${stars}</div>
        <div class="sim-result-sub">ADAPT Multitask Efficiency: <strong style="color:${rt.color}">${r.multitaskEff}%</strong></div>
      </div>

      <div class="sim-result-breakdown">
        ${_skillCard('🎯 Tracking', r.trackScore, r.trackAcc + '% raw accuracy')}
        ${_skillCard('➕ Math', r.mathScore, r.mathCorrect + '/' + r.mathTotal + ' correct')}
        ${_skillCard('⚡ Reaction', r.reactScore, (r.avgRT ? r.avgRT + 'ms avg' : '—') + ' · ' + r.falseTaps + ' false taps')}
        ${_skillCard('🛩 Monitoring', r.monScore, r.monCaught + '/' + r.monTotal + ' caught · ' + r.monMissed + ' missed')}
      </div>

      <div class="sim-result-analysis">
        <h4>PERFORMANCE ANALYSIS</h4>
        ${_analysisText(r)}
      </div>

      <div class="sim-result-actions">
        <button class="btn-primary" id="sim-retry-btn">Try Again</button>
        <button class="btn-secondary" id="sim-dash-btn">View Dashboard</button>
      </div>
    `;

    $id('sim-retry-btn').addEventListener('click', () => { _showIntro(); });
    $id('sim-dash-btn').addEventListener('click', () => {
      document.querySelector('[data-tab="dashboard"]')?.click();
    });
  }

  function _skillCard(label, score, detail) {
    const col = score >= 75 ? '#00ff88' : score >= 55 ? '#ffd600' : '#ff3c3c';
    const pct = Math.max(0, Math.min(100, score));
    return `
      <div class="sim-skill-card">
        <div class="sim-skill-label">${label}</div>
        <div class="sim-skill-score" style="color:${col}">${score}</div>
        <div class="sim-skill-bar-track">
          <div class="sim-skill-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="sim-skill-detail">${detail}</div>
      </div>
    `;
  }

  function _analysisText(r) {
    const lines = [];
    const scores = { Tracking: r.trackScore, Math: r.mathScore, Reaction: r.reactScore, Monitoring: r.monScore };
    const sorted = Object.entries(scores).sort((a,b) => a[1]-b[1]);
    const [weakName, weakScore] = sorted[0];
    const [strongName, strongScore] = sorted[sorted.length-1];
    lines.push(`<p>💪 <strong>Strongest skill:</strong> ${strongName} (${strongScore}%)</p>`);
    lines.push(`<p>🎯 <strong>Area to improve:</strong> ${weakName} (${weakScore}%)</p>`);
    if (r.falseTaps > 3) lines.push(`<p>⚠️ High false-tap count (${r.falseTaps}) — focus on <em>impulse control</em> under pressure.</p>`);
    if (r.avgRT && r.avgRT > 600) lines.push(`<p>⚠️ Slow average reaction time (${r.avgRT}ms) — practice quick response drills.</p>`);
    if (r.monMissed > r.monCaught) lines.push(`<p>⚠️ More anomalies missed than caught — divide attention more evenly across instruments.</p>`);
    if (r.composite >= 80) lines.push(`<p>✅ Excellent multitasking efficiency — you maintain performance under high cognitive load.</p>`);
    return lines.join('');
  }

  /* ── Init ── */
  function init() {
    // Duration selector
    document.querySelectorAll('.sim-duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-duration-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _sessionDuration = parseInt(btn.dataset.duration);
      });
    });

    // Start button
    const startBtn = $id('sim-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startSession(_sessionDuration);
      });
    }

    // Back button
    const backBtn = $id('sim-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (CoreMultitaskEngine.isRunning()) {
          if (!confirm('Abort the current session? Progress will be lost.')) return;
          CoreMultitaskEngine.stop();
          AdaptStressSystem.stop();
          clearInterval(_stressInterval);
        }
        _showIntro();
        const dot = $id('status-dot');
        const lbl = $id('status-label');
        if (dot) dot.className = 'status-dot';
        if (lbl) lbl.textContent = 'READY';
      });
    }
  }

/* ═══════════════════════════════════════════════════════════════
   ADAPT — Full Simulator Controller
   Orchestrates CoreMultitaskEngine in the Simulator tab
   Handles UI, stress ramp, HUD, session result, history save
   ═══════════════════════════════════════════════════════════════ */

const SimulatorController = (() => {

  const $id = id => document.getElementById(id);

  let _sessionDuration = 600; // seconds (default 10 min)
  let _keyHandler = null;
  let _dblTapTimer = null;
  let _lastTap = 0;

  /* ── Stress ramp schedule (% of session elapsed → stress level) ── */
  const STRESS_RAMP = [
    { at: 0,    level: 1 },
    { at: 0.25, level: 2 },
    { at: 0.50, level: 3 },
    { at: 0.70, level: 4 },
    { at: 0.85, level: 5 },
  ];

  let _stressInterval = null;

  function _updateStress(timeLeft, totalDuration) {
    const elapsed = (totalDuration - timeLeft) / totalDuration;
    let level = 1;
    STRESS_RAMP.forEach(r => { if (elapsed >= r.at) level = r.level; });
    AdaptStressSystem.setLevel(level);
  }

  /* ── Show/hide UI sections ── */
  function _showIntro()    { $id('sim-intro').classList.remove('hidden'); $id('sim-arena').classList.add('hidden'); $id('sim-result').classList.add('hidden'); }
  function _showArena()    { $id('sim-intro').classList.add('hidden'); $id('sim-arena').classList.remove('hidden'); $id('sim-result').classList.add('hidden'); }
  function _showResult()   { $id('sim-intro').classList.add('hidden'); $id('sim-arena').classList.add('hidden'); $id('sim-result').classList.remove('hidden'); }

  /* ── Collect DOM element refs ── */
  function _getEls() {
    return {
      timerEl:      $id('sim-timer'),
      trackCanvas:  $id('sim-track-canvas'),
      mathQEl:      $id('sim-math-q'),
      mathOptsEl:   $id('sim-math-opts'),
      reactSignalEl:   $id('sim-react-signal'),
      reactFeedbackEl: $id('sim-react-feedback'),
      instCanvases: {
        altitude: $id('sim-canvas-altitude'),
        airspeed: $id('sim-canvas-airspeed'),
        vspeed:   $id('sim-canvas-vspeed'),
      },
      instValueEls: {
        altitude: $id('sim-val-altitude'),
        airspeed: $id('sim-val-airspeed'),
        vspeed:   $id('sim-val-vspeed'),
      },
      instFlashEls: {
        altitude: $id('sim-flash-altitude'),
        airspeed: $id('sim-flash-airspeed'),
        vspeed:   $id('sim-flash-vspeed'),
      },
      instWrapEls: {
        altitude: $id('sim-wrap-altitude'),
        airspeed: $id('sim-wrap-airspeed'),
        vspeed:   $id('sim-wrap-vspeed'),
      },
      // HUD
      hudTrack:   $id('sim-hud-track'),
      hudMath:    $id('sim-hud-math'),
      hudReact:   $id('sim-hud-react'),
      hudMon:     $id('sim-hud-mon'),
      hudStress:  $id('sim-hud-stress'),
      hudComposite: $id('sim-hud-composite'),
    };
  }

  /* ── Live HUD update ── */
  function _updateHUD(els, scores) {
    if (!els) return;
    if (els.hudTrack) _setHUD(els.hudTrack, scores.trackAcc || 0, '%');
    if (els.hudMath)  _setHUD(els.hudMath,  scores.mathAcc  || 0, '%');
    if (els.hudReact) _setHUD(els.hudReact, scores.reactAcc || 0, '%');
    if (els.hudMon)   _setHUD(els.hudMon,   scores.monAcc   || 100,'%');
    if (els.hudComposite) {
      const avg = Math.round(((scores.trackAcc||0)+(scores.mathAcc||0)+(scores.reactAcc||0)+(scores.monAcc||100))/4);
      _setHUD(els.hudComposite, avg, '%', true);
    }
  }

  function _setHUD(el, val, unit, big) {
    if (!el) return;
    el.textContent = val + (unit || '');
    const col = val >= 75 ? '#00ff88' : val >= 50 ? '#ffd600' : '#ff3c3c';
    el.style.color = col;
    el.style.textShadow = `0 0 8px ${col}`;
  }

  /* ── Start session ── */
  function startSession(durationSec) {
    _sessionDuration = durationSec;

    const els = _getEls();
    _showArena();

    // Status dot
    const dot = $id('status-dot');
    const lbl = $id('status-label');
    if (dot) dot.className = 'status-dot danger';
    if (lbl) lbl.textContent = 'SIMULATOR';

    // Start stress
    AdaptStressSystem.start(1, els.hudStress);

    // Bind reaction stage
    const reactStage = $id('sim-react-stage');
    if (reactStage) {
      reactStage.addEventListener('click', _onReactTap);
      reactStage.addEventListener('dblclick', _onReactDbl);
    }

    // Bind instrument click
    ['altitude','airspeed','vspeed'].forEach(n => {
      const wrap = els.instWrapEls[n];
      if (wrap && !wrap.dataset.simListener) {
        wrap.dataset.simListener = '1';
        wrap.addEventListener('click', () => CoreMultitaskEngine.handleInstClick(n));
      }
    });

    // Keyboard
    _keyHandler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      CoreMultitaskEngine.handleReactKey(e.key);
    };
    document.addEventListener('keydown', _keyHandler);

    // Stress ramp
    _stressInterval = setInterval(() => {
      if (!CoreMultitaskEngine.isRunning()) { clearInterval(_stressInterval); return; }
      const ls = CoreMultitaskEngine.getLiveScores();
      _updateStress(ls.timeLeft, _sessionDuration);
    }, 5000);

    // Start engine
    CoreMultitaskEngine.start({
      durationSec: _sessionDuration,
      timerEl:      els.timerEl,
      trackCanvas:  els.trackCanvas,
      mathQEl:      els.mathQEl,
      mathOptsEl:   els.mathOptsEl,
      reactSignalEl:   els.reactSignalEl,
      reactFeedbackEl: els.reactFeedbackEl,
      instCanvases: els.instCanvases,
      instValueEls: els.instValueEls,
      instFlashEls: els.instFlashEls,
      instWrapEls:  els.instWrapEls,
      onScoreUpdate: (scores) => _updateHUD(els, scores),
      onEnd: (results) => _onSessionEnd(results, els),
    });
  }

  function _onReactTap() { CoreMultitaskEngine.handleReactTap(false); }
  function _onReactDbl() { CoreMultitaskEngine.handleReactTap(true); }

  /* ── Session end ── */
  function _onSessionEnd(results, els) {
    AdaptStressSystem.stop();
    clearInterval(_stressInterval);
    document.removeEventListener('keydown', _keyHandler);

    const dot = $id('status-dot');
    const lbl = $id('status-label');
    if (dot) dot.className = 'status-dot';
    if (lbl) lbl.textContent = 'READY';

    // Save to storage
    ADAPTStorage.addScore('simulator', {
      composite:    results.composite,
      multitaskEff: results.multitaskEff,
      trackScore:   results.trackScore,
      mathScore:    results.mathScore,
      reactScore:   results.reactScore,
      monScore:     results.monScore,
      duration:     _sessionDuration,
      avgRT:        results.avgRT,
    });

    _renderResult(results);
    _showResult();

    if (window.DashboardModule) window.DashboardModule.refresh();
  }

  /* ── Result screen ── */
  function _renderResult(r) {
    const el = $id('sim-result');
    if (!el) return;
    const rt = ScoringEngine.rating(r.composite);
    const stars = '★'.repeat(rt.stars) + '☆'.repeat(5 - rt.stars);

    el.innerHTML = `
      <div class="sim-result-header">
        <div class="sim-result-score" style="color:${rt.color};text-shadow:0 0 20px ${rt.color}">
          ${r.composite}<span style="font-size:0.5em">%</span>
        </div>
        <div class="sim-result-rating" style="color:${rt.color}">${rt.label}</div>
        <div class="sim-result-stars" style="color:${rt.color}">${stars}</div>
        <div class="sim-result-sub">ADAPT Multitask Efficiency: <strong style="color:${rt.color}">${r.multitaskEff}%</strong></div>
      </div>

      <div class="sim-result-breakdown">
        ${_skillCard('🎯 Tracking', r.trackScore, r.trackAcc + '% raw accuracy')}
        ${_skillCard('➕ Math', r.mathScore, r.mathCorrect + '/' + r.mathTotal + ' correct')}
        ${_skillCard('⚡ Reaction', r.reactScore, (r.avgRT ? r.avgRT + 'ms avg' : '—') + ' · ' + r.falseTaps + ' false taps')}
        ${_skillCard('🛩 Monitoring', r.monScore, r.monCaught + '/' + r.monTotal + ' caught · ' + r.monMissed + ' missed')}
      </div>

      <div class="sim-result-analysis">
        <h4>PERFORMANCE ANALYSIS</h4>
        ${_analysisText(r)}
      </div>

      <div class="sim-result-actions">
        <button class="btn-primary" id="sim-retry-btn">Try Again</button>
        <button class="btn-secondary" id="sim-dash-btn">View Dashboard</button>
      </div>
    `;

    $id('sim-retry-btn').addEventListener('click', () => { _showIntro(); });
    $id('sim-dash-btn').addEventListener('click', () => {
      document.querySelector('[data-tab="dashboard"]')?.click();
    });
  }

  function _skillCard(label, score, detail) {
    const col = score >= 75 ? '#00ff88' : score >= 55 ? '#ffd600' : '#ff3c3c';
    const pct = Math.max(0, Math.min(100, score));
    return `
      <div class="sim-skill-card">
        <div class="sim-skill-label">${label}</div>
        <div class="sim-skill-score" style="color:${col}">${score}</div>
        <div class="sim-skill-bar-track">
          <div class="sim-skill-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="sim-skill-detail">${detail}</div>
      </div>
    `;
  }

  function _analysisText(r) {
    const lines = [];
    const scores = { Tracking: r.trackScore, Math: r.mathScore, Reaction: r.reactScore, Monitoring: r.monScore };
    const sorted = Object.entries(scores).sort((a,b) => a[1]-b[1]);
    const [weakName, weakScore] = sorted[0];
    const [strongName, strongScore] = sorted[sorted.length-1];
    lines.push(`<p>💪 <strong>Strongest skill:</strong> ${strongName} (${strongScore}%)</p>`);
    lines.push(`<p>🎯 <strong>Area to improve:</strong> ${weakName} (${weakScore}%)</p>`);
    if (r.falseTaps > 3) lines.push(`<p>⚠️ High false-tap count (${r.falseTaps}) — focus on <em>impulse control</em> under pressure.</p>`);
    if (r.avgRT && r.avgRT > 600) lines.push(`<p>⚠️ Slow average reaction time (${r.avgRT}ms) — practice quick response drills.</p>`);
    if (r.monMissed > r.monCaught) lines.push(`<p>⚠️ More anomalies missed than caught — divide attention more evenly across instruments.</p>`);
    if (r.composite >= 80) lines.push(`<p>✅ Excellent multitasking efficiency — you maintain performance under high cognitive load.</p>`);
    return lines.join('');
  }

  /* ── Init ── */
  function init() {
    // Duration selector
    document.querySelectorAll('.sim-duration-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-duration-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _sessionDuration = parseInt(btn.dataset.duration);
      });
    });

    // Start button
    const startBtn = $id('sim-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startSession(_sessionDuration);
      });
    }

    // Back button
    const backBtn = $id('sim-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (CoreMultitaskEngine.isRunning()) {
          if (!confirm('Abort the current session? Progress will be lost.')) return;
          CoreMultitaskEngine.stop();
          AdaptStressSystem.stop();
          clearInterval(_stressInterval);
        }
        _showIntro();
        const dot = $id('status-dot');
        const lbl = $id('status-label');
        if (dot) dot.className = 'status-dot';
        if (lbl) lbl.textContent = 'READY';
      });
    }
  }

 const SimulatorController = (() => {
  
  // all your code here

  console.log('[SimulatorController] initialized');

  return {
    init,
    start: init
  };

})();  // ← VERY IMPORTANT

// ✅ THIS MUST BE OUTSIDE
window.SimulatorController = SimulatorController;

