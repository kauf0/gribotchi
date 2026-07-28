/** Верхняя панель: шкала сытости, номер дня, разделитель. */

import { Lcd, SW } from '../lcd'

export function drawHud(lcd: Lcd, food: number, day: number): void {
  const { c1, c2, c3 } = lcd.pal
  lcd.txt(2, 1.6, 'СЫТОСТЬ', 17, c2)

  const filled = Math.round(food * 10)
  for (let i = 0; i < 10; i++) {
    lcd.r(2 + i * 2, 4, 1.6, 2, i < filled ? c3 : c1)
  }

  lcd.txt(33, 1.6, `ДЕНЬ ${day}`, 17, c2)
  lcd.r(0, 7, SW, 0.4, c1)
}
