/* ═══════════════════════════════════════════════════
   ADAPT — Storage Manager (localStorage persistence)
   ═══════════════════════════════════════════════════ */

const ADAPTStorage = (() => {
  const KEY = 'adapt_scores_v2';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : defaultState();
    } catch (e) {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      multitask: [],
      reaction:  [],
      monitoring:[],
      spatial:   [],
      memory:    []
    };
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* quota exceeded – silent fail */ }
  }

  function addScore(module, entry) {
    const state = load();
    if (!state[module]) state[module] = [];
    entry.timestamp = Date.now();
    state[module].push(entry);
    // Keep last 20 entries per module
    if (state[module].length > 20) state[module] = state[module].slice(-20);
    save(state);
  }

  function getScores(module) {
    const state = load();
    return state[module] || [];
  }

  function getBest(module, field) {
    const scores = getScores(module);
    if (!scores.length) return null;
    return scores.reduce((best, s) => {
      const v = s[field];
      if (v === undefined || v === null) return best;
      if (best === null) return v;
      // For reaction time, lower is better
      if (field === 'bestRT' || field === 'avgRT') return Math.min(best, v);
      return Math.max(best, v);
    }, null);
  }

  function getLatest(module) {
    const scores = getScores(module);
    return scores.length ? scores[scores.length - 1] : null;
  }

  function clearAll() {
    save(defaultState());
  }

  function getAllForChart() {
    const state = load();
    return state;
  }

  return { addScore, getScores, getBest, getLatest, clearAll, getAllForChart };
})();
