/**
 * Единственный шов между симуляцией и картинкой: GameState → ScreenState.
 *
 * Ниже по течению рендерер уже ничего не знает ни о времени, ни о сохранениях;
 * выше по течению симуляция ничего не знает о пикселях. Ровно на этот же тип
 * будет собирать кадр таймлайн промо-ролика, когда дойдёт до аттракт-режима.
 */

import type { GameState } from '../sim/state'
import { alarmOf, dayOf, fliesOf, moodOf, scobyTopOf, canBottle, overdueDays } from '../sim/derive'
import { MSG, overdue as overdueText } from '../content/strings'
import type { ScreenState } from './screenState'
import type { FxSnapshot } from './fx'
import * as B from '../sim/balance'

/**
 * Что прибор пишет, когда сказать нечего: сухая сводка по самому острому.
 * Порядок важен — сначала то, от чего гриб умрёт раньше.
 */
function idleMessage(s: GameState): string {
  if (!s.alive) return MSG.died
  if (s.food < B.ALARM_FOOD_BELOW) {
    const days = overdueDays(s)
    return days > 0 ? overdueText(days) : MSG.hungry
  }
  // Розлив обнуляет среду, поэтому он же и ответ на плесень; голод остаётся
  // выше — он убивает быстрее, чем портится партия.
  if (canBottle(s)) return MSG.bottleReady
  if (s.mold > B.ANGRY_MOLD_ABOVE) return MSG.moldy
  if (s.resentment > B.AWAY_ABOVE) return MSG.turnedAway
  if (s.food < B.SAD_FOOD_BELOW) return MSG.hungry
  return MSG.waiting
}

export function project(s: GameState, t: number, fx: FxSnapshot): ScreenState {
  const mood = moodOf(s)
  return {
    mode: 'game',
    t,
    day: dayOf(s),
    food: s.food,
    growth: s.growth,
    mold: s.mold,
    mood,
    scobyTop: scobyTopOf(s),
    alarm: alarmOf(s),
    flies: fliesOf(s),
    sugar: fx.sugar,
    hearts: fx.hearts,
    washing: fx.washing,
    msg: fx.msg ?? idleMessage(s),
    bubble: fx.bubble,
  }
}
