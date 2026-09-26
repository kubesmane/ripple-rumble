/* =========================================================================
   RIPPLE RUMBLE — scenes, input, match flow
   ========================================================================= */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var hintEl = document.getElementById('hint');

/* ------------------------------------------------------------------ input */
var KeyDown = {}, KeyHit = {};
var CTRL = {
  p1: {
    left: ['KeyA'], right: ['KeyD'], block: ['KeyS'], duck: ['KeyW'],
    jab: ['KeyF'], hook: ['KeyG'], body: ['KeyH'], special: ['KeyT', 'Space']
  },
  p2: {
    left: ['ArrowLeft'], right: ['ArrowRight'], block: ['ArrowDown'], duck: ['ArrowUp'],
    jab: ['Numpad1', 'Comma', 'KeyJ'], hook: ['Numpad2', 'Period', 'KeyK'],
    body: ['Numpad3', 'Slash', 'KeyL'], special: ['Numpad0', 'ShiftRight', 'KeyU']
  }
};
var tapTime = { p1: { l: -9, r: -9 }, p2: { l: -9, r: -9 } };

function isDown(codes) {
  for (var i = 0; i < codes.length; i++) if (KeyDown[codes[i]]) return true;
  return false;
}
function isHit(codes) {
  for (var i = 0; i < codes.length; i++) if (KeyHit[codes[i]]) return true;
  return false;
}
function anyAttackHit(scheme) {
  var c = CTRL[scheme];
  return isHit(c.jab) || isHit(c.hook) || isHit(c.body) || isHit(c.special) || isHit(c.block);
}

window.addEventListener('keydown', function (e) {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
  if (!KeyDown[e.code]) KeyHit[e.code] = true;
  KeyDown[e.code] = true;
  SFX.init();
  if (hintEl && !hintEl.classList.contains('gone')) hintEl.classList.add('gone');
});
window.addEventListener('keyup', function (e) { KeyDown[e.code] = false; });
window.addEventListener('blur', function () { KeyDown = {}; });
canvas.addEventListener('mousedown', function () {
  SFX.init();
  if (hintEl) hintEl.classList.add('gone');
});
// a touch is also the gesture browsers require before audio may play
canvas.addEventListener('pointerdown', function () {
  SFX.init();
  if (hintEl) hintEl.classList.add('gone');
}, { passive: true });
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      var p = document.documentElement.requestFullscreen();
      if (p && p.then) p.then(function () {
        // phones: pin to landscape once we own the screen
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); } catch (e) { }
      }).catch(function () { });
    } else document.exitFullscreen();
  } catch (e) { }
}
canvas.addEventListener('dblclick', toggleFullscreen);

function readControls(f, scheme, tNow) {
  var c = CTRL[scheme], i = f.in;
  i.left = isDown(c.left); i.right = isDown(c.right);
  i.block = isDown(c.block); i.duck = isDown(c.duck);
  i.jab = isHit(c.jab); i.hook = isHit(c.hook); i.body = isHit(c.body);
  i.special = isHit(c.special);
  i.dash = 0;
  var tt = tapTime[scheme];
  if (isHit(c.left)) { if (tNow - tt.l < 0.26) { i.dash = -1; tt.l = -9; } else tt.l = tNow; }
  if (isHit(c.right)) { if (tNow - tt.r < 0.26) { i.dash = 1; tt.r = -9; } else tt.r = tNow; }
}

/* =========================================================================
   GAME
   ========================================================================= */
var G = {
  scene: 'title',
  t: 0,
  timeScale: 1,
  hitstop: 0,
  shakeAmt: 0, shakeX: 0, shakeY: 0,
  flashAmt: 0, flashCol: '#fff',
  ann: '', annT: 0, annDur: 1, annCol: '#fff', annSide: 0,
  fx: FX,
  projectiles: [],
  roundsToWin: 2,
  round: 1,
  clock: 99,
  mode: 'arcade',
  difficulty: 1.0,
  diffName: 'NORMAL',
  sel: [0, 1],
  selLocked: [false, false],
  menuIndex: 0,
  ladder: [], ladderIndex: 0,
  f1: null, f2: null, ai1: null, ai2: null,
  ctrl1: 'p1', ctrl2: 'cpu',
  phase: '',
  phaseT: 0,
  musicOn: true, sfxOn: true,   // mirrors SFX, for the on-screen toggles
  online: false,            // this bout is being played over the wire
  netEpoch: -1              // which net match the local fighters belong to
};
bindGame(G);

G.shake = function (a) { this.shakeAmt = Math.max(this.shakeAmt, a); };
G.flash = function (a, col) { this.flashAmt = Math.max(this.flashAmt, a); this.flashCol = col || '#fff'; };
G.announce = function (s, side, col, dur) {
  this.ann = s; this.annT = dur || 1.1; this.annDur = dur || 1.1;
  this.annCol = col || '#ffffff'; this.annSide = side || 0;
};

/* ---------------------------------------------------------- hit handling */
G.tryHit = function (a, d, atk) {
  var dist = Math.abs(d.x - a.x);
  if (Math.sign(d.x - a.x) !== a.facing) return false;
  if (dist > atk.reach + 26) return false;

  var hx = a.x + a.facing * (atk.reach * 0.72);
  var hy = RING.floorY - (atk.height === 'body' ? 150 : 232) + d.pose.crouch * 30;

  // evasion
  if (d.iframes > 0 || d.state === 'dodge') {
    FX.popup(d.x, RING.floorY - 300, 'DODGE!', '#9fe8ff', 26);
    SFX.whiff();
    return false;
  }
  if (d.state === 'duck' && atk.height === 'head' && !atk.superMove) {
    FX.popup(d.x, RING.floorY - 300, 'WEAVE!', '#9fe8ff', 26);
    SFX.whiff();
    return false;
  }
  if (d.state === 'down' || d.state === 'ko') return false;

  // block
  var blocking = (d.state === 'block') && !atk.unblockable;
  if (blocking) {
    // EL LOBO parry
    if (d.def.id === 'lobo' && d.blockTime < 0.14 && !atk.superMove) {
      SFX.parry(); NET.event(2, hx, hy, 0.6);
      FX.spark(hx, hy, 0.6, '#9fe8ff');
      FX.popup(d.x, RING.floorY - 310, 'PARRY!', '#9fe8ff', 34);
      G.flash(0.35, '#bfe9ff'); G.shake(8); G.hitstop = 0.10;
      d.meter = clamp(d.meter + 18, 0, 100);
      a.setState('hitstun', 0.34); a.vx = -a.facing * 150;
      // free counter — fired directly, since an input flag set here would be
      // overwritten before the parrying fighter's own update runs
      d.setState('idle');
      d.facing = a.x >= d.x ? 1 : -1;
      d.tryAttack('jab');
      return true;
    }
    if (atk.guardBreak) {
      d.setState('hitstun', 0.7);
      d.stun = 100;
      this.applyDamage(a, d, atk, 'guardbreak', 0.55);
      FX.popup(d.x, RING.floorY - 320, 'GUARD BREAK!', '#ff9b4a', 30);
      NET.event(3, d.x, RING.floorY - 320, 1);
      SFX.superHit();
      return true;
    }
    var mult = atk.height === 'body' ? 0.42 : 0.14;
    if (d.def.id === 'bruiser') mult *= 0.55;                 // ROYAL HIDE
    if (a.buff > 0) mult *= 2.0;                              // frenzy chips guard
    var dmg = atk.dmg * mult * a.damageScale();
    d.hp = Math.max(0, d.hp - dmg);
    d.stam = Math.max(0, d.stam - (atk.stamDmg ? atk.stamDmg * 0.8 : 8 + atk.weight * 12));
    d.meter = clamp(d.meter + 4, 0, 100);
    a.meter = clamp(a.meter + (atk.meter || 4) * 0.5 * a.def.stats.meterRate, 0, 100);
    if (!atk.noBlockPush) {
      d.vx = a.facing * atk.push * 0.5;
      a.vx = -a.facing * atk.push * 0.14;
    }
    d.noHitTime = 0;
    SFX.block(); NET.event(1, hx, hy, 0.25);
    FX.spark(hx, hy, 0.25, '#cfe3ff');
    FX.popup(d.x + a.facing * -20, RING.floorY - 300, 'BLOCK', '#9db4e8', 20);
    G.shake(3 + atk.weight * 4);
    G.hitstop = 0.045;
    if (d.hp <= 0) this.knockdown(d, a);
    return true;
  }

  this.applyDamage(a, d, atk, 'clean', 1);
  return true;
};

G.applyDamage = function (a, d, atk, kind, scale) {
  scale = scale === undefined ? 1 : scale;
  var counter = (d.state === 'attack' && d.atk && d.t < d.atk.startup * 1.1) ||
    (d.state === 'duck' && atk.height === 'body');
  var defFactor = 1 / (0.45 + d.def.stats.defense * 0.55);
  var dmg = atk.dmg * a.damageScale() * defFactor * scale;
  if (counter) dmg *= 1.35;
  if (d.state === 'dizzy') dmg *= 1.4;

  // armour (bruiser hook startup / riptide frenzy)
  var armored = (d.armor > 0 || (d.buff > 0 && atk.weight < 0.9)) && !atk.superMove;
  if (armored) dmg *= 0.55;

  d.hp = Math.max(0, d.hp - dmg);
  d.noHitTime = 0;
  d.stun += atk.stun * (counter ? 1.4 : 1);
  if (atk.stamDmg) d.stam = Math.max(0, d.stam - atk.stamDmg);

  a.meter = clamp(a.meter + (atk.meter || 6) * a.def.stats.meterRate, 0, 100);
  d.meter = clamp(d.meter + (atk.meter || 6) * 0.55 * d.def.stats.meterRate, 0, 100);

  a.combo++; a.comboT = 1.1;
  d.combo = 0;

  var hx = a.x + a.facing * (atk.reach ? atk.reach * 0.7 : 70);
  var hy = RING.floorY - (atk.height === 'body' ? 150 : 236) + d.pose.crouch * 28;

  d.hitFlash = 1;
  var w = clamp(atk.weight, 0.15, 1);
  SFX.hit(w); NET.event(0, hx, hy, w);
  FX.spark(hx, hy, w, counter ? '#ff8a4a' : '#fff0a8');
  FX.sweat(d.x, hy, a.facing);
  G.shake(5 + w * 20);
  G.hitstop = 0.035 + w * 0.075;
  if (w > 0.6) G.flash(0.18, '#ffffff');

  if (counter) FX.popup(d.x, RING.floorY - 318, 'COUNTER!', '#ff8a4a', 28);
  if (kind === 'slam') FX.popup(d.x, RING.floorY - 318, 'SLAM!', '#ffd83a', 34);

  if (!armored || atk.superMove) {
    var hs = 0.18 + w * 0.22;
    d.setState(atk.height === 'body' ? 'hitstunBody' : 'hitstun', hs);
    d.vx = a.facing * atk.push;
    d.pose.headX = a.facing * 4;
  } else {
    FX.popup(d.x, RING.floorY - 300, 'ARMOR', '#c0a0ff', 20);
  }

  if (d.hp <= 0) { this.knockdown(d, a); return; }

  if (d.stun >= 100 && d.state !== 'dizzy') {
    d.stun = 0;
    d.setState('dizzy', 2.3);
    SFX.dizzy();
    FX.stars(d.x, RING.floorY - 300);
    G.announce('DIZZY!', d.side, '#ffe14a', 0.9);
  }
};

G.spawnProjectile = function (f) {
  G.projectiles.push({
    x: f.x + f.facing * 70, y: RING.floorY - 200, vx: f.facing * 620,
    owner: f, life: 2.2, age: 0, r: 26
  });
};

