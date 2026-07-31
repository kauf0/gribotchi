/**
 * Именованные штаммы и разряды.
 *
 * Таблица имён — единственное место в игре, где сочетание признаков написано
 * руками. Значит именно здесь можно опечататься так, что игрок будет годами
 * гнаться за штаммом, которого не существует. Поэтому проверяется не подбор
 * слов, а состоятельность каждой тройки: признаки настоящие, повторов нет,
 * пометка «только обменом» соответствует семьям.
 */

import { describe, expect, it } from 'vitest'

import { NAMED, namedStrain, namedKey, namesFound } from '../src/sim/named'
import { breadthOf, rankOf, toNextRank } from '../src/sim/rank'
import { strainKey } from '../src/sim/strain'
import { TRAITS, TRAIT_KEYS, TRAIT_SLOTS, type TraitKey } from '../src/sim/traits'
import { STRAIN_NAMES, RANK_NAMES, TRAIT_NAMES } from '../src/content/strings'
import { RANKS } from '../src/sim/balance'
import { bottle } from '../src/sim/actions'
import { summary } from '../src/view/reports'
import { createState, type GameState } from '../src/sim/state'
import { MSG } from '../src/content/strings'

const T0 = Date.UTC(2024, 0, 1, 12)

describe('таблица имён', () => {
  it('двадцать четыре имени, и у каждого есть русское название', () => {
    expect(NAMED).toHaveLength(24)
    expect(Object.keys(STRAIN_NAMES).sort()).toEqual(NAMED.map((n) => n.key).sort())
  })

  it('в каждой тройке три РАЗНЫХ существующих признака', () => {
    for (const n of NAMED) {
      expect(n.traits, n.key).toHaveLength(TRAIT_SLOTS)
      expect(new Set(n.traits).size, n.key).toBe(TRAIT_SLOTS)
      for (const key of n.traits) expect(TRAIT_KEYS, `${n.key}: ${key}`).toContain(key)
    }
  })

  it('одна тройка — одно имя: повторов в таблице нет', () => {
    const keys = NAMED.map(namedKey)
    expect(new Set(keys).size).toBe(NAMED.length)
  })

  it('имена не повторяются и не путаются с названиями признаков', () => {
    const names = Object.values(STRAIN_NAMES)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(Object.values(TRAIT_NAMES), name).not.toContain(name)
    }
  })

  it('«только обменом» помечены ровно те, где две семьи совпали', () => {
    for (const n of NAMED) {
      const families = new Set(n.traits.map((k) => TRAITS[k].family))
      expect(families.size < TRAIT_SLOTS, n.key).toBe(n.graftOnly)
    }
  })

  it('четыре имени невозможны в одиночку — иначе обмен нечем оправдать', () => {
    expect(NAMED.filter((n) => n.graftOnly)).toHaveLength(4)
  })
})

describe('поиск имени', () => {
  const pharmacy: TraitKey[] = ['healing', 'sterile', 'devoted']

  it('порядок признаков значения не имеет', () => {
    expect(namedStrain(pharmacy)?.key).toBe('pharmacy')
    expect(namedStrain(['devoted', 'healing', 'sterile'])?.key).toBe('pharmacy')
  })

  it('безымянная тройка — не ошибка, а обычное дело', () => {
    expect(namedStrain(['stout', 'motley', 'litigious'])).toBeNull()
  })

  it('неполный набор имени не имеет: штамм — это три признака', () => {
    expect(namedStrain(['healing', 'sterile'])).toBeNull()
    expect(namedStrain([])).toBeNull()
  })

  it('в реестре имена находятся по ключу набора', () => {
    const bred = [strainKey(pharmacy), strainKey(['stout', 'motley', 'litigious'])]
    expect(namesFound(bred).map((n) => n.key)).toEqual(['pharmacy'])
  })
})

