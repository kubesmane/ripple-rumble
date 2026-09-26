/* =========================================================================
   RIPPLE RUMBLE — roster definitions + procedural "vinyl toy" fighter art
   Every fighter is drawn with canvas paths: no image assets anywhere.
   ========================================================================= */

/* ------------------------------------------------------------ draw helpers */
function vGrad(ctx, yTop, yBot, light, base, dark) {
  var g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, dark);
  return g;
}
function shade(hex, amt) {
  var c = hex.replace('#', '');
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function ell(ctx, x, y, rx, ry, rot) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
}
function fillEll(ctx, x, y, rx, ry, fill, rot) {
  ell(ctx, x, y, rx, ry, rot); ctx.fillStyle = fill; ctx.fill();
}
function outline(ctx, w, col) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
}
/** Two–segment limb drawn as rounded strokes (toy-plastic look). */
function limb(ctx, ax, ay, bx, by, cx, cy, w, col, dark) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy);
  ctx.lineWidth = w + 6; ctx.strokeStyle = dark; ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
  // joint highlight
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.lineWidth = Math.max(2, w * 0.22); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
}
/** Ripple / XRP style four-lobe mark. */
function drawRippleMark(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var s = size;
  ctx.lineWidth = s * 0.30;
  ctx.beginPath();
  ctx.moveTo(-s * 0.66, -s * 0.60);
  ctx.quadraticCurveTo(0, 0, s * 0.66, s * 0.60);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.66, s * 0.60);
  ctx.quadraticCurveTo(0, 0, s * 0.66, -s * 0.60);
  ctx.stroke();
  [[-0.66, -0.60], [-0.66, 0.60], [0.66, -0.60], [0.66, 0.60]].forEach(function (p) {
    ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, s * 0.40, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

/* ------------------------------------------------------------- head pieces */
function eyeBall(ctx, x, y, rx, ry, pupilDX, pupilDY, irisCol, pupilScale) {
  fillEll(ctx, x, y, rx, ry, '#fdfdfd');
  ell(ctx, x, y, rx, ry); outline(ctx, 2.4, 'rgba(20,12,8,0.75)');
  fillEll(ctx, x + pupilDX, y + pupilDY, rx * (pupilScale || 0.52), ry * (pupilScale || 0.52) * 1.05, irisCol || '#20304a');
  fillEll(ctx, x + pupilDX, y + pupilDY, rx * 0.26, ry * 0.3, '#100c10');
  fillEll(ctx, x + pupilDX - rx * 0.22, y + pupilDY - ry * 0.3, rx * 0.17, ry * 0.18, 'rgba(255,255,255,0.9)');
}
function angryBrow(ctx, x, y, w, tilt, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, -w * 0.18);
  outline(ctx, 7, col); ctx.restore();
}
function whiskers(ctx, x, y, dir, col) {
  ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (var i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y + i * 4);
    ctx.quadraticCurveTo(x + dir * 20, y + i * 7 - 3, x + dir * 34, y + i * 10 - 6);
    ctx.stroke();
  }
  ctx.restore();
}

/* =========================================================================
   HEADS — each drawn centred on (0,0), facing +x (mostly 3/4 to camera)
   `st` carries expression state: {hurt, dizzy, ko, mouth, anger}
   ========================================================================= */
