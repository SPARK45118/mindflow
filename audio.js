// Web Audio API procedural sound engine for MindFlow
// Completely self-contained - zero external asset dependencies

class ZenAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.ambientPlaying = false;
    this.ambientGain = null;
    this.sfxGain = null;
    this.droneNodes = [];
    this.thetaOsc = null;
    this.binauralGain = null;

    // Master volumes
    this.ambientVol = 0.35;
    this.sfxVol = 0.55;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master FX gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVol, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);

      // Master Ambient gain
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.ambientGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- Ambient Zen Drone & Binaural Theta Waves ---
  startAmbientDrone() {
    this.init();
    if (this.ambientPlaying) return;

    const now = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.linearRampToValueAtTime(this.ambientVol, now + 3);

    // Warm peaceful pentatonic frequencies around 432Hz base
    // Fundamental (A4 = 432Hz, Root = 216Hz, 108Hz)
    const baseFreqs = [108, 162, 216, 288, 324];

    this.droneNodes = baseFreqs.map((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Soft sine/triangle blend
      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Low pass filter to create a warm, non-harsh cloud
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320 + index * 50, now);
      filter.Q.setValueAtTime(1.5, now);

      // Slow gentle LFO for breathing movement
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.08 + index * 0.03, now); // ~12 to 20 second swell cycles
      lfoGain.gain.setValueAtTime(0.02, now);
      lfo.connect(gain.gain);
      lfo.start(now);

      gain.gain.setValueAtTime(0.06 / (index + 1), now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambientGain);
      osc.start(now);

      return { osc, gain, lfo, filter };
    });

    // 6Hz Binaural Theta Wave for deep relaxed focus
    this.startBinauralTheta(now);
    this.ambientPlaying = true;
  }

  startBinauralTheta(now) {
    if (!this.ctx) return;
    const base = 216; // A3 harmonic
    const thetaDiff = 6; // 6Hz theta focus brainwave

    const merger = this.ctx.createChannelMerger(2);
    const oscL = this.ctx.createOscillator();
    const oscR = this.ctx.createOscillator();

    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.setValueAtTime(base - thetaDiff / 2, now);
    oscR.frequency.setValueAtTime(base + thetaDiff / 2, now);

    const bGain = this.ctx.createGain();
    bGain.gain.setValueAtTime(0.04, now);

    oscL.connect(merger, 0, 0); // left ear
    oscR.connect(merger, 0, 1); // right ear
    merger.connect(bGain);
    bGain.connect(this.ambientGain);

    oscL.start(now);
    oscR.start(now);

    this.thetaOsc = { oscL, oscR, bGain };
  }

  stopAmbientDrone() {
    if (!this.ambientPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0, now + 1.5);
    setTimeout(() => {
      this.droneNodes.forEach(node => {
        try {
          node.osc.stop();
          node.lfo.stop();
          node.osc.disconnect();
        } catch (e) {}
      });
      if (this.thetaOsc) {
        try {
          this.thetaOsc.oscL.stop();
          this.thetaOsc.oscR.stop();
        } catch (e) {}
        this.thetaOsc = null;
      }
      this.droneNodes = [];
      this.ambientPlaying = false;
    }, 1600);
  }

  toggleAmbient() {
    this.init();
    if (this.ambientPlaying) {
      this.stopAmbientDrone();
      return false;
    } else {
      this.startAmbientDrone();
      return true;
    }
  }

  setAmbientVolume(val) {
    this.ambientVol = parseFloat(val);
    if (this.ambientGain && this.ctx && this.ambientPlaying) {
      this.ambientGain.gain.setTargetAtTime(this.ambientVol, this.ctx.currentTime, 0.1);
    }
  }

  setSfxVolume(val) {
    this.sfxVol = parseFloat(val);
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
    }
  }

  // --- Procedural Sound Effects ---

  // Crystal singing bowl / bell chime for correct focus action
  playChime(pitchIndex = 0) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;

    // Harmonic pentatonic scale frequencies (C, D, E, G, A in Hz)
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
    const freq = scale[Math.min(scale.length - 1, Math.max(0, pitchIndex))];

    // Primary bell tone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator(); // harmonic sparkle
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.756, now); // slightly inharmonic bell overtone

    const overtoneGain = this.ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.2, now);
    osc2.connect(overtoneGain);
    overtoneGain.connect(gain);

    osc1.connect(gain);

    // Natural exponential envelope
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.8);
    osc2.stop(now + 1.8);
  }

  // Soft zen water drop / soft tap
  playTap(freq = 640) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Gentle low gong for miss / caution (non-punitive, mindful)
  playMindfulThud() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Distinct clean pitch for Dual N-Back audio stimulus (8 distinct harmonious tones)
  playNBackSound(pitchIndex = 0) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;

    // 8 distinct pentatonic / modal frequencies
    const freqs = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const freq = freqs[pitchIndex % freqs.length];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  // Breath guide harmonic cue (Inhale = ascending, Exhale = gentle descending)
  playBreathCue(type = 'inhale') {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    if (type === 'inhale') {
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 1.2);
    } else if (type === 'exhale') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 1.2);
    } else {
      // hold / stillness
      osc.frequency.setValueAtTime(330, now);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.5);
  }

  // Level clear / Zen milestone chime
  playMilestone() {
    if (this.isMuted) return;
    const chords = [0, 2, 4, 7];
    chords.forEach((step, idx) => {
      setTimeout(() => {
        this.playChime(step);
      }, idx * 140);
    });
  }

  // Warm organic resonant tone for Corsi stone sequences
  playStoneTone(pitchIndex = 0) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    const pentatonic = [392.00, 440.00, 493.88, 587.33, 659.25, 783.99, 880.00, 987.77, 1174.66];
    const freq = pentatonic[Math.min(pentatonic.length - 1, Math.max(0, pitchIndex))];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.65);
  }

  // Minimal wooden block click for tempo & metronome calibration
  playTick(isDownbeat = false) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = isDownbeat ? 880 : 660;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Pure high-frequency singing aperture ping for Signal & Void detection
  playAperturePing() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1320, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.2);
  }

  // Subtle directional reflex snap for Gaze Anchor
  playReflexWhoosh(direction = 1) {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startF = direction > 0 ? 320 : 480;
    const endF = direction > 0 ? 540 : 260;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + 0.08);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }
}

// Global audio singleton
window.zenAudio = new ZenAudioEngine();
