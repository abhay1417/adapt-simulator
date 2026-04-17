/* ═══════════════════════════════════════════════════════════════
   ADAPT — Stress & Distraction System
   Audio alerts, random distractions, warning sounds, stress level
   ═══════════════════════════════════════════════════════════════ */

const ADAPTStress = (() => {
  'use strict';

  let _level = 0;          // 0–100
  let _active = false;
  let _distractInterval = null;
  let _stressInterval   = null;
  let _onLevelChange    = null;

  /* ── Distraction messages shown on overlay ── */
  const DISTRACTIONS = [
    '⚠ TCAS ALERT — TRAFFIC',
    '📻 ATC: TURN LEFT 270',
    '🔴 ENGINE 2 FAULT',
    '⚡ ELECTRICAL FAULT',
    '📢 CABIN CREW CALL',
    '🌩 TURBULENCE AHEAD',
    '⛽ FUEL IMBALANCE',
    '🔊 STALL WARNING',
    '📡 NAV FAILURE',
    '⚠ OVERSPEED',
  ];

  /* ── Play stress-level-appropriate audio ── */
  function playStressAudio(level) {
    if (!window.ADAPTAudio) return;
    if (level >= 80) {
      ADAPTAudio.playWarning();
    } else if (level >= 50) {
      ADAPTAudio.playAlert();
    } else {
      ADAPTAudio.playTick();
    }
  }

  /* ── Show visual distraction ── */
  function triggerDistraction() {
    const el = document.getElementById('sim-distraction');
    const textEl = document.getElementById('sim-distraction-text');
    if (!el || !textEl) return;
    const msg = DISTRACTIONS[Math.floor(Math.random() * DISTRACTIONS.length)];
    textEl.textContent = msg;
    el.classList.remove('hidden');
    playStressAudio(_level);
    setTimeout(() => el.classList.add('hidden'), 1800);
  }

  /* ── Start stress system ── */
  function start(opts = {}) {
    _active = true;
    _level  = opts.initialLevel || 0;
    _onLevelChange = opts.onLevelChange || null;

    // Distraction interval (decreases as stress increases)
    _distractInterval = setInterval(() => {
      if (!_active) return;
      const interval = Math.max(8000, 30000 - _level * 200);
      // Random chance based on stress level
      if (Math.random() < (_level / 100) * 0.7 + 0.1) {
        triggerDistraction();
      }
    }, 5000);
  }

  /* ── Update stress level (0–100) ── */
  function setLevel(level) {
    _level = Math.max(0, Math.min(100, level));
    if (_onLevelChange) _onLevelChange(_level);
    // Update stress bar in HUD
    const fill = document.getElementById('sim-stress-fill');
    if (fill) {
      fill.style.width = _level + '%';
      if (_level >= 75) {
        fill.style.background = 'var(--accent-red)';
      } else if (_level >= 45) {
        fill.style.background = 'var(--accent-yellow)';
      } else {
        fill.style.background = 'var(--accent-green)';
      }
    }
  }

  /* ── Ramp stress over time ── */
  function ramp(durationMs, fromLevel, toLevel) {
    const steps = 60;
    const stepMs = durationMs / steps;
    const delta  = (toLevel - fromLevel) / steps;
    let   step   = 0;

    _stressInterval = setInterval(() => {
      if (!_active || step >= steps) {
        clearInterval(_stressInterval);
        return;
      }
      setLevel(fromLevel + delta * step);
      step++;
    }, stepMs);
  }

  /* ── Stop ── */
  function stop() {
    _active = false;
    clearInterval(_distractInterval);
    clearInterval(_stressInterval);
    setLevel(0);
    const el = document.getElementById('sim-distraction');
    if (el) el.classList.add('hidden');
  }

  /* ── Get current level ── */
  function getLevel() { return _level; }

  /* ── Play specific sounds ── */
  function playWarningBeep() {
    if (window.ADAPTAudio) ADAPTAudio.playWarning();
  }
  function playErrorBeep() {
    if (window.ADAPTAudio) ADAPTAudio.playError();
  }
  function playSuccessBeep() {
    if (window.ADAPTAudio) ADAPTAudio.playSuccess();
  }
  function playAlertBeep() {
    if (window.ADAPTAudio) ADAPTAudio.playAlert();
  }

  return {
    start,
    stop,
    setLevel,
    ramp,
    getLevel,
    triggerDistraction,
    playWarningBeep,
    playErrorBeep,
    playSuccessBeep,
    playAlertBeep,
  };
})();
