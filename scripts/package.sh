#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dist_dir="$repo_dir/dist"
archive="$dist_dir/pikvm-wispr-bridge.zip"

mkdir -p "$dist_dir"
rm -f "$archive"

cd "$repo_dir"
zip -qr "$archive" \
    manifest.json \
    background.js \
    offscreen.html \
    offscreen.js \
    intercept.js \
    bridge.js \
    languages.js \
    popup.html \
    popup.js \
    README.md \
    LICENSE \
    PRIVACY.md \
    SECURITY.md \
    docs \
    extras \
    scripts/install-macos.sh \
    scripts/uninstall-macos.sh
echo "$archive"
