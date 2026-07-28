/**
 * Экран запуска: название, призыв и мигающая подсказка на кнопку.
 *
 * Он существует не ради красоты. Браузеры запрещают звук до первого
 * взаимодействия со страницей, и без этого экрана игра открывалась бы молча,
 * а игрок гадал бы, сломано ли что-то. Здесь же нажатие — часть сюжета: прибор
 * не работает, пока его не включат, и ровно это нажатие и поднимает звук.
 */

import { Lcd, SW } from '../lcd'
import type { ScreenState } from '../screenState'
import { BRAND } from '../../content/strings'

const HINT_BAR = { y: 35.6, h: 4.4, size: 20 } as const

export function drawStart(lcd: Lcd, s: ScreenState): void {
  lcd.clear()
  const card = s.start
  if (!card) return

  const { c1, c2, c3, lcd: bg } = lcd.pal

  lcd.txt(25, 6, BRAND.ru, 30, c3, { align: 'center', tracking: 2 })
  lcd.txt(25, 11.5, BRAND.jp, 16, c2, { align: 'center', tracking: 3, jp: true })

  lcd.r(8, 16.5, SW - 16, 0.4, c1)

  lcd.txt(25, 19, card.action, 20, c3, { align: 'center' })
  if (card.note) lcd.txt(25, 23.5, card.note, 17, c2, { align: 'center' })

  // Подсказка мигает: на погасшем приборе это единственное, что просит внимания.
  lcd.r(0, HINT_BAR.y, SW, HINT_BAR.h, c2)
  if (Math.sin(s.t * 4) > -0.4) {
    const y = HINT_BAR.y + HINT_BAR.h / 2 - HINT_BAR.size / 2 / 6
    lcd.txt(25, y, card.hint, HINT_BAR.size, bg, { align: 'center' })
  }
}
