# arcade.vrg.li

Small games, played in the browser, free to fork. Live at https://arcade.vrg.li.

- `public/` — the arcade: landing, `play/tariff-wars/`, `play/brux/`, play-statistics beacon (`vg.js`), privacy and stats pages.
- `src/` — the Cloudflare Worker: router, one Durable Object per multiplayer table (`room.js`, a plain-WebSocket relay around the Presina engine), and the SQLite-backed statistics object (`stats.js`).
- `blender/logo3d.py` — renders the 3D plastic logo (`blender -b -P blender/logo3d.py -- out.png`).
- `scripts/pack.sh` — builds the per-game zips served at `/source/`; `scripts/e2e.py` plays a two-browser online match against any deployment.

Deploy with `npx wrangler deploy` (Cloudflare account with Workers + Durable Objects).

## Licence

MIT plus one condition — see [LICENSE.md](LICENSE.md): any playable copy keeps a visible "A VRG game" credit linking to https://arcade.vrg.li.
