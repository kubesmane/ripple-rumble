/* =========================================================================
   RIPPLE RUMBLE — fight engine: fighters, attacks, defence, AI
   ========================================================================= */
var RING = { left: 215, right: 1065, floorY: 596 };
var MIN_GAP = 96;

var GameRef = null;                 // wired up by main.js
function bindGame(g) { GameRef = g; }

/* ------------------------------------------------------------ small math */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function approach(cur, target, rate, dt) { return lerp(cur, target, 1 - Math.pow(1 - rate, dt * 60)); }
function bez(p, p0, c, p1) {
  var m = 1 - p;
  return {
    x: m * m * p0[0] + 2 * m * p * c[0] + p * p * p1[0],
    y: m * m * p0[1] + 2 * m * p * c[1] + p * p * p1[1]
  };
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t) { return t * t; }

/* ------------------------------------------------------------- pose sets */
var GUARD_FG = [40, -196], GUARD_BG = [8, -208];
var POSES = {
  idle: { fg: GUARD_FG, bg: GUARD_BG, crouch: 0, lean: 0, headY: 0, tilt: 0 },
  walkF: { fg: [45, -198], bg: [11, -210], crouch: 0.06, lean: 5, headY: 0, tilt: 0.02 },
  walkB: { fg: [35, -194], bg: [5, -205], crouch: 0.06, lean: -5, headY: 0, tilt: -0.02 },
  block: { fg: [28, -212], bg: [14, -220], crouch: 0.20, lean: -7, headY: 7, tilt: 0.14 },
  duck: { fg: [34, -172], bg: [13, -182], crouch: 1.0, lean: 3, headY: 4, tilt: 0.05 },
  dodge: { fg: [33, -197], bg: [2, -206], crouch: 0.38, lean: -9, headY: 3, tilt: -0.18 },
  hit: { fg: [22, -176], bg: [-8, -190], crouch: 0.10, lean: -15, headY: -7, tilt: -0.34 },
  hitBody: { fg: [26, -186], bg: [0, -196], crouch: 0.48, lean: -7, headY: 9, tilt: 0.28 },
  dizzy: { fg: [28, -142], bg: [-10, -152], crouch: 0.30, lean: -3, headY: 7, tilt: 0 },
  exhaust: { fg: [30, -160], bg: [-2, -170], crouch: 0.38, lean: 7, headY: 8, tilt: 0.12 },
  win: { fg: [16, -258], bg: [-12, -258], crouch: 0, lean: 0, headY: -5, tilt: -0.05 },
  grabbed: { fg: [10, -200], bg: [-14, -206], crouch: 0.1, lean: -10, headY: -4, tilt: -0.2 },
  charge: { fg: [4, -266], bg: [-16, -270], crouch: 0.22, lean: -10, headY: 6, tilt: -0.12 }
};

/* --------------------------------------------------------------- attacks */
function buildAttacks(def) {
  var s = def.stats;
  var tm = 1.24 - 0.24 * s.speed;          // timing multiplier (lower = faster)
  var pw = s.power;
  function A(o) {
    o.startup *= tm; o.active *= tm; o.recovery *= tm;
    o.dmg *= pw;
    o.total = o.startup + o.active + o.recovery;
    return o;
  }
  return {
    jab: A({
      key: 'jab', label: 'JAB', arm: 'front', height: 'head',
      startup: 0.085, active: 0.075, recovery: 0.145,
      dmg: 4.4, stun: 10, reach: 112, push: 55, stam: 5, meter: 5, weight: 0.18,
      p1: [134, -198], ctl: [88, -206]
    }),
    hook: A({
      key: 'hook', label: 'HOOK', arm: 'back', height: 'head',
      startup: 0.205, active: 0.095, recovery: 0.315,
      dmg: 11.5, stun: 27, reach: 104, push: 190, stam: 15, meter: 9, weight: 0.85,
      p1: [122, -192], ctl: [52, -262]
    }),
    body: A({
      key: 'body', label: 'BODY', arm: 'front', height: 'body',
      startup: 0.135, active: 0.085, recovery: 0.255,
      dmg: 7.2, stun: 15, reach: 100, push: 105, stam: 10, meter: 7, weight: 0.5,
      stamDmg: 30, p1: [124, -152], ctl: [66, -182]
    })
  };
}

