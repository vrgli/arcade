#!/bin/sh
# Promote what is on UAT to production: fast-forward main to uat, deploy, push both.
set -e; cd "$(dirname "$0")/.."
git checkout main && git merge --ff-only uat && npx wrangler deploy && git push origin main uat
git checkout uat
