[README.md](https://github.com/user-attachments/files/26778366/README.md)
# ADAPT — Pilot Aptitude Simulator

A complete web-based pilot selection aptitude test simulator inspired by the real ADAPT system (Symbiotics/Dunes Aviation). Built with pure HTML, CSS, and vanilla JavaScript — no frameworks.

---

## 🚀 Live Features

### ✅ Completed Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | Displays all scores, history chart (canvas), overall rating |
| **Multitasking** | 3 simultaneous tasks: tracking + math + alert reaction (2 min) |
| **Reaction Time** | Green/Red/Yellow/Blue signal response test (90 sec) |
| **Instrument Monitoring** | Cockpit gauge anomaly detection with warning lights (2 min) |
| **Spatial Orientation** | Aircraft bank/pitch identification with 4-choice MCQ (90 sec) |
| **Memory Sequence** | Progressive sequence recall with difficulty scaling (2 min) |

---

## 📁 Project Structure

```
index.html              — Main entry point, all HTML markup
css/
  style.css             — Full cockpit-style CSS (dark/light themes, animations)
js/
  storage.js            — localStorage persistence (ADAPTStorage)
  audio.js              — Web Audio API beep/alert sounds (ADAPTAudio)
  multitask.js          — Triple-task multitasking module (MultitaskModule)
  reaction.js           — Reaction time test module (ReactionModule)
  monitoring.js         — Cockpit instrument monitoring (MonitoringModule)
  spatial.js            — Spatial orientation test (SpatialModule)
  memory.js             — Memory sequence test (MemoryModule)
  dashboard.js          — Dashboard charts & stats (DashboardModule)
  app.js                — Main controller: tabs, theme toggle, keyboard shortcuts
README.md
```

---

## 🎯 How Each Module Works

### Multitasking (2 min)
- **Tracking (40% of score):** Mouse/touch to keep crosshair on a moving red dot. Dot speeds up over time.
- **Math (35% of score):** Arithmetic questions (add/subtract/multiply) with 4 choices. 8-second window.
- **Alert Reaction (25% of score):** Green flash appears randomly — click RESPOND button within 2.5 seconds.
- Final score = weighted composite of all three.

### Reaction Time (90 sec)
- 4 signal types: Green (tap), Red (don't tap), Yellow (press shown key), Blue (double-tap)
- Measures reaction time in milliseconds
- Tracks accuracy, best RT, average RT, false taps

### Instrument Monitoring (2 min)
- 4 gauges: Altitude (2000–8000ft normal), Airspeed (120–280kts normal), Heading, Vertical Speed
- Warning light panel with 6 lights
- Anomalies appear randomly — click the anomalous gauge or lit warning within the window
- Score = caught / total anomalies

### Spatial Orientation (90 sec)
- Aircraft silhouette drawn on canvas with realistic bank+pitch attitude
- Artificial horizon with pitch ladder, bank angle indicator
- 4-choice MCQ — faster answers = more points; streak bonus

### Memory Sequence (2 min)
- Starts at length 3, grows to max 9
- Numbers and letters flash in sequence
- User clicks tiles to reproduce sequence from memory
- 3 lives; difficulty escalates each correct answer

---

## 💾 Data Persistence

Uses `localStorage` key `adapt_scores_v2`. Stores last 20 runs per module.

### Data schema per module:
- **multitask:** `{ composite, trackAcc, mathAcc, alertAcc, avgAlertRT, mathCorrect, mathTotal, alertCorrect, alertTotal, timestamp }`
- **reaction:** `{ accuracy, avgRT, bestRT, attempts, correct, falseTaps, timestamp }`
- **monitoring:** `{ accuracy, avgCatchTime, caught, missed, total, timestamp }`
- **spatial:** `{ score, accuracy, correct, total, maxStreak, timestamp }`
- **memory:** `{ score, level, maxLength, livesLeft, timestamp }`

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Switch to Dashboard |
| `2` | Switch to Multitasking |
| `3` | Switch to Reaction |
| `4` | Switch to Monitoring |
| `5` | Switch to Spatial |
| `6` | Switch to Memory |

Swipe left/right on mobile to change tabs.

---

## 🎨 UI Features

- **Dark/Light mode toggle** (saved in localStorage)
- **Cockpit-style design** with Orbitron and Share Tech Mono fonts
- **Smooth animations** (fade-in, card pop-in, scanline HUD effect)
- **Responsive layout** — works on iPhone, Android, tablet, desktop
- **Animated gauges** drawn on `<canvas>` with realistic needle movement
- **Web Audio API** beeps for alerts, correct/wrong answers, countdown

---

## 📊 Performance Ratings

| Rating | Score |
|--------|-------|
| Exceptional | 90–100% |
| Above Average | 75–89% |
| Average | 55–74% |
| Below Average | < 55% |

---

## 🔮 Possible Future Enhancements

- [ ] Joystick/gamepad support for tracking
- [ ] More complex math (fractions, percentages)
- [ ] ATIS/radio communication simulation module
- [ ] PDF report export
- [ ] Multiplayer leaderboard via API
- [ ] Additional gauge types (turn coordinator, HSI)
- [ ] Progressive difficulty profiles