/* ========================================================================= */
function Fighter(def, side, isCPU) {
  this.def = def;
  this.side = side;                 // -1 left corner, +1 right corner
  this.isCPU = !!isCPU;
  this.attacks = buildAttacks(def);
  this.pose = {
    fg: { x: GUARD_FG[0], y: GUARD_FG[1] },
    bg: { x: GUARD_BG[0], y: GUARD_BG[1] },
    crouch: 0, lean: 0, headY: 0, headX: 0, headTilt: 0, bob: 0
  };
  this.st = { flash: 0, hurt: 0, dizzy: false, ko: false, mouth: 0, rage: false, t: 0 };
  this.in = {};
  this.resetMatch();
}

Fighter.prototype.resetMatch = function () {
  this.wins = 0;
  this.resetRound();
};

Fighter.prototype.resetRound = function () {
  var s = this.def.stats;
  this.hp = this.maxHp = s.hp;
  this.stam = this.maxStam = s.stamina;
  this.meter = 0;
  this.stun = 0;
  this.x = this.side < 0 ? RING.left + 175 : RING.right - 175;
  this.vx = 0;
  this.facing = -this.side;
  this.state = 'idle';
  this.t = 0; this.dur = 0;
  this.atk = null; this.atkHit = false; this.multiHitT = 0; this.multiHits = 0;
  this.iframes = 0; this.blockTime = 0; this.armor = 0;
  this.hitFlash = 0; this.noHitTime = 0; this.stunDecay = 0;
  this.combo = 0; this.comboT = 0;
  this.downs = 0; this.buff = 0; this.grabbing = null;
  this.bobT = Math.random() * 6;
  this.headPop = null;
  this.lastDamageFrom = 0;
  this.downT = 0; this.getUp = 0; this.downFinal = false;
  // wipe knockout dressing so round two starts with a head on
  this.st.headless = false; this.st.ko = false; this.st.rage = false;
  this.st.flash = 0; this.st.hurt = false; this.st.dizzy = false; this.st.mouth = 0;
  this.pose.fg.x = GUARD_FG[0]; this.pose.fg.y = GUARD_FG[1];
  this.pose.bg.x = GUARD_BG[0]; this.pose.bg.y = GUARD_BG[1];
  this.pose.crouch = 0; this.pose.lean = 0;
  this.pose.headY = 0; this.pose.headX = 0; this.pose.headTilt = 0;
};

Fighter.prototype.canAct = function () {
  return this.state === 'idle' || this.state === 'walk' || this.state === 'block' || this.state === 'duck';
};
Fighter.prototype.isBusy = function () {
  return !this.canAct();
};
Fighter.prototype.setState = function (s, dur) {
  this.state = s; this.t = 0; this.dur = dur || 0;
};

Fighter.prototype.damageScale = function () {
  var m = 1;
  if (this.def.id === 'riptide') m *= 1 + 0.40 * (1 - this.hp / this.maxHp);     // RAGE
  if (this.buff > 0) m *= 1.25;
  return m;
};
Fighter.prototype.speedScale = function () {
  var m = this.def.stats.speed;
  if (this.buff > 0) m *= 1.35;
  if (this.stam <= 0) m *= 0.65;
  return m;
};

/* ------------------------------------------------------------------ input */
Fighter.prototype.tryAttack = function (key) {
  var a = this.attacks[key];
  if (!a) return false;
  if (!this.canAct()) return false;
  if (this.stam < a.stam) { if (key !== 'jab') return false; }
  this.atk = a; this.atkHit = false;
  this.stam = Math.max(0, this.stam - a.stam);
  this.setState('attack', a.total * (this.buff > 0 ? 0.78 : 1));
  SFX.whiff();
  return true;
};

Fighter.prototype.trySpecial = function () {
  if (this.meter < 100 || !this.canAct()) return false;
  this.meter = 0;
  this.atk = null; this.atkHit = false; this.multiHits = 0; this.multiHitT = 0;
  var dur = { bruiser: 1.20, hare: 1.55, lobo: 1.45, riptide: 0.70, ledger: 0.95 }[this.def.id] || 1.1;
  this.setState('special', dur);
  SFX.charge();
  if (window.NET) NET.event(4, this.x, RING.floorY - 200, 1);
  GameRef.announce(this.def.special.name + '!', this.side, this.def.colors.accent);
  GameRef.flash(0.55, this.def.colors.accent);
  GameRef.shake(10);
  return true;
};

