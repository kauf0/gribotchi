/**
 * Признаки штамма: чем этот гриб отличается от прочих.
 *
 * Признак закрепляется В МОМЕНТ, когда условие выполнено, а не при розливе:
 * так отдача приходит по ходу игры, а не раз в трое суток. Мест у гриба три,
 * признаков тридцать — отсюда 4060 сочетаний, и каждое сочетание есть штамм.
 *
 * Признаки собраны в СЕМЬИ, и внутри семьи они взаимоисключающие. На этом
 * держится весь обмен закваской: СТЕРИЛЬНЫЙ (плесень не поднималась выше 0.15)
 * и ЖИЛИСТЫЙ (поднималась выше 0.7) — про одну и ту же величину, и один гриб
 * не заработает оба никогда. Собрать их вместе можно только скрещиванием
 * с чужой закваской, а чужая закваска приходит от живого человека.
 *
 * Ни одного нового вопроса игроку: все условия выводятся из того, что прибор
 * и так записывает — счётчика (journal.ts), поданных сортов и возраста.
 *
 * Чистый модуль по образцу sim/incidents.ts: таблица условий перебирается
 * тестом целиком, без браузера.
 */

import type { GameState } from './state'
import { counted } from './journal'
import { dayOf, dominantTea } from './derive'
import * as B from './balance'

export type TraitFamily = 'food' | 'env' | 'tea' | 'hours' | 'bond' | 'growth' | 'trouble' | 'line'

/** Величины, на которые признак может влиять. */
export type Axis = 'food' | 'mold' | 'growth' | 'resent'
export type TraitRates = Record<Axis, number>

/**
 * Признак меняет РАСПОРЯДОК, а не силу: тучного кормишь чаще, целебного моешь
 * реже. Поэтому у каждого ровно один плюс и ровно один минус, и они РАВНЫ
 * по величине — `up` улучшается на d, `down` на столько же ухудшается.
 *
 * Симметрия здесь не украшение, а несущая конструкция: из неё математически
 * следует, что ни один признак не лучше другого по всем осям сразу. Будь
 * плюсы и минусы независимы, достаточно одной неудачной правки баланса —
 * и появился бы правильный штамм, а селекция выродилась бы в оптимизацию.
 * Свойство закреплено ещё и тестом, но ломать его пришлось бы намеренно.
 */
export type TraitDef = {
  family: TraitFamily
  /** Что признак улучшает. */
  up: Axis
  /** Чем за это платит. */
  down: Axis
  /** Величина сдвига, одна на обе стороны. */
  d: number
  /**
   * Насколько признак выразителен: 3 — про него и рассказывают, 1 — почти
   * у всех. Мест три, и при споре побеждает выразительный.
   *
   * Без этого места занимали бы те признаки, что стоят раньше в таблице,
   * а условия у них самые общие: стенд показал, что четыре разных стиля ухода
   * дают один и тот же штамм — ПОСТНЫЙ, ПРЕДАННЫЙ, ПЕРВЕНЕЦ. Порядок в таблице
   * не должен решать, кем вырастет гриб.
   */
  rank: 1 | 2 | 3
  /** Выполнено ли условие прямо сейчас. */
  earned: (s: GameState) => boolean
}

/** Для роста больше — лучше, для сытости, плесени и обиды — наоборот. */
const better = (axis: Axis, d: number): number => (axis === 'growth' ? 1 + d : 1 - d)
const worse = (axis: Axis, d: number): number => (axis === 'growth' ? 1 - d : 1 + d)

/**
 * Признаки с самыми общими условиями (ПРЕДАННЫЙ, ПЕРВЕНЕЦ, ОСТОРОЖНЫЙ)
 * закрепляются ПОЗДНО — за тридцатый-сороковой день. Иначе они занимали бы
 * все три места в первые же реальные сутки и держали бы их: стенд показал,
 * что до выразительных признаков очередь тогда не доходит вовсе.
 *
 * Пороги подач. Игровой день — три реальных часа, сытость тратится по 0.25
 * за день, подача даёт 0.45. Значит просто «не голодать» — это 0.56 подачи
 * на игровой день, а игрок, заглядывающий дважды в сутки, делает 0.25.
 *
 * Числа отсюда, а не с потолка: первая версия ставила порог ПОСТНОГО на 0.5,
 * и постным оказывался вообще каждый.
 */
export const POURS_LEAN = 0.2
export const POURS_EVEN = [0.3, 0.7] as const
export const POURS_GREEDY = 0.9

/** Сколько подач было за жизнь поколения. */
const pours = (s: GameState): number => B.TEA_KEYS.reduce((n, k) => n + (s.poured[k] ?? 0), 0)
/** Подач на игровой день — мера усердия владельца. */
const poursPerDay = (s: GameState): number => pours(s) / Math.max(1, dayOf(s))

