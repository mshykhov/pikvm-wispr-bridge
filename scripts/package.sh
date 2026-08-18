#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dist_dir="$repo_dir/dist"
archive="$dist_dir/pikvm-wispr-bridge.zip"

mkdir -p "$dist_dir"
rm -f "$archive"

cd "$repo_dir"
zip -q "$archive" manifest.json intercept.js bridge.js
echo "$archive"
