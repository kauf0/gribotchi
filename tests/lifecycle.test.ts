/**
 * Жизненный цикл целиком и краевые случаи, до которых обычная игра доходит
 * редко, а поломка в них тихая: смена поколений, наследование, устойчивость
 * к дикому времени и к порченому сохранению.
 */

import { describe, expect, it } from 'vitest'

import { advance, step } from '../src/sim/tick'
import { clamp01, createState, SAVE_VERSION, type GameState } from '../src/sim/state'
import { bottle, clean, feed, nextGeneration, sos } from '../src/sim/actions'
import { canBottle, dayOf, moodOf, overdueDays } from '../src/sim/derive'
import { load, save } from '../src/sim/persist'
import * as B from '../src/sim/balance'

const T0 = 1_700_000_000_000
const hours = (h: number) => h * 3_600_000
const gameDays = (d: number) => d * B.GAME_DAY_MS

const memory = (): Storage => {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
}

describe('границы значений', () => {
  it('clamp01 держит любую дичь в отрезке', () => {
    expect(clamp01(-5)).toBe(0)
    expect(clamp01(5)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })

  it('параметры никогда не выходят за 0…1, как их ни гоняй', () => {
    let s: GameState = { ...createState(T0), food: 1, mold: 0, growth: 0 }
    for (let i = 0; i < 400; i++) {
      s = advance(s, T0 + i * hours(1))
      if (i % 7 === 0) s = feed(s, T0 + i * hours(1)).state
      if (i % 23 === 0) s = clean(s, T0 + i * hours(1)).state
      for (const v of [s.food, s.growth, s.mold, s.resentment]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('шаг нулевой длины ничего не меняет', () => {
    const s = createState(T0)
    expect(step(s, 0, T0)).toBe(s)
    expect(step(s, -1, T0)).toBe(s)
  })

  it('отрезок короче шага симуляции откладывается на потом', () => {
    const s = { ...createState(T0), food: 1 }
    expect(advance(s, T0 + B.STEP_MS - 1)).toBe(s)
    expect(advance(s, T0 + B.STEP_MS).food).toBeLessThan(1)
  })
})

describe('устойчивость к дикому времени', () => {
  it('год отсутствия не роняет и не даёт бесконечностей', () => {
    const s = advance({ ...createState(T0), food: 1 }, T0 + hours(24 * 365))
    expect(s.alive).toBe(false)
    expect(Number.isFinite(s.mold)).toBe(true)
    expect(s.deathDay).toBeGreaterThan(0)
  })

  it('повторный догон до того же момента ничего не меняет', () => {
    const once = advance({ ...createState(T0), food: 1 }, T0 + hours(5))
    const twice = advance(once, T0 + hours(5))
    expect(twice).toBe(once)
  })

  it('новорождённый объект живёт первый день, когда бы он ни родился', () => {
    expect(dayOf(createState(T0 + hours(1000)))).toBe(1)
    expect(dayOf(createState(0))).toBe(1)
  })

  it('день и параметры идут одними шагами и не расходятся', () => {
    // Ровно та поломка, из-за которой после ускорения времени и перезагрузки
    // сытость оставалась низкой, а счётчик дней падал в единицу.
    const s = advance({ ...createState(T0), food: 1 }, T0 + gameDays(6))
    expect(dayOf(s)).toBe(7)
    // Настенные часы к номеру дня отношения не имеют.
    expect(dayOf({ ...s, bornAt: T0 - gameDays(300) })).toBe(7)
  })
})

describe('смена поколений', () => {
  it('успешный цикл: вырастить, разлить, начать заново — и так дважды', () => {
    let s: GameState = { ...createState(T0), growth: 1 }
    const first = bottle(s, T0)
    expect(first.state.generation).toBe(2)
    expect(canBottle(first.state)).toBe(false)

    s = { ...first.state, growth: 1 }
    const second = bottle(s, T0 + hours(1))
    expect(second.state.generation).toBe(3)
    expect(second.state.journal).toHaveLength(2)
  })

  it('наследственная терпимость копится, но упирается в предел', () => {
    let s: GameState = { ...createState(T0), growth: 1 }
    for (let i = 0; i < 20; i++) s = { ...bottle(s, T0 + i * hours(1)).state, growth: 1 }
    expect(s.resentFactor).toBeGreaterThanOrEqual(B.HEIR_RESENT_FACTOR_MIN)
    expect(s.resentFactor).toBeLessThan(1)
  })

  it('терпимый наследник и правда копит обиду медленнее', () => {
    const at = (resentFactor: number) =>
      advance({ ...createState(T0), food: 0, resentFactor }, T0 + gameDays(2)).resentment

    expect(at(B.HEIR_RESENT_FACTOR_MIN)).toBeLessThan(at(1))
  })

  it('качество партии зависит от чистоты среды', () => {
    const quality = (mold: number) =>
      bottle({ ...createState(T0), growth: 1, mold }, T0).state.journal[0].text

    expect(quality(0.05)).toContain('ВЫСШЕЕ')
    expect(quality(0.3)).toContain('ПЕРВОЕ')
    expect(quality(0.7)).toContain('ВТОРОЕ')
  })

  it('новое поколение начинает здоровым и живым', () => {
    const dead = { ...createState(T0), growth: 0.9, alive: false, deathAt: T0, deathDay: 20 }
    const next = nextGeneration(dead, T0).state
    expect(next.alive).toBe(true)
    expect(next.mold).toBe(0)
    expect(next.resentment).toBe(0)
    expect(next.deathAt).toBeNull()
    expect(moodOf(next)).not.toBe('dead')
  })

  it('журнал накапливается через смерти и розливы, а не обнуляется', () => {
    let s: GameState = { ...createState(T0), growth: 1 }
    s = bottle(s, T0).state
    s = { ...s, alive: false, deathDay: 5, growth: 0.6 }
    s = nextGeneration(s, T0 + hours(2)).state
    s = { ...s, growth: 1 }
    s = bottle(s, T0 + hours(3)).state
    expect(s.journal).toHaveLength(3)
  })

  it('дважды продолжить род с одного трупа нельзя — он уже не мёртв', () => {
    const dead = { ...createState(T0), growth: 0.9, alive: false, deathDay: 7 }
    const heir = nextGeneration(dead, T0).state
    expect(heir.alive).toBe(true)
    // Кнопка продолжения рода доступна только мёртвому — см. controller.test.ts.
  })
})

describe('СОС', () => {
  it('никогда не трогает состояние объекта', () => {
    const s = { ...createState(T0), food: 0.3, mold: 0.5 }
    const r = sos(s)
    expect(r.state).toBe(s)
    expect(r.report && r.report.length).toBeGreaterThan(0)
  })

  it('работает и над мёртвым', () => {
    const dead = { ...createState(T0), alive: false, deathDay: 9 }
    expect(sos(dead).report?.join(' ')).toContain('ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ')
  })
})

describe('сохранение', () => {
  it('переживает полный цикл со сменой поколения', () => {
    const store = memory()
    let s: GameState = { ...createState(T0), growth: 1 }
    s = bottle(s, T0).state
    save(s, store)

    const back = load(T0 + hours(2), store).state
    expect(back.generation).toBe(2)
    expect(back.journal).toHaveLength(1)
    expect(back.resentFactor).toBeCloseTo(s.resentFactor, 10)
  })

  it('сохранение из будущего не уводит игру в минус', () => {
    const store = memory()
    // Игрок перевёл часы вперёд, поиграл и вернул назад.
    save({ ...createState(T0 + hours(100)), food: 1 }, store)
    const back = load(T0, store)
    expect(back.awayMs).toBe(0)
    expect(back.state.food).toBeLessThanOrEqual(1)
    expect(Number.isFinite(back.state.food)).toBe(true)
  })

  it('метки времени из будущего подрезаются, иначе игра застревает', () => {
    // Так выглядит сохранение после отладочного ускорителя: покормили при ×600,
    // и lastFedAt уехал на часы вперёд. Часы вернулись к настоящим — и кулдаун
    // кормления не истечёт, пока реальное время не догонит.
    const store = memory()
    save(
      {
        ...createState(T0),
        bornAt: T0 + hours(50),
        lastTick: T0 + hours(50),
        lastFedAt: T0 + hours(50),
        lastCleanedAt: T0 + hours(50),
      },
      store,
    )

    const back = load(T0, store).state
    expect(back.lastFedAt).toBeLessThanOrEqual(T0)
    expect(back.lastCleanedAt).toBeLessThanOrEqual(T0)
    expect(back.bornAt).toBeLessThanOrEqual(T0)
    // И кормить можно сразу, а не через двое суток ожидания.
    expect(feed(back, T0).rejected).toBeFalsy()
  })

  it('день после подрезки остаётся осмысленным', () => {
    const store = memory()
    save({ ...createState(T0), bornAt: T0 + hours(200) }, store)
    expect(dayOf(load(T0, store).state)).toBe(1)
  })

  it('стресс после промывки не уезжает в будущее на сутки', () => {
    const store = memory()
    save({ ...createState(T0), stressUntil: T0 + hours(90) }, store)
    const back = load(T0, store).state
    expect(back.stressUntil).toBeLessThanOrEqual(T0 + B.CLEAN_STRESS_MS)
    // Значит рост возобновится в срок, а не через четверо суток.
    expect(advance({ ...back, food: 1 }, T0 + B.CLEAN_STRESS_MS + gameDays(1)).growth).toBeGreaterThan(
      back.growth,
    )
  })

  it('старое сохранение без возраста не теряет прожитые дни', () => {
    // Поле ageMs появилось позже; у прежних сохранений возраст восстанавливается
    // из разницы меток, иначе номер дня обнулился бы при обновлении игры.
    const store = memory()
    const old = { ...createState(T0), food: 0.2 } as Partial<GameState>
    old.bornAt = T0 - gameDays(9)
    old.lastTick = T0
    old.lastFedAt = T0 - gameDays(3)
    delete old.ageMs
    delete old.fedAtAge
    store.setItem('gribochi.save.v1', JSON.stringify(old))

    const back = load(T0, store).state
    expect(dayOf(back)).toBe(10)
    expect(overdueDays(back)).toBe(3)
  })

  it('обрезанное сохранение отбрасывается целиком', () => {
    const store = memory()
    const broken = { ...createState(T0) } as Partial<GameState>
    delete broken.food
    store.setItem('gribochi.save.v1', JSON.stringify(broken))
    expect(load(T0, store).fresh).toBe(true)
  })

  it('сохранение с бесконечностью отбрасывается', () => {
    const store = memory()
    // JSON.stringify превращает Infinity в null — проверяем, что и это ловится.
    store.setItem('gribochi.save.v1', JSON.stringify({ ...createState(T0), food: Infinity }))
    expect(load(T0, store).fresh).toBe(true)
  })

  it('версия схемы проверяется', () => {
    expect(createState(T0).version).toBe(SAVE_VERSION)
    const store = memory()
    store.setItem('gribochi.save.v1', JSON.stringify({ ...createState(T0), version: 2 }))
    expect(load(T0, store).fresh).toBe(true)
  })

  it('без хранилища игра всё равно запускается', () => {
    // Приватный режим: localStorage может отсутствовать или бросать.
    expect(load(T0, null).fresh).toBe(true)
    expect(() => save(createState(T0), null)).not.toThrow()
  })
})
