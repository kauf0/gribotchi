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
# Адрес игры и канал берутся из package.json → itch: это не секреты, а свойства
# проекта, и на новой машине настраивать их не надо. Нужен только ключ — из
# .env, из окружения или из ~/.config/itch после `butler login`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUTLER_DIR="$ROOT/.tools/butler"
BUTLER="$BUTLER_DIR/butler"
DRY=""
[ "${1:-}" = "--dry" ] && DRY="1"

die() { echo "✗ $*" >&2; exit 1; }

# ── что нужно на входе ───────────────────────────────────────────
# Значение из окружения важнее файла: так работает CI, где .env нет вовсе,
# и так же можно разово подставить ключ из менеджера паролей.
ENV_KEY="${BUTLER_API_KEY:-}"
ENV_TARGET="${ITCH_TARGET:-}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

[ -n "$ENV_KEY" ] && BUTLER_API_KEY="$ENV_KEY"

read_pkg() { node -p "require('./package.json').itch?.$1 ?? ''"; }
ITCH_TARGET="${ENV_TARGET:-$(read_pkg target)}"
CHANNEL="$(read_pkg channel)"
CHANNEL="${CHANNEL:-html5}"

[ -n "${BUTLER_API_KEY:-}" ] || die "нет ключа. Положите BUTLER_API_KEY в .env, передайте
  в окружении или выполните один раз: .tools/butler/butler login"
[ -n "$ITCH_TARGET" ] || die "в package.json нет itch.target — это <логин>/<адрес-страницы>.
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
