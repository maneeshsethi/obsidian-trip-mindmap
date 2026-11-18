#!/usr/bin/env bash
# Copy the built plugin into a vault: scripts/install.sh <vaultPath>
set -euo pipefail
if [ $# -ne 1 ]; then echo "usage: $0 <vaultPath>" >&2; exit 1; fi
cd "$(dirname "$0")/.."
dest="$1/.obsidian/plugins/trip-mindmap"
mkdir -p "$dest"
cp main.js manifest.json styles.css "$dest/"
echo "installed to $dest"
