# Putting Ripple Rumble on the open web

Goal: a link anyone can click and play — no account, no sign-in, nothing to install.

Two pieces, and **the first one alone already works**:

1. `public/` — the game itself, a single static HTML file. Host it anywhere.
2. `relay/` — an optional 90-line Cloudflare Worker that makes multiplayer
   reliable on office and guest wifi.

Without the relay the game falls back to peer-to-peer, which needs no server
but is blocked on some networks. With it, players connect over an ordinary
`wss://` socket that corporate firewalls leave alone.

---

## 1. Put the game online (5 minutes)

The whole game is one file: `public/index.html`. No build step, no dependencies.

**Cloudflare Pages, via the dashboard**

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Upload assets**.
2. Name it (say `ripple-rumble`), drag the **`public` folder** in, **Deploy**.
3. You get `https://ripple-rumble.pages.dev`. That link is the game.

**Or with the CLI**

```bash
npx wrangler pages deploy public --project-name ripple-rumble
```

At this point people can play. Online matches use peer-to-peer; most home and
mobile networks handle it, some corporate ones don't. Add the relay to fix that.

---

## 2. Add the relay (10 minutes)

```bash
cd relay
npx wrangler deploy
```

Wrangler prompts you to log in the first time, then prints a URL like
`https://ripple-rumble-relay.<your-subdomain>.workers.dev`.

Take that URL, change `https` to `wss`, and put it in `public/index.html` — it's
near the bottom, in the only block of configuration in the file:

```js
window.RR_CONFIG = {
  relay: "wss://ripple-rumble-relay.your-subdomain.workers.dev",
  appId: "ripple-rumble",
  p2p: true
};
```

Redeploy the page. Done — the game now tries the relay first and only falls back
to peer-to-peer if the relay is unreachable.

**Check it worked:** open the game, go to `ONLINE PVP`. The status pill reads
`ONLINE — CONNECTED` on the relay, and `ONLINE — BACKUP NETWORK` if it fell back
to peer-to-peer.

### If Durable Objects are unavailable on your plan

`wrangler deploy` will say so. The relay needs them because it holds open
sockets. Either enable Workers Paid (a few dollars a month), or skip the relay
entirely — peer-to-peer mode needs no server at all.

---

## What players get

- Open the link → they're in. A random handle is assigned; no sign-up.
- **QUICK MATCH** pairs them with anyone else on the site.
- **CREATE A ROOM** gives a 4-letter code *and* an invite link like
  `https://your-site.pages.dev/#K4T9`. Press `C` to copy it. Whoever opens that
  link lands directly in the match, skipping every menu.
- **WATCH A MATCH** puts them ringside at a bout already running.

---

## Costs and limits

Cloudflare's free tiers cover a demo comfortably: Pages serves static files free,
and the relay passes only small presence messages — a match is roughly 30
messages a second of a few hundred bytes each, and the Worker does no storage
or compute beyond forwarding them.

Hard limits baked into the relay: 64 people per room, 8 KB per message. The game
never approaches either (its largest packet measured 442 bytes).

---

## One honest caveat about peer-to-peer

The fallback uses free public signalling infrastructure — volunteer-run servers
shared by everyone using the library. In testing it connected reliably, then
started refusing connections for a stretch after heavy use, then recovered. That
is the nature of free shared infrastructure.

It is a genuine fallback, not a guarantee. If multiplayer matters for something
you care about, deploy the relay.
