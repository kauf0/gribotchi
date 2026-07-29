/**
 * Как признаки штамма меняют вид гриба.
 *
 * Сочетаний 4060 — нарисовать каждое нельзя, да и не нужно. Вместо этого
 * КАЖДЫЙ признак даёт небольшой вклад в силуэт, а три вклада складываются.
 * Так штаммы отличаются на глаз, а рисовать приходится по-прежнему один гриб.
 *
 * Вклады намеренно скромные и по разным осям: ширина, толщина, нити, кольца,
 * рубцы. Три сильных правки одной величины дали бы кляксу, поэтому множители
 * подрезаны снизу и сверху — узнаваемым гриб остаётся всегда.
 *
 * Живёт в слое вида: симуляция о пикселях не знает, а этот модуль не знает
 * об условиях закрепления признаков.
 */

import type { TraitKey } from '../../sim/traits'

export type Silhouette = {
  /** Множитель полуширины диска. */
  width: number
  /** Множитель толщины. */
  thick: number
  /** Сколько нитей свисает в чай. */
  strands: number
  /** Множитель их длины. */
  strandLen: number
  /** Концентрические кольца на диске. */
  rings: number
  /** Тёмные точки сверх плесени — следы прошлых бед. */
  scars: number
}

const PLAIN: Silhouette = { width: 1, thick: 1, strands: 5, strandLen: 1, rings: 0, scars: 0 }

/** Вклад одного признака. Всё, что не указано, остаётся как было. */
type Mark = Partial<Silhouette>

const MARKS: Partial<Record<TraitKey, Mark>> = {
  // Питание видно по объёму.
  stout: { thick: 1.5, width: 1.1 },
  lean: { thick: 0.7, width: 0.9 },
  greedy: { width: 1.15, strands: 7 },
  even: { width: 1.05, thick: 1.05 },

  // Среда — по чистоте края и рубцам.
  wiry: { scars: 5, strands: 8, thick: 0.8 },
  sterile: { rings: 1, strandLen: 0.6 },
  neglected: { scars: 7, strandLen: 1.3 },
  scrubbed: { strands: 3, width: 0.95 },

  // Сорт заварки — по кольцам и развалу.
  healing: { rings: 2, width: 0.9 },
  wild: { width: 1.35, strands: 8 },
  strict: { width: 1.05, rings: 1 },
  motley: { scars: 3, strands: 6 },

  // Часы — по плотности.
  nocturnal: { thick: 1.25, scars: 2 },
  diurnal: { width: 1.1, strandLen: 1.2 },
  shift: { strands: 6, thick: 1.1 },

  // Отношения — по осанке.
  spiteful: { thick: 1.3, width: 0.85 },
  forgiving: { width: 1.1, strandLen: 1.3 },
  devoted: { rings: 1, thick: 1.15 },
  abandoned: { strandLen: 1.6, thick: 0.85 },

  // Рост — по пропорции.
  early: { width: 1.2, thick: 0.85 },
  slow: { thick: 1.4, width: 0.9 },
  stunted: { width: 0.75, thick: 0.9 },
  ancient: { rings: 3, scars: 4 },

  // Происшествия — по бывалости.
  seasoned: { scars: 4, strands: 7 },
  generous: { width: 0.85, strandLen: 0.7 },
  litigious: { rings: 2, thick: 1.1 },
  careful: { strands: 4, rings: 1 },

  // Род — по стати.
  firstborn: { width: 1.05, strandLen: 0.9 },
  longline: { rings: 3, thick: 1.2 },
  foundling: { scars: 3, width: 1.1, strands: 6 },
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Складывает вклады трёх признаков. Множители перемножаются и подрезаются:
 * даже три «толстых» признака подряд не превратят гриб в квадрат.
 */
export function silhouetteOf(traits: TraitKey[]): Silhouette {
  const out: Silhouette = { ...PLAIN }
  for (const key of traits) {
    const mark = MARKS[key]
    if (!mark) continue
    if (mark.width) out.width *= mark.width
    if (mark.thick) out.thick *= mark.thick
    if (mark.strandLen) out.strandLen *= mark.strandLen
    // Нити и кольца не перемножаются, а берутся по наибольшему: их считают
    // штуками, и произведение здесь ничего не значило бы.
    if (mark.strands) out.strands = Math.max(out.strands, mark.strands)
    if (mark.rings) out.rings += mark.rings
    if (mark.scars) out.scars += mark.scars
  }

  out.width = clamp(out.width, 0.6, 1.6)
  out.thick = clamp(out.thick, 0.6, 1.8)
  out.strandLen = clamp(out.strandLen, 0.5, 2)
  out.strands = clamp(Math.round(out.strands), 2, 9)
  out.rings = clamp(out.rings, 0, 4)
  out.scars = clamp(out.scars, 0, 12)
  return out
}