describe('разряды', () => {
  it('у каждого разряда есть название', () => {
    expect(Object.keys(RANK_NAMES).sort()).toEqual(RANKS.map((r) => r.key).sort())
  })

  it('пороги растут, и ни один не пропускается', () => {
    for (let i = 1; i < RANKS.length; i++) {
      const prev = RANKS[i - 1]
      const next = RANKS[i]
      expect(next.strains, next.key).toBeGreaterThanOrEqual(prev.strains)
      expect(next.names, next.key).toBeGreaterThanOrEqual(prev.names)
      expect(next.traits, next.key).toBeGreaterThanOrEqual(prev.traits)
      // Хотя бы одна величина обязана вырасти, иначе разряд неразличим.
      expect(
        next.strains > prev.strains || next.names > prev.names || next.traits > prev.traits,
        next.key,
      ).toBe(true)
    }
  })

  it('пустой реестр — тоже разряд: без разряда никто не остаётся', () => {
    expect(rankOf([]).key).toBe('amateur')
  })

  it('высший разряд достижим — проверяется постройкой реестра', () => {
    // Двадцать первых имён: если этого не хватает на «заслуженного»,
    // порог выдуман, а не рассчитан.
    const bred = NAMED.slice(0, 20).map(namedKey)
    expect(rankOf(bred).key).toBe('honored')
    expect(toNextRank(bred)).toBeNull()
  })

  it('каждый разряд достижим и берётся всеми тремя величинами сразу', () => {
    // Одних штаммов мало: реестр из безымянных троек одного стиля упирается
    // в имена и признаки, и разряд не растёт.
    const narrow = Array.from({ length: 40 }, (_, i) =>
      strainKey(['stout', 'wiry', TRAIT_KEYS[i % 3 === 0 ? 20 : 21]]),
    )
    expect(rankOf(narrow).key).not.toBe('honored')
  })

  it('до следующего разряда показывается НЕДОСТАЮЩЕЕ, а не пороги', () => {
    const bred = NAMED.slice(0, 5).map(namedKey)
    const next = toNextRank(bred)
    expect(next).not.toBeNull()
    const b = breadthOf(bred)
    expect(next!.need.strains).toBe(Math.max(0, next!.rank.strains - b.strains))
    expect(next!.need.names).toBe(Math.max(0, next!.rank.names - b.names))
    for (const v of Object.values(next!.need)) expect(v).toBeGreaterThanOrEqual(0)
  })

  it('широта считает РАЗНЫЕ признаки, а не суммирует тройки', () => {
    const same = ['healing', 'sterile', 'devoted'] as TraitKey[]
    const bred = [strainKey(same), strainKey(['healing', 'sterile', 'early'])]
    expect(breadthOf(bred)).toEqual({ strains: 2, names: 1, traits: 4 })
  })

  it('битая запись в реестре не роняет подсчёт', () => {
    expect(breadthOf(['НЕКОД', strainKey(['stout'])]).traits).toBe(1)
  })
})

describe('имя штамма звучит при розливе', () => {
  const grown = (traits: TraitKey[], bred: string[] = []): GameState => ({
    ...createState(T0),
    growth: 1,
    mold: 0.05,
    traits,
    bred,
  })

  it('впервые выведенный именованный штамм объявляется как новый', () => {
    const r = bottle(grown(['healing', 'sterile', 'devoted']), T0)
    expect(r.msg).toContain('АПТЕЧНЫЙ')
    expect(r.msg).toContain('ВЫВЕДЕН')
  })

  it('повторный розлив того же — работа, а не событие', () => {
    const traits: TraitKey[] = ['healing', 'sterile', 'devoted']
    const r = bottle(grown(traits, [strainKey(traits)]), T0)
    expect(r.msg).toContain('АПТЕЧНЫЙ')
    expect(r.msg).not.toContain('ВЫВЕДЕН')
  })

  it('безымянная тройка разливается дежурной строкой', () => {
    const r = bottle(grown(['stout', 'motley', 'litigious']), T0)
    expect(r.msg).toBe(MSG.bottled)
  })

  it('разряд владельца стоит в сводке — там же, где реестр', () => {
    // Именно в summary(), а не в diagnose(): сводка — единственный экран,
    // который игрок читает, а отчёт службы в неё же и попадает.
    const owner = { ...createState(T0), bred: NAMED.slice(0, 20).map(namedKey), bottlings: 31 }
    const lines = summary(owner, 0).lines.join(' ')
    expect(lines).toContain(RANK_NAMES.honored)
    expect(lines).toContain('ВЫВЕДЕНО 20')
    expect(lines).toContain('РОЗЛИВОВ 31')
  })

  it('разряд виден и у погибшего объекта: он про владельца', () => {
    const owner = { ...createState(T0), alive: false, bred: NAMED.slice(0, 20).map(namedKey) }
    expect(summary(owner, 0).lines.join(' ')).toContain(RANK_NAMES.honored)
  })
})
