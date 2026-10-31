#!/bin/sh
# Deploy the current checkout to uat.arcade.vrg.li. Run from the `uat` branch.
set -e; cd "$(dirname "$0")/.."
[ "$(git branch --show-current)" = uat ] || { echo "switch to the uat branch first"; exit 1; }
./scripts/pack.sh >/dev/null
npx wrangler deploy --env uat
