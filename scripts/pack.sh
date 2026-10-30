#!/bin/sh
# Build the free downloads served at /source: one zip per game, each with the licence
# and a README, plus the relay source for Tariff Wars so a fork can run online too.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/source build && rm -rf build/*
for g in tariff-wars wallop; do
  mkdir -p build/$g && cp -r public/play/$g build/$g/game && cp LICENSE.md build/$g/
  [ "$g" = tariff-wars ] && mkdir -p build/$g/relay && cp src/room.js src/presina-engine.js src/presina-host.js build/$g/relay/
  cat > build/$g/README.md <<R
# $g — a VRG game

Free to copy, remix and republish under LICENSE.md. The one condition: keep a visible
"A VRG game" credit linking to https://arcade.vrg.li.

- \`game/\` is the browser client; open \`game/index.html\` from any static server.
$( [ "$g" = tariff-wars ] && echo '- `relay/` is the multiplayer table server (a Cloudflare Durable Object over plain WebSockets); the client expects it at `/mp-socket`.' )
$( [ "$g" = wallop ] && echo '- The price feed is a seeded simulation (`game/js/engine.js`); a real one needs a server that settles rounds on a live BTC price.' )
R
  (cd build/$g && zip -qr ../../public/source/$g.zip .)
done
ls -la public/source