/* ----------------------------------------------------------- knockdowns */
G.knockdown = function (f, by) {
  f.downs++;
  var final = f.downs >= 2;
  f.goDown(final);
  by.combo = 0;
  G.hitstop = 0.28;
  G.shake(30);
  G.flash(0.7, '#ffffff');
  NET.event(7, f.x, RING.floorY - 200, 1);
  SFX.ko();
  if (final) {
    f.st.headless = true;
    FX.headPop(f);
    NET.event(8, f.x, RING.floorY - 240, 1);
    SFX.pop();
    G.phase = 'ko'; G.phaseT = 0;
    G.timeScale = 0.25;
    G.annT = 0;                     // the big K.O. card is drawn by drawFight
    by.setState('win');
    G.winner = by;
  } else {
    G.phase = 'count'; G.phaseT = 0;
    G.countT = 0; G.lastCount = 0;
    f.getUp = 0;
    G.downed = f;
    G.annT = 0;                     // the count overlay announces the knockdown
    G.timeScale = 0.55;
  }
};

/* ----------------------------------------------------------- match setup */
function makeFighters() {
  G.f1 = new Fighter(fighterById(ROSTER[G.sel[0]].id), -1, G.ctrl1 === 'cpu');
  G.f2 = new Fighter(fighterById(ROSTER[G.sel[1]].id), 1, G.ctrl2 === 'cpu');
  G.ai1 = G.ctrl1 === 'cpu' ? new AI(G.f1, G.f1.def.ai, G.difficulty) : null;
  G.ai2 = G.ctrl2 === 'cpu' ? new AI(G.f2, G.f2.def.ai, G.difficulty) : null;
  G.round = 1;
  G.f1.resetMatch(); G.f2.resetMatch();
  startRound(true);
}

function startRound(first) {
  G.f1.resetRound(); G.f2.resetRound();
  G.f1.hpGhost = 1; G.f2.hpGhost = 1;
  G.clock = 99;
  G.projectiles.length = 0;
  FX.clear();
  G.phase = 'intro'; G.phaseT = 0;
  G.timeScale = 1;
  G.winner = null;
  G.downed = null;
  SFX.music('fight');
  SFX.crowd(0.12);
  G.announce('ROUND ' + G.round, 0, '#ffe14a', 1.4);
  SFX.bell(first ? 3 : 1);
  NET.event(5, 0, 0, 0);
}

function endRound(winner, reason) {
  if (G.phase === 'roundend') return;
  G.phase = 'roundend'; G.phaseT = 0;
  G.annT = 0;                      // clear any leftover call-out before the result text
  if (winner) {
    winner.wins++;
    winner.setState('win');
    G.winner = winner;
  }
  var loser = winner === G.f1 ? G.f2 : G.f1;
  if (loser && loser.state !== 'down' && loser.state !== 'ko') loser.setState('idle');
  SFX.bell(2);
  SFX.cheer(1);
  if (winner && winner.wins >= G.roundsToWin) {
    G.announce(reason === 'ko' ? 'K.O.!' : 'WINNER!', 0, '#ffe14a', 2);
  } else {
    G.announce(reason === 'time' ? 'TIME UP!' : 'ROUND ' + G.round, 0, '#ffe14a', 1.6);
  }
}

/* =========================================================================
   SCENE: FIGHT
   ========================================================================= */
function updateFight(dt) {
  var f1 = G.f1, f2 = G.f2;

  // pause (never online — the other player keeps fighting)
  if (!G.online && isHit(['Escape'])) { G.paused = !G.paused; SFX.ui(true); }
  if (G.online && isHit(['Escape'])) { quitOnlineMatch('YOU LEFT THE MATCH'); return; }
  if (G.paused) return;

  if (G.online) { if (!updateOnlineFight(dt)) return; }

  // gather input (always, so menus stay responsive)
  if (!G.online) {
    if (G.ctrl1 === 'cpu') G.ai1.think(dt, f2); else readControls(f1, 'p1', G.t);
    if (G.ctrl2 === 'cpu') G.ai2.think(dt, f1); else readControls(f2, 'p2', G.t);
  }

  // facing
  if (f1.canAct()) f1.facing = f2.x >= f1.x ? 1 : -1;
  if (f2.canAct()) f2.facing = f1.x >= f2.x ? 1 : -1;

  /* ---------- phases ---------- */
  if (G.phase === 'intro') {
    G.phaseT += dt;
    f1.in = {}; f2.in = {};
    if (G.phaseT > 1.5 && !G.introFight) {
      G.introFight = true;
      G.announce('FIGHT!', 0, '#5ce08a', 1.0);
      SFX.bell(1); SFX.cheer(0.6);
      NET.event(5, 0, 0, 0);
    }
    if (G.phaseT > 2.2) { G.phase = 'fight'; G.introFight = false; }
  } else if (G.phase === 'fight') {
    G.clock -= dt;
    if (G.clock <= 0) {
      G.clock = 0;
      var p1p = f1.hp / f1.maxHp, p2p = f2.hp / f2.maxHp;
      if (Math.abs(p1p - p2p) < 0.02) { endRound(null, 'time'); G.announce('DRAW ROUND', 0, '#c0c8e0', 1.8); }
      else endRound(p1p > p2p ? f1 : f2, 'time');
    }
    if (G.clock <= 10 && Math.floor(G.clock) !== G.lastTick) {
      G.lastTick = Math.floor(G.clock);
      if (G.clock > 0) SFX.heartbeat();
    }
  } else if (G.phase === 'count') {
    G.phaseT += dt;
    G.countT += dt / 1.0;
    var n = Math.floor(G.countT) + 1;
    if (n !== G.lastCount && n <= 10) { G.lastCount = n; SFX.count(n); }
    var d = G.downed;
    // Mashing is read from the downed fighter's OWN input, which is already
    // filled in for every mode: local keys, or a remote player's presses
    // relayed by the host. Reading a keyboard here got the online guest (who
    // plays on the right with the P1 keys) and let a host mash the opponent up.
    var dCtrl = (d === f1) ? G.ctrl1 : G.ctrl2;
    if (dCtrl !== 'cpu') {
      // decay first, so a press that reaches the top still reads as full:
      // clamping and then decaying in the same frame capped it just under 1
      d.getUp = Math.max(0, d.getUp - dt * 0.14);
      var i = d.in || {};
      if (i.jab || i.hook || i.body || i.special) d.getUp = Math.min(1, d.getUp + 0.11);
    }
    if (d.getUp >= 1) {
      d.hp = d.maxHp * 0.30;
      d.stun = 0; d.stam = d.maxStam * 0.6; d.st.ko = false;
      d.setState('idle');
      d.x = d.side < 0 ? RING.left + 200 : RING.right - 200;
      (d === f1 ? f2 : f1).x = d.side < 0 ? RING.left + 420 : RING.right - 420;
      G.phase = 'fight'; G.timeScale = 1;
      G.announce('BACK UP!', d.side, '#5ce08a', 1.2);
      SFX.cheer(0.7);
    } else if (G.countT >= 10) {
      d.downs = 2; d.st.headless = true;
      FX.headPop(d); SFX.pop(); SFX.ko();
      G.phase = 'ko'; G.phaseT = 0; G.timeScale = 0.3;
      G.winner = d === f1 ? f2 : f1;
      G.winner.setState('win');
      G.annT = 0;
    }
  } else if (G.phase === 'ko') {
    G.phaseT += dt;
    G.timeScale = lerp(G.timeScale, 1, dt * 0.8);
    if (G.phaseT > 2.4) endRound(G.winner, 'ko');
  } else if (G.phase === 'roundend') {
    G.phaseT += dt;
    G.timeScale = 1;
    if (G.phaseT > 2.6) {
      var champ = f1.wins >= G.roundsToWin ? f1 : (f2.wins >= G.roundsToWin ? f2 : null);
      if (champ) {
        G.matchWinner = champ;
        G.scene = 'result';
        G.resultT = 0;
        G.annT = 0;
        FX.clear();                 // leave the combat popups in the ring
        SFX.music('menu');
        SFX.cheer(1.2);
      } else {
        G.round++;
        startRound(false);
      }
    }
  }

  /* ---------- simulation ---------- */
  var scaled = dt * G.timeScale;
  if (G.hitstop > 0) { G.hitstop -= dt; scaled = 0; }

  if (G.phase !== 'intro') {
    f1.update(scaled, f2);
    f2.update(scaled, f1);

    // separation
    var gap = f2.x - f1.x;
    if (Math.abs(gap) < MIN_GAP) {
      var push = (MIN_GAP - Math.abs(gap)) / 2 * Math.sign(gap || 1);
      f1.x -= push; f2.x += push;
      f1.x = clamp(f1.x, RING.left, RING.right);
      f2.x = clamp(f2.x, RING.left, RING.right);
    }

    // projectiles
    for (var i = G.projectiles.length - 1; i >= 0; i--) {
      var p = G.projectiles[i];
      p.age += scaled; p.x += p.vx * scaled;
      var target = p.owner === f1 ? f2 : f1;
      if (Math.abs(p.x - target.x) < 52 && target.state !== 'down' && target.state !== 'ko') {
        if (target.iframes > 0 || target.state === 'dodge') {
          FX.popup(target.x, RING.floorY - 300, 'DODGE!', '#9fe8ff', 26);
        } else {
          G.tryHit(p.owner, target, {
            key: 'surge', label: 'SURGE', height: 'head', dmg: 17 * p.owner.def.stats.power,
            stun: 45, reach: 999, push: 240, meter: 0, weight: 0.8, superMove: true
          });
          FX.shock(p.x, RING.floorY - 180, '#3B8CFF');
        }
        G.projectiles.splice(i, 1); continue;
      }
      if (p.age > p.life || p.x < RING.left - 80 || p.x > RING.right + 80) G.projectiles.splice(i, 1);
    }
  }

  // hp ghost bars
  [f1, f2].forEach(function (f) {
    var target = f.hp / f.maxHp;
    if (f.hpGhost === undefined) f.hpGhost = target;
    f.hpGhost = f.hpGhost > target ? Math.max(target, f.hpGhost - dt * 0.22) : target;
  });

  // ambience rises with damage dealt
  var heat = 1 - Math.min(f1.hp / f1.maxHp, f2.hp / f2.maxHp);
  SFX.crowd(0.07 + heat * 0.12, 1.5);

  // the host is the authority: publish the settled frame
  if (G.online && NET.isHost()) NET.pushHost(G);
}

