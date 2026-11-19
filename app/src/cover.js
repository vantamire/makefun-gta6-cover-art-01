// Vice Coast Cover Studio — canvas engine.
// Turns photos and captions into GTA 6-style multi-panel cover art.
// Everything here is drawn on canvas: no Rockstar artwork, logo or font.
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // A small deterministic RNG so a scene draws the same every time.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- grades

  // Each grade is a per-pixel colour transform plus a warm/cool wash.
  var GRADES = {
    sunset: { name: 'Sunset', r: 1.14, g: 1.0, b: 0.86, lift: 6, wash: 'rgba(255,110,40,0.10)' },
    neon: { name: 'Neon Night', r: 0.96, g: 0.94, b: 1.18, lift: 0, wash: 'rgba(150,40,255,0.12)' },
    golden: { name: 'Golden Hour', r: 1.16, g: 1.08, b: 0.78, lift: 8, wash: 'rgba(255,190,60,0.10)' },
    teal: { name: 'Teal Pink', r: 1.0, g: 1.02, b: 1.1, lift: 0, wash: 'rgba(40,200,190,0.08)' },
    mono: { name: 'Mono Noir', r: 1, g: 1, b: 1, lift: 0, wash: null, mono: true },
  };
  var GRADE_ORDER = ['sunset', 'neon', 'golden', 'teal', 'mono'];

  function applyGrade(ctx, w, h, gradeKey) {
    var g = GRADES[gradeKey] || GRADES.sunset;
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var i, r, gr, b, lum;
    for (i = 0; i < d.length; i += 4) {
      r = d[i]; gr = d[i + 1]; b = d[i + 2];
      if (g.mono) {
        lum = 0.299 * r + 0.587 * gr + 0.114 * b;
        lum = clamp((lum - 128) * 1.25 + 128, 0, 255);
        d[i] = lum; d[i + 1] = lum; d[i + 2] = lum;
      } else {
        lum = 0.299 * r + 0.587 * gr + 0.114 * b;
        // Split tone for the teal grade: teal shadows, pink highlights.
        if (gradeKey === 'teal') {
          var t = lum / 255;
          r = r * (1.04 - 0.14 * (1 - t)) + 26 * t;
          b = b * (0.94 + 0.16 * (1 - t));
        }
        d[i] = clamp(r * g.r + g.lift, 0, 255);
        d[i + 1] = clamp(gr * g.g + g.lift * 0.6, 0, 255);
        d[i + 2] = clamp(b * g.b, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    if (g.wash) {
      ctx.fillStyle = g.wash;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------------------------------------------------------------- toon

  // Posterize to 5 levels, push saturation, ink the Sobel edges, cel-shade.
  // The result looks like comic art, never like the raw photo.
  function toonizeImage(img, w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(2, w | 0);
    c.height = Math.max(2, h | 0);
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    var data = x.getImageData(0, 0, c.width, c.height);
    var p = data.data;
    var W = c.width, H = c.height;
    var lum = new Float32Array(W * H);
    var i, px, r, g, b, l;
    var LEVELS = 5;
    for (i = 0; i < p.length; i += 4) {
      r = p[i]; g = p[i + 1]; b = p[i + 2];
      l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i / 4] = l;
      // Saturation boost: push each channel away from luma.
      r = clamp(l + (r - l) * 1.45, 0, 255);
      g = clamp(l + (g - l) * 1.45, 0, 255);
      b = clamp(l + (b - l) * 1.45, 0, 255);
      // Posterize.
      p[i] = Math.round(r / 255 * (LEVELS - 1)) / (LEVELS - 1) * 255;
      p[i + 1] = Math.round(g / 255 * (LEVELS - 1)) / (LEVELS - 1) * 255;
      p[i + 2] = Math.round(b / 255 * (LEVELS - 1)) / (LEVELS - 1) * 255;
    }
    // Sobel edges on luma: ink the strong ones, cel-shade the rest.
    var gx, gy, e, xx, yy;
    for (yy = 1; yy < H - 1; yy++) {
      for (xx = 1; xx < W - 1; xx++) {
        px = yy * W + xx;
        gx = -lum[px - W - 1] - 2 * lum[px - 1] - lum[px + W - 1]
          + lum[px - W + 1] + 2 * lum[px + 1] + lum[px + W + 1];
        gy = -lum[px - W - 1] - 2 * lum[px - W] - lum[px - W + 1]
          + lum[px + W - 1] + 2 * lum[px + W] + lum[px + W + 1];
        e = Math.sqrt(gx * gx + gy * gy);
        i = px * 4;
        if (e > 90) {
          p[i] *= 0.12; p[i + 1] *= 0.12; p[i + 2] *= 0.12;
        } else if (e > 45) {
          p[i] *= 0.55; p[i + 1] *= 0.55; p[i + 2] *= 0.55;
        } else {
          // Cel shading: quantize the brightness into 4 bands.
          l = lum[px];
          var band = l < 64 ? 0.82 : l < 128 ? 0.95 : l < 192 ? 1.05 : 1.12;
          p[i] = clamp(p[i] * band, 0, 255);
          p[i + 1] = clamp(p[i + 1] * band, 0, 255);
          p[i + 2] = clamp(p[i + 2] * band, 0, 255);
        }
      }
    }
    x.putImageData(data, 0, 0);
    return c;
  }

  // Draw an image cover-fitting a rect, anchored at the TOP so heads are
  // never cropped. panX/panY are 0..1 (0.5 = centred), zoom >= 1.
  function drawPhotoAnchoredTop(ctx, img, x, y, w, h, panX, panY, zoom) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    var scale = Math.max(w / iw, h / ih) * (zoom || 1);
    var sw = w / scale, sh = h / scale;
    // Anchor at the top: the source window starts at y=0 unless the user pans down.
    var sx = clamp((iw - sw) * (panX == null ? 0.5 : panX), 0, Math.max(0, iw - sw));
    var sy = clamp((ih - sh) * (panY == null ? 0 : panY), 0, Math.max(0, ih - sh));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // ---------------------------------------------------------------- geometry

  // Corners of a rectangle rotated by angle (radians) about its centre.
  function rotatedCorners(cx, cy, w, h, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    var hw = w / 2, hh = h / 2;
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(function (pt) {
      return [cx + pt[0] * c - pt[1] * s, cy + pt[0] * s + pt[1] * c];
    });
  }

  // Separating-axis test for two convex quads (the panels' rotated rects).
  function quadsOverlap(a, b) {
    function axes(quad) {
      var out = [];
      for (var i = 0; i < 4; i++) {
        var p = quad[i], q = quad[(i + 1) % 4];
        var ex = q[0] - p[0], ey = q[1] - p[1];
        var len = Math.hypot(ex, ey) || 1;
        out.push([-ey / len, ex / len]);
      }
      return out;
    }
    function project(quad, ax) {
      var min = Infinity, max = -Infinity;
      for (var i = 0; i < 4; i++) {
        var v = quad[i][0] * ax[0] + quad[i][1] * ax[1];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return [min, max];
    }
    var all = axes(a).concat(axes(b));
    for (var k = 0; k < all.length; k++) {
      var pa = project(a, all[k]), pb = project(b, all[k]);
      if (pa[1] < pb[0] - 0.5 || pb[1] < pa[0] - 0.5) return false;
    }
    return true;
  }

  // Shrink a rect so its rotated bounding box fits inside its cell.
  function fitTiltedRect(cell, angleDeg) {
    var a = angleDeg * Math.PI / 180;
    var ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
    var bw = cell.w * ca + cell.h * sa;
    var bh = cell.w * sa + cell.h * ca;
    var s = Math.min(cell.w / bw, cell.h / bh, 1);
    var w = cell.w * s, h = cell.h * s;
    return {
      x: cell.x + (cell.w - w) / 2,
      y: cell.y + (cell.h - h) / 2,
      w: w, h: h,
      cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2,
      angle: a,
    };
  }

  // Count overlapping panel pairs in a laid-out cover.
  function countOverlaps(panels) {
    var quads = panels.map(function (p) {
      return rotatedCorners(p.cx, p.cy, p.w, p.h, p.angle || 0);
    });
    var n = 0, pairs = [];
    for (var i = 0; i < quads.length; i++) {
      for (var j = i + 1; j < quads.length; j++) {
        if (quadsOverlap(quads[i], quads[j])) { n++; pairs.push([i, j]); }
      }
    }
    return { count: n, pairs: pairs };
  }

  window.CoverEngine = window.CoverEngine || {};
  var E = window.CoverEngine;
  E.clamp = clamp;
  E.mulberry32 = mulberry32;
  E.GRADES = GRADES;
  E.GRADE_ORDER = GRADE_ORDER;
  E.applyGrade = applyGrade;
  E.toonizeImage = toonizeImage;
  E.drawPhotoAnchoredTop = drawPhotoAnchoredTop;
  E.rotatedCorners = rotatedCorners;
  E.quadsOverlap = quadsOverlap;
  E.fitTiltedRect = fitTiltedRect;
  E.countOverlaps = countOverlaps;
})();

(function () {
  'use strict';
  var E = window.CoverEngine;
  var clamp = E.clamp;
  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- background

  // The Vice City / Leonida sunset that shows through the seams: striped sun,
  // two skyline layers with lit windows and neon signs, glittering sea,
  // beach strip, palm silhouettes, purple wash (0.26 centre, 0.52 edges).
  function drawBackground(ctx, W, H) {
    var horizon = H * 0.60;
    var sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#3b1d5e');
    sky.addColorStop(0.45, '#a83a7d');
    sky.addColorStop(0.8, '#ff5e78');
    sky.addColorStop(1, '#ffb347');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 1);

    // Striped GTA-style sun.
    var sunX = W * 0.72, sunY = H * 0.40, sunR = H * 0.17;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.clip();
    var sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, '#ffe98a');
    sunGrad.addColorStop(0.55, '#ffb347');
    sunGrad.addColorStop(1, '#ff5e3d');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
    // Cut horizontal stripes through the lower half, widening downwards.
    ctx.fillStyle = '#ff5e78';
    var sy = sunY + sunR * 0.05;
    var th = sunR * 0.045;
    while (sy < sunY + sunR) {
      ctx.fillRect(sunX - sunR, sy, sunR * 2, th);
      sy += th * 2.4;
      th *= 1.45;
    }
    ctx.restore();

    // Far skyline: purple silhouette, sparse lit windows.
    drawSkyline(ctx, W, H, horizon, 0.52, '#54255f', 0.35, 11);
    // Near skyline: darker, taller, with neon shop signs.
    drawSkyline(ctx, W, H, horizon, 0.78, '#2a1145', 0.8, 23);
    drawNeonSigns(ctx, W, H, horizon);

    // Sea with a glitter path under the sun.
    var sea = ctx.createLinearGradient(0, horizon, 0, H);
    sea.addColorStop(0, '#274b7a');
    sea.addColorStop(0.5, '#16294f');
    sea.addColorStop(1, '#0c1836');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, W, H - horizon);
    var rng = E.mulberry32(20261119);
    var i, gx, gy, gw;
    for (i = 0; i < 240; i++) {
      gx = sunX + (rng() - 0.5) * W * 0.34 * (0.3 + (rng() * 0.7));
      gy = horizon + rng() * (H - horizon) * 0.92;
      gw = 2 + rng() * 14 * (gy - horizon) / (H - horizon + 1);
      ctx.fillStyle = 'rgba(255,214,120,' + (0.12 + rng() * 0.5) + ')';
      ctx.fillRect(gx, gy, gw, 1.6);
    }

    // Beach strip.
    ctx.fillStyle = '#e0a866';
    ctx.fillRect(0, H * 0.93, W, H * 0.07);
    ctx.fillStyle = '#c98f4e';
    ctx.fillRect(0, H * 0.93, W, 2);

    // Palm silhouettes at both edges.
    drawPalm(ctx, W * 0.045, H * 0.94, H * 0.30, -0.25, '#1c0b33');
    drawPalm(ctx, W * 0.955, H * 0.94, H * 0.26, 0.3, '#1c0b33');
    drawPalm(ctx, W * 0.13, H * 0.94, H * 0.17, -0.1, '#241040');

    // Purple wash: stronger at the edges than the centre.
    var wash = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    wash.addColorStop(0, 'rgba(70,16,110,0.26)');
    wash.addColorStop(1, 'rgba(48,8,88,0.52)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
  }

  // One skyline layer: a row of buildings with lit windows.
  function drawSkyline(ctx, W, H, horizon, heightFrac, color, windowAlpha, seed) {
    var rng = E.mulberry32(seed);
    var base = horizon;
    var x = -W * 0.02;
    ctx.fillStyle = color;
    while (x < W * 1.02) {
      var bw = W * (0.03 + rng() * 0.06);
      var bh = H * heightFrac * (0.35 + rng() * 0.65);
      ctx.fillRect(x, base - bh, bw, bh);
      // Aerial on some roofs.
      if (rng() > 0.72) {
        ctx.fillRect(x + bw / 2 - 1, base - bh - H * 0.035, 2, H * 0.035);
      }
      // Lit windows.
      var cols = Math.max(1, Math.floor(bw / (W * 0.012)));
      var rows = Math.max(1, Math.floor(bh / (H * 0.035)));
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          if (rng() > 0.62) {
            ctx.fillStyle = 'rgba(255,214,120,' + windowAlpha + ')';
            ctx.fillRect(x + 3 + c * (bw - 6) / cols, base - bh + 4 + r * (bh - 8) / rows, 2.5, 3.5);
            ctx.fillStyle = color;
          }
        }
      }
      x += bw + W * 0.004;
    }
  }

  // Glowing neon shop signs on the near skyline. Abstract lit bars, never
  // lettering: a letter fragment showing through a panel seam would read
  // as a stray glyph, while a glow bar just reads as neon.
  function drawNeonSigns(ctx, W, H, horizon) {
    var signs = [
      { x: 0.16, y: 0.47, w: 0.075, color: '#ff5da2' },
      { x: 0.42, y: 0.52, w: 0.055, color: '#4df3ff' },
      { x: 0.63, y: 0.45, w: 0.07, color: '#ffe14d' },
      { x: 0.85, y: 0.50, w: 0.06, color: '#7dff6a' },
    ];
    ctx.save();
    for (var i = 0; i < signs.length; i++) {
      var s = signs[i];
      var bw = W * s.w, bh = Math.max(6, H * 0.028);
      var sx = W * s.x - bw / 2, sy = H * s.y - bh / 2;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = bh * 1.1;
      ctx.fillStyle = s.color;
      ctx.fillRect(sx, sy, bw, bh);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(sx + bw * 0.12, sy + bh * 0.28, bw * 0.76, bh * 0.22);
    }
    ctx.restore();
  }

  // A palm silhouette: curved trunk and six fronds.
  function drawPalm(ctx, x, y, h, lean, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(3, h * 0.045);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * h * 0.5, y - h * 0.55, x + lean * h, y - h);
    ctx.stroke();
    var tx = x + lean * h, ty = y - h;
    ctx.lineWidth = Math.max(2, h * 0.02);
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI * (0.08 + i * 0.17) + lean * 0.4;
      var len = h * (0.34 + (i % 2) * 0.07);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(
        tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - h * 0.06,
        tx + Math.cos(a) * len, ty + Math.sin(a) * len + h * 0.10);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- scenes

  // A procedural comic scene, drawn at the panel's own pixel size.
  function drawScene(ctx, kind, w, h) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    if (kind === 'car') drawCarScene(ctx, w, h);
    else if (kind === 'sunset') drawSunsetScene(ctx, w, h);
    else if (kind === 'palms') drawPalmsScene(ctx, w, h);
    else drawSkylineScene(ctx, w, h);
    ctx.restore();
  }

  function drawSunsetScene(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7b2d8b');
    g.addColorStop(0.55, '#ff5e78');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var cx = w * 0.68, cy = h * 0.42, r = h * 0.26;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    var sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, '#ffe98a'); sg.addColorStop(1, '#ff5e3d');
    ctx.fillStyle = sg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ff5e78';
    var y = cy + r * 0.05, th = r * 0.05;
    while (y < cy + r) { ctx.fillRect(cx - r, y, r * 2, th); y += th * 2.4; th *= 1.45; }
    ctx.restore();
    var sea = ctx.createLinearGradient(0, h * 0.62, 0, h);
    sea.addColorStop(0, '#274b7a'); sea.addColorStop(1, '#0c1836');
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    var rng = E.mulberry32(7);
    for (var i = 0; i < 90; i++) {
      ctx.fillStyle = 'rgba(255,214,120,' + (0.15 + rng() * 0.5) + ')';
      ctx.fillRect(cx + (rng() - 0.5) * w * 0.3, h * 0.62 + rng() * h * 0.34, 2 + rng() * 10, 1.5);
    }
    ctx.fillStyle = '#241040';
    ctx.fillRect(0, h * 0.58, w, h * 0.04);
    drawPalm(ctx, w * 0.08, h * 0.98, h * 0.42, -0.2, '#160a2c');
    drawPalm(ctx, w * 0.92, h * 0.98, h * 0.36, 0.25, '#160a2c');
  }

  function drawCarScene(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff9a3d');
    g.addColorStop(0.6, '#ff5e78');
    g.addColorStop(1, '#8a2f6d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Low sun and skyline.
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath(); ctx.arc(w * 0.78, h * 0.30, h * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3b1d5e';
    var rng = E.mulberry32(21);
    var x = 0;
    while (x < w) {
      var bw = w * (0.06 + rng() * 0.08), bh = h * (0.10 + rng() * 0.16);
      ctx.fillRect(x, h * 0.52 - bh, bw, bh);
      x += bw + 2;
    }
    // Road.
    ctx.fillStyle = '#1d1426';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62); ctx.lineTo(w, h * 0.58);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = Math.max(2, h * 0.012);
    ctx.setLineDash([w * 0.06, w * 0.04]);
    ctx.beginPath(); ctx.moveTo(0, h * 0.78); ctx.lineTo(w, h * 0.74); ctx.stroke();
    ctx.setLineDash([]);
    // The sports car, side profile.
    var carY = h * 0.66, carH = h * 0.30, carX = w * 0.08, carW = w * 0.84;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = h * 0.03;
    ctx.shadowOffsetY = h * 0.02;
    ctx.fillStyle = '#e8326b';
    ctx.beginPath();
    ctx.moveTo(carX, carY);
    ctx.lineTo(carX + carW * 0.06, carY - carH * 0.28);
    ctx.lineTo(carX + carW * 0.30, carY - carH * 0.52);
    ctx.lineTo(carX + carW * 0.62, carY - carH * 0.55);
    ctx.lineTo(carX + carW * 0.86, carY - carH * 0.30);
    ctx.lineTo(carX + carW, carY - carH * 0.12);
    ctx.lineTo(carX + carW * 0.98, carY);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Cabin glass.
    ctx.fillStyle = '#1b2a4a';
    ctx.beginPath();
    ctx.moveTo(carX + carW * 0.32, carY - carH * 0.47);
    ctx.lineTo(carX + carW * 0.60, carY - carH * 0.50);
    ctx.lineTo(carX + carW * 0.76, carY - carH * 0.28);
    ctx.lineTo(carX + carW * 0.34, carY - carH * 0.26);
    ctx.closePath(); ctx.fill();
    // Glass shine.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(carX + carW * 0.38, carY - carH * 0.46);
    ctx.lineTo(carX + carW * 0.48, carY - carH * 0.47);
    ctx.lineTo(carX + carW * 0.42, carY - carH * 0.27);
    ctx.closePath(); ctx.fill();
    // Spoiler.
    ctx.fillStyle = '#b01e4e';
    ctx.fillRect(carX + carW * 0.90, carY - carH * 0.52, carW * 0.10, carH * 0.07);
    ctx.fillRect(carX + carW * 0.93, carY - carH * 0.46, carW * 0.02, carH * 0.20);
    // Headlight beam.
    var beam = ctx.createLinearGradient(carX + carW, 0, w, 0);
    beam.addColorStop(0, 'rgba(255,240,170,0.85)');
    beam.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(carX + carW * 0.99, carY - carH * 0.10);
    ctx.lineTo(w, carY - carH * 0.30);
    ctx.lineTo(w, carY + carH * 0.05);
    ctx.lineTo(carX + carW * 0.99, carY + carH * 0.02);
    ctx.closePath(); ctx.fill();
    // Wheels.
    drawWheel(ctx, carX + carW * 0.22, carY + carH * 0.02, carH * 0.17);
    drawWheel(ctx, carX + carW * 0.78, carY + carH * 0.02, carH * 0.17);
    // Ground reflection.
    ctx.fillStyle = 'rgba(232,50,107,0.25)';
    ctx.fillRect(carX + carW * 0.05, carY + carH * 0.20, carW * 0.9, carH * 0.06);
  }

  function drawWheel(ctx, x, y, r) {
    ctx.fillStyle = '#0d0d12';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8ccd4';
    ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = r * 0.10;
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.22);
      ctx.lineTo(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52);
      ctx.stroke();
    }
  }

  function drawPalmsScene(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2b1055');
    g.addColorStop(0.5, '#c2275b');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe98a';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.34, h * 0.14, 0, TAU); ctx.fill();
    drawPalm(ctx, w * 0.22, h * 0.96, h * 0.62, -0.22, '#1c0b33');
    drawPalm(ctx, w * 0.78, h * 0.96, h * 0.52, 0.28, '#1c0b33');
    drawPalm(ctx, w * 0.52, h * 0.98, h * 0.34, -0.05, '#241040');
    ctx.fillStyle = '#e0a866';
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
  }

  function drawSkylineScene(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#160a2c');
    g.addColorStop(0.6, '#5b1a63');
    g.addColorStop(1, '#ff5e78');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    var rng = E.mulberry32(33);
    var x = 0;
    ctx.fillStyle = '#241040';
    while (x < w) {
      var bw = w * (0.07 + rng() * 0.09), bh = h * (0.30 + rng() * 0.45);
      ctx.fillRect(x, h - bh, bw, bh);
      for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 4; c++) {
          if (rng() > 0.55) {
            ctx.fillStyle = rng() > 0.5 ? 'rgba(255,214,120,0.9)' : 'rgba(77,243,255,0.8)';
            ctx.fillRect(x + 3 + c * (bw - 6) / 4, h - bh + 5 + r * (bh - 10) / 8, 3, 4);
            ctx.fillStyle = '#241040';
          }
        }
      }
      x += bw + 2;
    }
    // One big neon sign.
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.max(12, h * 0.11) + 'px Arial, sans-serif';
    ctx.shadowColor = '#ff5da2';
    ctx.shadowBlur = h * 0.04;
    ctx.fillStyle = '#ff5da2';
    ctx.fillText('VICE', w * 0.5, h * 0.22);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('VICE', w * 0.5, h * 0.22);
    ctx.restore();
  }

  E.drawBackground = drawBackground;
  E.drawScene = drawScene;
  E.drawPalm = drawPalm;
})();

