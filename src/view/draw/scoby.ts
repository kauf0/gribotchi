/**
 * Сам гриб. Порт из reference/kombucha-scenes.jsx:71-117 с двумя правками:
 *
 *  1. Моргание в прототипе было мёртвым кодом — обе ветки рисовали одинаковые
 *     глаза. Здесь закрытый глаз — плоская чёрточка 2×1 вместо точки 1×1,
 *     как и обещает README («моргание короткое, редкое»).
 *  2. Грустный рот собирался хаком с transform: translateY(6px) на одном
 *     уголке. Теперь sad и angry честно опускают оба уголка, а angry сверх
 *     того получает брови и широкие глаза — ровно как в спецификации.
 */

import { Lcd, rnd } from '../lcd'
import type { Mood } from '../screenState'

export type ScobyOpts = {
  cx: number
  top: number
  growth: number
  mood: Mood
  mold: number
  t: number
  /** Дно банки в клетках: ниже него нити не свисают. */
  floor?: number
}

export function drawScoby(lcd: Lcd, o: ScobyOpts): void {
  const { c1, c2, c3 } = lcd.pal
  const { cx, growth, mood, mold, t } = o

  const hw = Math.round(3 + growth * 7) // полуширина диска в клетках
  const th = Math.round(2 + growth * 4) // толщина
  // Плавает по синусоиде; расстроенный гриб плавает вяло.
  const bob = Math.round(Math.sin(t * 1.6) * (mood === 'sad' || mood === 'away' ? 0.2 : 0.6))
  const y0 = o.top + bob

  // Диск: верхняя строка светлее, первая и последняя на клетку уже.
  for (let i = 0; i < th; i++) {
    const shrink = i === 0 || i === th - 1 ? 1 : 0
    const w = (hw - shrink) * 2
    lcd.r(cx - w / 2, y0 + i, w, 1, i === 0 ? c1 : c2)
  }

  // Нити, свисающие в чай. Длина растёт вместе с грибом, но упирается в дно:
  // когда гриб при промывке оседает, нити иначе торчали бы наружу сквозь банку.
  const strandRoom = o.floor === undefined ? Infinity : o.floor - (y0 + th)
  for (let i = 0; i < 5; i++) {
    const sx = cx - hw + 1 + Math.round(rnd(i) * (hw * 2 - 2))
    const len = Math.min(1 + Math.round(rnd(i + 9) * 3 * growth), strandRoom)
    if (len > 0) lcd.r(sx, y0 + th, 1, len, c2, 0.85)
  }

  // Плесень — стыдная часть. Она же индикатор здоровья: mold >= 1 означает смерть.
  const specks = Math.round(mold * 10)
  for (let i = 0; i < specks; i++) {
    const mx = cx - hw + 1 + Math.round(rnd(i * 3.3) * (hw * 2 - 2))
    const my = y0 + Math.round(rnd(i * 7.7) * (th - 1))
    lcd.r(mx, my, 1, 1, c3)
  }

  // Обиженный гриб отворачивается: лица нет, вместо него четыре точки-текстура.
  if (mood === 'away') {
    for (let i = 0; i < 4; i++) lcd.r(cx - hw + 2 + i * 2, y0 + 1, 1, 1, c3, 0.5)
    return
  }

  drawFace(lcd, cx, y0 + Math.max(0, Math.floor(th / 2) - 1), mood, t, c3)
}

function drawFace(lcd: Lcd, cx: number, ey: number, mood: Mood, t: number, ink: string): void {
  if (mood === 'dead') {
    // Крестики вместо глаз.
    for (const ox of [-4, 3]) {
      lcd.r(cx + ox, ey - 1, 1, 1, ink)
      lcd.r(cx + ox + (ox < 0 ? 1 : -1), ey, 1, 1, ink)
      lcd.r(cx + ox, ey + 1, 1, 1, ink)
      lcd.r(cx + ox + (ox < 0 ? 1 : -1), ey - 1, 1, 1, ink)
    }
  } else if (Math.sin(t * 2.1) > 0.98) {
    // Моргание: закрытый глаз шире открытого, поэтому читается на такой сетке.
    lcd.r(cx - 4, ey, 2, 1, ink)
    lcd.r(cx + 3, ey, 2, 1, ink)
  } else {
    const ew = mood === 'angry' ? 2 : 1
    lcd.r(cx - 4, ey, ew, 1, ink)
    lcd.r(cx + 3, ey, ew, 1, ink)
    if (mood === 'angry') {
      lcd.r(cx - 5, ey - 1, 2, 1, ink)
      lcd.r(cx + 4, ey - 1, 2, 1, ink)
    }
  }

  const my = ey + 2
  lcd.r(cx - 2, my, 4, 1, ink)
  if (mood === 'happy') {
    lcd.r(cx - 3, my - 1, 1, 1, ink)
    lcd.r(cx + 2, my - 1, 1, 1, ink)
  } else if (mood === 'sad' || mood === 'angry' || mood === 'dead') {
    lcd.r(cx - 3, my + 1, 1, 1, ink)
    lcd.r(cx + 2, my + 1, 1, 1, ink)
  }
}
