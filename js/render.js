/* =========================================================================
   RIPPLE RUMBLE — arena art, particle FX, HUD
   ========================================================================= */
var W = 1280, H = 720;
var FONT_BIG = '"Arial Black", "Haettenschweiler", Impact, sans-serif';
var FONT_UI = '"Trebuchet MS", "Segoe UI", sans-serif';

function txt(ctx, s, x, y, size, col, align, outlineCol, outlineW, font) {
  ctx.save();
  ctx.font = '900 ' + size + 'px ' + (font || FONT_BIG);
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  if (outlineCol) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = outlineW || Math.max(3, size * 0.14);
    ctx.strokeStyle = outlineCol;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = col;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ============================================================ particles */
var FX = {
  list: [],
  clear: function () { this.list.length = 0; },
  add: function (o) { this.list.push(o); return o; },

  spark: function (x, y, power, col) {
    var n = 6 + Math.round(power * 16);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 420 * (0.4 + power);
      this.add({
        t: 'spark', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.25 + Math.random() * 0.4, age: 0, col: col || '#ffe58a', r: 2 + Math.random() * 3 * power
      });
    }
    this.add({ t: 'impact', x: x, y: y, life: 0.22, age: 0, r: 20 + power * 46, col: col || '#fff' });
  },
  sweat: function (x, y, dir) {
    for (var i = 0; i < 4; i++) {
      this.add({
        t: 'sweat', x: x, y: y, vx: dir * (60 + Math.random() * 200), vy: -120 - Math.random() * 160,
        life: 0.6, age: 0, r: 3 + Math.random() * 3
      });
    }
  },
  dust: function (x, y, dir) {
    for (var i = 0; i < 8; i++) {
      this.add({
        t: 'dust', x: x + (Math.random() - 0.5) * 30, y: y, vx: dir * (30 + Math.random() * 130),
        vy: -20 - Math.random() * 40, life: 0.5, age: 0, r: 5 + Math.random() * 10
      });
    }
  },
  confetti: function (w) {
    // capped so a long victory screen never fills up with particles
    var live = 0;
    for (var i = 0; i < this.list.length; i++) if (this.list[i].t === 'confetti') live++;
    if (live > 90) return;
    this.add({
      t: 'confetti', x: Math.random() * w, y: -12,
      vx: (Math.random() - 0.5) * 50, vy: 60 + Math.random() * 90,
      rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 6,
      w: 5 + Math.random() * 7, h: 8 + Math.random() * 8,
      col: ['#ffd83a', '#5ea0ff', '#ff6a4a', '#ffffff', '#5ce08a'][(Math.random() * 5) | 0],
      life: 6, age: 0
    });
  },
  shock: function (x, y, col) {
    this.add({ t: 'ring', x: x, y: y, life: 0.5, age: 0, r: 10, col: col || '#fff' });
  },
  rage: function (x, y, col) {
    this.add({
      t: 'flame', x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 70,
      vx: (Math.random() - 0.5) * 40, vy: -90 - Math.random() * 90, life: 0.45, age: 0,
      r: 5 + Math.random() * 9, col: col
    });
  },
  stars: function (x, y) {
    this.add({ t: 'star', x: x, y: y, life: 0.9, age: 0, a: Math.random() * 6 });
  },
  popup: function (x, y, s, col, size) {
    this.add({ t: 'popup', x: x, y: y, s: s, col: col, size: size || 30, life: 0.85, age: 0, vy: -60 });
  },
  headPop: function (f) {
    this.add({
      t: 'head', def: f.def, x: f.x, y: RING.floorY - 250, vx: -f.facing * (120 + Math.random() * 90),
      vy: -720, spin: (Math.random() - 0.5) * 12, rot: 0, facing: f.facing, life: 6, age: 0, bounces: 0
    });
  },

  update: function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) { this.list.splice(i, 1); continue; }
      switch (p.t) {
        case 'spark': p.vy += 1500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; break;
        case 'sweat': p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; break;
        case 'dust': p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 26; break;
        case 'flame': p.x += p.vx * dt; p.y += p.vy * dt; p.r *= 1 - dt * 1.1; break;
        case 'popup': p.y += p.vy * dt; p.vy *= 1 - dt * 3.2; break;
        case 'confetti':
          p.x += p.vx * dt + Math.sin(p.age * 3 + p.rot) * 26 * dt;
          p.y += p.vy * dt; p.rot += p.spin * dt;
          break;
        case 'head':
          p.vy += 1900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
          if (p.y > RING.floorY - 30) {
            p.y = RING.floorY - 30;
            if (Math.abs(p.vy) > 90 && p.bounces < 4) {
              p.vy *= -0.46; p.vx *= 0.6; p.spin *= 0.5; p.bounces++;
              SFX.hit(0.15);
              FX.dust(p.x, RING.floorY, 1);
            } else { p.vy = 0; p.vx *= 0.8; p.spin *= 0.8; }
          }
          break;
      }
    }
  },

  draw: function (ctx) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i], k = 1 - p.age / p.life;
      ctx.save();
      switch (p.t) {
        case 'spark':
          ctx.globalAlpha = k;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, 6.3); ctx.fill();
          break;
        case 'impact':
          ctx.globalAlpha = k * 0.9;
          ctx.translate(p.x, p.y);
          ctx.rotate((1 - k) * 0.6);
          ctx.fillStyle = p.col;
          ctx.beginPath();
          for (var s = 0; s < 12; s++) {
            var a = s / 12 * Math.PI * 2, rr = (s % 2 ? 0.42 : 1) * p.r * (0.5 + (1 - k) * 0.9);
            var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
            s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.closePath(); ctx.fill();
          break;
        case 'sweat':
          ctx.globalAlpha = k;
          ctx.fillStyle = '#cfe9ff';
          ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 0.7, p.r, 0, 0, 6.3); ctx.fill();
          break;
        case 'dust':
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = '#c9b892';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill();
          break;
        case 'flame':
          ctx.globalAlpha = k * 0.8;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r), 0, 6.3); ctx.fill();
          break;
        case 'confetti':
          ctx.globalAlpha = Math.min(1, k * 4);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.5 + 0.5 * Math.abs(Math.cos(p.age * 4))));
          break;
        case 'ring':
          ctx.globalAlpha = k * 0.75;
          ctx.strokeStyle = p.col; ctx.lineWidth = 7 * k;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 20 + (1 - k) * 210, (20 + (1 - k) * 210) * 0.28, 0, 0, 6.3);
          ctx.stroke();
          break;
        case 'star':
          ctx.globalAlpha = k;
          for (var j = 0; j < 3; j++) {
            var ang = p.a + p.age * 7 + j * 2.1;
            drawStar(ctx, p.x + Math.cos(ang) * 46, p.y + Math.sin(ang) * 15 - 6, 9, '#ffe14a');
          }
          break;
        case 'popup':
          ctx.globalAlpha = Math.min(1, k * 1.8);
          var sc = 1 + (1 - k) * 0.25;
          ctx.translate(p.x, p.y); ctx.scale(sc, sc);
          txt(ctx, p.s, 0, 0, p.size, p.col, 'center', 'rgba(15,8,20,0.9)', p.size * 0.2);
          break;
        case 'head':
          ctx.globalAlpha = Math.min(1, k * 4);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(p.facing, 1);
          var st = { flash: 0, hurt: true, dizzy: false, ko: true, mouth: 0, rage: false, t: p.age };
          HEADS[p.def.art](ctx, p.def.colors, st, 42 * (p.def.headScale || 1));
          break;
      }
      ctx.restore();
    }
  }
};