(function () {
  'use strict';
  var E = window.CoverEngine;
  var clamp = E.clamp;
  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- layouts

  var LAYOUTS = ['mosaic', 'hero', 'tilted', 'full'];
  var LAYOUT_NAMES = {
    mosaic: 'Varied mosaic',
    hero: 'Hero + 3 panels',
    tilted: 'Dynamic collage',
    full: 'Full-bleed photo',
  };

  // General seam, 1..3 px, and the bottom-pair gap, about 5 px at 1920 wide.
  function gapsFor(W) {
    return {
      general: clamp(Math.round(W * 0.0015), 1, 3),
      bottom: Math.max(4, Math.round(5 * W / 1920)),
    };
  }

  // Lay out one cover. Returns the title rect (straight) and the panels
  // (each with centre, size and rotation), plus the measured gaps.
  // kind: 'photo' with photoIndex, or 'scene' with scene name.
  //
  // Seams stay tight by construction: panels are placed, not gridded.
  // Neighbours that tilt the same way keep parallel shared edges, and
  // each panel is slid into place until the shortest distance between
  // its corners and its neighbours is exactly the wanted gap (1-3 px
  // generally, about 5 px between the two bottom panels). No panel is
  // shrunk to fit, so the seams never widen into background bands.
  function layoutCover(layout, W, H) {
    var gaps = gapsFor(W);
    var g = gaps.general, gb = gaps.bottom;
    var title = { x: 0, y: 0, w: Math.round(W * 0.30), h: Math.round(H * 0.38), cx: 0, cy: 0, angle: 0 };
    title.cx = title.x + title.w / 2;
    title.cy = title.y + title.h / 2;
    var panels = [];

    function quadOf(p) {
      return E.rotatedCorners(p.cx, p.cy, p.w, p.h, p.angle || 0);
    }
    function minDistTo(p, list) {
      var q = quadOf(p), best = Infinity;
      for (var i = 0; i < list.length; i++) {
        best = Math.min(best, quadDistance(q, quadOf(list[i])));
      }
      return best;
    }
    function bboxOf(p) {
      var a = Math.abs(p.angle || 0);
      return {
        w: p.w * Math.cos(a) + p.h * Math.sin(a),
        h: p.w * Math.sin(a) + p.h * Math.cos(a),
      };
    }
    function finish(p) {
      var b = bboxOf(p);
      p.x = p.cx - b.w / 2;
      p.y = p.cy - b.h / 2;
      return p;
    }
    // Slide a panel right until it sits exactly `gap` from everything placed.
    function placeRight(p, list, gap) {
      var start = p.cx, best = start, bestD = -1, found = false;
      for (var s = start; s <= start + 320; s += 2) {
        p.cx = s;
        var d = minDistTo(p, list);
        if (d > bestD) { bestD = d; best = s; }
        if (d >= gap) {
          var a = s - 2, b = s;
          for (var k = 0; k < 8; k++) {
            var mid = (a + b) / 2;
            p.cx = mid;
            if (minDistTo(p, list) >= gap) b = mid; else a = mid;
          }
          p.cx = b;
          found = true;
          break;
        }
      }
      if (!found) p.cx = best;
      return finish(p);
    }
    // Slide a panel down until it sits exactly `gap` below everything placed.
    function placeBelow(p, list, gap) {
      var start = p.cy, best = start, bestD = -1, found = false;
      for (var s = start; s <= start + 320; s += 2) {
        p.cy = s;
        var d = minDistTo(p, list);
        if (d > bestD) { bestD = d; best = s; }
        if (d >= gap) {
          var a = s - 2, b = s;
          for (var k = 0; k < 8; k++) {
            var mid = (a + b) / 2;
            p.cy = mid;
            if (minDistTo(p, list) >= gap) b = mid; else a = mid;
          }
          p.cy = b;
          found = true;
          break;
        }
      }
      if (!found) p.cy = best;
      return finish(p);
    }
    // Slide a whole row down together until every panel of it sits exactly
    // `gap` below everything placed. (A row's second panel can overlap the
    // row above even when its first panel clears it, so the row moves as one.)
    function placeBelowRow(row, list, gap) {
      var offsets = row.map(function (p) { return p.cy - row[0].cy; });
      function setCy(cy) {
        for (var i = 0; i < row.length; i++) row[i].cy = cy + offsets[i];
      }
      function rowDist() {
        var m = Infinity;
        for (var i = 0; i < row.length; i++) m = Math.min(m, minDistTo(row[i], list));
        return m;
      }
      var start = row[0].cy, best = start, bestD = -1, found = false;
      for (var s = start; s <= start + 320; s += 2) {
        setCy(s);
        var d = rowDist();
        if (d > bestD) { bestD = d; best = s; }
        if (d >= gap) {
          var a = s - 2, b = s;
          for (var k = 0; k < 8; k++) {
            var mid = (a + b) / 2;
            setCy(mid);
            if (rowDist() >= gap) b = mid; else a = mid;
          }
          setCy(b);
          found = true;
          break;
        }
      }
      if (!found) setCy(best);
      for (var j = 0; j < row.length; j++) finish(row[j]);
      return row;
    }
    // Centre spacing for two panels that tilt the same way: their shared
    // edges stay parallel, so this spacing gives exactly `gap` between them.
    function spaceAfter(prev, next, gap) {
      var th = Math.abs(next.angle || 0);
      next.cx = prev.cx + ((prev.w + next.w) / 2 + gap) / Math.cos(th);
      next.cy = prev.cy;
      return finish(next);
    }
    function panel(kind, w, h, angleDeg) {
      var p = { x: 0, y: 0, w: w, h: h, cx: 0, cy: 0, angle: angleDeg * Math.PI / 180, kind: kind.kind, photoIndex: kind.photoIndex, scene: kind.scene };
      panels.push(p);
      return p;
    }
    // Last resort: nudge the layout until the separating-axis test is clear.
    function clearOverlaps(shiftFn) {
      for (var s = 0; s < 40; s++) {
        var list = layout === 'full' ? panels : [title].concat(panels);
        if (E.countOverlaps(list).count === 0) return;
        shiftFn();
      }
    }

    if (layout === 'mosaic') {
      var photoW = (W - title.w - 2 * g) / 2;
      var p0 = panel({ kind: 'photo', photoIndex: 0 }, photoW, title.h, -3);
      p0.cy = title.cy;
      p0.cx = title.cx + title.w / 2 + photoW / 2;
      placeRight(p0, [title], g);
      var p1 = panel({ kind: 'photo', photoIndex: 1 }, photoW, title.h, -3);
      p1.cy = title.cy;
      spaceAfter(p0, p1, g);
      var botH = H - title.h - g;
      var botW = (W - gb) / 2;
      var car = panel({ kind: 'scene', scene: 'car' }, botW, botH, 2);
      car.cy = title.h + g + botH / 2;
      car.cx = (car.w * Math.cos(car.angle) + car.h * Math.sin(Math.abs(car.angle))) / 2;
      var sun = panel({ kind: 'scene', scene: 'sunset' }, botW, botH, 2);
      spaceAfter(car, sun, gb);
      placeBelowRow([car, sun], [title, p0, p1], g);
      clearOverlaps(function () {
        car.cy += 2; sun.cy += 2; finish(car); finish(sun);
      });
    } else if (layout === 'hero') {
      var heroW = Math.round(W * 0.62);
      var hero = panel({ kind: 'photo', photoIndex: 0 }, heroW - gb, H, -2);
      hero.cy = H / 2;
      hero.cx = (hero.w * Math.cos(hero.angle) + hero.h * Math.sin(Math.abs(hero.angle))) / 2;
      finish(hero);
      // Title column: slide right until the title clears the hero.
      title.x = heroW;
      title.w = W - heroW;
      title.cx = title.x + title.w / 2;
      var colW = title.w;
      var restH = (H - title.h - 2 * g) / 2;
      var palms = panel({ kind: 'scene', scene: 'palms' }, colW, restH, 3);
      palms.cx = title.cx;
      palms.cy = title.h + g + restH / 2;
      var sunset = panel({ kind: 'scene', scene: 'sunset' }, colW, restH, 3);
      sunset.cx = title.cx;
      var th = Math.abs(sunset.angle);
      sunset.cy = palms.cy + ((palms.h + sunset.h) / 2 + g) / Math.cos(th);
      finish(palms);
      finish(sunset);
      finish(title);
      // The tilted column panels lean further left than the straight title,
      // so the whole column must clear the hero, with 2 px of slack.
      var guard = 0;
      while (guard++ < 200 && (minDistTo(title, [hero]) < gb + 2 || minDistTo(palms, [hero]) < gb + 2 || minDistTo(sunset, [hero]) < gb + 2)) {
        title.x += 1; title.w = W - title.x; title.cx = title.x + title.w / 2;
        palms.cx += 1; sunset.cx += 1;
        finish(title); finish(palms); finish(sunset);
      }
      // Keep the column one width: the tilted panels take the title's width.
      palms.w = title.w; sunset.w = title.w;
      palms.cx = title.cx; sunset.cx = title.cx;
      finish(palms); finish(sunset);
      placeBelow(palms, [title, hero], g);
      sunset.cy = palms.cy + ((palms.h + sunset.h) / 2 + g) / Math.cos(th);
      finish(sunset);
      clearOverlaps(function () {
        title.x += 2; title.w = W - title.x; title.cx = title.x + title.w / 2;
        palms.cx += 2; sunset.cx += 2;
        finish(title); finish(palms); finish(sunset);
      });
    } else if (layout === 'tilted') {
      var topW = W - title.w - g;
      var t0 = panel({ kind: 'photo', photoIndex: 0 }, topW, title.h, -4);
      t0.cy = title.cy;
      t0.cx = title.cx + title.w / 2 + topW / 2;
      placeRight(t0, [title], g);
      var botH2 = H - title.h - g;
      var botW2 = (W - gb) / 2;
      var car2 = panel({ kind: 'scene', scene: 'car' }, botW2, botH2, 3);
      car2.cy = title.h + g + botH2 / 2;
      car2.cx = (car2.w * Math.cos(car2.angle) + car2.h * Math.sin(Math.abs(car2.angle))) / 2;
      var ph = panel({ kind: 'photo', photoIndex: 1 }, botW2, botH2, 3);
      spaceAfter(car2, ph, gb);
      placeBelowRow([car2, ph], [title, t0], g);
      clearOverlaps(function () {
        car2.cy += 2; ph.cy += 2; finish(car2); finish(ph);
      });
    } else {
      // Full-bleed: one photo fills the cover; the title floats on top.
      var full = panel({ kind: 'photo', photoIndex: 0 }, W, H, 0);
      full.cx = W / 2; full.cy = H / 2;
      finish(full);
    }

    return { layout: layout, W: W, H: H, title: title, panels: panels, gaps: gaps };
  }


  // Shortest distance between two quads (0 when they touch or overlap).
  function quadDistance(a, b) {
    function segDist(p1, p2, p3, p4) {
      function ptSeg(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay;
        var len2 = dx * dx + dy * dy;
        var t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      function segSeg(p1, p2, p3, p4) {
        // 0 when the segments cross.
        function orient(ax, ay, bx, by, cx, cy) {
          return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        }
        var d1 = orient(p3[0], p3[1], p4[0], p4[1], p1[0], p1[1]);
        var d2 = orient(p3[0], p3[1], p4[0], p4[1], p2[0], p2[1]);
        var d3 = orient(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
        var d4 = orient(p1[0], p1[1], p2[0], p2[1], p4[0], p4[1]);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
        return Math.min(
          ptSeg(p1[0], p1[1], p3[0], p3[1], p4[0], p4[1]),
          ptSeg(p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]),
          ptSeg(p3[0], p3[1], p1[0], p1[1], p2[0], p2[1]),
          ptSeg(p4[0], p4[1], p1[0], p1[1], p2[0], p2[1]));
      }
      return segSeg(p1, p2, p3, p4);
    }
    var best = Infinity;
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        best = Math.min(best, segDist(a[i], a[(i + 1) % 4], b[j], b[(j + 1) % 4]));
      }
    }
    return best;
  }

  // Measure a laid-out cover: overlaps (must be 0) and the real gaps.
  function measureLayout(layout, W, H) {
    var lay = layoutCover(layout, W, H);
    var list = layout === 'full' ? lay.panels : [lay.title].concat(lay.panels);
    var ov = E.countOverlaps(list);
    // Bottom pair: the two panels whose bottoms sit lowest, side by side.
    var bottom = lay.panels.filter(function (p) { return p.y + p.h > H * 0.9; });
    var bottomGap = null;
    if (bottom.length >= 2) {
      bottom.sort(function (a, b) { return a.x - b.x; });
      var qa = E.rotatedCorners(bottom[0].cx, bottom[0].cy, bottom[0].w, bottom[0].h, bottom[0].angle || 0);
      var qb = E.rotatedCorners(bottom[1].cx, bottom[1].cy, bottom[1].w, bottom[1].h, bottom[1].angle || 0);
      bottomGap = Math.round(quadDistance(qa, qb) * 10) / 10;
    }
    return { layout: layout, W: W, H: H, overlaps: ov.count, pairs: ov.pairs, bottomGap: bottomGap, gaps: lay.gaps };
  }

  // ---------------------------------------------------------------- title

  function drawTitlePanel(ctx, t, title, subtitle) {
    var w = t.w, h = t.h;
    var g = ctx.createLinearGradient(0, t.y, 0, t.y + h);
    g.addColorStop(0, '#2a0a4a');
    g.addColorStop(0.55, '#8a1d5e');
    g.addColorStop(1, '#c2275b');
    ctx.fillStyle = g;
    ctx.fillRect(t.x, t.y, w, h);
    // Thin gold frame.
    ctx.strokeStyle = 'rgba(255,214,120,0.85)';
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.strokeRect(t.x + 2, t.y + 2, w - 4, h - 4);

    var cx = t.x + w / 2;
    // Title: big Anton, sunset gradient, dark outline.
    var titleSize = Math.min(w * 0.21, h * 0.32);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = titleSize + 'px Anton, "Arial Black", sans-serif';
    var grad = ctx.createLinearGradient(0, t.y + h * 0.18, 0, t.y + h * 0.52);
    grad.addColorStop(0, '#ffe98a');
    grad.addColorStop(0.5, '#ffb347');
    grad.addColorStop(1, '#ff5e78');
    ctx.lineWidth = Math.max(2, titleSize * 0.09);
    ctx.strokeStyle = '#1c0b33';
    ctx.lineJoin = 'round';
    var lines = String(title || 'VICE COAST').toUpperCase().split(/\s+/);
    var ly = t.y + h * 0.335;
    var lh = titleSize * 1.02;
    var startY = ly - (lines.length - 1) * lh / 2;
    for (var i = 0; i < lines.length; i++) {
      ctx.strokeText(lines[i], cx, startY + i * lh);
      ctx.fillStyle = grad;
      ctx.fillText(lines[i], cx, startY + i * lh);
    }
    // Subtitle in Pacifico.
    var subSize = Math.min(w * 0.085, h * 0.13);
    ctx.font = subSize + 'px Pacifico, cursive';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4;
    ctx.fillText(subtitle || 'chase the sunset', cx, t.y + h * 0.66);
    ctx.shadowBlur = 0;
    // HEAT 5 ribbon.
    var rw = w * 0.44, rh = h * 0.115;
    var rx = cx - rw / 2, ry = t.y + h * 0.76;
    ctx.fillStyle = '#e8323f';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(rx, ry); ctx.lineTo(rx - rw * 0.09, ry + rh / 2); ctx.lineTo(rx, ry + rh);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw + rw * 0.09, ry + rh / 2); ctx.lineTo(rx + rw, ry + rh);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 ' + (rh * 0.52) + 'px Arial, sans-serif';
    ctx.fillText('★ HEAT 5', cx, ry + rh / 2 + 1);
    ctx.restore();
  }

  // ---------------------------------------------------------------- render

  var noiseCache = null;
  function grainCanvas() {
    if (noiseCache) return noiseCache;
    var c = document.createElement('canvas');
    c.width = 140; c.height = 140;
    var x = c.getContext('2d');
    var d = x.createImageData(140, 140);
    var rng = E.mulberry32(99);
    for (var i = 0; i < d.data.length; i += 4) {
      var v = 110 + rng() * 90;
      d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    noiseCache = c;
    return c;
  }

  // Render a cover into a canvas of W x H. state:
  // { layout, title, subtitle, grade, grain, vignette,
  //   photos: [HTMLImageElement|null], assignments: per-panel override,
  //   pans: [{x,y,zoom}] per photo, toon: bool }
  function renderCover(canvas, state) {
    var W = canvas.width, H = canvas.height;
    var ctx = canvas.getContext('2d');
    var lay = layoutCover(state.layout || 'mosaic', W, H);
    var toonCache = {};

    function photoFor(panel) {
      if (panel.kind === 'photo') return state.photos[panel.photoIndex] || null;
      return null;
    }
    function toonFor(img, w, h) {
      var key = (state.photos.indexOf(img)) + ':' + w + 'x' + h;
      if (!toonCache[key]) toonCache[key] = E.toonizeImage(img, Math.min(w, 900), Math.min(h, 900));
      return toonCache[key];
    }

    // 1. Sunset background shows through the seams.
    E.drawBackground(ctx, W, H);

    // 2. Panels, each clipped to its own (possibly rotated) rect.
    for (var i = 0; i < lay.panels.length; i++) {
      var p = lay.panels[i];
      ctx.save();
      ctx.translate(p.cx, p.cy);
      ctx.rotate(p.angle || 0);
      ctx.beginPath();
      ctx.rect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.clip();
      var img = photoFor(p);
      if (img) {
        var pan = (state.pans && state.pans[p.photoIndex]) || { x: 0.5, y: 0, zoom: 1 };
        var src = state.toon === false ? img : toonFor(img, Math.round(p.w), Math.round(p.h));
        E.drawPhotoAnchoredTop(ctx, src, -p.w / 2, -p.h / 2, p.w, p.h, pan.x, pan.y, pan.zoom);
      } else if (p.kind === 'scene') {
        // Scenes are drawn into a scratch canvas, then placed rotated.
        ctx.restore();
        ctx.save();
        ctx.translate(p.cx, p.cy);
        ctx.rotate(p.angle || 0);
        var sc = document.createElement('canvas');
        sc.width = Math.max(2, Math.round(p.w));
        sc.height = Math.max(2, Math.round(p.h));
        E.drawScene(sc.getContext('2d'), p.scene, sc.width, sc.height);
        ctx.drawImage(sc, -p.w / 2, -p.h / 2, p.w, p.h);
      }
      // Panel edge: a thin dark keyline so panels read as separate plates.
      ctx.strokeStyle = 'rgba(20,6,36,0.85)';
      ctx.lineWidth = Math.max(1.5, W * 0.0012);
      ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    // 3. Title panel, always straight and on top.
    drawTitlePanel(ctx, lay.title, state.title, state.subtitle);

    // 4. Grade, grain, vignette over the whole cover.
    E.applyGrade(ctx, W, H, state.grade || 'sunset');
    if (state.grain !== false) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      var n = grainCanvas();
      var pat = ctx.createPattern(n, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (state.vignette !== false) {
      var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(20,0,40,0)');
      vg.addColorStop(1, 'rgba(20,0,40,0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    return lay;
  }

  // Render and return a PNG blob at the requested size.
  function exportPNG(state, w, h) {
    return new Promise(function (resolve, reject) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      renderCover(c, state);
      if (c.toBlob) c.toBlob(function (b) { b ? resolve(b) : reject(new Error('export failed')); }, 'image/png');
      else reject(new Error('toBlob unavailable'));
    });
  }

  E.LAYOUTS = LAYOUTS;
  E.LAYOUT_NAMES = LAYOUT_NAMES;
  E.gapsFor = gapsFor;
  E.layoutCover = layoutCover;
  E.measureLayout = measureLayout;
  E.quadDistance = quadDistance;
  E.drawTitlePanel = drawTitlePanel;
  E.renderCover = renderCover;
  E.exportPNG = exportPNG;
})();