var HEADS = {
  /* ------------------------------------------------- KING BRUISER (bear) */
  bruiser: function (ctx, c, st, R) {
    var fx = 4; // feature shift toward camera-facing side
    // ears
    [[-R * 0.72, -R * 0.74], [R * 0.66, -R * 0.82]].forEach(function (p, i) {
      fillEll(ctx, p[0] + fx * 0.4, p[1], R * 0.33, R * 0.33, c.body);
      ell(ctx, p[0] + fx * 0.4, p[1], R * 0.33, R * 0.33); outline(ctx, 3, c.line);
      fillEll(ctx, p[0] + fx * 0.4 + 1, p[1] + 2, R * 0.17, R * 0.17, shade(c.body, -0.12));
    });
    // skull
    ell(ctx, 0, 0, R, R * 0.99);
    ctx.fillStyle = vGrad(ctx, -R, R, c.light, c.body, c.dark); ctx.fill();
    outline(ctx, 3.4, c.line);
    // muzzle
    fillEll(ctx, fx + R * 0.16, R * 0.34, R * 0.58, R * 0.40, c.muzzle);
    ell(ctx, fx + R * 0.16, R * 0.34, R * 0.58, R * 0.40); outline(ctx, 2.6, c.line);
    // nose
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.16 - R * 0.17, R * 0.16);
    ctx.quadraticCurveTo(fx + R * 0.16, R * 0.36, fx + R * 0.16 + R * 0.17, R * 0.16);
    ctx.quadraticCurveTo(fx + R * 0.16, R * 0.04, fx + R * 0.16 - R * 0.17, R * 0.16);
    ctx.fillStyle = '#241812'; ctx.fill();
    // mouth (permanent scowl)
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.16 - R * 0.26, R * 0.56);
    ctx.quadraticCurveTo(fx + R * 0.16, R * (st.ko ? 0.74 : 0.44), fx + R * 0.16 + R * 0.26, R * 0.56);
    outline(ctx, 3, '#3a2418');
    // eyes — heavy-lidded, unimpressed
    var ey = -R * 0.12, sq = st.ko ? 0.2 : (st.hurt ? 0.5 : 1);
    if (st.ko) {
      ['-', '+'].forEach(function (s, i) {
        var x = (i ? R * 0.4 : -R * 0.3) + fx;
        ctx.beginPath(); ctx.moveTo(x - 9, ey - 9); ctx.lineTo(x + 9, ey + 9);
        ctx.moveTo(x + 9, ey - 9); ctx.lineTo(x - 9, ey + 9);
        outline(ctx, 4.5, '#241812');
      });
    } else {
      eyeBall(ctx, -R * 0.30 + fx, ey, R * 0.19, R * 0.16 * sq, 2, 1, '#4a3323');
      eyeBall(ctx, R * 0.40 + fx, ey, R * 0.19, R * 0.16 * sq, 2, 1, '#4a3323');
      // lids
      ctx.beginPath();
      ctx.moveTo(-R * 0.52 + fx, ey - R * 0.13); ctx.lineTo(-R * 0.08 + fx, ey - R * 0.05);
      ctx.moveTo(R * 0.18 + fx, ey - R * 0.05); ctx.lineTo(R * 0.62 + fx, ey - R * 0.13);
      outline(ctx, 6, c.dark);
    }
    // bandage X
    ctx.save();
    ctx.translate(-R * 0.42 + fx, -R * 0.52); ctx.rotate(-0.15);
    [-0.78, 0.78].forEach(function (r) {
      ctx.save(); ctx.rotate(r);
      ctx.fillStyle = '#f4f1e8';
      ctx.fillRect(-R * 0.30, -R * 0.085, R * 0.60, R * 0.17);
      ctx.strokeStyle = 'rgba(120,110,95,0.6)'; ctx.lineWidth = 1.6;
      ctx.strokeRect(-R * 0.30, -R * 0.085, R * 0.60, R * 0.17);
      ctx.restore();
    });
    ctx.restore();
    // crown
    ctx.save();
    ctx.translate(fx * 0.5, -R * 0.92); ctx.rotate(-0.12);
    var cw = R * 0.82, ch = R * 0.42;
    ctx.beginPath();
    ctx.moveTo(-cw / 2, ch * 0.5);
    ctx.lineTo(-cw / 2, -ch * 0.15);
    ctx.lineTo(-cw * 0.28, ch * 0.16); ctx.lineTo(-cw * 0.14, -ch * 0.62);
    ctx.lineTo(0, ch * 0.12); ctx.lineTo(cw * 0.14, -ch * 0.62);
    ctx.lineTo(cw * 0.28, ch * 0.16); ctx.lineTo(cw / 2, -ch * 0.15);
    ctx.lineTo(cw / 2, ch * 0.5);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -ch, ch, '#ffe9a0', c.accent, '#a8790d'); ctx.fill();
    outline(ctx, 2.6, '#7c5806');
    fillEll(ctx, 0, ch * 0.28, cw * 0.09, cw * 0.09, '#d4453c');
    ctx.restore();
  },

  /* -------------------------------------------------- SILVER JACK (hare) */
  hare: function (ctx, c, st, R) {
    var fx = 4;
    // ears (long, slight fan)
    [[-0.34, -1.02, -0.20], [0.30, -1.06, 0.16]].forEach(function (p) {
      ctx.save();
      ctx.translate(p[0] * R + fx * 0.3, p[1] * R * 0.55);
      ctx.rotate(p[2] + (st.dizzy ? Math.sin(st.t * 9) * 0.12 : 0));
      ell(ctx, 0, -R * 0.78, R * 0.21, R * 0.92);
      ctx.fillStyle = vGrad(ctx, -R * 1.7, R * 0.2, c.light, c.body, c.dark); ctx.fill();
      outline(ctx, 3, c.line);
      ell(ctx, 0, -R * 0.80, R * 0.11, R * 0.70);
      ctx.fillStyle = c.accent; ctx.fill();
      ctx.restore();
    });
    // skull
    ell(ctx, 0, 0, R * 0.93, R);
    ctx.fillStyle = vGrad(ctx, -R, R, c.light, c.body, c.dark); ctx.fill();
    outline(ctx, 3.4, c.line);
    // cheeks / muzzle
    fillEll(ctx, fx + R * 0.10, R * 0.40, R * 0.50, R * 0.33, c.muzzle);
    ell(ctx, fx + R * 0.10, R * 0.40, R * 0.50, R * 0.33); outline(ctx, 2.4, c.line);
    // nose
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.10 - R * 0.12, R * 0.22);
    ctx.lineTo(fx + R * 0.10 + R * 0.12, R * 0.22);
    ctx.lineTo(fx + R * 0.10, R * 0.36); ctx.closePath();
    ctx.fillStyle = c.accent; ctx.fill(); outline(ctx, 2, '#8d5a68');
    // mouth + buck teeth
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.10, R * 0.37); ctx.lineTo(fx + R * 0.10, R * 0.47);
    outline(ctx, 2.2, '#5c5c5c');
    if (!st.ko) {
      ctx.fillStyle = '#fbfbf5';
      ctx.fillRect(fx + R * 0.10 - R * 0.15, R * 0.47, R * 0.14, R * 0.20);
      ctx.fillRect(fx + R * 0.10 + R * 0.01, R * 0.47, R * 0.14, R * 0.20);
      ctx.strokeStyle = '#9a9a92'; ctx.lineWidth = 1.4;
      ctx.strokeRect(fx + R * 0.10 - R * 0.15, R * 0.47, R * 0.14, R * 0.20);
      ctx.strokeRect(fx + R * 0.10 + R * 0.01, R * 0.47, R * 0.14, R * 0.20);
    }
    whiskers(ctx, fx + R * 0.45, R * 0.34, 1, 'rgba(250,250,250,0.75)');
    whiskers(ctx, fx - R * 0.30, R * 0.34, -1, 'rgba(250,250,250,0.75)');
    // eyes — sly, narrow
    var ey = -R * 0.14;
    if (st.ko) {
      [-0.32, 0.42].forEach(function (o) {
        ctx.beginPath();
        ctx.moveTo(o * R + fx - 10, ey); ctx.quadraticCurveTo(o * R + fx, ey + 11, o * R + fx + 10, ey);
        outline(ctx, 4, '#3d3d3d');
      });
    } else {
      eyeBall(ctx, -R * 0.32 + fx, ey, R * 0.18, R * 0.20 * (st.hurt ? 0.6 : 1), 3, 0, '#2c2c34', 0.46);
      eyeBall(ctx, R * 0.42 + fx, ey, R * 0.18, R * 0.20 * (st.hurt ? 0.6 : 1), 3, 0, '#2c2c34', 0.46);
      ctx.beginPath();
      ctx.moveTo(-R * 0.52 + fx, ey - R * 0.22); ctx.lineTo(-R * 0.12 + fx, ey - R * 0.10);
      ctx.moveTo(R * 0.24 + fx, ey - R * 0.12); ctx.lineTo(R * 0.62 + fx, ey - R * 0.24);
      outline(ctx, 4.5, c.dark);
    }
  },

  /* ---------------------------------------------- EL LOBO (masked wolf) */
  lobo: function (ctx, c, st, R) {
    var fx = 4;
    // ears
    [[-0.68, -0.80, -0.35], [0.66, -0.86, 0.30]].forEach(function (p) {
      ctx.save(); ctx.translate(p[0] * R, p[1] * R); ctx.rotate(p[2]);
      ctx.beginPath();
      ctx.moveTo(-R * 0.22, R * 0.22); ctx.lineTo(0, -R * 0.44); ctx.lineTo(R * 0.22, R * 0.20);
      ctx.closePath();
      ctx.fillStyle = vGrad(ctx, -R * 0.5, R * 0.3, c.light, c.body, c.dark); ctx.fill();
      outline(ctx, 3, c.line);
      ctx.restore();
    });
    // furry skull: jagged silhouette
    ctx.beginPath();
    var pts = 22;
    for (var i = 0; i <= pts; i++) {
      var a = (i / pts) * Math.PI * 2;
      var spike = (i % 2 ? 1.06 : 0.95) + Math.sin(i * 2.3) * 0.04;
      var rr = R * spike;
      var x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.99;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -R, R, c.light, c.body, c.dark); ctx.fill();
    outline(ctx, 3, c.line);
    // snout
    fillEll(ctx, fx + R * 0.16, R * 0.30, R * 0.52, R * 0.34, shade(c.body, 0.04));
    ell(ctx, fx + R * 0.16, R * 0.30, R * 0.52, R * 0.34); outline(ctx, 2.4, c.line);
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.16 - R * 0.16, R * 0.10);
    ctx.quadraticCurveTo(fx + R * 0.16, R * 0.32, fx + R * 0.16 + R * 0.16, R * 0.10);
    ctx.quadraticCurveTo(fx + R * 0.16, R * -0.02, fx + R * 0.16 - R * 0.16, R * 0.10);
    ctx.fillStyle = '#1d1512'; ctx.fill();
    // big toothy grin
    var my = R * 0.52, mw = R * 0.60, mh = st.ko ? R * 0.14 : R * (0.26 + (st.mouth || 0) * 0.16);
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.16 - mw, my - mh * 0.4);
    ctx.quadraticCurveTo(fx + R * 0.16, my + mh * 1.5, fx + R * 0.16 + mw, my - mh * 0.4);
    ctx.quadraticCurveTo(fx + R * 0.16, my + mh * 0.2, fx + R * 0.16 - mw, my - mh * 0.4);
    ctx.closePath();
    ctx.fillStyle = '#2a0f10'; ctx.fill(); outline(ctx, 2.6, c.line);
    // teeth row
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.16 - mw, my - mh * 0.4);
    ctx.quadraticCurveTo(fx + R * 0.16, my + mh * 1.5, fx + R * 0.16 + mw, my - mh * 0.4);
    ctx.quadraticCurveTo(fx + R * 0.16, my + mh * 0.2, fx + R * 0.16 - mw, my - mh * 0.4);
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#fbfbf3';
    for (var t = -4; t <= 4; t++) {
      var tx = fx + R * 0.16 + t * (mw / 4.6);
      ctx.beginPath();
      ctx.moveTo(tx - R * 0.07, my - mh * 0.8);
      ctx.lineTo(tx + R * 0.07, my - mh * 0.8);
      ctx.lineTo(tx + R * 0.05, my + mh * 0.25);
      ctx.lineTo(tx - R * 0.05, my + mh * 0.25);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80,40,40,0.45)'; ctx.lineWidth = 1.2;
    for (var t2 = -4; t2 <= 4; t2++) {
      var tx2 = fx + R * 0.16 + t2 * (mw / 4.6) - R * 0.07;
      ctx.beginPath(); ctx.moveTo(tx2, my - mh); ctx.lineTo(tx2, my + mh * 0.4); ctx.stroke();
    }
    ctx.restore();
    // luchador mask
    var mky = -R * 0.18;
    ctx.beginPath();
    ctx.moveTo(-R * 0.98, mky - R * 0.22);
    ctx.quadraticCurveTo(0, -R * 1.12, R * 0.98, mky - R * 0.22);
    ctx.quadraticCurveTo(R * 0.86, mky + R * 0.50, R * 0.30, mky + R * 0.34);
    ctx.quadraticCurveTo(0, mky + R * 0.16, -R * 0.36, mky + R * 0.36);
    ctx.quadraticCurveTo(-R * 0.88, mky + R * 0.50, -R * 0.98, mky - R * 0.22);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -R, R * 0.4, shade(c.accent, 0.16), c.accent, shade(c.accent, -0.16));
    ctx.fill(); outline(ctx, 2.8, '#701a17');
    // eye holes
    var ey2 = mky + R * 0.02;
    if (st.ko) {
      [-0.36, 0.44].forEach(function (o) {
        ctx.beginPath();
        ctx.moveTo(o * R + fx - 10, ey2 - 9); ctx.lineTo(o * R + fx + 10, ey2 + 9);
        ctx.moveTo(o * R + fx + 10, ey2 - 9); ctx.lineTo(o * R + fx - 10, ey2 + 9);
        outline(ctx, 4.5, '#2a0f10');
      });
    } else {
      eyeBall(ctx, -R * 0.36 + fx, ey2, R * 0.21, R * 0.20, 3, 0, '#2f63c4', 0.5);
      eyeBall(ctx, R * 0.44 + fx, ey2, R * 0.21, R * 0.20, 3, 0, '#2f63c4', 0.5);
      angryBrow(ctx, -R * 0.36 + fx, ey2 - R * 0.30, R * 0.42, 0.26, '#7a1c19');
      angryBrow(ctx, R * 0.46 + fx, ey2 - R * 0.30, R * 0.42, -0.26 + Math.PI, '#7a1c19');
    }
    // mask stitching
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, mky - R * 0.68); ctx.quadraticCurveTo(R * 0.06, mky - R * 0.3, R * 0.02, mky + R * 0.1);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.stroke();
    ctx.setLineDash([]);
  },

  /* ------------------------------------------- RIPTIDE (teal panther) */
  riptide: function (ctx, c, st, R) {
    var fx = 4;
    // flame hair
    ctx.save();
    ctx.translate(0, -R * 0.86);
    for (var i = -2; i <= 2; i++) {
      var h = R * (0.52 - Math.abs(i) * 0.09) * (1 + (st.rage ? 0.25 + Math.sin(st.t * 14 + i) * 0.12 : 0));
      ctx.save();
      ctx.translate(i * R * 0.30, 0);
      ctx.rotate(i * 0.13 + (st.rage ? Math.sin(st.t * 10 + i) * 0.1 : 0));
      ctx.beginPath();
      ctx.moveTo(-R * 0.17, R * 0.18);
      ctx.quadraticCurveTo(-R * 0.12, -h * 0.5, R * 0.03, -h);
      ctx.quadraticCurveTo(R * 0.08, -h * 0.4, R * 0.17, R * 0.18);
      ctx.closePath();
      ctx.fillStyle = vGrad(ctx, -h, R * 0.2, '#ff8a4a', c.accent, '#8d1f14'); ctx.fill();
      outline(ctx, 2.6, '#6f1710');
      ctx.restore();
    }
    ctx.restore();
    // ears
    [[-0.70, -0.72, -0.30], [0.68, -0.78, 0.26]].forEach(function (p) {
      ctx.save(); ctx.translate(p[0] * R, p[1] * R); ctx.rotate(p[2]);
      ctx.beginPath();
      ctx.moveTo(-R * 0.20, R * 0.20); ctx.lineTo(0, -R * 0.34); ctx.lineTo(R * 0.20, R * 0.18);
      ctx.closePath();
      ctx.fillStyle = vGrad(ctx, -R * 0.4, R * 0.3, c.light, c.body, c.dark); ctx.fill();
      outline(ctx, 3, c.line);
      ctx.restore();
    });
    // skull (long jawed)
    ell(ctx, 0, 0, R * 0.97, R * 1.02);
    ctx.fillStyle = vGrad(ctx, -R, R, c.light, c.body, c.dark); ctx.fill();
    outline(ctx, 3.4, c.line);
    // muzzle block
    fillEll(ctx, fx + R * 0.12, R * 0.18, R * 0.56, R * 0.34, c.muzzle);
    ctx.beginPath();
    ctx.moveTo(fx + R * 0.12 - R * 0.14, R * 0.02);
    ctx.quadraticCurveTo(fx + R * 0.12, R * 0.22, fx + R * 0.12 + R * 0.14, R * 0.02);
    ctx.quadraticCurveTo(fx + R * 0.12, R * -0.10, fx + R * 0.12 - R * 0.14, R * 0.02);
    ctx.fillStyle = '#5c1a1f'; ctx.fill();
    // giant snarl with gold teeth
    var my = R * 0.56, mw = R * 0.66, mh = R * (st.ko ? 0.20 : 0.40 + (st.mouth || 0) * 0.14);
    ctx.beginPath();
    ell(ctx, fx + R * 0.10, my, mw, mh, 0);
    ctx.fillStyle = '#7d2233'; ctx.fill(); outline(ctx, 3, c.line);
    ctx.save();
    ell(ctx, fx + R * 0.10, my, mw, mh, 0); ctx.clip();
    // gums
    fillEll(ctx, fx + R * 0.10, my - mh * 0.92, mw, mh * 0.8, '#b0475c');
    fillEll(ctx, fx + R * 0.10, my + mh * 0.95, mw, mh * 0.8, '#b0475c');
    // teeth
    ctx.fillStyle = c.teeth || '#e8c24a';
    for (var k = -3; k <= 3; k++) {
      var tx = fx + R * 0.10 + k * (mw / 3.4);
      ctx.beginPath();
      ctx.moveTo(tx - mw * 0.14, my - mh * 0.95);
      ctx.lineTo(tx + mw * 0.14, my - mh * 0.95);
      ctx.lineTo(tx + mw * 0.10, my - mh * 0.18);
      ctx.lineTo(tx - mw * 0.10, my - mh * 0.18);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - mw * 0.13, my + mh * 0.95);
      ctx.lineTo(tx + mw * 0.13, my + mh * 0.95);
      ctx.lineTo(tx + mw * 0.09, my + mh * 0.22);
      ctx.lineTo(tx - mw * 0.09, my + mh * 0.22);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,70,20,0.5)'; ctx.lineWidth = 1.4;
    for (var k2 = -3; k2 <= 3; k2++) {
      var tx2 = fx + R * 0.10 + k2 * (mw / 3.4) - mw * 0.14;
      ctx.beginPath(); ctx.moveTo(tx2, my - mh); ctx.lineTo(tx2, my + mh); ctx.stroke();
    }
    ctx.restore();
    whiskers(ctx, fx + R * 0.50, R * 0.18, 1, 'rgba(240,250,250,0.8)');
    whiskers(ctx, fx - R * 0.28, R * 0.18, -1, 'rgba(240,250,250,0.8)');
    // eyes — furious yellow slits
    var ey3 = -R * 0.26;
    if (st.ko) {
      [-0.36, 0.46].forEach(function (o) {
        ctx.beginPath();
        ctx.moveTo(o * R + fx - 11, ey3 - 9); ctx.lineTo(o * R + fx + 11, ey3 + 9);
        ctx.moveTo(o * R + fx + 11, ey3 - 9); ctx.lineTo(o * R + fx - 11, ey3 + 9);
        outline(ctx, 4.5, '#10333a');
      });
    } else {
      [[-0.36, 1], [0.46, 1]].forEach(function (o) {
        var x = o[0] * R + fx;
        fillEll(ctx, x, ey3, R * 0.22, R * 0.19, '#f6d24a');
        ell(ctx, x, ey3, R * 0.22, R * 0.19); outline(ctx, 2.4, '#153036');
        fillEll(ctx, x + 3, ey3, R * 0.06, R * 0.16, '#141014');
        fillEll(ctx, x - R * 0.06, ey3 - R * 0.06, R * 0.05, R * 0.05, 'rgba(255,255,255,0.85)');
      });
      angryBrow(ctx, -R * 0.36 + fx, ey3 - R * 0.30, R * 0.44, 0.34, c.dark);
      angryBrow(ctx, R * 0.48 + fx, ey3 - R * 0.30, R * 0.44, -0.34 + Math.PI, c.dark);
    }
  },

  /* ------------------------------------------- THE LEDGER (XRP prototype) */
  ledger: function (ctx, c, st, R) {
    var fx = 3;
    // antenna
    ctx.beginPath(); ctx.moveTo(R * 0.1, -R * 0.9); ctx.lineTo(R * 0.22, -R * 1.5);
    outline(ctx, 5, c.dark);
    fillEll(ctx, R * 0.22, -R * 1.55, R * 0.12, R * 0.12, st.rage ? '#ff5a3c' : c.accent);
    // head shell
    ctx.beginPath();
    var rr2 = R * 0.30;
    var w = R * 0.95, h = R * 1.0;
    ctx.moveTo(-w + rr2, -h);
    ctx.lineTo(w - rr2, -h); ctx.quadraticCurveTo(w, -h, w, -h + rr2);
    ctx.lineTo(w, h - rr2); ctx.quadraticCurveTo(w, h, w - rr2, h);
    ctx.lineTo(-w + rr2, h); ctx.quadraticCurveTo(-w, h, -w, h - rr2);
    ctx.lineTo(-w, -h + rr2); ctx.quadraticCurveTo(-w, -h, -w + rr2, -h);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -h, h, '#ffffff', c.body, c.dark); ctx.fill();
    outline(ctx, 3.2, c.line);
    // visor
    ctx.beginPath();
    ctx.moveTo(-w * 0.82, -R * 0.34); ctx.lineTo(w * 0.86, -R * 0.42);
    ctx.lineTo(w * 0.86, R * 0.16); ctx.lineTo(-w * 0.82, R * 0.20); ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -R * 0.5, R * 0.3, '#0b1c3a', '#0e2f6b', '#061027'); ctx.fill();
    outline(ctx, 2.6, '#0a1830');
    if (!st.ko) {
      var glow = st.rage ? '#ff7a4a' : c.accent;
      ctx.save(); ctx.shadowColor = glow; ctx.shadowBlur = 18;
      [[-0.38, 0.30], [0.42, 0.26]].forEach(function (e) {
        fillEll(ctx, e[0] * R + fx, -R * 0.10, R * e[1] * (st.hurt ? 0.5 : 1), R * 0.11, glow);
      });
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-w * 0.7, R * 0.02); ctx.lineTo(w * 0.72, R * -0.04);
      ctx.strokeStyle = 'rgba(120,200,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      [-0.38, 0.42].forEach(function (o) {
        ctx.beginPath();
        ctx.moveTo(o * R - 9, -R * 0.2); ctx.lineTo(o * R + 9, R * 0.0);
        ctx.moveTo(o * R + 9, -R * 0.2); ctx.lineTo(o * R - 9, R * 0.0);
        outline(ctx, 4, '#4b6a94');
      });
    }
    // jaw grill
    ctx.fillStyle = shade(c.body, -0.2);
    for (var g2 = -2; g2 <= 2; g2++) {
      ctx.fillRect(fx + g2 * R * 0.20 - R * 0.06, R * 0.42, R * 0.12, R * 0.34);
    }
    ctx.beginPath();
    ctx.rect(fx - R * 0.56, R * 0.38, R * 1.12, R * 0.42);
    outline(ctx, 2.4, c.line);
    // cheek vents
    ctx.strokeStyle = 'rgba(30,60,110,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.82, R * 0.42); ctx.lineTo(-w * 0.62, R * 0.42);
    ctx.moveTo(w * 0.62, R * 0.40); ctx.lineTo(w * 0.84, R * 0.40); ctx.stroke();
  }
};

