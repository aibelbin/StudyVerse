#!/bin/sh
# Publishes the built client (npm run build) to costudy-app.vercel.app; the game server stays on wolf.
set -e
cd "$(dirname "$0")/.."
rm -rf .vercel-site/assets && mkdir -p .vercel-site && cp -R dist/client/. .vercel-site/
cd .vercel-site
[ -d .vercel ] || vercel link --yes --project costudy
url=$(vercel deploy --prod --yes 2>/dev/null | grep -oE "https://[^ ]+vercel.app" | tail -1)
vercel alias set "$url" costudy-app.vercel.app
