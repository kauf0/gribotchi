#!/usr/bin/env python3
"""Рисует иконки приложения из тех же токенов, что и корпус в игре.

Иконка — сам прибор: корпус, тёмный безель, янтарный экран и гриб на нём.
Значок в 192 пикселя мелкий, поэтому мелочь вроде динамика и подписей
опускается, а экран занимает больше места, чем на настоящем корпусе.

    npm run icons   →   public/icons/*.png
"""

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")

SHELL_HI = (222, 212, 182)
SHELL_BODY = (198, 187, 156)
SHELL_LO = (156, 145, 116)
BEZEL = (59, 54, 39)
ROOM = (16, 17, 15)

LCD = (200, 161, 90)
C1 = (169, 127, 63)
C2 = (106, 74, 32)
C3 = (36, 23, 6)


def draw_icon(size: int, maskable: bool) -> Image.Image:
    """maskable — с полями под безопасную зону Android (лого занимает 60%)."""
    img = Image.new("RGBA", (size, size), ROOM + (255,))
    d = ImageDraw.Draw(img)
    u = size / 100.0

    # Поля: у обычной иконки прибор во весь холст, у maskable — с запасом.
    inset = 20 if maskable else 6
    x0, y0 = inset * u, (inset - 2) * u
    x1, y1 = (100 - inset) * u, (100 - inset + 2) * u

    # Корпус с грубым вертикальным градиентом.
    body_h = int(y1 - y0)
    for i in range(body_h):
        k = i / max(1, body_h - 1)
        if k < 0.42:
            t = k / 0.42
            col = tuple(int(SHELL_HI[c] + (SHELL_BODY[c] - SHELL_HI[c]) * t) for c in range(3))
        else:
            t = (k - 0.42) / 0.58
            col = tuple(int(SHELL_BODY[c] + (SHELL_LO[c] - SHELL_BODY[c]) * t) for c in range(3))
        d.rectangle([x0, y0 + i, x1, y0 + i + 1], fill=col + (255,))

    # Скругление корпуса: срезаем углы маской.
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=int(11 * u), fill=255)
    shell = img.copy()
    img = Image.new("RGBA", (size, size), ROOM + (255,))
    img.paste(shell, (0, 0), mask)
    d = ImageDraw.Draw(img)

    # Безель и экран.
    w = x1 - x0
    bz = [x0 + w * 0.11, y0 + (y1 - y0) * 0.10, x1 - w * 0.11, y0 + (y1 - y0) * 0.62]
    d.rounded_rectangle(bz, radius=int(3 * u), fill=BEZEL + (255,))
    pad = w * 0.045
    scr = [bz[0] + pad, bz[1] + pad, bz[2] - pad, bz[3] - pad]
    d.rectangle(scr, fill=LCD + (255,))

    # Банка и гриб на экране — узнаваемый силуэт даже в 48 пикселей.
    sw, sh = scr[2] - scr[0], scr[3] - scr[1]
    jar = [scr[0] + sw * 0.26, scr[1] + sh * 0.18, scr[2] - sw * 0.26, scr[3] - sh * 0.08]
    d.rectangle(jar, outline=C2 + (255,), width=max(1, int(1.6 * u)))
    d.rectangle([jar[0] + sw * 0.03, jar[1] + sh * 0.12, jar[2] - sw * 0.03, jar[3] - sh * 0.03], fill=C1 + (255,))

    jw = jar[2] - jar[0]
    cap_y = jar[1] + (jar[3] - jar[1]) * 0.30
    cap_h = max(2.0, sh * 0.16)
    d.rectangle([jar[0] + jw * 0.10, cap_y, jar[2] - jw * 0.10, cap_y + cap_h], fill=C2 + (255,))

    # Глаза и улыбка: на мелком размере читаются как лицо.
    eye = max(1.0, sw * 0.045)
    ey = cap_y + cap_h * 0.28
    cx = (jar[0] + jar[2]) / 2
    d.rectangle([cx - sw * 0.13, ey, cx - sw * 0.13 + eye, ey + eye], fill=C3 + (255,))
    d.rectangle([cx + sw * 0.09, ey, cx + sw * 0.09 + eye, ey + eye], fill=C3 + (255,))
    my = ey + eye * 2
    d.rectangle([cx - sw * 0.08, my, cx + sw * 0.08, my + eye], fill=C3 + (255,))

    # Три кнопки.
    by = y0 + (y1 - y0) * 0.76
    br = w * 0.075
    for k in (0.27, 0.5, 0.73):
        bx = x0 + w * k
        colour = (142, 58, 42) if k > 0.7 else SHELL_LO
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=colour + (255,))

    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for size in (192, 512):
        draw_icon(size, maskable=False).save(os.path.join(OUT, f"icon-{size}.png"))
        print(f"  icon-{size}.png")
    draw_icon(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("  icon-maskable-512.png")
    # Фавиконка: тот же рисунок, просто мельче.
    draw_icon(64, maskable=False).save(os.path.join(OUT, "favicon.png"))
    print("  favicon.png")


if __name__ == "__main__":
    main()
