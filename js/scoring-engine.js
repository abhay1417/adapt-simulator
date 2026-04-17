/* ═══════════════════════════════════════════════════════════════
   ADAPT — Advanced Scoring Engine
   Weighted scoring, penalties, consistency, multitask efficiency
   ═══════════════════════════════════════════════════════════════ */

const ADAPTScoring = (() => {
  'use strict';

  /* ── Skill Weights (must sum to 1.0) ── */
  const WEIGHTS = {
    tracking:   0.25,
    math:       0.20,
    alertRT:    0.20,
    monitoring: 0.15,
    consistency:0.20,
  };

  /* ── Rating thresholds ── */
  const RATINGS = [
    { min: 90, label: 'EXCEPTIONAL',    color: '#00ff88', grade: 'A+' },
    { min: 80, label: 'ABOVE AVERAGE',  color: '#00e5ff', grade: 'A'  },
    { min: 70, label: 'PROFICIENT',     color: '#00aaff', grade: 'B+' },
    { min: 60, label: 'AVERAGE',        color: '#ffd600', grade: 'B'  },
    { min: 50, label: 'BELOW AVERAGE',  color: '#ff8800', grade: 'C'  },
    { min:  0, label: 'NEEDS WORK',     color: '#ff3c3c', grade: 'D'  },
  ];

  /* ── Reaction time scoring (ms → 0-100) ── */
  function scoreReactionTime(avgRT, missedPct) {
    if (avgRT === null || avgRT === undefined) return 0;
    // Perfect = 200ms, average = 450ms, poor = 800ms+
    let rtScore = Math.max(0, 100 - (avgRT - 200) / 6);
    rtScore = Math.max(0, Math.min(100, rtScore));
    // Penalty for missed signals
    const missPenalty = missedPct * 80; // 0-80 pt penalty
    return Math.max(0, rtScore - missPenalty);
  }

  /* ── Tracking score (accuracy % → weighted) ── */
  function scoreTracking(avgAccuracy) {
    if (avgAccuracy === null || avgAccuracy === undefined) return 0;
    // Non-linear: staying very close scores exponentially better
    const base = Math.max(0, Math.min(100, avgAccuracy));
    // Boost for high accuracy
    if (base >= 80) return Math.min(100, base * 1.1);
    if (base >= 60) return base;
    return base * 0.85; // Penalty for poor tracking
  }

  /* ── Math score ── */
  function scoreMath(correct, total, avgTimeMs) {
    if (!total) return 0;
    const acc = correct / total;
    // Speed bonus: under 3s = bonus, over 6s = penalty
    const speedFactor = avgTimeMs
      ? Math.max(0.7, Math.min(1.3, 4500 / Math.max(1000, avgTimeMs)))
      : 1.0;
    return Math.min(100, acc * 100 * speedFactor);
  }

  /* ── Consistency score (stddev of reaction times) ── */
  function scoreConsistency(rtArray) {
    if (!rtArray || rtArray.length < 3) return 50; // neutral
    const mean = rtArray.reduce((a, b) => a + b, 0) / rtArray.length;
    const variance = rtArray.reduce((acc, v) => acc + (v - mean) ** 2, 0) / rtArray.length;
    const stddev = Math.sqrt(variance);
    // Low stddev = consistent = good. Target <100ms stddev
    const score = Math.max(0, 100 - stddev / 4);
    return Math.min(100, score);
  }

  /* ── Monitoring score ── */
  function scoreMonitoring(caught, total, avgCatchTimeMs) {
    if (!total) return 0;
    const acc = caught / total;
    // Speed bonus for catching quickly (under 1.5s = max bonus)
    const speedBonus = avgCatchTimeMs
      ? Math.max(0, (3000 - avgCatchTimeMs) / 3000) * 20
      : 0;
    return Math.min(100, acc * 100 + speedBonus);
  }

  /* ── Penalty calculator ── */
  function calculatePenalties(opts) {
    const {
      falseTaps = 0,
      missedAlerts = 0,
      mathErrors = 0,
      monitoringMissed = 0,
    } = opts;
    const penalties = [];
    if (falseTaps > 0) penalties.push({ label: 'False Taps', pts: -falseTaps * 3 });
    if (missedAlerts > 0) penalties.push({ label: 'Missed Alerts', pts: -missedAlerts * 5 });
    if (mathErrors > 0) penalties.push({ label: 'Math Errors', pts: -mathErrors * 2 });
    if (monitoringMissed > 0) penalties.push({ label: 'Missed Anomalies', pts: -monitoringMissed * 4 });
    const total = penalties.reduce((s, p) => s + p.pts, 0);
    return { penalties, total };
  }

  /* ── Composite score (0-100) ── */
  function computeComposite(breakdown) {
    const {
      trackingScore   = 0,
      mathScore       = 0,
      alertScore      = 0,
      monitoringScore = 0,
      consistencyScore= 0,
    } = breakdown;

    return Math.round(
      trackingScore    * WEIGHTS.tracking +
      mathScore        * WEIGHTS.math +
      alertScore       * WEIGHTS.alertRT +
      monitoringScore  * WEIGHTS.monitoring +
      consistencyScore * WEIGHTS.consistency
    );
  }

  /* ── Get rating from score ── */
  function getRating(score) {
    for (const r of RATINGS) {
      if (score >= r.min) return r;
    }
    return RATINGS[RATINGS.length - 1];
  }

  /* ── Full session scoring ── */
  function scoreSession(data) {
    const {
      tracking,   // { avgAccuracy }
      math,       // { correct, total, avgTimeMs }
      alerts,     // { correct, total, avgRT, rts, missed }
      monitoring, // { caught, total, avgCatchTimeMs }
      reactionRTs,// array of RTs
      penalties: penaltyOpts = {}
    } = data;

    const trackingScore    = scoreTracking(tracking ? tracking.avgAccuracy : 0);
    const mathScore        = scoreMath(
      math ? math.correct : 0,
      math ? math.total : 0,
      math ? math.avgTimeMs : null
    );
    const missedAlertPct   = alerts && alerts.total > 0
      ? (alerts.missed || 0) / alerts.total : 0;
    const alertScore       = scoreReactionTime(
      alerts ? alerts.avgRT : null, missedAlertPct
    );
    const monitoringScore  = scoreMonitoring(
      monitoring ? monitoring.caught : 0,
      monitoring ? monitoring.total : 0,
      monitoring ? monitoring.avgCatchTimeMs : null
    );
    const consistencyScore = scoreConsistency(reactionRTs || []);

    const breakdown = {
      trackingScore:    Math.round(trackingScore),
      mathScore:        Math.round(mathScore),
      alertScore:       Math.round(alertScore),
      monitoringScore:  Math.round(monitoringScore),
      consistencyScore: Math.round(consistencyScore),
    };

    let composite = computeComposite(breakdown);

    // Apply penalties
    const penResult = calculatePenalties(penaltyOpts);
    const penaltyTotal = Math.max(-30, penResult.total); // cap penalties at -30
    composite = Math.max(0, Math.min(100, composite + penaltyTotal));

    const rating = getRating(composite);

    return {
      composite,
      breakdown,
      rating,
      penalties: penResult.penalties,
      penaltyTotal,
      weights: WEIGHTS,
    };
  }

  /* ── Difficulty multiplier (AI-like adaptive) ── */
  function getDifficultyMultiplier(recentScores) {
    if (!recentScores || recentScores.length === 0) return 1.0;
    const avg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    // Good performance → harder; poor → easier (but never below 0.7)
    if (avg >= 85) return Math.min(2.5, 1.0 + (avg - 85) / 30);
    if (avg >= 70) return 1.0 + (avg - 70) / 100;
    if (avg >= 50) return Math.max(0.8, 0.9 + (avg - 50) / 200);
    return 0.7;
  }

  /* ── Multitasking efficiency ── */
  function multitaskEfficiency(taskScores) {
    // Efficiency = how well someone maintains ALL tasks simultaneously
    // vs their best individual task score
    if (!taskScores || taskScores.length === 0) return 0;
    const avg = taskScores.reduce((a, b) => a + b, 0) / taskScores.length;
    const best = Math.max(...taskScores);
    const worst = Math.min(...taskScores);
    // High efficiency = all tasks close together at high level
    const variance = taskScores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / taskScores.length;
    const stddev = Math.sqrt(variance);
    const efficiencyPenalty = stddev / 2; // High variance = lower efficiency
    return Math.max(0, Math.min(100, avg - efficiencyPenalty));
  }

  return {
    scoreSession,
    scoreTracking,
    scoreMath,
    scoreReactionTime,
    scoreMonitoring,
    scoreConsistency,
    calculatePenalties,
    computeComposite,
    getRating,
    getDifficultyMultiplier,
    multitaskEfficiency,
    WEIGHTS,
    RATINGS,
  };
})();