/* ------------------------------------------------------------- fight draw */
function drawFight() {
  var f1 = G.f1, f2 = G.f2;
  var mid = (f1.x + f2.x) / 2;
  var dist = Math.abs(f1.x - f2.x);
  var zoom = clamp(1.18 - dist / 2600, 1.02, 1.13);
  var maxOff = (W / 2) * (1 - 1 / zoom);
  var camX = clamp(mid - W / 2, -maxOff, maxOff);

  ctx.save();
  ctx.translate(W / 2 + G.shakeX, 470 + G.shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2 - camX, -470);

  drawArena(ctx, G.t, clamp(1 - Math.min(f1.hp / f1.maxHp, f2.hp / f2.maxHp), 0, 1));

  // fighters (further-back one first — the left fighter stands slightly upstage)
  var order = f1.x <= f2.x ? [f1, f2] : [f2, f1];
  order.forEach(function (f, idx) {
    var depth = f === order[0] ? -14 : 0;
    drawFighterShadowed(f, depth);
  });

  // projectiles
  G.projectiles.forEach(function (p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 0.9;
    var g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
    g.addColorStop(0, '#dff0ff'); g.addColorStop(0.4, '#3B8CFF'); g.addColorStop(1, 'rgba(59,140,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 38, 0, 0, 6.3); ctx.fill();
    ctx.rotate(p.age * 7);
    drawRippleMark(ctx, 0, 0, 16, '#ffffff');
    ctx.restore();
  });

  FX.draw(ctx);
  drawRopesFront(ctx);
  ctx.restore();

  drawHUD(ctx, G);
  TOUCH.fightPads(ctx, G);
  drawAnnouncements(ctx, G);

  // dizzy / low-health vignette
  var low = Math.min(f1.hp / f1.maxHp, f2.hp / f2.maxHp);
  if (low < 0.25) {
    var v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 760);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(120,0,0,' + (0.30 * (1 - low / 0.25)) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  if (G.phase === 'count' && G.downed) {
    drawCount();
  }
  if (G.phase === 'ko') {
    ctx.save();
    ctx.globalAlpha = clamp(1 - G.phaseT / 2.4, 0, 1) * 0.35;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    var s = clamp(G.phaseT * 3, 0, 1);
    ctx.save();
    ctx.translate(W / 2, 300);
    ctx.scale(1 + (1 - s) * 2, 1 + (1 - s) * 2);
    ctx.rotate((1 - s) * 0.4);
    txt(ctx, 'K.O.!', 0, 0, 150, '#ff5a4a', 'center', '#2a0000', 20);
    ctx.restore();
    txt(ctx, G.winner ? G.winner.def.name + ' WINS THE ROUND' : '', W / 2, 400, 30, '#ffe6b0', 'center', '#2a1200', 7);
  }
  if (G.phase === 'roundend' && G.winner) {
    txt(ctx, G.winner.def.name, W / 2, 300, 62, '#ffe14a', 'center', '#2a1a00', 12);
    txt(ctx, G.winner.wins >= G.roundsToWin ? 'WINS THE MATCH' : 'TAKES THE ROUND', W / 2, 356, 28, '#fff', 'center', '#2a1a00', 7);
    txt(ctx, '"' + G.winner.def.quip + '"', W / 2, 402, 22, '#9fb4e8', 'center', '#101830', 5, FONT_UI);
  }
  if (G.paused) {
    ctx.fillStyle = 'rgba(4,6,16,0.75)'; ctx.fillRect(0, 0, W, H);
    txt(ctx, 'PAUSED', W / 2, 260, 80, '#fff', 'center', '#000', 14);
    if (TOUCH.isActive()) {
      TOUCH.btn(ctx, W / 2 - 230, 340, 210, 62, 'RESUME', { key: 'presume', size: 22, code: 'Escape' });
      TOUCH.btn(ctx, W / 2 + 20, 340, 210, 62, 'QUIT', {
        key: 'pquit', size: 22,
        tap: function () { G.scene = 'title'; G.paused = false; SFX.music('menu'); SFX.crowd(0.05); }
      });
    } else {
      txt(ctx, 'ESC to resume  ·  BACKSPACE to quit to menu', W / 2, 372, 22, '#9fb4e8', 'center', null, 0, FONT_UI);
    }
    if (isHit(['Backspace'])) { G.scene = 'title'; G.paused = false; SFX.music('menu'); SFX.crowd(0.05); }
  }
}

function drawFighterShadowed(f, depth) {
  var st = f.st;
  st.t = f.st.t;
  var y = RING.floorY + depth * 0.4;
  var scale = 1 + depth * 0.004;
  if (f.state === 'down' || f.state === 'ko' || (st.headless && f.state !== 'win')) {
    // lying down: rotate the whole toy
    ctx.save();
    ctx.translate(f.x, y);
    var p = clamp(f.downT || 0, 0, 1);
    ctx.rotate(-f.facing * 1.45 * easeOut(p));
    ctx.translate(0, 0);
    drawFighter(ctx, f.def, f.pose, st, 0, 0, f.facing, scale);
    ctx.restore();
    return;
  }
  drawFighter(ctx, f.def, f.pose, st, f.x, y, f.facing, scale);
  // frenzy aura
  if (f.buff > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(G.t * 12) * 0.08;
    ctx.strokeStyle = f.def.colors.accent; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(f.x, y - 150, 74, 160, 0, 0, 6.3); ctx.stroke();
    ctx.restore();
  }
  // super-ready shimmer
  if (f.meter >= 100 && f.state !== 'special') {
    ctx.save();
    ctx.globalAlpha = 0.16 + Math.sin(G.t * 7) * 0.07;
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.ellipse(f.x, y - 8, 66, 18, 0, 0, 6.3); ctx.fill();
    ctx.restore();
  }
  if (f.state === 'dizzy') {
    FX.stars(f.x + f.pose.headX, y - 300);
  }
}

function drawCount() {
  var d = G.downed;
  var n = Math.min(10, Math.floor(G.countT) + 1);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  var pulse = 1 + (1 - (G.countT % 1)) * 0.35;
  ctx.save();
  ctx.translate(W / 2, 250);
  ctx.scale(pulse, pulse);
  txt(ctx, n.toString(), 0, 0, 130, n >= 8 ? '#ff5a4a' : '#ffe14a', 'center', '#2a1000', 16);
  ctx.restore();
  // only the player who is actually on the canvas is told to mash
  var mineDown;
  if (G.online) mineDown = NET.isSpectator() ? false : (d === (NET.isHost() ? G.f1 : G.f2));
  else mineDown = ((d === G.f1) ? G.ctrl1 : G.ctrl2) !== 'cpu';
  txt(ctx, mineDown ? 'MASH PUNCH KEYS TO GET UP!' : d.def.name + ' IS DOWN!', W / 2, 348, 30, '#fff', 'center', '#200', 7);
  // get-up meter
  var bw = 420;
  ctx.save();
  ctx.translate(W / 2 - bw / 2, 380);
  rrect(ctx, 0, 0, bw, 26, 8); ctx.fillStyle = 'rgba(10,12,24,0.9)'; ctx.fill();
  ctx.strokeStyle = '#6a7cb8'; ctx.lineWidth = 3; ctx.stroke();
  ctx.save();
  rrect(ctx, 2, 2, bw - 4, 22, 6); ctx.clip();
  var g = ctx.createLinearGradient(0, 0, bw, 0);
  g.addColorStop(0, '#5ce08a'); g.addColorStop(1, '#ffe14a');
  ctx.fillStyle = g;
  ctx.fillRect(2, 2, (bw - 4) * d.getUp, 22);
  ctx.restore();
  ctx.restore();
}

/* =========================================================================
   SCENE: TITLE
   ========================================================================= */
var titlePose = null;
function drawTitle(dt) {
  ctx.save();
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0e22'); g.addColorStop(0.55, '#141a38'); g.addColorStop(1, '#05060f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // sweeping light
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.translate(W / 2, -160);
  ctx.rotate(Math.sin(G.t * 0.5) * 0.5);
  var lg = ctx.createLinearGradient(0, 0, 0, 900);
  lg.addColorStop(0, 'rgba(90,160,255,0.9)'); lg.addColorStop(1, 'rgba(90,160,255,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(70, 0); ctx.lineTo(420, 900); ctx.lineTo(-420, 900);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // roster line-up
  ROSTER.forEach(function (def, i) {
    var x = 190 + i * 228;
    var bobT = G.t * 2 + i * 1.1;
    var pose = titlePose[i];
    pose.bob = Math.sin(bobT) * 3;
    pose.fg.x = 40 + Math.sin(bobT * 1.3) * 5;
    pose.fg.y = -196 + Math.cos(bobT * 1.1) * 4;
    pose.bg.x = 8 + Math.cos(bobT) * 4;
    pose.bg.y = -208 + Math.sin(bobT * 1.4) * 3;
    pose.headTilt = Math.sin(bobT * 0.7) * 0.05;
    ctx.save();
    ctx.globalAlpha = 0.95;
    drawFighter(ctx, def, pose, { flash: 0, hurt: false, dizzy: false, ko: false, mouth: 0.2, rage: false, t: G.t }, x, 668, i < 2 ? 1 : -1, 0.76);
    ctx.restore();
  });
  // soften the space the logo sits in
  var band = ctx.createLinearGradient(0, 250, 0, 500);
  band.addColorStop(0, 'rgba(5,7,18,0.80)');
  band.addColorStop(1, 'rgba(5,7,18,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 250, W, 250);
  var foot = ctx.createLinearGradient(0, 640, 0, H);
  foot.addColorStop(0, 'rgba(5,7,18,0)');
  foot.addColorStop(1, 'rgba(5,7,18,0.92)');
  ctx.fillStyle = foot;
  ctx.fillRect(0, 640, W, H - 640);

  // logo
  ctx.save();
  ctx.translate(W / 2, 186);
  var pulse = 1 + Math.sin(G.t * 2.4) * 0.015;
  ctx.scale(pulse, pulse);
  drawRippleMark(ctx, 0, -92, 46, '#2f7dff');
  txt(ctx, 'RIPPLE RUMBLE', 0, 12, 104, '#f2f7ff', 'center', '#101a3e', 18);
  ctx.save();
  ctx.globalAlpha = 0.35;
  txt(ctx, 'RIPPLE RUMBLE', 0, 12, 104, '#5ea0ff', 'center', null, 0);
  ctx.restore();
  txt(ctx, 'KNOCK  HIS  BLOCK  OFF', 0, 72, 27, '#ffd83a', 'center', '#3a2200', 7);
  ctx.restore();

  var blink = Math.sin(G.t * 4) > -0.3;
  TOUCH.anywhere('Enter');
  if (blink) txt(ctx, TOUCH.isActive() ? 'TAP  TO  START' : 'PRESS  ENTER', W / 2, 408, 42, '#fff', 'center', '#101a3e', 9);
  if (TOUCH.isActive()) {
    // registered after `anywhere`, so these win the tap
    TOUCH.btn(ctx, 24, 648, 168, 52, G.musicOn ? 'MUSIC  ON' : 'MUSIC  OFF', {
      key: 'tmusic', size: 16, tap: function () { G.musicOn = SFX.toggleMusic(); }
    });
    TOUCH.btn(ctx, 204, 648, 168, 52, G.sfxOn ? 'SOUND  ON' : 'SOUND  OFF', {
      key: 'tsfx', size: 16, tap: function () { G.sfxOn = SFX.toggleSfx(); }
    });
    TOUCH.btn(ctx, W - 192, 648, 168, 52, 'FULLSCREEN', {
      key: 'tfull', size: 16, tap: toggleFullscreen
    });
  } else {
    txt(ctx, 'ENTER / SPACE — START      M — MUSIC      N — SFX      DOUBLE-CLICK — FULLSCREEN',
      W / 2, 700, 16, '#7d90c4', 'center', '#05070f', 4, FONT_UI);
  }

  if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyT', 'KeyF'])) {
    G.scene = 'menu'; G.menuIndex = 0; SFX.confirm(); SFX.music('menu');
  }
}

/* =========================================================================
   SCENE: MENU
   ========================================================================= */
var MENU = [
  { id: 'online', label: 'ONLINE PVP', desc: 'Fight a friend on another screen. Quick match or a room code.' },
  { id: 'arcade', label: 'ARCADE', desc: 'Fight the whole roster. Win the belt.' },
  { id: 'vscpu', label: 'VS CPU', desc: 'Single exhibition bout against the computer.' },
  { id: 'vs2p', label: '2 PLAYER', desc: 'Two fighters, one keyboard, no mercy.' },
  { id: 'howto', label: 'HOW TO PLAY', desc: 'Controls and the rules of the ring.' }
];
var DIFFS = [{ n: 'ROOKIE', v: 0.72 }, { n: 'NORMAL', v: 1.0 }, { n: 'CONTENDER', v: 1.22 }, { n: 'CHAMPION', v: 1.45 }];
var diffIdx = 1;

function drawMenu() {
  drawMenuBackdrop();
  txt(ctx, 'CHOOSE YOUR BOUT', W / 2, 120, 52, '#f2f7ff', 'center', '#101a3e', 11);

  MENU.forEach(function (m, i) {
    var sel = i === G.menuIndex;
    var y = 230 + i * 84;
    TOUCH.row('menu' + i, W / 2 - 300, y - 32, 600, 64, function () {
      G.menuIndex = i; KeyHit['Enter'] = true;
    });
    ctx.save();
    ctx.translate(W / 2, y);
    if (sel) ctx.scale(1.06, 1.06);
    rrect(ctx, -300, -32, 600, 64, 12);
    ctx.fillStyle = sel ? 'rgba(47,125,255,0.30)' : 'rgba(12,16,34,0.72)';
    ctx.fill();
    ctx.strokeStyle = sel ? '#6fb0ff' : '#28325c';
    ctx.lineWidth = sel ? 4 : 2; ctx.stroke();
    txt(ctx, m.label, -270, -6, 30, sel ? '#ffffff' : '#a9b7e0', 'left', '#0a0f22', 6);
    txt(ctx, m.desc, -270, 20, 15, sel ? '#c8d8ff' : '#64749f', 'left', null, 0, FONT_UI);
    if (m.id === 'vscpu' || m.id === 'arcade') {
      txt(ctx, '< ' + DIFFS[diffIdx].n + ' >', 230, 0, 22, sel ? '#ffd83a' : '#7d8cba', 'center', '#241800', 5);
    }
    ctx.restore();

    // difficulty is a setting, so it needs its own targets — registered after
    // the row so a tap on an arrow changes difficulty instead of starting
    if ((m.id === 'vscpu' || m.id === 'arcade') && TOUCH.isActive()) {
      TOUCH.btn(ctx, W / 2 + 146, y - 24, 48, 48, '◀', {
        key: 'diffdn' + i, size: 20,
        tap: function () { diffIdx = (diffIdx + DIFFS.length - 1) % DIFFS.length; G.menuIndex = i; SFX.ui(false); }
      });
      TOUCH.btn(ctx, W / 2 + 266, y - 24, 48, 48, '▶', {
        key: 'diffup' + i, size: 20,
        tap: function () { diffIdx = (diffIdx + 1) % DIFFS.length; G.menuIndex = i; SFX.ui(true); }
      });
    }
  });
  TOUCH.backBtn(ctx);

  txt(ctx, 'W/S or ARROWS — MOVE     A/D — DIFFICULTY     ENTER — SELECT     ESC — BACK',
    W / 2, 640, 16, '#6d80b4', 'center', null, 0, FONT_UI);

  if (isHit(['KeyW', 'ArrowUp'])) { G.menuIndex = (G.menuIndex + MENU.length - 1) % MENU.length; SFX.ui(true); }
  if (isHit(['KeyS', 'ArrowDown'])) { G.menuIndex = (G.menuIndex + 1) % MENU.length; SFX.ui(false); }
  if (isHit(['KeyA', 'ArrowLeft'])) { diffIdx = (diffIdx + DIFFS.length - 1) % DIFFS.length; SFX.ui(false); }
  if (isHit(['KeyD', 'ArrowRight'])) { diffIdx = (diffIdx + 1) % DIFFS.length; SFX.ui(true); }
  if (isHit(['Escape'])) { G.scene = 'title'; SFX.ui(false); }
  if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) {
    var m = MENU[G.menuIndex];
    SFX.confirm();
    G.difficulty = DIFFS[diffIdx].v; G.diffName = DIFFS[diffIdx].n;
    if (m.id === 'howto') { G.scene = 'howto'; return; }
    if (m.id === 'online') { G.scene = 'online'; G.mode = 'online'; NET.enterLobby(); return; }
    G.online = false;
    G.mode = m.id;
    G.scene = 'select';
    G.selLocked = [false, m.id !== 'vs2p'];
    G.sel = [0, 1];
    if (m.id !== 'vs2p') G.selLocked[1] = false;
    G.selP2Auto = m.id !== 'vs2p';
  }
}

/* =========================================================================
   SCENE: ONLINE LOBBY
   ========================================================================= */
var onlineIndex = 0, joinBuf = '', joinMode = false, watchMode = false, watchIndex = 0;
var ONLINE_ACTIONS = [
  { id: 'quick', label: 'QUICK MATCH', desc: 'Pair with anyone else waiting right now.' },
  { id: 'create', label: 'CREATE A ROOM', desc: 'Get a 4-letter code and pass it to your opponent.' },
  { id: 'join', label: 'JOIN WITH A CODE', desc: 'Type the code your opponent read out.' },
  { id: 'watch', label: 'WATCH A MATCH', desc: 'Take a ringside seat at a bout already under way.' },
  { id: 'back', label: 'BACK', desc: 'Return to the main menu.' }
];
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function drawOnline(dt) {
  drawMenuBackdrop();
  NET.enterLobby();
  var S = NET.S;

  // came in on an invite link: join that room the moment we have a connection
  if (G.pendingCode && S.ready && S.supported && S.phase === 'lobby') {
    var code = G.pendingCode; G.pendingCode = null;
    NET.joinCode(code);
    SFX.confirm();
  }
  if (G.pendingCode && S.ready && !S.supported) G.pendingCode = null;

  txt(ctx, 'ONLINE PVP', W / 2, 74, 46, '#f2f7ff', 'center', '#101a3e', 10);

  /* ---- connection strip ---- */
  var live = S.ready && S.supported && (!S.lobby || S.lobby.connected());
  var connected = S.ready && S.supported;
  var pill = !S.ready ? 'CONNECTING…'
    : (S.error ? 'BLOCKED: ' + S.error.toUpperCase().replace(/_/g, ' ')
      : (connected ? NET.kindLabel() + (live ? ' — CONNECTED' : ' — RECONNECTING…') : 'NO CONNECTION'));
  var pillCol = !S.ready ? '#8a9cd0' : (S.error ? '#ff6a4a' : (live ? '#5ce08a' : '#f2c230'));
  ctx.save();
  ctx.translate(W / 2, 122);
  rrect(ctx, -240, -19, 480, 38, 19);
  ctx.fillStyle = 'rgba(10,14,32,0.85)'; ctx.fill();
  ctx.strokeStyle = pillCol; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(-206, 0, 7, 0, 6.3); ctx.fillStyle = pillCol; ctx.fill();
  txt(ctx, pill, 14, 1, 19, pillCol, 'center', null, 0, FONT_UI);
  ctx.restore();

  if (S.kind === 'p2p' && !NET.lobbyPlayers().length) {
    txt(ctx, 'Peer-to-peer can take 10–20 seconds to find people. Hang on.',
      W / 2, 148, 14, '#6d80b4', 'center', null, 0, FONT_UI);
  }
  txt(ctx, 'YOU ARE  ' + S.handle, W / 2, 168, 26, '#ffd83a', 'center', '#241800', 6);
  txt(ctx, 'R — NEW NAME', W / 2, 194, 14, '#6d80b4', 'center', null, 0, FONT_UI);
  if (isHit(['KeyR']) && !joinMode) { NET.reroll(); SFX.ui(true); }

  /* ---- who else is here ---- */
  var others = NET.lobbyPlayers();
  var stats = NET.lobbyStats();
  var headline = others.length
    ? others.length + (others.length === 1 ? ' FIGHTER' : ' FIGHTERS') + ' HERE WITH YOU'
    : 'NOBODY ELSE HERE YET';
  if (stats.seeking) headline += '   ·   ' + stats.seeking + ' LOOKING';
  if (stats.matches) headline += '   ·   ' + stats.matches + (stats.matches === 1 ? ' MATCH' : ' MATCHES') + ' ON';
  txt(ctx, headline, W / 2, 230, 18, others.length ? '#9fb4e8' : '#5d6a91', 'center', null, 0, FONT_UI);

  // everyone in the room, three to a line, challengeable players first
  var COLS = 3, ROWS = 4, SLOTS = COLS * ROWS, colW = 338, rowH = 19;
  var gridL = W / 2 - (COLS * colW) / 2;
  var overflow = others.length > SLOTS;
  var shown = overflow ? SLOTS - 1 : others.length;
  for (var i = 0; i < shown; i++) {
    var p = others[i];
    var cx = gridL + (i % COLS) * colW;
    var cy = 252 + ((i / COLS) | 0) * rowH;
    var nm = typeof p.pr.n === 'string' ? p.pr.n.slice(0, 16) : 'FIGHTER';
    var seek = p.pr.st === 'seek', busy = !!p.pr.m;
    var watching = p.pr.st === 'watch';
    var stt = seek ? 'LOOKING' : (busy ? 'IN A MATCH' : (watching ? 'WATCHING' : 'IDLE'));
    var col = seek ? '#5ce08a' : (busy ? '#6f7fb0' : '#8fa3d4');
    ctx.save();
    ctx.globalAlpha = busy ? 0.72 : 1;
    ctx.beginPath(); ctx.arc(cx + 18, cy, 4, 0, 6.3);
    ctx.fillStyle = col; ctx.fill();
    txt(ctx, nm, cx + 32, cy, 15, col, 'left', null, 0, FONT_UI);
    txt(ctx, stt, cx + colW - 34, cy, 13, seek ? '#4aa86a' : '#59689a', 'right', null, 0, FONT_UI);
    ctx.restore();
  }
  if (overflow) {
    var ox = gridL + (shown % COLS) * colW, oy = 252 + ((shown / COLS) | 0) * rowH;
    txt(ctx, '+ ' + (others.length - shown) + ' MORE', ox + 32, oy, 15, '#7d8cba', 'left', null, 0, FONT_UI);
  }

  /* ---- busy states take over the panel ---- */
  if (S.phase === 'seeking') {
    var dots = '.'.repeat(1 + (Math.floor(G.t * 2) % 3));
    txt(ctx, 'SEARCHING' + dots, W / 2, 400, 52, '#ffd83a', 'center', '#241800', 10);
    txt(ctx, 'Anyone who picks Quick Match will be paired with you.', W / 2, 446, 17, '#9fb4e8', 'center', null, 0, FONT_UI);
    if (TOUCH.isActive()) TOUCH.btn(ctx, W / 2 - 105, 520, 210, 58, 'CANCEL', { key: 'seekcancel', size: 20, code: 'Escape' });
    else txt(ctx, 'ESC — CANCEL', W / 2, 640, 16, '#6d80b4', 'center', null, 0, FONT_UI);
    TOUCH.backBtn(ctx);
    if (isHit(['Escape'])) { NET.stopSeek(); SFX.ui(false); }
    checkMatched();
    return;
  }
  if (S.phase === 'waiting') {
    txt(ctx, S.code ? 'ROOM CODE' : 'CONNECTING', W / 2, 356, 22, '#9fb4e8', 'center', null, 0, FONT_UI);
    if (S.code) {
      ctx.save();
      ctx.translate(W / 2, 424);
      rrect(ctx, -180, -46, 360, 92, 14);
      ctx.fillStyle = 'rgba(12,18,44,0.92)'; ctx.fill();
      ctx.strokeStyle = '#ffd83a'; ctx.lineWidth = 3; ctx.stroke();
      txt(ctx, S.code, 0, 2, 66, '#ffd83a', 'center', '#241800', 10);
      ctx.restore();
      if (G.shareable) {
        txt(ctx, G.copied ? 'LINK COPIED — PASTE IT TO YOUR OPPONENT' : 'PRESS  C  TO COPY AN INVITE LINK',
          W / 2, 496, 19, G.copied ? '#5ce08a' : '#9fb4e8', 'center', '#101830', 4, FONT_UI);
        txt(ctx, G.inviteLink || '', W / 2, 522, 15, '#6d80b4', 'center', null, 0, FONT_UI);
        txt(ctx, 'They can also pick JOIN WITH A CODE and type it.', W / 2, 546, 15, '#5d6a91', 'center', null, 0, FONT_UI);
      } else {
        txt(ctx, 'Read this out to your opponent — they pick JOIN WITH A CODE.', W / 2, 500, 17, '#9fb4e8', 'center', null, 0, FONT_UI);
      }
      if (isHit(['KeyC']) && G.shareable) {
        try {
          navigator.clipboard.writeText(G.inviteLink);
          G.copied = true; SFX.confirm();
        } catch (e) { G.copied = false; }
      }
    }
    txt(ctx, S.note || 'WAITING FOR A CHALLENGER…', W / 2, 546, 19, '#5ce08a', 'center', null, 0, FONT_UI);
    if (TOUCH.isActive()) {
      if (G.shareable) {
        TOUCH.btn(ctx, W / 2 - 230, 586, 220, 56, G.copied ? 'LINK COPIED' : 'COPY LINK', {
          key: 'copylink', size: 18,
          tap: function () {
            try { navigator.clipboard.writeText(G.inviteLink); G.copied = true; SFX.confirm(); } catch (e) { G.copied = false; }
          }
        });
      }
      TOUCH.btn(ctx, W / 2 + (G.shareable ? 10 : -105), 586, 220, 56, 'CANCEL', { key: 'waitcancel', size: 18, code: 'Escape' });
    } else {
      txt(ctx, 'ESC — CANCEL', W / 2, 640, 16, '#6d80b4', 'center', null, 0, FONT_UI);
    }
    TOUCH.backBtn(ctx);
    if (isHit(['Escape'])) { NET.leaveMatch(''); SFX.ui(false); }
    checkMatched();
    return;
  }
  if (S.phase === 'spectating') {
    var who = NET.watching();
    txt(ctx, 'RINGSIDE', W / 2, 372, 40, '#ffd83a', 'center', '#241800', 8);
    txt(ctx, who.length >= 2 ? who[0] + '   vs   ' + who[1] : (S.note || 'JOINING THE CROWD…'),
      W / 2, 424, 24, '#9fb4e8', 'center', null, 0, FONT_UI);
    var waited = NET.snapshotAge();
    txt(ctx, waited > 2500 ? 'WAITING FOR THE FEED…' : 'TAKING YOUR SEAT…', W / 2, 468, 18, '#5ce08a', 'center', null, 0, FONT_UI);
    if (TOUCH.isActive()) TOUCH.btn(ctx, W / 2 - 105, 560, 210, 58, 'LEAVE', { key: 'specleave', size: 20, code: 'Escape' }); else txt(ctx, 'ESC — LEAVE', W / 2, 640, 16, '#6d80b4', 'center', null, 0, FONT_UI);
    if (NET.S.started && NET.heroes()) { startOnlineMatch(); return; }
    if (waited > 7000) { NET.leaveMatch('THAT MATCH IS OVER'); }
    if (isHit(['Escape'])) { NET.leaveMatch(''); SFX.ui(false); }
    return;
  }
  if (watchMode) {
    var matches = NET.liveMatches();
    txt(ctx, 'PICK A MATCH TO WATCH', W / 2, 330, 26, '#9fb4e8', 'center', null, 0, FONT_UI);
    if (!matches.length) {
      txt(ctx, 'NO BOUTS RUNNING RIGHT NOW', W / 2, 424, 26, '#5d6a91', 'center', null, 0, FONT_UI);
      TOUCH.backBtn(ctx); txt(ctx, 'ESC — BACK', W / 2, 640, 16, '#6d80b4', 'center', null, 0, FONT_UI);
      if (isHit(['Escape', 'Enter', 'NumpadEnter'])) { watchMode = false; SFX.ui(false); }
      return;
    }
    if (watchIndex >= matches.length) watchIndex = 0;
    for (var mi = 0; mi < Math.min(4, matches.length); mi++) {
      var mm = matches[mi], msel = mi === watchIndex;
      var my = 388 + mi * 62;
      (function (idx) {
        TOUCH.row('watch' + idx, W / 2 - 300, my - 24, 600, 48, function () {
          watchIndex = idx; KeyHit['Enter'] = true;
        });
      })(mi);
      ctx.save();
      ctx.translate(W / 2, my);
      if (msel) ctx.scale(1.04, 1.04);
      rrect(ctx, -300, -24, 600, 48, 10);
      ctx.fillStyle = msel ? 'rgba(255,216,58,0.18)' : 'rgba(12,16,34,0.72)';
      ctx.fill();
      ctx.strokeStyle = msel ? '#ffd83a' : '#28325c';
      ctx.lineWidth = msel ? 3 : 2; ctx.stroke();
      if (mm.heroes.length) drawHeadIcon(ctx, ROSTER[mm.heroes[0]], -264, 0, 17, false);
      if (mm.heroes.length > 1) drawHeadIcon(ctx, ROSTER[mm.heroes[1]], 264, 0, 17, true);
      var label = mm.names.length >= 2 ? mm.names[0] + '   vs   ' + mm.names[1] : mm.names[0] + '   ·   WAITING';
      txt(ctx, label, 0, -5, 20, msel ? '#fff' : '#a9b7e0', 'center', '#0a0f22', 4);
      var sub = mm.heroes.length >= 2 ? ROSTER[mm.heroes[0]].name + ' vs ' + ROSTER[mm.heroes[1]].name : '';
      txt(ctx, sub, 0, 15, 13, msel ? '#ffd83a' : '#64749f', 'center', null, 0, FONT_UI);
      ctx.restore();
    }
    if (TOUCH.isActive()) TOUCH.backBtn(ctx); else txt(ctx, 'W/S — PICK     ENTER — WATCH     ESC — BACK', W / 2, 648, 16, '#6d80b4', 'center', null, 0, FONT_UI);
    if (isHit(['KeyW', 'ArrowUp'])) { watchIndex = (watchIndex + matches.length - 1) % matches.length; SFX.ui(true); }
    if (isHit(['KeyS', 'ArrowDown'])) { watchIndex = (watchIndex + 1) % matches.length; SFX.ui(false); }
    if (isHit(['Escape'])) { watchMode = false; SFX.ui(false); }
    if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) {
      watchMode = false;
      NET.spectate(matches[watchIndex].room);
      SFX.confirm();
    }
    return;
  }
  if (joinMode) {
    // on a phone there is no physical keyboard: borrow the system one
    if (TOUCH.isActive()) {
      showCodeInput();
      TOUCH.zone('codefield', W / 2 - 200, 380, 400, 100, { tap: focusCodeInput });
    }
    txt(ctx, 'ENTER THE ROOM CODE', W / 2, 356, 24, '#9fb4e8', 'center', null, 0, FONT_UI);
    for (var c = 0; c < 4; c++) {
      var bx = W / 2 - 150 + c * 100;
      ctx.save();
      ctx.translate(bx, 430);
      rrect(ctx, -38, -44, 76, 88, 10);
      ctx.fillStyle = 'rgba(12,18,44,0.92)'; ctx.fill();
      ctx.strokeStyle = c === joinBuf.length ? '#ffd83a' : '#33406e';
      ctx.lineWidth = c === joinBuf.length ? 4 : 2; ctx.stroke();
      if (joinBuf[c]) txt(ctx, joinBuf[c], 0, 2, 50, '#f2f7ff', 'center', '#101a3e', 7);
      ctx.restore();
    }
    if (TOUCH.isActive()) {
      txt(ctx, 'Tap the boxes to bring up your keyboard', W / 2, 508, 16, '#6d80b4', 'center', null, 0, FONT_UI);
      TOUCH.btn(ctx, W / 2 - 230, 540, 220, 56, 'JOIN', {
        key: 'codejoin', size: 20,
        fill: joinBuf.length === 4 ? 'rgba(47,125,255,0.85)' : 'rgba(12,18,40,0.6)',
        tap: function () { if (joinBuf.length === 4) KeyHit['Enter'] = true; }
      });
      TOUCH.btn(ctx, W / 2 + 10, 540, 220, 56, 'CANCEL', { key: 'codecancel', size: 20, code: 'Escape' });
    } else {
      txt(ctx, 'TYPE THE 4 LETTERS  ·  ENTER — JOIN  ·  BACKSPACE — FIX  ·  ESC — CANCEL',
        W / 2, 540, 16, '#6d80b4', 'center', null, 0, FONT_UI);
    }
    for (var L = 0; L < LETTERS.length; L++) {
      var ch = LETTERS[L];
      var code = (L < 26) ? ('Key' + ch) : ('Digit' + ch);
      if (isHit([code]) && joinBuf.length < 4) { joinBuf += ch; SFX.ui(true); }
    }
    if (isHit(['Backspace']) && joinBuf.length) { joinBuf = joinBuf.slice(0, -1); SFX.ui(false); }
    if (isHit(['Escape'])) { joinMode = false; joinBuf = ''; hideCodeInput(); SFX.ui(false); }
    if (isHit(['Enter', 'NumpadEnter']) && joinBuf.length === 4) {
      NET.joinCode(joinBuf); joinMode = false; joinBuf = ''; hideCodeInput(); SFX.confirm();
    }
    return;
  }

  /* ---- action list ---- */
  for (var a = 0; a < ONLINE_ACTIONS.length; a++) {
    var m = ONLINE_ACTIONS[a], sel = a === onlineIndex;
    var y = 366 + a * 62;
    (function (idx) {
      TOUCH.row('act' + idx, W / 2 - 290, y - 25, 580, 50, function () {
        onlineIndex = idx; KeyHit['Enter'] = true;
      });
    })(a);
    ctx.save();
    ctx.translate(W / 2, y);
    if (sel) ctx.scale(1.05, 1.05);
    rrect(ctx, -290, -25, 580, 50, 11);
    ctx.fillStyle = sel ? 'rgba(47,125,255,0.30)' : 'rgba(12,16,34,0.72)';
    ctx.fill();
    ctx.strokeStyle = sel ? '#6fb0ff' : '#28325c';
    ctx.lineWidth = sel ? 4 : 2; ctx.stroke();
    txt(ctx, m.label, -262, -6, 23, sel ? '#ffffff' : '#a9b7e0', 'left', '#0a0f22', 5);
    txt(ctx, m.desc, -262, 13, 13, sel ? '#c8d8ff' : '#64749f', 'left', null, 0, FONT_UI);
    if (m.id === 'watch' && stats.matches) {
      txt(ctx, stats.matches + ' LIVE', 246, -2, 17, sel ? '#ffd83a' : '#8a7a3a', 'center', '#241800', 4);
    }
    ctx.restore();
  }
  if (S.note) txt(ctx, S.note, W / 2, 664, 16, '#ff9b4a', 'center', null, 0, FONT_UI);
  else if (NET.kindLabel() === 'LOCAL LINK')
    txt(ctx, 'Two windows of this browser can fight. For a friend elsewhere, open the shared link.',
      W / 2, 664, 15, '#6d80b4', 'center', null, 0, FONT_UI);
  TOUCH.backBtn(ctx);       // top-left, where a thumb looks for it
  txt(ctx, 'W/S — MOVE     ENTER — SELECT     ESC — BACK', W / 2, 690, 15, '#4f5c85', 'center', null, 0, FONT_UI);

  if (isHit(['KeyW', 'ArrowUp'])) { onlineIndex = (onlineIndex + ONLINE_ACTIONS.length - 1) % ONLINE_ACTIONS.length; SFX.ui(true); }
  if (isHit(['KeyS', 'ArrowDown'])) { onlineIndex = (onlineIndex + 1) % ONLINE_ACTIONS.length; SFX.ui(false); }
  if (isHit(['Escape'])) { G.scene = 'menu'; SFX.ui(false); }
  if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) {
    var act = ONLINE_ACTIONS[onlineIndex].id;
    if (!connected && act !== 'back') { SFX.ui(false); return; }
    SFX.confirm();
    if (act === 'quick') NET.seek();
    else if (act === 'create') {
      NET.createRoom();
      // a real web page can hand out a link; inside the Artifact sandbox the
      // address bar is not ours, so we stick to the spoken code
      G.shareable = !!(location.protocol === 'http:' || location.protocol === 'https:') && !window.claude;
      G.copied = false;
      if (G.shareable) {
        G.inviteLink = inviteLinkFor(NET.S.code);
        try { history.replaceState(null, '', '#' + NET.S.code); } catch (e) { }
      }
    }
    else if (act === 'join') { joinMode = true; joinBuf = ''; }
    else if (act === 'watch') { watchMode = true; watchIndex = 0; }
    else G.scene = 'menu';
  }
  checkMatched();
}

