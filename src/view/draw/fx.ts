/** Эфемерные эффекты: сахарный дождь, сердечки, мошки. */

import { Lcd, rnd } from '../lcd'

/** Сахар сыплется сверху в банку. amount 0…1 — какая доля крупинок видна. */
export function drawSugar(lcd: Lcd, t: number, amount: number): void {
  if (amount <= 0) return
  for (let i = 0; i < 12; i++) {
    const phase = (t * 1.5 + rnd(i * 2.1)) % 1
    if (phase > amount) continue
    lcd.r(17 + Math.round(rnd(i) * 16), 9 + phase * 8, 1, 1, lcd.pal.lcd)
  }
}

/** Три сердца из трёх клеток всплывают вверх и гаснут. */
export function drawHearts(lcd: Lcd, progress: number): void {
  if (progress <= 0) return
  const { c3 } = lcd.pal
  for (let i = 0; i < 3; i++) {
    const p = Math.min(1, Math.max(0, progress * 1.6 - i * 0.25))
    if (p <= 0 || p >= 1) continue
    const hx = 22 + i * 3
    const hy = 13 - p * 6
    lcd.r(hx, hy, 1, 1, c3)
    lcd.r(hx + 1, hy - 1, 1, 1, c3)
    lcd.r(hx - 1, hy - 1, 1, 1, c3)
  }
}

/** Мошки кружат над банкой. Появляются, когда за грибом давно не убирали. */
export function drawFlies(lcd: Lcd, t: number): void {
  for (let i = 0; i < 3; i++) {
    const a = t * (1.4 + i * 0.4) + i * 2.1
    lcd.r(25 + Math.cos(a) * (5 + i), 12 + Math.sin(a * 1.7) * 2.5, 1, 1, lcd.pal.c3)
  }
}