/* =========================================================================
   BODY — generic vinyl-toy boxer built from the fighter's pose
   ========================================================================= */
function drawFighterBody(ctx, def, pose, st) {
  var c = def.colors, bulk = def.bulk, R = 42 * (def.headScale || 1);
  var crouch = pose.crouch * 42;
  var lean = pose.lean;
  var hipY = -104 + crouch;
  var chestY = -190 + crouch * 0.75 + pose.bob;
  var headY = -250 + crouch * 0.62 + pose.bob * 1.2 + pose.headY;
  var headX = pose.headX + lean * 1.25;

  var sw = 36 * bulk;       // shoulder half width
  var hw = 27 * bulk;       // hip half width
  var legW = 24 * bulk, armW = 21 * bulk;

  var bodyGrad = vGrad(ctx, chestY - 30, hipY + 30, c.light, c.body, c.dark);
  var legGrad = vGrad(ctx, hipY, 0, c.light, c.body, c.dark);

  /* --------- back leg + front leg (stance: back foot behind, front ahead) */
  function leg(footX, kneeOut, z) {
    var kneeBend = 14 + pose.crouch * 34;
    var kx = footX * 0.55 + kneeOut + lean * 0.25;
    var ky = hipY / 2 + 18 + pose.crouch * 10;
    var col = z === 'back' ? shade(c.body, -0.10) : c.body;
    limb(ctx, footX * 0.42 + lean * 0.5, hipY + 6, kx, ky + kneeBend, footX, -16, legW, col, c.line);
    // boot
    ctx.save();
    ctx.translate(footX, -10);
    ctx.beginPath();
    ctx.moveTo(-16, -16); ctx.lineTo(16, -16);
    ctx.quadraticCurveTo(21, -14, 22, 2);
    ctx.quadraticCurveTo(22, 10, 12, 10);
    ctx.lineTo(-16, 10); ctx.quadraticCurveTo(-22, 10, -21, 0);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, -20, 10, shade(c.boot, 0.18), c.boot, shade(c.boot, -0.18));
    ctx.fill(); outline(ctx, 3, c.line);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-14, -13, 26, 3);
    // laces
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.6;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-6, -11 + i * 6); ctx.lineTo(8, -13 + i * 6); ctx.stroke();
    }
    ctx.restore();
  }
  leg(-34, -8, 'back');

  /* ----------------------------------------------------------- back arm */
  var shBackX = -14 * bulk + lean * 0.8, shBackY = chestY - 4;
  var bg = pose.bg;
  drawArm(ctx, shBackX, shBackY, bg.x, bg.y, armW * 0.95, shade(c.body, -0.08), c, 'back', pose);

  /* -------------------------------------------------------------- torso */
  ctx.beginPath();
  ctx.moveTo(-hw, hipY + 8);
  ctx.quadraticCurveTo(-hw - 6 * bulk, hipY - 34, -sw + lean, chestY + 10);
  ctx.quadraticCurveTo(-sw - 2 + lean, chestY - 16, -sw * 0.55 + lean, chestY - 22);
  ctx.quadraticCurveTo(0 + lean, chestY - 30, sw * 0.55 + lean, chestY - 22);
  ctx.quadraticCurveTo(sw + 2 + lean, chestY - 16, sw + lean, chestY + 10);
  ctx.quadraticCurveTo(hw + 6 * bulk, hipY - 34, hw, hipY + 8);
  ctx.closePath();
  ctx.fillStyle = bodyGrad; ctx.fill(); outline(ctx, 3.4, c.line);

  // pecs + abs sculpting
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hw, hipY + 8);
  ctx.quadraticCurveTo(-hw - 6 * bulk, hipY - 34, -sw + lean, chestY + 10);
  ctx.quadraticCurveTo(-sw - 2 + lean, chestY - 16, -sw * 0.55 + lean, chestY - 22);
  ctx.quadraticCurveTo(0 + lean, chestY - 30, sw * 0.55 + lean, chestY - 22);
  ctx.quadraticCurveTo(sw + 2 + lean, chestY - 16, sw + lean, chestY + 10);
  ctx.quadraticCurveTo(hw + 6 * bulk, hipY - 34, hw, hipY + 8);
  ctx.closePath(); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(lean, chestY - 18); ctx.lineTo(lean * 0.6, hipY - 6); ctx.stroke();
  if (def.abs !== false) {
    for (var a = 0; a < 3; a++) {
      var ay = chestY + 26 + a * 20;
      ctx.beginPath();
      ctx.moveTo(-20 * bulk + lean * 0.5, ay); ctx.lineTo(20 * bulk + lean * 0.5, ay - 1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-sw * 0.85 + lean, chestY + 8);
    ctx.quadraticCurveTo(lean, chestY + 22, sw * 0.85 + lean, chestY + 8);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ell(ctx, -sw * 0.3 + lean, chestY + 6, sw * 0.42, 30); ctx.fill();
  ctx.restore();

  /* ---------------------------------------------------------- front leg */
  leg(30, 10, 'front');

  /* -------------------------------------------------------------- shorts */
  var shY = hipY - 6;
  ctx.beginPath();
  ctx.moveTo(-hw - 3, shY - 12);
  ctx.lineTo(hw + 3, shY - 12);
  ctx.quadraticCurveTo(hw + 10, shY + 30, hw + 4, shY + 52);
  ctx.lineTo(3, shY + 44);
  ctx.lineTo(-3, shY + 44);
  ctx.quadraticCurveTo(-hw - 8, shY + 52, -hw - 10, shY + 30);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, shY - 12, shY + 52, shade(c.shorts, 0.14), c.shorts, shade(c.shorts, -0.16));
  ctx.fill(); outline(ctx, 3.2, c.line);
  // waistband
  ctx.fillStyle = c.trim;
  ctx.fillRect(-hw - 3, shY - 13, (hw + 3) * 2, 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.2;
  ctx.strokeRect(-hw - 3, shY - 13, (hw + 3) * 2, 8);
  // side stripe
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hw - 3, shY - 12); ctx.lineTo(hw + 3, shY - 12);
  ctx.quadraticCurveTo(hw + 10, shY + 30, hw + 4, shY + 52);
  ctx.lineTo(3, shY + 44); ctx.lineTo(-3, shY + 44);
  ctx.quadraticCurveTo(-hw - 8, shY + 52, -hw - 10, shY + 30);
  ctx.closePath(); ctx.clip();
  ctx.fillStyle = c.trim;
  ctx.fillRect(hw - 8, shY - 12, 6, 70);
  ctx.fillRect(-hw + 2, shY - 12, 6, 70);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-hw, shY - 4, 18, 60);
  ctx.restore();

  /* --------------------------------------------------------------- head */
  if (!st.headless) {
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(pose.headTilt);
    var scl = 1 + (st.rage ? 0.03 : 0);
    ctx.scale(scl, scl);
    // neck
    ctx.fillStyle = shade(c.body, -0.12);
    ctx.fillRect(-13 * bulk, R * 0.5, 26 * bulk, 42);
    HEADS[def.art](ctx, c, st, R);
    ctx.restore();
  } else {
    // the block got knocked clean off — spring-loaded stump
    ctx.save();
    ctx.translate(headX * 0.4, chestY - 26);
    ctx.fillStyle = shade(c.body, -0.18);
    ctx.fillRect(-13 * bulk, -16, 26 * bulk, 26);
    ctx.strokeStyle = c.line; ctx.lineWidth = 3;
    ctx.strokeRect(-13 * bulk, -16, 26 * bulk, 26);
    ctx.strokeStyle = '#9aa6bb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var sp = 0; sp < 5; sp++) {
      var yy = -18 - sp * 9;
      ctx.moveTo(-9, yy); ctx.quadraticCurveTo(0, yy - 7, 9, yy - 3);
      ctx.moveTo(9, yy - 3); ctx.quadraticCurveTo(0, yy - 12, -9, yy - 9);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* --------------------------------------------------------- front arm */
  var shFrontX = 18 * bulk + lean * 0.9, shFrontY = chestY - 2;
  drawArm(ctx, shFrontX, shFrontY, pose.fg.x, pose.fg.y, armW, c.body, c, 'front', pose);
}

