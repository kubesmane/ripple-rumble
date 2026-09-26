/* =========================================================================
   RIPPLE RUMBLE — touch

   Phones get the same game, driven the same way. Rather than teach the
   engine about touch, every control here writes into the SAME KeyDown /
   KeyHit maps the keyboard fills, using Player 1's key codes. Holds become
   held keys, taps become key presses, and a double tap on a direction is a
   dash because the existing double-tap detector sees two presses.

   Menus register tap zones as they draw, so a tap lands on whatever the
   player can actually see, at canvas coordinates — no separate layout.
   ========================================================================= */
var TOUCH = (function () {

  var active = false;            // a touch has been used: show the controls
  var zones = [];                // rebuilt every frame by whatever is drawing
  var held = {};                 // pointerId -> zone key currently held
  var pressed = {};              // zone key -> true while any pointer holds it
  var canvas = null;

  /* ------------------------------------------------------- coordinates */
  function toCanvas(ev) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return { x: -1, y: -1 };
    return {
      x: (ev.clientX - r.left) * (1280 / r.width),
      y: (ev.clientY - r.top) * (720 / r.height)
    };
  }

  function hit(p) {
    // last registered wins, so controls drawn on top of panels take the tap
    for (var i = zones.length - 1; i >= 0; i--) {
      var z = zones[i];
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) return z;
    }
    return null;
  }

  /* ----------------------------------------------------------- pointers */
  function down(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') active = true;
    var p = toCanvas(ev);
    var z = hit(p);
    if (!z) return;
    ev.preventDefault();
    held[ev.pointerId] = z.key;
    pressed[z.key] = true;
    if (z.code) {
      // Every touch is a fresh key press, hold or not — the double-tap
      // detector behind dashing counts presses, so the movement pads must
      // register them too.
      KeyHit[z.code] = true;
      KeyDown[z.code] = true;
      if (!z.hold) setTimeout(function () { KeyDown[z.code] = false; }, 40);
    }
    if (z.tap) z.tap();
  }

  function move(ev) {
    if (!(ev.pointerId in held)) return;
    // sliding off a held control releases it, so a thumb can leave the pad
    var z = hit(toCanvas(ev));
    var wasKey = held[ev.pointerId];
    if (z && z.key === wasKey) return;
    release(ev.pointerId);
    if (z && z.hold) {
      held[ev.pointerId] = z.key;
      pressed[z.key] = true;
      if (z.code) KeyDown[z.code] = true;
    }
  }

  function release(pointerId) {
    var key = held[pointerId];
    if (key === undefined) return;
    delete held[pointerId];
    var stillHeld = false;
    for (var id in held) if (held[id] === key) stillHeld = true;
    if (!stillHeld) {
      pressed[key] = false;
      var z = zoneByKey(key);
      if (z && z.code && z.hold) KeyDown[z.code] = false;
    }
  }
  function up(ev) { release(ev.pointerId); }

  function zoneByKey(key) {
    for (var i = 0; i < zones.length; i++) if (zones[i].key === key) return zones[i];
    return null;
  }

  function attach(cv) {
    canvas = cv;
    cv.addEventListener('pointerdown', down, { passive: false });
    cv.addEventListener('pointermove', move, { passive: false });
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', up);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', function () { active = false; });   // back to keyboard
  }

  /* -------------------------------------------------------------- zones */
  function begin() { zones.length = 0; }

  /** Register a rectangle. `code` is the P1 key it stands for; `hold` keeps
   *  it down while touched; `tap` is an extra callback for menu actions. */
  function zone(key, x, y, w, h, opts) {
    opts = opts || {};
    zones.push({ key: key, x: x, y: y, w: w, h: h, code: opts.code, hold: !!opts.hold, tap: opts.tap });
    return !!pressed[key];
  }

  /* ------------------------------------------------------------ drawing */
  function pad(ctx, key, cx, cy, r, label, opts) {
    opts = opts || {};
    var on = zone(key, cx - r, cy - r, r * 2, r * 2, opts);
    ctx.save();
    ctx.globalAlpha = opts.dim ? 0.30 : (on ? 0.92 : 0.62);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.3);
    var g = ctx.createRadialGradient(cx, cy - r * 0.35, r * 0.2, cx, cy, r);
    g.addColorStop(0, on ? (opts.hot || '#7fd0ff') : 'rgba(40,52,92,0.95)');
    g.addColorStop(1, on ? (opts.hot || '#2f6fb0') : 'rgba(12,18,40,0.95)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = on ? 5 : 3;
    ctx.strokeStyle = opts.ring || (on ? '#cfe8ff' : 'rgba(150,180,240,0.75)');
    ctx.stroke();
    ctx.globalAlpha = 1;
    txt(ctx, label, cx, cy + (opts.sub ? -6 : 0), opts.size || 24, on ? '#ffffff' : '#cfe0ff', 'center', 'rgba(6,10,24,0.9)', 5);
    if (opts.sub) txt(ctx, opts.sub, cx, cy + 16, 12, 'rgba(190,210,255,0.85)', 'center', null, 0, FONT_UI);
    ctx.restore();
    return on;
  }

  /* --------------------------------------------- the in-fight controls */
  function fightPads(ctx, G) {
    if (!active) return;
    var meterFull = false;
    try {
      var mine = G.online ? (NET.isSpectator() ? null : (NET.isHost() ? G.f1 : G.f2))
        : G.f1;
      meterFull = mine && mine.meter >= 100;
    } catch (e) { }

    // Sized for thumbs, not cursors: the canvas is scaled down on a phone,
    // so a 62px radius here lands near a 60px touch target on a handset.
    // left thumb: move, guard, duck
    pad(ctx, 'left', 88, 602, 62, '◀', { code: 'KeyA', hold: true, size: 30 });
    pad(ctx, 'right', 226, 602, 62, '▶', { code: 'KeyD', hold: true, size: 30 });
    pad(ctx, 'guard', 88, 466, 56, 'GUARD', { code: 'KeyS', hold: true, size: 17 });
    pad(ctx, 'duck', 226, 466, 56, 'DUCK', { code: 'KeyW', hold: true, size: 18 });

    // right thumb: punches
    pad(ctx, 'jab', 1192, 602, 62, 'JAB', { code: 'KeyF', size: 22, hot: '#7fe0a0' });
    pad(ctx, 'body', 1054, 602, 58, 'BODY', { code: 'KeyH', size: 18, hot: '#ffc46a' });
    pad(ctx, 'hook', 1192, 466, 58, 'HOOK', { code: 'KeyG', size: 19, hot: '#ff8a6a' });
    pad(ctx, 'super', 1054, 466, 56, 'SUPER', {
      code: 'Space', size: 17, hot: '#ffe14a', dim: !meterFull,
      ring: meterFull ? '#ffe14a' : null
    });

    // leave / pause, tucked between the two thumbs
    pad(ctx, 'leave', 640, 686, 30, '✕', { code: 'Escape', size: 20 });
  }

  /* ------------------------------------------------------ menu helpers */
  /** A labelled button. Only drawn for touch users; desktop keeps its
   *  keyboard hints and stays visually unchanged. */
  function btn(ctx, x, y, w, h, label, opts) {
    opts = opts || {};
    if (!active && !opts.always) return false;
    var on = zone(opts.key || ('b:' + label + x + y), x, y, w, h, { code: opts.code, tap: opts.tap });
    ctx.save();
    rrect(ctx, x, y, w, h, opts.r || 10);
    ctx.fillStyle = on ? (opts.hotFill || 'rgba(111,176,255,0.95)')
      : (opts.fill || 'rgba(12,18,40,0.88)');
    ctx.fill();
    ctx.lineWidth = on ? 4 : 2.5;
    ctx.strokeStyle = opts.stroke || (on ? '#e6f2ff' : 'rgba(150,180,240,0.8)');
    ctx.stroke();
    txt(ctx, label, x + w / 2, y + h / 2 + 1, opts.size || 18,
      on ? '#ffffff' : (opts.color || '#cfe0ff'), 'center', 'rgba(6,10,24,0.9)', 4);
    ctx.restore();
    return on;
  }

  /** Every screen that can be left needs one of these on a phone. */
  function backBtn(ctx, label) {
    return btn(ctx, 22, 16, 138, 48, label || '‹  BACK', { code: 'Escape', key: 'backbtn', size: 17 });
  }

  /** A full-screen tap that stands for Enter (title, result screens).
   *  Registered even before the first touch, so the very first tap counts —
   *  and it makes these screens clickable with a mouse too. */
  function anywhere(code) {
    zone('anywhere', 0, 0, 1280, 720, { code: code || 'Enter' });
  }

  /** A list row: tapping it moves the cursor there and confirms. Also live
   *  for mouse users, who reasonably expect to click a menu item. */
  function row(key, x, y, w, h, onPick) {
    return zone(key, x, y, w, h, { tap: onPick });
  }

  function isActive() { return active; }
  function setActive(v) { active = !!v; }

  return {
    attach: attach, begin: begin, zone: zone, pad: pad, btn: btn, backBtn: backBtn,
    fightPads: fightPads, anywhere: anywhere, row: row,
    isActive: isActive, setActive: setActive,
    pressed: function (k) { return !!pressed[k]; }
  };
})();