Fighter.prototype.tryDash = function (dir) {
  if (!this.canAct() || this.stam < 12) return false;
  this.stam -= 12;
  this.dashDir = dir;
  this.setState('dodge', this.def.id === 'hare' ? 0.30 : 0.26);
  this.iframes = this.def.id === 'hare' ? 0.26 : 0.17;
  SFX.dash();
  GameRef.fx.dust(this.x, RING.floorY, -dir);
  return true;
};

/* ----------------------------------------------------------------- update */
Fighter.prototype.update = function (dt, opp) {
  var i = this.in;
  this.st.t += dt;
  this.bobT += dt;
  this.iframes = Math.max(0, this.iframes - dt);
  this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
  this.st.flash = this.hitFlash;
  this.armor = Math.max(0, this.armor - dt);
  this.comboT = Math.max(0, this.comboT - dt);
  if (this.comboT <= 0) this.combo = 0;
  this.noHitTime += dt;
  this.buff = Math.max(0, this.buff - dt);
  this.st.rage = this.buff > 0;
  this.st.hurt = this.hp / this.maxHp < 0.34;
  this.st.dizzy = this.state === 'dizzy';

  // stun decay
  if (this.noHitTime > 0.75) this.stun = Math.max(0, this.stun - 20 * dt);

  // stamina
  var regen = this.state === 'attack' || this.state === 'special' ? 0
    : this.state === 'block' ? 9 : (this.state === 'idle' ? 20 : 14);
  this.stam = clamp(this.stam + regen * dt, 0, this.maxStam);

  // meter drift from aggression is granted on hits; passive trickle keeps pace
  this.meter = clamp(this.meter + 1.6 * dt * this.def.stats.meterRate, 0, 100);

  // LEDGER passive: auto-settle repair
  if (this.def.id === 'ledger' && this.noHitTime > 3 && this.hp > 0) {
    this.hp = Math.min(this.maxHp, this.hp + 2 * dt);
  }

  this.t += dt;

  switch (this.state) {
    case 'idle': case 'walk': case 'block': case 'duck': this.updateFree(dt, opp); break;
    case 'attack': this.updateAttack(dt, opp); break;
    case 'special': this.updateSpecial(dt, opp); break;
    case 'dodge':
      this.vx = this.dashDir * 540 * (0.85 + this.def.stats.speed * 0.2);
      if (this.t >= this.dur) this.setState('idle');
      break;
    case 'hitstun': case 'hitstunBody':
      this.vx *= Math.pow(0.02, dt);
      if (this.t >= this.dur) this.setState('idle');
      break;
    case 'dizzy':
      this.vx *= Math.pow(0.05, dt);
      if (this.t >= this.dur) { this.setState('idle'); this.stun = 0; }
      break;
    case 'exhaust':
      this.vx *= Math.pow(0.05, dt);
      if (this.t >= this.dur) { this.setState('idle'); this.stam = this.maxStam * 0.3; }
      break;
    case 'grabbed':
      this.vx = 0;
      if (this.t >= this.dur) this.setState('hitstun', 0.25);
      break;
    case 'down': this.updateDown(dt); break;
    case 'ko': this.vx *= Math.pow(0.1, dt); break;
    case 'win': this.vx = 0; break;
  }

  // integrate
  this.x += this.vx * dt;
  this.x = clamp(this.x, RING.left, RING.right);

  this.updatePose(dt, opp);
};

