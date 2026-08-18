#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
config_dir="${HOME}/.hammerspoon"
init_file="${config_dir}/init.lua"
spoon_source="${repo_dir}/extras/PiKVMWispr.spoon"
spoon_link="${config_dir}/Spoons/PiKVMWispr.spoon"
start_marker="-- pikvm-wispr-bridge:start"
end_marker="-- pikvm-wispr-bridge:end"

if [[ -f "$init_file" ]] && grep -Fq -- "$start_marker" "$init_file"; then
    backup_file=$(mktemp "${init_file}.backup.XXXXXX")
    temp_file=$(mktemp "${init_file}.tmp.XXXXXX")
    cp "$init_file" "$backup_file"
    awk -v start="$start_marker" -v end="$end_marker" '
        $0 == start { skipping = 1; next }
        $0 == end { skipping = 0; next }
        !skipping { print }
    ' "$init_file" > "$temp_file"
    mv "$temp_file" "$init_file"
    echo "Hammerspoon config backup: $backup_file"
fi

if [[ -L "$spoon_link" ]]; then
    current_target=$(readlink "$spoon_link")
    if [[ "$current_target" == "$spoon_source" ]]; then
        rm "$spoon_link"
    else
        echo "Leaving a PiKVMWispr.spoon link owned by another installation: $spoon_link" >&2
    fi
fi

if command -v hs >/dev/null 2>&1; then
    hs -c 'hs.reload()' >/dev/null 2>&1 || true
fi

echo "PiKVM Wispr macOS helper removed."
