/**
 * Задание на селекцию.
 *
 * Задание — единственный руль в игре, где признаки закрепляются сами. Его
 * обещание узкое и его легко нарушить незаметно: оно НЕ выдаёт признаки
 * и НЕ смягчает условий, а только перестаёт мешать. Здесь проверяется обе
 * половины — что оно действительно помогает и что оно ничего не дарит.
 */

import { describe, expect, it } from 'vitest'

import { earnedTraits, cullOrder, TRAITS, type TraitKey } from '../src/sim/traits'
import { namedByKey, namedKey } from '../src/sim/named'
import { bottle } from '../src/sim/actions'
import { createState, type GameState } from '../src/sim/state'
import { load, save } from '../src/sim/persist'
import { strainKey } from '../src/sim/strain'
import { MSG } from '../src/content/strings'

const T0 = Date.UTC(2024, 0, 1, 12)

const memory = (): Storage => {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

/**
 * Гриб, заслуживший СРАЗУ и СТЕРИЛЬНОГО, и МЫТОГО: оба из семьи среды, место
 * достанется одному. СТЕРИЛЬНЫЙ выразительнее (3 против 2) и без задания
 * побеждает — на этой паре и видно, работает ли руль.
 */
const both = (): GameState => ({
  ...createState(T0),
  ageMs: 40 * 3 * 3600_000,
  fedAtAge: 40 * 3 * 3600_000,
  maxMold: 0.05,
  tally: { clean: 20 },
})

describe('задание правит очередь признаков', () => {
  it('без задания побеждает более выразительный признак семьи', () => {
    const s = both()
    expect(TRAITS.sterile.rank).toBeGreaterThan(TRAITS.scrubbed.rank)
    expect(earnedTraits(s)).toContain('sterile')
    expect(earnedTraits(s)).not.toContain('scrubbed')
  })

  it('с заданием вперёд выходит нужный, даже будучи менее выразительным', () => {
    // ЗАВОДСКОЙ требует МЫТОГО. Без задания его место забрал бы СТЕРИЛЬНЫЙ.
    const s = { ...both(), target: 'factory' }
    expect(namedByKey('factory')?.traits).toContain('scrubbed')
    expect(earnedTraits(s)).toContain('scrubbed')
    expect(earnedTraits(s)).not.toContain('sterile')
  })

  it('задание не выдаёт признак, условие которого не выполнено', () => {
    // АПТЕЧНЫЙ требует ЦЕЛЕБНОГО, а имбирь никто не заваривал.
    const s = { ...both(), target: 'pharmacy' }
    expect(earnedTraits(s)).not.toContain('healing')
  })

  it('несуществующее задание ничего не меняет', () => {
    const s = both()
    expect(earnedTraits({ ...s, target: 'нет-такого' })).toEqual(earnedTraits(s))
  })
})

describe('выбраковка бережёт собранное', () => {
  const holding: TraitKey[] = ['healing', 'sterile', 'stout']

  it('под кнопки не попадает ни один признак задания, пока есть чем занять', () => {
    // Бланк умещает две кнопки исключения — важен именно порядок. АПТЕЧНЫЙ
    // требует ЦЕЛЕБНОГО, из держимых он один: две другие кнопки достаются
    // посторонним признакам, и наполовину собранная цель цела.
    const s = { ...createState(T0), traits: ['healing', 'stout', 'wiry'] as TraitKey[] }
    const order = cullOrder({ ...s, target: 'pharmacy' })
    expect(order.slice(0, 2)).toEqual(['stout', 'wiry'])
    expect(order[2]).toBe('healing')
  })

  it('когда посторонний признак один, вторая кнопка неизбежно берёт нужный', () => {
    // Отказаться от нового признака целиком всё ещё можно третьей кнопкой:
    // задание сужает выбор, но не запирает бланк.
    const order = cullOrder({ ...createState(T0), traits: holding, target: 'pharmacy' })
    expect(order[0]).toBe('stout')
    expect(order.slice(1)).toEqual(['healing', 'sterile'])
  })

  it('без задания порядок остаётся тем, в каком признаки получены', () => {
    expect(cullOrder({ ...createState(T0), traits: holding, target: null })).toEqual(holding)
  })

  it('когда всё занято признаками задания, выбор всё равно есть', () => {
    // Иначе бланк остался бы без кнопок исключения, и выйти из него можно
    // было бы только отказом от нового признака.
    const all: TraitKey[] = ['healing', 'sterile', 'devoted']
    const order = cullOrder({ ...createState(T0), traits: all, target: 'pharmacy' })
    expect(order).toHaveLength(3)
    expect(new Set(order)).toEqual(new Set(all))
  })
})

describe('розлив закрывает задание', () => {
  const ready = (traits: TraitKey[], target: string | null): GameState => ({
    ...createState(T0),
    growth: 1,
    mold: 0.05,
    traits,
    target,
  })

  it('выполненное задание важнее новизны штамма', () => {
    const r = bottle(ready(['healing', 'sterile', 'devoted'], 'pharmacy'), T0)
    expect(r.msg).toBe(MSG.targetDone('АПТЕЧНЫЙ'))
  })

  it('после розлива цели задание снимается — оно выполнено', () => {
    const r = bottle(ready(['healing', 'sterile', 'devoted'], 'pharmacy'), T0)
    expect(r.state.target).toBeNull()
  })

  it('чужой штамм задание не закрывает', () => {
    const r = bottle(ready(['stout', 'motley', 'litigious'], 'pharmacy'), T0)
    expect(r.state.target).toBe('pharmacy')
    expect(r.msg).toBe(MSG.bottled)
  })

  it('задание переживает смену поколения — оно про владельца', () => {
    const r = bottle(ready(['stout', 'motley', 'litigious'], 'factory'), T0)
    expect(r.state.generation).toBe(2)
    expect(r.state.target).toBe('factory')
  })
})

describe('задание в сохранении', () => {
  it('переживает перезагрузку', () => {
    const store = memory()
    save({ ...createState(T0), target: 'lab' }, store)
    expect(load(T0, store).state.target).toBe('lab')
  })

  it('у прежних сохранений его нет, и это честный ноль', () => {
    const store = memory()
    const old = { ...createState(T0) } as Record<string, unknown>
    delete old.target
    store.setItem('gribochi.save.v1', JSON.stringify(old))
    expect(load(T0, store).state.target).toBeNull()
  })

  it('задание на исчезнувший штамм не висит невыполнимым', () => {
    const store = memory()
    save({ ...createState(T0), target: 'штамм-которого-нет' }, store)
    expect(load(T0, store).state.target).toBeNull()
  })

  it('ключ задания указывает на настоящую тройку', () => {
    const lab = namedByKey('lab')
    expect(lab).not.toBeNull()
    expect(namedKey(lab!)).toBe(strainKey([...lab!.traits]))
  })
})