Fighter.prototype.updateFree = function (dt, opp) {
  var i = this.in;
  if (this.stam <= 0 && this.state !== 'exhaust') {
    this.setState('exhaust', 1.1);
    GameRef.announce('OUT OF GAS!', this.side, '#ffb347');
    return;
  }
  // specials / attacks
  if (i.special && this.trySpecial()) return;
  if (i.dash) { if (this.tryDash(i.dash)) return; }
  if (i.jab && this.tryAttack('jab')) return;
  if (i.hook && this.tryAttack('hook')) return;
  if (i.body && this.tryAttack('body')) return;

  if (i.duck) {
    if (this.state !== 'duck') this.setState('duck');
    this.vx = 0;
    return;
  }
  if (i.block) {
    if (this.state !== 'block') { this.setState('block'); this.blockTime = 0; }
    this.blockTime += dt;
    this.vx = 0;
    return;
  }

  var spd = 196 * this.speedScale();
  var dir = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  if (dir !== 0) {
    var back = (dir === -this.facing);
    this.vx = dir * spd * (back ? 0.82 : 1);
    if (this.state !== 'walk') this.setState('walk');
    this.walkPhase = (this.walkPhase || 0) + dt * 7;
    if (Math.sin(this.walkPhase) > 0.98) SFX.step();
  } else {
    this.vx = 0;
    if (this.state !== 'idle') this.setState('idle');
  }
};

Fighter.prototype.updateAttack = function (dt, opp) {
  var a = this.atk;
  if (!a) { this.setState('idle'); return; }
  var scale = this.buff > 0 ? 0.78 : 1;
  var su = a.startup * scale, ac = a.active * scale;
  this.vx *= Math.pow(0.02, dt);
  // step-in on heavy punches
  if (this.t < su && a.key !== 'jab') this.vx = this.facing * 55;
  // bear armour on hook startup
  if (this.def.id === 'bruiser' && a.key === 'hook' && this.t < su) this.armor = 0.05;

  if (this.t >= su && this.t < su + ac && !this.atkHit) {
    if (GameRef.tryHit(this, opp, a)) this.atkHit = true;
  }
  if (this.t >= this.dur) { this.atk = null; this.setState('idle'); }
};

/* -------------------------------------------------------------- specials */
Fighter.prototype.updateSpecial = function (dt, opp) {
  var id = this.def.id, p = this.t / this.dur;
  this.vx *= Math.pow(0.1, dt);

  if (id === 'bruiser') {
    if (this.t > 0.42 && this.t < 0.60) this.vx = this.facing * 230;
    if (this.t >= 0.52 && this.t < 0.66 && !this.atkHit) {
      var a = {
        key: 'crown', label: 'CROWN CRUSHER', height: 'head', arm: 'back',
        dmg: 30 * this.def.stats.power, stun: 55, reach: 128, push: 300,
        meter: 0, weight: 1, guardBreak: true, superMove: true
      };
      if (GameRef.tryHit(this, opp, a)) this.atkHit = true;
    }
    if (this.t > 0.60 && this.t < 0.63) { GameRef.shake(26); GameRef.fx.shock(this.x + this.facing * 70, RING.floorY, this.def.colors.accent); }
  }
  else if (id === 'hare') {
    if (this.t < 0.22) {
      var d = opp.x - this.x;
      if (Math.abs(d) > 120) this.vx = Math.sign(d) * 720;
    } else if (this.t < 1.05) {
      this.multiHitT -= dt;
      if (this.multiHitT <= 0 && this.multiHits < 8) {
        this.multiHitT = 0.085;
        this.multiHits++;
        GameRef.tryHit(this, opp, {
          key: 'flurry', label: 'FLURRY', height: this.multiHits % 3 === 0 ? 'body' : 'head',
          arm: this.multiHits % 2 ? 'front' : 'back',
          dmg: 3.1 * this.def.stats.power, stun: 7, reach: 126, push: 14,
          meter: 0, weight: 0.22, superMove: true, noBlockPush: true
        });
      }
    } else if (this.t >= 1.08 && this.t < 1.22 && !this.atkHit) {
      if (GameRef.tryHit(this, opp, {
        key: 'harefin', label: 'HARE TRIGGER', height: 'head', arm: 'back',
        dmg: 10 * this.def.stats.power, stun: 40, reach: 124, push: 320,
        meter: 0, weight: 0.95, superMove: true
      })) { this.atkHit = true; GameRef.shake(20); }
    }
  }
  else if (id === 'lobo') {
    if (this.t < 0.42 && !this.grabbing) {
      var dd = opp.x - this.x;
      this.vx = Math.sign(dd) * 640;
      if (Math.abs(dd) < 108) {
        if (opp.iframes > 0 || opp.state === 'dodge') {
          GameRef.announce('WHIFF!', opp.side, '#9fe8ff');
        } else {
          this.grabbing = opp;
          opp.setState('grabbed', 0.62);
          opp.vx = 0;
          SFX.hit(0.4);
        }
      }
    }
    if (this.grabbing) {
      this.vx = 0;
      var o = this.grabbing;
      o.x = this.x + this.facing * 64;
      if (this.t >= 0.72 && !this.atkHit) {
        this.atkHit = true;
        GameRef.applyDamage(this, o, {
          key: 'slam', label: 'LUCHA SLAM', height: 'body', dmg: 26 * this.def.stats.power,
          stun: 60, push: 250, weight: 1, superMove: true, unblockable: true
        }, 'slam');
        GameRef.shake(30);
        GameRef.fx.shock(o.x, RING.floorY, this.def.colors.accent);
        SFX.superHit();
        this.grabbing = null;
      }
    }
  }
  else if (id === 'riptide') {
    if (this.t > 0.3 && this.buff <= 0) {
      this.buff = 6.0;
      GameRef.announce('FERAL FRENZY!', this.side, '#ff6a3d');
      SFX.cheer(0.9);
    }
    GameRef.fx.rage(this.x, RING.floorY - 150, this.def.colors.accent);
  }
  else if (id === 'ledger') {
    if (this.t >= 0.38 && !this.atkHit) {
      this.atkHit = true;
      GameRef.spawnProjectile(this);
      SFX.projectile();
    }
  }

  if (this.t >= this.dur) {
    this.grabbing = null;
    this.atk = null;
    this.setState('idle');
  }
};

