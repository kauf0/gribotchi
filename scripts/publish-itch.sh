#!/usr/bin/env bash
#
# Заливает собранную игру на itch.io.
#
# Порядок проверок строгий и прерывается на первой ошибке: бета — это то, что
# игроки увидят вместо игры, и уехать она должна работающей. Тесты и сборка
# идут ДО заливки, а не после.
#
#   npm run publish:itch            обычная заливка
#   npm run publish:itch -- --dry   всё, кроме самой отправки
#
# Требует .env с BUTLER_API_KEY и ITCH_TARGET (см. сам файл .env).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUTLER_DIR="$ROOT/.tools/butler"
BUTLER="$BUTLER_DIR/butler"
CHANNEL="html5"
DRY=""
[ "${1:-}" = "--dry" ] && DRY="1"

die() { echo "✗ $*" >&2; exit 1; }

# ── что нужно на входе ───────────────────────────────────────────
# Значения из окружения важнее файла: так можно разово залить в другую цель
# (ITCH_TARGET=... npm run publish:itch) и так же работает CI, где .env нет.
ENV_TARGET="${ITCH_TARGET:-}"
ENV_KEY="${BUTLER_API_KEY:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

[ -n "$ENV_TARGET" ] && ITCH_TARGET="$ENV_TARGET"
[ -n "$ENV_KEY" ] && BUTLER_API_KEY="$ENV_KEY"

[ -n "${BUTLER_API_KEY:-}" ] || die "в .env нет BUTLER_API_KEY (itch.io/user/settings/api-keys)."
[ -n "${ITCH_TARGET:-}" ] || die "в .env нет ITCH_TARGET — это <логин>/<адрес-страницы> с itch.io.
  Страницу нужно создать руками на itch.io/game/new: API их заводить не умеет."

# butler ждёт «логин/игра», но со страницы естественнее скопировать полный
# адрес. Приводим https://логин.itch.io/игра к нужному виду сами, вместо того
# чтобы ронять заливку с невнятной ошибкой.
case "$ITCH_TARGET" in
  http*://*.itch.io/*)
    rest="${ITCH_TARGET#*://}"
    user="${rest%%.itch.io/*}"
    game="${rest##*/}"
    ITCH_TARGET="$user/$game"
    echo "  адрес приведён к виду $ITCH_TARGET"
    ;;
esac

case "$ITCH_TARGET" in
  */*/*) die "в ITCH_TARGET лишние косые: «$ITCH_TARGET». Нужно <логин>/<адрес-игры>." ;;
  */*) ;;
  *) die "ITCH_TARGET должен выглядеть как <логин>/<адрес-игры>, а не «$ITCH_TARGET»." ;;
esac

[ -x "$BUTLER" ] || die "butler не установлен. Запустите ./scripts/get-butler.sh"
export LD_LIBRARY_PATH="$BUTLER_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

VERSION="$(node -p "require('./package.json').version")"

echo "▸ Проверка типов"
npm run --silent typecheck

echo "▸ Тесты"
npm run --silent test

echo "▸ Сборка"
npm run --silent build

# index.html обязан лежать в корне: itch запускает именно его.
[ -f dist/index.html ] || die "в dist нет index.html — itch такую сборку не запустит."

SIZE="$(du -sh dist | cut -f1)"
echo "▸ Готово к отправке: $ITCH_TARGET:$CHANNEL, версия $VERSION, $SIZE"

if [ -n "$DRY" ]; then
  echo "  (--dry: отправка пропущена)"
  exit 0
fi

"$BUTLER" push dist "$ITCH_TARGET:$CHANNEL" --userversion "$VERSION"

echo
echo "✓ Загружено. Страница: https://$(echo "$ITCH_TARGET" | tr / '\n' | head -1).itch.io/$(echo "$ITCH_TARGET" | cut -d/ -f2)"
echo "  Обработку сборки видно так:  npm run itch:status"