function drawArm(ctx, sx, sy, gx, gy, w, col, c, which, pose) {
  // elbow: pushed outward/downward from the shoulder-glove midpoint
  var mx = (sx + gx) / 2, my = (sy + gy) / 2;
  var dx = gx - sx, dy = gy - sy;
  var len = Math.hypot(dx, dy) || 1;
  var nx = -dy / len, ny = dx / len;
  var slack = Math.max(0, 108 - len) * 0.42;
  var ex = mx - nx * slack * 0.5 + 4, ey = my + Math.abs(ny) * slack * 0.5 + slack * 0.35;
  limb(ctx, sx, sy, ex, ey, gx, gy, w, col, c.line);
  // shoulder cap
  fillEll(ctx, sx, sy, w * 0.72, w * 0.72, col);
  ell(ctx, sx, sy, w * 0.72, w * 0.72); outline(ctx, 2.6, c.line);
  fillEll(ctx, sx - w * 0.2, sy - w * 0.25, w * 0.28, w * 0.22, 'rgba(255,255,255,0.18)');
  // glove
  var gr = 22 * (c.gloveScale || 1);
  ctx.save();
  ctx.translate(gx, gy);
  var ang = Math.atan2(dy, dx);
  ctx.rotate(ang * 0.35);
  // cuff
  ctx.fillStyle = shade(c.glove, -0.2);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-gr * 0.95, -gr * 0.5, gr * 0.7, gr, 5) : ctx.rect(-gr * 0.95, -gr * 0.5, gr * 0.7, gr);
  ctx.fill(); outline(ctx, 2.4, c.line);
  // mitt
  ell(ctx, 0, 0, gr, gr * 0.94);
  ctx.fillStyle = vGrad(ctx, -gr, gr, shade(c.glove, 0.22), c.glove, shade(c.glove, -0.2));
  ctx.fill(); outline(ctx, 3, c.line);
  // thumb
  fillEll(ctx, -gr * 0.25, gr * 0.62, gr * 0.42, gr * 0.3, shade(c.glove, 0.06), 0.4);
  ell(ctx, -gr * 0.25, gr * 0.62, gr * 0.42, gr * 0.3, 0.4); outline(ctx, 2.2, c.line);
  // knuckle crease + shine
  ctx.beginPath();
  ctx.moveTo(gr * 0.30, -gr * 0.55); ctx.quadraticCurveTo(gr * 0.62, 0, gr * 0.30, gr * 0.55);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2.4; ctx.stroke();
  fillEll(ctx, -gr * 0.18, -gr * 0.42, gr * 0.36, gr * 0.22, 'rgba(255,255,255,0.35)', -0.3);
  ctx.restore();
}

