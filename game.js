/* ---------------------------------------------------------------
   game.js — screens, drawing, karaoke + the little show
   --------------------------------------------------------------- */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var screens = {
    home: $('#screenHome'),
    draw: $('#screenDraw'),
    details: $('#screenDetails'),
    show: $('#screenShow')
  };

  var state = {
    screen: 'home',
    art: null,
    name: '',
    type: '',
    typeShort: '',
    voiceURI: '',
    muted: false
  };

  var clamp = Sketch.clamp;

  /* ============================== screens ============================== */

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle('is-active', key === name);
    });
    state.screen = name;
    window.scrollTo(0, 0);
  }

  /* ============================== home doodle ============================== */

  var doodle = Sketch.makeHomeDoodle($('#homeDoodle'));
  var doodleRAF = null;

  function doodleLoop(now) {
    doodle.render(now / 1000);
    doodleRAF = requestAnimationFrame(doodleLoop);
  }
  function startDoodle() {
    if (!doodleRAF) doodleRAF = requestAnimationFrame(doodleLoop);
  }
  function stopDoodle() {
    if (doodleRAF) {
      cancelAnimationFrame(doodleRAF);
      doodleRAF = null;
    }
  }
  startDoodle();

  /* ============================== drawing ============================== */

  var drawCard = $('#drawCard');
  var dc = $('#drawCanvas');
  var dctx = dc.getContext('2d');
  var brushCursor = $('#brushCursor');
  var drawEmpty = $('#drawEmpty');

  var DW = 900;
  var DH = 900;

  var COLORS = [
    { hex: '#2c2a26', label: 'ink' },
    { hex: '#e35e4b', label: 'coral' },
    { hex: '#ffb347', label: 'marigold' },
    { hex: '#4cc9a0', label: 'mint' },
    { hex: '#4d96ff', label: 'blue' },
    { hex: '#b07cff', label: 'purple' },
    { hex: '#8b5a2b', label: 'brown' }
  ];
  var SIZES = [5, 11, 20];

  var draw = {
    color: COLORS[0].hex,
    size: SIZES[1],
    erasing: false,
    strokes: [],
    past: [],
    future: [],
    active: null,
    down: false,
    emptyTimer: null
  };

  function buildToolbar() {
    var sw = $('#swatches');
    COLORS.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.setProperty('--sw', c.hex);
      b.setAttribute('aria-label', c.label + ' brush');
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        draw.color = c.hex;
        draw.erasing = false;
        $$('#swatches .swatch').forEach(function (el) { el.setAttribute('aria-pressed', el === b ? 'true' : 'false'); });
        $('#btnEraser').setAttribute('aria-pressed', 'false');
      });
      sw.appendChild(b);
    });

    var sz = $('#sizes');
    SIZES.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'size-btn';
      b.setAttribute('aria-label', 'brush size ' + (i + 1));
      b.setAttribute('aria-pressed', i === 1 ? 'true' : 'false');
      var dot = document.createElement('i');
      var px = 8 + i * 7;
      dot.style.width = px + 'px';
      dot.style.height = px + 'px';
      b.appendChild(dot);
      b.addEventListener('click', function () {
        draw.size = s;
        $$('#sizes .size-btn').forEach(function (el) { el.setAttribute('aria-pressed', el === b ? 'true' : 'false'); });
      });
      sz.appendChild(b);
    });
  }
  buildToolbar();

  function paintDot(pt, stroke) {
    dctx.save();
    dctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    dctx.fillStyle = stroke.erase ? '#000' : stroke.color;
    dctx.beginPath();
    dctx.arc(pt.x, pt.y, brushWidth(stroke, pt.p) / 2, 0, Math.PI * 2);
    dctx.fill();
    dctx.restore();
  }

  function brushWidth(stroke, pressure) {
    return stroke.size * (0.62 + pressure * 0.82);
  }

  function paintSegment(a, b, stroke) {
    dctx.save();
    dctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    dctx.strokeStyle = stroke.erase ? '#000' : stroke.color;
    dctx.fillStyle = dctx.strokeStyle;
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';
    dctx.lineWidth = brushWidth(stroke, (a.p + b.p) / 2);
    dctx.beginPath();
    dctx.moveTo(a.x, a.y);
    dctx.lineTo(b.x, b.y);
    dctx.stroke();
    dctx.restore();
  }

  function renderAllStrokes() {
    dctx.clearRect(0, 0, DW, DH);
    draw.strokes.forEach(function (stroke) {
      var pts = stroke.points;
      if (pts.length === 1) {
        paintDot(pts[0], stroke);
      } else {
        for (var i = 1; i < pts.length; i++) paintSegment(pts[i - 1], pts[i], stroke);
      }
    });
    updateEmptyHint();
  }

  function updateEmptyHint() {
    var empty = draw.strokes.length === 0 && !draw.down;
    drawEmpty.style.opacity = empty ? 1 : 0;
  }

  function flashEmpty(message) {
    drawEmpty.textContent = message;
    drawEmpty.style.color = '#e35e4b';
    drawEmpty.style.opacity = 1;
    drawCard.classList.remove('shake');
    void drawCard.offsetWidth;
    drawCard.classList.add('shake');
    clearTimeout(draw.emptyTimer);
    draw.emptyTimer = setTimeout(function () {
      drawEmpty.textContent = 'scribble here';
      drawEmpty.style.color = '';
      updateEmptyHint();
    }, 1900);
  }

  function refreshTools() {
    $('#btnUndo').disabled = draw.past.length === 0;
    $('#btnRedo').disabled = draw.future.length === 0;
    updateEmptyHint();
  }

  function pointFromEvent(e) {
    var r = dc.getBoundingClientRect();
    var pressure = e.pressure;
    if (!pressure || pressure === 0) pressure = 0.5;
    if (pressure === 0.5 && e.pointerType === 'pen') pressure = 0.6;
    return {
      x: (e.clientX - r.left) / r.width * DW,
      y: (e.clientY - r.top) / r.height * DH,
      p: clamp(pressure, 0.15, 1)
    };
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    Music.unlock();
    try { dc.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var pt = pointFromEvent(e);
    draw.down = true;
    draw.active = {
      color: draw.color,
      size: draw.size,
      erase: draw.erasing,
      points: [pt]
    };
    paintDot(pt, draw.active);
    drawEmpty.style.opacity = 0;
    Music.scribble(true);
    moveCursor(e);
  }

  function onPointerMove(e) {
    moveCursor(e);
    if (!draw.down || !draw.active) return;
    e.preventDefault();
    var pt = pointFromEvent(e);
    var pts = draw.active.points;
    var last = pts[pts.length - 1];
    var dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (dist < 1.1) return;
    paintSegment(last, pt, draw.active);
    pts.push(pt);
  }

  function endStroke(e) {
    if (!draw.down) return;
    draw.down = false;
    Music.scribble(false);
    if (draw.active) {
      draw.past.push(draw.strokes.slice());
      if (draw.past.length > 60) draw.past.shift();
      draw.strokes.push(draw.active);
      draw.future = [];
      draw.active = null;
    }
    refreshTools();
    if (e && e.pointerType && e.pointerType !== 'mouse') brushCursor.style.display = 'none';
  }

  function moveCursor(e) {
    if (e.pointerType === 'touch') { brushCursor.style.display = 'none'; return; }
    var r = drawCard.getBoundingClientRect();
    var size = draw.size / DW * r.width;
    brushCursor.style.display = 'block';
    brushCursor.style.width = size + 'px';
    brushCursor.style.height = size + 'px';
    brushCursor.style.left = (e.clientX - r.left) + 'px';
    brushCursor.style.top = (e.clientY - r.top) + 'px';
    brushCursor.style.borderColor = draw.erasing ? 'rgba(227,94,75,.9)' : 'rgba(44,42,38,.7)';
  }

  dc.addEventListener('pointerdown', onPointerDown);
  dc.addEventListener('pointermove', onPointerMove);
  dc.addEventListener('pointerup', endStroke);
  dc.addEventListener('pointercancel', endStroke);
  dc.addEventListener('pointerleave', function () { brushCursor.style.display = 'none'; });

  $('#btnUndo').addEventListener('click', function () {
    if (!draw.past.length) return;
    draw.future.push(draw.strokes.slice());
    draw.strokes = draw.past.pop();
    renderAllStrokes();
    refreshTools();
  });

  $('#btnRedo').addEventListener('click', function () {
    if (!draw.future.length) return;
    draw.past.push(draw.strokes.slice());
    draw.strokes = draw.future.pop();
    renderAllStrokes();
    refreshTools();
  });

  $('#btnClear').addEventListener('click', function () {
    if (!draw.strokes.length) {
      flashEmpty('already nice and empty ✨');
      return;
    }
    draw.past.push(draw.strokes.slice());
    draw.strokes = [];
    draw.future = [];
    renderAllStrokes();
    refreshTools();
  });

  $('#btnEraser').addEventListener('click', function () {
    draw.erasing = !draw.erasing;
    this.setAttribute('aria-pressed', draw.erasing ? 'true' : 'false');
  });

  // keyboard shortcuts while drawing
  document.addEventListener('keydown', function (e) {
    if (state.screen !== 'draw') return;
    var meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      (e.shiftKey ? $('#btnRedo') : $('#btnUndo')).click();
    } else if (e.key === 'e' || e.key === 'E') {
      $('#btnEraser').click();
    }
  });

  /* ------------------------------ crop the drawing ------------------------------ */

  function alphaBounds() {
    var data = dctx.getImageData(0, 0, DW, DH).data;
    var minX = DW, minY = DH, maxX = -1, maxY = -1;
    for (var y = 0; y < DH; y++) {
      var row = y * DW * 4;
      for (var x = 0; x < DW; x++) {
        if (data[row + x * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function makeArt() {
    var b = alphaBounds();
    if (!b) return null;
    var pad = Math.round(Math.max(b.w, b.h) * 0.07) + 8;
    var x = Math.max(0, b.x - pad);
    var y = Math.max(0, b.y - pad);
    var x2 = Math.min(DW, b.x + b.w + pad);
    var y2 = Math.min(DH, b.y + b.h + pad);
    var w = x2 - x, h = y2 - y;

    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(dc, x, y, w, h, 0, 0, w, h);
    return { canvas: c, dataURL: c.toDataURL('image/png'), w: w, h: h };
  }

  function goToDetails() {
    var art = makeArt();
    if (!art) {
      flashEmpty('draw something first ✏️');
      return;
    }
    state.art = art;
    $('#artPreview').src = art.dataURL;
    updateSingPreview();
    showScreen('details');
    Music.blip();
    setTimeout(function () { $('#nameInput').focus(); }, 260);
  }

  /* ============================== details ============================== */

  var nameInput = $('#nameInput');
  var typeInput = $('#typeInput');
  var voiceSelect = $('#voiceSelect');
  var formHint = $('#formHint');
  var singLineEl = $('#singLine');
  var voices = [];

  function stripArticle(s) {
    return s.replace(/^(a|an|the)\s+/i, '').trim();
  }

  function updateSingPreview() {
    var name = nameInput.value.trim() || 'your creature';
    singLineEl.textContent = '';
    singLineEl.appendChild(document.createTextNode('“one little '));
    var b = document.createElement('b');
    b.textContent = name;
    singLineEl.appendChild(b);
    singLineEl.appendChild(document.createTextNode(' sitting in a tree”'));
  }

  nameInput.addEventListener('input', updateSingPreview);
  nameInput.addEventListener('input', function () {
    nameInput.parentNode.classList.remove('invalid');
    formHint.textContent = '';
  });
  typeInput.addEventListener('input', function () {
    typeInput.parentNode.classList.remove('invalid');
    formHint.textContent = '';
  });

  function loadVoices() {
    if (!('speechSynthesis' in window)) {
      voiceSelect.innerHTML = '<option value="">no voice found — try Chrome or Edge</option>';
      voiceSelect.disabled = true;
      return;
    }
    var list = speechSynthesis.getVoices() || [];
    if (!list.length) return;

    list = list.slice().sort(function (a, b) {
      var ae = a.lang && a.lang.toLowerCase().indexOf('en') === 0 ? 0 : 1;
      var be = b.lang && b.lang.toLowerCase().indexOf('en') === 0 ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.name.localeCompare(b.name);
    });
    voices = list;

    var keep = voiceSelect.value || state.voiceURI;
    voiceSelect.innerHTML = '';
    var auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'auto — best available';
    voiceSelect.appendChild(auto);
    list.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = v.name + (v.lang ? ' · ' + v.lang : '');
      voiceSelect.appendChild(o);
    });
    if (keep && list.some(function (v) { return v.voiceURI === keep; })) voiceSelect.value = keep;
  }

  voiceSelect.addEventListener('change', function () {
    state.voiceURI = voiceSelect.value;
    try { localStorage.setItem('one-little-voice', state.voiceURI); } catch (e) { /* ignore */ }
  });

  try {
    var savedVoice = localStorage.getItem('one-little-voice');
    if (savedVoice) state.voiceURI = savedVoice;
  } catch (e) { /* ignore */ }

  loadVoices();
  if ('speechSynthesis' in window && typeof speechSynthesis.addEventListener === 'function') {
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  setTimeout(loadVoices, 400);
  setTimeout(loadVoices, 1600);

  function pickVoice() {
    if ('speechSynthesis' in window) {
      var live = speechSynthesis.getVoices() || [];
      if (live.length && live.length !== voices.length) { voices = live; }
    }
    if (!voices.length) return null;
    if (state.voiceURI) {
      var chosen = voices.filter(function (v) { return v.voiceURI === state.voiceURI; })[0];
      if (chosen) return chosen;
    }
    var prefs = [
      /Google UK English Female/i, /Samantha/i, /Aria/i, /Jenny/i, /Zira/i,
      /Google US English/i, /English.*Female/i, /Female/i, /Natural/i
    ];
    for (var p = 0; p < prefs.length; p++) {
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        if (/^en/i.test(v.lang || '') && prefs[p].test(v.name)) return v;
      }
    }
    var en = voices.filter(function (v) { return /^en/i.test(v.lang || ''); })[0];
    return en || voices[0];
  }

  function speakOnce(text, opts) {
    if (!('speechSynthesis' in window)) return false;
    opts = opts || {};
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      var v = pickVoice();
      if (v) u.voice = v;
      u.lang = v && v.lang ? v.lang : 'en-US';
      u.pitch = opts.pitch == null ? 1.15 : opts.pitch;
      u.rate = opts.rate == null ? 0.95 : opts.rate;
      u.volume = 1;
      speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  $('#btnTestVoice').addEventListener('click', function () {
    Music.unlock();
    if (!('speechSynthesis' in window)) {
      formHint.textContent = 'this browser has no speech voice — try Chrome or Edge ♥';
      return;
    }
    var name = nameInput.value.trim() || 'Mochi';
    var type = typeInput.value.trim() || 'little creature';
    formHint.textContent = 'listen…';
    var ok = speakOnce('Hello! I am ' + name + ', ' + type + '.', { pitch: 1.12, rate: 0.92 });
    if (!ok) formHint.textContent = 'the voice got shy — try another browser ♥';
    setTimeout(function () {
      if (formHint.textContent === 'listen…') formHint.textContent = '';
    }, 4200);
  });

  function goStartShow() {
    var name = nameInput.value.trim().replace(/\s+/g, ' ');
    var type = typeInput.value.trim().replace(/\s+/g, ' ');

    if (!name) {
      nameInput.parentNode.classList.add('invalid');
      formHint.textContent = 'your creature needs a name';
      nameInput.focus();
      return;
    }
    if (!type) {
      typeInput.parentNode.classList.add('invalid');
      formHint.textContent = 'what is it? a blob, a bug, a beast?';
      typeInput.focus();
      return;
    }

    state.name = name;
    state.type = type;
    state.typeShort = stripArticle(type) || type;
    state.voiceURI = voiceSelect.value;
    formHint.textContent = '';
    startShow();
  }

  $('#btnStartShow').addEventListener('click', function () {
    Music.unlock();
    goStartShow();
  });

  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') typeInput.focus(); });
  typeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') goStartShow(); });

  /* ============================== the show ============================== */

  var showCanvas = $('#showCanvas');
  var sctx = showCanvas.getContext('2d');
  var SHOW_RATIO = Math.min(window.devicePixelRatio || 1, 2);
  var lyricEl = $('#lyric');
  var endCard = $('#endCard');
  var vignette = null;

  function sizeShowCanvas() {
    showCanvas.width = Math.round(720 * SHOW_RATIO);
    showCanvas.height = Math.round(1280 * SHOW_RATIO);
    sctx.setTransform(SHOW_RATIO, 0, 0, SHOW_RATIO, 0, 0);
  }
  sizeShowCanvas();

  var SHOTS = [
    { t: 0.0, c: [360, 640, 1.02] },
    { t: 2.3, c: [520, 640, 1.70] },
    { t: 6.1, c: [520, 555, 2.20] },
    { t: 9.4, c: [360, 660, 0.87] },
    { t: 12.8, c: [520, 640, 1.62] },
    { t: 16.2, c: [360, 640, 1.00] }
  ];
  var LINE_TIMES = [2.8, 6.8, 10.8, 14.8];
  var CARD_TIME = 18.7;
  var LINE_PITCH = [0, 0.06, -0.04, 0.03];
  var NOTE_COLORS = ['#e35e4b', '#4cc9a0', '#b07cff', '#ffb347'];

  var show = {
    active: false,
    raf: null,
    t0: 0,
    timers: [],
    speechToken: 0,
    landed: false,
    card: false,
    scene: null,
    notes: [],
    bursts: []
  };

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    show.timers.push(id);
    return id;
  }

  function clearTimers() {
    show.timers.forEach(clearTimeout);
    show.timers = [];
  }

  function nowT() {
    return (performance.now() - show.t0) / 1000;
  }

  function cameraAt(t) {
    var prev = SHOTS[0], next = SHOTS[0];
    for (var i = 0; i < SHOTS.length; i++) {
      if (t >= SHOTS[i].t) {
        prev = next;
        next = SHOTS[i];
      }
    }
    var k = 1;
    if (next.t > prev.t) k = Sketch.easeInOut(clamp((t - prev.t) / 0.9, 0, 1));
    var x = Sketch.lerp(prev.c[0], next.c[0], k) + Math.sin(t * 0.23) * 5;
    var y = Sketch.lerp(prev.c[1], next.c[1], k) + Math.cos(t * 0.19) * 3.4;
    var z = Sketch.lerp(prev.c[2], next.c[2], k) * (1 + Math.sin(t * 0.31) * 0.007);
    return { x: x, y: y, z: z };
  }

  function lineWords() {
    return ['one', 'little', state.name, 'sitting', 'in', 'a', 'tree'];
  }

  function setLine() {
    var words = lineWords();
    lyricEl.classList.remove('show-line');
    lyricEl.innerHTML = '';
    words.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'w' + (i === 2 ? ' name' : '');
      span.textContent = word;
      lyricEl.appendChild(span);
    });
    void lyricEl.offsetWidth;
    lyricEl.classList.add('show-line');
  }

  function setActiveWord(index) {
    var kids = lyricEl.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i === index);
  }

  function timedHighlight(token) {
    var words = lineWords();
    for (var i = 0; i < words.length; i++) {
      (function (index) {
        setTimeout(function () {
          if (show.speechToken !== token) return;
          setActiveWord(index);
        }, index * 390);
      })(i);
    }
  }

  function canSpeak() {
    return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  }

  function speakLine(lineIndex) {
    var token = ++show.speechToken;

    if (state.muted || !canSpeak()) {
      timedHighlight(token);
      return;
    }

    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }

    setTimeout(function () {
      if (show.speechToken !== token) return;

      var words = lineWords();
      var text = words.join(' ');
      var starts = [];
      var acc = 0;
      words.forEach(function (word) {
        starts.push(acc);
        acc += word.length + 1;
      });

      var voice = pickVoice();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice && voice.lang ? voice.lang : 'en-US';
      u.pitch = clamp(1.44 + LINE_PITCH[lineIndex % LINE_PITCH.length], 0.6, 2);
      u.rate = 0.78;
      u.volume = 1;

      var ticker = null;
      var boundarySeen = false;

      function cleanup() {
        if (ticker) { clearInterval(ticker); ticker = null; }
      }

      function startTicker() {
        if (ticker || boundarySeen) return;
        var at = 0;
        ticker = setInterval(function () {
          if (show.speechToken !== token) { cleanup(); return; }
          at++;
          if (at >= words.length) { cleanup(); return; }
          setActiveWord(at);
        }, 430);
      }

      u.onstart = function () {
        if (show.speechToken !== token) return;
        setActiveWord(0);
        Music.duck(true);
        setTimeout(function () {
          if (show.speechToken === token && !boundarySeen) startTicker();
        }, 950);
      };

      u.onboundary = function (ev) {
        if (show.speechToken !== token) return;
        if (ev && ev.name && ev.name !== 'word') return;
        boundarySeen = true;
        var ci = (ev && typeof ev.charIndex === 'number') ? ev.charIndex : 0;
        var index = 0;
        for (var i = 0; i < starts.length; i++) {
          if (ci >= starts[i]) index = i;
        }
        setActiveWord(index);
      };

      u.onend = function () {
        if (show.speechToken !== token) return;
        cleanup();
        Music.duck(false);
        setTimeout(function () {
          if (show.speechToken === token) setActiveWord(-1);
        }, 450);
      };

      u.onerror = function () {
        cleanup();
        Music.duck(false);
      };

      try { speechSynthesis.speak(u); } catch (e) { /* ignore */ }

      // safety: never leave the music ducked
      setTimeout(function () {
        if (show.speechToken === token) {
          cleanup();
          Music.duck(false);
          setActiveWord(-1);
        }
      }, 5600);
    }, 100);
  }

  function makeNoteSeeds() {
    var r = Sketch.makeRng(0x5EED);
    var list = [];
    for (var i = 0; i < 12; i++) {
      list.push({
        phase: r.range(0, 5.2),
        dx: r.range(-150, 150),
        drift: r.range(-34, 34),
        size: r.range(0.55, 1.1),
        color: r.pick(NOTE_COLORS),
        spin: r.range(-0.25, 0.25)
      });
    }
    return list;
  }

  function startShow() {
    if (!state.art) return;

    closeEndCard();
    clearTimers();
    show.active = true;
    show.landed = false;
    show.card = false;
    show.speechToken++;
    show.bursts = [];
    show.notes = makeNoteSeeds();
    show.scene = Sketch.buildScene();
    show.t0 = performance.now();

    sizeShowCanvas();
    showScreen('show');
    lyricEl.classList.remove('show-line');
    lyricEl.innerHTML = '';

    Music.unlock();
    Music.setMuted(state.muted);
    Music.duck(false);
    Music.start();
    updateMuteBtn();

    later(function () { Music.whoosh(); }, 220);

    LINE_TIMES.forEach(function (time, index) {
      later(function () { singLine(index); }, time * 1000);
    });

    later(function () { showEndCard(); }, CARD_TIME * 1000);
    later(function () { Music.stop(); }, (CARD_TIME + 1.3) * 1000);

    if (show.raf) cancelAnimationFrame(show.raf);
    show.raf = requestAnimationFrame(showFrame);
  }

  function singLine(index) {
    if (!show.active || show.card) return;
    setLine();
    setActiveWord(0);
    show.bursts.push({ t0: nowT(), x: 520 + (index % 2 ? 26 : -22), y: 540 + (index % 2 ? -18 : 10) });
    show.bursts.push({ t0: nowT() + 0.14, x: 520 - (index % 2 ? 30 : -28), y: 600 });
    if (!state.muted) Music.sparkle();
    speakLine(index);
  }

  function showEndCard() {
    if (show.card) return;
    show.card = true;
    show.speechToken++;
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    Music.duck(false);
    setActiveWord(-1);

    $('#endName').textContent = state.name;
    $('#endType').textContent = 'the ' + state.typeShort;
    lyricEl.classList.remove('show-line');
    endCard.classList.add('show');
    endCard.setAttribute('aria-hidden', 'false');
    setTimeout(function () {
      var replay = $('#btnReplay');
      if (replay) replay.focus({ preventScroll: true });
    }, 350);
  }

  function closeEndCard() {
    endCard.classList.remove('show');
    endCard.setAttribute('aria-hidden', 'true');
  }

  function stopShow() {
    show.active = false;
    clearTimers();
    show.speechToken++;
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    Music.duck(false);
    Music.stop();
    if (show.raf) {
      cancelAnimationFrame(show.raf);
      show.raf = null;
    }
  }

  function skipShow() {
    clearTimers();
    show.speechToken++;
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    Music.duck(false);
    Music.stop();
    showEndCard();
  }

  function updateMuteBtn() {
    var btn = $('#btnMute');
    btn.textContent = state.muted ? '🔇' : '♪';
    btn.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    btn.setAttribute('aria-label', state.muted ? 'Unmute sound' : 'Mute sound');
  }

  $('#btnMute').addEventListener('click', function () {
    state.muted = !state.muted;
    Music.setMuted(state.muted);
    if (state.muted) {
      show.speechToken++;
      try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      Music.duck(false);
    }
    updateMuteBtn();
  });

  $('#btnSkip').addEventListener('click', skipShow);

  /* ------------------------------ rendering ------------------------------ */

  function drawBirds(g, t) {
    g.save();
    g.strokeStyle = 'rgba(72,72,68,.55)';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (var i = 0; i < 2; i++) {
      var x = ((t * 20 + i * 290) % 900) - 100;
      var y = 230 + i * 52 + Math.sin(t * 0.9 + i * 1.7) * 9;
      g.beginPath();
      g.moveTo(x - 10, y);
      g.quadraticCurveTo(x - 5, y - 7, x, y);
      g.quadraticCurveTo(x + 5, y - 7, x + 10, y);
      g.stroke();
    }
    g.restore();
  }

  function roundedRect(g, x, y, w, h, rad) {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.lineTo(x + w - rad, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rad);
    g.lineTo(x + w, y + h - rad);
    g.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    g.lineTo(x + rad, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rad);
    g.lineTo(x, y + rad);
    g.quadraticCurveTo(x, y, x + rad, y);
    g.closePath();
  }

  function drawSign(g) {
    var text = state.name + ' the ' + state.typeShort;
    g.save();
    g.translate(438, 952);
    g.rotate(-0.045);

    // hanging string
    g.strokeStyle = 'rgba(92,70,48,.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-40, -46);
    g.lineTo(-58, -14);
    g.moveTo(42, -44);
    g.lineTo(62, -14);
    g.stroke();

    // board
    g.fillStyle = '#e8c9a2';
    g.strokeStyle = '#5c4630';
    g.lineWidth = 2.6;
    roundedRect(g, -112, -12, 224, 40, 6);
    g.fill();
    g.stroke();

    // nails
    g.fillStyle = '#5c4630';
    g.beginPath(); g.arc(-96, 8, 2.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(96, 8, 2.6, 0, Math.PI * 2); g.fill();

    // text
    g.fillStyle = '#4a3a2a';
    g.font = '700 16px "Segoe Print","Comic Sans MS",cursive';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, 9, 196);
    g.restore();
  }

  function drawCharacter(g, t, scene) {
    var anchor = scene.anchor;
    var art = state.art.canvas;
    var lay = Sketch.layoutCharacter(art, anchor, 300, 232);

    var dt = t - 1.5;
    if (dt < 0) return null;

    var drop = 0;
    var sq = 1;
    var rot = 0;

    if (dt < 0.5) {
      var k = dt / 0.5;
      drop = -310 * (1 - k * k);
      rot = -0.05 * (1 - k);
    } else if (dt < 0.64) {
      var q = (dt - 0.5) / 0.14;
      sq = 1 - 0.16 * Math.sin(q * Math.PI);
    } else {
      var b = (dt - 0.64);
      drop = -9 * Math.abs(Math.sin(b * 7)) * Math.max(0, 1 - b / 0.55);
    }

    // idle sway
    var idle = Math.max(0, Math.min(1, (dt - 0.7) / 0.8));
    rot += Math.sin(t * 1.5) * 0.028 * idle;
    var bob = Math.sin(t * 1.5 + 0.6) * 2 * idle;
    drop += bob;

    var sx = 1 + (1 - sq) * 0.7;

    // shadow
    g.save();
    g.globalAlpha = 0.14 * (1 - Math.min(1, Math.abs(drop) / 260));
    g.fillStyle = '#2c2a26';
    g.beginPath();
    g.ellipse(lay.cx, anchor.y + 8, lay.w * 0.34, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.save();
    g.translate(lay.cx, anchor.y + drop);
    g.rotate(rot);
    g.scale(sx, sq);
    g.drawImage(art, -lay.w / 2, -lay.h, lay.w, lay.h);
    g.restore();

    return { lay: lay, drop: drop };
  }

  function renderShow(t) {
    var g = sctx;
    g.clearRect(0, 0, 720, 1280);
    g.fillStyle = '#fdf8ec';
    g.fillRect(0, 0, 720, 1280);

    var cam = cameraAt(t);
    var shake = 0;
    if (t > 1.94 && t < 2.5) shake = (1 - (t - 1.94) / 0.56) * 5;
    var shx = Math.sin(t * 72) * shake;
    var shy = Math.cos(t * 61) * shake;

    g.save();
    g.translate(360 + shx, 640 + shy);
    g.scale(cam.z, cam.z);
    g.translate(-cam.x, -cam.y);

    var scene = show.scene;

    // reveal wipe
    var rv = clamp(t / 1.75, 0, 1);
    if (rv < 1) {
      g.save();
      g.beginPath();
      var cx = 400, cy = 690;
      var rad = 70 + Sketch.easeOut(rv) * 1180;
      var steps = 46;
      for (var i = 0; i <= steps; i++) {
        var a = (i / steps) * Math.PI * 2;
        var rr = rad * (1 + Math.sin(a * 7 + t * 2.4) * 0.018 + Math.sin(a * 13) * 0.01);
        var px = cx + Math.cos(a) * rr;
        var py = cy + Math.sin(a) * rr * 0.92;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.clip();
    }

    g.drawImage(scene.canvas, -scene.ox, -scene.oy, scene.w, scene.h);

    // the wide shot turns the paper sky blue
    var wide = Sketch.clamp((1.0 - cam.z) / 0.13, 0, 1);
    if (wide > 0.01) {
      var skyTint = g.createLinearGradient(0, -320, 0, 990);
      skyTint.addColorStop(0, 'rgba(116,182,234,' + (0.88 * wide) + ')');
      skyTint.addColorStop(0.55, 'rgba(158,210,242,' + (0.5 * wide) + ')');
      skyTint.addColorStop(1, 'rgba(158,210,242,0)');
      g.fillStyle = skyTint;
      g.fillRect(-400, -400, 1600, 1390);
    }

    drawSign(g);
    drawBirds(g, t);

    if (rv < 1) g.restore();

    // floating notes behind the creature
    if (t > 2.5 && show.notes.length) {
      var anchor = scene.anchor;
      show.notes.forEach(function (n) {
        var cycle = 4.8;
        var p = ((t + n.phase) % cycle) / cycle;
        var y = anchor.y - 92 - p * 310;
        var x = anchor.x + n.dx + Math.sin((t + n.phase) * 1.4) * 13 + n.drift * p;
        var alpha = Math.sin(p * Math.PI) * 0.8;
        Sketch.note(g, x, y, n.size, n.color, alpha, Math.sin(t + n.phase) * n.spin);
      });
    }

    // the star of the show
    var placed = drawCharacter(g, t, scene);

    // landing dust
    if (t > 1.96 && t < 2.75) {
      Sketch.puff(g, scene.anchor.x, scene.anchor.y, clamp((t - 1.96) / 0.78, 0, 1), 1);
    }

    // sparkle bursts on each line
    show.bursts = show.bursts.filter(function (b) { return t - b.t0 < 1.15; });
    show.bursts.forEach(function (b) {
      var p = clamp((t - b.t0) / 1.1, 0, 1);
      if (p <= 0) return;
      for (var s = 0; s < 7; s++) {
        var ang = (s / 7) * Math.PI * 2 + b.t0;
        var dist = 12 + 62 * Sketch.easeOut(p);
        Sketch.star(
          g,
          b.x + Math.cos(ang) * dist,
          b.y + Math.sin(ang) * dist * 0.8,
          3.5 + 4 * (1 - p),
          s % 2 ? '#ffb347' : '#ff8a76',
          (1 - p) * 0.9
        );
      }
    });

    // finale hearts
    if (t > 14.4) {
      for (var h = 0; h < 5; h++) {
        var hp = ((t - 14.4 + h * 0.9) % 4) / 4;
        if (hp < 0 || hp > 1) continue;
        var hy = scene.anchor.y - 40 - hp * 330;
        var hx = scene.anchor.x + Math.sin(hp * 6 + h) * 46;
        Sketch.heart(g, hx, hy, 1.5, '#ff8a76', Math.sin(hp * Math.PI) * 0.8);
      }
    }

    g.restore();

    // paper vignette
    if (!vignette) {
      vignette = g.createRadialGradient(360, 600, 260, 360, 620, 800);
      vignette.addColorStop(0, 'rgba(110,85,50,0)');
      vignette.addColorStop(1, 'rgba(110,85,50,.17)');
    }
    g.fillStyle = vignette;
    g.fillRect(0, 0, 720, 1280);

    // tiny corner label while skipping
    return placed;
  }

  function showFrame(now) {
    if (!show.active) return;
    var t = (now - show.t0) / 1000;
    if (t < 0) t = 0;

    if (!show.landed && t >= 1.95) {
      show.landed = true;
      if (!state.muted) Music.pop();
    }

    renderShow(t);

    if (t > 24) {
      show.active = false;
      show.raf = null;
      return;
    }
    show.raf = requestAnimationFrame(showFrame);
  }

  /* ------------------------------ poster ------------------------------ */

  function slug(s) {
    return (s || 'creature').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creature';
  }

  function savePoster() {
    if (!state.art) return;
    var scene = Sketch.buildScene();
    var S = 1.5;
    var c = document.createElement('canvas');
    c.width = 1080;
    c.height = 1920;
    var g = c.getContext('2d');

    g.fillStyle = '#fdf8ec';
    g.fillRect(0, 0, 1080, 1920);
    g.drawImage(scene.canvas, -scene.ox * S, -scene.oy * S, scene.w * S, scene.h * S);

    var anchor = { x: scene.anchor.x * S, y: scene.anchor.y * S };
    var lay = Sketch.layoutCharacter(state.art.canvas, anchor, 300 * S, 232 * S);
    g.drawImage(state.art.canvas, lay.x, lay.y, lay.w, lay.h);

    // banner
    g.save();
    g.translate(540, 225);
    g.rotate(-0.012);
    g.fillStyle = 'rgba(253,248,236,.94)';
    g.strokeStyle = '#2c2a26';
    g.lineWidth = 4;
    roundedRect(g, -410, -125, 820, 250, 22);
    g.fill();
    g.stroke();

    g.fillStyle = '#6f6759';
    g.font = '34px "Segoe Print","Comic Sans MS",cursive';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('one little', 0, -74);

    g.fillStyle = '#2c2a26';
    g.font = '700 78px "Segoe Print","Comic Sans MS",cursive';
    g.fillText(state.name, 0, -6, 740);

    g.fillStyle = '#2c2a26';
    g.font = '38px "Segoe Print","Comic Sans MS",cursive';
    g.fillText('sitting in a tree', 0, 72);
    g.restore();

    // caption
    g.save();
    g.translate(540, 1782);
    g.fillStyle = 'rgba(253,248,236,.92)';
    g.strokeStyle = '#2c2a26';
    g.lineWidth = 3;
    roundedRect(g, -390, -56, 780, 112, 18);
    g.fill();
    g.stroke();
    g.fillStyle = '#2c2a26';
    g.font = '700 42px "Segoe Print","Comic Sans MS",cursive';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(state.name + ' the ' + state.typeShort, 0, -12, 720);
    g.fillStyle = '#6f6759';
    g.font = '28px "Segoe Print","Comic Sans MS",cursive';
    g.fillText('drawn + sung by you ♥', 0, 30);
    g.restore();

    var filename = 'one-little-' + slug(state.name) + '.png';
    if (c.toBlob) {
      c.toBlob(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }, 'image/png');
    } else {
      var a2 = document.createElement('a');
      a2.href = c.toDataURL('image/png');
      a2.download = filename;
      a2.click();
    }
  }

  /* ============================== navigation wiring ============================== */

  $('#btnStartDraw').addEventListener('click', function () {
    Music.unlock();
    Music.blip();
    stopDoodle();
    showScreen('draw');
    refreshTools();
  });

  $('#btnDrawBack').addEventListener('click', function () {
    showScreen('home');
    startDoodle();
    Music.blip();
  });

  $('#btnDoneDraw').addEventListener('click', goToDetails);

  $('#btnDetailsBack').addEventListener('click', function () {
    showScreen('draw');
    refreshTools();
  });

  $('#btnReplay').addEventListener('click', function () {
    closeEndCard();
    startShow();
  });

  $('#btnSavePic').addEventListener('click', savePoster);

  $('#btnDrawAgain').addEventListener('click', function () {
    stopShow();
    closeEndCard();
    draw.strokes = [];
    draw.past = [];
    draw.future = [];
    draw.active = null;
    renderAllStrokes();
    refreshTools();
    state.art = null;
    $('#artPreview').removeAttribute('src');
    showScreen('draw');
    Music.blip();
  });

  // go home if someone taps the top bar while on an end card? not needed

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    if (state.screen === 'show' && !show.card) {
      try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      Music.duck(false);
    }
  });

  /* ------------------------------ debug hook ------------------------------ */

  window.OneLittle = {
    state: state,
    show: show,
    draw: draw,
    startShow: startShow,
    skipShow: skipShow,
    savePoster: savePoster,
    goToDetails: goToDetails,
    renderAllStrokes: renderAllStrokes,
    version: '1.0.0'
  };

  // remember the very first screen
  showScreen('home');
})();