export const TRAITS = {
  // ── Питание ───────────────────────────────────────────────────
  stout: {
    family: 'food',
    up: 'mold',
    down: 'food',
    d: 0.2,
    rank: 3,
    earned: (s) => counted(s.tally, 'overfed') >= 3,
  },
  lean: {
    family: 'food',
    up: 'food',
    down: 'growth',
    d: 0.2,
    rank: 1,
    earned: (s) => dayOf(s) >= 15 && poursPerDay(s) < POURS_LEAN,
  },
  greedy: {
    family: 'food',
    up: 'growth',
    down: 'food',
    d: 0.15,
    rank: 3,
    earned: (s) => dayOf(s) >= 12 && poursPerDay(s) >= POURS_GREEDY,
  },
  even: {
    family: 'food',
    up: 'mold',
    down: 'growth',
    d: 0.1,
    rank: 1,
    earned: (s) =>
      dayOf(s) >= 18 &&
      counted(s.tally, 'overfed') === 0 &&
      poursPerDay(s) >= POURS_EVEN[0] &&
      poursPerDay(s) <= POURS_EVEN[1],
  },

  // ── Среда ─────────────────────────────────────────────────────
  wiry: {
    family: 'env',
    up: 'mold',
    down: 'growth',
    d: 0.2,
    rank: 3,
    earned: (s) => s.maxMold >= 0.7,
  },
  sterile: {
    family: 'env',
    up: 'mold',
    down: 'resent',
    d: 0.25,
    rank: 3,
    earned: (s) => dayOf(s) >= 8 && s.maxMold < 0.15,
  },
  neglected: {
    family: 'env',
    up: 'resent',
    down: 'mold',
    d: 0.2,
    rank: 3,
    earned: (s) => s.maxMold >= 0.5 && counted(s.tally, 'clean') <= 1,
  },
  scrubbed: {
    family: 'env',
    up: 'growth',
    down: 'mold',
    d: 0.1,
    rank: 2,
    earned: (s) => counted(s.tally, 'clean') >= 6,
  },

  // ── Сорт заварки ──────────────────────────────────────────────
  healing: {
    family: 'tea',
    up: 'mold',
    down: 'food',
    d: 0.15,
    rank: 2,
    earned: (s) => pours(s) >= 6 && dominantTea(s) === 'ginger',
  },
  wild: {
    family: 'tea',
    up: 'growth',
    down: 'mold',
    d: 0.2,
    rank: 2,
    earned: (s) => pours(s) >= 6 && dominantTea(s) === 'green',
  },
  strict: {
    family: 'tea',
    up: 'resent',
    down: 'growth',
    d: 0.15,
    rank: 2,
    earned: (s) => pours(s) >= 6 && dominantTea(s) === 'black',
  },
  motley: {
    family: 'tea',
    up: 'growth',
    down: 'resent',
    d: 0.1,
    rank: 2,
    earned: (s) => pours(s) >= 9 && dominantTea(s) === null,
  },

  // ── Часы подачи ───────────────────────────────────────────────
  nocturnal: {
    family: 'hours',
    up: 'resent',
    down: 'growth',
    d: 0.1,
    rank: 3,
    earned: (s) => pours(s) >= 5 && counted(s.tally, 'night-pour') >= pours(s) * 0.4,
  },
  diurnal: {
    family: 'hours',
    up: 'growth',
    down: 'food',
    d: 0.1,
    rank: 1,
    earned: (s) => pours(s) >= 10 && counted(s.tally, 'night-pour') === 0,
  },
  shift: {
    family: 'hours',
    up: 'resent',
    down: 'mold',
    d: 0.1,
    rank: 2,
    earned: (s) =>
      pours(s) >= 5 &&
      counted(s.tally, 'night-pour') >= 2 &&
      counted(s.tally, 'night-pour') < pours(s) * 0.4,
  },

  // ── Отношения ─────────────────────────────────────────────────
  spiteful: {
    family: 'bond',
    up: 'mold',
    down: 'resent',
    d: 0.2,
    rank: 3,
    earned: (s) => counted(s.tally, 'turned-away') >= 2,
  },
  forgiving: {
    family: 'bond',
    up: 'resent',
    down: 'growth',
    d: 0.25,
    rank: 2,
    earned: (s) => counted(s.tally, 'forgiven') >= 2,
  },
  devoted: {
    family: 'bond',
    up: 'resent',
    down: 'food',
    d: 0.15,
    rank: 1,
    earned: (s) => dayOf(s) >= 30 && counted(s.tally, 'turned-away') === 0,
  },
  abandoned: {
    family: 'bond',
    up: 'mold',
    down: 'growth',
    d: 0.15,
    rank: 3,
    earned: (s) => s.longestAwayMs >= 24 * 3600_000,
  },

  // ── Рост ──────────────────────────────────────────────────────
  early: {
    family: 'growth',
    up: 'growth',
    down: 'mold',
    d: 0.15,
    rank: 3,
    earned: (s) => s.growth >= 1 && dayOf(s) <= 25,
  },
  slow: {
    family: 'growth',
    up: 'mold',
    down: 'growth',
    d: 0.25,
    rank: 3,
    earned: (s) => s.growth >= 1 && dayOf(s) >= 40,
  },
  stunted: {
    family: 'growth',
    up: 'food',
    down: 'growth',
    d: 0.15,
    rank: 2,
    earned: (s) => dayOf(s) >= 20 && s.growth < 0.5,
  },
  ancient: {
    family: 'growth',
    up: 'mold',
    down: 'food',
    d: 0.1,
    rank: 3,
    earned: (s) => dayOf(s) >= 60,
  },

  // ── Происшествия ──────────────────────────────────────────────
  seasoned: {
    family: 'trouble',
    up: 'resent',
    down: 'food',
    d: 0.1,
    rank: 2,
    earned: (s) => counted(s.tally, 'incident') >= 3,
  },
  generous: {
    family: 'trouble',
    up: 'resent',
    down: 'growth',
    d: 0.2,
    rank: 3,
    earned: (s) => counted(s.tally, 'answer-0') >= 2,
  },
  litigious: {
    family: 'trouble',
    up: 'mold',
    down: 'resent',
    d: 0.15,
    rank: 3,
    earned: (s) => counted(s.tally, 'answer-2') >= 3,
  },
  careful: {
    family: 'trouble',
    up: 'mold',
    down: 'growth',
    d: 0.05,
    rank: 1,
    earned: (s) => dayOf(s) >= 30 && counted(s.tally, 'incident') === 0,
  },

  // ── Род ───────────────────────────────────────────────────────
  firstborn: {
    family: 'line',
    up: 'growth',
    down: 'resent',
    d: 0.05,
    rank: 1,
    earned: (s) => s.generation === 1 && dayOf(s) >= 40,
  },
  longline: {
    family: 'line',
    up: 'resent',
    down: 'food',
    d: 0.2,
    rank: 1,
    earned: (s) => s.generation >= 5,
  },
  foundling: {
    family: 'line',
    up: 'growth',
    down: 'resent',
    d: 0.15,
    rank: 3,
    earned: (s) => s.crossings > 0,
  },
} as const satisfies Record<string, TraitDef>

