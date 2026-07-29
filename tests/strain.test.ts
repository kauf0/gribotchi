/**
 * Признаки и код штамма.
 *
 * Здесь два обещания, на которых держится весь обмен закваской.
 *
 * Первое: **ни один признак не лучше другого по всем осям сразу.** Иначе
 * появится правильный штамм, и селекция выродится в оптимизацию.
 *
 * Второе: **код — удостоверение.** Один набор всегда даёт один код, разные
 * наборы — разные, а опечатка отвергается, а не превращается в чужой штамм.
 * Проверяется полным перебором всех 4060 сочетаний: их достаточно мало,
 * чтобы не полагаться на выборку.
 */

import { describe, expect, it } from 'vitest'

import { createState, type GameState } from '../src/sim/state'
import {
  TRAITS,
  TRAIT_KEYS,
  TRAIT_SLOTS,
  earnedTraits,
  ratesFor,
  ratesOf,
  POURS_LEAN,
  POURS_EVEN,
  POURS_GREEDY,
  type TraitKey,
} from '../src/sim/traits'
import * as B from '../src/sim/balance'
import { encodeStrain, decodeStrain, prettyCode, CODE_LENGTH } from '../src/sim/strain'
import { bottle, nextGeneration } from '../src/sim/actions'

const T0 = 1_700_000_000_000
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const base = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.6,
  growth: 0.4,
  mold: 0.2,
  ...over,
})

/** Все сочетания по три из тридцати. */
const allTriples = (): TraitKey[][] => {
  const out: TraitKey[][] = []
  for (let i = 0; i < TRAIT_KEYS.length; i++)
    for (let j = i + 1; j < TRAIT_KEYS.length; j++)
      for (let k = j + 1; k < TRAIT_KEYS.length; k++)
        out.push([TRAIT_KEYS[i], TRAIT_KEYS[j], TRAIT_KEYS[k]])
  return out
}

describe('баланс признаков', () => {
  it('признаков тридцать, мест три, сочетаний 4060', () => {
    expect(TRAIT_KEYS.length).toBe(30)
    expect(TRAIT_SLOTS).toBe(3)
    expect(allTriples().length).toBe(4060)
  })

  it('ни один признак не лучше другого по всем величинам сразу', () => {
    // Больше — лучше только для роста; у сытости, плесени и обиды наоборот,
    // поэтому знак перевёрнут.
    const axes = (k: TraitKey) => {
      const r = ratesOf(k)
      return [-r.food, -r.mold, r.growth, -r.resent]
    }
    for (const a of TRAIT_KEYS) {
      for (const b of TRAIT_KEYS) {
        if (a === b) continue
        const [x, y] = [axes(a), axes(b)]
        const dominates = x.every((v, i) => v >= y[i]) && x.some((v, i) => v > y[i])
        expect(dominates, `${a} строго лучше, чем ${b} — появился правильный штамм`).toBe(false)
      }
    }
  })

  it('у каждого признака ровно один плюс и ровно один равный ему минус', () => {
    // Из этой симметрии и следует предыдущее свойство. Проверяем её отдельно:
    // сломать баланс можно только сломав её.
    for (const key of TRAIT_KEYS) {
      const def = TRAITS[key]
      expect(def.up, key).not.toBe(def.down)
      expect(def.d, key).toBeGreaterThan(0)
      const r = ratesOf(key)
      const moved = (['food', 'mold', 'growth', 'resent'] as const).filter((a) => r[a] !== 1)
      expect(moved.sort(), key).toEqual([def.down, def.up].sort())
    }
  })

  it('без признаков скорости остаются как были', () => {
    expect(ratesFor([])).toEqual({ food: 1, mold: 1, growth: 1, resent: 1 })
  })

  it('признаки перемножаются, а не заменяют друг друга', () => {
    const both = ratesFor(['stout', 'healing'])
    expect(both.food).toBeCloseTo(1.2 * 1.15, 10)
    expect(both.mold).toBeCloseTo(0.8 * 0.85, 10)
  })
})

