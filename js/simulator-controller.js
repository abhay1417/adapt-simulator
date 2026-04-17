const SimulatorController = (() => {

  let isRunning = false;
  let timer = null;
  let timeLeft = 600; // 10 min

  function updateUI(status) {
    const statusLabel = document.getElementById("status-label");
    const statusDot = document.getElementById("status-dot");

    if (statusLabel) statusLabel.textContent = status;
    if (statusDot) statusDot.style.background = status === "RUNNING" ? "green" : "gray";
  }

  function startTimer() {
    const timerEl = document.getElementById("timer");

    timer = setInterval(() => {
      if (timeLeft <= 0) {
        stop();
        alert("Test Finished");
        return;
      }

      timeLeft--;

      const min = Math.floor(timeLeft / 60);
      const sec = timeLeft % 60;

      if (timerEl) {
        timerEl.textContent = `${min}:${sec < 10 ? "0" : ""}${sec}`;
      }
    }, 1000);
  }

  function loadModules() {
    console.log("Modules Loaded");

    const container = document.getElementById("simulator");

    if (container) {
      container.innerHTML = `
        <h2>Simulator Running 🚀</h2>
        <p>Press keys 1-6 to simulate tasks</p>
      `;
    }
  }

  function start() {
    if (isRunning) return;

    console.log("Starting Simulator...");
    isRunning = true;

    updateUI("RUNNING");
    loadModules();
    startTimer();
  }

  function stop() {
    console.log("Stopping Simulator...");
    isRunning = false;

    clearInterval(timer);
    updateUI("STOPPED");
  }

  function init() {
    console.log("Simulator Initialized");

    const startBtn = document.getElementById("sim-start-btn");

    if (startBtn) {
      startBtn.addEventListener("click", start);
    }

    updateUI("READY");
  }

  return {
    init,
    start,
    stop
  };

})();

window.SimulatorController = SimulatorController;
