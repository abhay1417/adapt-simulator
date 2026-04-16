/* ═══════════════════════════════════════════════════════════════
   ADAPT — Dashboard Module
   Shows latest scores, history chart, overall rating
   ═══════════════════════════════════════════════════════════════ */

const DashboardModule = (() => {

  let chartInstance = null;
  const $id = id => document.getElementById(id);

  function refresh() {
    updateStatCards();
    drawHistoryChart();
    updateOverall();
  }

  /* ── Stat Cards ── */
  function updateStatCards() {
    // Multitask
    const mt = ADAPTStorage.getLatest('multitask');
    if (mt) {
      $id('dash-multitask').textContent = mt.composite + '%';
      $id('dash-multitask-meta').textContent =
        `Track: ${mt.trackAcc}% · Math: ${mt.mathAcc}% · Alert: ${mt.alertAcc}%`;
    }

    // Reaction
    const rt = ADAPTStorage.getLatest('reaction');
    if (rt) {
      $id('dash-reaction').textContent = rt.bestRT ? rt.bestRT + 'ms' : '—';
      $id('dash-reaction-meta').textContent = `Avg: ${rt.avgRT || '—'}ms · Acc: ${rt.accuracy}%`;
    }

    // Monitoring
    const im = ADAPTStorage.getLatest('monitoring');
    if (im) {
      $id('dash-monitoring').textContent = im.accuracy + '%';
      $id('dash-monitoring-meta').textContent = `Caught: ${im.caught}/${im.total} · Missed: ${im.missed}`;
    }

    // Spatial
    const sp = ADAPTStorage.getLatest('spatial');
    if (sp) {
      $id('dash-spatial').textContent = sp.score + ' pts';
      $id('dash-spatial-meta').textContent = `Acc: ${sp.accuracy}% · Streak: ${sp.maxStreak}`;
    }

    // Memory
    const mem = ADAPTStorage.getLatest('memory');
    if (mem) {
      $id('dash-memory').textContent = 'Lvl ' + mem.level;
      $id('dash-memory-meta').textContent = `Score: ${mem.score} · Length: ${mem.maxLength}`;
    }
  }

  function updateOverall() {
    const scores = [];
    const mt = ADAPTStorage.getLatest('multitask');
    if (mt) scores.push(mt.composite);
    const rt = ADAPTStorage.getLatest('reaction');
    if (rt) scores.push(rt.accuracy);
    const im = ADAPTStorage.getLatest('monitoring');
    if (im) scores.push(im.accuracy);
    const sp = ADAPTStorage.getLatest('spatial');
    if (sp) scores.push(Math.min(100, Math.round(sp.accuracy)));
    const mem = ADAPTStorage.getLatest('memory');
    if (mem) scores.push(Math.min(100, mem.level * 12));

    if (scores.length === 0) return;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const rating = avg >= 90 ? 'EXCEPTIONAL' : avg >= 75 ? 'ABOVE AVG' : avg >= 55 ? 'AVERAGE' : 'BELOW AVG';
    const color = avg >= 90 ? '#00ff88' : avg >= 75 ? '#00aaff' : avg >= 55 ? '#ffd600' : '#ff3c3c';

    const el = $id('dash-overall');
    if (el) { el.textContent = avg + '%'; el.style.color = color; }
    const metaEl = $id('dash-overall-meta');
    if (metaEl) metaEl.textContent = rating + ` (${scores.length}/5 modules done)`;
  }

  /* ── History Chart (pure canvas) ── */
  function drawHistoryChart() {
    const canvas = $id('history-chart');
    if (!canvas) return;
    const all = ADAPTStorage.getAllForChart();
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Gather all entries with timestamps
    const series = {
      Multitask: { color: '#00aaff', points: [] },
      Reaction:  { color: '#00ff88', points: [] },
      Monitoring:{ color: '#ff8800', points: [] },
      Spatial:   { color: '#aa44ff', points: [] },
      Memory:    { color: '#ffd600', points: [] },
    };

    (all.multitask || []).forEach(s => series.Multitask.points.push({ t: s.timestamp, v: s.composite }));
    (all.reaction || []).forEach(s => series.Reaction.points.push({ t: s.timestamp, v: s.accuracy }));
    (all.monitoring || []).forEach(s => series.Monitoring.points.push({ t: s.timestamp, v: s.accuracy }));
    (all.spatial || []).forEach(s => series.Spatial.points.push({ t: s.timestamp, v: s.accuracy }));
    (all.memory || []).forEach(s => series.Memory.points.push({ t: s.timestamp, v: Math.min(100, s.level * 12) }));

    const allPts = Object.values(series).flatMap(s => s.points);
    if (!allPts.length) {
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = isDark ? '#1c2740' : '#ccd6ef';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = isDark ? '#4a6080' : '#7090b0';
      ctx.font = '14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Complete modules to see score history', W / 2, H / 2);
      return;
    }

    // Responsive canvas width
    canvas.width = canvas.parentElement.clientWidth - 40 || 600;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 20, bottom: 36, left: 44 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    // Background
    ctx.fillStyle = isDark ? '#151e30' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + chartH - (i / 5) * chartH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillStyle = isDark ? '#4a6080' : '#7090b0';
      ctx.font = '10px Rajdhani, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(i * 20 + '%', pad.left - 6, y + 4);
    }

    // Find time range
    const times = allPts.map(p => p.t).sort((a, b) => a - b);
    const tMin = times[0], tMax = times[times.length - 1] || tMin + 1;

    // Axes
    ctx.strokeStyle = isDark ? '#1e3050' : '#aabbd8';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + chartH); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();

    // Plot each series
    Object.entries(series).forEach(([label, { color, points }]) => {
      if (!points.length) return;
      points.sort((a, b) => a.t - b.t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = pad.left + ((p.t - tMin) / (tMax - tMin || 1)) * chartW;
        const y = pad.top + chartH - (p.v / 100) * chartH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      points.forEach(p => {
        const x = pad.left + ((p.t - tMin) / (tMax - tMin || 1)) * chartW;
        const y = pad.top + chartH - (p.v / 100) * chartH;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = isDark ? '#151e30' : '#dde5f5';
        ctx.lineWidth = 1.5; ctx.stroke();
      });
    });

    // Legend
    const legendX = pad.left + 8;
    let lx = legendX;
    Object.entries(series).forEach(([label, { color }]) => {
      ctx.fillStyle = color;
      ctx.fillRect(lx, H - 22, 12, 12);
      ctx.fillStyle = isDark ? '#8fa3c9' : '#304070';
      ctx.font = '11px Rajdhani, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 16, H - 13);
      lx += ctx.measureText(label).width + 34;
    });
  }

  /* ── Clear handler ── */
  function initClearBtn() {
    const btn = $id('clear-scores-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (confirm('Clear all saved scores? This cannot be undone.')) {
          ADAPTStorage.clearAll();
          // Reset display
          ['dash-multitask','dash-reaction','dash-monitoring','dash-spatial','dash-memory','dash-overall'].forEach(id => {
            const el = $id(id); if (el) { el.textContent = '—'; el.style.color = ''; }
          });
          ['dash-multitask-meta','dash-reaction-meta','dash-monitoring-meta','dash-spatial-meta','dash-memory-meta','dash-overall-meta'].forEach(id => {
            const el = $id(id); if (el) el.textContent = 'No data';
          });
          $id('dash-overall-meta').textContent = 'Complete all modules';
          drawHistoryChart();
        }
      });
    }
  }

  function init() {
    initClearBtn();
    refresh();
    window.addEventListener('resize', drawHistoryChart);
  }

  return { init, refresh };
})();