/** Both players are in the same room — move to the character select. */
function checkMatched() {
  if (NET.S.phase !== 'matched') return;
  G.scene = 'select';
  G.mode = 'online';
  G.online = false;                      // not fighting yet
  G.sel = [NET.S.myHero || 0, NET.oppHero()];
  G.selLocked = [false, false];
  NET.setReady(false);
  NET.clearRematch();
  SFX.confirm();
}

/* ------------------------------------------------- start / end a net match */
function heroIndexById(id) {
  for (var i = 0; i < ROSTER.length; i++) if (ROSTER[i].id === id) return i;
  return 0;
}

function startOnlineMatch() {
  var i1, i2, spectating = NET.isSpectator();
  if (!spectating && NET.isHost()) { i1 = NET.S.myHero; i2 = NET.oppHero(); }
  else {
    var h = NET.heroes();
    if (!h) return false;
    i1 = heroIndexById(h[0]); i2 = heroIndexById(h[1]);
  }
  G.sel = [i1, i2];
  G.mode = 'online';
  G.online = true;
  G.ctrl1 = (!spectating && NET.isHost()) ? 'p1' : 'net';
  G.ctrl2 = (!spectating && !NET.isHost()) ? 'p1' : 'net';
  G.difficulty = 1;
  G.paused = false;
  G.scene = 'fight';
  G.netEpoch = NET.isHost() ? NET.epoch() : NET.oppEpoch();
  NET.clearRematch();
  makeFighters();
  return true;
}

