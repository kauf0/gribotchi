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

ENV_KEY="${BUTLER_API_KEY:-}"
[ -f .env ] && { set -a; . ./.env; set +a; }
[ -n "$ENV_KEY" ] && BUTLER_API_KEY="$ENV_KEY"

ITCH_TARGET="${ITCH_TARGET:-$(node -p "require('./package.json').itch?.target ?? ''")}"
: "${ITCH_TARGET:?нет itch.target в package.json}"
: "${BUTLER_API_KEY:?нет ключа: положите BUTLER_API_KEY в .env или в окружение}"

export LD_LIBRARY_PATH="$ROOT/.tools/butler${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$ROOT/.tools/butler/butler" status "$ITCH_TARGET"