function drawStar(ctx, x, y, r, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.44 : r;
    var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(90,60,0,0.8)'; ctx.stroke();
  ctx.restore();
}

/* ============================================================== arena */
var CROWD = (function () {
  var arr = [];
  var cols = ['#2b3350', '#3a2c48', '#243b4d', '#3d3550', '#1f2a44', '#4a3440'];
  for (var row = 0; row < 7; row++) {
    for (var i = 0; i < 46; i++) {
      arr.push({
        x: 30 + i * 28 + (row % 2) * 14 + Math.random() * 8,
        y: 200 - row * 26 + Math.random() * 6,
        r: 11 + Math.random() * 4,
        c: cols[(Math.random() * cols.length) | 0],
        ph: Math.random() * 6.3,
        sp: 1.4 + Math.random() * 2.2,
        flash: Math.random() < 0.06
      });
    }
  }
  return arr;
})();

function drawArena(ctx, t, excite) {
  // hall
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0c1c');
  g.addColorStop(0.45, '#141a33');
  g.addColorStop(1, '#070812');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // spotlights
  for (var i = 0; i < 4; i++) {
    var lx = 150 + i * 330 + Math.sin(t * 0.4 + i) * 22;
    var lg = ctx.createRadialGradient(lx, -40, 10, lx, 420, 520);
    lg.addColorStop(0, 'rgba(150,190,255,0.22)');
    lg.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(lx - 30, -20); ctx.lineTo(lx + 30, -20);
    ctx.lineTo(lx + 300, 560); ctx.lineTo(lx - 300, 560);
    ctx.closePath(); ctx.fill();
  }

  // crowd
  for (var c = 0; c < CROWD.length; c++) {
    var p = CROWD[c];
    var bob = Math.sin(t * p.sp + p.ph) * (2 + excite * 7);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, p.r, 0, 6.3); ctx.fill();
    ctx.fillRect(p.x - p.r, p.y + bob + p.r * 0.4, p.r * 2, p.r * 1.7);
    if (p.flash && Math.sin(t * 9 + p.ph * 3) > 0.985) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y + bob - 4, 5, 0, 6.3); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(6,8,18,0.55)';
  ctx.fillRect(0, 0, W, 232);

  // back-wall wordmark, sitting behind the ring so the HUD stays clear
  ctx.save();
  ctx.globalAlpha = 0.42;
  drawRippleMark(ctx, W / 2 - 196, 330, 26, '#2f7dff');
  txt(ctx, 'RIPPLE RUMBLE', W / 2 + 26, 330, 44, '#26346a', 'center', '#151d42', 5);
  ctx.restore();

  // back wall banners
  for (var b = 0; b < 2; b++) {
    var bx = 60 + b * 940;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#16204a';
    ctx.fillRect(bx, 300, 220, 40);
    ctx.strokeStyle = '#2a3a70'; ctx.lineWidth = 2; ctx.strokeRect(bx, 300, 220, 40);
    txt(ctx, ['KNOCK HIS BLOCK OFF', 'NO BLOCK, NO GLORY'][b], bx + 110, 321, 15, '#7f9ad6', 'center', null, 0, FONT_UI);
    ctx.restore();
  }

  drawRing(ctx, t);
}