function quitOnlineMatch(msg) {
  NET.markStarted(false);
  NET.leaveMatch(msg || '');
  G.online = false;
  G.paused = false;
  G.scene = 'online';
  G.annT = 0;
  FX.clear();
  SFX.music('menu');
  SFX.crowd(0.05);
}

/** Per-frame netcode for a live match. Returns true when the caller should
 *  keep running the local simulation (host only). */
function updateOnlineFight(dt) {
  var f1 = G.f1, f2 = G.f2;
  if (!NET.online()) { quitOnlineMatch('OPPONENT LEFT THE RING'); return false; }

  // ringside: read the host's feed, send nothing, touch nothing
  if (NET.isSpectator()) {
    NET.applySnapshot(G);
    if (NET.snapshotAge() > 7000) { quitOnlineMatch('THAT MATCH ENDED'); return false; }
    f1.netVisual(dt, f2);
    f2.netVisual(dt, f1);
    if (G.annT > 0) G.annT = Math.max(0, G.annT - dt);
    return false;
  }

  if (NET.isHost()) {
    readControls(f1, 'p1', G.t);
    var d = NET.delayHostInput(f1.in, dt);       // hold my own input to match their lag
    f1.in.left = d.left; f1.in.right = d.right; f1.in.block = d.block; f1.in.duck = d.duck;
    f1.in.jab = d.jab; f1.in.hook = d.hook; f1.in.body = d.body; f1.in.special = d.special;
    f1.in.dash = d.dash;
    NET.guestInput(f2.in);
    if (NET.inputAge() > 7000) { quitOnlineMatch('OPPONENT TIMED OUT'); return false; }
    return true;
  }

  // guest: send input, render the host's truth
  readControls(f2, 'p1', G.t);
  NET.recordInput(f2.in);
  NET.pushGuest();
  NET.applySnapshot(G);
  if (NET.hasSnapshot() && NET.snapshotAge() > 6000) { quitOnlineMatch('LOST THE HOST'); return false; }
  f1.netVisual(dt, f2);
  f2.netVisual(dt, f1);
  if (G.annT > 0) G.annT = Math.max(0, G.annT - dt);
  return false;
}

