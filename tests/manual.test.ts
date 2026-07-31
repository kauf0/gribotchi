/**
 * Паспорт изделия.
 *
 * Главная опасность руководства — не опечатка, а РАСХОЖДЕНИЕ с игрой. Текст
 * живёт отдельно от условий, и через месяц правок баланса он начнёт врать,
 * а врущее руководство хуже отсутствующего. Поэтому здесь проверяется не
 * красота формулировок, а то, что числа в них — те же самые.
 */

import { describe, expect, it } from 'vitest'

import { SECTIONS, TRAIT_HINTS, FAMILY_NAMES, AXIS_NAMES } from '../src/content/manual'
import { TRAITS, TRAIT_KEYS, type TraitFamily } from '../src/sim/traits'
import { strainCounts } from '../src/sim/strain'
import { NAMED } from '../src/sim/named'
import { RANK_NAMES } from '../src/content/strings'
import { TRAIT_NAMES } from '../src/content/strings'
import * as B from '../src/sim/balance'

const L = B.TRAIT_LIMITS

describe('полнота руководства', () => {
  it('у всех тридцати признаков есть подсказка, и ни одна не повторяется', () => {
    const hints = TRAIT_KEYS.map((k) => TRAIT_HINTS[k])
    expect(hints).toHaveLength(30)
    for (const [i, hint] of hints.entries()) {
      expect(hint, TRAIT_KEYS[i]).toBeTruthy()
      expect(hint.length, TRAIT_KEYS[i]).toBeGreaterThan(10)
    }
    expect(new Set(hints).size).toBe(30)
  })

  it('лишних подсказок нет — только для существующих признаков', () => {
    expect(Object.keys(TRAIT_HINTS).sort()).toEqual([...TRAIT_KEYS].sort())
  })

  it('у каждой семьи есть название, и у каждой величины тоже', () => {
    const families = new Set(TRAIT_KEYS.map((k) => TRAITS[k].family))
    for (const family of families) expect(FAMILY_NAMES[family as TraitFamily], family).toBeTruthy()
    for (const axis of ['food', 'mold', 'growth', 'resent'] as const) {
      expect(AXIS_NAMES[axis], axis).toBeTruthy()
    }
  })

  it('разделы пронумерованы, не пусты и имеют разные якоря', () => {
    expect(SECTIONS.length).toBeGreaterThanOrEqual(10)
    for (const section of SECTIONS) {
      expect(section.title, section.id).toBeTruthy()
      expect(section.body.length, section.id).toBeGreaterThan(0)
      for (const line of section.body) expect(line.length, section.id).toBeGreaterThan(10)
    }
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length)
  })
})