/* -------------------------------------------------------- online: guest
   The guest never simulates combat — the host's snapshot is the truth. This
   advances only what is cosmetic, so animation stays smooth at 60fps between
   snapshots that arrive ~30 times a second. */
Fighter.prototype.netVisual = function (dt, opp) {
  this.st.t += dt;
  this.bobT += dt;
  this.t += dt;                                   // let attack timelines keep playing
  this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
  this.st.flash = this.hitFlash;
  this.comboT = Math.max(0, this.comboT - dt);
  this.st.rage = this.buff > 0;
  this.st.hurt = this.hp / this.maxHp < 0.34;
  this.st.dizzy = this.state === 'dizzy';
  if (this.state === 'down' || this.state === 'ko') this.downT = (this.downT || 0) + dt;
  else this.downT = 0;
  if (this.netX !== undefined) this.x = approach(this.x, this.netX, 0.4, dt);
  this.updatePose(dt, opp);
};

/* ------------------------------------------------------------ knockdowns */
Fighter.prototype.goDown = function (final) {
  this.setState('down', final ? 9999 : 0);
  this.downFinal = !!final;
  this.downT = 0;
  this.getUp = 0;
  this.vx = -this.facing * 190;
  this.st.ko = true;
  this.combo = 0;
};
Fighter.prototype.updateDown = function (dt) {
  this.vx *= Math.pow(0.04, dt);
  this.downT += dt;
};