function drawMenuBackdrop() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0e22'); g.addColorStop(1, '#05060f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (var i = 0; i < 8; i++) {
    drawRippleMark(ctx, ((G.t * 26 + i * 190) % (W + 300)) - 150, 120 + (i % 3) * 210, 44, '#3f7dff');
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(5,7,18,0.35)';
  ctx.fillRect(0, 0, W, H);
}

/* =========================================================================
   SCENE: HOW TO PLAY
   ========================================================================= */
function drawHowTo() {
  drawMenuBackdrop();
  txt(ctx, 'HOW TO PLAY', W / 2, 78, 48, '#f2f7ff', 'center', '#101a3e', 10);

  var cols = [
    {
      x: 300, title: 'PLAYER 1', rows: [
        ['A / D', 'Move'], ['A A  or  D D', 'Dash (invincible)'], ['S', 'Guard (hold)'],
        ['W', 'Duck / weave (hold)'], ['F', 'Jab — fast, chip'], ['G', 'Hook — heavy, staggers'],
        ['H', 'Body blow — drains stamina'], ['T / SPACE', 'SUPER (needs full meter)']
      ]
    },
    {
      x: 980, title: 'PLAYER 2', rows: [
        ['← / →', 'Move'], ['←← or →→', 'Dash (invincible)'], ['↓', 'Guard (hold)'],
        ['↑', 'Duck / weave (hold)'], ['NUM 1 / J', 'Jab'], ['NUM 2 / K', 'Hook'],
        ['NUM 3 / L', 'Body blow'], ['NUM 0 / U', 'SUPER']
      ]
    }
  ];
  cols.forEach(function (c) {
    txt(ctx, c.title, c.x, 150, 30, '#ffd83a', 'center', '#241800', 6);
    c.rows.forEach(function (r, i) {
      var y = 200 + i * 40;
      txt(ctx, r[0], c.x - 30, y, 20, '#cfe0ff', 'right', '#0a0f22', 5, FONT_UI);
      txt(ctx, r[1], c.x + 10, y, 18, '#8fa3d4', 'left', null, 0, FONT_UI);
    });
  });

  var rules = [
    'GUARD stops head shots cold — but body blows still drain your stamina.',
    'DUCK slips under jabs and hooks. Body blows punish a duck for extra damage.',
    'Hit a busy opponent during their wind-up for a COUNTER (+35% damage).',
    'Land enough punishment and they go DIZZY — free hits, and they hurt more.',
    'Empty stamina = out of gas. Stop swinging and breathe.',
    'Drop to zero health once and you can mash your way back up. Twice and your block flies off.'
  ];
  rules.forEach(function (r, i) {
    txt(ctx, '•  ' + r, 130, 546 + i * 26, 16, '#90a2cf', 'left', null, 0, FONT_UI);
  });
  if (TOUCH.isActive()) {
    TOUCH.anywhere('Escape');           // tapping anywhere leaves this page
    TOUCH.backBtn(ctx);
  } else {
    txt(ctx, 'ESC / ENTER — BACK', W / 2, 700, 16, '#6d80b4', 'center', null, 0, FONT_UI);
  }
  if (isHit(['Escape', 'Enter', 'NumpadEnter', 'Space'])) { G.scene = 'menu'; SFX.ui(false); }
}

/* =========================================================================
   SCENE: SELECT
   ========================================================================= */
