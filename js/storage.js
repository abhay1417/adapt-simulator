/* ═══════════════════════════════════════════════════
   ADAPT — Storage Manager (localStorage persistence)
   Supports: multitask, reaction, monitoring, spatial,
             memory, simulator session history
   ═══════════════════════════════════════════════════ */

const ADAPTStorage = (() => {
  const KEY = 'adapt_scores_v3';

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
      multitask:  [],
      reaction:   [],
      monitoring: [],
      spatial:    [],
      memory:     [],
      simulator:  [],
    };
  }

  function save(st) {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) { /* quota exceeded – silent fail */ }
  }

  function addScore(module, entry) {
    const st = load();
    if (!st[module]) st[module] = [];
    entry.timestamp = Date.now();
    st[module].push(entry);
    const keep = module === 'simulator' ? 10 : 20;
    if (st[module].length > keep) st[module] = st[module].slice(-keep);
    save(st);
  }

  function getScores(module) {
    const st = load();
    return st[module] || [];
  }

  function getBest(module, field) {
    const scores = getScores(module);
    if (!scores.length) return null;
    return scores.reduce((best, s) => {
      const v = s[field];
      if (v === undefined || v === null) return best;
      if (best === null) return v;
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
    return load();
  }

  /* ── Simulator-specific helpers ── */
  function getSimulatorHistory() {
    return getScores('simulator');
  }

  function getBestSimScore() {
    const sessions = getScores('simulator');
    if (!sessions.length) return null;
    return sessions.reduce((best, s) => {
      return (!best || s.composite > best.composite) ? s : best;
    }, null);
  }

  /* ── Reaction trend ── */
  function getReactionTrend() {
    return getScores('reaction').map(s => ({
      t:    s.timestamp,
      avg:  s.avgRT,
      best: s.bestRT,
      acc:  s.accuracy,
    }));
  }

  /* ── Skill summary for radar/bars ── */
  function getSkillSummary() {
    const mt  = getLatest('multitask');
    const rt  = getLatest('reaction');
    const im  = getLatest('monitoring');
    const sp  = getLatest('spatial');
    const mem = getLatest('memory');
    const sim = getLatest('simulator');

    return {
      tracking:    mt  ? mt.trackAcc  : null,
      math:        mt  ? mt.mathAcc   : null,
      reaction:    rt  ? rt.accuracy  : null,
      monitoring:  im  ? im.accuracy  : null,
      spatial:     sp  ? sp.accuracy  : null,
      memory:      mem ? Math.min(100, mem.level*12) : null,
      consistency: sim ? (sim.breakdown ? sim.breakdown.consistencyScore : null) : null,
    };
  }

  return {
    addScore,
    getScores,
    getBest,
    getLatest,
    clearAll,
    getAllForChart,
    getSimulatorHistory,
    getBestSimScore,
    getReactionTrend,
    getSkillSummary,
  };
})();
