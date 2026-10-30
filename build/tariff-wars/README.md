# tariff-wars — a VRG game

Free to copy, remix and republish under LICENSE.md. The one condition: keep a visible
"A VRG game" credit linking to https://arcade.vrg.li.

- `game/` is the browser client; open `game/index.html` from any static server.
- `relay/` is the multiplayer table server (a Cloudflare Durable Object over plain WebSockets); the client expects it at `/mp-socket`.