var selPoses = null;
function drawSelect() {
  drawMenuBackdrop();
  txt(ctx, 'SELECT YOUR FIGHTER', W / 2, 56, 40, '#f2f7ff', 'center', '#101a3e', 9);

  var two = G.mode === 'vs2p';
  var net = G.mode === 'online';

  if (net) {
    // in an online bout you only pick for yourself; the other card mirrors them
    if (NET.S.phase !== 'matched') { quitOnlineMatch('OPPONENT LEFT'); return; }
    G.sel[1] = NET.oppHero();
    if (!G.selLocked[0]) {
      if (isHit(['KeyA', 'ArrowLeft'])) { G.sel[0] = (G.sel[0] + ROSTER.length - 1) % ROSTER.length; SFX.ui(false); }
      if (isHit(['KeyD', 'ArrowRight'])) { G.sel[0] = (G.sel[0] + 1) % ROSTER.length; SFX.ui(true); }
      if (isHit(['KeyR'])) { G.sel[0] = (Math.random() * ROSTER.length) | 0; SFX.ui(true); }
      if (isHit(['KeyF', 'Enter', 'NumpadEnter', 'Space'])) { G.selLocked[0] = true; NET.setReady(true); SFX.confirm(); }
    } else if (isHit(['Escape'])) { G.selLocked[0] = false; NET.setReady(false); SFX.ui(false); }
    NET.setHero(G.sel[0]);
    G.selLocked[1] = NET.S.oppReady;
    // keep our pick and ready-state flowing while we are on this screen
    if (NET.isHost()) NET.pushHost(G); else NET.pushGuest();

    if (NET.isHost()) {
      if (NET.bothReady()) { NET.markStarted(true); startOnlineMatch(); return; }
    } else {
      if (NET.S.started && NET.heroes() && NET.oppEpoch() !== G.netEpoch) { if (startOnlineMatch()) return; }
    }
    if (isHit(['Escape']) && !G.selLocked[0]) { quitOnlineMatch(''); return; }
  } else {
    // navigation
    if (!G.selLocked[0]) {
      if (isHit(['KeyA'])) { G.sel[0] = (G.sel[0] + ROSTER.length - 1) % ROSTER.length; SFX.ui(false); }
      if (isHit(['KeyD'])) { G.sel[0] = (G.sel[0] + 1) % ROSTER.length; SFX.ui(true); }
      if (isHit(['KeyR'])) { G.sel[0] = (Math.random() * ROSTER.length) | 0; SFX.ui(true); }
      if (isHit(['KeyF', 'Enter', 'NumpadEnter', 'Space'])) { G.selLocked[0] = true; SFX.confirm(); }
    }
    if (two && !G.selLocked[1]) {
      if (isHit(['ArrowLeft'])) { G.sel[1] = (G.sel[1] + ROSTER.length - 1) % ROSTER.length; SFX.ui(false); }
      if (isHit(['ArrowRight'])) { G.sel[1] = (G.sel[1] + 1) % ROSTER.length; SFX.ui(true); }
      if (isHit(['Numpad1', 'Numpad0', 'KeyJ', 'KeyU', 'ShiftRight'])) { G.selLocked[1] = true; SFX.confirm(); }
    }
    if (isHit(['Escape'])) {
      if (G.selLocked[0]) { G.selLocked[0] = false; SFX.ui(false); }
      else { G.scene = 'menu'; SFX.ui(false); }
    }

    // ready?
    if (G.selLocked[0] && (two ? G.selLocked[1] : true)) {
      launchMatch();
      return;
    }
  }

  // cards
  var n = ROSTER.length;
  var cardW = 190, gap = 18;
  var totalW = n * cardW + (n - 1) * gap;
  var startX = (W - totalW) / 2;
  for (var i = 0; i < n; i++) {
    var def = ROSTER[i];
    var x = startX + i * (cardW + gap);
    var p1sel = G.sel[0] === i, p2sel = (two || net) && G.sel[1] === i;
    var hot = p1sel || p2sel;
    if (!G.selLocked[0]) {
      (function (idx) {
        TOUCH.row('card' + idx, x, 120, cardW, 190, function () { G.sel[0] = idx; SFX.ui(true); });
      })(i);
    }
    ctx.save();
    ctx.translate(x + cardW / 2, 200);
    if (hot) ctx.scale(1.06, 1.06);
    rrect(ctx, -cardW / 2, -80, cardW, 190, 14);
    var cg = ctx.createLinearGradient(0, -80, 0, 110);
    cg.addColorStop(0, hot ? shade(def.colors.body, 0.05) : '#141a33');
    cg.addColorStop(1, '#090c1c');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = hot ? def.colors.accent : '#2a3358';
    ctx.lineWidth = hot ? 5 : 2; ctx.stroke();
    ctx.save();
    rrect(ctx, -cardW / 2, -80, cardW, 190, 14); ctx.clip();
    drawHeadIcon(ctx, def, 0, 0, 62, false);
    ctx.restore();
    txt(ctx, def.name, 0, 86, 17, hot ? '#fff' : '#93a2cc', 'center', '#0a0f22', 4);
    if (p1sel) txt(ctx, net ? 'YOU' : 'P1', -cardW / 2 + (net ? 30 : 22), -60, 22, G.selLocked[0] ? '#5ce08a' : '#ffd83a', 'center', '#0a0f22', 5);
    if (p2sel) txt(ctx, net ? 'THEM' : 'P2', cardW / 2 - (net ? 34 : 22), -60, 22, G.selLocked[1] ? '#5ce08a' : '#ff8a4a', 'center', '#0a0f22', 5);
    ctx.restore();
  }

  // big preview + stats for whoever is still choosing
  var focus = !G.selLocked[0] ? 0 : 1;
  var def2 = ROSTER[G.sel[focus]];
  var pose = selPoses[G.sel[focus]];
  var bt = G.t * 2.2;
  pose.bob = Math.sin(bt) * 3;
  pose.fg.x = 40 + Math.sin(bt * 1.3) * 6; pose.fg.y = -196 + Math.cos(bt * 1.1) * 5;
  pose.bg.x = 8 + Math.cos(bt) * 5; pose.bg.y = -208 + Math.sin(bt * 1.4) * 4;
  pose.headTilt = Math.sin(bt * 0.6) * 0.06;
  drawFighter(ctx, def2, pose, { flash: 0, hurt: false, dizzy: false, ko: false, mouth: 0.3, rage: false, t: G.t },
    300, 690, 1, 1.0);

  // stat panel
  ctx.save();
  ctx.translate(590, 360);
  rrect(ctx, 0, 0, 620, 300, 16);
  ctx.fillStyle = 'rgba(9,12,28,0.85)'; ctx.fill();
  ctx.strokeStyle = def2.colors.accent; ctx.lineWidth = 3; ctx.stroke();
  txt(ctx, def2.name, 24, 34, 34, '#fff', 'left', '#0a0f22', 7);
  txt(ctx, def2.title.toUpperCase() + '   ·   ' + def2.hometown, 24, 64, 15, def2.colors.accent, 'left', null, 0, FONT_UI);
  var stats = [
    ['POWER', def2.stats.power / 1.4],
    ['SPEED', def2.stats.speed / 1.4],
    ['HEALTH', def2.stats.hp / 210],
    ['DEFENSE', def2.stats.defense / 1.3],
    ['STAMINA', def2.stats.stamina / 140]
  ];
  stats.forEach(function (s, i) {
    var y = 92 + i * 27;
    txt(ctx, s[0], 24, y + 8, 14, '#8fa3d4', 'left', null, 0, FONT_UI);
    ctx.save();
    ctx.translate(110, y);
    rrect(ctx, 0, 0, 200, 15, 5); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    rrect(ctx, 0, 0, 200 * clamp(s[1], 0.05, 1), 15, 5);
    ctx.fillStyle = def2.colors.accent; ctx.fill();
    ctx.restore();
  });
  txt(ctx, 'PASSIVE — ' + def2.passive.name, 340, 100, 17, '#ffd83a', 'left', '#241800', 4);
  wrapText(ctx, def2.passive.text, 340, 122, 254, 16, '#9fb0da');
  txt(ctx, 'SUPER — ' + def2.special.name, 340, 178, 17, '#ff8a4a', 'left', '#241800', 4);
  wrapText(ctx, def2.special.text, 340, 200, 254, 16, '#9fb0da');
  txt(ctx, '"' + def2.bio + '"', 24, 268, 15, '#71809f', 'left', null, 0, FONT_UI);
  ctx.restore();

  var hint = two
    ? 'P1: A/D + F to lock      P2: ← → + NUM1 to lock      R — random      ESC — back'
    : 'A / D — BROWSE      F / ENTER — LOCK IN      R — RANDOM      ESC — BACK';
  if (net) {
    hint = 'A / D — BROWSE      F / ENTER — LOCK IN      ESC — ' + (G.selLocked[0] ? 'UNLOCK' : 'LEAVE MATCH');
    var them = NET.oppHandle();
    var status = G.selLocked[0]
      ? (NET.S.oppReady ? 'BOTH LOCKED — STARTING…' : 'WAITING FOR ' + them + '…')
      : (NET.S.oppReady ? them + ' IS READY' : them + ' IS CHOOSING…');
    txt(ctx, status, W / 2, 660, 22, NET.S.oppReady ? '#5ce08a' : '#ffd83a', 'center', '#101a3e', 5);
    var pingTxt = NET.ping() ? (NET.ping() + 'ms') : '—';
    txt(ctx, 'ONLINE  ·  YOU ARE ' + NET.S.handle + '  ·  ' + (NET.isHost() ? 'HOST' : 'CHALLENGER') + '  ·  ' + pingTxt,
      W / 2, 30, 15, '#6d80b4', 'center', null, 0, FONT_UI);
  }
  txt(ctx, hint, W / 2, 700, 16, '#6d80b4', 'center', null, 0, FONT_UI);

  TOUCH.backBtn(ctx, G.selLocked[0] ? '‹  UNLOCK' : '‹  BACK');
  // touch: a real button to commit, since there is no F key to press
  if (TOUCH.isActive() && !G.selLocked[0]) {
    // zones are canvas coordinates, never the translated context's
    var lockOn = TOUCH.zone('lockin', 300 - 110, 596 - 26, 220, 52, { code: 'Enter' });
    ctx.save();
    ctx.translate(300, 596);
    rrect(ctx, -110, -26, 220, 52, 12);
    ctx.fillStyle = lockOn ? 'rgba(92,224,138,0.9)' : 'rgba(47,125,255,0.82)';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#cfe8ff'; ctx.stroke();
    txt(ctx, 'LOCK IN', 0, 1, 24, '#ffffff', 'center', '#0a1030', 5);
    ctx.restore();
  }
}

function wrapText(ctx, s, x, y, maxW, size, col) {
  ctx.save();
  ctx.font = size + 'px ' + FONT_UI;
  ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  var words = s.split(' '), line = '', yy = y;
  for (var i = 0; i < words.length; i++) {
    var test = line + words[i] + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy); line = words[i] + ' '; yy += size + 4;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
  ctx.restore();
}

/* ---------------------------------------------------------- match launch */
function launchMatch() {
  if (G.mode === 'vs2p') {
    G.ctrl1 = 'p1'; G.ctrl2 = 'p2';
  } else {
    G.ctrl1 = 'p1'; G.ctrl2 = 'cpu';
  }
  if (G.mode === 'arcade') {
    // ladder: everyone else, boss last
    var pool = [];
    for (var i = 0; i < ROSTER.length; i++) if (i !== G.sel[0]) pool.push(i);
    pool.sort(function () { return Math.random() - 0.5; });
    var bossIdx = pool.indexOf(ROSTER.map(function (r) { return r.id; }).indexOf('ledger'));
    if (bossIdx > -1) { var b = pool.splice(bossIdx, 1)[0]; pool.push(b); }
    G.ladder = pool;
    G.ladderIndex = 0;
    G.sel[1] = G.ladder[0];
    G.baseDifficulty = G.difficulty;
  } else if (G.mode === 'vscpu') {
    if (G.sel[1] === undefined) G.sel[1] = (G.sel[0] + 1) % ROSTER.length;
  }
  G.scene = 'fight';
  G.paused = false;
  makeFighters();
}

/* =========================================================================
   SCENE: RESULT
   ========================================================================= */
function drawResult(dt) {
  G.resultT += dt;
  drawMenuBackdrop();
  TOUCH.anywhere('Enter');
  TOUCH.backBtn(ctx, '‹  LEAVE');   // Escape: quit the run / leave the match
  var champ = G.matchWinner, loser = champ === G.f1 ? G.f2 : G.f1;
  var playerWon = (champ === G.f1 && G.ctrl1 !== 'cpu') || (champ === G.f2 && G.ctrl2 !== 'cpu');

  // winner pose
  var pose = selPoses[ROSTER.map(function (r) { return r.id; }).indexOf(champ.def.id)];
  var bt = G.t * 3;
  pose.bob = Math.sin(bt) * 4;
  pose.fg.x = 16 + Math.sin(bt) * 8; pose.fg.y = -258 + Math.cos(bt * 1.3) * 10;
  pose.bg.x = -12 + Math.cos(bt) * 8; pose.bg.y = -258 + Math.sin(bt * 1.2) * 10;
  pose.crouch = 0; pose.lean = 0; pose.headTilt = Math.sin(bt * 0.8) * 0.08;
  drawFighter(ctx, champ.def, pose, { flash: 0, hurt: false, dizzy: false, ko: false, mouth: 0.6, rage: false, t: G.t },
    W / 2, 652, 1, 1.12);

  if (Math.random() < 0.55) FX.confetti(W);
  FX.update(dt); FX.draw(ctx);

  txt(ctx, champ.def.name, W / 2, 130, 72, '#ffe14a', 'center', '#2a1a00', 14);
  txt(ctx, 'WINS', W / 2, 188, 34, '#fff', 'center', '#2a1a00', 8);
  txt(ctx, '"' + champ.def.quip + '"', W / 2, 232, 24, '#9fb4e8', 'center', '#101830', 6, FONT_UI);

  /* ------------------------------------------------ online: rematch flow */
  if (G.mode === 'online' && NET.isSpectator()) {
    txt(ctx, 'YOU WERE WATCHING', W / 2, 288, 24, '#ffd83a', 'center', '#241800', 6);
    var backIn = Math.max(0, 9 - G.resultT);
    txt(ctx, 'BACK TO THE LOBBY IN ' + Math.ceil(backIn), W / 2, 332, 20, '#9fb4e8', 'center', '#101830', 5);
    txt(ctx, 'ENTER / ESC — LOBBY NOW', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);
    if (backIn <= 0 || isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF', 'Escape'])) quitOnlineMatch('');
    return;
  }
  if (G.mode === 'online') {
    var mine = NET.isHost() ? G.f1 : G.f2;
    var iWon = champ === mine;
    txt(ctx, iWon ? 'YOU TAKE IT' : NET.oppHandle() + ' TAKES IT', W / 2, 288, 30,
      iWon ? '#5ce08a' : '#ff6a4a', 'center', '#101830', 7);

    if (NET.S.phase !== 'matched') {
      txt(ctx, 'OPPONENT LEFT', W / 2, 336, 24, '#ff9b4a', 'center', '#101830', 6);
      txt(ctx, 'ENTER — BACK TO THE LOBBY', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);
      if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF', 'Escape'])) quitOnlineMatch('');
      return;
    }

    var meWants = NET.wantsRematch(), themWants = NET.oppWantsRematch();
    var line = meWants
      ? (themWants ? 'BOTH IN — RESTARTING…' : 'WAITING FOR ' + NET.oppHandle() + '…')
      : (themWants ? NET.oppHandle() + ' WANTS A REMATCH' : 'REMATCH?');
    txt(ctx, line, W / 2, 336, 26, themWants && !meWants ? '#ffd83a' : '#9fb4e8', 'center', '#101830', 6);
    txt(ctx, 'ENTER — REMATCH      ESC — LEAVE', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);

    if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF']) && !meWants) { NET.requestRematch(); SFX.confirm(); }
    if (isHit(['Escape'])) { quitOnlineMatch(''); return; }

    if (NET.isHost()) {
      if (NET.bothRematch()) {
        NET.markStarted(false);           // tells the guest to come back to the select too
        G.scene = 'select'; G.online = false;
        G.selLocked = [false, false]; NET.setReady(false); NET.clearRematch();
        G.sel = [NET.S.myHero, NET.oppHero()];
        SFX.confirm();
      }
      NET.pushHost(G);
    } else {
      if (NET.S.started && NET.heroes() && NET.oppEpoch() !== G.netEpoch) { startOnlineMatch(); return; }
      if (!NET.S.started) {          // host went back to the select screen
        G.scene = 'select'; G.online = false;
        G.selLocked = [false, false]; NET.setReady(false); NET.clearRematch();
        G.sel = [NET.S.myHero, NET.oppHero()];
      }
      NET.pushGuest();
    }
    return;
  }

  if (G.mode === 'arcade' && playerWon) {
    var more = G.ladderIndex < G.ladder.length - 1;
    if (more) {
      var nxt = ROSTER[G.ladder[G.ladderIndex + 1]];
      txt(ctx, 'NEXT CHALLENGER:  ' + nxt.name, W / 2, 292, 28, '#ff8a4a', 'center', '#2a1000', 7);
      txt(ctx, 'ENTER — CONTINUE      ESC — QUIT', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);
      if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) {
        G.ladderIndex++;
        G.sel[1] = G.ladder[G.ladderIndex];
        G.difficulty = G.baseDifficulty * (1 + G.ladderIndex * 0.10);
        G.scene = 'fight';
        SFX.confirm();
        makeFighters();
      }
    } else {
      txt(ctx, 'ARCADE CLEARED  —  CHAMPION OF THE RIPPLE RUMBLE', W / 2, 292, 26, '#5ce08a', 'center', '#002a10', 7);
      txt(ctx, 'ENTER — TITLE SCREEN', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);
      if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) { G.scene = 'title'; SFX.confirm(); }
    }
  } else {
    if (G.mode === 'arcade' && !playerWon) {
      txt(ctx, 'YOUR RUN ENDS AT FIGHT ' + (G.ladderIndex + 1) + ' OF ' + G.ladder.length, W / 2, 292, 24, '#ff6a4a', 'center', '#2a0800', 6);
    }
    txt(ctx, 'ENTER — REMATCH      ESC — MAIN MENU', W / 2, 694, 18, '#8a9cd0', 'center', '#05070f', 4, FONT_UI);
    if (isHit(['Enter', 'NumpadEnter', 'Space', 'KeyF'])) { G.scene = 'fight'; SFX.confirm(); makeFighters(); }
  }
  if (isHit(['Escape'])) { G.scene = 'title'; SFX.ui(false); }
}

