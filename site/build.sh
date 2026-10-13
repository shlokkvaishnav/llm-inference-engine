#!/usr/bin/env bash
# Builds the project page into _site/, ready for GitHub Pages. Preview it with:
#   bash site/build.sh && python3 -m http.server --directory _site 8000
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site
cp -R site/. _site/
rm -rf _site/build.sh _site/test
echo "Built _site/"