describe('числа в руководстве не расходятся с игрой', () => {
  /**
   * Порог из balance.ts обязан попасть в подсказку. Проверяется присутствие
   * самого числа: если завтра порог поправят, а текст забудут, тест упадёт.
   *
   * Для долей сверяем проценты — именно в них говорит руководство.
   */
  const cases: [keyof typeof TRAIT_HINTS, string][] = [
    ['stout', String(L.overfedStout)],
    ['lean', String(L.daysLean)],
    ['greedy', String(L.daysGreedy)],
    ['even', String(L.daysEven)],
    ['wiry', `${Math.round(L.moldWiry * 100)}%`],
    ['sterile', `${Math.round(L.moldSterile * 100)}%`],
    ['neglected', `${Math.round(L.moldNeglected * 100)}%`],
    ['scrubbed', String(L.cleansScrubbed)],
    ['healing', String(L.poursDominant)],
    ['wild', String(L.poursDominant)],
    ['strict', String(L.poursDominant)],
    ['motley', String(L.poursMotley)],
    ['nocturnal', `${Math.round(L.nightShare * 100)}%`],
    ['diurnal', String(L.poursDiurnal)],
    ['shift', String(L.nightsShift)],
    ['spiteful', String(L.awaysSpiteful)],
    ['forgiving', String(L.forgivenForgiving)],
    ['devoted', String(L.daysDevoted)],
    ['abandoned', String(Math.round(L.awayAbandonedMs / 3600_000))],
    ['early', String(L.daysEarly)],
    ['slow', String(L.daysSlow)],
    ['stunted', String(L.daysStunted)],
    ['ancient', String(L.daysAncient)],
    ['seasoned', String(L.incidentsSeasoned)],
    ['generous', String(L.giftsGenerous)],
    ['litigious', String(L.callsLitigious)],
    ['careful', String(L.daysCareful)],
    ['firstborn', String(L.daysFirstborn)],
    ['longline', String(L.generationLongline)],
  ]

  it.each(cases)('подсказка «%s» содержит порог %s', (key, expected) => {
    expect(TRAIT_HINTS[key]).toContain(expected)
  })

  it('перечислены пороги всех признаков, кроме беспорогового', () => {
    // ПОДКИДЫШ — единственный без числа: там условие «в роду было скрещивание».
    const covered = new Set(cases.map(([key]) => key))
    const uncovered = TRAIT_KEYS.filter((k) => !covered.has(k))
    expect(uncovered).toEqual(['foundling'])
  })

  it('разделы называют настоящие числа баланса', () => {
    const all = SECTIONS.flatMap((s) => s.body).join(' ')
    // Темп игры, сроки и главные пороги обязаны быть взяты из balance.ts.
    expect(all).toContain(String(B.GAME_DAY_MS / 3600_000))
    expect(all).toContain(`${Math.round(B.FEED_AMOUNT * 100)}%`)
    expect(all).toContain(`${Math.round(B.ALARM_FOOD_BELOW * 100)}%`)
    expect(all).toContain(`${Math.round(B.AWAY_ABOVE * 100)}%`)
    expect(all).toContain(String(B.FEED_COOLDOWN_MS / 60_000))
    expect(all).toContain(String(B.ABSENCE_WORTH_NOTING_MS / 3600_000))
  })

  it('честная пара чисел вместо одной: всего и своими руками', () => {
    // Прежде руководство печатало одно число — 4060 — и тем прятало лучший
    // факт игры: треть сочетаний недостижима в одиночку.
    const all = SECTIONS.flatMap((s) => s.body).join(' ')
    const counts = strainCounts(TRAIT_KEYS.map((k) => TRAITS[k].family))
    expect(all).toContain(String(counts.total))
    expect(all).toContain(String(counts.alone))
    expect(all).toContain(String(counts.total - counts.alone))
    expect(counts.alone).toBeLessThan(counts.total)
  })

  it('разделы называют настоящее число имён и недостижимых среди них', () => {
    const all = SECTIONS.flatMap((s) => s.body).join(' ')
    expect(all).toContain(String(NAMED.length))
    expect(all).toContain(String(NAMED.filter((n) => n.graftOnly).length))
  })

  it('разряды перечислены все и с настоящими порогами высшего', () => {
    const all = SECTIONS.flatMap((s) => s.body).join(' ')
    for (const rank of B.RANKS) expect(all, rank.key).toContain(RANK_NAMES[rank.key])
    const top = B.RANKS[B.RANKS.length - 1]
    expect(all).toContain(String(top.strains))
    expect(all).toContain(String(top.names))
    expect(all).toContain(String(top.traits))
  })

  it('новые механики описаны, а не только упомянуты', () => {
    // Раздел без своего текста — та же ложь, что и разошедшееся число:
    // игрок откроет паспорт за объяснением и не найдёт его.
    for (const id of ['imena', 'zadanie', 'reestr', 'razryad']) {
      const section = SECTIONS.find((s) => s.id === id)
      expect(section, id).toBeDefined()
      expect(section!.body.join(' ').length, id).toBeGreaterThan(200)
    }
  })

  it('в тексте нет забытых заглушек', () => {
    const all = SECTIONS.flatMap((s) => s.body).join(' ') + Object.values(TRAIT_HINTS).join(' ')
    expect(all).not.toContain('undefined')
    expect(all).not.toContain('NaN')
    expect(all).not.toMatch(/\$\{/)
  })
})

describe('пороги признаков остались числами', () => {
  it('все пороги положительны и конечны', () => {
    for (const [key, value] of Object.entries(L)) {
      expect(Number.isFinite(value), key).toBe(true)
      expect(value, key).toBeGreaterThan(0)
    }
  })

  it('названия признаков и подсказки говорят об одном и том же наборе', () => {
    expect(Object.keys(TRAIT_NAMES).sort()).toEqual(Object.keys(TRAIT_HINTS).sort())
  })
})
