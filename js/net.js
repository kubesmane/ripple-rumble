/* =========================================================================
   RIPPLE RUMBLE — online play

   Transport: whatever this page can reach.
     · "room"  — the Artifact runtime's room capability (published link).
                 High-rate state rides on PRESENCE, which every admitted
                 viewer may set; event topics are admin-only, so we use none.
     · "local" — BroadcastChannel, for two windows of the same browser.

   Model: host-authoritative. The host simulates the whole fight and
   publishes an absolute snapshot ~30x/s; the guest publishes its input and
   renders what it is told. Presence is coalesced and lossy by design, so
   everything sent is absolute state, and one-shot moments (a punch landing)
   ride along as a short ring buffer of numbered events.
   ========================================================================= */
var NET = (function () {

  /* --------------------------------------------------------- handle names */
  var ADJ = ['IRON', 'NIGHT', 'RED', 'STEEL', 'WILD', 'GOLD', 'STORM', 'QUICK', 'MAD', 'GRIM', 'NEON', 'STONE'];
  var NOUN = ['GLOVE', 'HAMMER', 'FANG', 'JAB', 'HOOK', 'CROWN', 'BOLT', 'CLAW', 'ANVIL', 'RIPPER', 'COMET', 'PAW'];
  function randomHandle() {
    return ADJ[(Math.random() * ADJ.length) | 0] + ' ' + NOUN[(Math.random() * NOUN.length) | 0];
  }
  var CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
    return s;
  }
  function roomKey(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); }

  /* ===================================================== transport: room  */
  function wrapRoom(r, lobbyNs) {
    return {
      kind: 'room',
      ns: r,
      lobbyNs: lobbyNs || r,
      setPresence: function (o) {
        try {
          return r.presence(o).catch(function (e) {
            // surface the first refusal so the lobby can say what is wrong
            if (e && e.code && !S.error) S.error = String(e.code);
          });
        } catch (e) { return Promise.resolve(); }
      },
      peers: function () {
        var out = [];
        try {
          var ps = r.peers();
          for (var i = 0; i < ps.length; i++) {
            var p = ps[i];
            if (p.kind === 'agent') continue;            // the publishing session is not a player
            out.push({ id: p.peer, isMe: !!p.isMe, sameTab: !!p.sameTab, pr: p.presence || {} });
          }
        } catch (e) { }
        return out;
      },
      onPeers: function (cb) { try { return r.onPeers(function () { cb(); }, function () { }); } catch (e) { return function () { }; } },
      connected: function () { try { return r.connected(); } catch (e) { return false; } },
      join: function (name) {
        return (lobbyNs || r).join(name).then(function (nr) { return wrapRoom(nr, lobbyNs || r); });
      },
      leave: function () { try { return r.leave ? r.leave() : Promise.resolve(); } catch (e) { return Promise.resolve(); } }
    };
  }

  /* ===================================================== transport: relay
     A plain WebSocket to our own tiny Cloudflare Worker. Preferred on office
     networks, which routinely block peer-to-peer UDP but never block wss.
     Protocol (mirrors the presence model exactly):
       out  {t:'p', pr}                     set my presence
       in   {t:'init', id, peers:{id:pr}}   who is here, and who I am
       in   {t:'p', id, pr} / {t:'bye', id}
     ======================================================================= */
  function makeRelay(base, roomName) {
    var url = base.replace(/\/+$/, '') + '/r/' + encodeURIComponent(roomName);
    var ws = null, myId = '', mine = {}, others = {}, subs = [], open = false;
    var dead = false, tries = 0, pingTimer = null, retryTimer = null;

    function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](); } catch (e) { } }

    function connect() {
      if (dead) return;
      try { ws = new WebSocket(url); } catch (e) { schedule(); return; }
      ws.onopen = function () {
        open = true; tries = 0;
        try { ws.send(JSON.stringify({ t: 'p', pr: mine })); } catch (e) { }
        clearInterval(pingTimer);
        pingTimer = setInterval(function () {
          if (open) try { ws.send(JSON.stringify({ t: 'ping' })); } catch (e) { }
        }, 10000);   // keep the socket warm; idle sockets were dropping
        fire();
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'init') {
          myId = m.id || myId;
          others = {};
          for (var k in (m.peers || {})) if (k !== myId) others[k] = m.peers[k] || {};
          fire();
        } else if (m.t === 'p') {
          if (m.id === myId) return;
          others[m.id] = m.pr || {};
          fire();
        } else if (m.t === 'bye') {
          delete others[m.id]; fire();
        }
      };
      ws.onclose = function () { open = false; clearInterval(pingTimer); schedule(); };
      ws.onerror = function () { try { ws.close(); } catch (e) { } };
    }
    function schedule() {
      if (dead) return;
      clearTimeout(retryTimer);
      var wait = Math.min(8000, 400 * Math.pow(2, Math.min(5, tries++)));
      retryTimer = setTimeout(connect, wait);
    }
    connect();

    return {
      kind: 'relay',
      setPresence: function (o) {
        for (var k in o) { if (o[k] === null) delete mine[k]; else mine[k] = o[k]; }
        if (open) try { ws.send(JSON.stringify({ t: 'p', pr: mine })); } catch (e) { }
        return Promise.resolve();
      },
      peers: function () {
        var out = [{ id: myId || 'me', isMe: true, sameTab: true, pr: mine }];
        for (var k in others) out.push({ id: k, isMe: false, sameTab: false, pr: others[k] });
        return out;
      },
      onPeers: function (cb) { subs.push(cb); return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
      connected: function () { return open; },
      join: function (name) { return Promise.resolve(makeRelay(base, name)); },
      leave: function () {
        dead = true; open = false;
        clearInterval(pingTimer); clearTimeout(retryTimer);
        try { ws.close(); } catch (e) { }
        return Promise.resolve();
      },
      waitOpen: function (ms) {
        return new Promise(function (res) {
          var t0 = Date.now();
          (function poll() {
            if (open) return res(true);
            if (Date.now() - t0 > ms) return res(false);
            setTimeout(poll, 120);
          })();
        });
      }
    };
  }

  /* ======================================================= transport: p2p
     Trystero over its public signalling relays: no server, no accounts. We
     layer presence on top of a broadcast action, since peer-to-peer gives us
     messages but no shared state.
     ======================================================================= */
  function makeP2P(lib, appId, roomName) {
    var room = lib.joinRoom({ appId: appId }, roomName);
    var act = room.makeAction('pr');
    var myId = lib.selfId, mine = {}, others = {}, subs = [];

    function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](); } catch (e) { } }
    function blast() { try { act.send(mine); } catch (e) { } }

    act.onMessage = function (data, peerId) {
      if (!peerId || peerId === myId) return;
      others[peerId] = (data && typeof data === 'object') ? data : {};
      fire();
    };
    room.onPeerJoin = function (id) { blast(); fire(); };      // greet the newcomer
    room.onPeerLeave = function (id) { delete others[id]; fire(); };

    var keep = setInterval(blast, 1000);                       // survive dropped joins

    return {
      kind: 'p2p',
      setPresence: function (o) {
        for (var k in o) { if (o[k] === null) delete mine[k]; else mine[k] = o[k]; }
        blast();
        return Promise.resolve();
      },
      peers: function () {
        var out = [{ id: myId, isMe: true, sameTab: true, pr: mine }];
        for (var k in others) out.push({ id: k, isMe: false, sameTab: false, pr: others[k] });
        return out;
      },
      onPeers: function (cb) { subs.push(cb); return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
      connected: function () { return true; },
      join: function (name) { return Promise.resolve(makeP2P(lib, appId, name)); },
      leave: function () {
        clearInterval(keep);
        try { room.leave(); } catch (e) { }
        return Promise.resolve();
      }
    };
  }

  /* ==================================================== transport: local  */
  function makeLocal(channelName) {
    var ch, id = 'l' + Math.random().toString(36).slice(2, 10);
    try { ch = new BroadcastChannel(channelName); } catch (e) { return null; }
    var mine = {}, others = {}, subs = [], lastSend = 0, alive = true;

    function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](); } catch (e) { } }
    function post() { try { ch.postMessage({ k: 'p', id: id, pr: mine }); } catch (e) { } lastSend = performance.now(); }

    ch.onmessage = function (e) {
      var m = e.data;
      if (!m || m.id === id) return;
      if (m.k === 'p') {
        var known = !!others[m.id];
        others[m.id] = { pr: m.pr || {}, at: performance.now() };
        if (!known) post();                                  // answer a newcomer at once
        fire();
      } else if (m.k === 'bye') { delete others[m.id]; fire(); }
    };

    var timer = setInterval(function () {
      if (!alive) return;
      post();
      var now = performance.now(), changed = false;
      for (var k in others) if (now - others[k].at > 2500) { delete others[k]; changed = true; }
      if (changed) fire();
    }, 400);

    window.addEventListener('pagehide', function () { try { ch.postMessage({ k: 'bye', id: id }); } catch (e) { } });

    return {
      kind: 'local',
      setPresence: function (o) {
        for (var k in o) { if (o[k] === null) delete mine[k]; else mine[k] = o[k]; }
        if (performance.now() - lastSend > 32) post();
        return Promise.resolve();
      },
      peers: function () {
        var out = [{ id: id, isMe: true, sameTab: true, pr: mine }];
        for (var k in others) out.push({ id: k, isMe: false, sameTab: false, pr: others[k].pr });
        return out;
      },
      onPeers: function (cb) { subs.push(cb); return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
      connected: function () { return alive; },
      join: function (name) { return Promise.resolve(makeLocal('rr-room-' + name)); },
      leave: function () {
        alive = false; clearInterval(timer);
        try { ch.postMessage({ k: 'bye', id: id }); ch.close(); } catch (e) { }
        return Promise.resolve();
      }
    };
  }

  /* ========================================================= wire codecs  */
  var ST = ['idle', 'walk', 'block', 'duck', 'dodge', 'attack', 'special', 'hitstun',
    'hitstunBody', 'dizzy', 'exhaust', 'grabbed', 'down', 'ko', 'win'];
  var AK = ['', 'jab', 'hook', 'body'];
  var PH = ['intro', 'fight', 'count', 'ko', 'roundend'];

  function encFighter(f) {
    return [
      Math.round(f.x), f.facing, Math.max(0, ST.indexOf(f.state)),
      Math.round(f.hp * 10), Math.round(f.stam), Math.round(f.meter), Math.round(f.stun),
      Math.round(f.buff * 100), f.downs | 0, f.combo | 0,
      Math.max(0, AK.indexOf(f.atk ? f.atk.key : '')),
      Math.round(f.t * 1000), Math.round(f.iframes * 100),
      f.st.headless ? 1 : 0, Math.round((f.getUp || 0) * 100),
      f.multiHits | 0, f.grabbing ? 1 : 0, Math.round(f.comboT * 100)
    ];
  }
  function decFighter(f, a, opp, snap) {
    f.netX = a[0];
    if (f.x === undefined || Math.abs(f.x - a[0]) > 220) f.x = a[0];   // teleport on a big desync
    f.facing = a[1];
    var st = ST[a[2]] || 'idle';
    if (f.state !== st) { f.state = st; f.t = 0; }
    f.hp = a[3] / 10; f.stam = a[4]; f.meter = a[5]; f.stun = a[6];
    f.buff = a[7] / 100; f.downs = a[8]; f.combo = a[9];
    f.atk = a[10] ? f.attacks[AK[a[10]]] : null;
    f.t = a[11] / 1000;
    f.iframes = a[12] / 100;
    f.st.headless = !!a[13];
    f.getUp = a[14] / 100;
    f.multiHits = a[15];
    f.grabbing = a[16] ? opp : null;
    f.comboT = a[17] / 100;
    f.st.ko = (st === 'down' || st === 'ko');
    if (st === 'down' && f.downT === undefined) f.downT = 0;
  }

  /* =============================================================== state  */
  var S = {
    supported: false,        // a transport exists at all
    kind: 'none',            // 'room' | 'local' | 'none'
    ready: false,            // finished probing
    lobby: null,
    room: null,
    myId: '',
    handle: randomHandle(),
    phase: 'off',            // off | lobby | seeking | waiting | matched
    code: '',
    role: '',                // host | guest
    oppId: '',
    oppHandle: '',
    oppHero: 0,
    oppReady: false,
    myHero: 0,
    myReady: false,
    note: '',
    ping: 0,
    lastSnapAt: 0,
    lastInAt: 0,
    error: '',
    quick: false, seekRoom: '',
    started: false,          // host said: match is running
    rematch: 0, oppRematch: 0,
    epoch: 0,                // host bumps this for every fresh match
    oppEpoch: 0,
    heroes: null             // [hostFighterId, guestFighterId] as the host declared them
  };

  var p2pLib = null, relayBase = '';
  var seq = 0, ackSeq = 0, lastPushed = 0;
  var sentAt = {};                 // guest: our own send times, keyed by sequence
  var evId = 0, evBuf = [], seenEv = 0;
  var snap = null, pending = null;
  var inCounters = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
  var inSeen = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
  var inQueue = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
  var guestHold = { lr: 0, bl: 0, dk: 0 };
  var hostDelay = [];        // host's own input, delayed to match the guest's lag

  /* ------------------------------------------------------------- startup */
  function init() {
    if (S.ready) return;
    var done = function (t, kind) {
      S.lobby = t; S.kind = kind; S.supported = !!t; S.ready = true;
      if (t) {
        t.onPeers(function () { });                       // keep the room warm
        pushLobby();
        var me = t.peers().filter(function (p) { return p.isMe; })[0];
        S.myId = me ? me.id : 'me';
      }
    };
    var useLocal = function () {
      var t = makeLocal('rr-lobby');
      done(t, t ? 'local' : 'none');
      if (!t) S.error = 'This browser cannot open a local channel.';
    };

    var cfg = window.RR_CONFIG;

    // Which world are we in? The public build ships an RR_CONFIG; the Artifact
    // build never does. Deciding on that rather than on whether window.claude
    // happens to exist yet keeps a slow runtime from dropping us onto a
    // transport the Artifact sandbox would block anyway.
    if (!cfg) {
      var settled = false;
      var giveUp = Date.now() + 3000;
      (function awaitRuntime() {
        if (settled) return;
        if (window.claude && typeof window.claude.use === 'function') {
          settled = true;
          var timeout = setTimeout(function () { useLocal(); }, 11000);
          var answered = false;
          window.claude.use('room').then(function (r) {
            if (answered) return; answered = true; clearTimeout(timeout);
            if (r) done(wrapRoom(r), 'room'); else useLocal();
          }).catch(function () {
            if (answered) return; answered = true; clearTimeout(timeout); useLocal();
          });
          return;
        }
        if (Date.now() > giveUp) { settled = true; useLocal(); return; }
        setTimeout(awaitRuntime, 100);
      })();
      return;
    }

    // 2. Public build: our relay first (best through office firewalls), then
    //    peer-to-peer, then same-browser windows. Everyone lands on the same
    //    rung in practice — the relay is either up for all of us or for none.
    (function () {
      var t0 = Date.now();
      function p2pThenLocal() {
        if (cfg.p2p === false) { useLocal(); return; }
        S.probing = 'p2p';
        // Free signalling networks rate-limit and go down; try more than one.
        // MQTT first — it has been the steadier of the two in testing.
        var sources = cfg.trystero ? [].concat(cfg.trystero) : [
          'https://cdn.jsdelivr.net/npm/@trystero-p2p/mqtt@0.25.4/+esm',
          'https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm'
        ];
        (function attempt(i) {
          if (i >= sources.length) { useLocal(); return; }
          import(sources[i]).then(function (lib) {
            if (!lib || typeof lib.joinRoom !== 'function') { attempt(i + 1); return; }
            p2pLib = lib;
            done(makeP2P(lib, cfg.appId || 'ripple-rumble', 'rr-lobby'), 'p2p');
          }).catch(function () { attempt(i + 1); });
        })(0);
      }
      if (!cfg.relay) { p2pThenLocal(); return; }
      S.probing = 'relay';
      var t = makeRelay(cfg.relay, 'rr-lobby');
      t.waitOpen(4500).then(function (ok) {
        if (ok) { relayBase = cfg.relay; done(t, 'relay'); }
        else { t.leave(); p2pThenLocal(); }
      });
    })();
  }

  var lastLobbyPush = 0;
  function pushLobby(force, minMs) {
    if (!S.lobby) return;
    // Lobby state changes slowly; a crowded lobby does not need 60 pushes a
    // second from everyone. State changes push immediately via `force`.
    var now = performance.now();
    if (!force && now - lastLobbyPush < (minMs || 250)) return;
    lastLobbyPush = now;
    // While quick-matching we keep advertising "seek" right through joining the
    // room, and name the room we went to — otherwise the partner, who is still
    // deciding, sees us turn busy and never pairs.
    var stillSeeking = S.phase === 'seeking' || (S.phase === 'waiting' && S.quick);
    S.lobby.setPresence({
      v: 1, n: S.handle.slice(0, 24),
      st: stillSeeking ? 'seek'
        : (S.phase === 'spectating' ? 'watch'
          : (S.phase === 'matched' || S.phase === 'waiting' ? 'busy' : 'idle')),
      m: S.phase === 'matched' ? 1 : null,      // in a bout right now
      hr: S.phase === 'matched' ? S.myHero : null,
      // the room we are in, so anyone in the lobby can come and watch
      rm: S.roomName || (S.quick ? S.seekRoom : S.code) || null,
      t: Date.now()
    });
  }

  function lobbyPlayers() {
    if (!S.lobby) return [];
    var list = S.lobby.peers().filter(function (p) { return !p.isMe && p.pr && p.pr.v; });
    // people you can actually challenge float to the top
    var rank = function (p) { return p.pr.m ? 2 : (p.pr.st === 'seek' ? 0 : 1); };
    list.sort(function (a, b) {
      var d = rank(a) - rank(b);
      if (d) return d;
      return String(a.pr.n || '') < String(b.pr.n || '') ? -1 : 1;
    });
    return list;
  }

  /** Headcount for the lobby screen, across everyone here including you. */
  function lobbyStats() {
    var all = S.lobby ? S.lobby.peers().filter(function (p) { return p.pr && p.pr.v; }) : [];
    var seeking = 0, inMatch = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].pr.m) inMatch++;
      else if (all[i].pr.st === 'seek') seeking++;
    }
    return {
      total: all.length,
      seeking: seeking,
      inMatch: inMatch,
      matches: Math.ceil(inMatch / 2)      // players in a bout always come in pairs
    };
  }

  /* ---------------------------------------------------------- match join */
  function enterRoom(name, note) {
    if (!S.lobby) return;
    S.note = note || 'CONNECTING…';
    var target = name;
    S.lobby.join(name).then(function (r) {
      if (S.roomName !== target) { /* superseded */ }
      S.room = r;
      S.roomName = target;
      S.phase = 'waiting';
      S.role = ''; S.oppId = '';
      S.myReady = false; S.oppReady = false; S.started = false;
      S.rematch = 0; S.oppRematch = 0;
      snap = null; pending = null; evBuf = []; seenEv = 0; evId = 0;
      seq = 0; ackSeq = 0;
      resetInput();
      S.note = 'WAITING FOR A CHALLENGER…';
      // say "player here" at once — the opponent scan looks for this, and it
      // lands long before the character select starts pushing full state
      r.setPresence({ pl: 1, v: 1, n: S.handle.slice(0, 24) });
      pushLobby(true);
    }).catch(function (e) {
      // Named rooms can be refused for a viewer. The lobby channel is open to
      // everyone who is here, so run the match there instead, tagged so only
      // the two paired players read each other.
      S.room = lobbyProxy(target);
      S.roomName = target;
      S.phase = 'waiting';
      S.role = ''; S.oppId = '';
      S.myReady = false; S.oppReady = false; S.started = false;
      S.rematch = 0; S.oppRematch = 0;
      snap = null; pending = null; evBuf = []; seenEv = 0; evId = 0;
      seq = 0; ackSeq = 0;
      resetInput();
      S.note = 'WAITING FOR A CHALLENGER…';
      S.room.setPresence({ pl: 1, v: 1, n: S.handle.slice(0, 24) });
    });
  }

  /** A match channel built on the lobby, for viewers who cannot open a named
   *  room. Everyone here receives it; only the tagged pair reads it. */
  function lobbyProxy(name) {
    return {
      kind: 'proxy',
      setPresence: function (o) {
        var copy = { rmk: name };
        for (var k in o) copy[k] = o[k];
        return S.lobby.setPresence(copy);
      },
      peers: function () {
        return S.lobby.peers().filter(function (p) {
          return p.isMe || (p.pr && p.pr.rmk === name);
        });
      },
      onPeers: function (cb) { return S.lobby.onPeers(cb); },
      connected: function () { return S.lobby.connected(); },
      leave: function () {
        return S.lobby.setPresence({
          rmk: null, r: null, a: null, b: null, ev: null, an: null,
          h1: null, h2: null, go: null, sq: null, c: null
        });
      }
    };
  }

  function resetInput() {
    sentAt = {};
    inCounters = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
    inSeen = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
    inQueue = { j: 0, h: 0, b: 0, s: 0, dl: 0, dr: 0 };
    guestHold = { lr: 0, bl: 0, dk: 0 };
    hostDelay = [];
  }

  function leaveMatch(note) {
    if (S.room) { S.room.leave(); S.room = null; }
    S.roomName = '';
    S.phase = 'lobby'; S.code = ''; S.role = ''; S.oppId = ''; S.oppHandle = '';
    S.quick = false; S.seekRoom = '';
    S.started = false; S.myReady = false; S.oppReady = false;
    snap = null; pending = null;
    resetInput();
    S.note = note || '';
    pushLobby(true);
  }

  /* ---------------------------------------------- room bookkeeping / tick */
  function roomPeers() {
    try { return (S.room && S.room.peers) ? S.room.peers() : []; } catch (e) { return []; }
  }

  function tickLobby() {
    if (!S.lobby) return;
    if (S.phase === 'seeking') {
      // deterministic pairing: sort everyone who is looking, pair them off
      var seeking = S.lobby.peers().filter(function (p) {
        return p.pr && p.pr.v && (p.isMe ? true : p.pr.st === 'seek');
      });
      seeking = seeking.filter(function (p) { return p.isMe ? true : p.pr.st === 'seek'; });
      seeking.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
      var idx = -1;
      for (var i = 0; i < seeking.length; i++) if (seeking[i].isMe) idx = i;
      if (idx >= 0) {
        var partner = (idx % 2 === 0) ? seeking[idx + 1] : seeking[idx - 1];
        if (partner) {
          var a = seeking[idx].id, b = partner.id;
          // if they already picked a room, go to theirs; otherwise both sides
          // compute the same name from the lower peer id
          var advertised = (partner.pr && typeof partner.pr.rm === 'string' && partner.pr.rm.charAt(0) === 'q')
            ? partner.pr.rm : '';
          var name = advertised || ('q' + roomKey(a < b ? a : b));
          S.seekRoom = name;
          S.code = '';
          enterRoom(name, 'MATCH FOUND');
        }
      }
    }
  }

  function tickRoom(dt) {
    if (!S.room) return;
    var ps = roomPeers();
    var me = null, opp = null, maybe = null;
    for (var i = 0; i < ps.length; i++) {
      // a room can also hold spectators; mistaking one for the opponent would
      // stall the bout, so prefer a peer flying the player flag and never
      // fall back to one that has announced itself as a watcher
      var pr = ps[i].pr;
      if (ps[i].isMe && (ps[i].sameTab || !me)) me = ps[i];
      else if (ps[i].isMe) continue;
      else if (pr && pr.pl) { if (!opp) opp = ps[i]; }
      else if (!(pr && pr.sp) && !maybe) maybe = ps[i];
    }
    if (!opp) opp = maybe;
    // "me" can also match another tab of mine — prefer this exact document
    for (var j = 0; j < ps.length; j++) if (ps[j].sameTab) me = ps[j];
    if (me) S.myId = me.id;

    /* ---- watching someone else's bout: read the host, send nothing ---- */
    if (S.role === 'spectator') {
      var host = null, players = [];
      for (var k = 0; k < ps.length; k++) {
        var pk = ps[k];
        if (pk.isMe || !pk.pr) continue;
        if (pk.pr.pl) players.push(pk);
        if (pk.pr.r === 'h') host = pk;
      }
      S.watching = players.map(function (p) { return String(p.pr.n || 'FIGHTER').slice(0, 16); });
      pushSpectator();
      if (!host) return;                       // caller times out on snapshotAge
      var hp = host.pr;
      if (hp.sq !== undefined && (!snap || hp.sq >= snap.sq)) {
        var freshS = !snap || hp.sq > snap.sq;
        snap = hp;
        if (freshS) { S.lastSnapAt = performance.now(); pending = hp; }
      }
      S.started = !!hp.go;
      S.oppEpoch = hp.ep | 0;
      S.heroes = (hp.h1 && hp.h2) ? [hp.h1, hp.h2] : null;
      return;
    }

    if (!opp) {
      if (S.phase === 'matched') {
        // A socket that reconnects, or a peer that re-registers under a new
        // id, makes the opponent vanish for a moment. Ending the bout on the
        // first missing frame would drop people mid-fight over a blip, so
        // give them a few seconds to come back.
        S.oppGoneFor = (S.oppGoneFor || 0) + dt;
        if (S.oppGoneFor > 5) leaveMatch('OPPONENT LEFT THE RING');
        else S.note = 'RECONNECTING…';
      } else {
        S.note = S.code ? ('ROOM ' + S.code + ' — WAITING FOR A CHALLENGER…') : 'WAITING FOR A CHALLENGER…';
      }
      return;
    }
    S.oppGoneFor = 0;

    S.oppId = opp.id;
    S.oppHandle = (opp.pr && typeof opp.pr.n === 'string') ? String(opp.pr.n).slice(0, 24) : 'CHALLENGER';
    // Decide who simulates ONCE per room. Peer ids change when a socket
    // reconnects, and recomputing could swap the roles mid-fight — leaving
    // two hosts, or none.
    if (!S.role) S.role = (S.myId < opp.id) ? 'host' : 'guest';
    S.watchers = 0;
    for (var w = 0; w < ps.length; w++) if (!ps[w].isMe && ps[w].pr && ps[w].pr.sp) S.watchers++;
    if (S.phase === 'waiting') { S.phase = 'matched'; S.note = ''; S.quick = false; pushLobby(true); }

    var op = opp.pr || {};
    if (typeof op.hero === 'number') S.oppHero = Math.max(0, Math.min(ROSTER.length - 1, op.hero | 0));
    S.oppReady = !!op.rdy;
    S.oppRematch = op.rm | 0;

    if (S.role === 'guest') {
      if (op.r === 'h' && op.sq !== undefined) {
        if (!snap || op.sq >= snap.sq) {
          var fresh = !snap || op.sq > snap.sq;
          snap = op;
          if (fresh) { S.lastSnapAt = performance.now(); pending = op; }
        }
        // Round-trip measured on OUR clock: the host echoes the sequence
        // number we sent, and we timed that one ourselves. (Subtracting the
        // host's own timestamp would be comparing two unrelated clocks.)
        if (op.ack && sentAt[op.ack]) {
          S.ping = Math.max(0, Math.round(performance.now() - sentAt[op.ack]));
          delete sentAt[op.ack];
        }
        S.started = !!op.go;
        S.oppEpoch = op.ep | 0;
        S.heroes = (op.h1 && op.h2) ? [op.h1, op.h2] : null;
      }
    } else {
      if (op.r === 'g') {
        S.lastInAt = performance.now();
        guestHold.lr = op.lr | 0; guestHold.bl = op.bl | 0; guestHold.dk = op.dk | 0;
        var c = op.c || [];
        var keys = ['j', 'h', 'b', 's', 'dl', 'dr'];
        for (var k = 0; k < keys.length; k++) {
          var v = c[k] | 0, key = keys[k];
          if (v > inSeen[key]) { inQueue[key] = Math.min(3, inQueue[key] + (v - inSeen[key])); inSeen[key] = v; }
          else if (v < inSeen[key]) { inSeen[key] = v; }         // peer restarted its counters
        }
        if (op.sq !== undefined) ackSeq = op.sq;
        if (op.ats) S.ping = Math.max(0, Math.round(performance.now() - (op.ats || 0)));
      }
    }
  }

  /* ------------------------------------------------------------- pushing */
  function pushRoom(obj) {
    if (!S.room) return;
    var now = performance.now();
    if (now - lastPushed < 32) return;                 // ~30 Hz, the presence budget
    lastPushed = now;
    S.room.setPresence(obj);
  }

  function pushHost(G) {
    var f1 = G.f1, f2 = G.f2;
    var o = {
      r: 'h', v: 1, n: S.handle.slice(0, 24), hero: S.myHero, rdy: S.myReady ? 1 : 0, rm: S.rematch,
      pl: 1,
      sq: ++seq, ats: Math.round(performance.now()), ack: ackSeq, go: S.started ? 1 : 0, ep: S.epoch
    };
    if (S.started && f1 && f2) {
      o.h1 = f1.def.id; o.h2 = f2.def.id;
      o.a = encFighter(f1); o.b = encFighter(f2);
      o.ph = Math.max(0, PH.indexOf(G.phase));
      o.ck = Math.round(G.clock * 10);
      o.rd = G.round; o.w = [f1.wins, f2.wins];
      o.ct = Math.round((G.countT || 0) * 10);
      o.dw = G.downed ? (G.downed === f1 ? 1 : 2) : 0;
      o.sc = G.scene === 'result' ? 1 : 0;
      o.mw = G.matchWinner ? (G.matchWinner === f1 ? 1 : 2) : 0;
      if (G.annT > 0) o.an = [String(G.ann).slice(0, 24), Math.round(G.annT * 10), G.annCol];
      if (evBuf.length) o.ev = evBuf.slice(-5);
    }
    pushRoom(o);
  }

  function pushGuest() {
    var o = {
      r: 'g', v: 1, pl: 1, n: S.handle.slice(0, 24), hero: S.myHero, rdy: S.myReady ? 1 : 0, rm: S.rematch,
      sq: ++seq, ats: snap && snap.ats ? snap.ats : 0,   // echo the host's stamp back for ITS measurement
      lr: guestHold.lr, bl: guestHold.bl, dk: guestHold.dk,
      c: [inCounters.j, inCounters.h, inCounters.b, inCounters.s, inCounters.dl, inCounters.dr]
    };
    sentAt[o.sq] = performance.now();
    if (o.sq % 64 === 0) {                       // keep the map from growing
      for (var k in sentAt) if (o.sq - k > 128) delete sentAt[k];
    }
    pushRoom(o);
  }

  /** A watcher announces itself so the fighters can see a crowd, and so the
   *  players' own peer scan never mistakes it for an opponent. */
  function pushSpectator() {
    if (!S.room) return;
    var now = performance.now();
    if (now - lastPushed < 500) return;        // watchers are cheap company
    lastPushed = now;
    S.room.setPresence({ sp: 1, v: 1, n: S.handle.slice(0, 24), t: Date.now() });
  }

  /** Bouts running right now, grouped by the room they are in. */
  function liveMatches() {
    if (!S.lobby) return [];
    var all = S.lobby.peers().filter(function (p) { return p.pr && p.pr.v && p.pr.m && p.pr.rm; });
    var map = {}, order = [];
    for (var i = 0; i < all.length; i++) {
      var pr = all[i].pr, key = String(pr.rm);
      if (!map[key]) { map[key] = { room: key, names: [], heroes: [] }; order.push(key); }
      if (map[key].names.length < 2) {
        map[key].names.push(String(pr.n || 'FIGHTER').slice(0, 16));
        map[key].heroes.push(Math.max(0, Math.min(ROSTER.length - 1, pr.hr | 0)));
      }
    }
    return order.map(function (k) { return map[k]; });
  }

  /* ----------------------------------------------------- host: FX events */
  function event(kind, x, y, w) {
    if (S.role !== 'host' || !S.started) return;
    evBuf.push([++evId, kind, Math.round(x), Math.round(y), Math.round((w || 0) * 100)]);
    if (evBuf.length > 5) evBuf.shift();
  }

  /* ------------------------------------- guest: apply what the host sent */
  function applySnapshot(G) {
    if (!pending) return;
    var s = pending; pending = null;
    if (!s.a || !s.b || !G.f1 || !G.f2) return;

    decFighter(G.f1, s.a, G.f2, s);
    decFighter(G.f2, s.b, G.f1, s);
    G.f1.wins = (s.w && s.w[0]) | 0; G.f2.wins = (s.w && s.w[1]) | 0;
    G.phase = PH[s.ph] || 'fight';
    G.clock = (s.ck | 0) / 10;
    G.round = s.rd | 0;
    G.countT = (s.ct | 0) / 10;
    G.downed = s.dw === 1 ? G.f1 : (s.dw === 2 ? G.f2 : null);
    G.matchWinner = s.mw === 1 ? G.f1 : (s.mw === 2 ? G.f2 : null);
    if (s.an) { G.ann = s.an[0]; G.annT = (s.an[1] | 0) / 10; G.annDur = Math.max(0.3, G.annT); G.annCol = s.an[2] || '#fff'; }

    // one-shot moments, played once each
    if (s.ev) {
      for (var i = 0; i < s.ev.length; i++) {
        var e = s.ev[i];
        if (e[0] <= seenEv) continue;
        seenEv = e[0];
        playEvent(e[1], e[2], e[3], e[4] / 100);
      }
    }
    if (s.sc === 1 && G.scene === 'fight') {
      G.scene = 'result'; G.resultT = 0; G.annT = 0; FX.clear();
      SFX.music('menu'); SFX.cheer(1.2);
    }
  }

  function playEvent(kind, x, y, w) {
    switch (kind) {
      case 0: SFX.hit(w); FX.spark(x, y, w, '#fff0a8'); GameShake(5 + w * 20); break;
      case 1: SFX.block(); FX.spark(x, y, 0.25, '#cfe3ff'); GameShake(4); break;
      case 2: SFX.parry(); FX.spark(x, y, 0.6, '#9fe8ff'); FX.popup(x, y - 40, 'PARRY!', '#9fe8ff', 30); break;
      case 3: SFX.superHit(); FX.popup(x, y - 50, 'GUARD BREAK!', '#ff9b4a', 28); GameShake(18); break;
      case 4: SFX.charge(); GameShake(10); break;
      case 5: SFX.bell(1); break;
      case 6: SFX.whiff(); break;
      case 7: SFX.ko(); GameShake(30); break;
      case 8: SFX.pop(); break;
    }
  }
  function GameShake(a) { if (window.G && G.shake) G.shake(a); }

  /* ------------------------------------------- host: read guest's inputs */
  function guestInput(into) {
    into.left = guestHold.lr < 0; into.right = guestHold.lr > 0;
    into.block = !!guestHold.bl; into.duck = !!guestHold.dk;
    into.jab = take('j'); into.hook = take('h'); into.body = take('b'); into.special = take('s');
    into.dash = take('dl') ? -1 : (take('dr') ? 1 : 0);
    return into;
  }
  function take(k) { if (inQueue[k] > 0) { inQueue[k]--; return true; } return false; }

  /* ------------------------------ guest: record my own input for sending */
  function recordInput(i) {
    guestHold.lr = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    guestHold.bl = i.block ? 1 : 0;
    guestHold.dk = i.duck ? 1 : 0;
    if (i.jab) inCounters.j++;
    if (i.hook) inCounters.h++;
    if (i.body) inCounters.b++;
    if (i.special) inCounters.s++;
    if (i.dash < 0) inCounters.dl++;
    if (i.dash > 0) inCounters.dr++;
  }

  /* ------------------ host: hold its own input back to match guest's lag */
  function delayHostInput(i, dt) {
    var lag = Math.min(0.16, Math.max(0.03, (S.ping || 90) / 2000));
    hostDelay.push({ t: performance.now(), i: { left: i.left, right: i.right, block: i.block, duck: i.duck, jab: i.jab, hook: i.hook, body: i.body, special: i.special, dash: i.dash } });
    var cutoff = performance.now() - lag * 1000;
    var out = null;
    while (hostDelay.length && hostDelay[0].t <= cutoff) out = hostDelay.shift().i;
    if (hostDelay.length > 40) hostDelay.splice(0, hostDelay.length - 40);
    if (!out) return { left: false, right: false, block: i.block, duck: i.duck, jab: false, hook: false, body: false, special: false, dash: 0 };
    return out;
  }

  /* ---------------------------------------------------------------- API  */
  return {
    S: S,
    init: init,
    ready: function () { return S.ready; },
    online: function () { return S.phase === 'matched' || S.phase === 'spectating'; },
    isSpectator: function () { return S.role === 'spectator'; },
    watchers: function () { return S.watchers | 0; },
    watching: function () { return S.watching || []; },
    liveMatches: liveMatches,
    spectate: function (roomName) {
      if (!S.lobby || !roomName) return;
      S.role = 'spectator';
      S.phase = 'spectating';
      S.code = ''; S.quick = false; S.seekRoom = '';
      snap = null; pending = null; seenEv = 0;
      S.started = false; S.heroes = null; S.oppEpoch = -1; S.lastSnapAt = performance.now();
      S.note = 'JOINING THE CROWD…';
      S.lobby.join(roomName).then(function (r) {
        S.room = r; S.roomName = roomName; S.note = '';
        pushSpectator();
      }).catch(function () {
        // a viewer who cannot open that room simply cannot watch it
        S.room = lobbyProxy(roomName); S.roomName = roomName; S.note = '';
      });
    },
    kindLabel: function () {
      return S.kind === 'room' ? 'ONLINE'
        : S.kind === 'relay' ? 'ONLINE'
        : S.kind === 'p2p' ? 'ONLINE — BACKUP NETWORK'
        : S.kind === 'local' ? 'THIS BROWSER ONLY' : 'OFFLINE';
    },
    handle: function () { return S.handle; },
    reroll: function () { S.handle = randomHandle(); pushLobby(true); },
    lobbyPlayers: lobbyPlayers,
    lobbyStats: lobbyStats,

    enterLobby: function () { init(); if (S.phase === 'off') S.phase = 'lobby'; pushLobby(); },
    seek: function () { S.phase = 'seeking'; S.quick = true; S.code = ''; S.seekRoom = ''; S.note = 'LOOKING FOR AN OPPONENT…'; pushLobby(true); },
    stopSeek: function () { S.phase = 'lobby'; S.quick = false; S.seekRoom = ''; S.note = ''; pushLobby(true); },
    createRoom: function () { S.quick = false; S.seekRoom = ''; S.code = randomCode(); enterRoom('c' + roomKey(S.code), 'ROOM ' + S.code); },
    joinCode: function (code) { S.quick = false; S.seekRoom = ''; S.code = String(code).toUpperCase().slice(0, 4); enterRoom('c' + roomKey(S.code), 'JOINING ' + S.code); },
    leaveMatch: leaveMatch,

    setHero: function (i) { S.myHero = i; },
    setReady: function (v) { S.myReady = !!v; },
    requestRematch: function () { S.rematch++; },
    clearRematch: function () { S.rematch = 0; S.oppRematch = 0; },
    wantsRematch: function () { return S.rematch > 0; },
    oppWantsRematch: function () { return S.oppRematch > 0; },
    oppHandle: function () { return S.oppHandle || 'CHALLENGER'; },
    bothReady: function () { return S.myReady && S.oppReady; },
    bothRematch: function () { return S.rematch > 0 && S.oppRematch > 0; },
    markStarted: function (v) {
      S.started = !!v;
      if (v) { S.epoch++; S.rematch = 0; S.oppRematch = 0; }
      else { S.myReady = false; S.oppReady = false; }
    },
    epoch: function () { return S.epoch; },
    oppEpoch: function () { return S.oppEpoch; },
    heroes: function () { return S.heroes; },
    hasSnapshot: function () { return !!snap; },

    isHost: function () { return S.role === 'host'; },
    role: function () { return S.role; },
    oppHero: function () { return S.oppHero; },
    ping: function () { return S.ping; },
    note: function () { return S.note; },

    tick: function (dt, G) {
      if (!S.ready) return;
      tickLobby();
      tickRoom(dt);
      if (S.phase === 'off' || S.phase === 'lobby' || S.phase === 'seeking') pushLobby();
      // keep the watch list honest about who is fighting whom, cheaply
      else if (S.phase === 'matched' || S.phase === 'spectating') pushLobby(false, 2000);
    },
    pushHost: pushHost,
    pushGuest: pushGuest,
    applySnapshot: applySnapshot,
    guestInput: guestInput,
    recordInput: recordInput,
    delayHostInput: delayHostInput,
    event: event,
    snapshotAge: function () { return performance.now() - S.lastSnapAt; },
    inputAge: function () { return performance.now() - S.lastInAt; },
    netX: function (f) { return f.netX; }
  };
})();
