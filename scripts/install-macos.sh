#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
hammerspoon_app="${HAMMERSPOON_APP:-/Applications/Hammerspoon.app}"
config_dir="${HOME}/.hammerspoon"
spoons_dir="${config_dir}/Spoons"
init_file="${config_dir}/init.lua"
spoon_source="${repo_dir}/extras/PiKVMWispr.spoon"
spoon_link="${spoons_dir}/PiKVMWispr.spoon"
start_marker="-- pikvm-wispr-bridge:start"

if [[ ! -d "$hammerspoon_app" ]]; then
    echo "Hammerspoon is required. Install it from https://www.hammerspoon.org/ and run this installer again." >&2
    exit 1
fi

if [[ ! -d "$spoon_source" ]]; then
    echo "PiKVMWispr.spoon was not found at: $spoon_source" >&2
    exit 1
fi

mkdir -p "$spoons_dir"

if [[ -L "$spoon_link" ]]; then
    current_target=$(readlink "$spoon_link")
    if [[ "$current_target" != "$spoon_source" ]]; then
        echo "Refusing to replace an existing PiKVMWispr.spoon link: $spoon_link" >&2
        exit 1
    fi
elif [[ -e "$spoon_link" ]]; then
    echo "Refusing to replace an existing path: $spoon_link" >&2
    exit 1
else
    ln -s "$spoon_source" "$spoon_link"
fi

if [[ ! -e "$init_file" ]]; then
    : > "$init_file"
fi

if ! grep -Fq -- "$start_marker" "$init_file"; then
    backup_file=$(mktemp "${init_file}.backup.XXXXXX")
    cp "$init_file" "$backup_file"
    printf '\n%s\n' '-- pikvm-wispr-bridge:start
hs.loadSpoon("PiKVMWispr")
spoon.PiKVMWispr:start()
-- pikvm-wispr-bridge:end' >> "$init_file"
    echo "Hammerspoon config backup: $backup_file"
fi

if command -v open >/dev/null 2>&1; then
    open -a "$hammerspoon_app" >/dev/null 2>&1 || true
fi

if command -v hs >/dev/null 2>&1 && hs -c 'hs.reload()' >/dev/null 2>&1; then
    echo "Hammerspoon reloaded."
else
    echo "Helper installed. Use Hammerspoon > Reload Config if it was already running."
fi

echo "PiKVM Wispr macOS helper installed."
