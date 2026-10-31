# arcade.vrg.li

Small games, played in the browser, free to fork. Live at https://arcade.vrg.li.

- `public/` — the arcade: landing, `play/tariff-wars/`, `play/brux/`, play-statistics beacon (`vg.js`), privacy and stats pages.
- `src/` — the Cloudflare Worker: router, one Durable Object per multiplayer table (`room.js`, a plain-WebSocket relay around the Presina engine), and the SQLite-backed statistics object (`stats.js`).
- `blender/logo3d.py` — renders the 3D plastic logo (`blender -b -P blender/logo3d.py -- out.png`).
- `scripts/pack.sh` — builds the per-game zips served at `/source/`; `scripts/e2e.py` plays a two-browser online match against any deployment.

Deploy with `npx wrangler deploy` (Cloudflare account with Workers + Durable Objects).

## Licence

MIT plus one condition — see [LICENSE.md](LICENSE.md): any playable copy keeps a visible "A VRG game" credit linking to https://arcade.vrg.li.

## UAT and production

- **Production** `https://arcade.vrg.li` deploys from `main` (`npx wrangler deploy`).
- **UAT** `https://uat.arcade.vrg.li` deploys from the `uat` branch (`scripts/deploy-uat.sh`). It is a separate Worker with its own tables, accounts, statistics and secrets, shows a yellow UAT strip at the bottom of every page, and tells search engines to stay out.
- New games and changes land on `uat` first. When they hold up, `scripts/promote.sh` fast-forwards `main` to `uat`, deploys production and pushes both branches.
- Sign-in on UAT needs the UAT callback URLs registered at each provider (`https://uat.arcade.vrg.li/auth/<provider>/callback`); until then that provider's button reads "soon" on UAT only.
