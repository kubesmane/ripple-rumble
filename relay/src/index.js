/* =========================================================================
   RIPPLE RUMBLE — relay

   A presence relay, nothing more. One Durable Object per room; each socket
   owns one presence object, and every change is mirrored to the rest of the
   room. The game's own protocol rides on top and the relay never reads it.

   Deploy:  npx wrangler deploy      (see ../README.md)
   ========================================================================= */

const MAX_PEERS = 64;          // a room is 2 fighters plus spectators
const MAX_PRESENCE = 8 * 1024; // the game's worst case is ~450 bytes
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export class Room {
  constructor(state) {
    this.state = state;
    this.peers = new Map();      // id -> { ws, pr }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426, headers: CORS });
    }
    if (this.peers.size >= MAX_PEERS) {
      return new Response('room full', { status: 503, headers: CORS });
    }
    const pair = new WebSocketPair();
    this.accept(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  accept(ws) {
    ws.accept();
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    this.peers.set(id, { ws, pr: {} });

    const roster = {};
    for (const [pid, p] of this.peers) if (pid !== id) roster[pid] = p.pr;
    this.send(ws, { t: 'init', id, peers: roster });
    this.broadcast({ t: 'p', id, pr: {} }, id);

    ws.addEventListener('message', (ev) => {
      let m;
      try {
        if (typeof ev.data !== 'string' || ev.data.length > MAX_PRESENCE) return;
        m = JSON.parse(ev.data);
      } catch { return; }
      if (!m || typeof m !== 'object') return;

      if (m.t === 'ping') { this.send(ws, { t: 'pong' }); return; }
      if (m.t !== 'p') return;

      const rec = this.peers.get(id);
      if (!rec) return;
      rec.pr = (m.pr && typeof m.pr === 'object' && !Array.isArray(m.pr)) ? m.pr : {};
      this.broadcast({ t: 'p', id, pr: rec.pr }, id);
    });

    const gone = () => {
      if (!this.peers.has(id)) return;
      this.peers.delete(id);
      this.broadcast({ t: 'bye', id }, id);
    };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket already gone */ }
  }

  broadcast(obj, exceptId) {
    const text = JSON.stringify(obj);
    for (const [pid, p] of this.peers) {
      if (pid === exceptId) continue;
      try { p.ws.send(text); } catch { /* dropped on next close event */ }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const match = url.pathname.match(/^\/r\/(.+)$/);
    if (!match) {
      return new Response('ripple rumble relay: ok', {
        headers: { 'Content-Type': 'text/plain', ...CORS }
      });
    }

    // room names come from the game: short, and only ever [a-z0-9_.-]
    const name = decodeURIComponent(match[1]).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 64);
    if (!name) return new Response('bad room', { status: 400, headers: CORS });

    const stub = env.ROOMS.get(env.ROOMS.idFromName(name));
    return stub.fetch(request);
  }
};
