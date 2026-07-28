/**
 * Три кнопки и смена поколений. Всё чистое: (состояние, время) → новое
 * состояние плюс реплика прибора и эффект для экрана.
 */

import { clamp01, createState, type GameState, type JournalEntry } from './state'
import { canBottle, canClean, canFeed, dayOf, diagnose } from './derive'
import { MSG } from '../content/strings'
import * as B from './balance'

export type Effect = 'sugar' | 'hearts' | 'wash' | 'none'

export type ActionResult = {
  state: GameState
  /** Что прибор напишет в служебной строке. */
  msg: string
  effect: Effect
  /** Многострочный ответ аварийной службы — для экрана СОС. */
  report?: string[]
  /** Действие не выполнено: кулдаун, объект мёртв и тому подобное. */
  rejected?: boolean
}

const note = (s: GameState, now: number, text: string): JournalEntry[] => [
  ...s.journal,
  { at: now, generation: s.generation, day: dayOf(s), text },
]

/** ЧАЙ — кормление. Оно же извинение: немного гасит обиду сразу. */
export function feed(s: GameState, now: number): ActionResult {
  if (!s.alive) return { state: s, msg: MSG.dead, effect: 'none', rejected: true }
  if (!canFeed(s, now)) return { state: s, msg: MSG.cooldown, effect: 'none', rejected: true }

  const overfed = s.food > B.OVERFEED_ABOVE
  const state: GameState = {
    ...s,
    food: clamp01(s.food + B.FEED_AMOUNT),
    mold: overfed ? clamp01(s.mold + B.OVERFEED_MOLD) : s.mold,
    resentment: clamp01(s.resentment - B.FEED_FORGIVE),
    lastFedAt: now,
    fedAtAge: s.ageMs,
  }

  if (overfed) return { state, msg: MSG.overfed, effect: 'sugar' }
  // Пока обида высока, благодарности не будет — сердечки только помирившемуся.
  const warm = state.resentment < B.HAPPY_RESENT_BELOW
  return {
    state,
    msg: warm ? MSG.fed : MSG.forgiven,
    effect: warm ? 'hearts' : 'sugar',
  }
}

/** МЫТЬ — смена среды: плесень уходит, но объект теряет питание и переживает. */
export function clean(s: GameState, now: number): ActionResult {
  if (!s.alive) return { state: s, msg: MSG.dead, effect: 'none', rejected: true }
  if (!canClean(s, now)) return { state: s, msg: MSG.cleanCooldown, effect: 'none', rejected: true }

  const state: GameState = {
    ...s,
    mold: clamp01(s.mold - B.CLEAN_MOLD),
    food: clamp01(s.food - B.CLEAN_FOOD_COST),
    lastCleanedAt: now,
    stressUntil: now + B.CLEAN_STRESS_MS,
  }
  return { state, msg: MSG.cleaned, effect: 'wash' }
}

/** СОС — аварийная служба: не воскрешает, а честно докладывает обстановку. */
export function sos(s: GameState): ActionResult {
  return { state: s, msg: MSG.report, effect: 'none', report: diagnose(s) }
}

/**
 * РОЗЛИВ — доступен, когда гриб дорос до максимума. Партия уходит в журнал,
 * а сам гриб оставляет дочерний слой: концовка превращается в петлю.
 */
export function bottle(s: GameState, now: number): ActionResult {
  if (!canBottle(s)) return { state: s, msg: MSG.notReady, effect: 'none', rejected: true }

  const day = dayOf(s)
  const quality = s.mold < 0.15 ? 'ВЫСШЕЕ' : s.mold < 0.4 ? 'ПЕРВОЕ' : 'ВТОРОЕ'
  const journal = note(s, now, `ПАРТИЯ №${s.generation} · ДЕНЬ ${day} · КАЧЕСТВО ${quality}`)

  return {
    state: heir(s, now, B.BOTTLED_START_GROWTH, journal),
    msg: MSG.bottled,
    effect: 'hearts',
  }
}

/**
 * Следующее поколение после смерти. Дочерний слой образуется только у гриба,
 * успевшего дорасти до половины, — иначе счёт поколений начинается заново.
 */
export function nextGeneration(s: GameState, now: number): ActionResult {
  const day = s.deathDay ?? dayOf(s)
  const hasDaughter = s.growth >= B.DAUGHTER_MIN_GROWTH
  const journal = note(
    s,
    now,
    hasDaughter
      ? `ОБЪЕКТ №${s.generation} ПОГИБ НА ДЕНЬ ${day}. ОСТАВЛЕН ДОЧЕРНИЙ СЛОЙ.`
      : `ОБЪЕКТ №${s.generation} ПОГИБ НА ДЕНЬ ${day}. СЛОЯ НЕ ОСТАВИЛ.`,
  )

  if (!hasDaughter) {
    return {
      state: createState(now, { generation: 1, journal }),
      msg: MSG.startedOver,
      effect: 'none',
    }
  }
  return {
    state: heir(s, now, B.DAUGHTER_START_GROWTH, journal),
    msg: MSG.daughter,
    effect: 'none',
  }
}

/** Новый гриб от текущего: поколение +1, чуть терпимее родителя. */
function heir(s: GameState, now: number, growth: number, journal: JournalEntry[]): GameState {
  return createState(now, {
    generation: s.generation + 1,
    growth,
    resentFactor: Math.max(B.HEIR_RESENT_FACTOR_MIN, s.resentFactor * B.HEIR_RESENT_FACTOR),
    journal,
  })
}
