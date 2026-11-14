/* ---------------------------------------------------------------
   sketch.js — hand-drawn helpers + the tree scene
   No dependencies, classic script (works from file:// and Electron)
   --------------------------------------------------------------- */
var Sketch = (function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ------------------------------ random ------------------------------ */

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    var f = mulberry32(seed >>> 0);
    var r = {
      next: f,
      range: function (a, b) { return a + (b - a) * f(); },
      int: function (a, b) { return Math.floor(a + (b - a + 1) * f()); },
      pick: function (arr) { return arr[Math.min(arr.length - 1, Math.floor(f() * arr.length))]; },
      chance: function (p) { return f() < p; }
    };
    return r;
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* ------------------------------ strokes ------------------------------ */

  // A wobbly ink line made from a couple of overlapping passes.
  function inkLine(g, r, x1, y1, x2, y2, opt) {
    opt = opt || {};
    var color = opt.color || '#2c2a26';
    var width = opt.width == null ? 2.4 : opt.width;
    var alpha = opt.alpha == null ? 1 : opt.alpha;
    var rough = opt.rough == null ? 1.2 : opt.rough;
    var passes = opt.passes == null ? 2 : opt.passes;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;

    g.save();
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (var p = 0; p < passes; p++) {
      var segs = Math.max(2, Math.ceil(len / 42));
      var wob = r.range(0, TAU);
      g.globalAlpha = alpha * (p === 0 ? 1 : 0.55);
      g.beginPath();
      for (var i = 0; i <= segs; i++) {
        var t = i / segs;
        var off = Math.sin(t * 5.2 + wob) * rough * 0.7 +
                  Math.sin(t * 13 + wob * 2) * rough * 0.22 +
                  (r.next() - 0.5) * rough * 0.5;
        var taper = Math.sin(Math.PI * t);
        var x = x1 + dx * t + nx * off;
        var y = y1 + dy * t + ny * off;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        if (opt.width != null) g.lineWidth = Math.max(0.4, width * (0.72 + 0.4 * r.next()) * (0.55 + 0.45 * taper));
      }
      if (opt.width == null) g.lineWidth = width;
      g.stroke();
    }
    g.restore();
  }

  // Catmull-Rom sample of a point list.
  function smoothPoints(pts, perSeg) {
    perSeg = perSeg || 10;
    var P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
    var out = [];
    for (var i = 1; i < P.length - 2; i++) {
      var p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (var j = 0; j < perSeg; j++) {
        var t = j / perSeg, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Tapered limb / trunk: filled wobbly polygon with an ink outline.
  function limb(g, r, pts, w0, w1, fill, outline) {
    var samples = smoothPoints(pts, 14);
    var left = [], right = [];
    for (var i = 0; i < samples.length; i++) {
      var p = samples[i];
      var prev = samples[Math.max(0, i - 1)];
      var next = samples[Math.min(samples.length - 1, i + 1)];
      var tx = next.x - prev.x, ty = next.y - prev.y;
      var tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      var t = i / (samples.length - 1);
      var w = lerp(w0, w1, t) * 0.5;
      var wob = 1 + Math.sin(t * 9 + 2.1) * 0.1 + (r.next() - 0.5) * 0.06;
      w *= wob;
      left.push({ x: p.x - ty * w, y: p.y + tx * w });
      right.push({ x: p.x + ty * w, y: p.y - tx * w });
    }
    g.save();
    g.beginPath();
    g.moveTo(left[0].x, left[0].y);
    for (var a = 1; a < left.length; a++) g.lineTo(left[a].x, left[a].y);
    for (var b = right.length - 1; b >= 0; b--) g.lineTo(right[b].x, right[b].y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = outline;
    g.lineWidth = 2.6;
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
    return samples;
  }

  /* ------------------------------ paper + scenery ------------------------------ */

  function paper(g, w, h, r) {
    g.fillStyle = '#fdf8ec';
    g.fillRect(0, 0, w, h);

    // soft warm blotches
    for (var i = 0; i < 46; i++) {
      var x = r.range(0, w), y = r.range(0, h), rad = r.range(40, 220);
      var grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(214,196,160,' + r.range(0.02, 0.055) + ')');
      grad.addColorStop(1, 'rgba(214,196,160,0)');
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    // grain
    g.save();
    for (var d = 0; d < 3200; d++) {
      var gx = r.range(0, w), gy = r.range(0, h);
      g.globalAlpha = r.range(0.02, 0.09);
      g.fillStyle = r.chance(0.5) ? '#a9977a' : '#ffffff';
      g.fillRect(gx, gy, r.range(0.6, 2.1), r.range(0.6, 2.1));
    }
    // a few paper fibres
    for (var f = 0; f < 120; f++) {
      var fx = r.range(0, w), fy = r.range(0, h);
      g.globalAlpha = r.range(0.05, 0.12);
      g.strokeStyle = '#b7a483';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + r.range(-9, 9), fy + r.range(-3, 3));
      g.stroke();
    }
    g.restore();
  }

  function sky(g, r, w) {
    var horizon = 1120;
    var grad = g.createLinearGradient(0, 0, 0, 580);
    grad.addColorStop(0, '#d7eefb');
    grad.addColorStop(0.5, '#ecf7fe');
    grad.addColorStop(1, '#fdf8ec');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, 580);
    g.fillStyle = '#fdf8ec';
    g.fillRect(0, 580, w, horizon - 580);

    // crayon hatching, fading out before it reaches the tree
    g.save();
    g.lineCap = 'round';
    for (var i = 0; i < 420; i++) {
      var x = r.range(-40, w + 40);
      var y = Math.pow(r.next(), 0.75) * 560;
      var t = 1 - y / 580;
      if (r.chance(0.2)) {
        g.strokeStyle = 'rgba(255,255,255,' + (0.25 + 0.35 * t) + ')';
      } else {
        g.strokeStyle = 'rgba(122,190,235,' + (0.06 + 0.16 * t) + ')';
      }
      g.lineWidth = r.range(2, 7);
      var len = r.range(26, 92);
      var ang = -0.72 + r.range(-0.12, 0.12);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    g.restore();

    // clouds
    cloud(g, r, 210, 330, 1.05);
    cloud(g, r, 575, 205, 0.72);
    cloud(g, r, 900, 345, 0.9);
  }

  function cloud(g, r, cx, cy, s) {
    var lobes = [
      [-70, 18, 42], [-26, -8, 55], [26, -16, 48], [72, 10, 36], [12, 20, 50]
    ];
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.beginPath();
    for (var i = 0; i < lobes.length; i++) {
      var l = lobes[i];
      g.moveTo(l[0] + l[2], l[1]);
      g.arc(l[0], l[1], l[2], 0, TAU);
    }
    g.fillStyle = '#fffdf7';
    g.fill();
    g.strokeStyle = 'rgba(120,175,205,.55)';
    g.lineWidth = 3;
    g.stroke();
    // little hatching underneath
    g.strokeStyle = 'rgba(140,190,218,.4)';
    g.lineWidth = 2;
    for (var k = 0; k < 7; k++) {
      var x = -60 + k * 20 + r.range(-4, 4);
      var y = 36 + r.range(-6, 5);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 10, y + 3);
      g.stroke();
    }
    g.restore();
  }

  function sun(g, r, cx, cy, rad) {
    g.save();
    // rays
    g.strokeStyle = '#e9b64a';
    g.lineCap = 'round';
    for (var i = 0; i < 13; i++) {
      var a = (i / 13) * TAU + 0.18;
      var r1 = rad + 10 + r.range(0, 5);
      var r2 = rad + 20 + r.range(2, 22);
      g.lineWidth = r.range(2, 4);
      g.globalAlpha = 0.75;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(cx, cy, rad, 0, TAU);
    g.fillStyle = '#ffdf87';
    g.fill();
    g.strokeStyle = '#e0ad3f';
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.arc(cx - rad * 0.2, cy - rad * 0.22, rad * 0.62, Math.PI * 1.05, Math.PI * 1.7);
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = 4;
    g.stroke();
    g.restore();
  }

  function ground(g, r, w, h) {
    var horizon = 1120;

    // distant hills
    for (var hill = 0; hill < 2; hill++) {
      g.beginPath();
      g.moveTo(-20, horizon + 10);
      for (var x = -20; x <= w + 30; x += 40) {
        var y = horizon - 18 - hill * 26 - Math.sin(x * 0.008 + hill * 2) * (22 + hill * 8);
        g.lineTo(x, y);
      }
      g.lineTo(w + 30, horizon + 40);
      g.lineTo(-20, horizon + 40);
      g.closePath();
      g.fillStyle = hill === 0 ? 'rgba(170,214,140,.32)' : 'rgba(150,200,120,.28)';
      g.fill();
    }

    // grass base
    var grad = g.createLinearGradient(0, horizon, 0, h);
    grad.addColorStop(0, '#cbe9b3');
    grad.addColorStop(0.45, '#b7e0a0');
    grad.addColorStop(1, '#a3d78c');
    g.fillStyle = grad;
    g.fillRect(0, horizon, w, h - horizon);

    // grass scribbles
    g.save();
    g.lineCap = 'round';
    for (var i = 0; i < 1500; i++) {
      var gx = r.range(-20, w + 20);
      var gy = r.range(horizon + 4, h);
      var depth = (gy - horizon) / (h - horizon);
      var col = r.chance(0.34) ? 'rgba(95,160,80,' : (r.chance(0.5) ? 'rgba(255,255,255,' : 'rgba(120,185,95,');
      g.strokeStyle = col + r.range(0.18, 0.5) + ')';
      g.lineWidth = r.range(1.5, 4.2);
      var len = r.range(5, 15) * (0.6 + depth);
      var ang = -Math.PI / 2 + r.range(-0.45, 0.45);
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx + Math.cos(ang) * len, gy + Math.sin(ang) * len);
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------ tree ------------------------------ */

  function leafCloud(g, r, cx, cy, rad, opt) {
    opt = opt || {};
    var fill = opt.fill || '#79bd64';
    var outline = opt.outline || '#3f7a3a';
    var vein = opt.vein || '#4e8c45';
    var n = Math.max(8, Math.round(rad / 10));
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + r.range(-0.09, 0.09);
      var rr = rad * r.range(0.66, 0.98);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.88 });
    }

    g.save();
    g.beginPath();
    var mid0x = (pts[0].x + pts[n - 1].x) / 2, mid0y = (pts[0].y + pts[n - 1].y) / 2;
    g.moveTo(mid0x, mid0y);
    for (var j = 0; j < n; j++) {
      var p = pts[j];
      var q = pts[(j + 1) % n];
      g.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = outline;
    g.lineWidth = 2.6;
    g.lineJoin = 'round';
    g.stroke();

    // veins
    g.strokeStyle = vein;
    g.globalAlpha = 0.5;
    g.lineWidth = 1.8;
    for (var k = 0; k < 7; k++) {
      var ang = r.range(0, TAU);
      var len = rad * r.range(0.35, 0.72);
      g.beginPath();
      g.moveTo(cx + r.range(-6, 6), cy + r.range(-6, 6));
      g.quadraticCurveTo(
        cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.5 - 4,
        cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.8
      );
      g.stroke();
    }
    g.globalAlpha = 1;

    // chalky highlights
    g.strokeStyle = 'rgba(255,255,255,.42)';
    g.lineWidth = 4;
    g.lineCap = 'round';
    for (var h = 0; h < 6; h++) {
      var ha = r.range(0, TAU);
      var hr = rad * r.range(0.18, 0.58);
      g.beginPath();
      g.arc(cx, cy, hr, ha, ha + r.range(0.25, 0.6));
      g.stroke();
    }
    g.restore();
  }

  function drawTree(g, r) {
    /* trunk (world coordinates of the 720x1280 stage) */
    limb(g, r, [
      { x: 330, y: 1082 }, { x: 336, y: 960 }, { x: 344, y: 838 },
      { x: 348, y: 706 }, { x: 353, y: 584 }, { x: 359, y: 470 }
    ], 58, 18, '#caa072', '#5c4630');

    // bark
    g.save();
    g.strokeStyle = 'rgba(92,70,48,.42)';
    g.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var t = i / 11;
      var x = lerp(318, 351, t) + r.range(-8, 8);
      var y1 = lerp(1056, 500, t);
      g.lineWidth = r.range(1.4, 3);
      g.beginPath();
      g.moveTo(x, y1);
      g.quadraticCurveTo(x + r.range(-10, 10), y1 - r.range(30, 70), x + r.range(-5, 5), y1 - r.range(70, 120));
      g.stroke();
    }
    g.restore();

    // roots
    limb(g, r, [{ x: 334, y: 1074 }, { x: 300, y: 1092 }, { x: 268, y: 1104 }], 20, 3, '#caa072', '#5c4630');
    limb(g, r, [{ x: 340, y: 1080 }, { x: 355, y: 1102 }, { x: 382, y: 1112 }], 20, 3, '#caa072', '#5c4630');
    limb(g, r, [{ x: 330, y: 1078 }, { x: 322, y: 1102 }, { x: 306, y: 1112 }], 16, 3, '#caa072', '#5c4630');

    // big right branch — the creature's seat
    limb(g, r, [
      { x: 347, y: 806 }, { x: 420, y: 783 }, { x: 500, y: 742 }, { x: 575, y: 713 }, { x: 646, y: 692 }
    ], 27, 7, '#caa072', '#5c4630');

    // left branch
    limb(g, r, [{ x: 346, y: 900 }, { x: 292, y: 874 }, { x: 232, y: 848 }], 21, 5, '#caa072', '#5c4630');

    // twigs
    limb(g, r, [{ x: 351, y: 640 }, { x: 322, y: 582 }, { x: 290, y: 540 }], 13, 4, '#caa072', '#5c4630');
    limb(g, r, [{ x: 353, y: 560 }, { x: 388, y: 522 }, { x: 416, y: 496 }], 12, 4, '#caa072', '#5c4630');
    limb(g, r, [{ x: 352, y: 720 }, { x: 392, y: 700 }, { x: 418, y: 684 }], 11, 4, '#caa072', '#5c4630');

    // leaves (behind the creature)
    leafCloud(g, r, 300, 432, 116);
    leafCloud(g, r, 398, 372, 100, { fill: '#84c46d' });
    leafCloud(g, r, 210, 508, 84, { fill: '#71b65e' });
    leafCloud(g, r, 520, 356, 70, { fill: '#8ac977' });
    leafCloud(g, r, 298, 322, 78, { fill: '#75ba62' });
    leafCloud(g, r, 158, 602, 62, { fill: '#84c46d' });
    leafCloud(g, r, 636, 548, 62, { fill: '#71b65e' });
    leafCloud(g, r, 670, 668, 52, { fill: '#84c46d' });
    leafCloud(g, r, 232, 826, 48, { fill: '#75ba62' });
    leafCloud(g, r, 438, 268, 58, { fill: '#8ac977' });
    leafCloud(g, r, 604, 640, 36, { fill: '#8ac977' });

    // a few free leaves floating
    g.save();
    g.fillStyle = 'rgba(111,180,95,.8)';
    for (var l = 0; l < 5; l++) {
      var lx = r.range(180, 660), ly = r.range(760, 980), a = r.range(0, TAU);
      g.save();
      g.translate(lx, ly);
      g.rotate(a);
      g.beginPath();
      g.ellipse(0, 0, r.range(4, 7), r.range(2, 3.5), 0, 0, TAU);
      g.fill();
      g.restore();
    }
    g.restore();
  }

  function flower(g, r, x, y, s) {
    g.save();
    g.translate(x, y);
    g.strokeStyle = '#4e8c45';
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(2 * s, 10 * s, 0, 20 * s);
    g.stroke();
    g.fillStyle = '#fffdf4';
    g.strokeStyle = 'rgba(90,120,80,.75)';
    g.lineWidth = 1.4;
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * TAU - Math.PI / 2;
      g.beginPath();
      g.ellipse(Math.cos(a) * 4.4 * s, Math.sin(a) * 4.4 * s, 3.4 * s, 2.4 * s, a, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#ffcf55';
    g.beginPath();
    g.arc(0, 0, 2.6 * s, 0, TAU);
    g.fill();
    g.restore();
  }

  function flowers(g, r) {
    var spots = [
      [196, 1030, 1.1], [152, 1122, 0.9], [560, 1076, 1], [624, 1160, 1.15],
      [420, 1190, 0.95], [286, 1002, 0.8], [690, 1050, 0.85], [92, 1042, 0.75]
    ];
    for (var i = 0; i < spots.length; i++) flower(g, r, spots[i][0], spots[i][1], spots[i][2]);
  }

  /* ------------------------------ scene ------------------------------ */

  var sceneCache = null;

  function buildScene() {
    if (sceneCache) return sceneCache;
    var W = 1000, H = 1600, OX = 140, OY = 160, RES = 2;
    var c = document.createElement('canvas');
    c.width = W * RES;
    c.height = H * RES;
    var g = c.getContext('2d');
    g.scale(RES, RES);
    var r = makeRng(0x51C0FFEE);

    paper(g, W, H, r);
    sky(g, r, W);
    sun(g, r, 735, 338, 54);
    ground(g, r, W, H);

    g.save();
    g.translate(OX, OY);
    drawTree(g, r);
    flowers(g, r);
    g.restore();

    // gentle warm edge shading, like a photographed page
    var edge = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78);
    edge.addColorStop(0, 'rgba(120,95,60,0)');
    edge.addColorStop(1, 'rgba(120,95,60,.13)');
    g.fillStyle = edge;
    g.fillRect(0, 0, W, H);

    sceneCache = {
      canvas: c,
      ox: OX,
      oy: OY,
      w: W,
      h: H,
      anchor: { x: 520, y: 712 }
    };
    return sceneCache;
  }

  /* ------------------------------ little decorations ------------------------------ */

  function heart(g, x, y, s, color, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    g.scale(s, s);
    g.beginPath();
    g.moveTo(0, 3);
    g.bezierCurveTo(-6, -3, -7, -9, -2.5, -9);
    g.bezierCurveTo(-0.6, -9, 0, -6.6, 0, -5.4);
    g.bezierCurveTo(0, -6.6, 0.6, -9, 2.5, -9);
    g.bezierCurveTo(7, -9, 6, -3, 0, 3);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  function note(g, x, y, s, color, alpha, rot) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    g.rotate(rot || 0);
    g.fillStyle = color;
    g.font = '700 ' + Math.round(28 * s) + 'px "Segoe UI Symbol","Segoe Print",serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♪', 0, 0);
    g.restore();
  }

  function star(g, x, y, s, color, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.translate(x, y);
    g.beginPath();
    g.moveTo(0, -s);
    g.quadraticCurveTo(s * 0.18, -s * 0.18, s, 0);
    g.quadraticCurveTo(s * 0.18, s * 0.18, 0, s);
    g.quadraticCurveTo(-s * 0.18, s * 0.18, -s, 0);
    g.quadraticCurveTo(-s * 0.18, -s * 0.18, 0, -s);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  function puff(g, x, y, p, size) {
    // p: 0..1
    g.save();
    var n = 7;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + 0.3;
      var d = (8 + 46 * p) * (0.6 + 0.4 * Math.sin(i * 2.3));
      var rad = 4 + 10 * p * (0.7 + 0.3 * Math.sin(i));
      g.globalAlpha = (1 - p) * 0.55;
      g.fillStyle = '#fffdf4';
      g.strokeStyle = 'rgba(120,105,80,.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y - 8 + Math.sin(a) * d * 0.55, rad, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------ character layout ------------------------------ */

  function layoutCharacter(img, anchor, maxW, maxH) {
    var iw = img.width || 1, ih = img.height || 1;
    var s = Math.min(maxW / iw, maxH / ih);
    var w = iw * s, h = ih * s;
    return {
      x: anchor.x - w / 2,
      y: anchor.y - h,
      w: w,
      h: h,
      cx: anchor.x,
      bottom: anchor.y
    };
  }

  /* ------------------------------ home doodle ------------------------------ */

  function makeHomeDoodle(canvas) {
    var W = 720, H = 440;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var g = canvas.getContext('2d');
    g.scale(dpr, dpr);

    var bg = document.createElement('canvas');
    bg.width = W * dpr;
    bg.height = H * dpr;
    var b = bg.getContext('2d');
    b.scale(dpr, dpr);
    var r = makeRng(41);

    // branch
    limb(b, r, [{ x: 10, y: 352 }, { x: 180, y: 336 }, { x: 380, y: 318 }, { x: 570, y: 300 }, { x: 710, y: 288 }], 26, 8, '#caa072', '#5c4630');
    leafCloud(b, r, 655, 262, 58, { fill: '#84c46d' });
    leafCloud(b, r, 94, 312, 48, { fill: '#75ba62' });
    leafCloud(b, r, 250, 274, 38, { fill: '#8ac977' });

    function blob(t, ctx) {
      var bob = Math.sin(t * 1.7) * 4;
      var cx = 430, cy = 252 + bob;
      var bw = 118, bh = 104;

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#2c2a26';
      ctx.beginPath();
      ctx.ellipse(cx, 334, 66, 10, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // feet
      ctx.strokeStyle = '#2c2a26';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy + bh / 2 - 4);
      ctx.lineTo(cx - 34, 330);
      ctx.moveTo(cx + 30, cy + bh / 2 - 4);
      ctx.lineTo(cx + 34, 330);
      ctx.stroke();

      // body
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, cy + 10);
      ctx.bezierCurveTo(cx - bw / 2, cy - bh / 2 - 8, cx + bw / 2, cy - bh / 2 - 8, cx + bw / 2, cy + 10);
      ctx.bezierCurveTo(cx + bw / 2 - 4, cy + bh / 2 + 8, cx - bw / 2 + 4, cy + bh / 2 + 8, cx - bw / 2, cy + 10);
      ctx.closePath();
      ctx.fillStyle = '#9adcba';
      ctx.fill();
      ctx.strokeStyle = '#2c2a26';
      ctx.lineWidth = 4;
      ctx.stroke();

      // tummy
      ctx.beginPath();
      ctx.ellipse(cx, cy + 24, 34, 26, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,253,244,.75)';
      ctx.fill();

      // arms
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2 + 6, cy + 8);
      ctx.lineTo(cx - bw / 2 - 16, cy - 8);
      ctx.moveTo(cx + bw / 2 - 6, cy + 8);
      ctx.lineTo(cx + bw / 2 + 16, cy - 8);
      ctx.stroke();

      // eyes
      var blink = (Math.sin(t * 0.9) > 0.965) ? 0.12 : 1;
      var ex = 23, ey = -12;
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = '#2c2a26';
      ctx.lineWidth = 3;
      [-1, 1].forEach(function (side, idx) {
        ctx.beginPath();
        ctx.ellipse(cx + side * ex, cy + ey, 15, 17 * blink, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        if (blink > 0.5) {
          var look = Math.sin(t * 0.8 + idx) * 2.5;
          ctx.beginPath();
          ctx.arc(cx + side * ex + look, cy + ey + 1, 6.4, 0, TAU);
          ctx.fillStyle = '#2c2a26';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + side * ex + look - 2, cy + ey - 2, 2, 0, TAU);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.fillStyle = '#fffdf6';
        }
      });

      // cheeks
      ctx.fillStyle = 'rgba(255,138,118,.5)';
      ctx.beginPath();
      ctx.ellipse(cx - 44, cy + 12, 9, 6, 0, 0, TAU);
      ctx.ellipse(cx + 44, cy + 12, 9, 6, 0, 0, TAU);
      ctx.fill();

      // smile
      ctx.strokeStyle = '#2c2a26';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy + 14, 12, 0.25, Math.PI - 0.25);
      ctx.stroke();

      // antenna
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - bh / 2 - 4);
      ctx.quadraticCurveTo(cx + 10, cy - bh / 2 - 22, cx + 22, cy - bh / 2 - 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 24, cy - bh / 2 - 20, 5, 0, TAU);
      ctx.fillStyle = '#ff8a76';
      ctx.fill();
      ctx.strokeStyle = '#2c2a26';
      ctx.stroke();
      ctx.restore();
    }

    return {
      render: function (t) {
        g.clearRect(0, 0, W, H);
        g.drawImage(bg, 0, 0, W, H);
        // floating notes
        note(g, 540 + Math.sin(t * 0.7) * 8, 168 + Math.sin(t * 1.1) * 6, 0.9, '#e35e4b', 0.9, 0.2);
        note(g, 610 + Math.sin(t * 0.6 + 2) * 6, 210 + Math.sin(t * 1.3 + 1) * 5, 0.7, '#4e8c45', 0.75, -0.25);
        heart(g, 300 + Math.sin(t * 0.5 + 1) * 5, 190 + Math.sin(t * 0.9) * 5, 1.2, '#ff8a76', 0.8);
        // the animated blob on top
        blob(t, g);
      }
    };
  }

  /* ------------------------------ exports ------------------------------ */

  return {
    TAU: TAU,
    makeRng: makeRng,
    clamp: clamp,
    lerp: lerp,
    easeInOut: easeInOut,
    easeOut: easeOut,
    inkLine: inkLine,
    limb: limb,
    leafCloud: leafCloud,
    buildScene: buildScene,
    layoutCharacter: layoutCharacter,
    makeHomeDoodle: makeHomeDoodle,
    heart: heart,
    note: note,
    star: star,
    puff: puff
  };
})();
