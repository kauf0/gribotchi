/**
 * Банка и чай. Геометрия из reference/README.md, раздел «Экран игры».
 *
 * Уровень чая умеет опускаться и подниматься — это визуал кнопки МЫТЬ,
 * которого в прототипе не было вовсе: чай сливается, гриб оседает на дно,
 * банка заливается заново.
 */

import { Lcd, rnd } from '../lcd'

export const JAR = {
  x: 15,
  neckY: 11,
  w: 20,
  bottomY: 34,
  teaX: 16,
  teaTop: 14,
  teaW: 18,
} as const

/** Дно чая совпадает с дном банки. */
export const TEA_FLOOR = JAR.bottomY

export function drawJar(lcd: Lcd): void {
  const { c2 } = lcd.pal
  lcd.r(JAR.x, JAR.neckY, JAR.w, 1, c2) // горловина
  lcd.r(JAR.x, JAR.neckY + 1, 1, 22, c2) // левая стенка
  lcd.r(JAR.x + JAR.w - 1, JAR.neckY + 1, 1, 22, c2) // правая стенка
  lcd.r(JAR.x, JAR.bottomY, JAR.w, 1, c2) // дно
}

/**
 * Чай. drain 0 — банка полна, 1 — пуста.
 * Возвращает верх поверхности в клетках, чтобы гриб мог за ней следовать.
 */
export function drawTea(lcd: Lcd, drain = 0): number {
  const top = JAR.teaTop + drain * (TEA_FLOOR - JAR.teaTop)
  const h = TEA_FLOOR - top
  if (h > 0) lcd.r(JAR.teaX, top, JAR.teaW, h, lcd.pal.c1)
  return top
}

/** Пузырьки всплывают снизу вверх; позиции детерминированы индексом. */
export function drawBubbles(lcd: Lcd, t: number, drain = 0): void {
  const surface = JAR.teaTop + drain * (TEA_FLOOR - JAR.teaTop)
  for (let i = 0; i < 7; i++) {
    const phase = (t * (0.25 + rnd(i) * 0.35) + rnd(i + 3)) % 1
    const y = TEA_FLOOR - 1 - phase * (TEA_FLOOR - 1 - JAR.teaTop)
    if (y < surface) continue // не рисуем пузырьки в воздухе над слитым чаем
    lcd.r(JAR.teaX + 1 + Math.round(rnd(i + 5) * (JAR.teaW - 2)), y, 1, 1, lcd.pal.lcd, 0.5)
  }
}
