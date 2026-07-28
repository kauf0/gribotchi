/** Наложения поверх сцены: тревога, строка сообщения, облачко реплики. */

import { Lcd, SW, SH, U } from '../lcd'
import { ALARM } from '../../content/strings'

const MSG_BAR = { y: 35.6, h: 4.4, size: 20 } as const
const BUBBLE_BOX = { y: 7.5, h: 3, size: 18, border: 2 } as const

/** Верх строки текста, центрированной по коробке высотой h клеток. */
const centerIn = (boxY: number, boxH: number, size: number): number =>
  boxY + boxH / 2 - size / 2 / U

/** Тревога: заливка экрана чернилами и мигающая надпись, 9 Гц. */
export function drawAlarm(lcd: Lcd, t: number): void {
  if (Math.sin(t * 9) <= 0) return
  const { c3 } = lcd.pal
  lcd.r(0, 0, SW, SH, c3, 0.12)
  lcd.txt(25, 0.8, ALARM, 18, c3, { align: 'center' })
}

/** Служебная строка внизу экрана — прибор говорит с владельцем. */
export function drawMessage(lcd: Lcd, msg: string): void {
  const { y, h, size } = MSG_BAR
  lcd.r(0, y, SW, h, lcd.pal.c2)
  lcd.txt(1.5, centerIn(y, h, size), msg, size, lcd.pal.lcd)
}

/** Облачко реплики над банкой — говорит уже сам гриб. */
export function drawBubble(lcd: Lcd, text: string): void {
  const { lcd: bg, c3 } = lcd.pal
  const { y, h, size, border } = BUBBLE_BOX
  const w = lcd.measure(text, size) + 2
  const x = 25 - w / 2
  const b = border / U

  lcd.r(x, y, w, h, bg)
  lcd.r(x, y, w, b, c3)
  lcd.r(x, y + h - b, w, b, c3)
  lcd.r(x, y, b, h, c3)
  lcd.r(x + w - b, y, b, h, c3)
  lcd.txt(25, centerIn(y, h, size), text, size, c3, { align: 'center' })
  lcd.r(24, y + h, 1, 1, c3) // хвостик
}