function drawRing(ctx, t) {
  var backY = 470, frontY = 700;
  var backL = 258, backR = 1022, frontL = 122, frontR = 1158;

  // apron
  ctx.beginPath();
  ctx.moveTo(backL, backY); ctx.lineTo(backR, backY);
  ctx.lineTo(frontR, frontY); ctx.lineTo(frontL, frontY);
  ctx.closePath();
  var mg = ctx.createLinearGradient(0, backY, 0, frontY);
  mg.addColorStop(0, '#2b3f6e');
  mg.addColorStop(0.5, '#22345c');
  mg.addColorStop(1, '#16223e');
  ctx.fillStyle = mg; ctx.fill();

  // mat logo
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(backL, backY); ctx.lineTo(backR, backY); ctx.lineTo(frontR, frontY); ctx.lineTo(frontL, frontY);
  ctx.closePath(); ctx.clip();
  ctx.globalAlpha = 0.30;
  ctx.save();
  ctx.translate(W / 2, 610); ctx.scale(1, 0.44);
  drawRippleMark(ctx, 0, 0, 120, '#4f8dff');
  ctx.restore();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#9dc2ff'; ctx.lineWidth = 3;
  for (var i = 1; i < 6; i++) {
    var yy = backY + (frontY - backY) * (i / 6);
    var k = (i / 6);
    ctx.beginPath();
    ctx.moveTo(lerp(backL, frontL, k), yy); ctx.lineTo(lerp(backR, frontR, k), yy); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // mat scuffs
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, backY, W, 8);
  ctx.restore();

  // mat edge
  ctx.strokeStyle = '#0d1428'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(backL, backY); ctx.lineTo(backR, backY); ctx.lineTo(frontR, frontY); ctx.lineTo(frontL, frontY);
  ctx.closePath(); ctx.stroke();
  // skirt
  ctx.fillStyle = '#0b1024';
  ctx.beginPath();
  ctx.moveTo(frontL, frontY); ctx.lineTo(frontR, frontY); ctx.lineTo(frontR, H); ctx.lineTo(frontL, H);
  ctx.closePath(); ctx.fill();

  // back ropes + posts
  drawPost(ctx, backL, backY, 0.72);
  drawPost(ctx, backR, backY, 0.72);
  ctx.save();
  ctx.lineCap = 'round';
  for (var r = 0; r < 3; r++) {
    var ry = backY - 28 - r * 40;
    ctx.strokeStyle = ['#d8d8e8', '#c33', '#d8d8e8'][r];
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(backL, ry);
    ctx.quadraticCurveTo(W / 2, ry + 7, backR, ry);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(backL, ry - 2);
    ctx.quadraticCurveTo(W / 2, ry + 5, backR, ry - 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRopesFront(ctx) {
  var frontY = 700, frontL = 122, frontR = 1158;
  ctx.save();
  ctx.lineCap = 'round';
  for (var r = 0; r < 3; r++) {
    var ry = frontY - 34 - r * 62;
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = ['#e2e2ee', '#d33a3a', '#e2e2ee'][r];
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(frontL, ry);
    ctx.quadraticCurveTo(W / 2, ry + 12, frontR, ry);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(frontL, ry - 3);
    ctx.quadraticCurveTo(W / 2, ry + 9, frontR, ry - 3);
    ctx.stroke();
  }
  ctx.restore();
  drawPost(ctx, frontL, frontY, 1.12);
  drawPost(ctx, frontR, frontY, 1.12);
}

function drawPost(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  var g = ctx.createLinearGradient(-14, 0, 14, 0);
  g.addColorStop(0, '#39406a'); g.addColorStop(0.4, '#7c88c8'); g.addColorStop(1, '#232846');
  ctx.fillStyle = g;
  rrect(ctx, -13, -212, 26, 220, 10); ctx.fill();
  ctx.strokeStyle = '#11162c'; ctx.lineWidth = 3; ctx.stroke();
  // pad wrap
  ctx.fillStyle = '#1a4fd0';
  rrect(ctx, -17, -196, 34, 150, 12); ctx.fill();
  ctx.strokeStyle = '#0d2a78'; ctx.lineWidth = 3; ctx.stroke();
  ctx.save();
  rrect(ctx, -17, -196, 34, 150, 12); ctx.clip();
  drawRippleMark(ctx, 0, -120, 13, '#cfe3ff');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-16, -196, 9, 150);
  ctx.restore();
  ctx.fillStyle = '#c9d2ee';
  rrect(ctx, -16, -224, 32, 16, 6); ctx.fill();
  ctx.strokeStyle = '#11162c'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
}

/* ================================================================== HUD */
function drawHeadIcon(ctx, def, x, y, r, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3);
  ctx.fillStyle = '#0c1226'; ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.scale(flip ? -1 : 1, 1);
  var s = r / 46;
  ctx.scale(s, s);
  ctx.translate(0, 6);
  HEADS[def.art](ctx, def.colors, { flash: 0, hurt: false, dizzy: false, ko: false, mouth: 0, rage: false, t: 0 }, 42 * (def.headScale || 1));
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = def.colors.accent; ctx.stroke();
  ctx.restore();
}

function bar(ctx, x, y, w, h, pct, colA, colB, flip, skew) {
  ctx.save();
  ctx.translate(x, y);
  if (flip) { ctx.scale(-1, 1); }
  skew = skew === undefined ? 10 : skew;
  function shape(ww) {
    ctx.beginPath();
    ctx.moveTo(skew, 0); ctx.lineTo(ww, 0); ctx.lineTo(ww - skew, h); ctx.lineTo(0, h);
    ctx.closePath();
  }
  shape(w);
  ctx.fillStyle = 'rgba(8,10,22,0.85)'; ctx.fill();
  ctx.strokeStyle = 'rgba(180,200,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  var iw = Math.max(0, (w - 4) * clamp(pct, 0, 1));
  if (iw > 3) {
    ctx.save();
    shape(w - 3); ctx.clip();
    ctx.translate(2, 2);
    var g = ctx.createLinearGradient(0, 0, 0, h - 4);
    g.addColorStop(0, colB); g.addColorStop(0.5, colA); g.addColorStop(1, colB);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(skew, 0); ctx.lineTo(iw, 0); ctx.lineTo(iw - skew, h - 4); ctx.lineTo(0, h - 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, 0, iw, (h - 4) * 0.32);
    ctx.restore();
  }
  ctx.restore();
}

function drawHUD(ctx, G) {
  var p1 = G.f1, p2 = G.f2, t = G.time;

  [[p1, false], [p2, true]].forEach(function (pair) {
    var f = pair[0], flip = pair[1];
    var x = flip ? W - 34 : 34;
    var dir = flip ? -1 : 1;
    // ghost (damage trail) bar
    var hpPct = f.hp / f.maxHp;
    var ghost = f.hpGhost === undefined ? hpPct : f.hpGhost;
    bar(ctx, x + dir * 84, 30, 430 * dir === 0 ? 430 : 430, 30, ghost, '#ff5a4a', '#8a1b12', flip);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    var col = hpPct > 0.55 ? ['#59e07a', '#1d7a3a'] : hpPct > 0.25 ? ['#f2c230', '#8a6a0d'] : ['#ff6a4a', '#8a2010'];
    bar(ctx, x + dir * 84, 30, 430, 30, hpPct, col[0], col[1], flip);

    // stamina
    bar(ctx, x + dir * 84, 64, 330, 11, f.stam / f.maxStam, '#69d2ff', '#1c5f8c', flip, 6);
    // super meter
    var mp = f.meter / 100;
    bar(ctx, x + dir * 84, 79, 330, 13, mp, mp >= 1 ? '#ffe14a' : '#b06cff', mp >= 1 ? '#c98f00' : '#4b2a8a', flip, 6);
    if (mp >= 1) {
      txt(ctx, 'SUPER READY', x + dir * 250, 86, 13, '#ffe98a', 'center', '#3a2500', 3, FONT_UI);
    }

    drawHeadIcon(ctx, f.def, x + dir * 40, 52, 36, flip);
    txt(ctx, f.def.name, x + dir * 88, 105, 20, '#dfe8ff', flip ? 'right' : 'left', '#0a0f22', 4);

    // round pips
    for (var i = 0; i < G.roundsToWin; i++) {
      var px = x + dir * (96 + i * 26);
      ctx.save();
      ctx.translate(px, 128);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.3);
      ctx.fillStyle = i < f.wins ? '#ffd83a' : 'rgba(255,255,255,0.13)';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
      ctx.restore();
    }
    // status tags
    var tag = f.buff > 0 ? 'FRENZY ' + f.buff.toFixed(1) : (f.stam <= 0 ? 'EXHAUSTED' : (f.state === 'dizzy' ? 'DIZZY' : ''));
    if (tag) txt(ctx, tag, x + dir * 260, 105, 17, '#ff9b4a', flip ? 'right' : 'left', '#2a0f00', 4, FONT_UI);
  });

  // online status: who you are in this bout, and the round-trip
  if (G.online) {
    if (NET.isSpectator()) {
      txt(ctx, 'SPECTATING  ·  ESC TO LEAVE', W / 2, 148, 16, '#ffd83a', 'center', '#241800', 4, FONT_UI);
    } else {
      var mineIsLeft = NET.isHost();
      var yx = mineIsLeft ? 300 : W - 300;
      txt(ctx, 'YOU', yx, 128, 18, '#5ce08a', 'center', '#04160a', 5);
      var pg = NET.ping();
      var pcol = pg > 220 ? '#ff6a4a' : (pg > 120 ? '#f2c230' : '#5ce08a');
      var line = 'ONLINE  ' + (pg ? pg + 'ms' : '—');
      var wn = NET.watchers();
      if (wn) line += '   ·   ' + wn + (wn === 1 ? ' WATCHING' : ' WATCHING');
      txt(ctx, line, W / 2, 148, 15, pcol, 'center', '#05070f', 4, FONT_UI);
    }
  }

  // clock
  ctx.save();
  ctx.translate(W / 2, 62);
  rrect(ctx, -58, -34, 116, 72, 12);
  ctx.fillStyle = 'rgba(8,10,24,0.9)'; ctx.fill();
  ctx.strokeStyle = G.clock <= 10 ? '#ff5a4a' : '#4a5a96'; ctx.lineWidth = 3; ctx.stroke();
  txt(ctx, Math.ceil(Math.max(0, G.clock)).toString(), 0, -2, 44, G.clock <= 10 ? '#ff7a5a' : '#eef3ff');
  txt(ctx, 'ROUND ' + G.round, 0, 24, 14, '#8296d0', 'center', null, 0, FONT_UI);
  ctx.restore();
}

