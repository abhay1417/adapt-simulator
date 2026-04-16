/* ═══════════════════════════════════════════════════
   ADAPT — Audio Manager (Web Audio API)
   ═══════════════════════════════════════════════════ */

const ADAPTAudio = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { return null; }
    }
    // Resume if suspended (mobile browsers require user gesture)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq = 880, duration = 0.12, type = 'sine', volume = 0.4) {
    const c = getCtx();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.setValueAtTime(volume, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch (e) {}
  }

  function playAlert() {
    // Double beep – high pitched alert
    beep(1200, 0.08, 'square', 0.3);
    setTimeout(() => beep(1200, 0.08, 'square', 0.3), 120);
  }

  function playSuccess() {
    beep(660, 0.1, 'sine', 0.3);
    setTimeout(() => beep(880, 0.12, 'sine', 0.3), 110);
  }

  function playError() {
    beep(220, 0.18, 'sawtooth', 0.25);
  }

  function playTick() {
    beep(1000, 0.04, 'square', 0.15);
  }

  function playCountdown() {
    beep(440, 0.1, 'sine', 0.3);
  }

  function playWarning() {
    // Low warning beep
    beep(340, 0.2, 'square', 0.35);
    setTimeout(() => beep(340, 0.2, 'square', 0.35), 300);
  }

  function playCorrect() {
    beep(880, 0.08, 'sine', 0.25);
  }

  function playWrong() {
    beep(180, 0.15, 'sawtooth', 0.2);
  }

  // Unlock audio on first user interaction
  function unlock() {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume();
  }

  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  return { beep, playAlert, playSuccess, playError, playTick, playCountdown, playWarning, playCorrect, playWrong };
})();
