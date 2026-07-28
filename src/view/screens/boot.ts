/** Загрузочный экран: построчная выдача, как у настоящего прибора при включении. */

import { Lcd } from '../lcd'
import type { ScreenState } from '../screenState'
import { BOOT_LINES } from '../../content/strings'

const X = 4

export function drawBoot(lcd: Lcd, s: ScreenState): void {
  lcd.clear()
  const { c2, c3 } = lcd.pal
  const shown = Math.floor((s.boot ?? 0) * BOOT_LINES.length + 0.001)

  for (let i = 0; i < Math.min(shown, BOOT_LINES.length); i++) {
    const l = BOOT_LINES[i]
    lcd.txt(X, l.y, l.text, l.size, l.ink ? c3 : c2, { jp: l.jp })
  }

  // Курсор после последней строки — прибор ждёт, пока объект проснётся.
  if (shown >= BOOT_LINES.length) {
    const last = BOOT_LINES[BOOT_LINES.length - 1]
    const w = lcd.measure(last.text, last.size)
    lcd.r(X + w + 0.5, last.y + 0.3, 1, 1.6, c3, Math.sin(s.t * 12) > 0 ? 1 : 0)
  }
}