/* =========================================================================
   MAIN LOOP
   ========================================================================= */
function makeIdlePose() {
  return {
    fg: { x: 40, y: -196 }, bg: { x: 8, y: -208 },
    crouch: 0, lean: 0, headY: 0, headX: 0, headTilt: 0, bob: 0
  };
}
titlePose = ROSTER.map(makeIdlePose);
selPoses = ROSTER.map(makeIdlePose);

/* -------------------------------------------------------- render quality
   The game always draws in 1280x720 coordinates. On a phone we shrink the
   canvas BACKING STORE and scale the context to match, so every fill and
   stroke covers fewer real pixels while the layout, hit zones and game code
   stay exactly as they are. CSS still stretches it to fill the screen. */
var RENDER = { scale: 1, auto: true, slowWindows: 0 };

function isHandset() {
  try {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var small = Math.min(window.innerWidth, window.innerHeight) <= 520;
    return !!(coarse && small);
  } catch (e) { return false; }
}

function applyRenderScale() {
  var s = Math.max(0.45, Math.min(1, RENDER.scale));
  var bw = Math.round(W * s), bh = Math.round(H * s);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;          // note: this resets context state, which is
    canvas.height = bh;         // fine because every draw sets its own
  }
}

/** Drop a notch if frames are consistently long. One-way, so it can't flap. */
function considerDowngrade(avgFrameMs) {
  if (!RENDER.auto || RENDER.scale <= 0.5) return;
  if (avgFrameMs > 23) {
    RENDER.slowWindows++;
    if (RENDER.slowWindows >= 3) {
      RENDER.scale = Math.max(0.5, RENDER.scale - 0.15);
      RENDER.slowWindows = 0;
      applyRenderScale();
    }
  } else {
    RENDER.slowWindows = 0;
  }
}

function resize() {
  var pad = window.innerWidth < 900 ? 0 : 24;   // phones give up no screen
  var sw = window.innerWidth - pad, sh = window.innerHeight - pad;
  var scale = Math.min(sw / W, sh / H);
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';

  var cfg = window.RR_CONFIG || {};
  if (typeof cfg.renderScale === 'number') {
    RENDER.auto = false;
    RENDER.scale = cfg.renderScale;
  } else if (RENDER.auto) {
    // phones start at two thirds; never raise it back up, since a device
    // that already struggled will struggle again
    var target = isHandset() ? 0.66 : 1;
    RENDER.scale = Math.min(RENDER.scale, target);
  }
  applyRenderScale();
}
/* ------------------------------------------------------------ orientation
   Measured from the viewport rather than a CSS orientation query: Safari
   reports that feature inconsistently, and inside an iframe it describes the
   frame, not the phone. There is always a way past it, so nobody can be
   stuck behind the prompt on a device where turning does not help. */
var rotateDismissed = false;
function updateOrientation() {
  var el = document.getElementById('rotate');
  if (!el) return;
  var w = window.innerWidth, h = window.innerHeight;
  var portraitish = h > w * 1.08;
  var handheld = Math.min(w, h) <= 560;
  // a narrow desktop window is not a phone, and telling someone to rotate
  // their monitor would be silly
  var touchy = (navigator.maxTouchPoints || 0) > 0 ||
    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var show = portraitish && handheld && touchy && !rotateDismissed;
  var root = document.documentElement;
  if (root.classList.contains('rr-rotate') !== show) {
    root.classList.toggle('rr-rotate', show);
  }
  if (!show) resize();
}

function onViewportChange() {
  updateOrientation();
  resize();
  // iOS reports stale dimensions straight after a rotation, so measure again
  setTimeout(function () { updateOrientation(); resize(); }, 150);
  setTimeout(function () { updateOrientation(); resize(); }, 500);
}

/* The events above are the fast path, not the guarantee. Safari drops
   resize/orientationchange often enough that a rotation can leave the prompt
   stuck on screen, so the frame loop also just watches the numbers. */
var seenVW = 0, seenVH = 0;
function pollViewport() {
  var w = window.innerWidth, h = window.innerHeight;
  if (w === seenVW && h === seenVH) return;
  seenVW = w; seenVH = h;
  updateOrientation();
  resize();
}
// The frame loop polls too, but animation frames stop while a tab is in the
// background — a timer keeps running, so a rotation that happens off-screen
// is still picked up the moment anything looks.
setInterval(pollViewport, 400);
document.addEventListener('visibilitychange', pollViewport);

window.addEventListener('resize', onViewportChange);
window.addEventListener('orientationchange', onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
}
(function () {
  var skip = document.getElementById('rotate-skip');
  if (skip) skip.addEventListener('click', function () {
    rotateDismissed = true;
    updateOrientation();
    resize();
  });
})();
resize();
updateOrientation();

var last = performance.now();
var frameAcc = 0, frameCount = 0;
function frame(now) {
  // rolling frame-time sample, so a struggling device can drop a notch
  frameAcc += (now - last); frameCount++;
  if (frameCount >= 90) {
    considerDowngrade(frameAcc / frameCount);
    frameAcc = 0; frameCount = 0;
  }
  var dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.t += dt;

  // global toggles
  if (KeyHit['KeyM']) { G.musicOn = SFX.toggleMusic(); G.announce(G.musicOn ? 'MUSIC ON' : 'MUSIC OFF', 0, '#9fb4e8', 0.8); }
  if (KeyHit['KeyN']) { G.sfxOn = SFX.toggleSfx(); G.announce(G.sfxOn ? 'SFX ON' : 'SFX OFF', 0, '#9fb4e8', 0.8); }

  // shake decay
  G.shakeAmt *= Math.pow(0.0015, dt);
  if (G.shakeAmt < 0.3) G.shakeAmt = 0;
  G.shakeX = (Math.random() - 0.5) * G.shakeAmt * 2;
  G.shakeY = (Math.random() - 0.5) * G.shakeAmt * 1.4;
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.4);
  if (G.annT > 0) G.annT -= dt;

  pollViewport();                // catches rotations Safari never tells us about

  // keep the lobby/room bookkeeping current before any scene reads it
  if (NET.ready()) NET.tick(dt, G);

  // everything below draws in 1280x720 space; this maps it onto whatever
  // backing resolution we chose for this device
  var rs = canvas.width / W;
  ctx.setTransform(rs, 0, 0, rs, 0, 0);
  ctx.clearRect(0, 0, W, H);
  TOUCH.begin();                 // scenes re-register their tap targets as they draw

  switch (G.scene) {
    case 'title': drawTitle(dt); break;
    case 'menu': drawMenu(); break;
    case 'online': drawOnline(dt); break;
    case 'howto': drawHowTo(); break;
    case 'select': drawSelect(); break;
    case 'fight':
      updateFight(dt);
      if (!G.paused) FX.update(dt * (G.hitstop > 0 ? 0 : 1));
      drawFight();
      break;
    case 'result': drawResult(dt); break;
  }

  // screen flash
  if (G.flashAmt > 0) {
    ctx.save();
    ctx.globalAlpha = G.flashAmt * 0.6;
    ctx.fillStyle = G.flashCol;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // scanline-ish arcade sheen
  ctx.save();
  ctx.globalAlpha = 0.05;
  var vg = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 820);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  KeyHit = {};
  requestAnimationFrame(frame);
}

/* ------------------------------------------------- phone keyboard for codes
   A hidden input borrows the system keyboard rather than drawing our own. */
var codeInput = null;
function showCodeInput() {
  if (codeInput) return;
  codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.id = 'rr-code';
  codeInput.setAttribute('maxlength', '4');
  codeInput.setAttribute('autocapitalize', 'characters');
  codeInput.setAttribute('autocomplete', 'off');
  codeInput.setAttribute('autocorrect', 'off');
  codeInput.setAttribute('spellcheck', 'false');
  codeInput.setAttribute('aria-label', 'Room code');
  codeInput.style.cssText =
    'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
    'width:240px;height:52px;font-size:28px;text-align:center;letter-spacing:10px;' +
    'opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(codeInput);
  codeInput.addEventListener('input', function () {
    joinBuf = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    codeInput.value = joinBuf;
  });
  codeInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && joinBuf.length === 4) { KeyHit['Enter'] = true; }
  });
  focusCodeInput();
}
function focusCodeInput() { if (codeInput) { try { codeInput.focus(); } catch (e) { } } }
function hideCodeInput() {
  if (!codeInput) return;
  try { codeInput.blur(); codeInput.remove(); } catch (e) { }
  codeInput = null;
}

/** An invite link (…/#K4T9) drops you straight into your friend's room. */
function inviteCodeFromUrl() {
  try {
    var h = (location.hash || '').replace(/^#/, '').toUpperCase();
    return /^[A-Z0-9]{4}$/.test(h) ? h : '';
  } catch (e) { return ''; }
}
function inviteLinkFor(code) {
  try { return location.origin + location.pathname + '#' + code; } catch (e) { return '#' + code; }
}

function acceptInvite(code) {
  if (!code) return;
  G.pendingCode = code;
  G.scene = 'online';
  G.mode = 'online';
  joinMode = false; watchMode = false;
  if (NET.S.phase === 'matched' || NET.S.phase === 'waiting' || NET.S.phase === 'spectating') {
    NET.leaveMatch('');       // drop whatever we were in and take the invite
  }
}

function bootGame() {
  NET.init();                 // start probing for an opponent channel right away
  TOUCH.attach(canvas);
  resize();

  acceptInvite(inviteCodeFromUrl());   // arrived from someone's invite: skip the menus
  // a link clicked while the game is already open changes the hash without
  // reloading, so pick that up too
  window.addEventListener('hashchange', function () { acceptInvite(inviteCodeFromUrl()); });
  last = performance.now();
  requestAnimationFrame(frame);
}
// published pages boot through the runtime when it is ready, so a republish
// does not drop a viewer mid-match
if (window.claude && window.claude.hot && typeof window.claude.hot.ready === 'function') {
  window.claude.hot.ready(bootGame);
} else {
  bootGame();
}
