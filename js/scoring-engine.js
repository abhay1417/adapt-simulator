/* ═══════════════════════════════════════════════════════════════
   ADAPT — Advanced Scoring Engine v2
   Weighted multidimensional scoring with consistency metrics
   ═══════════════════════════════════════════════════════════════ */

const ScoringEngine = (() => {

  /* ── Skill weights for composite score ── */
  const WEIGHTS = {
    tracking:    0.25,
    math:        0.20,
    reaction:    0.20,
    monitoring:  0.20,
    memory:      0.15
  };

  /* ── Reaction time → score mapping (ms → 0–100) ── */
  function rtToScore(ms) {
    if (!ms || ms <= 0) return 0;
    if (ms < 180) return 100;
    if (ms < 250) return 95;
    if (ms < 350) return 85;
    if (ms < 450) return 73;
    if (ms < 600) return 58;
    if (ms < 800) return 42;
    if (ms < 1100) return 25;
    if (ms < 1500) return 12;
    return 5;
  }

  /* ── Consistency score (standard deviation penalty) ── */
  function consistencyScore(values) {
    if (!values || values.length < 2) return 100;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const sd = Math.sqrt(variance);
    // Lower SD = better consistency
    const cv = mean > 0 ? (sd / mean) * 100 : 0; // Coefficient of variation %
    if (cv < 10) return 100;
    if (cv < 20) return 88;
    if (cv < 30) return 74;
    if (cv < 45) return 58;
    if (cv < 60) return 42;
    return 25;
  }

  /* ── Penalty calculator ── */
  function calcPenalty(opts) {
    const { missedSignals = 0, falseTaps = 0, wrongAnswers = 0, timeouts = 0 } = opts;
    const penalty =
      missedSignals * 3 +
      falseTaps * 4 +
      wrongAnswers * 2 +
      timeouts * 1.5;
    return Math.min(50, penalty); // Cap penalty at 50 points
  }

  /* ── Per-skill scoring ── */
  function scoreTracking(avgAccuracy, stabilityPct) {
    // avgAccuracy: 0–100, stabilityPct: 0–100
    const base = avgAccuracy;
    const bonus = stabilityPct > 85 ? 5 : stabilityPct > 70 ? 2 : 0;
    return Math.min(100, Math.round(base * 0.85 + stabilityPct * 0.15 + bonus));
  }

  function scoreMath(correct, total, avgTimeMs) {
    if (!total) return 0;
    const acc = (correct / total) * 100;
    // Speed bonus: < 3s = full speed bonus, tapers off
    const speedBonus = avgTimeMs
      ? Math.max(0, Math.min(10, (6000 - avgTimeMs) / 500))
      : 0;
    return Math.min(100, Math.round(acc * 0.9 + speedBonus));
  }

  function scoreReaction(rts, missed, falseTaps) {
    if (!rts || !rts.length) return Math.max(0, 50 - missed * 10 - falseTaps * 8);
    const avgRT = rts.reduce((a, b) => a + b, 0) / rts.length;
    const rtSc = rtToScore(avgRT);
    const cons = consistencyScore(rts);
    const penalty = calcPenalty({ missedSignals: missed, falseTaps });
    return Math.max(0, Math.round(rtSc * 0.6 + cons * 0.4 - penalty));
  }

  function scoreMonitoring(caught, total, avgCatchMs, missed) {
    if (!total) return 0;
    const acc = (caught / total) * 100;
    const speedBonus = avgCatchMs ? Math.max(0, Math.min(10, (3000 - avgCatchMs) / 300)) : 0;
    const penalty = calcPenalty({ missedSignals: missed });
    return Math.max(0, Math.min(100, Math.round(acc * 0.8 + speedBonus + 10 - penalty * 0.5)));
  }

  function scoreMemory(level, seqLength, correctRounds, totalRounds) {
    const levelSc = Math.min(100, level * 12);
    const accSc = totalRounds > 0 ? (correctRounds / totalRounds) * 100 : 50;
    return Math.min(100, Math.round(levelSc * 0.6 + accSc * 0.4));
  }

  /* ── Full composite score ── */
  function compositeScore(skills) {
    /*
      skills = {
        tracking:   { score: 0–100 },
        math:       { score: 0–100 },
        reaction:   { score: 0–100 },
        monitoring: { score: 0–100 },
        memory:     { score: 0–100 }   (optional)
      }
    */
    let total = 0;
    let weightSum = 0;
    for (const [key, w] of Object.entries(WEIGHTS)) {
      if (skills[key] !== undefined) {
        total += skills[key].score * w;
        weightSum += w;
      }
    }
    return weightSum > 0 ? Math.round(total / weightSum) : 0;
  }

  /* ── Rating label ── */
  function rating(score) {
    if (score >= 90) return { label: 'EXCEPTIONAL',   color: '#00ff88', stars: 5 };
    if (score >= 80) return { label: 'ABOVE AVERAGE', color: '#00aaff', stars: 4 };
    if (score >= 65) return { label: 'AVERAGE',       color: '#ffd600', stars: 3 };
    if (score >= 50) return { label: 'BELOW AVERAGE', color: '#ff8800', stars: 2 };
    return              { label: 'NEEDS WORK',     color: '#ff3c3c', stars: 1 };
  }

  /* ── Multitasking efficiency (penalty when tasks are concurrent) ── */
  function multitaskEfficiency(trackScore, mathScore, reactionScore) {
    // Under high load, scores naturally drop. Efficiency measures how well maintained
    const avg = (trackScore + mathScore + reactionScore) / 3;
    const minS = Math.min(trackScore, mathScore, reactionScore);
    // Penalty for very uneven performance (one task ignored)
    const balance = minS / Math.max(avg, 1);
    return Math.round(avg * 0.7 + balance * avg * 0.3);
  }

  console.log('[ScoringEngine] initialized');

  return {
    rtToScore,
    consistencyScore,
    calcPenalty,
    scoreTracking,
    scoreMath,
    scoreReaction,
    scoreMonitoring,
    scoreMemory,
    compositeScore,
    multitaskEfficiency,
    rating
  };
})();
