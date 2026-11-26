// Lanternfall: all sound is synthesized with WebAudio (no audio files)
(function () {
  var A = window.LFAudio = {};
  var ctx = null, master, musicBus, sfxBus, noiseBuf, comp;
  var last = {}, combo = 0, comboT = 0;
  A.vol = { music: 0.5, sfx: 0.7 };

  A.unlock = function () {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.9; master.connect(comp);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      A.setVolumes(A.vol.music, A.vol.sfx);
      var len = ctx.sampleRate * 1; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  A.setVolumes = function (m, s) {
    A.vol.music = m; A.vol.sfx = s;
    if (!ctx) return;
    musicBus.gain.setTargetAtTime(m * 0.55, ctx.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(s * 0.8, ctx.currentTime, 0.05);
  };
  A.duck = function (on) { if (!ctx) return; musicBus.gain.setTargetAtTime(A.vol.music * 0.55 * (on ? 0.35 : 1), ctx.currentTime, 0.15); };
  A.muted = false;
  A.toggleMute = function () { A.muted = !A.muted; if (ctx) master.gain.setTargetAtTime(A.muted ? 0 : 0.9, ctx.currentTime, 0.05); return A.muted; };
  A.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend(); };
  A.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };

  function tone(type, f0, f1, dur, vol, when, bus, attack) {
    var t = (when || ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, q, type, when, bus) {
    var t = when || ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function throttle(name, gap) { var n = ctx.currentTime; if (last[name] && n - last[name] < gap) return false; last[name] = n; return true; }

  A.play = function (name) {
    if (!ctx || ctx.state !== 'running' || A.vol.sfx <= 0) return;
    var n = ctx.currentTime;
    switch (name) {
      case 'shoot': if (throttle(name, 0.07)) tone('triangle', 880, 1400, 0.06, 0.05); break;
      case 'moth': if (throttle(name, 0.2)) tone('sine', 1200, 1800, 0.12, 0.04); break;
      case 'zap': if (throttle(name, 0.1)) { noise(0.12, 0.12, 3000, 2, 'bandpass'); tone('square', 220, 90, 0.1, 0.03); } break;
      case 'lance': if (throttle(name, 0.1)) { tone('sawtooth', 300, 1200, 0.15, 0.05); noise(0.15, 0.06, 5000, 1, 'highpass'); } break;
      case 'nova': if (throttle(name, 0.15)) { tone('sine', 160, 60, 0.35, 0.16); noise(0.3, 0.07, 800, 1); } break;
      case 'meteor': if (throttle(name, 0.06)) { noise(0.35, 0.18, 500, 1); tone('sine', 120, 40, 0.3, 0.12); } break;
      case 'kill': if (throttle(name, 0.035)) { noise(0.07, 0.08, 1800 + Math.random() * 800, 3, 'bandpass'); } break;
      case 'gem':
        if (!throttle(name, 0.03)) break;
        if (n - comboT > 0.5) combo = 0; comboT = n; combo = Math.min(combo + 1, 24);
        tone('sine', 660 * Math.pow(2, (combo % 12) / 24), 0, 0.07, 0.05); break;
      case 'ember': tone('triangle', 520, 780, 0.12, 0.08); tone('triangle', 780, 1040, 0.12, 0.06, n + 0.06); break;
      case 'heal': [523, 659, 784].forEach(function (f, i) { tone('sine', f, f, 0.18, 0.09, n + i * 0.07); }); break;
      case 'magnet': tone('sine', 300, 1200, 0.4, 0.1); break;
      case 'chest': [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone('triangle', f, f, 0.22, 0.09, n + i * 0.06); }); break;
      case 'level': [392, 523, 659, 784].forEach(function (f, i) { tone('triangle', f, f, 0.25, 0.1, n + i * 0.05); }); break;
      case 'evolve': [262, 392, 523, 784, 1046].forEach(function (f, i) { tone('sawtooth', f, f * 1.01, 0.5, 0.06, n + i * 0.08); }); noise(0.8, 0.06, 6000, 1, 'highpass'); break;
      case 'hurt': if (throttle(name, 0.12)) { tone('square', 180, 70, 0.14, 0.09); noise(0.1, 0.1, 900, 1); } break;
      case 'warn': tone('sawtooth', 220, 220, 0.18, 0.06); tone('sawtooth', 220, 220, 0.18, 0.06, n + 0.24); break;
      case 'eshot': if (throttle(name, 0.08)) tone('square', 520, 260, 0.1, 0.035); break;
      case 'summon': tone('sawtooth', 90, 180, 0.5, 0.08); break;
      case 'blink': tone('sine', 1400, 200, 0.25, 0.08); break;
      case 'boss': tone('sawtooth', 55, 40, 1.6, 0.2, n, sfxBus, 0.2); tone('sawtooth', 82, 60, 1.6, 0.12, n, sfxBus, 0.2); noise(1.4, 0.12, 300, 1); break;
      case 'bosskill': noise(1.5, 0.25, 700, 1); [196, 247, 294, 392, 494, 587, 784].forEach(function (f, i) { tone('triangle', f, f, 0.6, 0.08, n + 0.3 + i * 0.09); }); break;
      case 'revive': [784, 659, 784, 1046].forEach(function (f, i) { tone('sine', f, f, 0.3, 0.1, n + i * 0.1); }); break;
      case 'lose': tone('triangle', 392, 98, 1.4, 0.15); tone('sine', 294, 73, 1.4, 0.1, n + 0.1); break;
      case 'win': [523, 659, 784, 1046].forEach(function (f, i) { tone('triangle', f, f, 0.5, 0.1, n + i * 0.12); }); break;
      case 'click': tone('triangle', 900, 700, 0.05, 0.06); break;
      case 'buy': tone('triangle', 660, 990, 0.12, 0.08); tone('triangle', 990, 1320, 0.12, 0.06, n + 0.08); break;
      case 'burst': tone('sine', 220, 880, 0.3, 0.14); noise(0.35, 0.1, 2500, 1, 'highpass'); [659, 988].forEach(function (f, i) { tone('triangle', f, f, 0.3, 0.06, n + 0.05 + i * 0.06); }); break;
      case 'shrine': [440, 554, 659, 880, 1108].forEach(function (f, i) { tone('sine', f, f, 0.5, 0.07, n + i * 0.07); }); break;
      case 'buffend': tone('triangle', 660, 330, 0.25, 0.06); break;
      case 'siren': [0, 0.35, 0.7].forEach(function (d) { tone('sawtooth', 300, 520, 0.3, 0.05, n + d); }); break;
      case 'heart': tone('sine', 70, 50, 0.12, 0.18); tone('sine', 65, 45, 0.12, 0.13, n + 0.18); break;
      case 'deny': tone('square', 200, 150, 0.12, 0.05); break;
    }
  };

  // ---- generative music ----
  var mus = { on: false, timer: null, step: 0, next: 0, mood: 'menu' };
  var SCALES = {
    menu: { root: 57, scale: [0, 3, 5, 7, 10], bpm: 72, prog: [0, 5, 3, 4] },
    z0: { root: 57, scale: [0, 2, 3, 7, 9], bpm: 96, prog: [0, 3, 5, 4] },
    z1: { root: 55, scale: [0, 2, 3, 5, 7, 10], bpm: 92, prog: [0, 5, 3, 6] },
    z2: { root: 52, scale: [0, 1, 4, 5, 7, 8], bpm: 104, prog: [0, 1, 5, 4] },
    z3: { root: 59, scale: [0, 2, 3, 7, 8], bpm: 88, prog: [0, 5, 2, 4] },
    z4: { root: 50, scale: [0, 1, 3, 6, 7, 10], bpm: 108, prog: [0, 1, 6, 5] },
    z5: { root: 53, scale: [0, 3, 5, 6, 7, 10], bpm: 112, prog: [0, 6, 5, 3] },
    boss: { root: 45, scale: [0, 1, 3, 5, 7, 8], bpm: 128, prog: [0, 1, 0, 6] }
  };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function scheduleStep(t, step) {
    var S = SCALES[mus.mood] || SCALES.menu, beat = 60 / S.bpm / 2, bar = Math.floor(step / 8) % 4;
    var chordRoot = S.root + [0, 5, 3, 7, 8, 10, 2][S.prog[bar] % 7] - 12;
    if (step % 8 === 0) { // pad chord
      [0, 7, 12, 15].forEach(function (iv, i) {
        var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = mtof(chordRoot + iv); o2.frequency.value = mtof(chordRoot + iv) * 1.006;
        f.type = 'lowpass'; f.frequency.value = mus.mood === 'boss' ? 1400 : 700;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + beat * 3); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 8.5);
        o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o2.start(t); o.stop(t + beat * 9); o2.stop(t + beat * 9);
      });
    }
    // arpeggio
    var sc = S.scale, pat = [0, 2, 1, 3, 2, 4, 1, 3];
    if (mus.mood !== 'menu' || step % 2 === 0) {
      var deg = pat[(step + bar) % 8] % sc.length, oct = (step % 16 > 11) ? 12 : 0;
      tone('triangle', mtof(S.root + sc[deg] + oct), 0, beat * 1.6, mus.mood === 'menu' ? 0.03 : 0.04, t, musicBus);
    }
    if (mus.mood !== 'menu') {
      if (step % 4 === 0) { tone('sine', 110, 40, 0.18, mus.mood === 'boss' ? 0.22 : 0.14, t, musicBus); }
      if (step % 2 === 1 && mus.mood === 'boss') noise(0.05, 0.04, 8000, 1, 'highpass', t, musicBus);
      if (step % 8 === 4) noise(0.12, 0.05, 2500, 1, 'bandpass', t, musicBus);
      if (step % 2 === 0) tone('sawtooth', mtof(chordRoot - 12), 0, beat * 1.2, 0.03, t, musicBus);
    }
  }
  function tick() {
    if (!ctx || !mus.on) return;
    var S = SCALES[mus.mood] || SCALES.menu, beat = 60 / S.bpm / 2;
    if (mus.next < ctx.currentTime) mus.next = ctx.currentTime + 0.05;
    while (mus.next < ctx.currentTime + 0.15) { if (ctx.state === 'running' && A.vol.music > 0) scheduleStep(mus.next, mus.step); mus.step++; mus.next += beat; }
  }
  A.music = function (mood) {
    mus.mood = mood;
    if (!mus.on) { mus.on = true; mus.timer = setInterval(tick, 40); }
  };
  A.stopMusic = function () { mus.on = false; clearInterval(mus.timer); };
})();
