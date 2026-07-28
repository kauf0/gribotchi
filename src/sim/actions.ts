/**
 * Три кнопки и смена поколений. Всё чистое: (состояние, время) → новое
 * состояние плюс реплика прибора и эффект для экрана.
 */

import { clamp01, createState, type GameState } from './state'
import { remember, type Grade, type JournalEntry } from './journal'
import { canBottle, canClean, canFeed, dayOf, diagnose, dominantTea } from './derive'
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

/**
 * Запись о том, что игрок сделал намеренно. Всё, что прибор подмечает сам,
 * живёт в observations.ts — см. правило раздела там.
 */
const note = (s: GameState, now: number, rest: Partial<JournalEntry>): JournalEntry[] =>
  remember(s.journal, { at: now, generation: s.generation, day: dayOf(s), ...rest })

/**
 * ЧАЙ — подача. Оно же извинение: немного гасит обиду сразу.
 *
 * Сорт выбирается каждый раз, и это главное решение игры: обиженному
 * завариваешь имбирь, растущему — зелёный, спокойному — чёрный. Числа сортов
 * лежат в balance.ts, здесь только их применение.
 */
export function feed(s: GameState, now: number, tea: B.TeaKey = 'black'): ActionResult {
  if (!s.alive) return { state: s, msg: MSG.dead, effect: 'none', rejected: true }
  if (!canFeed(s, now)) return { state: s, msg: MSG.cooldown, effect: 'none', rejected: true }

  const recipe = B.TEAS[tea]
  const overfed = s.food > B.OVERFEED_ABOVE
  const state: GameState = {
    ...s,
    food: clamp01(s.food + recipe.food),
    // Перелив закисает средой вне зависимости от сорта — сверх того, что
    // сделал сам сорт.
    mold: clamp01(s.mold + recipe.mold + (overfed ? B.OVERFEED_MOLD : 0)),
    // Рост от зелёного идёт разово и мимо обычных условий: это не ускорение
    // созревания, а подкормка.
    growth: clamp01(s.growth + recipe.growth),
    resentment: clamp01(s.resentment - recipe.forgive),
    lastFedAt: now,
    fedAtAge: s.ageMs,
    poured: { ...s.poured, [tea]: (s.poured[tea] ?? 0) + 1 },
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

  // Ступень качества, а не слово: формулировку подберёт слой вида.
  const grade: Grade = s.mold < 0.15 ? 'top' : s.mold < 0.4 ? 'first' : 'second'
  // Сорт партии — итог дневных решений. Поили вразнобой — партия без сорта.
  const journal = note(s, now, { kind: 'batch', tea: dominantTea(s), grade })

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
  const hasDaughter = s.growth >= B.DAUGHTER_MIN_GROWTH
  // День гибели, а не сегодняшний: извещение могли открыть много позже.
  const journal = note(s, now, {
    kind: 'death',
    day: s.deathDay ?? dayOf(s),
    daughter: hasDaughter,
  })

  if (!hasDaughter) {
    return {
      state: createState(now, {
        generation: 1,
        journal,
        longestAwayMs: s.longestAwayMs,
        lastIncidentAt: s.lastIncidentAt,
      }),
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
    // Рекорд отсутствия и пауза происшествий — про владельца, и смерть гриба
    // их не отменяет.
    longestAwayMs: s.longestAwayMs,
    lastIncidentAt: s.lastIncidentAt,
    journal,
  })
}
