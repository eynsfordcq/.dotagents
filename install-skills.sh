#!/usr/bin/env bash
# Install first-party + external skills from install-skills.json via `npx skills add`.
# Extra args are forwarded (e.g. -g -y -a claude-code).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$ROOT/install-skills.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required" >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "error: missing $CONFIG" >&2
  exit 1
fi

cd "$ROOT"

count="$(jq '.sources | length' "$CONFIG")"
if [[ "$count" -eq 0 ]]; then
  echo "No sources in install-skills.json"
  exit 0
fi

for i in $(seq 0 $((count - 1))); do
  repo="$(jq -r ".sources[$i].repo" "$CONFIG")"
  skill_count="$(jq ".sources[$i].skills | length" "$CONFIG")"

  skill_args=()
  for j in $(seq 0 $((skill_count - 1))); do
    skill="$(jq -r ".sources[$i].skills[$j]" "$CONFIG")"
    skill_args+=(--skill "$skill")
  done

  echo "→ npx skills add $repo ${skill_args[*]} $*"
  npx --yes skills add "$repo" "${skill_args[@]}" "$@"
done

echo "Done."
