/**
 * Текстовые экраны прибора: сводка аварийной службы и извещение о гибели.
 *
 * Оба используют одну раскладку — заголовок, полоса строк с прокруткой,
 * подсказка по кнопкам внизу, — потому что это один и тот же бланк,
 * заполненный по-разному.
 */

import { Lcd, SW, SH } from '../lcd'
import type { Report, ScreenState } from '../screenState'
import { drawScoby } from '../draw/scoby'

const HEAD_Y = 1.6
const FIRST_LINE_Y = 6.6
const LINE_H = 2.9
/** Сколько строк помещается между заголовком и подсказкой. */
export const VISIBLE_LINES = 10
const HINT_Y = 35.6
const HINT_H = 4.4

function frame(lcd: Lcd, r: Report): void {
  const { c1, c2, c3, lcd: bg } = lcd.pal

  lcd.txt(2, HEAD_Y, r.title, 20, c3)
  lcd.r(0, 5.4, SW, 0.4, c1)

  const from = Math.max(0, Math.min(r.scroll, Math.max(0, r.lines.length - VISIBLE_LINES)))
  const shown = r.lines.slice(from, from + VISIBLE_LINES)
  shown.forEach((line, i) => {
    lcd.txt(2, FIRST_LINE_Y + i * LINE_H, line, 17, c2)
  })

  // Указатели, что список длиннее экрана.
  if (from > 0) lcd.txt(47, FIRST_LINE_Y, '↑', 17, c3)
  if (from + VISIBLE_LINES < r.lines.length) {
    lcd.txt(47, FIRST_LINE_Y + (VISIBLE_LINES - 1) * LINE_H, '↓', 17, c3)
  }

  lcd.r(0, HINT_Y, SW, HINT_H, c2)
  lcd.txt(25, HINT_Y + HINT_H / 2 - 20 / 2 / 6, r.hint, 20, bg, { align: 'center' })
}

export function drawReport(lcd: Lcd, s: ScreenState): void {
  lcd.clear()
  if (s.report) frame(lcd, s.report)
}

/** Извещение о гибели: тот же бланк, но с мёртвым объектом на видном месте. */
export function drawDeath(lcd: Lcd, s: ScreenState): void {
  lcd.clear()
  if (!s.report) return

  frame(lcd, s.report)

  // Гриб — под текстом по центру: справа он налезал бы на строки бланка.
  drawScoby(lcd, {
    cx: 25,
    top: 26,
    growth: Math.min(s.growth, 0.3),
    mood: 'dead',
    mold: 0,
    t: 0,
    floor: SH,
  })
}
