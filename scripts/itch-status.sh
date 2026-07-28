#!/usr/bin/env bash
#
# Показывает, доехала ли последняя сборка. itch принимает файл сразу, но
# распаковывает и раскладывает его чуть позже — до галочки игра на странице
# ещё старая.
#
#   npm run itch:status

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && { set -a; . ./.env; set +a; }
: "${ITCH_TARGET:?нет ITCH_TARGET в .env}"
: "${BUTLER_API_KEY:?нет BUTLER_API_KEY в .env}"

export LD_LIBRARY_PATH="$ROOT/.tools/butler${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$ROOT/.tools/butler/butler" status "$ITCH_TARGET"