describe('пороги подач привязаны к настоящему темпу', () => {
  /** Объект, которого поили с заданной частотой на игровой день. */
  const owner = (poursPerDay: number, days = 20): GameState => {
    const total = Math.round(poursPerDay * days)
    return base({
      ageMs: (days - 1) * B.GAME_DAY_MS,
      poured: { black: total, green: 0, ginger: 0 },
    })
  }

  it('игрок, заглядывающий дважды в сутки, не считается ПОСТНЫМ', () => {
    // Игровой день — три реальных часа, значит в реальных сутках восемь дней.
    // Заботливый владелец делает 0.25…0.5 подачи на игровой день. Первая
    // версия ставила порог ПОСТНОГО на 0.5, и постным оказывался каждый —
    // нашлось прогоном стилей на стенде (lab.html).
    expect(TRAITS.lean.earned(owner(0.25))).toBe(false)
    expect(TRAITS.lean.earned(owner(0.5))).toBe(false)
    // А вот тот, кто заходит раз в двое суток, — постный по делу.
    expect(TRAITS.lean.earned(owner(0.1))).toBe(true)
  })

  it('пороги идут по возрастанию и не перекрываются', () => {
    expect(POURS_LEAN).toBeLessThan(POURS_EVEN[0])
    expect(POURS_EVEN[0]).toBeLessThan(POURS_EVEN[1])
    expect(POURS_EVEN[1]).toBeLessThan(POURS_GREEDY)
  })

  it('ЖАДНЫЙ достижим: он выше нормы, но не за гранью', () => {
    // Держать бак полным стоит 0.56 подачи на игровой день; жадный — тот,
    // кто заметно сверх того, а не тот, кому нужен недостижимый рекорд.
    const needed = B.FOOD_DRAIN_PER_DAY / B.FEED_AMOUNT
    expect(POURS_GREEDY).toBeGreaterThan(needed)
    expect(POURS_GREEDY).toBeLessThan(needed * 2)
    expect(TRAITS.greedy.earned(owner(1.2))).toBe(true)
  })
})

describe('выразительность решает, кому достанется место', () => {
  it('у общих признаков ранг ниже, чем у выразительных', () => {
    // Иначе места занимают те, чьи условия выполняются раньше и у всех,
    // и стиль ухода перестаёт что-либо решать.
    for (const generic of ['devoted', 'firstborn', 'careful', 'diurnal'] as TraitKey[]) {
      for (const telling of ['wiry', 'sterile', 'stout', 'abandoned'] as TraitKey[]) {
        expect(TRAITS[generic].rank, `${generic} vs ${telling}`).toBeLessThan(TRAITS[telling].rank)
      }
    }
  })

  it('выразительные предлагаются первыми', () => {
    // Состояние, где выполнено сразу многое: побеждать должны редкие.
    const s = base({
      ageMs: 45 * B.GAME_DAY_MS,
      maxMold: 0.9,
      longestAwayMs: 30 * 3600_000,
      poured: { black: 40, green: 0, ginger: 0 },
      tally: { overfed: 5, clean: 0 },
    })
    const first = earnedTraits(s).slice(0, 3)
    for (const key of first) expect(TRAITS[key].rank, key).toBeGreaterThanOrEqual(2)
  })
})

describe('семьи признаков', () => {
  it('в каждой семье не меньше трёх признаков', () => {
    const count = new Map<string, number>()
    for (const k of TRAIT_KEYS) {
      const f = TRAITS[k].family
      count.set(f, (count.get(f) ?? 0) + 1)
    }
    expect(count.size).toBe(8)
    for (const [family, n] of count) expect(n, family).toBeGreaterThanOrEqual(3)
  })

  it('из одной семьи закрепляется не больше одного', () => {
    // Признаки внутри семьи говорят об одной величине: держать два — противоречие.
    const s = base({ ageMs: 40 * 3 * 3600_000, maxMold: 0.9, growth: 1, generation: 6 })
    const found = earnedTraits({ ...s, tally: { overfed: 5, 'turned-away': 3, incident: 4 } })
    const families = found.map((k) => TRAITS[k].family)
    expect(new Set(families).size).toBe(families.length)
  })

  it('СТЕРИЛЬНЫЙ и ЖИЛИСТЫЙ недостижимы одним грибом — ради этого и затеян обмен', () => {
    // Оба про худшую плесень, и условия исключают друг друга при любом уходе.
    for (const maxMold of [0, 0.1, 0.14, 0.15, 0.5, 0.7, 0.9, 1]) {
      const s = base({ maxMold, ageMs: 20 * 3 * 3600_000 })
      expect(TRAITS.sterile.earned(s) && TRAITS.wiry.earned(s), `плесень ${maxMold}`).toBe(false)
    }
    // Зато код с обоими собирается: так штамм и приходит от другого игрока.
    const crossed = decodeStrain(
      encodeStrain({ traits: ['sterile', 'wiry', 'devoted'], generation: 4, crossings: 1 }),
    )
    expect(crossed?.traits).toContain('sterile')
    expect(crossed?.traits).toContain('wiry')
  })

  it('уже закреплённый признак и его семья второй раз не предлагаются', () => {
    const s = base({ maxMold: 0.9, traits: ['wiry'] })
    const found = earnedTraits(s)
    expect(found).not.toContain('wiry')
    expect(found.map((k) => TRAITS[k].family)).not.toContain('env')
  })

  it('у новорождённого объекта не закрепляется ничего', () => {
    expect(earnedTraits(createState(T0))).toEqual([])
  })
})