/* ------------------------------------------------------------------ pose */
Fighter.prototype.updatePose = function (dt, opp) {
  var P = this.pose, tgt = null, rate = 0.32;
  var breathe = Math.sin(this.bobT * 2.6) * 2.2;
  P.bob = approach(P.bob, breathe, 0.2, dt);
  this.st.mouth = clamp((this.state === 'attack' ? 0.6 : 0) + (this.buff > 0 ? 0.5 : 0), 0, 1);

  if (this.state === 'attack' || (this.state === 'special' && this.def.id !== 'riptide')) {
    this.posePunch(dt);
    return;
  }
  switch (this.state) {
    case 'idle': tgt = POSES.idle; break;
    case 'walk': tgt = (Math.sign(this.vx) === this.facing) ? POSES.walkF : POSES.walkB; break;
    case 'block': tgt = POSES.block; rate = 0.5; break;
    case 'duck': tgt = POSES.duck; rate = 0.5; break;
    case 'dodge': tgt = POSES.dodge; rate = 0.5; break;
    case 'hitstun': tgt = POSES.hit; rate = 0.6; break;
    case 'hitstunBody': tgt = POSES.hitBody; rate = 0.6; break;
    case 'dizzy': tgt = POSES.dizzy; rate = 0.2; break;
    case 'exhaust': tgt = POSES.exhaust; rate = 0.2; break;
    case 'grabbed': tgt = POSES.grabbed; rate = 0.5; break;
    case 'win': tgt = POSES.win; rate = 0.16; break;
    case 'special': tgt = POSES.charge; rate = 0.35; break;
    case 'down': this.poseDown(dt); return;
    case 'ko': this.poseDown(dt); return;
    default: tgt = POSES.idle;
  }
  P.fg.x = approach(P.fg.x, tgt.fg[0], rate, dt);
  P.fg.y = approach(P.fg.y, tgt.fg[1], rate, dt);
  P.bg.x = approach(P.bg.x, tgt.bg[0], rate, dt);
  P.bg.y = approach(P.bg.y, tgt.bg[1], rate, dt);
  P.crouch = approach(P.crouch, tgt.crouch, rate, dt);
  P.lean = approach(P.lean, tgt.lean, rate, dt);
  P.headY = approach(P.headY, tgt.headY, rate, dt);
  P.headX = approach(P.headX, 0, rate, dt);
  var tilt = tgt.tilt;
  if (this.state === 'dizzy') { tilt = Math.sin(this.t * 7) * 0.26; P.headX = Math.sin(this.t * 7) * 9; }
  if (this.state === 'win') tilt = Math.sin(this.t * 4) * 0.12;
  P.headTilt = approach(P.headTilt, tilt, rate, dt);
};

