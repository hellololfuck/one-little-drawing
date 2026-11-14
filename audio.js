/* ---------------------------------------------------------------
   audio.js — tiny WebAudio band + scratchy pencil sounds
   --------------------------------------------------------------- */
var Music = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var musicBus = null;
  var noiseBuf = null;
  var scribbleGain = null;
  var reverb = null;
  var wet = null;

  var playing = false;
  var timer = null;
  var step = 0;
  var nextTime = 0;
  var muted = false;
  var ducked = false;
  var volume = 0.9;

  var BPM = 104;
  var SPB = 60 / BPM;
  var SIX = SPB / 4;

  // C major, one bar each
  var CHORDS = [
    { notes: [60, 64, 67], bass: 36 },
    { notes: [57, 60, 64], bass: 33 },
    { notes: [53, 57, 60], bass: 29 },
    { notes: [55, 59, 62], bass: 31 }
  ];

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function targetGain() {
    return muted ? 0 : (ducked ? 0.30 : 0.92) * volume;
  }

  function makeImpulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeNoise(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (e) {
      ctx = null;
      return false;
    }

    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.92;
    musicBus.connect(master);

    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(1.9, 2.6);
    wet = ctx.createGain();
    wet.gain.value = 0.30;
    musicBus.connect(wet);
    wet.connect(reverb);
    reverb.connect(master);

    noiseBuf = makeNoise(2);

    return true;
  }

  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  /* ------------------------------ instruments ------------------------------ */

  function pluck(t, midi, dur, vol) {
    var o = ctx.createOscillator();
    var o2 = ctx.createOscillator();
    var f = ctx.createBiquadFilter();
    var g = ctx.createGain();

    o.type = 'triangle';
    o.frequency.value = hz(midi);
    o2.type = 'sine';
    o2.frequency.value = hz(midi) * 2.002;

    f.type = 'lowpass';
    f.frequency.value = 3400;
    f.Q.value = 0.7;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(musicBus);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
  }

  function bassNote(t, midi, dur, vol) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.value = hz(midi);
    f.type = 'lowpass';
    f.frequency.value = 420;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function pad(t, notes, dur) {
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1150;
    f.Q.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(musicBus);
    f.connect(g);
    for (var i = 0; i < notes.length; i++) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(notes[i] + 12);
      o.detune.value = (i - 1) * 5;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  function shaker(t, vol) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(musicBus);
    src.start(t, Math.random() * 1.4, 0.12);
  }

  function kick(t, vol) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + 0.2);
  }

  function bell(t, midi, vol) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(musicBus);
    g.connect(wet);
    o.start(t); o.stop(t + 0.75);
  }

  /* ------------------------------ sequencer ------------------------------ */

  function scheduleStep(s, t) {
    var bar = Math.floor(s / 16) % 4;
    var pos = s % 16;
    var ch = CHORDS[bar];

    // gentle arpeggio on eighths
    if (pos % 2 === 0) {
      var arp = [0, 2, 1, 2, 0, 2, 1, 2];
      var i = arp[(pos / 2) % 8];
      var midi = ch.notes[i % 3] + (i === 2 ? 12 : 0);
      pluck(t, midi, 0.42, 0.075);
    }

    // bass on 1 and 3
    if (pos === 0) { bassNote(t, ch.bass, SPB * 1.7, 0.16); kick(t, 0.11); }
    if (pos === 8) { bassNote(t, ch.bass, SPB * 1.1, 0.10); kick(t, 0.08); }

    // shaker offbeats
    if (pos % 4 === 2) shaker(t, 0.045);

    // soft strum + pad each bar
    if (pos === 0) {
      pad(t, ch.notes, SPB * 3.9);
      for (var n = 0; n < ch.notes.length; n++) {
        pluck(t + n * 0.016, ch.notes[n] + 12, 0.7, 0.045);
      }
      bell(t, ch.notes[2] + 24, 0.03);
    }
    if (pos === 6) bell(t, ch.notes[1] + 24, 0.02);
  }

  function scheduler() {
    if (!playing || !ctx) return;
    while (nextTime < ctx.currentTime + 0.16) {
      scheduleStep(step, nextTime);
      nextTime += SIX;
      step = (step + 1) % 64;
    }
  }

  function start() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(targetGain(), ctx.currentTime + 0.5);
    timer = setInterval(scheduler, 25);
    scheduler();
  }

  function stop() {
    if (!ctx) return;
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
  }

  function duck(on) {
    ducked = !!on;
    if (!ctx) return;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(playing ? targetGain() : 0.0001, ctx.currentTime, 0.08);
  }

  function setMuted(on) {
    muted = !!on;
    if (!ctx) return;
    master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
  }

  /* ------------------------------ sfx ------------------------------ */

  function scribble(on) {
    if (!init()) return;
    if (!scribbleGain) {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2100;
      bp.Q.value = 1.1;
      scribbleGain = ctx.createGain();
      scribbleGain.gain.value = 0;
      src.connect(bp); bp.connect(scribbleGain); scribbleGain.connect(master);
      src.start();
    }
    scribbleGain.gain.setTargetAtTime(on ? 0.055 : 0, ctx.currentTime, 0.04);
  }

  function pop() {
    if (!init() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.2);

    // paper click
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f); f.connect(ng); ng.connect(master);
    src.start(t, Math.random(), 0.1);
  }

  function whoosh() {
    if (!init() || muted) return;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.18);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random(), 0.55);
  }

  function sparkle() {
    if (!init() || muted) return;
    var t = ctx.currentTime;
    var notes = [84, 88, 91, 96];
    for (var i = 0; i < notes.length; i++) {
      bell(t + i * 0.055, notes[i], 0.05);
    }
  }

  function blip() {
    if (!init() || muted) return;
    var t = ctx.currentTime;
    bell(t, 84, 0.05);
    bell(t + 0.07, 91, 0.04);
  }

  return {
    init: init,
    unlock: unlock,
    start: start,
    stop: stop,
    duck: duck,
    setMuted: setMuted,
    scribble: scribble,
    pop: pop,
    whoosh: whoosh,
    sparkle: sparkle,
    blip: blip,
    isMuted: function () { return muted; }
  };
})();
