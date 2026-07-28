/**
 * Состояние объекта. Всё, что можно вычислить (день, настроение, тревога),
 * здесь НЕ хранится — см. derive.ts. В сохранение попадает только то, что
 * нельзя восстановить из времени и истории.
 */

export const SAVE_VERSION = 1

/** Насколько «в прошлое» сдвинуты кулдауны у новорождённого гриба. */
const COOLDOWN_HEADSTART_MS = 60 * 60 * 1000

export type JournalEntry = {
  /** Реальное время события — по нему запись сортируется и датируется. */
  at: number
  generation: number
  day: number
  text: string
}

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

  journal: JournalEntry[]
}

export type NewLifeOpts = {
  generation?: number
  growth?: number
  resentFactor?: number
  journal?: JournalEntry[]
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
    journal: opts.journal ?? [],
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
