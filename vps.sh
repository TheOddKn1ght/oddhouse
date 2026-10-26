#!/usr/bin/env bash
# Convenience entry point; the installed self-updating helper is scripts/vps.sh.
set -Eeuo pipefail
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/scripts/vps.sh" "$@"