Fighter.prototype.posePunch = function (dt) {
  var P = this.pose;
  var a = this.atk;
  var scale = this.buff > 0 ? 0.78 : 1;
  var p, arm = 'front', p1, ctl, lean = 8, crouch = 0.05;

  if (this.state === 'special') {
    var id = this.def.id, tt = this.t;
    if (id === 'bruiser') {
      arm = 'back';
      if (tt < 0.42) { p = easeOut(tt / 0.42) * 0.35; p1 = [10, -330]; ctl = [-30, -270]; lean = -12; }
      else { p = clamp((tt - 0.42) / 0.20, 0, 1); p1 = [118, -120]; ctl = [90, -330]; lean = 18; crouch = 0.35; }
      var src = tt < 0.42 ? [GUARD_BG[0], GUARD_BG[1]] : [10, -330];
      var pt = bez(tt < 0.42 ? easeOut(tt / 0.42) : easeIn(clamp((tt - 0.42) / 0.20, 0, 1)), src, ctl, p1);
      P.bg.x = pt.x; P.bg.y = pt.y;
      P.fg.x = approach(P.fg.x, 30, 0.3, dt); P.fg.y = approach(P.fg.y, -230, 0.3, dt);
    } else if (id === 'hare') {
      var f = (this.multiHits % 2) === 1;
      var ph = (this.multiHitT / 0.085);
      var ext = this.t < 0.22 ? 0.2 : (this.t > 1.05 ? 1 : 1 - Math.abs(ph - 0.5) * 1.4);
      var e = clamp(ext, 0, 1);
      P.fg.x = lerp(GUARD_FG[0], 130, f ? e : e * 0.3);
      P.fg.y = lerp(GUARD_FG[1], -196, 1);
      P.bg.x = lerp(GUARD_BG[0], 126, f ? e * 0.3 : e);
      P.bg.y = lerp(GUARD_BG[1], -200, 1);
      lean = 14;
    } else if (id === 'lobo') {
      var gp = clamp(this.t / 0.4, 0, 1);
      if (this.grabbing) {
        P.fg.x = 78; P.fg.y = -210 + Math.sin(this.t * 14) * 8;
        P.bg.x = 62; P.bg.y = -196;
        lean = 16; crouch = 0.25;
      } else {
        P.fg.x = lerp(GUARD_FG[0], 120, gp); P.fg.y = lerp(GUARD_FG[1], -214, gp);
        P.bg.x = lerp(GUARD_BG[0], 104, gp); P.bg.y = lerp(GUARD_BG[1], -222, gp);
        lean = 18;
      }
    } else if (id === 'ledger') {
      var lp = clamp(this.t / 0.4, 0, 1);
      P.fg.x = lerp(GUARD_FG[0], 108, lp); P.fg.y = lerp(GUARD_FG[1], -186, lp);
      P.bg.x = lerp(GUARD_BG[0], 92, lp); P.bg.y = lerp(GUARD_BG[1], -190, lp);
      lean = 6;
    }
    P.crouch = approach(P.crouch, crouch, 0.3, dt);
    P.lean = approach(P.lean, lean, 0.3, dt);
    P.headY = approach(P.headY, 0, 0.3, dt);
    P.headX = approach(P.headX, 0, 0.3, dt);
    P.headTilt = approach(P.headTilt, -0.06, 0.3, dt);
    return;
  }

  // normal attack timeline
  var su = a.startup * scale, ac = a.active * scale, rc = a.recovery * scale;
  var tt2 = this.t, prog;
  if (tt2 < su) prog = -0.18 * Math.sin((tt2 / su) * Math.PI * 0.5);            // wind up
  else if (tt2 < su + ac) prog = easeOut(clamp((tt2 - su) / (ac * 0.45), 0, 1)); // strike
  else prog = 1 - easeIn(clamp((tt2 - su - ac) / rc, 0, 1));                     // recover

  var start = a.arm === 'front' ? GUARD_FG : GUARD_BG;
  var windup = a.arm === 'front' ? [start[0] - 14, start[1] - 4] : [start[0] - 22, start[1] - 10];
  var pt2;
  if (prog < 0) pt2 = { x: lerp(start[0], windup[0], -prog / 0.18), y: lerp(start[1], windup[1], -prog / 0.18) };
  else pt2 = bez(prog, start, a.ctl, a.p1);

  if (a.arm === 'front') {
    P.fg.x = pt2.x; P.fg.y = pt2.y;
    P.bg.x = approach(P.bg.x, GUARD_BG[0] + 6, 0.3, dt);
    P.bg.y = approach(P.bg.y, GUARD_BG[1] - 2, 0.3, dt);
  } else {
    P.bg.x = pt2.x; P.bg.y = pt2.y;
    P.fg.x = approach(P.fg.x, GUARD_FG[0] - 6, 0.3, dt);
    P.fg.y = approach(P.fg.y, GUARD_FG[1] - 6, 0.3, dt);
  }
  var amt = clamp(prog, 0, 1);
  P.lean = approach(P.lean, lerp(-4, a.key === 'body' ? 20 : 13, amt), 0.45, dt);
  P.crouch = approach(P.crouch, a.key === 'body' ? 0.30 * amt : 0.06 * amt, 0.4, dt);
  P.headX = approach(P.headX, amt * (a.key === 'body' ? 4 : 8), 0.4, dt);
  P.headY = approach(P.headY, a.key === 'body' ? amt * 6 : 0, 0.4, dt);
  P.headTilt = approach(P.headTilt, amt * (a.key === 'hook' ? 0.16 : 0.07), 0.4, dt);
};

Fighter.prototype.poseDown = function (dt) {
  var P = this.pose;
  P.fg.x = approach(P.fg.x, 40, 0.14, dt);
  P.fg.y = approach(P.fg.y, -60, 0.14, dt);
  P.bg.x = approach(P.bg.x, -20, 0.14, dt);
  P.bg.y = approach(P.bg.y, -60, 0.14, dt);
  P.crouch = approach(P.crouch, 1, 0.12, dt);
  P.lean = approach(P.lean, -12, 0.12, dt);
  P.headTilt = approach(P.headTilt, -0.5, 0.1, dt);
};

/* =========================================================================
   AI — reads the fight and drives the same input struct a human would
   ========================================================================= */
function AI(fighter, profile, level) {
  this.f = fighter;
  this.p = profile;
  this.level = level || 1;         // 0.6 easy … 1.4 brutal
  this.decideT = 0;
  this.plan = 'approach';
  this.planT = 0;
  this.reactT = 0;
  this.lastOppState = '';
}

