#!/usr/bin/env python3
"""Снимает экраны игры headless-браузером для сверки с reference/screens/.

Панель отладки удобна руками, но снимок должен получаться без единого клика,
поэтому состояние задаётся параметрами URL (см. src/debug/params.ts).

    python3 scripts/shot.py znakomstvo "manual&food=.8&growth=.12&mood=happy&bubble=КОРМИ"
    python3 scripts/shot.py --all      # все опорные кадры разом

Требует запущенного `npm run dev`. Результат — /tmp/gribochi-shots/<имя>.png
"""

import os
import subprocess
import sys
import urllib.parse

BASE = os.environ.get("GRIBOCHI_URL", "http://127.0.0.1:5173/")
OUT = "/tmp/gribochi-shots"
# 1100×1360 даёт целый множитель 2 — экран крупный и по-прежнему чёткий.
WINDOW = os.environ.get("GRIBOCHI_WINDOW", "1100,1360")

# Опорные кадры: имя → параметры. Сверяются с одноимёнными reference/screens/.
SCENES = {
    "00-zapusk": "",
    "01-zagruzka": "t=1.4",
    "02-privet": "t=3.2&msg=ЗДРАВСТВУЙТЕ.&bubble=",
    "03-znakomstvo": "manual&day=1&food=.8&growth=.12&mood=happy&bubble=КОРМИ&msg=ОБЪЕКТ ЖИВ. ПОКА ЧТО.",
    "04-kormlenie": "manual&day=3&food=1&growth=.30&mood=happy&sugar=1&hearts=.6&bubble="
    "&msg=СЫТ. НО ЭТО НЕНАДОЛГО.",
    "05-zabyli": "manual&day=17&food=0&growth=.24&mold=.5&mood=sad&scobyTop=18&bubble="
    "&msg=КОРМЛЕНИЕ ПРОСРОЧЕНО НА 11 ДН.",
    "06-obida": "manual&day=17&food=.05&growth=.26&mold=.8&mood=away&flies=1&alarm=1&scobyTop=18"
    "&bubble=ОН ВСЁ ПОМНИТ&msg=ОБЪЕКТ ОТВЕРНУЛСЯ. ОБЪЕКТ ЖДЁТ.",
    "07-spasenie": "manual&day=18&food=.6&growth=.30&mold=.3&mood=away&sugar=1&scobyTop=16&bubble="
    "&msg=ЧАЙ! САХАР! ЧТО УГОДНО!",
    "08-final-rost": "manual&day=28&food=.9&growth=.7&mood=happy&scobyTop=14&bubble="
    "&msg=ОБЪЕКТ РАСТЁТ.",
    "09-final-vzroslyi": "manual&day=30&food=.9&growth=1&mood=happy&scobyTop=14&bubble="
    "&msg=ОБЪЕКТ БОЛЬШЕ ВЛАДЕЛЬЦА.",
    "10-smert": "manual&day=22&food=0&growth=.4&mold=1&mood=dead&flies=1&scobyTop=19&bubble="
    "&msg=ОБЪЕКТ ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ.",
    "11-promyvka": "manual&day=9&food=.5&growth=.35&mold=.1&mood=ok&washing=.5&bubble="
    "&msg=СМЕНА СРЕДЫ. НЕ МЕШАЙТЕ.",
    # Экраны сводки и гибели собираются НАСТОЯЩЕЙ симуляцией: sim.* правит
    # состояние объекта, а не подменяет картинку.
    "14-rozliv": "t=4&sim.growth=1&sim.food=.8",
    "12-svodka": "t=4&sim.food=.12&sim.mold=.55&sim.growth=.4&sim.resentment=.7"
    "&sim.generation=3&sim.journal=4&open=report",
    "13-izveshchenie": "t=4&sim.dead&sim.growth=.7&sim.generation=2&sim.journal=2",
    # Бланк подачи. Открытый параметром, он не закрывается сам через шесть
    # секунд — иначе снять его было бы нечем.
    "14-podacha": "t=4&sim.food=.35&sim.growth=.4&open=pour",
    # Происшествие. Какое именно — решает обстановка в банке, поэтому задаём
    # плесень: с ней прибор докладывает про мошку.
    "15-proisshestvie": "t=4&sim.mold=.6&sim.food=.4&sim.growth=.4&open=incident",
}


def encode(query: str) -> str:
    parts = []
    for chunk in query.split("&"):
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            parts.append(f"{k}={urllib.parse.quote(v)}")
        else:
            parts.append(chunk)
    return "&".join(parts)


def shot(name: str, query: str) -> str:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.png")
    url = f"{BASE}?{encode(query)}"
    subprocess.run(
        [
            "google-chrome",
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            # Снимки немые: звук в динамики машины тут ни к чему.
            "--mute-audio",
            "--hide-scrollbars",
            "--virtual-time-budget=4000",
            f"--window-size={WINDOW}",
            f"--screenshot={path}",
            url,
        ],
        check=True,
        capture_output=True,
    )
    print(f"{name}  →  {path}")
    return path


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "--all":
        for name, query in SCENES.items():
            shot(name, query)
        return
    if len(sys.argv) == 3:
        shot(sys.argv[1], sys.argv[2])
        return
    if len(sys.argv) == 2 and sys.argv[1] in SCENES:
        shot(sys.argv[1], SCENES[sys.argv[1]])
        return
    print(__doc__)
    print("Известные кадры:", ", ".join(SCENES))
    sys.exit(1)


if __name__ == "__main__":
    main()
