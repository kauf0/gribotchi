#!/usr/bin/env python3
"""Скачивает и сабсетит шрифты в public/fonts/.

Google Fonts CSS API сам отдаёт сабсеты: для кириллических шрифтов — по
unicode-range, для японского — ровно по переданному ?text=. Пять знаков
グリボッチ весят ~2 КБ вместо 4+ МБ полного CJK-шрифта, поэтому никакого
pyftsubset не нужно — достаточно попросить у Google нужный текст.

Запуск: npm run fonts   (результат коммитится, в рантайме сеть не нужна)
"""

import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "fonts")

# UA современного Chrome — иначе Google отдаст ttf вместо woff2
# Пути внутри fonts.css задаются ОТНОСИТЕЛЬНО самого css, а не от корня домена.
# Абсолютный /fonts/... работает, только пока игра лежит в корне; на itch она
# стоит в подкаталоге вида /html/<id>/, и все шрифты отваливаются в 404 —
# надписи начинают рисоваться системным шрифтом и вылезают за корпус.

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

FONTS = [
    # (имя файла-префикса, query для css2)
    # Handjet — весь текст внутри ЖК-экрана. Нужна кириллица.
    ("handjet", "family=Handjet:wght@400;600;800"),
    # PT Sans Narrow — корпус, шильдик, подписи кнопок.
    ("ptsansnarrow", "family=PT+Sans+Narrow:wght@400;700"),
    # DotGothic16 — только пять знаков названия. Точечно-матричный,
    # тот же язык формы, что и пиксельный экран.
    ("dotgothic16", "family=DotGothic16&text=%E3%82%B0%E3%83%AA%E3%83%9C%E3%83%83%E3%83%81"),
]

# Кириллица и латиница; греческий/вьетнамский нам не нужны.
KEEP_SUBSETS = ("cyrillic", "cyrillic-ext", "latin", "latin-ext")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    css_parts = [
        "/* Сгенерировано scripts/fetch-fonts.py — не править руками. */",
        "/* Handjet, PT Sans Narrow, DotGothic16 — все под OFL. */",
        "",
    ]

    for prefix, query in FONTS:
        css = fetch(f"https://fonts.googleapis.com/css2?{query}&display=swap").decode()

        # Google комментирует каждый @font-face именем сабсета: /* cyrillic */
        blocks = re.split(r"/\*\s*([a-z0-9-]+)\s*\*/", css)
        # blocks = [мусор, имя1, блок1, имя2, блок2, ...]
        pairs = list(zip(blocks[1::2], blocks[2::2])) or [("all", css)]

        n = 0
        for subset, block in pairs:
            # Для японского сабсет один и называется как попало — берём всегда.
            if prefix != "dotgothic16" and subset not in KEEP_SUBSETS:
                continue
            m = re.search(r"url\((https://[^)]+)\)", block)
            if not m:
                continue
            name = f"{prefix}-{n}.woff2"
            n += 1
            data = fetch(m.group(1))
            with open(os.path.join(OUT, name), "wb") as f:
                f.write(data)
            print(f"  {name}  {len(data) / 1024:.1f} КБ  ({subset})")
            css_parts.append(block.replace(m.group(1), f"./{name}").strip())
            css_parts.append("")

    with open(os.path.join(OUT, "fonts.css"), "w") as f:
        f.write("\n".join(css_parts))
    print(f"\n→ {os.path.join(OUT, 'fonts.css')}")


if __name__ == "__main__":
    main()
