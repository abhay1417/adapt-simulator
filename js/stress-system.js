/* ═══════════════════════════════════════════════════════════════
   ADAPT — Stress & Distraction System
   Audio distractions · Visual stress indicators · Pressure ramp
   ═══════════════════════════════════════════════════════════════ */

const AdaptStressSystem = (() => {

  let _running = false;
  let _level = 1;          // 1–5
  let _timers = [];
  let _stressEl = null;    // HUD stress indicator element

  /* ── Stress level colours ── */
  const STRESS_COLORS = ['#00ff88','#8fff00','#ffd600','#ff8800','#ff3c3c'];
  const STRESS_LABELS = ['LOW','MODERATE','HIGH','VERY HIGH','CRITICAL'];

  /* ── Schedule a repeating distraction ── */
  function _schedule(fn, minMs, maxMs) {
    if (!_running) return;
    const delay = minMs + Math.random() * (maxMs - minMs);
    const t = setTimeout(() => {
      if (_running) {
        try { fn(); } catch(e) {}
        _schedule(fn, minMs, maxMs);
      }
    }, delay);
    _timers.push(t);
  }

  /* ── Random radio crackle ── */
  function _radioCrackle() {
    if (!_running || _level < 2) return;
    const freqs = [320, 440, 680, 1100, 2200];
    const f = freqs[Math.floor(Math.random() * freqs.length)];
    ADAPTAudio.beep(f, 0.05 + Math.random() * 0.08, 'sawtooth', 0.06);
    if (Math.random() < 0.4) {
      setTimeout(() => ADAPTAudio.beep(f * 1.3, 0.04, 'sawtooth', 0.04), 80);
    }
  }

  /* ── Warning klaxon ── */
  function _klaxon() {
    if (!_running || _level < 3) return;
    ADAPTAudio.beep(880, 0.06, 'square', 0.1);
    setTimeout(() => ADAPTAudio.beep(660, 0.06, 'square', 0.1), 80);
    setTimeout(() => ADAPTAudio.beep(880, 0.06, 'square', 0.1), 160);
  }

  /* ── Screen flash for critical stress ── */
  function _screenFlash() {
    if (!_running || _level < 4) return;
    const div = document.createElement('div');
    div.style.cssText = `
      position:fixed;inset:0;z-index:9999;pointer-events:none;
      background:rgba(255,60,60,0.08);animation:adapt-flash 0.3s ease forwards;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 400);
  }

  /* ── Update HUD stress bar ── */
  function _updateHUD() {
    if (!_stressEl) return;
    const idx = Math.min(_level - 1, 4);
    _stressEl.style.color = STRESS_COLORS[idx];
    _stressEl.style.textShadow = `0 0 8px ${STRESS_COLORS[idx]}`;
    _stressEl.textContent = STRESS_LABELS[idx];
  }

  /* ── Public API ── */
  function start(level = 1, stressIndicatorEl = null) {
    stop();
    _running = true;
    _level = Math.max(1, Math.min(5, level));
    _stressEl = stressIndicatorEl;
    _updateHUD();

    // Radio crackle – always
    _schedule(_radioCrackle, 4000, 12000);

    // Klaxon – level 3+
    if (_level >= 3) _schedule(_klaxon, 8000, 20000);

    // Screen flash – level 4+
    if (_level >= 4) _schedule(_screenFlash, 15000, 30000);
  }

  function setLevel(level) {
    _level = Math.max(1, Math.min(5, level));
    _updateHUD();
  }

  function stop() {
    _running = false;
    _timers.forEach(t => clearTimeout(t));
    _timers = [];
    if (_stressEl) _stressEl.textContent = 'LOW';
  }

  /* ── Inject CSS for flash animation ── */
  const style = document.createElement('style');
  style.textContent = `
    @keyframes adapt-flash {
      0%{opacity:1} 50%{opacity:0.7} 100%{opacity:0}
    }
  `;
  document.head.appendChild(style);

  console.log('[AdaptStressSystem] Initialized');
  return { start, stop, setLevel };
})();
