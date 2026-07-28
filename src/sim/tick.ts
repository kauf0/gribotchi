/**
 * Ход времени. Чистая функция без обращений к часам и хранилищу — поэтому
 * оффлайн-догон и живая игра идут по одному и тому же коду, а тесты не нуждаются
 * ни в моках, ни в ожидании.
 */

import { clamp01, type GameState } from './state'
import { dayOf } from './derive'
import * as B from './balance'

/** Один шаг длиной dtDays игровых дней. Экспортируется ради тестов. */
export function step(s: GameState, dtDays: number, at: number): GameState {
  if (!s.alive || dtDays <= 0) return s

  const food = clamp01(s.food - B.FOOD_DRAIN_PER_DAY * dtDays)

  const starving = s.food < B.STARVING_BELOW
  const moldRate = B.MOLD_PER_DAY + (starving ? B.MOLD_STARVING_PER_DAY : 0)
  const mold = clamp01(s.mold + moldRate * dtDays)

  // После промывки объект в стрессе и рост стоит.
  const stressed = at < s.stressUntil
  const growing = !stressed && s.food > B.GROWTH_MIN_FOOD && s.mold < B.GROWTH_MAX_MOLD
  // Рост необратим: даже голодая, гриб не уменьшается.
  const growth = growing ? clamp01(s.growth + B.GROWTH_PER_DAY * dtDays) : s.growth

  let resentment = s.resentment
  const offended = s.food < B.RESENT_TRIGGER_FOOD || s.mold > B.RESENT_TRIGGER_MOLD
  if (offended) {
    resentment = clamp01(resentment + B.RESENT_PER_DAY * s.resentFactor * dtDays)
  } else if (s.food > B.RESENT_DECAY_MIN_FOOD && s.mold < B.RESENT_DECAY_MAX_MOLD) {
    resentment = clamp01(resentment - B.RESENT_DECAY_PER_DAY * dtDays)
  }

  const next: GameState = {
    ...s,
    food,
    mold,
    growth,
    resentment,
    lastTick: at,
    // Возраст копится теми же шагами, что и всё остальное, — только так
    // номер дня не может разойтись с параметрами объекта.
    ageMs: s.ageMs + dtDays * B.GAME_DAY_MS,
  }

  // Единственное условие смерти: плесень взяла своё. Одна причинная цепочка
  // голод → плесень → смерть, и она целиком видна игроку точками на грибе.
  if (mold >= 1) {
    next.alive = false
    next.deathAt = at
    next.deathDay = dayOf(next)
  }

  return next
}

/**
 * Догоняет состояние до момента now. Идёт фиксированными шагами, а не одной
 * формулой: только так удаётся поймать МОМЕНТ смерти и записать в журнал
 * правильный день, если игрок отсутствовал неделю.
 */
export function advance(s: GameState, now: number): GameState {
  if (!s.alive) return s

  // Перевод часов назад не откатывает игру: всерьёз с читерством в сингле
  // не воюем, но и ломаться об отрицательное время не должны.
  const elapsed = Math.max(0, now - s.lastTick)
  if (elapsed < B.STEP_MS) return s

  const steps = Math.floor(elapsed / B.STEP_MS)
  const dtDays = B.STEP_MS / B.GAME_DAY_MS

  let cur = s
  for (let i = 0; i < steps && cur.alive; i++) {
    cur = step(cur, dtDays, cur.lastTick + B.STEP_MS)
  }

  // Хвост короче шага остаётся неучтённым и догонится в следующий раз — именно
  // поэтому живая игра и оффлайн-догон дают в точности одинаковый результат.
  // Мёртвому время больше не идёт, курсор фиксируем, чтобы не пересчитывать.
  return cur.alive ? cur : { ...cur, lastTick: now }
}