describe('пересадка чужой закваски', () => {
  /** Гриб, доросший до розлива, с заданными признаками. */
  const ripe = (traits: TraitKey[], over: Partial<GameState> = {}): GameState =>
    base({ growth: 1, mold: 0.05, traits, ...over })

  it('несовместимые признаки достижимы только вдвоём', () => {
    // Обещание всей механики: СТЕРИЛЬНЫЙ и ЖИЛИСТЫЙ говорят об одной величине,
    // и одним грибом не зарабатываются ни при каком уходе.
    for (const maxMold of [0, 0.14, 0.7, 1]) {
      const s = base({ maxMold, ageMs: 20 * 3 * 3600_000 })
      expect(TRAITS.sterile.earned(s) && TRAITS.wiry.earned(s)).toBe(false)
    }
    // Зато чужая закваска приносит ровно недостающее — и код это переживает.
    const gift = encodeStrain({ traits: ['wiry', 'stout'], generation: 4, crossings: 0 })
    expect(decodeStrain(gift)?.traits).toContain('wiry')
  })

  it('закваска не расходуется симуляцией: решение за владельцем', () => {
    // Симуляция намеренно НЕ выбирает, что взять, — иначе обмен свёлся бы
    // к «вставь код и получи, что дали». Дочерний слой просто несёт её дальше.
    const gift = encodeStrain({ traits: ['wiry', 'wild'], generation: 2, crossings: 0 })
    const child = bottle(ripe(['sterile', 'devoted', 'motley'], { offered: gift }), T0).state
    expect(child.offered).toBe(gift)
    expect(child.traits).toEqual(['sterile', 'devoted', 'motley'])
    expect(child.crossings).toBe(0)
  })

  it('закваска переживает смерть без дочернего слоя', () => {
    const gift = encodeStrain({ traits: ['wiry'], generation: 2, crossings: 0 })
    const dead = base({ alive: false, growth: 0.1, deathDay: 9, offered: gift })
    expect(nextGeneration(dead, T0).state.offered).toBe(gift)
  })
})

describe('реестр выведенных', () => {
  it('розлив заносит штамм в реестр', () => {
    const s = base({ growth: 1, mold: 0.05, traits: ['wiry', 'healing', 'devoted'] })
    const after = bottle(s, T0).state
    expect(after.bred).toHaveLength(1)
    expect(decodeStrain(after.bred[0])?.traits.sort()).toEqual(['devoted', 'healing', 'wiry'])
  })

  it('тот же штамм второй раз не заносится', () => {
    let s = base({ growth: 1, mold: 0.05, traits: ['wiry', 'healing', 'devoted'] })
    s = bottle(s, T0).state
    s = bottle({ ...s, growth: 1, traits: ['wiry', 'healing', 'devoted'], generation: 1 }, T0).state
    expect(s.bred).toHaveLength(1)
  })

  it('гриб без признаков в реестр не попадает — это ещё не штамм', () => {
    expect(bottle(base({ growth: 1, traits: [] }), T0).state.bred).toEqual([])
  })

  it('реестр переживает смерть и новую закваску: он про владельца', () => {
    const code = encodeStrain({ traits: ['wiry'], generation: 1, crossings: 0 })
    const dead = base({ alive: false, growth: 0.1, deathDay: 9, bred: [code] })
    const next = nextGeneration(dead, T0).state
    expect(next.generation).toBe(1)
    expect(next.bred).toEqual([code])
  })
})