/* Full fighter render: shadow, body, and status FX. */
function drawFighter(ctx, def, pose, st, x, y, facing, scale) {
  ctx.save();
  ctx.translate(x, y);
  // ground shadow
  ctx.save();
  ctx.scale(1, 1);
  fillEll(ctx, 0, 4, 58 * scale, 15 * scale, 'rgba(0,0,0,0.38)');
  ctx.restore();
  ctx.scale(facing * scale, scale);
  if (st.flash > 0) { ctx.save(); }
  drawFighterBody(ctx, def, pose, st);
  if (st.flash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,255,255,' + (0.62 * st.flash) + ')';
    ctx.fillRect(-200, -340, 400, 360);
    ctx.restore();
  }
  ctx.restore();
}

/* =========================================================================
   ROSTER
   ========================================================================= */
var ROSTER = [
  {
    id: 'bruiser', art: 'bruiser',
    name: 'KING BRUISER', title: 'The Crowned Bear', hometown: 'GRIZZLY HEIGHTS',
    bulk: 1.14, headScale: 1.04,
    colors: {
      body: '#A2562B', light: '#CC7C42', dark: '#70361A', muzzle: '#D2A06A',
      shorts: '#171717', trim: '#EDEDED', glove: '#1B1B1B', boot: '#151515',
      accent: '#F2C230', line: '#33190C'
    },
    stats: { hp: 208, speed: 0.80, power: 1.30, defense: 1.08, stamina: 128, meterRate: 0.88 },
    passive: { name: 'ROYAL HIDE', text: 'Guard soaks 45% more damage. Hooks shrug off one jab mid-swing.' },
    special: { name: 'CROWN CRUSHER', text: 'Overhead smash. Shatters guard, huge damage — but slow.' },
    bio: 'Three-time champ. Never takes the crown off, not even in the shower.',
    ai: { aggression: 0.52, block: 0.72, dodge: 0.18, spacing: 1.0, special: 0.7 },
    quip: 'KNEEL.'
  },
  {
    id: 'hare', art: 'hare',
    name: 'SILVER JACK', title: 'The Ghost Hare', hometown: 'NEON WARREN',
    bulk: 0.90, headScale: 0.98,
    colors: {
      body: '#9BA3AA', light: '#C8CFD4', dark: '#666E75', muzzle: '#DCE1E4',
      shorts: '#F3F3F3', trim: '#141414', glove: '#FAFAFA', boot: '#F4F4F4',
      accent: '#F0A0B4', line: '#3B4147'
    },
    stats: { hp: 164, speed: 1.38, power: 0.86, defense: 0.86, stamina: 112, meterRate: 1.25 },
    passive: { name: 'TWITCH REFLEX', text: 'Longer dodge i-frames, faster recovery, meter builds 25% quicker.' },
    special: { name: 'HARE TRIGGER', text: 'Eight-punch blur flurry capped with a rising hook.' },
    bio: 'Nobody has landed a clean hook on him. Ask them — if you can find them.',
    ai: { aggression: 0.72, block: 0.45, dodge: 0.72, spacing: 0.82, special: 0.8 },
    quip: 'TOO SLOW.'
  },
  {
    id: 'lobo', art: 'lobo',
    name: 'EL LOBO', title: 'Masked Terror', hometown: 'LUNA LIBRE',
    bulk: 1.06, headScale: 1.0,
    colors: {
      body: '#6B4327', light: '#8F5D36', dark: '#452A17', muzzle: '#7C4E2B',
      shorts: '#E0A81E', trim: '#1A1A1A', glove: '#E8B421', boot: '#DFA61D',
      accent: '#C7332E', line: '#2A1A0E'
    },
    stats: { hp: 176, speed: 1.06, power: 1.06, defense: 1.02, stamina: 120, meterRate: 1.05 },
    passive: { name: 'COUNTER FANG', text: 'Blocking at the last instant parries — free counter jab + meter.' },
    special: { name: 'LUCHA SLAM', text: 'Charging grab into a mat-shaking slam. Unblockable; dodge it or eat it.' },
    bio: 'Wrestling champion turned boxer. The mask has never come off in public.',
    ai: { aggression: 0.60, block: 0.80, dodge: 0.40, spacing: 0.95, special: 0.75 },
    quip: 'VAMOS!'
  },
  {
    id: 'riptide', art: 'riptide',
    name: 'RIPTIDE', title: 'Gold-Fanged Fury', hometown: 'THE DEEP END',
    bulk: 0.98, headScale: 1.02,
    colors: {
      body: '#1E8C93', light: '#39B7BD', dark: '#11585D', muzzle: '#2BA4AA',
      shorts: '#B8262B', trim: '#F0E2C0', glove: '#C22C30', boot: '#B8262B',
      accent: '#E0492B', line: '#0C3438', teeth: '#E8C24A'
    },
    stats: { hp: 150, speed: 1.16, power: 1.30, defense: 0.76, stamina: 104, meterRate: 1.15 },
    passive: { name: 'RAGE', text: 'The lower the health, the harder the hits — up to +40% damage.' },
    special: { name: 'FERAL FRENZY', text: 'Six seconds of super armor, faster hands, chip damage through guard.' },
    bio: 'Bites the mouthguard in half every single round. Brings spares.',
    ai: { aggression: 0.86, block: 0.35, dodge: 0.32, spacing: 0.7, special: 0.9 },
    quip: 'RRRAAAGH!'
  },
  {
    id: 'ledger', art: 'ledger',
    name: 'THE LEDGER', title: 'XRP Prototype', hometown: 'NODE ZERO',
    bulk: 1.02, headScale: 1.0, abs: false,
    colors: {
      body: '#DCE5F2', light: '#FFFFFF', dark: '#95A5BE', muzzle: '#E8EEF8',
      shorts: '#1B4ED8', trim: '#8FC3FF', glove: '#1B4ED8', boot: '#1440A8',
      accent: '#3B8CFF', line: '#1B2A44'
    },
    stats: { hp: 200, speed: 1.02, power: 1.16, defense: 1.24, stamina: 138, meterRate: 1.0 },
    passive: { name: 'AUTO-SETTLE', text: 'Repairs 2 HP/sec after three seconds without taking a hit.' },
    special: { name: 'LIQUIDITY SURGE', text: 'Fires a ledger shockwave across the ring. Stuns on contact.' },
    bio: 'Built to settle disputes in three seconds. Fights are a dispute.',
    ai: { aggression: 0.74, block: 0.82, dodge: 0.50, spacing: 0.95, special: 0.95 },
    quip: 'TRANSACTION VALIDATED.'
  }
];

function fighterById(id) {
  for (var i = 0; i < ROSTER.length; i++) if (ROSTER[i].id === id) return ROSTER[i];
  return ROSTER[0];
}
