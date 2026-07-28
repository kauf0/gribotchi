#!/usr/bin/env bash
#
# Кладёт butler — официальную утилиту загрузки itch.io — внутрь проекта.
#
# Намеренно не в систему: инструмент нужен одному этому проекту, а .tools/
# лежит в .gitignore и сносится одной командой `rm -rf .tools`.
#
# Источника два. Канонический — broth.itch.ovh, оттуда всегда приезжает свежая
# сборка. Если он недоступен (в некоторых сетях его домен просто не резолвится),
# берём релиз из github.com/itchio/butler — тот же официальный проект, только
# сборки там выкладывают не для каждой версии, поэтому ищем последний релиз
# с приложенными файлами.
#
#   ./scripts/get-butler.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.tools/butler"
BROTH="https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default"

if [ -x "$DEST/butler" ]; then
  echo "butler уже на месте: $(LD_LIBRARY_PATH="$DEST" "$DEST/butler" -V 2>&1 | head -1)"
  exit 0
fi

mkdir -p "$DEST"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Пробую broth.itch.ovh…"
if curl -sSfL --max-time 60 -o "$tmp/butler.zip" "$BROTH" 2>/dev/null; then
  echo "  получено с broth."
else
  echo "  недоступен, беру релиз с github.com/itchio/butler."
  url="$(curl -sSfL --max-time 30 https://api.github.com/repos/itchio/butler/releases \
    | python3 -c "
import json, sys
for release in json.load(sys.stdin):
    for asset in release.get('assets', []):
        if asset['name'] == 'butler-linux-amd64.zip':
            print(asset['browser_download_url'])
            sys.exit(0)
sys.exit('в релизах нет сборки под linux-amd64')
")"
  echo "  ${url##*/tag/}"
  curl -sSfL --max-time 120 -o "$tmp/butler.zip" "$url"
fi

unzip -q -o "$tmp/butler.zip" -d "$tmp/out"

# broth кладёт файлы в корень архива, GitHub — в подпапку linux-amd64.
# Находим бинарник, где бы он ни лежал, и раскладываем всё рядом с ним:
# butler ищет libc7zip.so в той же папке.
binary="$(find "$tmp/out" -name butler -type f | head -1)"
[ -n "$binary" ] || { echo "в архиве нет butler" >&2; exit 1; }
cp -a "$(dirname "$binary")"/. "$DEST/"
chmod +x "$DEST/butler"

# butler таскает с собой libc7zip — без неё он не стартует, поэтому и запускать
# его надо с этой папкой в LD_LIBRARY_PATH. Это делает publish-itch.sh.
echo "Готово: $(LD_LIBRARY_PATH="$DEST" "$DEST/butler" -V 2>&1 | head -1)"
