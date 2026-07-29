/**
 * Три кнопки и смена поколений. Всё чистое: (состояние, время) → новое
 * состояние плюс реплика прибора и эффект для экрана.
 */

import { clamp01, createState, type GameState } from './state'
import { bump, record, type Grade, type JournalEntry } from './journal'
import { encodeStrain } from './strain'
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
const note = (s: GameState, now: number, rest: Partial<JournalEntry>): GameState =>
  record(s, { at: now, generation: s.generation, day: dayOf(s), ...rest })

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
    // Промывок слишком много для журнала, но признакам МЫТЫЙ и ЗАПУЩЕННЫЙ
    // нужен их счёт — потому счётчик и шире журнала.
    tally: bump(s.tally, 'clean'),
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
  const noted = note(s, now, { kind: 'batch', tea: dominantTea(s), grade })

  return {
    state: heir(registered(noted), now, B.BOTTLED_START_GROWTH),
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
  const noted = note(s, now, {
    kind: 'death',
    day: s.deathDay ?? dayOf(s),
    daughter: hasDaughter,
  })

  if (!hasDaughter) {
    // Новая закваска: признаки объекта уходят вместе с ним, но всё, что про
    // владельца и род — реестр, рекорд, полученная закваска — остаётся.
    return {
      state: createState(now, { generation: 1, ...ownersKeep(registered(noted)) }),
      msg: MSG.startedOver,
      effect: 'none',
    }
  }
  return {
    state: heir(noted, now, B.DAUGHTER_START_GROWTH),
    msg: MSG.daughter,
    effect: 'none',
  }
}

/**
 * Что принадлежит владельцу и роду, а не объекту, и потому переживает любую
 * смену поколения — даже начатую с нуля новую закваску.
 */
const ownersKeep = (s: GameState) => ({
  journal: s.journal,
  longestAwayMs: s.longestAwayMs,
  lastIncidentAt: s.lastIncidentAt,
  crossings: s.crossings,
  bred: s.bred,
  offered: s.offered,
})

/**
 * Занести доведённый штамм в реестр владельца. Только полный: гриб без
 * признаков — ещё не штамм, и в реестре ему делать нечего.
 */
function registered(s: GameState): GameState {
  if (s.traits.length === 0) return s
  const code = encodeStrain({ traits: s.traits, generation: s.generation, crossings: s.crossings })
  return s.bred.includes(code) ? s : { ...s, bred: [...s.bred, code] }
}

/**
 * Скрещивание с полученной закваской.
 *
 * Здесь его НЕТ намеренно. Симуляция не решает, что взять у чужого штамма, —
 * решает владелец, бланком на три кнопки (см. пересадку в main.ts). Иначе
 * обмен свёлся бы к «вставь код и получи, что дали», а он затевался ради
 * выбора: у чужого гриба обычно есть ровно тот признак, которого своим не
 * заработать никогда.
 *
 * Поэтому дочерний слой просто несёт полученную закваску дальше, а расходуется
 * она в момент пересадки.
 */
/** Новый гриб от текущего: поколение +1, чуть терпимее родителя. */
function heir(s: GameState, now: number, growth: number): GameState {
  return createState(now, {
    ...ownersKeep(s),
    generation: s.generation + 1,
    growth,
    resentFactor: Math.max(B.HEIR_RESENT_FACTOR_MIN, s.resentFactor * B.HEIR_RESENT_FACTOR),
    // Признаки — это и есть штамм: дочерний слой наследует все три.
    traits: s.traits,
  })
}
