#!/bin/bash
# download-images.sh — Deprecated thin wrapper around download-images.py.
#
# The old bash implementation was sequential and had several bugs (heredoc
# variable substitution, hardcoded image/png Content-Type, mount-only auth).
# It has been replaced by a parallel Python implementation. This wrapper
# translates the old flag set so any existing callers keep working.
#
# Prefer calling download-images.py directly:
#   python3 download-images.py --input ... --owner ... --repo ... --branch ...

set -e

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
exec python3 "${DIR}/download-images.py" "$@"