AI.prototype.think = function (dt, opp) {
  var f = this.f, i = f.in, p = this.p, L = this.level;
  i.left = i.right = i.block = i.duck = false;
  i.jab = i.hook = i.body = i.special = false; i.dash = 0;

  if (f.state === 'down' || f.state === 'ko' || f.state === 'win') {
    // mash to rise
    if (f.state === 'down' && !f.downFinal) f.getUp = Math.min(1, f.getUp + dt * (0.34 + 0.22 * L));
    return;
  }
  if (f.isBusy() && f.state !== 'block' && f.state !== 'duck') return;

  var dist = Math.abs(opp.x - f.x);
  var dir = Math.sign(opp.x - f.x) || 1;
  var idealRange = 104 * p.spacing;
  this.decideT -= dt;
  this.reactT -= dt;

  /* ---- reactive defence: respond to the opponent's startup frames ---- */
  var threat = (opp.state === 'attack' && opp.atk && opp.t < opp.atk.startup * 1.15) ||
    (opp.state === 'special' && opp.t < 0.4);
  var inRange = dist < 132;

  if (threat && inRange && this.reactT <= 0) {
    this.reactT = 0.18 / L;
    var r = Math.random();
    var superThreat = opp.state === 'special';
    if (superThreat && r < p.dodge * L * 1.3) { i.dash = -dir; return; }
    if (r < p.block * L * 0.85) {
      if (opp.atk && opp.atk.height === 'body') { i.block = true; }
      else if (r < p.dodge * L * 0.6) { i.duck = true; }
      else i.block = true;
      return;
    }
    if (r < (p.block + p.dodge) * L * 0.8) { i.dash = -dir; return; }
  }

  /* ---- punish windows ---- */
  var oppRecovering = (opp.state === 'attack' && opp.atk && opp.t > opp.atk.startup + opp.atk.active) ||
    opp.state === 'dizzy' || opp.state === 'exhaust' || opp.state === 'hitstun' || opp.state === 'grabbed';

  if (f.meter >= 100 && Math.random() < p.special * L &&
    (dist < 150 || f.def.id === 'ledger' || f.def.id === 'lobo') &&
    (oppRecovering || Math.random() < 0.35)) {
    i.special = true; return;
  }

  if (this.decideT <= 0) {
    this.decideT = (0.16 + Math.random() * 0.24) / L;
    if (oppRecovering && dist < 130) this.plan = 'punish';
    else if (dist > idealRange + 40) this.plan = 'approach';
    else if (dist < idealRange - 42) this.plan = Math.random() < 0.35 ? 'retreat' : 'attack';
    else this.plan = Math.random() < p.aggression * L ? 'attack' : (Math.random() < 0.4 ? 'circle' : 'guard');
    this.planT = 0.25 + Math.random() * 0.4;
  }
  this.planT -= dt;

  switch (this.plan) {
    case 'approach':
      if (dir > 0) i.right = true; else i.left = true;
      if (dist > 300 && Math.random() < 0.02 * L) i.dash = dir;
      break;
    case 'retreat':
      if (dir > 0) i.left = true; else i.right = true;
      break;
    case 'circle':
      if (Math.random() < 0.5) { if (dir > 0) i.left = true; else i.right = true; }
      else { if (dir > 0) i.right = true; else i.left = true; }
      break;
    case 'guard':
      i.block = true;
      break;
    case 'punish':
      if (dist > 118) { if (dir > 0) i.right = true; else i.left = true; }
      else {
        if (opp.state === 'dizzy' || opp.state === 'down') i.hook = true;
        else if (Math.random() < 0.5) i.hook = true; else i.body = true;
      }
      break;
    case 'attack':
      if (dist > 122) { if (dir > 0) i.right = true; else i.left = true; break; }
      var roll = Math.random();
      if (opp.state === 'block') {
        // beat the guard with body shots
        if (roll < 0.55) i.body = true;
        else if (roll < 0.7) i.hook = true;
        else { if (dir > 0) i.left = true; else i.right = true; }
      } else if (opp.state === 'duck') {
        if (roll < 0.6) i.body = true; else i.jab = true;
      } else {
        if (roll < 0.42) i.jab = true;
        else if (roll < 0.66) i.body = true;
        else if (roll < 0.86) i.hook = true;
        else i.block = true;
      }
      break;
  }
  // stamina discipline
  if (f.stam < 25 && (i.hook || i.body)) { i.hook = i.body = false; i.block = Math.random() < 0.6; }
};
