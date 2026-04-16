/* ═══════════════════════════════════════════════════════════════
   ADAPT — Main App Controller
   Tab navigation · Dark/Light toggle · Module init
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Tab navigation ── */
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  function switchTab(targetId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetId));
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === 'tab-' + targetId);
    });
    // Refresh dashboard when switching to it
    if (targetId === 'dashboard' && window.DashboardModule) {
      window.DashboardModule.refresh();
    }
    // Scroll to top on tab change
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ── Dark / Light toggle ── */
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const html = document.documentElement;

  // Load saved theme
  const savedTheme = localStorage.getItem('adapt_theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);
  themeIcon.textContent = savedTheme === 'dark' ? '☀' : '🌙';

  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    themeIcon.textContent = next === 'dark' ? '☀' : '🌙';
    localStorage.setItem('adapt_theme', next);
    // Redraw canvas elements that depend on theme
    if (window.DashboardModule) setTimeout(() => window.DashboardModule.refresh(), 50);
  });

  /* ── Overlay (result screen) ── */
  const overlay = document.getElementById('overlay');
  const overlayClose = document.getElementById('overlay-close');
  if (overlayClose) {
    overlayClose.addEventListener('click', () => {
      overlay.classList.add('hidden');
      switchTab('dashboard');
    });
  }

  window.showOverlay = function (opts) {
    const { icon = '🏁', title = 'Test Complete', body = '', scores = [] } = opts;
    document.getElementById('overlay-icon').textContent = icon;
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-body').textContent = body;
    const scoresEl = document.getElementById('overlay-scores');
    scoresEl.innerHTML = scores.map(s => `
      <div class="ov-score-item">
        <div class="ov-label">${s.label}</div>
        <div class="ov-val">${s.value}</div>
      </div>
    `).join('');
    overlay.classList.remove('hidden');
  };

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    // Allow typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case '1': switchTab('dashboard'); break;
      case '2': switchTab('multitask'); break;
      case '3': switchTab('reaction'); break;
      case '4': switchTab('monitoring'); break;
      case '5': switchTab('spatial'); break;
      case '6': switchTab('memory'); break;
    }
  });

  /* ── Touch swipe support for tabs ── */
  let touchStartX = 0;
  const tabOrder = ['dashboard', 'multitask', 'reaction', 'monitoring', 'spatial', 'memory'];

  document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 60) return; // ignore small swipes

    const current = document.querySelector('.tab-btn.active')?.dataset.tab;
    const idx = tabOrder.indexOf(current);
    if (diff > 0 && idx < tabOrder.length - 1) switchTab(tabOrder[idx + 1]);
    else if (diff < 0 && idx > 0) switchTab(tabOrder[idx - 1]);
  }, { passive: true });

  /* ── Init all modules ── */
  function initAll() {
    try { MultitaskModule.init(); } catch (e) { console.warn('MultitaskModule init error:', e); }
    try { ReactionModule.init(); } catch (e) { console.warn('ReactionModule init error:', e); }
    try { MonitoringModule.init(); } catch (e) { console.warn('MonitoringModule init error:', e); }
    try { SpatialModule.init(); } catch (e) { console.warn('SpatialModule init error:', e); }
    try { MemoryModule.init(); } catch (e) { console.warn('MemoryModule init error:', e); }
    try { DashboardModule.init(); } catch (e) { console.warn('DashboardModule init error:', e); }
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  /* ── Header scan animation ── */
  const headerTitle = document.querySelector('.logo-adapt');
  if (headerTitle) {
    let scanFrame = 0;
    const scanColors = ['#00e5ff', '#00aaff', '#00ff88', '#ffd600', '#00e5ff'];
    setInterval(() => {
      headerTitle.style.textShadow = `0 0 ${12 + Math.sin(scanFrame * 0.1) * 6}px ${scanColors[scanFrame % scanColors.length]}`;
      scanFrame++;
    }, 200);
  }

  /* ── Prevent zoom on double-tap for canvas/buttons ── */
  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 300 && (e.target.tagName === 'CANVAS' || e.target.classList.contains('btn-primary'))) {
      e.preventDefault();
    }
    lastTap = now;
  }, { passive: false });

  console.log('%cADAPT Simulator v1.0 — Pilot Aptitude Test', 'color:#00e5ff;font-family:monospace;font-size:14px;font-weight:bold;');
  console.log('%cAll modules loaded. Use keys 1-6 to switch tabs.', 'color:#8fa3c9;font-family:monospace;');

})();