describe('код штамма', () => {
  it('все 4060 сочетаний кодируются в разные восьмизначные коды и читаются обратно', () => {
    const seen = new Set<string>()
    for (const traits of allTriples()) {
      const code = encodeStrain({ traits, generation: 7, crossings: 2 })
      expect(code).toHaveLength(CODE_LENGTH)
      expect(seen.has(code), `столкновение на ${traits.join()}`).toBe(false)
      seen.add(code)

      const back = decodeStrain(code)
      expect(back, code).not.toBe(null)
      expect([...back!.traits].sort()).toEqual([...traits].sort())
      expect(back!.generation).toBe(7)
      expect(back!.crossings).toBe(2)
    }
    expect(seen.size).toBe(4060)
  })

  it('порядок признаков не влияет на код — иначе номер не был бы удостоверением', () => {
    for (const traits of allTriples().slice(0, 200)) {
      const [a, b, c] = traits
      const straight = encodeStrain({ traits: [a, b, c], generation: 1, crossings: 0 })
      for (const order of [
        [c, b, a],
        [b, a, c],
        [c, a, b],
      ] as TraitKey[][]) {
        expect(encodeStrain({ traits: order, generation: 1, crossings: 0 })).toBe(straight)
      }
    }
  })

  it('любая опечатка в один знак отвергается', () => {
    // Ради этого разметка и выровнена по границе знаков: усечённая сумма
    // пропускала каждую сороковую.
    const good = encodeStrain({ traits: ['wiry', 'healing', 'devoted'], generation: 3, crossings: 0 })
    for (let pos = 0; pos < CODE_LENGTH; pos++) {
      for (const c of ALPHABET) {
        if (good[pos] === c) continue
        const typo = good.slice(0, pos) + c + good.slice(pos + 1)
        expect(decodeStrain(typo), `${good} → ${typo}`).toBe(null)
      }
    }
  })

  it('перестановка двух соседних знаков тоже отвергается', () => {
    const good = encodeStrain({ traits: ['stout', 'wild', 'longline'], generation: 9, crossings: 3 })
    for (let i = 0; i < CODE_LENGTH - 1; i++) {
      if (good[i] === good[i + 1]) continue
      const swapped = good.slice(0, i) + good[i + 1] + good[i] + good.slice(i + 2)
      expect(decodeStrain(swapped), swapped).toBe(null)
    }
  })

  it('переписанный руками код принимается в любом виде', () => {
    const good = encodeStrain({ traits: ['even', 'shift', 'careful'], generation: 2, crossings: 0 })
    for (const variant of [
      good.toLowerCase(),
      prettyCode(good),
      ` ${good} `,
      // Crockford: эти знаки в алфавит не входят и означают похожие на них.
      good.replace(/1/g, 'I').replace(/0/g, 'O'),
    ]) {
      expect(decodeStrain(variant), variant).not.toBe(null)
    }
  })

  it('мусор и чужой формат отвергаются', () => {
    for (const junk of ['', 'КОД', 'SHORT', '123456789', 'AAAAAAAA', null, 42, undefined]) {
      expect(decodeStrain(junk as unknown), String(junk)).toBe(null)
    }
  })

  it('неполный набор признаков кодируется и возвращается неполным', () => {
    // У молодого гриба может не быть ни одного признака — код всё равно нужен.
    for (const traits of [[], ['wiry'], ['wiry', 'motley']] as TraitKey[][]) {
      const back = decodeStrain(encodeStrain({ traits, generation: 1, crossings: 0 }))
      expect(back?.traits).toEqual(traits)
    }
  })

  it('поколение и скрещивания обрезаются, а не переполняются', () => {
    const back = decodeStrain(encodeStrain({ traits: ['wiry'], generation: 9999, crossings: 99 }))
    expect(back?.generation).toBe(127)
    expect(back?.crossings).toBe(7)
  })
})
