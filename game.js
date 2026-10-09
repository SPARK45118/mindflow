/**
 * MindFlow • Master Game Engine
 * Modes: Multiple Object Tracking, Chroma Shift, Dual N-Back, Zen Flow, Daily Circuit
 */

(function () {
  'use strict';

  // --- STATE & STORAGE ---
  const state = {
    mode: 'circuit', // 'circuit' | 'mot' | 'stroop' | 'nback' | 'zenflow'
    circuitStage: 1, // 1 to 4
    isPlaying: false,
    isPaused: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    totalTrials: 0,
    correctTrials: 0,
    reactionTimes: [],
    timerRemaining: 60,
    timerInterval: null,
    
    // Global User Stats (Persisted)
    userStats: {
      focusScore: 88,
      streak: 1,
      lastPlayedDate: null,
      totalMindfulSeconds: 0,
      totalReactionTimes: []
    }
  };

  // Dynamic API Base URL resolver for decoupled deployment
  function getApiUrl(endpoint) {
    const base = (window.MINDFLOW_API_BASE || '').trim().replace(/\/$/, '');
    return base ? `${base}${endpoint}` : endpoint;
  }

  // Load user stats from localStorage
  function loadPersistedStats() {
    try {
      const saved = localStorage.getItem('mindflow_stats');
      if (saved) {
        state.userStats = JSON.parse(saved);
      }
      // Check streak
      const today = new Date().toDateString();
      if (state.userStats.lastPlayedDate) {
        const last = new Date(state.userStats.lastPlayedDate);
        const diffDays = Math.floor((new Date(today) - last) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          // consecutive day
        } else if (diffDays > 1) {
          state.userStats.streak = 1;
        }
      } else {
        state.userStats.streak = 1;
      }
    } catch (e) {
      console.warn('Storage unavailable', e);
    }
    updateStatsStrip();
  }

  function savePersistedStats() {
    try {
      state.userStats.lastPlayedDate = new Date().toDateString();
      localStorage.setItem('mindflow_stats', JSON.stringify(state.userStats));
    } catch (e) {}
    updateStatsStrip();
  }

  function updateStatsStrip() {
    const scoreEl = document.getElementById('stat-focus-score');
    if (scoreEl) scoreEl.textContent = Math.round(state.userStats.focusScore);
    const streakEl = document.getElementById('stat-streak');
    if (streakEl) streakEl.textContent = `${state.userStats.streak} Days`;
    
    const avgReactions = state.userStats.totalReactionTimes;
    if (avgReactions && avgReactions.length > 0) {
      const avg = Math.round(avgReactions.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, avgReactions.length));
      const rxEl = document.getElementById('stat-reaction');
      if (rxEl) rxEl.textContent = `${avg} ms`;
    }
    
    const minutes = Math.floor((state.userStats.totalMindfulSeconds || 0) / 60);
    const timeEl = document.getElementById('stat-time');
    if (timeEl) timeEl.textContent = `${minutes} min`;

    if (typeof monthActivityController !== 'undefined' && monthActivityController.render) {
      monthActivityController.render();
    }
  }

  // --- AMBIENT CANVAS BACKGROUND ---
  const ambientCanvas = document.getElementById('ambient-canvas');
  const ambientCtx = ambientCanvas.getContext('2d');
  let ambientMotes = [];

  function initAmbientCanvas() {
    function resize() {
      ambientCanvas.width = window.innerWidth;
      ambientCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    ambientMotes = [];
    const count = Math.min(28, Math.floor(window.innerWidth / 45));
    for (let i = 0; i < count; i++) {
      ambientMotes.push({
        x: Math.random() * ambientCanvas.width,
        y: Math.random() * ambientCanvas.height,
        r: Math.random() * 1.4 + 0.6,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.06 - Math.random() * 0.08,
        alpha: Math.random() * 0.18 + 0.05,
        color: '#ede7dc'
      });
    }

    function renderAmbient() {
      ambientCtx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
      ambientMotes.forEach(m => {
        m.x += m.vx;
        m.y += m.vy;
        if (m.x < 0) m.x = ambientCanvas.width;
        if (m.x > ambientCanvas.width) m.x = 0;
        if (m.y < 0) m.y = ambientCanvas.height;
        if (m.y > ambientCanvas.height) m.y = 0;

        ambientCtx.beginPath();
        ambientCtx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ambientCtx.fillStyle = m.color;
        ambientCtx.globalAlpha = m.alpha;
        ambientCtx.fill();
      });
      ambientCtx.globalAlpha = 1.0;
      requestAnimationFrame(renderAmbient);
    }
    requestAnimationFrame(renderAmbient);
  }

  // --- AUDIO UI CONTROLS ---
  function initAudioUI() {
    const btnAmbient = document.getElementById('btn-ambient-sound');
    const ambientText = document.getElementById('ambient-text');
    const btnSettings = document.getElementById('btn-audio-settings');
    const audioDropdown = document.getElementById('audio-dropdown');
    const sliderAmbient = document.getElementById('slider-ambient-vol');
    const sliderSfx = document.getElementById('slider-sfx-vol');
    const lblAmbient = document.getElementById('lbl-ambient-vol');
    const lblSfx = document.getElementById('lbl-sfx-vol');

    btnAmbient.addEventListener('click', () => {
      const playing = window.zenAudio.toggleAmbient();
      btnAmbient.classList.toggle('active', playing);
      ambientText.textContent = playing ? 'Zen Drone ON' : 'Zen Audio';
    });

    btnSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      audioDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!audioDropdown.contains(e.target) && e.target !== btnSettings) {
        audioDropdown.classList.remove('show');
      }
    });

    sliderAmbient.addEventListener('input', (e) => {
      window.zenAudio.setAmbientVolume(e.target.value);
      lblAmbient.textContent = `${Math.round(e.target.value * 100)}%`;
    });

    sliderSfx.addEventListener('input', (e) => {
      window.zenAudio.setSfxVolume(e.target.value);
      lblSfx.textContent = `${Math.round(e.target.value * 100)}%`;
    });
  }

  // =========================================================
  // MODE 1: MULTIPLE OBJECT TRACKING (MOT) - "ORB TRACK"
  // =========================================================
  const MOT = {
    canvas: document.getElementById('active-game-canvas'),
    ctx: null,
    overlay: document.getElementById('canvas-overlay-msg'),
    orbs: [],
    targets: [],
    selectedIndices: new Set(),
    phase: 'idle', // 'memorize' | 'tracking' | 'select' | 'reveal'
    phaseTimer: null,
    numTargets: 3,
    totalOrbs: 9,
    trackingDuration: 6500, // ms
    memorizeDuration: 3000,
    startTime: 0,
    animFrame: null,

    init() {
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());

      // ResizeObserver on the game container and viewport
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
          this.resizeCanvas();
        });
        const vp = document.getElementById('game-viewport');
        if (vp) ro.observe(vp);
        if (this.canvas.parentElement) ro.observe(this.canvas.parentElement);
      }

      this.canvas.addEventListener('click', (e) => this.handleClick(e));
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 0) {
          const rect = this.canvas.getBoundingClientRect();
          const fakeE = {
            clientX: e.touches[0].clientX,
            clientY: e.touches[0].clientY
          };
          this.handleClick(fakeE);
        }
      }, { passive: true });
    },

    resizeCanvas() {
      if (!this.canvas || !this.canvas.parentElement) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      if (this.ctx) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
      }
      this.displayW = rect.width;
      this.displayH = rect.height;
    },

    startRound() {
      this.resizeCanvas();
      this.selectedIndices.clear();
      this.orbs = [];
      const w = this.displayW;
      const h = this.displayH;

      // Adjust difficulty based on score/circuit
      const targetCount = state.combo > 4 ? 4 : 3;
      const totalCount = targetCount + 6 + Math.min(3, Math.floor(state.combo / 3));
      this.numTargets = targetCount;
      this.totalOrbs = totalCount;

      const spiritTypes = ['droplet', 'crystal', 'sprout', 'star'];
      for (let i = 0; i < totalCount; i++) {
        const radius = 20;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.4 + Math.random() * 1.2;
        const st = spiritTypes[i % spiritTypes.length];
        this.orbs.push({
          id: i,
          x: radius + Math.random() * (w - radius * 2),
          y: radius + Math.random() * (h - radius * 2),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: radius,
          isTarget: false,
          spiritType: st,
          bobOffset: Math.random() * Math.PI * 2,
          trail: []
        });
      }

      // Pick random targets
      const targetIndices = [];
      while (targetIndices.length < targetCount) {
        const idx = Math.floor(Math.random() * totalCount);
        if (!targetIndices.includes(idx)) {
          targetIndices.push(idx);
          this.orbs[idx].isTarget = true;
        }
      }
      this.targets = targetIndices;

      // Step 1: Memorize
      this.phase = 'memorize';
      this.overlay.textContent = `Memorize the ${targetCount} highlighted targets...`;
      this.overlay.style.color = '#b86f5a';
      window.zenAudio.playChime(1);

      this.phaseTimer = setTimeout(() => {
        this.startTracking();
      }, this.memorizeDuration);

      this.loop();
    },

    startTracking() {
      this.phase = 'tracking';
      this.overlay.textContent = `Tracking in motion... soften your gaze`;
      this.overlay.style.color = '#ede7dc';
      window.zenAudio.playTap(440);

      this.phaseTimer = setTimeout(() => {
        this.startSelection();
      }, this.trackingDuration);
    },

    startSelection() {
      this.phase = 'select';
      this.startTime = performance.now();
      this.overlay.textContent = `Identify ${this.numTargets} targets (${this.numTargets - this.selectedIndices.size} remaining)`;
      this.overlay.style.color = '#d4cec3';
      window.zenAudio.playChime(3);
    },

    handleClick(e) {
      if (this.phase !== 'select') return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      for (let i = 0; i < this.orbs.length; i++) {
        const orb = this.orbs[i];
        const dist = Math.hypot(orb.x - clickX, orb.y - clickY);
        if (dist <= orb.radius + 14) {
          if (!this.selectedIndices.has(i)) {
            this.selectedIndices.add(i);
            const remaining = this.numTargets - this.selectedIndices.size;
            window.zenAudio.playTap(700 + this.selectedIndices.size * 100);

            if (remaining > 0) {
              this.overlay.textContent = `Select ${remaining} remaining target${remaining > 1 ? 's' : ''}`;
            } else {
              this.evaluateSelection();
            }
          }
          break;
        }
      }
    },

    evaluateSelection() {
      this.phase = 'reveal';
      const reaction = Math.round(performance.now() - this.startTime);
      recordReaction(reaction);

      let correctCount = 0;
      this.selectedIndices.forEach(idx => {
        if (this.orbs[idx].isTarget) {
          correctCount++;
        }
      });

      const perfect = correctCount === this.numTargets;
      if (perfect) {
        this.overlay.textContent = `Clear attention: ${correctCount}/${this.numTargets} targets identified (+${200 + state.combo * 20} pts)`;
        this.overlay.style.color = '#7d9683';
        window.zenAudio.playMilestone();
        addScore(200 + state.combo * 20);
        incCombo();
      } else {
        this.overlay.textContent = `Mindful practice: ${correctCount}/${this.numTargets} identified`;
        this.overlay.style.color = '#9aa199';
        window.zenAudio.playMindfulThud();
        addScore(correctCount * 40);
        resetCombo();
      }

      state.totalTrials++;
      if (perfect) state.correctTrials++;
      updateHUD();

      // Proceed to next round after short reveal
      setTimeout(() => {
        if (state.isPlaying) {
          this.startRound();
        }
      }, 2200);
    },

    loop() {
      if (!state.isPlaying || state.mode !== 'mot' && !(state.mode === 'circuit' && state.circuitStage === 1)) {
        return;
      }
      this.updatePhysics();
      this.draw();
      this.animFrame = requestAnimationFrame(() => this.loop());
    },

    updatePhysics() {
      const w = this.displayW;
      const h = this.displayH;

      this.orbs.forEach(orb => {
        // Only move during memorize and tracking
        if (this.phase === 'memorize' || this.phase === 'tracking') {
          orb.x += orb.vx;
          orb.y += orb.vy;

          // Wall bounce
          if (orb.x < orb.radius) { orb.x = orb.radius; orb.vx *= -1; }
          if (orb.x > w - orb.radius) { orb.x = w - orb.radius; orb.vx *= -1; }
          if (orb.y < orb.radius) { orb.y = orb.radius; orb.vy *= -1; }
          if (orb.y > h - orb.radius) { orb.y = h - orb.radius; orb.vy *= -1; }

          // Record trail
          orb.trail.push({ x: orb.x, y: orb.y });
          if (orb.trail.length > 8) orb.trail.shift();
        }
      });
    },

    draw() {
      const ctx = this.ctx;
      const w = this.displayW;
      const h = this.displayH;
      ctx.clearRect(0, 0, w, h);

      // Draw cute storybook orbs (cartoon forest spirits)
      this.orbs.forEach((orb, idx) => {
        const isSelected = this.selectedIndices.has(idx);
        const bob = Math.sin(performance.now() * 0.004 + orb.bobOffset) * 3;
        const drawX = orb.x;
        const drawY = orb.y + bob;

        ctx.save();

        // Target indicator glow (golden warm aura when memorizing or selected)
        if (this.phase === 'memorize' && orb.isTarget) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, orb.radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 222, 100, 0.45)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(drawX, drawY, orb.radius + 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#dfae67';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (isSelected) {
          ctx.beginPath();
          ctx.arc(drawX, drawY, orb.radius + 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#5a9e87';
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (this.phase === 'reveal') {
          if (orb.isTarget) {
            ctx.beginPath();
            ctx.arc(drawX, drawY, orb.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#48b894';
            ctx.lineWidth = 3;
            ctx.stroke();
          } else if (isSelected && !orb.isTarget) {
            ctx.beginPath();
            ctx.arc(drawX, drawY, orb.radius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = '#d68065';
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }

        // Cute Cartoon Spirit Body
        ctx.beginPath();
        let bodyGrad;
        if (orb.spiritType === 'droplet') {
          bodyGrad = ctx.createLinearGradient(drawX, drawY - orb.radius, drawX, drawY + orb.radius);
          bodyGrad.addColorStop(0, '#7de0f5');
          bodyGrad.addColorStop(1, '#48b7d4');
          ctx.arc(drawX, drawY, orb.radius, 0, Math.PI * 2);
        } else if (orb.spiritType === 'crystal') {
          bodyGrad = ctx.createLinearGradient(drawX, drawY - orb.radius, drawX, drawY + orb.radius);
          bodyGrad.addColorStop(0, '#c79cf0');
          bodyGrad.addColorStop(1, '#9361c9');
          ctx.arc(drawX, drawY, orb.radius, 0, Math.PI * 2);
        } else if (orb.spiritType === 'sprout') {
          bodyGrad = ctx.createLinearGradient(drawX, drawY - orb.radius, drawX, drawY + orb.radius);
          bodyGrad.addColorStop(0, '#86e3be');
          bodyGrad.addColorStop(1, '#4caf8a');
          ctx.arc(drawX, drawY, orb.radius, 0, Math.PI * 2);
        } else {
          bodyGrad = ctx.createLinearGradient(drawX, drawY - orb.radius, drawX, drawY + orb.radius);
          bodyGrad.addColorStop(0, '#fce085');
          bodyGrad.addColorStop(1, '#e6ab37');
          ctx.arc(drawX, drawY, orb.radius, 0, Math.PI * 2);
        }

        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = '#3d3025';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Left Eye
        ctx.beginPath();
        ctx.arc(drawX - 6, drawY - 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#221e1a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX - 7, drawY - 3, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Right Eye
        ctx.beginPath();
        ctx.arc(drawX + 6, drawY - 2, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#221e1a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(drawX + 5, drawY - 3, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Cheeks / Pink Blush
        ctx.beginPath();
        ctx.arc(drawX - 10, drawY + 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 120, 130, 0.65)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(drawX + 10, drawY + 4, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 120, 130, 0.65)';
        ctx.fill();

        // Smiling Mouth
        ctx.beginPath();
        ctx.arc(drawX, drawY + 4, 3.5, 0.1 * Math.PI, 0.9 * Math.PI, false);
        ctx.strokeStyle = '#221e1a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      });
    },

    stop() {
      clearTimeout(this.phaseTimer);
      cancelAnimationFrame(this.animFrame);
    }
  };

  // =========================================================
  // MODE 2: CHROMA SHIFT (STROOP & INHIBITORY CONTROL)
  // =========================================================
  const Chroma = {
    words: [
      { text: 'CLAY', colorKey: 'teal', hex: '#b86f5a' },
      { text: 'SAGE', colorKey: 'rose', hex: '#7d9683' },
      { text: 'SAND', colorKey: 'lavender', hex: '#d4cec3' },
      { text: 'CREAM', colorKey: 'gold', hex: '#ede7dc' }
    ],
    currentStimulus: null,
    currentRule: 'color', // 'color' | 'word' | 'pause'
    timeoutHandle: null,
    animFrame: null,
    stimulusStartTime: 0,
    timeLimit: 2200, // ms per item, scales with difficulty

    init() {
      const btns = document.querySelectorAll('.chroma-choice-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.handleChoice(btn.dataset.choice);
        });
      });

      // Key bindings: 1-4 and Arrow Keys
      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying) return;
        if (state.mode !== 'stroop' && !(state.mode === 'circuit' && state.circuitStage === 2)) return;

        const codeMap = {
          'Digit1': 'teal', 'Numpad1': 'teal', 'ArrowLeft': 'teal',
          'Digit2': 'rose', 'Numpad2': 'rose', 'ArrowUp': 'rose',
          'Digit3': 'lavender', 'Numpad3': 'lavender', 'ArrowDown': 'lavender',
          'Digit4': 'gold', 'Numpad4': 'gold', 'ArrowRight': 'gold'
        };

        const choice = codeMap[e.code] || (e.key === '1' ? 'teal' : e.key === '2' ? 'rose' : e.key === '3' ? 'lavender' : e.key === '4' ? 'gold' : null);

        if (choice) {
          e.preventDefault();
          this.handleChoice(choice);
        }
      });
    },

    start() {
      this.nextTrial();
    },

    nextTrial() {
      clearTimeout(this.timeoutHandle);
      if (!state.isPlaying) return;

      // 70% rule-color, 20% rule-word, 10% inhibitory zen-pause
      const randRule = Math.random();
      if (randRule < 0.65) {
        this.currentRule = 'color';
      } else if (randRule < 0.88) {
        this.currentRule = 'word';
      } else {
        this.currentRule = 'pause';
      }

      this.updateRuleUI();

      // Pick word and ink color (frequently mismatching to trigger Stroop interference)
      const wordObj = this.words[Math.floor(Math.random() * this.words.length)];
      let inkObj;
      if (Math.random() < 0.8) {
        // Mismatch ink
        const otherInks = this.words.filter(w => w.colorKey !== wordObj.colorKey);
        inkObj = otherInks[Math.floor(Math.random() * otherInks.length)];
      } else {
        inkObj = wordObj; // Match occasionally
      }

      this.currentStimulus = {
        wordText: wordObj.text,
        wordKey: wordObj.colorKey,
        inkKey: inkObj.colorKey,
        inkHex: inkObj.hex
      };

      const wordEl = document.getElementById('chroma-word');
      const subEl = document.getElementById('chroma-subtext');

      if (this.currentRule === 'pause') {
        if (wordEl) {
          wordEl.textContent = 'STILLNESS';
          wordEl.style.color = '#b85a5a';
        }
        if (subEl) subEl.textContent = 'Mindful Stillness — Inhibit response. Do not click.';
      } else {
        if (wordEl) {
          wordEl.textContent = this.currentStimulus.wordText;
          wordEl.style.color = this.currentStimulus.inkHex;
        }
        if (subEl) subEl.textContent = this.currentRule === 'color' ? 'Select the Ink Color (ignore word)' : 'Select the Word Text (ignore color)';
      }

      this.stimulusStartTime = performance.now();
      this.timeLimit = Math.max(1300, 2400 - state.combo * 40);

      // Animate progress bar
      const timeBar = document.getElementById('chroma-time-bar');
      if (timeBar) {
        timeBar.style.width = '100%';
        const startT = performance.now();

        const animateBar = () => {
          const elapsed = performance.now() - startT;
          const progress = Math.max(0, 1 - elapsed / this.timeLimit);
          timeBar.style.width = `${progress * 100}%`;
          if (progress > 0 && state.isPlaying) {
            this.animFrame = requestAnimationFrame(animateBar);
          }
        };
        cancelAnimationFrame(this.animFrame);
        this.animFrame = requestAnimationFrame(animateBar);
      }

      // Timeout handler
      this.timeoutHandle = setTimeout(() => {
        this.handleTimeout();
      }, this.timeLimit);
    },

    updateRuleUI() {
      const pill = document.getElementById('chroma-rule-pill');
      const text = document.getElementById('chroma-rule-text');
      const icon = document.getElementById('chroma-rule-icon');

      if (pill) {
        pill.className = 'chroma-rule-pill';
        if (this.currentRule === 'color') {
          pill.classList.add('rule-color');
          if (icon) icon.textContent = '■';
          if (text) text.textContent = 'Rule: Match the Ink Color';
        } else if (this.currentRule === 'word') {
          pill.classList.add('rule-word');
          if (icon) icon.textContent = '■';
          if (text) text.textContent = 'Rule: Match the Word Text';
        } else {
          pill.classList.add('rule-pause');
          if (icon) icon.textContent = '■';
          if (text) text.textContent = 'Stillness: Do Not Respond';
        }
      }
    },

    handleChoice(choiceKey) {
      if (!this.currentStimulus) return;
      clearTimeout(this.timeoutHandle);
      cancelAnimationFrame(this.animFrame);

      const reaction = Math.round(performance.now() - this.stimulusStartTime);
      recordReaction(reaction);

      state.totalTrials++;
      let isCorrect = false;

      if (this.currentRule === 'pause') {
        // Player should NOT have clicked!
        isCorrect = false;
        window.zenAudio.playMindfulThud();
        resetCombo();
      } else if (this.currentRule === 'color') {
        isCorrect = (choiceKey === this.currentStimulus.inkKey);
      } else if (this.currentRule === 'word') {
        isCorrect = (choiceKey === this.currentStimulus.wordKey);
      }

      if (isCorrect) {
        state.correctTrials++;
        const pts = 100 + state.combo * 15;
        addScore(pts);
        incCombo();
        window.zenAudio.playChime(Math.min(7, state.combo));
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
      }

      updateHUD();
      this.nextTrial();
    },

    handleTimeout() {
      state.totalTrials++;
      if (this.currentRule === 'pause') {
        // Successfully inhibited impulse!
        state.correctTrials++;
        const pts = 150 + state.combo * 20;
        addScore(pts);
        incCombo();
        window.zenAudio.playChime(4);
      } else {
        // Missed stimulus
        window.zenAudio.playMindfulThud();
        resetCombo();
      }
      updateHUD();
      this.nextTrial();
    },

    stop() {
      clearTimeout(this.timeoutHandle);
      cancelAnimationFrame(this.animFrame);
    }
  };

  // =========================================================
  // MODE 3: DUAL N-BACK MATRIX
  // =========================================================
  const NBack = {
    n: 2, // 2-Back standard
    history: [], // [{ pos: 0..8, sound: 0..7 }]
    currentIndex: -1,
    stepInterval: 2800, // ms per presentation
    stepTimer: null,
    totalSteps: 20,
    currentStep: 0,
    hasClaimedPos: false,
    hasClaimedSound: false,

    init() {
      const btnPos = document.getElementById('nback-btn-pos');
      const btnSound = document.getElementById('nback-btn-sound');

      btnPos.addEventListener('click', () => this.handlePosMatch());
      btnSound.addEventListener('click', () => this.handleSoundMatch());

      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying) return;
        if (state.mode !== 'nback' && !(state.mode === 'circuit' && state.circuitStage === 3)) return;

        if (e.code === 'KeyA') {
          e.preventDefault();
          this.handlePosMatch();
        } else if (e.code === 'KeyL') {
          e.preventDefault();
          this.handleSoundMatch();
        }
      });
    },

    start() {
      this.history = [];
      this.currentStep = 0;
      this.hasClaimedPos = false;
      this.hasClaimedSound = false;
      document.getElementById('nback-n-label').textContent = `${this.n}-Back`;
      this.step();
    },

    step() {
      clearTimeout(this.stepTimer);
      if (!state.isPlaying) return;

      this.currentStep++;
      document.getElementById('nback-step-counter').textContent = `Step ${this.currentStep} / ${this.totalSteps}`;

      // Reset button highlights
      document.getElementById('nback-btn-pos').classList.remove('active-match');
      document.getElementById('nback-btn-sound').classList.remove('active-match');
      this.hasClaimedPos = false;
      this.hasClaimedSound = false;

      // Generate next stimulus with ~33% chance of match
      let pos = Math.floor(Math.random() * 9);
      let sound = Math.floor(Math.random() * 8);

      if (this.history.length >= this.n) {
        const target = this.history[this.history.length - this.n];
        if (Math.random() < 0.33) pos = target.pos;
        if (Math.random() < 0.33) sound = target.sound;
      }

      const item = { pos, sound };
      this.history.push(item);

      // Light up grid cell
      const cells = document.querySelectorAll('.nback-cell');
      cells.forEach(c => c.classList.remove('active-stimulus'));
      if (cells[pos]) {
        cells[pos].classList.add('active-stimulus');
      }

      // Play sound stimulus
      window.zenAudio.playNBackSound(sound);
      const waveIcon = document.getElementById('nback-sound-indicator');
      waveIcon.classList.add('playing');

      // Clear visual highlight after 1s
      setTimeout(() => {
        cells.forEach(c => c.classList.remove('active-stimulus'));
        waveIcon.classList.remove('playing');
      }, 1100);

      // End or next step
      if (this.currentStep >= this.totalSteps) {
        setTimeout(() => {
          this.evaluateEnd();
        }, this.stepInterval);
      } else {
        this.stepTimer = setTimeout(() => {
          this.evaluateStepEnd();
          this.step();
        }, this.stepInterval);
      }
    },

    handlePosMatch() {
      if (this.hasClaimedPos) return;
      this.hasClaimedPos = true;
      document.getElementById('nback-btn-pos').classList.add('active-match');

      if (this.history.length <= this.n) {
        window.zenAudio.playMindfulThud();
        return;
      }

      const current = this.history[this.history.length - 1];
      const target = this.history[this.history.length - 1 - this.n];
      state.totalTrials++;

      if (current.pos === target.pos) {
        state.correctTrials++;
        addScore(120 + state.combo * 10);
        incCombo();
        window.zenAudio.playChime(3);
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
      }
      updateHUD();
    },

    handleSoundMatch() {
      if (this.hasClaimedSound) return;
      this.hasClaimedSound = true;
      document.getElementById('nback-btn-sound').classList.add('active-match');

      if (this.history.length <= this.n) {
        window.zenAudio.playMindfulThud();
        return;
      }

      const current = this.history[this.history.length - 1];
      const target = this.history[this.history.length - 1 - this.n];
      state.totalTrials++;

      if (current.sound === target.sound) {
        state.correctTrials++;
        addScore(120 + state.combo * 10);
        incCombo();
        window.zenAudio.playChime(5);
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
      }
      updateHUD();
    },

    evaluateStepEnd() {
      // Check if user missed an actual match without pressing
      if (this.history.length > this.n) {
        const current = this.history[this.history.length - 1];
        const target = this.history[this.history.length - 1 - this.n];

        if (current.pos === target.pos && !this.hasClaimedPos) {
          state.totalTrials++;
          resetCombo();
        }
        if (current.sound === target.sound && !this.hasClaimedSound) {
          state.totalTrials++;
          resetCombo();
        }
      }
      updateHUD();
    },

    evaluateEnd() {
      if (state.mode === 'circuit') {
        nextCircuitStage();
      } else {
        finishSession();
      }
    },

    stop() {
      clearTimeout(this.stepTimer);
      const cells = document.querySelectorAll('.nback-cell');
      cells.forEach(c => c.classList.remove('active-stimulus'));
    }
  };

  // =========================================================
  // MODE 4: ZEN FLOW & RHYTHM AIM + BREATH PACER
  // =========================================================
  const ZenFlow = {
    canvas: document.getElementById('active-game-canvas'),
    ctx: null,
    overlay: document.getElementById('canvas-overlay-msg'),
    rings: [],
    spawnTimer: null,
    animFrame: null,
    breathInterval: null,
    breathPhase: 'inhale', // 'inhale' | 'hold1' | 'exhale' | 'hold2'
    breathSeconds: 4,

    init() {
      this.ctx = this.canvas.getContext('2d');
      this.canvas.addEventListener('click', (e) => this.handleClick(e));
      this.canvas.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 0) {
          const fakeE = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
          this.handleClick(fakeE);
        }
      }, { passive: true });
    },

    start() {
      MOT.resizeCanvas();
      this.rings = [];
      this.overlay.textContent = 'Harmonize with the collapsing ripples at peak resonance';
      this.overlay.style.color = '#4ecdc4';
      document.getElementById('breath-pacer-container').style.display = 'flex';

      this.startBreathPacer();
      this.scheduleNextSpawn();
      this.loop();
    },

    startBreathPacer() {
      const circle = document.getElementById('breath-circle');
      const label = document.getElementById('breath-phase-label');
      let step = 0;

      const phases = [
        { name: 'Inhale...', transform: 'scale(1.9)', cue: 'inhale' },
        { name: 'Hold Presence...', transform: 'scale(1.9)', cue: 'hold' },
        { name: 'Exhale Slowly...', transform: 'scale(1.0)', cue: 'exhale' },
        { name: 'Rest in Stillness...', transform: 'scale(1.0)', cue: 'hold' }
      ];

      this.breathInterval = setInterval(() => {
        const current = phases[step];
        label.textContent = `${current.name} (4s)`;
        circle.style.transform = current.transform;
        window.zenAudio.playBreathCue(current.cue);
        step = (step + 1) % phases.length;
      }, 4000);

      // Trigger first immediately
      label.textContent = 'Inhale... (4s)';
      circle.style.transform = 'scale(1.9)';
      window.zenAudio.playBreathCue('inhale');
    },

    scheduleNextSpawn() {
      if (!state.isPlaying) return;
      const delay = Math.max(900, 1600 - state.combo * 40);
      this.spawnTimer = setTimeout(() => {
        this.spawnRing();
        this.scheduleNextSpawn();
      }, delay);
    },

    spawnRing() {
      const w = MOT.displayW;
      const h = MOT.displayH;
      const margin = 80;

      const x = margin + Math.random() * (w - margin * 2);
      const y = margin + Math.random() * (h - margin * 2);
      const targetRadius = 26;
      const startRadius = 80;
      const duration = 1800; // ms to collapse

      this.rings.push({
        x, y,
        targetRadius,
        outerRadius: startRadius,
        startRadius,
        spawnTime: performance.now(),
        duration,
        color: ['#b86f5a', '#7d9683', '#d4cec3', '#ede7dc'][Math.floor(Math.random() * 4)],
        active: true
      });
    },

    handleClick(e) {
      if (!state.isPlaying) return;
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let hitRing = null;
      let minDiff = Infinity;

      for (let i = this.rings.length - 1; i >= 0; i--) {
        const ring = this.rings[i];
        if (!ring.active) continue;
        const dist = Math.hypot(ring.x - clickX, ring.y - clickY);
        if (dist <= ring.targetRadius + 22) {
          const diff = Math.abs(ring.outerRadius - ring.targetRadius);
          if (diff < minDiff) {
            minDiff = diff;
            hitRing = ring;
          }
        }
      }

      if (hitRing) {
        hitRing.active = false;
        state.totalTrials++;
        state.correctTrials++;

        // Calculate precision timing
        if (minDiff < 8) {
          // Zen Resonance!
          addScore(180 + state.combo * 20);
          incCombo();
          window.zenAudio.playChime(6);
          this.overlay.textContent = 'Harmonious resonance (+200)';
          this.overlay.style.color = '#7d9683';
        } else if (minDiff < 18) {
          // Great
          addScore(100 + state.combo * 10);
          incCombo();
          window.zenAudio.playChime(3);
          this.overlay.textContent = 'Gentle timing (+100)';
          this.overlay.style.color = '#ede7dc';
        } else {
          // Good
          addScore(50);
          window.zenAudio.playTap(520);
        }
        updateHUD();
      }
    },

    loop() {
      if (!state.isPlaying || state.mode !== 'zenflow' && !(state.mode === 'circuit' && state.circuitStage === 4)) {
        return;
      }
      this.update();
      this.draw();
      this.animFrame = requestAnimationFrame(() => this.loop());
    },

    update() {
      const now = performance.now();
      this.rings.forEach(ring => {
        if (!ring.active) return;
        const elapsed = now - ring.spawnTime;
        const progress = elapsed / ring.duration;
        ring.outerRadius = ring.startRadius - progress * (ring.startRadius - ring.targetRadius);

        // If collapsed past target by too much, mark expired
        if (ring.outerRadius < ring.targetRadius - 14) {
          ring.active = false;
          state.totalTrials++;
          resetCombo();
          updateHUD();
        }
      });

      this.rings = this.rings.filter(r => r.active || (now - r.spawnTime < r.duration + 400));
    },

    draw() {
      const ctx = this.ctx;
      const w = MOT.displayW;
      const h = MOT.displayH;
      ctx.clearRect(0, 0, w, h);

      this.rings.forEach(ring => {
        if (!ring.active) return;

        // Draw inner target ring (flatter, hairline graphic)
        ctx.save();
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.targetRadius, 0, Math.PI * 2);
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 1.75;
        ctx.stroke();

        // Inner core
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = ring.color;
        ctx.fill();

        // Draw collapsing outer ring (crisp hairline)
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, Math.max(2, ring.outerRadius), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      });
    },

    stop() {
      clearTimeout(this.spawnTimer);
      clearInterval(this.breathInterval);
      cancelAnimationFrame(this.animFrame);
      document.getElementById('breath-pacer-container').style.display = 'none';
    }
  };

  // =========================================================
  // MODE 6: FLANKER HORIZON (DIRECTIONAL SELECTIVE FILTERING)
  // =========================================================
  const Flanker = {
    targetDir: 'left', // 'left' | 'right'
    timeoutHandle: null,
    animFrame: null,
    stimulusStartTime: 0,
    timeLimit: 1700,

    init() {
      const btnL = document.getElementById('flanker-btn-left');
      const btnR = document.getElementById('flanker-btn-right');
      if (btnL) btnL.addEventListener('click', () => this.handleChoice('left'));
      if (btnR) btnR.addEventListener('click', () => this.handleChoice('right'));

      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying || state.mode !== 'flanker') return;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          this.handleChoice('left');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          this.handleChoice('right');
        }
      });
    },

    start() {
      this.nextTrial();
    },

    nextTrial() {
      clearTimeout(this.timeoutHandle);
      cancelAnimationFrame(this.animFrame);
      if (!state.isPlaying) return;

      this.targetDir = Math.random() < 0.5 ? 'left' : 'right';
      const isCongruent = Math.random() < 0.5;
      const distractorDir = isCongruent ? this.targetDir : (this.targetDir === 'left' ? 'right' : 'left');

      const targetGlyph = this.targetDir === 'left' ? '‹' : '›';
      const distractorGlyph = distractorDir === 'left' ? '‹' : '›';

      const arrowsContainer = document.getElementById('flanker-arrows');
      if (arrowsContainer) {
        arrowsContainer.innerHTML = `
          <span class="flanker-arrow flanker-distractor">${distractorGlyph}</span>
          <span class="flanker-arrow flanker-distractor">${distractorGlyph}</span>
          <span class="flanker-arrow flanker-target" id="flanker-target-arrow">${targetGlyph}</span>
          <span class="flanker-arrow flanker-distractor">${distractorGlyph}</span>
          <span class="flanker-arrow flanker-distractor">${distractorGlyph}</span>
        `;
      }

      this.stimulusStartTime = performance.now();
      this.timeLimit = Math.max(1000, 2000 - state.combo * 35);

      const timeBar = document.getElementById('flanker-time-bar');
      if (timeBar) {
        timeBar.style.width = '100%';
        const startT = performance.now();
        const animateBar = () => {
          const elapsed = performance.now() - startT;
          const progress = Math.max(0, 1 - elapsed / this.timeLimit);
          timeBar.style.width = `${progress * 100}%`;
          if (progress > 0 && state.isPlaying) {
            this.animFrame = requestAnimationFrame(animateBar);
          }
        };
        cancelAnimationFrame(this.animFrame);
        this.animFrame = requestAnimationFrame(animateBar);
      }

      this.timeoutHandle = setTimeout(() => this.handleTimeout(), this.timeLimit);
    },

    handleChoice(dir) {
      clearTimeout(this.timeoutHandle);
      cancelAnimationFrame(this.animFrame);

      const reaction = Math.round(performance.now() - this.stimulusStartTime);
      recordReaction(reaction);
      state.totalTrials++;

      if (dir === this.targetDir) {
        state.correctTrials++;
        addScore(100 + state.combo * 12);
        incCombo();
        window.zenAudio.playChime(Math.min(7, state.combo));
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
      }
      updateHUD();
      this.nextTrial();
    },

    handleTimeout() {
      state.totalTrials++;
      window.zenAudio.playMindfulThud();
      resetCombo();
      updateHUD();
      this.nextTrial();
    },

    stop() {
      clearTimeout(this.timeoutHandle);
      cancelAnimationFrame(this.animFrame);
    }
  };

  // =========================================================
  // MODE 7: GAZE ANCHOR (ANTI-SACCADE REFLEX SUPPRESSION)
  // =========================================================
  const Gaze = {
    phase: 'wait', // 'wait' | 'flash'
    flashSide: 'left',
    targetSide: 'right',
    waitTimer: null,
    flashTimer: null,
    stimulusStartTime: 0,
    reflexWindow: 550,

    init() {
      const leftTarget = document.getElementById('gaze-target-left');
      const rightTarget = document.getElementById('gaze-target-right');
      if (leftTarget) leftTarget.addEventListener('click', () => this.handleChoice('left'));
      if (rightTarget) rightTarget.addEventListener('click', () => this.handleChoice('right'));

      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying || state.mode !== 'gaze') return;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          this.handleChoice('left');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          this.handleChoice('right');
        }
      });
    },

    start() {
      this.nextTrial();
    },

    nextTrial() {
      clearTimeout(this.waitTimer);
      clearTimeout(this.flashTimer);
      if (!state.isPlaying) return;

      this.phase = 'wait';
      const leftBox = document.getElementById('gaze-target-left');
      const rightBox = document.getElementById('gaze-target-right');
      const msg = document.getElementById('gaze-center-msg');
      if (leftBox) leftBox.className = 'gaze-sensor-box gaze-left';
      if (rightBox) rightBox.className = 'gaze-sensor-box gaze-right';
      if (msg) msg.textContent = 'Anchor Gaze Center';

      // Random wait between 1200ms and 2400ms
      const delay = 1200 + Math.random() * 1200;
      this.waitTimer = setTimeout(() => {
        if (!state.isPlaying) return;
        this.phase = 'flash';
        this.flashSide = Math.random() < 0.5 ? 'left' : 'right';
        this.targetSide = (this.flashSide === 'left') ? 'right' : 'left';

        const flashEl = document.getElementById(`gaze-target-${this.flashSide}`);
        const targetEl = document.getElementById(`gaze-target-${this.targetSide}`);
        if (flashEl) flashEl.classList.add('flash-cue');
        if (targetEl) targetEl.classList.add('anti-target');

        window.zenAudio.playReflexWhoosh(this.flashSide === 'left' ? -1 : 1);
        this.stimulusStartTime = performance.now();
        if (msg) msg.textContent = 'Strike Opposite!';

        this.reflexWindow = Math.max(380, 600 - state.combo * 15);
        this.flashTimer = setTimeout(() => this.handleTimeout(), this.reflexWindow);
      }, delay);
    },

    handleChoice(side) {
      if (this.phase === 'wait') {
        clearTimeout(this.waitTimer);
        window.zenAudio.playMindfulThud();
        resetCombo();
        updateHUD();
        const msg = document.getElementById('gaze-center-msg');
        if (msg) msg.textContent = 'Premature — Wait for Cue';
        setTimeout(() => this.nextTrial(), 900);
        return;
      }

      clearTimeout(this.flashTimer);
      const reaction = Math.round(performance.now() - this.stimulusStartTime);
      recordReaction(reaction);
      state.totalTrials++;

      if (side === this.targetSide) {
        state.correctTrials++;
        addScore(130 + state.combo * 15);
        incCombo();
        window.zenAudio.playChime(Math.min(7, state.combo));
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
      }
      updateHUD();
      this.nextTrial();
    },

    handleTimeout() {
      state.totalTrials++;
      window.zenAudio.playMindfulThud();
      resetCombo();
      updateHUD();
      const msg = document.getElementById('gaze-center-msg');
      if (msg) msg.textContent = 'Lapse — Window Closed';
      setTimeout(() => this.nextTrial(), 600);
    },

    stop() {
      clearTimeout(this.waitTimer);
      clearTimeout(this.flashTimer);
    }
  };

  // =========================================================
  // MODE 8: CORSI MATRIX (SPATIAL WORKING MEMORY TRAIL)
  // =========================================================
  const Corsi = {
    span: 3,
    sequence: [],
    userStep: 0,
    isPlayingPath: false,
    timer: null,

    init() {
      const stones = document.querySelectorAll('.corsi-stone');
      stones.forEach(stone => {
        stone.addEventListener('click', () => {
          this.handleStoneClick(parseInt(stone.dataset.idx, 10));
        });
      });
    },

    start() {
      this.span = 3;
      this.startRound();
    },

    startRound() {
      clearTimeout(this.timer);
      if (!state.isPlaying) return;

      this.isPlayingPath = true;
      this.userStep = 0;
      this.sequence = [];

      const spanLabel = document.getElementById('corsi-span-label');
      const phaseInd = document.getElementById('corsi-phase-indicator');
      if (spanLabel) spanLabel.textContent = `${this.span} Stones`;
      if (phaseInd) {
        phaseInd.textContent = 'Observing Spatial Path...';
        phaseInd.style.color = 'var(--accent-clay)';
      }

      let last = -1;
      for (let i = 0; i < this.span; i++) {
        let next;
        do {
          next = Math.floor(Math.random() * 9);
        } while (next === last);
        this.sequence.push(next);
        last = next;
      }

      let stepIdx = 0;
      const playStep = () => {
        if (!state.isPlaying) return;
        if (stepIdx < this.sequence.length) {
          const stoneIdx = this.sequence[stepIdx];
          const stoneEl = document.querySelector(`.corsi-stone[data-idx="${stoneIdx}"]`);
          if (stoneEl) {
            stoneEl.classList.add('lit');
            window.zenAudio.playStoneTone(stepIdx);
            setTimeout(() => {
              stoneEl.classList.remove('lit');
            }, 420);
          }
          stepIdx++;
          this.timer = setTimeout(playStep, 700);
        } else {
          this.isPlayingPath = false;
          if (phaseInd) {
            phaseInd.textContent = 'Your Turn: Retrace Path';
            phaseInd.style.color = 'var(--accent-sage)';
          }
        }
      };

      this.timer = setTimeout(playStep, 600);
    },

    handleStoneClick(idx) {
      if (this.isPlayingPath || !state.isPlaying) return;

      const expected = this.sequence[this.userStep];
      const stoneEl = document.querySelector(`.corsi-stone[data-idx="${idx}"]`);

      if (idx === expected) {
        if (stoneEl) {
          stoneEl.classList.add('user-hit');
          setTimeout(() => stoneEl.classList.remove('user-hit'), 250);
        }
        window.zenAudio.playStoneTone(this.userStep);
        this.userStep++;

        if (this.userStep >= this.sequence.length) {
          state.totalTrials++;
          state.correctTrials++;
          addScore(150 * this.span + state.combo * 20);
          incCombo();
          updateHUD();
          window.zenAudio.playMilestone();

          this.span = Math.min(8, this.span + 1);
          const phaseInd = document.getElementById('corsi-phase-indicator');
          if (phaseInd) phaseInd.textContent = 'Harmonious Recall (+Points)';

          this.timer = setTimeout(() => this.startRound(), 1200);
        }
      } else {
        if (stoneEl) {
          stoneEl.classList.add('error');
          setTimeout(() => stoneEl.classList.remove('error'), 450);
        }
        state.totalTrials++;
        window.zenAudio.playMindfulThud();
        resetCombo();
        updateHUD();

        this.span = Math.max(3, this.span - 1);
        const phaseInd = document.getElementById('corsi-phase-indicator');
        if (phaseInd) phaseInd.textContent = 'Path Diverged — Recalibrating';

        this.timer = setTimeout(() => this.startRound(), 1200);
      }
    },

    stop() {
      clearTimeout(this.timer);
      this.isPlayingPath = false;
      document.querySelectorAll('.corsi-stone').forEach(s => {
        s.classList.remove('lit', 'user-hit', 'error');
      });
    }
  };

  // =========================================================
  // MODE 9: SIGNAL & VOID (PSYCHOMOTOR VIGILANCE)
  // =========================================================
  const PVT = {
    state: 'idle', // 'idle' | 'waiting' | 'active'
    waitTimer: null,
    chronoInterval: null,
    signalStartTime: 0,

    init() {
      const arena = document.getElementById('pvt-click-area');
      if (arena) arena.addEventListener('click', () => this.handleAction());

      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying || state.mode !== 'pvt') return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.handleAction();
        }
      });
    },

    start() {
      this.nextTrial();
    },

    nextTrial() {
      clearTimeout(this.waitTimer);
      clearInterval(this.chronoInterval);
      if (!state.isPlaying) return;

      this.state = 'waiting';
      const core = document.getElementById('pvt-target-circle');
      const display = document.getElementById('pvt-timer-display');
      const prompt = document.getElementById('pvt-prompt-text');

      if (core) core.className = 'pvt-aperture-core';
      if (display) display.textContent = 'REST';
      if (prompt) prompt.textContent = 'Maintain still peripheral presence...';

      const delay = 2400 + Math.random() * 4100;
      this.waitTimer = setTimeout(() => {
        if (!state.isPlaying) return;
        this.state = 'active';
        this.signalStartTime = performance.now();
        if (core) core.classList.add('active-signal');
        if (prompt) prompt.textContent = 'SIGNAL DETECTED — TAP NOW';
        window.zenAudio.playAperturePing();

        this.chronoInterval = setInterval(() => {
          if (display) {
            const elapsed = Math.round(performance.now() - this.signalStartTime);
            display.textContent = `${elapsed} ms`;
          }
        }, 16);
      }, delay);
    },

    handleAction() {
      if (!state.isPlaying) return;

      if (this.state === 'waiting') {
        clearTimeout(this.waitTimer);
        this.state = 'idle';
        const core = document.getElementById('pvt-target-circle');
        const display = document.getElementById('pvt-timer-display');
        const prompt = document.getElementById('pvt-prompt-text');

        if (core) core.classList.add('premature');
        if (display) display.textContent = 'PREMATURE';
        if (prompt) prompt.textContent = 'Impulse triggered before signal';

        state.totalTrials++;
        window.zenAudio.playMindfulThud();
        resetCombo();
        updateHUD();

        setTimeout(() => this.nextTrial(), 1400);
      } else if (this.state === 'active') {
        clearInterval(this.chronoInterval);
        this.state = 'idle';
        const reaction = Math.round(performance.now() - this.signalStartTime);
        recordReaction(reaction);

        const display = document.getElementById('pvt-timer-display');
        const prompt = document.getElementById('pvt-prompt-text');
        if (display) display.textContent = `${reaction} ms`;

        state.totalTrials++;
        state.correctTrials++;

        let pts = 100;
        if (reaction < 260) {
          pts = 220;
          if (prompt) prompt.textContent = 'Ultra-crisp vigilance!';
        } else if (reaction < 350) {
          pts = 160;
          if (prompt) prompt.textContent = 'Swift, attentive response';
        } else {
          pts = 90;
          if (prompt) prompt.textContent = 'Gentle detection';
        }

        addScore(pts + state.combo * 15);
        incCombo();
        window.zenAudio.playChime(Math.min(7, state.combo));
        updateHUD();

        setTimeout(() => this.nextTrial(), 1200);
      }
    },

    stop() {
      clearTimeout(this.waitTimer);
      clearInterval(this.chronoInterval);
      this.state = 'idle';
    }
  };

  // =========================================================
  // MODE 10: EQUILIBRIUM (SOMATIC MOTOR STILLNESS)
  // =========================================================
  const Equilibrium = {
    canvas: null,
    ctx: null,
    droplet: { x: 0, y: 0, vx: 0, vy: 0, radius: 10 },
    target: { x: 0, y: 0, safeRadius: 60, outerRadius: 140 },
    mouse: { x: 0, y: 0 },
    steadiness: 50,
    animFrame: null,
    lastTime: 0,
    scoreAccumulator: 0,

    init() {
      this.canvas = document.getElementById('active-game-canvas');
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        const onMove = (e) => {
          if (!state.isPlaying || state.mode !== 'equilibrium') return;
          const rect = this.canvas.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          this.mouse.x = (clientX - rect.left) * (this.canvas.width / rect.width);
          this.mouse.y = (clientY - rect.top) * (this.canvas.height / rect.height);
        };
        this.canvas.addEventListener('mousemove', onMove);
        this.canvas.addEventListener('touchmove', onMove, { passive: true });
      }
    },

    start() {
      MOT.resizeCanvas();
      const w = this.canvas.width;
      const h = this.canvas.height;
      this.target.x = w / 2;
      this.target.y = h / 2;
      this.droplet.x = w / 2;
      this.droplet.y = h / 2;
      this.droplet.vx = 0;
      this.droplet.vy = 0;
      this.mouse.x = w / 2;
      this.mouse.y = h / 2;
      this.steadiness = 50;
      this.lastTime = performance.now();
      this.scoreAccumulator = 0;

      const fill = document.getElementById('equilibrium-gauge-fill');
      const pct = document.getElementById('equilibrium-percent');
      if (fill) fill.style.width = '50%';
      if (pct) pct.textContent = '50%';

      this.loop();
    },

    loop() {
      if (!state.isPlaying || state.mode !== 'equilibrium') return;
      this.update();
      this.draw();
      this.animFrame = requestAnimationFrame(() => this.loop());
    },

    update() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      const driftAngle = now * 0.0018;
      const driftX = Math.cos(driftAngle * 1.7) * 45;
      const driftY = Math.sin(driftAngle * 2.3) * 45;

      const dx = this.mouse.x - this.droplet.x;
      const dy = this.mouse.y - this.droplet.y;
      const pullForce = 3.2;

      this.droplet.vx += (dx * pullForce + driftX) * dt;
      this.droplet.vy += (dy * pullForce + driftY) * dt;

      this.droplet.vx *= 0.94;
      this.droplet.vy *= 0.94;

      this.droplet.x += this.droplet.vx * dt * 60;
      this.droplet.y += this.droplet.vy * dt * 60;

      const distFromCenter = Math.hypot(this.droplet.x - this.target.x, this.droplet.y - this.target.y);

      if (distFromCenter < this.target.safeRadius) {
        this.steadiness = Math.min(100, this.steadiness + 12 * dt);
        this.scoreAccumulator += dt;
        if (this.scoreAccumulator > 1) {
          this.scoreAccumulator = 0;
          addScore(30 + Math.round(this.steadiness));
          incCombo();
          if (this.steadiness > 85) {
            window.zenAudio.playChime(5);
          }
          updateHUD();
        }
      } else {
        this.steadiness = Math.max(0, this.steadiness - 22 * dt);
        if (distFromCenter > this.target.outerRadius) {
          resetCombo();
          updateHUD();
        }
      }

      const fill = document.getElementById('equilibrium-gauge-fill');
      const pct = document.getElementById('equilibrium-percent');
      const roundVal = Math.round(this.steadiness);
      if (fill) fill.style.width = `${roundVal}%`;
      if (pct) pct.textContent = `${roundVal}%`;
    },

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cx = this.target.x;
      const cy = this.target.y;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, this.target.outerRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(235, 229, 218, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, this.target.safeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = (this.steadiness > 70) ? 'rgba(125, 150, 131, 0.6)' : 'rgba(184, 111, 90, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
      ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
      ctx.strokeStyle = 'rgba(235, 229, 218, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(this.droplet.x, this.droplet.y, this.droplet.radius, 0, Math.PI * 2);
      ctx.fillStyle = (this.steadiness > 70) ? '#7d9683' : '#b86f5a';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.droplet.x, this.droplet.y, this.droplet.radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ede7dc';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    },

    stop() {
      cancelAnimationFrame(this.animFrame);
    }
  };

  // =========================================================
  // MODE 11: TEMPO LOCK (INTERNAL RHYTHMIC CLOCK)
  // =========================================================
  const TempoLock = {
    bpm: 60,
    intervalMs: 1000,
    beatCount: 0,
    phase: 'calibration', // 'calibration' | 'silent'
    nextExpectedTime: 0,
    silentTapsDone: 0,
    timer: null,

    init() {
      const tapBtn = document.getElementById('tempo-tap-btn');
      if (tapBtn) tapBtn.addEventListener('click', () => this.handleTap());

      window.addEventListener('keydown', (e) => {
        if (!state.isPlaying || state.mode !== 'tempo') return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.handleTap();
        }
      });
    },

    start() {
      clearTimeout(this.timer);
      this.beatCount = 0;
      this.silentTapsDone = 0;
      this.phase = 'calibration';
      this.runCalibration();
    },

    runCalibration() {
      if (!state.isPlaying) return;
      this.beatCount++;

      const ring = document.getElementById('tempo-pulse-ring');
      const label = document.getElementById('tempo-beat-label');
      const feedback = document.getElementById('tempo-feedback-msg');

      if (ring) {
        ring.classList.add('pulsing');
        setTimeout(() => ring.classList.remove('pulsing'), 180);
      }

      window.zenAudio.playTick(this.beatCount === 1);

      if (label) label.textContent = `Calibration: Beat ${this.beatCount} of 4`;
      if (feedback) feedback.textContent = 'Absorb the steady tempo into your breath...';

      if (this.beatCount < 4) {
        this.timer = setTimeout(() => this.runCalibration(), this.intervalMs);
      } else {
        this.timer = setTimeout(() => {
          this.phase = 'silent';
          this.nextExpectedTime = performance.now() + this.intervalMs;
          if (label) label.textContent = 'Silent Phase: Tap 1 of 8';
          if (feedback) feedback.textContent = 'Metronome silenced. Tap the Spacebar on the rhythm.';
        }, this.intervalMs);
      }
    },

    handleTap() {
      if (!state.isPlaying) return;

      const now = performance.now();
      const ring = document.getElementById('tempo-pulse-ring');
      if (ring) {
        ring.classList.add('pulsing');
        setTimeout(() => ring.classList.remove('pulsing'), 140);
      }

      if (this.phase === 'calibration') {
        window.zenAudio.playTap(440);
        return;
      }

      this.silentTapsDone++;
      const delta = Math.round(now - this.nextExpectedTime);
      this.nextExpectedTime = now + this.intervalMs;

      const absDelta = Math.abs(delta);
      const label = document.getElementById('tempo-beat-label');
      const feedback = document.getElementById('tempo-feedback-msg');

      state.totalTrials++;
      if (absDelta < 90) {
        state.correctTrials++;
        addScore(140 + state.combo * 15);
        incCombo();
        window.zenAudio.playChime(Math.min(7, state.combo));
        if (feedback) feedback.textContent = `${delta > 0 ? '+' : ''}${delta} ms — Harmonious Synchrony!`;
      } else if (absDelta < 180) {
        state.correctTrials++;
        addScore(70);
        window.zenAudio.playTap(520);
        if (feedback) feedback.textContent = `${delta > 0 ? '+' : ''}${delta} ms — Slight ${delta > 0 ? 'Drag' : 'Rush'}`;
      } else {
        window.zenAudio.playMindfulThud();
        resetCombo();
        if (feedback) feedback.textContent = `${delta > 0 ? '+' : ''}${delta} ms — Drifting from Tempo`;
      }

      updateHUD();
      if (label) label.textContent = `Silent Phase: Tap ${this.silentTapsDone} of 8`;

      if (this.silentTapsDone >= 8) {
        window.zenAudio.playMilestone();
        if (feedback) feedback.textContent = 'Internal clock series completed! Recalibrating...';
        this.timer = setTimeout(() => this.start(), 1800);
      }
    },

    stop() {
      clearTimeout(this.timer);
      this.phase = 'calibration';
    }
  };

  // =========================================================
  // GLOBAL HUD, CIRCUIT & MODE CONTROLLER
  // =========================================================

  function addScore(pts) {
    state.score += pts;
  }

  function incCombo() {
    state.combo++;
    if (state.combo > state.maxCombo) {
      state.maxCombo = state.combo;
    }
  }

  function resetCombo() {
    state.combo = 0;
  }

  function recordReaction(ms) {
    if (ms > 100 && ms < 3000) {
      state.reactionTimes.push(ms);
      state.userStats.totalReactionTimes.push(ms);
    }
  }

  function updateHUD() {
    document.getElementById('hud-score').textContent = state.score.toLocaleString();
    document.getElementById('hud-streak').textContent = `${state.combo}x`;

    const acc = state.totalTrials > 0
      ? Math.round((state.correctTrials / state.totalTrials) * 100)
      : 100;
    document.getElementById('hud-accuracy').textContent = `${acc}%`;
  }

  function setMode(modeKey) {
    // Switch tabs
    document.querySelectorAll('.mode-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === modeKey);
    });

    state.mode = modeKey;
    state.circuitStage = 1;
    stopCurrentGame();
    setupStageUI();
  }

  function setupStageUI() {
    const canvasWrap = document.getElementById('canvas-game-wrapper');
    const chromaWrap = document.getElementById('chroma-game-wrapper');
    const nbackWrap = document.getElementById('nback-game-wrapper');
    const flankerWrap = document.getElementById('flanker-game-wrapper');
    const gazeWrap = document.getElementById('gaze-game-wrapper');
    const corsiWrap = document.getElementById('corsi-game-wrapper');
    const pvtWrap = document.getElementById('pvt-game-wrapper');
    const tempoWrap = document.getElementById('tempo-game-wrapper');
    const eqHud = document.getElementById('equilibrium-hud-bar');

    const introOverlay = document.getElementById('stage-intro-overlay');
    const stageTitle = document.getElementById('stage-title-text');
    const stageBadge = document.getElementById('stage-level-badge');
    const introTitle = document.getElementById('intro-title');
    const introDesc = document.getElementById('intro-desc');
    const introIcon = document.getElementById('intro-icon');
    const introInstructions = document.getElementById('intro-instructions');

    if (introOverlay) {
      introOverlay.classList.remove('hidden');
      introOverlay.style.display = 'flex';
    }

    // Hide all viewports initially
    canvasWrap.style.display = 'none';
    chromaWrap.style.display = 'none';
    nbackWrap.style.display = 'none';
    if (flankerWrap) flankerWrap.style.display = 'none';
    if (gazeWrap) gazeWrap.style.display = 'none';
    if (corsiWrap) corsiWrap.style.display = 'none';
    if (pvtWrap) pvtWrap.style.display = 'none';
    if (tempoWrap) tempoWrap.style.display = 'none';
    const phaseTracker = document.querySelector('.phase-progress-tracker');
    if (phaseTracker) {
      phaseTracker.style.display = (state.mode === 'circuit') ? 'block' : 'none';
    }

    if (state.mode === 'circuit') {
      stageTitle.textContent = 'Daily Focus Circuit';
      stageBadge.textContent = 'Phase 1 of 4';
      introIcon.textContent = 'Mindful Attention';
      introTitle.textContent = 'Daily Focus Circuit';
      introDesc.textContent = 'A serene four-stage progression designed to cultivate quiet presence, expand working memory, and strengthen the mind\'s ability to resist distraction.';
      introInstructions.innerHTML = `
        <li>Phase 1: Multiple Object Tracking (Peripheral Presence)</li>
        <li>Phase 2: Chroma Shift (Gentle Impulse Control)</li>
        <li>Phase 3: Dual N-Back (Working Memory Matrix)</li>
        <li>Phase 4: Zen Rhythm (Resonance Calibration & Flow)</li>
      `;
      canvasWrap.style.display = 'flex';
      canvasWrap.classList.add('mot-focus-zone');
    } else if (state.mode === 'mot') {
      stageTitle.textContent = 'Orb Track (MOT)';
      stageBadge.textContent = 'Peripheral Presence';
      introIcon.textContent = 'Spatial Gaze';
      introTitle.textContent = 'Orb Track (Multiple Object Tracking)';
      introDesc.textContent = 'Cultivate soft peripheral gaze. Track designated target orbs as they glide effortlessly through identical distractors.';
      introInstructions.innerHTML = `
        <li>Memorize the highlighted target coordinates during the 3-second quiet study phase.</li>
        <li>Soften your gaze and sustain broad field awareness as all orbs move.</li>
        <li>Identify each marked target once movement rests.</li>
      `;
      canvasWrap.style.display = 'flex';
      canvasWrap.classList.add('mot-focus-zone');
    } else if (state.mode === 'stroop') {
      stageTitle.textContent = 'Chroma Shift';
      stageBadge.textContent = 'Impulse Awareness';
      introIcon.textContent = 'Cognitive Harmony';
      introTitle.textContent = 'Chroma Shift (Inhibitory Control)';
      introDesc.textContent = 'Strengthen top-down executive control by responding calmly to color words under cognitive interference.';
      introInstructions.innerHTML = `
        <li>Follow the active directive: match INK COLOR or match WORD TEXT.</li>
        <li>Notice Stillness prompts and mindfully pause without reacting.</li>
        <li>Respond with Keys 1–4 or directional arrow keys.</li>
      `;
      chromaWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'nback') {
      stageTitle.textContent = 'Dual N-Back Matrix';
      stageBadge.textContent = 'Working Memory';
      introIcon.textContent = 'Active Retention';
      introTitle.textContent = 'Dual N-Back Matrix';
      introDesc.textContent = 'The scientifically established training practice to gently expand working memory capacity and deepen mental clarity.';
      introInstructions.innerHTML = `
        <li>Observe the glowing grid coordinate and listen to the distinct chime tone.</li>
        <li>Press [Position Match] (A) if the cell matches 2 steps ago.</li>
        <li>Press [Sound Match] (L) if the tone matches 2 steps ago.</li>
      `;
      nbackWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'zenflow') {
      stageTitle.textContent = 'Zen Rhythm & Breath';
      stageBadge.textContent = 'Flow & Coherence';
      introIcon.textContent = 'Mindful Breath';
      introTitle.textContent = 'Zen Rhythm & Flow';
      introDesc.textContent = 'Cultivate nervous system coherence. Harmonize target touches with collapsing resonance rings while following the 4-4-4-4 box breathing guide.';
      introInstructions.innerHTML = `
        <li>Touch or click ripple rings as the outer circumference meets the inner target core.</li>
        <li>Breathe in harmony with the gentle circular breathing pacer.</li>
        <li>Generate peaceful chime melodies through calm timing.</li>
      `;
      canvasWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'flanker') {
      stageTitle.textContent = 'Flanker Horizon';
      stageBadge.textContent = 'Selective Filtering';
      introIcon.textContent = 'Spatial Isolation';
      introTitle.textContent = 'Flanker Horizon';
      introDesc.textContent = 'Isolate visual information under high spatial interference. Rapidly identify the center orientation while discarding surrounding noise.';
      introInstructions.innerHTML = `
        <li>Focus exclusively on the CENTER arrow target.</li>
        <li>Filter out identical or conflicting surrounding flankers.</li>
        <li>Respond with [←] / [A] or [→] / [D].</li>
      `;
      if (flankerWrap) flankerWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'gaze') {
      stageTitle.textContent = 'Gaze Anchor';
      stageBadge.textContent = 'Reflex Suppression';
      introIcon.textContent = 'Anti-Saccade Override';
      introTitle.textContent = 'Gaze Anchor';
      introDesc.textContent = 'Strengthen frontal eye field inhibitory control. Resist the primal urge to look at peripheral motion flashes, instantly targeting the opposite sanctuary.';
      introInstructions.innerHTML = `
        <li>Fixate peacefully on the center crosshair registration.</li>
        <li>When a flash occurs on one side, immediately strike the OPPOSITE side.</li>
        <li>Respond with [←] / [A] or [→] / [D].</li>
      `;
      if (gazeWrap) gazeWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'corsi') {
      stageTitle.textContent = 'Corsi Trail';
      stageBadge.textContent = 'Visuospatial Retention';
      introIcon.textContent = 'Spatial Sequence';
      introTitle.textContent = 'Corsi Trail (Spatial Memory)';
      introDesc.textContent = 'Gently expand the visuospatial sketchpad capacity of working memory. Retrace progressive geometric stone sequences in harmonious order.';
      introInstructions.innerHTML = `
        <li>Observe the sequence of glowing stone tiles and harmonious chime tones.</li>
        <li>Hold the trajectory in your mind without rushing.</li>
        <li>Reproduce the path in the exact sequence once the prompt signals.</li>
      `;
      if (corsiWrap) corsiWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'pvt') {
      stageTitle.textContent = 'Signal & Void';
      stageBadge.textContent = 'Vigilance Stamina';
      introIcon.textContent = 'Psychomotor Vigilance';
      introTitle.textContent = 'Signal & Void';
      introDesc.textContent = 'Overcome attentional drift and micro-lapses during prolonged waiting. Hold steady, unhurried awareness and respond instantly upon threshold shift.';
      introInstructions.innerHTML = `
        <li>Rest mindfully in the dark void without anticipating.</li>
        <li>Avoid premature clicks (impulsive false starts penalize flow).</li>
        <li>When the aperture ring flashes, tap [Space] or click immediately.</li>
      `;
      if (pvtWrap) pvtWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    } else if (state.mode === 'equilibrium') {
      stageTitle.textContent = 'Equilibrium';
      stageBadge.textContent = 'Somatic Steadiness';
      introIcon.textContent = 'Motor Inhibition';
      introTitle.textContent = 'Equilibrium';
      introDesc.textContent = 'Harmonize cognitive focus with physical micro-steadiness. Steer the floating equilibrium droplet with tranquil cursor guidance inside the inner sanctuary.';
      introInstructions.innerHTML = `
        <li>Gently guide the floating droplet toward the center balance zone.</li>
        <li>Counteract subtle organic drifting forces with calm micro-adjustments.</li>
        <li>Maintain steady presence within the inner ring to build harmonic resonance.</li>
      `;
      canvasWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
      if (eqHud) eqHud.style.display = 'flex';
    } else if (state.mode === 'tempo') {
      stageTitle.textContent = 'Tempo Lock';
      stageBadge.textContent = 'Internal Clock';
      introIcon.textContent = 'Rhythmic Entrainment';
      introTitle.textContent = 'Tempo Lock';
      introDesc.textContent = 'Calibrate neural timing oscillations. Absorb an acoustic cadence, then sustain the internal metronome through silent mental rhythm.';
      introInstructions.innerHTML = `
        <li>Listen to the 4 audible metronome calibration beats.</li>
        <li>Internalize the cadence and lock into the breathing cycle.</li>
        <li>Continue tapping the exact tempo on the Spacebar or button in complete silence.</li>
      `;
      if (tempoWrap) tempoWrap.style.display = 'flex';
      canvasWrap.classList.remove('mot-focus-zone');
    }
  }

  function startActiveGame() {
    state.isPlaying = true;
    state.isPaused = false;
    state.score = 0;
    state.combo = 0;
    state.totalTrials = 0;
    state.correctTrials = 0;
    state.reactionTimes = [];
    state.timerRemaining = (state.mode === 'circuit') ? 45 : 60;

    const overlay = document.getElementById('stage-intro-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
    updateHUD();

    // Start timer
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (!state.isPaused) {
        state.timerRemaining--;
        state.userStats.totalMindfulSeconds = (state.userStats.totalMindfulSeconds || 0) + 1;
        document.getElementById('hud-timer').textContent = `${state.timerRemaining}s`;

        if (state.timerRemaining <= 0) {
          handleTimeExpire();
        }
      }
    }, 1000);

    // Launch appropriate mode
    launchCurrentMode();
  }

  function launchCurrentMode() {
    const canvasWrap = document.getElementById('canvas-game-wrapper');
    const chromaWrap = document.getElementById('chroma-game-wrapper');
    const nbackWrap = document.getElementById('nback-game-wrapper');
    const flankerWrap = document.getElementById('flanker-game-wrapper');
    const gazeWrap = document.getElementById('gaze-game-wrapper');
    const corsiWrap = document.getElementById('corsi-game-wrapper');
    const pvtWrap = document.getElementById('pvt-game-wrapper');
    const tempoWrap = document.getElementById('tempo-game-wrapper');
    const eqHud = document.getElementById('equilibrium-hud-bar');

    canvasWrap.style.display = 'none';
    chromaWrap.style.display = 'none';
    nbackWrap.style.display = 'none';
    if (flankerWrap) flankerWrap.style.display = 'none';
    if (gazeWrap) gazeWrap.style.display = 'none';
    if (corsiWrap) corsiWrap.style.display = 'none';
    if (pvtWrap) pvtWrap.style.display = 'none';
    if (tempoWrap) tempoWrap.style.display = 'none';
    if (eqHud) eqHud.style.display = 'none';

    if (state.mode === 'circuit') {
      document.getElementById('stage-level-badge').textContent = `Phase ${state.circuitStage} of 4`;
      if (state.circuitStage === 1) {
        canvasWrap.classList.add('mot-focus-zone');
        canvasWrap.style.display = 'flex';
        MOT.startRound();
      } else if (state.circuitStage === 2) {
        canvasWrap.classList.remove('mot-focus-zone');
        chromaWrap.style.display = 'flex';
        Chroma.start();
      } else if (state.circuitStage === 3) {
        canvasWrap.classList.remove('mot-focus-zone');
        nbackWrap.style.display = 'flex';
        NBack.start();
      } else if (state.circuitStage === 4) {
        canvasWrap.classList.remove('mot-focus-zone');
        canvasWrap.style.display = 'flex';
        ZenFlow.start();
      }
    } else if (state.mode === 'mot') {
      canvasWrap.classList.add('mot-focus-zone');
      canvasWrap.style.display = 'flex';
      MOT.startRound();
    } else if (state.mode === 'stroop') {
      canvasWrap.classList.remove('mot-focus-zone');
      chromaWrap.style.display = 'flex';
      Chroma.start();
    } else if (state.mode === 'nback') {
      canvasWrap.classList.remove('mot-focus-zone');
      nbackWrap.style.display = 'flex';
      NBack.start();
    } else if (state.mode === 'zenflow') {
      canvasWrap.classList.remove('mot-focus-zone');
      canvasWrap.style.display = 'flex';
      ZenFlow.start();
    } else if (state.mode === 'flanker') {
      if (flankerWrap) flankerWrap.style.display = 'flex';
      Flanker.start();
    } else if (state.mode === 'gaze') {
      if (gazeWrap) gazeWrap.style.display = 'flex';
      Gaze.start();
    } else if (state.mode === 'corsi') {
      if (corsiWrap) corsiWrap.style.display = 'flex';
      Corsi.start();
    } else if (state.mode === 'pvt') {
      if (pvtWrap) pvtWrap.style.display = 'flex';
      PVT.start();
    } else if (state.mode === 'equilibrium') {
      canvasWrap.classList.remove('mot-focus-zone');
      canvasWrap.style.display = 'flex';
      if (eqHud) eqHud.style.display = 'flex';
      Equilibrium.start();
    } else if (state.mode === 'tempo') {
      if (tempoWrap) tempoWrap.style.display = 'flex';
      TempoLock.start();
    }
  }

  function handleTimeExpire() {
    if (state.mode === 'circuit') {
      nextCircuitStage();
    } else {
      finishSession();
    }
  }

  function nextCircuitStage() {
    stopCurrentGame();
    if (state.circuitStage < 4) {
      state.circuitStage++;
      state.timerRemaining = 45;
      window.zenAudio.playMilestone();
      launchCurrentMode();
    } else {
      finishSession();
    }
  }

  function stopCurrentGame() {
    clearInterval(state.timerInterval);
    MOT.stop();
    Chroma.stop();
    NBack.stop();
    ZenFlow.stop();
    Flanker.stop();
    Gaze.stop();
    Corsi.stop();
    PVT.stop();
    Equilibrium.stop();
    TempoLock.stop();
  }

  function finishSession() {
    state.isPlaying = false;
    stopCurrentGame();

    // Calculate Focus Quotient
    const acc = state.totalTrials > 0 ? (state.correctTrials / state.totalTrials) : 1;
    const avgReaction = state.reactionTimes.length > 0
      ? (state.reactionTimes.reduce((a, b) => a + b, 0) / state.reactionTimes.length)
      : 320;
    
    // Weighted Focus Index: Accuracy (50%), Reaction Speed (30%), Streak/Flow (20%)
    const speedScore = Math.max(0, Math.min(100, 100 - (avgReaction - 250) * 0.15));
    const streakBonus = Math.min(100, state.maxCombo * 5);
    const calculatedIndex = Math.round(acc * 50 + speedScore * 0.3 + streakBonus * 0.2);

    // Update persisted profile
    state.userStats.focusScore = Math.round(state.userStats.focusScore * 0.7 + calculatedIndex * 0.3);
    state.userStats.streak = (state.userStats.streak || 1) + 1;
    savePersistedStats();
    monthActivityController.recordTodayActive();

    // Sync Session with Backend
    if (authController.user && authController.user.id) {
      fetch(getApiUrl('/api/sessions/record'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authController.user.id,
          gameMode: state.mode || 'mot',
          score: state.score || 0,
          accuracy: Math.round(acc * 100),
          reactionMs: Math.round(avgReaction),
          durationSeconds: 60
        })
      })
      .then(r => r.json())
      .then(updated => {
        if (updated && updated.user) {
          authController.setUser(updated.user);
          monthActivityController.render();
        }
      })
      .catch(err => console.warn('Offline session record:', err));
    }

    // Fill Modal
    document.getElementById('modal-focus-score').textContent = calculatedIndex;
    document.getElementById('modal-accuracy').textContent = `${Math.round(acc * 100)}%`;
    document.getElementById('modal-reaction').textContent = `${Math.round(avgReaction)} ms`;
    document.getElementById('modal-streak').textContent = `${state.maxCombo}x`;
    document.getElementById('modal-score').textContent = state.score.toLocaleString();

    const quotes = [
      '"The mind is like water. When it is calm, everything becomes clear." — Buddhist Proverb',
      '"Concentration is the secret of strength in politics, in war, in trade, in short in all management of human affairs." — Emerson',
      '"Where your attention goes, your energy flows and your life grows." — Mindfulness Principle',
      '"Peace comes from within. Do not seek it without." — Gautama Buddha'
    ];
    document.getElementById('modal-quote').textContent = quotes[Math.floor(Math.random() * quotes.length)];

    window.zenAudio.playMilestone();
    document.getElementById('modal-results').classList.add('show');
  }

  // --- MULTI-SCREEN APP FLOW (INTRO -> MODE SELECT -> PLAY) ---
  const appFlow = {
    currentScreen: 'intro', // 'intro' | 'select' | 'play' | 'profile'
    showScreen(name) {
      this.currentScreen = name;
      const sIntro = document.getElementById('screen-intro');
      const sSelect = document.getElementById('screen-mode-select');
      const sPlay = document.getElementById('screen-play');
      const sProfile = document.getElementById('screen-profile');

      if (sIntro) sIntro.style.display = (name === 'intro') ? 'flex' : 'none';
      if (sSelect) sSelect.style.display = (name === 'select') ? 'flex' : 'none';
      if (sPlay) sPlay.style.display = (name === 'play') ? 'flex' : 'none';
      if (sProfile) sProfile.style.display = (name === 'profile') ? 'flex' : 'none';

      document.body.classList.toggle('screen-intro-active', name === 'intro');

      if (name === 'profile' && window.profileController) {
        window.profileController.refresh();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // --- THEME CONTROLLER (STARLIT NIGHT MODE / COZY DAY) ---
  const themeController = {
    theme: 'light',
    init() {
      let saved = null;
      try { saved = localStorage.getItem('mindflow_theme'); } catch(e) {}
      if (saved) {
        this.setTheme(saved);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.setTheme('dark');
      } else {
        this.setTheme('light');
      }

      document.querySelectorAll('.theme-toggle-pill').forEach(btn => {
        btn.addEventListener('click', () => this.toggle());
      });

      // Key shortcut: D for Dark / Day mode
      window.addEventListener('keydown', (e) => {
        if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
        if (e.code === 'KeyD') {
          e.preventDefault();
          this.toggle();
        }
      });
    },

    toggle() {
      const next = this.theme === 'light' ? 'dark' : 'light';
      this.setTheme(next);
      window.zenAudio?.playTap(next === 'dark' ? 380 : 540);
    },

    setTheme(t) {
      this.theme = t;
      try { localStorage.setItem('mindflow_theme', t); } catch (e) {}

      if (t === 'dark') {
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.querySelectorAll('.theme-icon').forEach(el => el.textContent = '☀️');
        document.querySelectorAll('.theme-text').forEach(el => el.textContent = 'Day');
      } else {
        document.body.classList.remove('dark-mode');
        document.documentElement.setAttribute('data-theme', 'light');
        document.querySelectorAll('.theme-icon').forEach(el => el.textContent = '🌙');
        document.querySelectorAll('.theme-text').forEach(el => el.textContent = 'Night');
      }
    }
  };

  // --- CURRENT MONTH ACTIVITY CONTROLLER (LEETCODE CALENDAR STYLE) ---
  const monthActivityController = {
    selectedMonth: new Date().getMonth(),

    init() {
      const select = document.getElementById('activity-month-select');
      if (select) {
        select.innerHTML = '';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = new Date().getMonth();
        months.forEach((m, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = m;
          if (idx === currentMonth) opt.selected = true;
          select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
          this.selectedMonth = parseInt(e.target.value, 10);
          this.render(this.selectedMonth);
        });
      }

      this.render(this.selectedMonth);
    },

    getActiveDaysMap(year, monthIndex) {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem('mindflow_activity_map'));
      } catch (e) {}

      const key = year + '-' + String(monthIndex + 1).padStart(2, '0');
      if (saved && saved[key]) {
        return saved[key];
      }

      // Seed realistic active days and focus minutes matching user profile
      const map = {};
      const now = new Date();
      const currentMonth = now.getMonth();
      const today = now.getDate();
      const streak = state.userStats.streak || 5;

      if (monthIndex === currentMonth) {
        // Current streak days leading up to today
        for (let i = 0; i < streak; i++) {
          const d = today - i;
          if (d >= 1) {
            map[d] = (i === 0) ? 45 : (20 + (d * 7) % 25);
          }
        }
        // Earlier active days in the month
        [1, 2, 4, 7, 8, 10, 11, 14, 15, 17, 18, 21, 22].forEach(d => {
          if (d < today - streak) {
            map[d] = 15 + (d * 9) % 30;
          }
        });
      } else if (monthIndex < currentMonth) {
        // Past months have consistent history
        [2, 3, 5, 6, 8, 9, 12, 13, 15, 16, 19, 20, 22, 23, 26, 27].forEach(d => {
          map[d] = 20 + (d * 5) % 25;
        });
      }

      if (!saved) saved = {};
      saved[key] = map;
      try {
        localStorage.setItem('mindflow_activity_map', JSON.stringify(saved));
      } catch (e) {}

      return map;
    },

    recordTodayActive(minutes = 25) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const today = now.getDate();

      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem('mindflow_activity_map')) || {};
      } catch (e) {}

      const key = year + '-' + String(month + 1).padStart(2, '0');
      if (!saved[key]) saved[key] = this.getActiveDaysMap(year, month);
      saved[key][today] = (saved[key][today] || 0) + minutes;

      try {
        localStorage.setItem('mindflow_activity_map', JSON.stringify(saved));
      } catch (e) {}

      this.render(this.selectedMonth);
    },

    render(monthIndex) {
      if (typeof monthIndex !== 'number') {
        monthIndex = (typeof this.selectedMonth === 'number') ? this.selectedMonth : new Date().getMonth();
      }
      this.selectedMonth = monthIndex;

      const container = document.getElementById('leetcode-month-grid');
      const countEl = document.getElementById('sidebar-active-count');
      const streakEl = document.getElementById('sidebar-streak-text');
      const select = document.getElementById('activity-month-select');
      if (!container || typeof container.appendChild !== 'function') return;

      if (select && parseInt(select.value, 10) !== monthIndex) {
        select.value = monthIndex;
      }

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const currentDay = now.getDate();

      const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];

      const totalDays = new Date(currentYear, monthIndex + 1, 0).getDate();
      const firstDay = new Date(currentYear, monthIndex, 1).getDay();
      // Monday = 0, Sunday = 6
      const startRow = (firstDay === 0) ? 6 : firstDay - 1;

      const activeMap = this.getActiveDaysMap(currentYear, monthIndex);
      const activeDaysCount = Object.keys(activeMap).length;

      container.innerHTML = '';

      // Leading blank padding tiles (so day 1 starts on its correct Monday-Sunday row)
      for (let i = 0; i < startRow; i++) {
        const blank = document.createElement('div');
        blank.className = 'heatmap-tile tile-empty';
        container.appendChild(blank);
      }

      // Generate days 1 to totalDays
      for (let d = 1; d <= totalDays; d++) {
        const tile = document.createElement('div');
        tile.className = 'heatmap-tile';
        const mins = activeMap[d] || 0;

        let lvl = 'lvl-0';
        if (mins >= 35) lvl = 'lvl-4';
        else if (mins >= 20) lvl = 'lvl-3';
        else if (mins >= 10) lvl = 'lvl-2';
        else if (mins > 0) lvl = 'lvl-1';

        tile.classList.add(lvl);

        const isCurrentMonthView = (monthIndex === currentMonth);
        if (isCurrentMonthView && d === currentDay) {
          tile.classList.add('is-today');
        }

        const dateStr = monthNames[monthIndex] + ' ' + d + ', ' + currentYear;
        if (mins > 0) {
          tile.title = dateStr + ': ' + mins + ' minutes focused / completed';
        } else {
          tile.title = dateStr + ': 0 minutes focused';
        }

        container.appendChild(tile);
      }

      if (countEl) {
        countEl.textContent = activeDaysCount;
      }
      if (streakEl) {
        streakEl.textContent = (state.userStats.streak || 5);
      }

      // Focus Index Widget Update
      const focusScoreEl = document.getElementById('sidebar-focus-score');
      const gaugeCircle = document.getElementById('sb-gauge-circle');
      const score = Math.round(state.userStats.focusScore || 64);
      if (focusScoreEl) focusScoreEl.textContent = score;
      if (gaugeCircle) {
        const circumference = 2 * Math.PI * 28; // r = 28 -> ~175.93
        gaugeCircle.style.strokeDasharray = String(circumference);
        const offset = circumference - (circumference * (score / 100));
        gaugeCircle.style.strokeDashoffset = String(offset);
      }
    }
  };


  // --- AUTHENTICATION & PLAYER CONTROLLER (SQLITE DATA SYNC) ---
  const authController = {
    user: null,

    async init() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem('mindflow_active_user'));
      } catch (e) {}

      const username = saved?.username || 'ZenSeeker';
      const avatar = saved?.avatar || '🧠';

      try {
        const res = await fetch(getApiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, avatar })
        });
        if (res.ok) {
          const data = await res.json();
          this.setUser(data.user);
        }
      } catch (err) {
        this.setUser({
          id: 1,
          username: username,
          avatar: avatar,
          focus_index: 68,
          streak: 1,
          total_minutes: 0,
          total_sessions: 0,
          tier: 'Bronze Anchor',
          level: 1
        });
      }

      this.bindEvents();
    },

    setUser(userObj) {
      this.user = userObj;
      try {
        localStorage.setItem('mindflow_active_user', JSON.stringify(userObj));
      } catch (e) {}

      const mini = document.getElementById('header-avatar-mini');
      if (mini) mini.textContent = userObj.avatar || '🧠';

      const play = document.getElementById('header-avatar-play');
      if (play) play.textContent = userObj.avatar || '🧠';

      const prof = document.getElementById('profile-header-avatar');
      if (prof) prof.textContent = userObj.avatar || '🧠';

      if (userObj.focus_index) {
        state.userStats.focusScore = userObj.focus_index;
        state.userStats.streak = userObj.streak || 1;
        const focusScoreEl = document.getElementById('sidebar-focus-score');
        if (focusScoreEl) focusScoreEl.textContent = userObj.focus_index;
      }
    },

    bindEvents() {
      const openModal = () => {
        const modal = document.getElementById('modal-auth');
        if (modal) {
          const input = document.getElementById('input-auth-username');
          if (input && this.user) input.value = this.user.username;
          modal.style.display = 'flex';
          modal.classList.add('show');
        }
      };

      const closeModal = () => {
        const modal = document.getElementById('modal-auth');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('show');
        }
      };

      document.querySelectorAll('#btn-user-avatar-play, #btn-trigger-login-modal, #btn-profile-avatar-pill, #btn-intro-login').forEach(btn => {
        btn?.addEventListener('click', openModal);
      });

      document.getElementById('btn-close-auth')?.addEventListener('click', closeModal);

      let selectedAvatar = this.user?.avatar || '🧠';
      document.querySelectorAll('.avatar-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.avatar-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedAvatar = btn.getAttribute('data-avatar');
        });
      });

      document.getElementById('btn-submit-auth')?.addEventListener('click', async () => {
        const usernameInput = document.getElementById('input-auth-username');
        const pinInput = document.getElementById('input-auth-pin');
        const errEl = document.getElementById('auth-error-msg');
        const username = usernameInput?.value.trim();
        const pin = pinInput?.value.trim();

        if (!username) {
          if (errEl) {
            errEl.textContent = 'Please enter a username.';
            errEl.style.display = 'block';
          }
          return;
        }

        try {
          const res = await fetch(getApiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, avatar: selectedAvatar, pin })
          });
          const data = await res.json();
          if (!res.ok) {
            if (errEl) {
              errEl.textContent = data.error || 'Failed to sign in.';
              errEl.style.display = 'block';
            }
            return;
          }

          this.setUser(data.user);
          closeModal();
          if (errEl) errEl.style.display = 'none';
          window.zenAudio?.playMilestone();
          if (appFlow.currentScreen === 'profile') {
            profileController.refresh();
          }
        } catch (err) {
          this.setUser({
            id: Date.now(),
            username,
            avatar: selectedAvatar,
            focus_index: 68,
            streak: 1,
            total_minutes: 0,
            total_sessions: 0,
            tier: 'Bronze Anchor',
            level: 1
          });
          closeModal();
        }
      });
    }
  };

  // --- LEETCODE PROFILE & COGNITIVE RADAR CONTROLLER ---
  const profileController = {
    async refresh() {
      const username = authController.user?.username || 'ZenSeeker';
      try {
        const [profileRes, lbRes] = await Promise.all([
          fetch(getApiUrl('/api/profile/' + encodeURIComponent(username))),
          fetch(getApiUrl('/api/leaderboard'))
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          this.renderProfile(profileData);
        }
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          this.renderLeaderboard(lbData.leaderboard);
        }
      } catch (err) {
        console.warn('Failed to fetch profile/leaderboard:', err);
      }
    },

    renderProfile(data) {
      const { user, scores, activity, badges, rank, totalPlayers } = data;

      const avatarEl = document.getElementById('profile-avatar-icon');
      if (avatarEl) avatarEl.textContent = user.avatar || '🧠';

      const levelEl = document.getElementById('profile-level-badge');
      if (levelEl) levelEl.textContent = 'Lv. ' + (user.level || 1);

      const nameEl = document.getElementById('profile-username-text');
      if (nameEl) nameEl.textContent = user.username;

      const tierEl = document.getElementById('profile-tier-badge');
      if (tierEl) tierEl.textContent = user.tier || 'Bronze Anchor';

      const rankEl = document.getElementById('profile-rank-text');
      if (rankEl) rankEl.textContent = '#' + (rank || 1);

      const totalPlayersEl = document.getElementById('profile-total-players');
      if (totalPlayersEl) totalPlayersEl.textContent = totalPlayers || 50;

      const focusValEl = document.getElementById('profile-focus-val');
      if (focusValEl) focusValEl.textContent = user.focus_index || 68;

      const streakValEl = document.getElementById('profile-streak-val');
      if (streakValEl) streakValEl.textContent = (user.streak || 1) + ' 🔥';

      const timeValEl = document.getElementById('profile-time-val');
      if (timeValEl) timeValEl.textContent = (user.total_minutes || 0) + ' min';

      const sessValEl = document.getElementById('profile-sessions-val');
      if (sessValEl) sessValEl.textContent = user.total_sessions || 0;

      this.renderRadarChart(scores);
      this.renderHeatmap(activity);
      this.renderBadges(badges);
    },

    renderRadarChart(scores) {
      if (!scores) return;
      const wm = Math.min(100, Math.max(10, scores.working_memory || 50));
      const ic = Math.min(100, Math.max(10, scores.inhibitory_control || 50));
      const sa = Math.min(100, Math.max(10, scores.spatial_attention || 50));
      const rp = Math.min(100, Math.max(10, scores.rhythmic_precision || 50));
      const rs = Math.min(100, Math.max(10, scores.reaction_speed || 50));

      const updateBar = (idScore, idBar, val) => {
        const sEl = document.getElementById(idScore);
        const bEl = document.getElementById(idBar);
        if (sEl) sEl.textContent = val + ' / 100';
        if (bEl) bEl.style.width = val + '%';
      };

      updateBar('score-wm', 'bar-wm', wm);
      updateBar('score-ic', 'bar-ic', ic);
      updateBar('score-sa', 'bar-sa', sa);
      updateBar('score-rp', 'bar-rp', rp);
      updateBar('score-rs', 'bar-rs', rs);

      const cx = 160, cy = 160, maxR = 120;
      const getCoord = (angleDeg, scoreVal) => {
        const rad = (angleDeg * Math.PI) / 180;
        const r = (scoreVal / 100) * maxR;
        return {
          x: Math.round(cx + r * Math.cos(rad)),
          y: Math.round(cy + r * Math.sin(rad))
        };
      };

      const pWM = getCoord(-90, wm);
      const pIC = getCoord(-18, ic);
      const pSA = getCoord(54, sa);
      const pRP = getCoord(126, rp);
      const pRS = getCoord(198, rs);

      const polyStr = pWM.x + ',' + pWM.y + ' ' + pIC.x + ',' + pIC.y + ' ' + pSA.x + ',' + pSA.y + ' ' + pRP.x + ',' + pRP.y + ' ' + pRS.x + ',' + pRS.y;
      const polyEl = document.getElementById('radar-player-poly');
      if (polyEl) polyEl.setAttribute('points', polyStr);

      const setNode = (id, pt) => {
        const n = document.getElementById(id);
        if (n) {
          n.setAttribute('cx', pt.x);
          n.setAttribute('cy', pt.y);
        }
      };

      setNode('radar-node-wm', pWM);
      setNode('radar-node-ic', pIC);
      setNode('radar-node-sa', pSA);
      setNode('radar-node-rp', pRP);
      setNode('radar-node-rs', pRS);
    },

    renderHeatmap(activityList = []) {
      const container = document.getElementById('profile-heatmap-container');
      const countEl = document.getElementById('profile-active-days-count');
      if (!container) return;

      const actMap = {};
      activityList.forEach(item => {
        actMap[item.date_str] = item.minutes;
      });

      if (countEl) countEl.textContent = Object.keys(actMap).length;

      container.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'annual-heatmap-grid';

      const today = new Date();
      const numDays = 182;
      const startDate = new Date();
      startDate.setDate(today.getDate() - numDays + 1);

      const firstDay = startDate.getDay();
      const startRow = (firstDay === 0) ? 6 : firstDay - 1;

      for (let b = 0; b < startRow; b++) {
        const blank = document.createElement('div');
        blank.className = 'annual-tile tile-empty';
        grid.appendChild(blank);
      }

      for (let i = 0; i < numDays; i++) {
        const curr = new Date(startDate);
        curr.setDate(startDate.getDate() + i);
        const dateStr = curr.toISOString().split('T')[0];

        const tile = document.createElement('div');
        tile.className = 'annual-tile';

        const mins = actMap[dateStr] || 0;
        let lvl = 'lvl-0';
        if (mins >= 35) lvl = 'lvl-4';
        else if (mins >= 20) lvl = 'lvl-3';
        else if (mins >= 10) lvl = 'lvl-2';
        else if (mins > 0) lvl = 'lvl-1';

        tile.classList.add(lvl);
        if (dateStr === today.toISOString().split('T')[0]) {
          tile.classList.add('is-today');
        }

        tile.title = dateStr + ': ' + mins + ' minutes focused / completed';
        grid.appendChild(tile);
      }

      container.appendChild(grid);
    },

    renderBadges(badgesList = []) {
      const grid = document.getElementById('profile-badges-grid');
      const countBadge = document.getElementById('profile-badge-count-badge');
      if (!grid) return;

      const unlockedKeys = new Set(badgesList.map(b => b.badge_key));
      if (countBadge) countBadge.textContent = 'Unlocked: ' + unlockedKeys.size;

      const allMilestones = [
        { key: 'first_spark', title: 'First Spark', desc: 'Completed initial focus practice session.', icon: '🌱' },
        { key: 'streak_3', title: 'Mindful Continuity', desc: 'Maintained a 3-day focus streak.', icon: '🔥' },
        { key: 'streak_7', title: 'Flame Keeper', desc: '7 consecutive days of contemplative focus.', icon: '⚡' },
        { key: 'high_resonance', title: 'Deep Resonance', desc: 'Elevated Focus Index to 80+.', icon: '🔮' },
        { key: 'zen_flow', title: 'Zen Master', desc: 'Attained peak mastery with Focus Index 90+.', icon: '🏆' },
        { key: 'hour_club', title: 'Deep Work Anchor', desc: 'Invested 1 full hour of cognitive practice.', icon: '⏳' },
        { key: 'memory_adept', title: 'Stone Archivist', desc: 'Working Memory reached 75+ rating.', icon: '🧩' },
        { key: 'iron_will', title: 'Still Waters', desc: 'Inhibitory Control reached 75+ rating.', icon: '🛡️' }
      ];

      grid.innerHTML = '';
      allMilestones.forEach(m => {
        const isUnlocked = unlockedKeys.has(m.key);
        const card = document.createElement('div');
        card.className = 'badge-card-item ' + (isUnlocked ? 'unlocked' : 'locked');
        card.innerHTML = '<div class="b-icon">' + m.icon + '</div><div class="b-info"><span class="b-title">' + m.title + '</span><span class="b-desc">' + (isUnlocked ? m.desc : 'Locked milestone. Keep practicing!') + '</span></div>';
        grid.appendChild(card);
      });
    },

    renderLeaderboard(players = []) {
      const podium = document.getElementById('leaderboard-podium');
      const tbody = document.getElementById('leaderboard-tbody');
      if (!podium || !tbody) return;

      podium.innerHTML = '';
      const top3 = players.slice(0, 3);
      const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

      podiumOrder.forEach(p => {
        const crown = p.rank === 1 ? '👑' : (p.rank === 2 ? '🥈' : '🥉');
        const slot = document.createElement('div');
        slot.className = 'podium-slot podium-rank-' + p.rank;
        slot.innerHTML = '<span class="podium-crown">' + crown + '</span><div class="podium-avatar">' + (p.avatar || '🧠') + '</div><span class="podium-name" title="' + (p.display_name || p.username) + '">' + p.username + '</span><span class="podium-score">' + p.focus_index + ' FI</span>';
        podium.appendChild(slot);
      });

      tbody.innerHTML = '';
      const currentUserName = (authController.user?.username || '').toLowerCase();

      players.forEach(p => {
        const tr = document.createElement('tr');
        const isMe = p.username.toLowerCase() === currentUserName;
        if (isMe) tr.className = 'active-user-row';

        tr.innerHTML = '<td class="rank-num">#' + p.rank + '</td><td class="lb-player-cell"><span class="lb-avatar">' + (p.avatar || '🧠') + '</span><strong>' + p.username + (isMe ? ' (You)' : '') + '</strong></td><td><span class="lb-tier-pill">' + p.tier + '</span></td><td><strong style="color: #22c55e;">' + p.focus_index + '</strong></td><td>' + p.streak + 'd 🔥</td>';
        tbody.appendChild(tr);
      });
    }
  };

  window.profileController = profileController;
  window.authController = authController;

  // --- EVENT LISTENERS & WIRING ---
  function init() {
    loadPersistedStats();
    initAmbientCanvas();
    initAudioUI();
    themeController.init();
    monthActivityController.init();
    MOT.init();
    Chroma.init();
    NBack.init();
    ZenFlow.init();
    Flanker.init();
    Gaze.init();
    Corsi.init();
    PVT.init();
    Equilibrium.init();
    TempoLock.init();

    // Mode Selector Nav (if present)
    const modeSelector = document.getElementById('mode-selector');
    if (modeSelector) {
      modeSelector.addEventListener('click', (e) => {
        const tab = e.target.closest('.mode-tab');
        if (tab) {
          setMode(tab.dataset.mode);
        }
      });
    }

    // Screen 1: Intro Next Button -> Mode Select
    const btnIntroNext = document.getElementById('btn-intro-next');
    if (btnIntroNext) {
      btnIntroNext.addEventListener('click', () => {
        window.zenAudio.playTap(520);
        appFlow.showScreen('select');
      });
    }

    // Screen 1: Intro Login Button -> Auth Modal
    const btnIntroLogin = document.getElementById('btn-intro-login');
    if (btnIntroLogin) {
      btnIntroLogin.addEventListener('click', () => {
        window.zenAudio.playTap(480);
        const modal = document.getElementById('modal-auth');
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.add('show');
        }
      });
    }

    // Screen 2: Back to Welcome
    const btnBackIntro = document.getElementById('btn-back-to-intro');
    if (btnBackIntro) {
      btnBackIntro.addEventListener('click', () => {
        window.zenAudio.playTap(440);
        appFlow.showScreen('intro');
      });
    }

    // Screen 2: Mode Cards & Play Buttons -> Screen 3 (Play)
    document.querySelectorAll('.select-mode-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const mode = card.dataset.mode;
        if (mode) {
          window.zenAudio.playChime(3);
          setMode(mode);
          appFlow.showScreen('play');
        }
      });
    });

    // Screen 3: Back to Mode Selection Button
    const btnBackModes = document.getElementById('btn-back-to-modes');
    if (btnBackModes) {
      btnBackModes.addEventListener('click', () => {
        stopCurrentGame();
        window.zenAudio.playTap(440);
        appFlow.showScreen('select');
      });
    }

    // Start Button in overlay
    document.getElementById('btn-start-stage').addEventListener('click', () => {
      window.zenAudio.init();
      startActiveGame();
    });

    // Pause button
    const btnPause = document.getElementById('btn-pause-game');
    btnPause.addEventListener('click', () => {
      if (!state.isPlaying) return;
      state.isPaused = !state.isPaused;
      document.getElementById('pause-icon').textContent = state.isPaused ? 'RESUME' : 'PAUSE';
    });

    // Fullscreen Controller
    initFullscreen();

    // Restart button
    document.getElementById('btn-restart-game').addEventListener('click', () => {
      stopCurrentGame();
      setupStageUI();
    });

    // Results Modal close & restart
    document.getElementById('btn-close-results').addEventListener('click', () => {
      document.getElementById('modal-results').classList.remove('show');
      setupStageUI();
    });

    document.getElementById('btn-restart-from-modal').addEventListener('click', () => {
      document.getElementById('modal-results').classList.remove('show');
      startActiveGame();
    });

    // Stats modal button
    document.getElementById('btn-stats-modal').addEventListener('click', () => {
      finishSession();
    });

    // Brand click returns to mode selection
    document.getElementById('brand-home')?.addEventListener('click', () => {
      stopCurrentGame();
      appFlow.showScreen('select');
    });

    // Profile Navigation Handlers
    const openProfile = () => {
      window.zenAudio?.playTap(520);
      appFlow.showScreen('profile');
    };

    document.querySelectorAll('#btn-open-profile-intro, #btn-open-profile-modes, #btn-open-profile-play, .profile-nav-btn').forEach(btn => {
      btn?.addEventListener('click', openProfile);
    });

    document.getElementById('btn-profile-to-modes')?.addEventListener('click', () => {
      window.zenAudio?.playTap(440);
      appFlow.showScreen('select');
    });

    document.getElementById('btn-profile-to-play')?.addEventListener('click', () => {
      window.zenAudio?.playTap(440);
      appFlow.showScreen('play');
    });

    document.getElementById('brand-home-profile')?.addEventListener('click', () => {
      window.zenAudio?.playTap(440);
      appFlow.showScreen('select');
    });

    authController.init();

    // Sidebar Sliders Sync
    const sideAmbient = document.getElementById('sidebar-ambient-slider');
    const sideSfx = document.getElementById('sidebar-sfx-slider');
    const sliderAmbient = document.getElementById('slider-ambient-vol');
    const sliderSfx = document.getElementById('slider-sfx-vol');
    if (sideAmbient) {
      sideAmbient.addEventListener('input', (e) => {
        window.zenAudio.setAmbientVolume(e.target.value);
        if (sliderAmbient) sliderAmbient.value = e.target.value;
      });
    }
    if (sideSfx) {
      sideSfx.addEventListener('input', (e) => {
        window.zenAudio.setSfxVolume(e.target.value);
        if (sliderSfx) sliderSfx.value = e.target.value;
      });
    }

    // Keyboard global shortcuts
    window.addEventListener('keydown', (e) => {
      if (appFlow.currentScreen === 'intro') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          window.zenAudio.playTap(520);
          appFlow.showScreen('select');
          return;
        }
      }
      if (appFlow.currentScreen === 'play') {
        if (e.code === 'Space' && !state.isPlaying && !document.getElementById('modal-results').classList.contains('show')) {
          e.preventDefault();
          window.zenAudio.init();
          startActiveGame();
        } else if (e.code === 'KeyM') {
          window.zenAudio.isMuted = !window.zenAudio.isMuted;
        }
      }
    });

    setupStageUI();
    appFlow.showScreen('intro');
  }

  // --- FULLSCREEN CONTROLLER ---
  function initFullscreen() {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (!btnFullscreen) return;
    const fullscreenIcon = document.getElementById('fullscreen-icon');
    const fullscreenText = document.getElementById('fullscreen-text');

    function isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function updateFullscreenUI() {
      const active = isFullscreen();
      document.body.classList.toggle('is-fullscreen', active);
      document.documentElement.classList.toggle('is-fullscreen', active);

      if (active) {
        btnFullscreen.classList.add('active');
        if (fullscreenIcon) fullscreenIcon.textContent = '✕';
        if (fullscreenText) fullscreenText.textContent = 'EXIT FULL';
        btnFullscreen.title = 'Exit Fullscreen (Key: F or Esc)';
      } else {
        btnFullscreen.classList.remove('active');
        if (fullscreenIcon) fullscreenIcon.textContent = '⛶';
        if (fullscreenText) fullscreenText.textContent = 'FULLSCREEN';
        btnFullscreen.title = 'Enter Fullscreen (Key: F)';
      }

      MOT.resizeCanvas();
      if (ambientCanvas) {
        ambientCanvas.width = window.innerWidth;
        ambientCanvas.height = window.innerHeight;
      }
      setTimeout(() => {
        MOT.resizeCanvas();
        if (ambientCanvas) {
          ambientCanvas.width = window.innerWidth;
          ambientCanvas.height = window.innerHeight;
        }
      }, 60);
      setTimeout(() => {
        MOT.resizeCanvas();
      }, 180);
    }

    function toggleFullscreen() {
      if (!isFullscreen()) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(err => console.warn(err));
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => console.warn(err));
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    }

    btnFullscreen.addEventListener('click', toggleFullscreen);

    document.addEventListener('fullscreenchange', updateFullscreenUI);
    document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
    document.addEventListener('mozfullscreenchange', updateFullscreenUI);
    document.addEventListener('MSFullscreenChange', updateFullscreenUI);

    window.addEventListener('keydown', (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
