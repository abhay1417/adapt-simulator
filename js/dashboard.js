/* ═══════════════════════════════════════════════════════════════
   ADAPT — Advanced Dashboard Module v2
   Score cards · History chart · Reaction trend · Skill bars
   Session history · Weak area detection
   ═══════════════════════════════════════════════════════════════ */

const DashboardModule = (() => {
  'use strict';
  const $ = id => document.getElementById(id);

  /* ─────────────── REFRESH ─────────────── */
  function refresh() {
    updateStatCards();
    drawHistoryChart();
    drawReactionTrend();
    updateSkillBars();
    updateSessionHistory();
    updateOverall();
  }

  /* ─────────────── STAT CARDS ─────────────── */
  function updateStatCards() {
    // Multitask
    const mt = ADAPTStorage.getLatest('multitask');
    if (mt) {
      setText('dash-multitask',      mt.composite + '%');
      setText('dash-multitask-meta', `Track: ${mt.trackAcc||'—'}% · Math: ${mt.mathAcc||'—'}% · Alert: ${mt.alertAcc||'—'}%`);
    }
    // Reaction
    const rt = ADAPTStorage.getLatest('reaction');
    if (rt) {
      setText('dash-reaction',      rt.bestRT ? rt.bestRT + 'ms' : '—');
      setText('dash-reaction-meta', `Avg: ${rt.avgRT||'—'}ms · Acc: ${rt.accuracy||'—'}%`);
    }
    // Monitoring
    const im = ADAPTStorage.getLatest('monitoring');
    if (im) {
      setText('dash-monitoring',      im.accuracy + '%');
      setText('dash-monitoring-meta', `Caught: ${im.caught}/${im.total} · Missed: ${im.missed}`);
    }
    // Spatial
    const sp = ADAPTStorage.getLatest('spatial');
    if (sp) {
      setText('dash-spatial',      sp.score + ' pts');
      setText('dash-spatial-meta', `Acc: ${sp.accuracy}% · Streak: ${sp.maxStreak}`);
    }
    // Memory
    const mem = ADAPTStorage.getLatest('memory');
    if (mem) {
      setText('dash-memory',      'Lvl ' + mem.level);
      setText('dash-memory-meta', `Score: ${mem.score} · Length: ${mem.maxLength}`);
    }
    // Simulator
    const best = ADAPTStorage.getBestSimScore();
    if (best) {
      const el = $('dash-simulator');
      if (el) { el.textContent = best.composite + '%'; el.style.color = ADAPTScoring.getRating(best.composite).color; }
      setText('dash-simulator-meta', `Efficiency: ${best.efficiency||'—'}% · Peak: ${best.peakScore||'—'}`);
    }
  }

  function setText(id, val) {
    const el = $(id); if (el) el.textContent = val;
  }

  /* ─────────────── OVERALL ─────────────── */
  function updateOverall() {
    const scores = [];
    const mt  = ADAPTStorage.getLatest('multitask');
    if (mt)  scores.push(mt.composite || 0);
    const rt  = ADAPTStorage.getLatest('reaction');
    if (rt)  scores.push(rt.accuracy || 0);
    const im  = ADAPTStorage.getLatest('monitoring');
    if (im)  scores.push(im.accuracy || 0);
    const sp  = ADAPTStorage.getLatest('spatial');
    if (sp)  scores.push(Math.min(100, Math.round(sp.accuracy || 0)));
    const mem = ADAPTStorage.getLatest('memory');
    if (mem) scores.push(Math.min(100, (mem.level||0) * 12));
    const sim = ADAPTStorage.getLatest('simulator');
    if (sim) scores.push(sim.composite || 0);

    if (!scores.length) return;
    const avg    = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length);
    const rating = ADAPTScoring.getRating(avg);

    const el   = $('dash-overall');
    const meta = $('dash-overall-meta');
    if (el)   { el.textContent = avg + '%'; el.style.color = rating.color; }
    if (meta) meta.textContent = rating.label + ` (${scores.length}/6 modules done)`;
  }

  /* ─────────────── HISTORY CHART ─────────────── */
  function drawHistoryChart() {
    const canvas = $('history-chart');
    if (!canvas) return;
    const all    = ADAPTStorage.getAllForChart();
    const dark   = document.documentElement.getAttribute('data-theme') !== 'light';

    const series = {
      Multitask:  { color: '#00aaff', points: [] },
      Reaction:   { color: '#00ff88', points: [] },
      Monitoring: { color: '#ff8800', points: [] },
      Spatial:    { color: '#aa44ff', points: [] },
      Memory:     { color: '#ffd600', points: [] },
      Simulator:  { color: '#ff3c3c', points: [] },
    };

    (all.multitask  ||[]).forEach(s => series.Multitask.points.push({ t: s.timestamp, v: s.composite||0 }));
    (all.reaction   ||[]).forEach(s => series.Reaction.points.push({ t: s.timestamp, v: s.accuracy||0 }));
    (all.monitoring ||[]).forEach(s => series.Monitoring.points.push({ t: s.timestamp, v: s.accuracy||0 }));
    (all.spatial    ||[]).forEach(s => series.Spatial.points.push({ t: s.timestamp, v: s.accuracy||0 }));
    (all.memory     ||[]).forEach(s => series.Memory.points.push({ t: s.timestamp, v: Math.min(100,(s.level||0)*12) }));
    (all.simulator  ||[]).forEach(s => series.Simulator.points.push({ t: s.timestamp, v: s.composite||0 }));

    const allPts = Object.values(series).flatMap(s => s.points);

    canvas.width = (canvas.parentElement?.clientWidth || 600) - 40;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    if (!allPts.length) {
      ctx.fillStyle = dark ? '#1c2740' : '#ccd6ef';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = dark ? '#4a6080' : '#7090b0';
      ctx.font = '14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Complete modules to see score history', W/2, H/2);
      return;
    }

    const pad = { top: 20, right: 20, bottom: 36, left: 44 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top  - pad.bottom;

    ctx.fillStyle = dark ? '#151e30' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + cH - (i/5)*cH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+cW, y); ctx.stroke();
      ctx.fillStyle = dark ? '#4a6080' : '#7090b0';
      ctx.font = '10px Rajdhani, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(i*20+'%', pad.left-6, y+4);
    }

    const times = allPts.map(p=>p.t).sort((a,b)=>a-b);
    const tMin  = times[0], tMax = times[times.length-1] || tMin+1;

    // Axes
    ctx.strokeStyle = dark ? '#1e3050' : '#aabbd8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top+cH); ctx.lineTo(pad.left+cW, pad.top+cH); ctx.stroke();

    // Series
    Object.entries(series).forEach(([label, { color, points }]) => {
      if (!points.length) return;
      points.sort((a,b) => a.t-b.t);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        const x = pad.left + ((p.t-tMin)/(tMax-tMin||1))*cW;
        const y = pad.top  + cH - (p.v/100)*cH;
        i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      });
      ctx.stroke();
      points.forEach(p => {
        const x = pad.left + ((p.t-tMin)/(tMax-tMin||1))*cW;
        const y = pad.top  + cH - (p.v/100)*cH;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = dark ? '#151e30' : '#dde5f5'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    });

    // Legend
    let lx = pad.left + 8;
    ctx.font = '11px Rajdhani, sans-serif'; ctx.textAlign = 'left';
    Object.entries(series).forEach(([label, { color }]) => {
      ctx.fillStyle = color; ctx.fillRect(lx, H-22, 12, 12);
      ctx.fillStyle = dark ? '#8fa3c9' : '#304070';
      ctx.fillText(label, lx+16, H-13);
      lx += ctx.measureText(label).width + 34;
    });
  }

  /* ─────────────── REACTION TREND ─────────────── */
  function drawReactionTrend() {
    const canvas = $('reaction-trend-chart');
    if (!canvas) return;
    const trend = ADAPTStorage.getReactionTrend();
    const dark  = document.documentElement.getAttribute('data-theme') !== 'light';

    canvas.width = (canvas.parentElement?.clientWidth || 600) - 40;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = dark ? '#151e30' : '#dde5f5';
    ctx.fillRect(0, 0, W, H);

    if (trend.length < 2) {
      ctx.fillStyle = dark ? '#4a6080' : '#7090b0';
      ctx.font = '13px Rajdhani, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Complete 2+ Reaction tests to see trend', W/2, H/2);
      return;
    }

    const pad = { top:16, right:20, bottom:30, left:52 };
    const cW  = W - pad.left - pad.right;
    const cH  = H - pad.top  - pad.bottom;

    // RT values (avg)
    const rts = trend.map(t=>t.avg).filter(Boolean);
    if (!rts.length) return;
    const rtMin = Math.min(...rts) - 50;
    const rtMax = Math.max(...rts) + 50;
    const rtRange = rtMax - rtMin || 1;

    // Grid lines
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i/4)*cH;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+cW, y); ctx.stroke();
      const val = Math.round(rtMax - (i/4)*rtRange);
      ctx.fillStyle = dark ? '#4a6080' : '#7090b0';
      ctx.font = '9px Rajdhani'; ctx.textAlign = 'right';
      ctx.fillText(val+'ms', pad.left-5, y+4);
    }

    // Avg RT line (lower = better → invert Y)
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    trend.forEach((pt, i) => {
      if (!pt.avg) return;
      const x = pad.left + (i / (trend.length-1)) * cW;
      const y = pad.top  + ((pt.avg - rtMin) / rtRange) * cH;
      i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();

    // Best RT line
    ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5; ctx.setLineDash([4,4]);
    ctx.beginPath();
    trend.forEach((pt, i) => {
      if (!pt.best) return;
      const x = pad.left + (i/(trend.length-1))*cW;
      const y = pad.top  + ((pt.best - rtMin)/rtRange)*cH;
      i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = dark ? '#8fa3c9' : '#304070';
    ctx.font = '11px Rajdhani'; ctx.textAlign = 'left';
    ctx.fillStyle = '#00e5ff'; ctx.fillRect(pad.left+8, H-22, 12, 10);
    ctx.fillStyle = dark ? '#8fa3c9' : '#304070'; ctx.fillText('Avg RT', pad.left+24, H-14);
    ctx.fillStyle = '#00ff88'; ctx.fillRect(pad.left+90, H-22, 12, 10);
    ctx.fillStyle = dark ? '#8fa3c9' : '#304070'; ctx.fillText('Best RT', pad.left+106, H-14);

    // Title note
    ctx.fillStyle = dark ? '#4a6080' : '#7090b0';
    ctx.font = '10px Rajdhani'; ctx.textAlign = 'right';
    ctx.fillText('Lower is better ↓', W - pad.right, pad.top + 14);
  }

  /* ─────────────── SKILL BARS ─────────────── */
  function updateSkillBars() {
    const container = $('skill-bars');
    if (!container) return;
    const skills = ADAPTStorage.getSkillSummary();

    const items = [
      { label: 'Target Tracking',     val: skills.tracking,    color: '#00aaff' },
      { label: 'Math Speed',          val: skills.math,        color: '#ffd600' },
      { label: 'Reaction Accuracy',   val: skills.reaction,    color: '#00ff88' },
      { label: 'Instrument Monitor',  val: skills.monitoring,  color: '#ff8800' },
      { label: 'Spatial Orientation', val: skills.spatial,     color: '#aa44ff' },
      { label: 'Memory Recall',       val: skills.memory,      color: '#00e5ff' },
      { label: 'Consistency',         val: skills.consistency, color: '#ff3c3c' },
    ];

    const hasAny = items.some(it => it.val !== null && it.val !== undefined);
    if (!hasAny) {
      container.innerHTML = '<div class="no-data-msg">Complete modules to see skill analysis</div>';
      return;
    }

    // Find weakest
    const valued = items.filter(it => it.val !== null);
    const minVal = valued.length ? Math.min(...valued.map(it=>it.val)) : null;

    container.innerHTML = items.map(it => {
      const pct   = it.val !== null ? Math.round(it.val) : null;
      const isWeak= pct !== null && pct === minVal && valued.length > 1;
      return `
        <div class="skill-bar-row ${isWeak ? 'skill-weak' : ''}">
          <div class="skill-bar-label">
            ${it.label}
            ${isWeak ? '<span class="weak-badge">⚠ WEAKEST</span>' : ''}
          </div>
          <div class="skill-bar-track">
            <div class="skill-bar-fill" style="width:${pct||0}%; background:${it.color}" data-target="${pct||0}"></div>
          </div>
          <div class="skill-bar-pct" style="color:${it.color}">${pct !== null ? pct+'%' : '—'}</div>
        </div>`;
    }).join('');

    // Animate bars
    requestAnimationFrame(() => {
      container.querySelectorAll('.skill-bar-fill').forEach(bar => {
        bar.style.width = '0%';
        setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 50);
      });
    });
  }

  /* ─────────────── SESSION HISTORY ─────────────── */
  function updateSessionHistory() {
    const container = $('session-list');
    if (!container) return;
    const sessions = ADAPTStorage.getSimulatorHistory();

    if (!sessions.length) {
      container.innerHTML = '<div class="no-sessions">No simulator sessions yet. Start a Full ADAPT Test!</div>';
      return;
    }

    container.innerHTML = sessions.slice().reverse().map((s, i) => {
      const d     = new Date(s.timestamp);
      const label = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      const rating= ADAPTScoring.getRating(s.composite||0);
      return `
        <div class="session-item">
          <div class="session-rank">${sessions.length - i}</div>
          <div class="session-info">
            <div class="session-score" style="color:${rating.color}">${s.composite}%</div>
            <div class="session-label">${rating.label}</div>
          </div>
          <div class="session-details">
            <span>Eff: ${s.efficiency||'—'}%</span>
            <span>Peak: ${s.peakScore||'—'}</span>
            <span>${Math.floor((s.duration||0)/60)}m ${(s.duration||0)%60}s</span>
          </div>
          <div class="session-date">${label}</div>
        </div>`;
    }).join('');
  }

  /* ─────────────── CLEAR BUTTON ─────────────── */
  function initClearBtn() {
    const btn = $('clear-scores-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (confirm('Clear all saved scores? This cannot be undone.')) {
        ADAPTStorage.clearAll();
        ['dash-multitask','dash-reaction','dash-monitoring','dash-spatial','dash-memory','dash-simulator','dash-overall'].forEach(id => {
          const el = $(id); if (el) { el.textContent = '—'; el.style.color = ''; }
        });
        ['dash-multitask-meta','dash-reaction-meta','dash-monitoring-meta','dash-spatial-meta','dash-memory-meta','dash-simulator-meta','dash-overall-meta'].forEach(id => {
          const el = $(id); if (el) el.textContent = 'No data';
        });
        $('dash-overall-meta').textContent = 'Complete all modules';
        refresh();
      }
    });
  }

  /* ─────────────── INIT ─────────────── */
  function init() {
    initClearBtn();
    refresh();
    window.addEventListener('resize', () => { drawHistoryChart(); drawReactionTrend(); });
  }

  return { init, refresh };
})();
