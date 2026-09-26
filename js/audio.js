/* =========================================================================
   RIPPLE RUMBLE — audio
   All sound is synthesized with WebAudio; no asset files required.
   ========================================================================= */
var SFX = (function () {
  var ac = null, master = null, sfxBus = null, musicBus = null, crowdBus = null;
  var noiseBuf = null;
  var sfxOn = true, musicOn = true;
  var crowdSrc = null, crowdFilter = null;
  var seqTimer = null, step = 0, nextNoteTime = 0, tempo = 148, musicMode = 'none';

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();

    master = ac.createGain(); master.gain.value = 0.85; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);
    crowdBus = ac.createGain(); crowdBus.gain.value = 0.0; crowdBus.connect(master);

    // shared noise buffer (2 s of white noise)
    var len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    startCrowd();
    startSequencer();
  }

  function now() { return ac ? ac.currentTime : 0; }

  function noise(dur, gain, filterType, freq, q) {
    if (!ac || !sfxOn) return null;
    var src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var f = ac.createBiquadFilter();
    f.type = filterType || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    var g = ac.createGain();
    g.gain.setValueAtTime(gain, now());
    g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(); src.stop(now() + dur + 0.02);
    return { src: src, filter: f, gain: g };
  }

  function tone(freq, dur, gain, type, slideTo, delay) {
    if (!ac || !sfxOn) return;
    var t = now() + (delay || 0);
    var o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  /* ---------------------------------------------------------- crowd ambience */
  function startCrowd() {
    if (!ac || crowdSrc) return;
    crowdSrc = ac.createBufferSource(); crowdSrc.buffer = noiseBuf; crowdSrc.loop = true;
    crowdFilter = ac.createBiquadFilter();
    crowdFilter.type = 'bandpass'; crowdFilter.frequency.value = 760; crowdFilter.Q.value = 0.6;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2100;
    crowdSrc.connect(crowdFilter); crowdFilter.connect(lp); lp.connect(crowdBus);
    crowdSrc.start();
  }
  function crowd(level, ramp) {
    if (!ac) return;
    crowdBus.gain.cancelScheduledValues(now());
    crowdBus.gain.setValueAtTime(crowdBus.gain.value, now());
    crowdBus.gain.linearRampToValueAtTime(level * (sfxOn ? 1 : 0), now() + (ramp || 0.6));
  }
  function cheer(power) {
    if (!ac || !sfxOn) return;
    power = power || 1;
    crowdBus.gain.cancelScheduledValues(now());
    crowdBus.gain.setValueAtTime(crowdBus.gain.value, now());
    crowdBus.gain.linearRampToValueAtTime(0.42 * power, now() + 0.09);
    crowdBus.gain.linearRampToValueAtTime(0.10, now() + 1.7);
    if (crowdFilter) {
      crowdFilter.frequency.cancelScheduledValues(now());
      crowdFilter.frequency.setValueAtTime(1500, now());
      crowdFilter.frequency.linearRampToValueAtTime(760, now() + 1.6);
    }
  }

  /* ------------------------------------------------------------------ music */
  // Two tiny sequenced loops: menu groove and fight groove.
  var BASS_MENU = [0, 0, 7, 0, 5, 0, 3, 0, 0, 0, 7, 10, 5, 5, 3, 2];
  var BASS_FIGHT = [0, 0, 0, 12, 0, 0, 7, 0, 3, 3, 3, 10, 5, 5, 7, 8];

  function kick(t) {
    if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.2);
  }
  function hat(t, open) {
    if (!ac) return;
    var s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    var g = ac.createGain();
    var d = open ? 0.13 : 0.035;
    g.gain.setValueAtTime(open ? 0.13 : 0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + d + 0.02);
  }
  function snare(t) {
    if (!ac) return;
    var s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t); s.stop(t + 0.18);
    var o = ac.createOscillator(), og = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
    og.gain.setValueAtTime(0.22, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(musicBus); o.start(t); o.stop(t + 0.12);
  }
  function bassNote(t, semi, dur) {
    if (!ac) return;
    var f = 55 * Math.pow(2, semi / 12);
    var o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function stab(t, semi) {
    if (!ac) return;
    [0, 7, 12].forEach(function (iv) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = 220 * Math.pow(2, (semi + iv) / 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.2);
    });
  }

  function scheduleStep(s, t) {
    var fight = musicMode === 'fight';
    var bass = fight ? BASS_FIGHT : BASS_MENU;
    if (s % 4 === 0) kick(t);
    if (fight && (s === 6 || s === 14)) kick(t);
    if (s % 8 === 4) snare(t);
    if (s % 2 === 0 || fight) hat(t, s % 8 === 6);
    bassNote(t, bass[s % 16] - (fight ? 0 : 5), fight ? 0.16 : 0.22);
    if (fight && (s === 0 || s === 10)) stab(t, bass[s % 16]);
    if (!fight && s === 12) stab(t, bass[s % 16] - 5);
  }

  function startSequencer() {
    if (seqTimer) return;
    nextNoteTime = now() + 0.1;
    seqTimer = setInterval(function () {
      if (!ac || musicMode === 'none') { nextNoteTime = now() + 0.1; return; }
      var spb = 60 / tempo / 2; // 8th notes
      while (nextNoteTime < now() + 0.25) {
        scheduleStep(step % 16, nextNoteTime);
        step++;
        nextNoteTime += spb;
      }
    }, 60);
  }

  function music(mode) {
    if (!ac) { musicMode = mode; return; }
    musicMode = mode;
    tempo = mode === 'fight' ? 156 : 126;
    var target = mode === 'none' ? 0 : (musicOn ? (mode === 'fight' ? 0.34 : 0.28) : 0);
    musicBus.gain.cancelScheduledValues(now());
    musicBus.gain.setValueAtTime(musicBus.gain.value, now());
    musicBus.gain.linearRampToValueAtTime(target, now() + 0.5);
  }

  /* ------------------------------------------------------------------- sfx  */
  var api = {
    init: init,
    music: music,
    crowd: crowd,
    cheer: cheer,

    toggleMusic: function () {
      musicOn = !musicOn;
      if (ac) music(musicMode);
      return musicOn;
    },
    toggleSfx: function () {
      sfxOn = !sfxOn;
      if (ac) { sfxBus.gain.value = sfxOn ? 0.9 : 0; crowd(sfxOn ? 0.1 : 0, 0.2); }
      return sfxOn;
    },

    hit: function (weight) {
      // weight 0..1 => light jab to bone-rattling hook
      var w = Math.max(0, Math.min(1, weight));
      noise(0.05 + w * 0.09, 0.5 + w * 0.4, 'lowpass', 900 + (1 - w) * 2600, 1);
      tone(180 - w * 90, 0.11 + w * 0.12, 0.45 + w * 0.35, 'sine', 48 - w * 18);
      if (w > 0.6) tone(70, 0.28, 0.4, 'triangle', 36);
    },
    block: function () {
      noise(0.07, 0.35, 'bandpass', 2600, 3);
      tone(420, 0.06, 0.18, 'square', 260);
    },
    parry: function () {
      tone(1400, 0.08, 0.22, 'square', 2300);
      tone(2100, 0.14, 0.14, 'sine', 3000);
      noise(0.1, 0.25, 'highpass', 3800, 1);
    },
    whiff: function () {
      noise(0.16, 0.22, 'bandpass', 900, 0.9);
    },
    step: function () {
      noise(0.05, 0.09, 'lowpass', 400, 1);
    },
    dash: function () {
      noise(0.2, 0.2, 'bandpass', 620, 0.8);
    },
    charge: function () {
      tone(160, 0.55, 0.3, 'sawtooth', 780);
      noise(0.5, 0.18, 'bandpass', 500, 2);
    },
    superHit: function () {
      tone(120, 0.5, 0.55, 'sawtooth', 40);
      tone(300, 0.3, 0.3, 'square', 80);
      noise(0.35, 0.5, 'lowpass', 1400, 1);
    },
    projectile: function () {
      tone(520, 0.4, 0.22, 'sine', 180);
      noise(0.4, 0.16, 'bandpass', 1500, 4);
    },
    dizzy: function () {
      var base = 700;
      for (var i = 0; i < 4; i++) tone(base + i * 40, 0.22, 0.10, 'sine', base - 220, i * 0.14);
    },
    bell: function (count) {
      count = count || 1;
      for (var i = 0; i < count; i++) {
        tone(784, 0.9, 0.30, 'sine', 770, i * 0.34);
        tone(1568, 0.7, 0.16, 'sine', 1540, i * 0.34);
        tone(2350, 0.45, 0.07, 'sine', 2300, i * 0.34);
      }
    },
    ko: function () {
      tone(300, 1.2, 0.5, 'sawtooth', 40);
      tone(150, 1.6, 0.4, 'triangle', 30);
      noise(0.9, 0.4, 'lowpass', 900, 1);
      cheer(1.1);
    },
    pop: function () { // the block flying off
      tone(900, 0.18, 0.35, 'square', 1800);
      tone(300, 0.5, 0.3, 'sine', 1200);
      noise(0.2, 0.3, 'highpass', 2000, 1);
    },
    ui: function (up) {
      tone(up ? 660 : 520, 0.07, 0.2, 'square', up ? 880 : 420);
    },
    confirm: function () {
      tone(523, 0.1, 0.25, 'square');
      tone(784, 0.16, 0.22, 'square', 790, 0.07);
      tone(1046, 0.22, 0.18, 'square', 1050, 0.15);
    },
    count: function (n) {
      tone(n >= 9 ? 340 : 420, 0.28, 0.3, 'triangle', 300);
    },
    heartbeat: function () {
      tone(70, 0.16, 0.5, 'sine', 45);
      tone(70, 0.16, 0.38, 'sine', 45, 0.22);
    }
  };
  return api;
})();
