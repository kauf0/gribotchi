/** Основной игровой экран: HUD, банка, гриб, эффекты, сообщения. */

import { Lcd } from '../lcd'
import type { ScreenState } from '../screenState'
import { drawHud } from '../draw/hud'
import { drawJar, drawTea, drawBubbles, JAR, TEA_FLOOR } from '../draw/jar'
import { drawScoby } from '../draw/scoby'
import { drawSugar, drawHearts, drawFlies } from '../draw/fx'
import { drawAlarm, drawMessage, drawBubble } from '../draw/overlays'

export const DEFAULT_SCOBY_TOP = 15

/**
 * Промывка: 0…0.5 чай сливается, 0.5…1 заливается обратно.
 * Возвращает 0 (банка полна) … 1 (пуста).
 */
function drainFromWashing(washing: number | undefined): number {
  if (!washing) return 0
  return washing < 0.5 ? washing / 0.5 : 1 - (washing - 0.5) / 0.5
}

export function drawGame(lcd: Lcd, s: ScreenState): void {
  lcd.clear()
  drawHud(lcd, s.food, s.day)

  const drain = drainFromWashing(s.washing)

  drawJar(lcd)
  drawTea(lcd, drain)
  drawBubbles(lcd, s.t, drain)

  // Пока чай сливается, гриб оседает на дно банки и снова всплывает при заливе.
  const thickness = Math.round(2 + s.growth * 4)
  const floating = s.scobyTop ?? DEFAULT_SCOBY_TOP
  const resting = TEA_FLOOR - thickness
  const top = floating + (resting - floating) * drain

  drawScoby(lcd, {
    cx: 25,
    top,
    growth: s.growth,
    mood: s.mood,
    mold: s.mold,
    t: s.t,
    floor: TEA_FLOOR,
    traits: s.traits,
    // Гриб растёт внутри банки: за стекло не выходит даже самый буйный штамм.
    maxHalfWidth: JAR.teaW / 2,
  })

  drawSugar(lcd, s.t, s.sugar ?? 0)
  drawHearts(lcd, s.hearts ?? 0)
  if (s.flies) drawFlies(lcd, s.t)
  if (s.alarm) drawAlarm(lcd, s.t)
  if (s.msg) drawMessage(lcd, s.msg)
  if (s.bubble) drawBubble(lcd, s.bubble)
}
