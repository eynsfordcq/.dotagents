#!/bin/bash
# Install global pi packages from pi-packages.txt (single source of truth).
#
# pi install takes one source at a time and has no install-from-file flag,
# so loop over the list. Safe to re-run: installing an existing package
# is a no-op.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

xargs -n1 pi install < "$ROOT/pi-packages.txt"

echo "Done."
