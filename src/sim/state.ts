/**
 * Состояние объекта. Всё, что можно вычислить (день, настроение, тревога),
 * здесь НЕ хранится — см. derive.ts. В сохранение попадает только то, что
 * нельзя восстановить из времени и истории.
 */

import { TEA_KEYS, type TeaKey } from './balance'
import type { JournalEntry } from './journal'

export type { JournalEntry } from './journal'

export const SAVE_VERSION = 1

/** Насколько «в прошлое» сдвинуты кулдауны у новорождённого гриба. */
const COOLDOWN_HEADSTART_MS = 60 * 60 * 1000

export type GameState = {
  version: typeof SAVE_VERSION
  /** Момент рождения текущего гриба по настенным часам — для журнала. */
  bornAt: number
  /**
   * Прожитое время симуляции. Именно оно, а не разница настенных часов,
   * даёт номер дня: сытость, рост и плесень копятся шагами advance(), и
   * возраст обязан копиться теми же шагами. Иначе источники расходятся —
   * например, после отладочного ускорения времени параметры остаются
   * прежними, а день падает в единицу.
   */
  ageMs: number
  /** До какого момента состояние уже просчитано. */
  lastTick: number
  generation: number

  food: number
  growth: number
  mold: number
  resentment: number

  alive: boolean
  deathAt: number | null
  deathDay: number | null

  lastFedAt: number
  lastCleanedAt: number
  /** До этого момента объект в стрессе после промывки и не растёт. */
  stressUntil: number
  /** Возраст на момент последнего кормления — для «просрочено на N дн.». */
  fedAtAge: number

  /** Множитель накопления обиды: наследуется и слабеет с поколениями. */
  resentFactor: number

  /**
   * Сколько раз чем поили за жизнь этого поколения. Из этого счётчика
   * складывается сорт партии при розливе: цель аккуратного игрока собирается
   * из дневных решений, а не выдаётся отдельной механикой.
   */
  poured: Record<TeaKey, number>

  /**
   * Самая долгая отлучка владельца, мс. Принадлежит игроку, а не грибу,
   * поэтому наследуется поколениями: рекорд отсутствия сбрасывать не за что.
   */
  longestAwayMs: number

  /**
   * Когда прибор в последний раз докладывал о происшествии. Держит паузу,
   * чтобы возвращение не превращалось в обязательную сводку убытков.
   */
  lastIncidentAt: number

  journal: JournalEntry[]
}

export type NewLifeOpts = {
  generation?: number
  growth?: number
  resentFactor?: number
  journal?: JournalEntry[]
  longestAwayMs?: number
  lastIncidentAt?: number
}

export function createState(now: number, opts: NewLifeOpts = {}): GameState {
  return {
    version: SAVE_VERSION,
    bornAt: now,
    ageMs: 0,
    lastTick: now,
    generation: opts.generation ?? 1,
    food: 0.8,
    growth: opts.growth ?? 0.05,
    mold: 0,
    resentment: 0,
    alive: true,
    deathAt: null,
    deathDay: null,
    // Кулдаун отсчитывается назад: иначе первое же нажатие ЧАЙ у нового игрока
    // отвечало бы «ПОДАЧА НЕ ЧАЩЕ РАЗА В 15 МИН.» — худшее первое впечатление.
    lastFedAt: now - COOLDOWN_HEADSTART_MS,
    lastCleanedAt: now - COOLDOWN_HEADSTART_MS,
    fedAtAge: 0,
    stressUntil: 0,
    resentFactor: opts.resentFactor ?? 1,
    poured: emptyPoured(),
    longestAwayMs: opts.longestAwayMs ?? 0,
    lastIncidentAt: opts.lastIncidentAt ?? 0,
    journal: opts.journal ?? [],
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Счётчик поданного с нуля — он же запасное значение при подъёме сохранений. */
export const emptyPoured = (): Record<TeaKey, number> =>
  Object.fromEntries(TEA_KEYS.map((k) => [k, 0])) as Record<TeaKey, number>