/* ------------------------------------------------- combo / announcements */
function drawAnnouncements(ctx, G) {
  // combo counters
  [G.f1, G.f2].forEach(function (f) {
    if (f.combo >= 2 && f.comboT > 0) {
      var a = clamp(f.comboT * 2, 0, 1);
      var x = f.side < 0 ? 300 : W - 300;
      ctx.save();
      ctx.globalAlpha = a;
      var pop = 1 + Math.max(0, 0.35 - (0.4 - clamp(f.comboT, 0, 0.4))) * 0.3;
      ctx.translate(x, 210); ctx.scale(pop, pop);
      txt(ctx, f.combo + ' HIT', 0, 0, 46, '#ffe14a', 'center', '#3a1d00', 9);
      txt(ctx, 'COMBO', 0, 34, 20, '#ffb347', 'center', '#3a1d00', 5);
      ctx.restore();
    }
  });

  if (G.ann && G.annT > 0) {
    var k = clamp(G.annT / G.annDur, 0, 1);
    var scale = 1 + Math.pow(1 - k, 2) * 0.6;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.translate(W / 2 + (G.annSide || 0) * 0, 262);
    ctx.rotate(Math.sin((1 - k) * 12) * 0.02);
    ctx.scale(scale, scale);
    txt(ctx, G.ann, 0, 0, 62, G.annCol || '#fff', 'center', '#120820', 13);
    ctx.restore();
  }
}
