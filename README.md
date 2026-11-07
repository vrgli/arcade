# VRG games

Small games, played in the browser, free to fork. Play them at https://play.vrg.li.

## Games

Each game has its own repo. Open one, click **Fork**, clone it and open `game/index.html`.

| Game | What it is | Play |
|---|---|---|
| [Tariff Wars](https://github.com/vrgli/tariff-wars) | Open your deals, the highest tariff wins. Card game for four seats, against the AI or online with friends. | [play.vrg.li/play/tariff-wars](https://play.vrg.li/play/tariff-wars/) |
| [Wallop](https://github.com/vrgli/wallop) | Bitcoin throws the punch. A sixty-second fight every minute. | [play.vrg.li/play/wallop](https://play.vrg.li/play/wallop/) |
| [Nuclear Negotiations](https://github.com/vrgli/nuclear-negotiations) | Eight leaders, two wheels, two of them rogue. Don't let the rogues face each other. | [play.vrg.li/play/nuclear-negotiations](https://play.vrg.li/play/nuclear-negotiations/) |

The apps live next door in [vrgli/apps](https://github.com/vrgli/apps).

## What this repo holds

This is the shared Play site that hosts all the games. Each game's own repo is the place to fork
it; the copy under `public/play/<game>/` here is the one the site serves.

- `public/` — the Play site: landing, the games under `play/`, the play-statistics beacon (`vg.js`), source, privacy and stats pages.
- `src/` — the Cloudflare Worker: router, one Durable Object per multiplayer table (`room.js`, a plain-WebSocket relay around the Tariff Wars engine), sign-in, accounts, and the SQLite-backed statistics object (`stats.js`).
- `blender/logo3d.py` — renders the 3D plastic logo (`blender -b -P blender/logo3d.py -- out.png`).
- `scripts/pack.sh` — builds the per-game zips served at `/source/`; `scripts/e2e.py` plays a two-browser online match against any deployment.

Deploy with `npx wrangler deploy` (Cloudflare account with Workers + Durable Objects).

## Licence

MIT plus one condition — see [LICENSE.md](LICENSE.md): any playable copy keeps a visible "A VRG game" credit linking to https://play.vrg.li.

## UAT and production

- **Production** `https://play.vrg.li` deploys from `main` (`npx wrangler deploy`).
- **UAT** `https://uat.play.vrg.li` deploys from the `uat` branch (`scripts/deploy-uat.sh`). It is a separate Worker with its own tables, accounts, statistics and secrets, shows a yellow UAT strip at the bottom of every page, and tells search engines to stay out.
- New games and changes land on `uat` first. When they hold up, `scripts/promote.sh` fast-forwards `main` to `uat`, deploys production and pushes both branches.
- Sign-in on UAT needs the UAT callback URLs registered at each provider (`https://uat.play.vrg.li/auth/<provider>/callback`); until then that provider's button reads "soon" on UAT only.
- The site used to live at `arcade.vrg.li` (UAT `uat.arcade.vrg.li`). Those old addresses now redirect to `play.vrg.li`, served by the small Worker in `legacy/`, carrying each browser's saved settings across.
