#!/usr/bin/env bash
# Seclusa Lockdown — run this app's own tests.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ seclusa lockdown tests @ $PWD"

node --test test/*.mjs

missing=0
while read -r asset; do
  if [ ! -f "$asset" ]; then
    echo "FAIL: sw.js precaches $asset, which does not exist"
    missing=1
  fi
done < <(grep -oE '"\./[^"]+"' sw.js | tr -d '"' | sed 's|^\./||; s|?.*$||' | sort -u)

if [ "$missing" -eq 0 ]; then
  echo "PASS: every precached file exists"
else
  echo "FAIL: the precache list names files that are not there"
  exit 1
fi

echo "→ seclusa lockdown tests passed"