export type TraitKey = keyof typeof TRAITS
export const TRAIT_KEYS = Object.keys(TRAITS) as TraitKey[]

/** Мест у гриба. Без предела все штаммы сошлись бы в один. */
export const TRAIT_SLOTS = 3

/**
 * Что закрепилось бы прямо сейчас, но ещё не закреплено.
 *
 * Из каждой семьи берётся не больше одного: признаки внутри семьи говорят
 * об одной и той же величине, и держать два было бы противоречием.
 *
 * При споре побеждает ВЫРАЗИТЕЛЬНЫЙ, а не первый по таблице. Иначе места
 * занимали бы признаки с самыми общими условиями, и стиль ухода перестал бы
 * что-либо решать — ровно это и показал стенд на первой версии.
 */
export function earnedTraits(s: GameState): TraitKey[] {
  const taken = new Set(s.traits.map((k) => TRAITS[k].family))
  const out: TraitKey[] = []
  const byRank = [...TRAIT_KEYS].sort((a, b) => TRAITS[b].rank - TRAITS[a].rank)
  for (const key of byRank) {
    const def = TRAITS[key]
    if (s.traits.includes(key)) continue
    // От чего отказались, того больше не предлагаем: иначе бланк выбраковки
    // открывался бы снова на каждом кадре.
    if (s.declined.includes(key)) continue
    if (taken.has(def.family)) continue
    if (!def.earned(s)) continue
    out.push(key)
    taken.add(def.family)
  }
  return out
}

/**
 * Совокупные сдвиги скоростей. Множители перемножаются: три признака дают
 * заметно другой распорядок, но ни один не отменяет уход.
 */
export function ratesFor(traits: TraitKey[]): TraitRates {
  const out: TraitRates = { food: 1, mold: 1, growth: 1, resent: 1 }
  for (const key of traits) {
    const def: TraitDef = TRAITS[key]
    out[def.up] *= better(def.up, def.d)
    out[def.down] *= worse(def.down, def.d)
  }
  return out
}

/** Сдвиги одного признака — для проверок и для бланка. */
export const ratesOf = (key: TraitKey): TraitRates => ratesFor([key])
