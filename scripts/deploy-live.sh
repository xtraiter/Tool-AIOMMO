#!/usr/bin/env bash
# Build without interrupting the live site: build into .next-new, swap it in atomically, restart pm2.
#   bash scripts/deploy-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .next-new
NEXT_DIST_DIR=.next-new npm run build
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-new .next
pm2 restart web_toolAIOMMO --update-env >/dev/null
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8092/ || true)
if [ "$code" != "200" ]; then
  echo "!! homepage returned $code — rolling back to previous build"
  rm -rf .next && mv .next-old .next && pm2 restart web_toolAIOMMO >/dev/null
  exit 1
fi
rm -rf .next-old
echo "deployed OK (homepage $code)"
