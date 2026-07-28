/**
 * Симуляция чистая и детерминированная, поэтому проверяется без моков часов
 * и без ожидания: подставляем нужный момент времени и смотрим результат.
 */

import { describe, expect, it } from 'vitest'

import { advance } from '../src/sim/tick'
import { createState, type GameState } from '../src/sim/state'
import { feed, clean, nextGeneration, bottle } from '../src/sim/actions'
import { dayOf, moodOf } from '../src/sim/derive'
import { load, save, wipe } from '../src/sim/persist'
import * as B from '../src/sim/balance'

const T0 = 1_700_000_000_000
const hours = (h: number) => h * 3_600_000
const gameDays = (d: number) => d * B.GAME_DAY_MS

/** Образцовый владелец: кормит по мере надобности и вовремя меняет среду. */
function careFor(days: number, from = T0): GameState {
  let s = createState(from)
  let now = from
  const end = from + gameDays(days)
  while (now < end) {
    now += B.FEED_COOLDOWN_MS
    s = advance(s, now)
    if (s.food < 0.5) s = feed(s, now).state
    if (s.mold > 0.3) s = clean(s, now).state
  }
  return advance(s, end)
}

describe('ход времени', () => {
  it('полный бак пустеет ровно за четыре игровых дня', () => {
    const s = createState(T0)
    const full = { ...s, food: 1 }

    const almost = advance(full, T0 + gameDays(3.9))
    expect(almost.food).toBeGreaterThan(0)

    const empty = advance(full, T0 + gameDays(4.1))
    expect(empty.food).toBe(0)
  })

  it('четыре игровых дня — это двенадцать реальных часов', () => {
    expect(gameDays(4)).toBe(hours(12))
  })

  it('при исправном уходе гриб дорастает до максимума примерно за 29 игровых дней', () => {
    const s = careFor(30)
    expect(s.alive).toBe(true)
    expect(s.growth).toBeGreaterThan(0.95)
  })

  it('рост стоит, пока объект голоден', () => {
    const hungry = advance({ ...createState(T0), food: 0.2, growth: 0.4 }, T0 + gameDays(3))
    expect(hungry.growth).toBe(0.4)
  })

  it('рост необратим: голодающий гриб не уменьшается', () => {
    const s = advance({ ...createState(T0), food: 0, growth: 0.6 }, T0 + gameDays(2))
    expect(s.growth).toBe(0.6)
  })
})

describe('смерть', () => {
  it('сутки полного забвения убивают', () => {
    const s = advance({ ...createState(T0), food: 1 }, T0 + hours(27))
    expect(s.alive).toBe(false)
    expect(s.mold).toBeGreaterThanOrEqual(1)
  })

  it('через двенадцать часов забвения гриб ещё жив', () => {
    const s = advance({ ...createState(T0), food: 1 }, T0 + hours(12))
    expect(s.alive).toBe(true)
  })

  it('записывает день смерти, а не день возвращения игрока', () => {
    const dead = advance({ ...createState(T0), food: 1 }, T0 + hours(24 * 5))
    expect(dead.alive).toBe(false)
    // Гриб умер на исходе первых суток — это девятый игровой день, а не сороковой.
    expect(dead.deathDay).toBeLessThan(12)
    expect(dayOf(dead)).toBe(dead.deathDay)
  })

  it('мёртвому время больше не идёт', () => {
    const dead = advance({ ...createState(T0), food: 1 }, T0 + hours(30))
    const later = advance(dead, T0 + hours(300))
    expect(later.deathDay).toBe(dead.deathDay)
    expect(later.mold).toBe(dead.mold)
  })
})

describe('оффлайн-догон', () => {
  it('прыжок на трое суток равен той же цепочке последовательных тиков', () => {
    const start = { ...createState(T0), food: 1 }
    const jump = advance(start, T0 + hours(72))

    let stepwise = start
    for (let i = 1; i <= 72; i++) stepwise = advance(stepwise, T0 + hours(i))

    expect(jump.food).toBeCloseTo(stepwise.food, 10)
    expect(jump.mold).toBeCloseTo(stepwise.mold, 10)
    expect(jump.growth).toBeCloseTo(stepwise.growth, 10)
    expect(jump.alive).toBe(stepwise.alive)
  })

  it('перевод часов назад не откатывает состояние', () => {
    const s = advance({ ...createState(T0), food: 1 }, T0 + hours(6))
    const back = advance(s, T0 - hours(50))
    expect(back).toBe(s)
  })
})

describe('обида', () => {
  it('кормление возвращает сытость мгновенно, а лицо — нет', () => {
    const offended = advance({ ...createState(T0), food: 1 }, T0 + hours(20))
    expect(offended.alive).toBe(true)
    expect(moodOf(offended)).toBe('away')

    const fed = feed(offended, T0 + hours(20)).state
    expect(fed.food).toBeGreaterThan(0.4)
    expect(moodOf(fed)).toBe('away')
  })

  it('несколько кормлений и время всё-таки возвращают гриб', () => {
    let s = advance({ ...createState(T0), food: 1 }, T0 + hours(20))
    let now = T0 + hours(20)
    for (let i = 0; i < 12; i++) {
      now += B.FEED_COOLDOWN_MS * 2
      s = advance(s, now)
      s = feed(s, now).state
    }
    expect(moodOf(s)).not.toBe('away')
  })

  it('гриб отворачивается заметно раньше, чем умирает — иначе извиняться не перед кем', () => {
    let s: GameState = { ...createState(T0), food: 1 }
    let awayAt = 0
    let deadAt = 0
    for (let h = 1; h <= 48 && !deadAt; h++) {
      s = advance(s, T0 + hours(h))
      if (!awayAt && moodOf(s) === 'away') awayAt = h
      if (!s.alive) deadAt = h
    }
    expect(awayAt).toBeGreaterThan(0)
    expect(deadAt).toBeGreaterThan(awayAt + 4)
  })

  it('обида не тает, пока гриб голоден', () => {
    const s = { ...createState(T0), resentment: 0.8, food: 0.2 }
    expect(advance(s, T0 + gameDays(2)).resentment).toBeGreaterThanOrEqual(0.8)
  })
})

describe('действия', () => {
  it('самое первое нажатие ЧАЙ срабатывает сразу, а не упирается в кулдаун', () => {
    const fresh = createState(T0)
    const r = feed(fresh, T0)
    expect(r.rejected).toBeFalsy()
    expect(r.state.food).toBeGreaterThan(fresh.food)
    expect(clean(fresh, T0).rejected).toBeFalsy()
  })

  it('кормить чаще раза в пятнадцать минут нельзя', () => {
    const s = createState(T0)
    const first = feed(s, T0 + B.FEED_COOLDOWN_MS)
    expect(first.rejected).toBeFalsy()
    const second = feed(first.state, T0 + B.FEED_COOLDOWN_MS + 60_000)
    expect(second.rejected).toBe(true)
    expect(second.state).toBe(first.state)
  })

  it('перекорм закисает средой, а не запретом', () => {
    const full = { ...createState(T0), food: 0.95, lastFedAt: 0 }
    const r = feed(full, T0)
    expect(r.rejected).toBeFalsy()
    expect(r.state.mold).toBeGreaterThan(full.mold)
  })

  it('промывка снимает плесень ценой питания и остановки роста', () => {
    const dirty = { ...createState(T0), mold: 0.8, food: 0.9, lastCleanedAt: 0 }
    const r = clean(dirty, T0)
    expect(r.state.mold).toBeCloseTo(0.3, 5)
    expect(r.state.food).toBeLessThan(dirty.food)

    const later = advance(r.state, T0 + B.CLEAN_STRESS_MS / 2)
    expect(later.growth).toBe(dirty.growth)
  })
})

describe('поколения', () => {
  it('доросший гриб оставляет дочерний слой', () => {
    const dead = { ...createState(T0), growth: 0.7, alive: false, deathAt: T0, deathDay: 9 }
    const r = nextGeneration(dead, T0)
    expect(r.state.generation).toBe(2)
    expect(r.state.growth).toBe(B.DAUGHTER_START_GROWTH)
    expect(r.state.alive).toBe(true)
    expect(r.state.journal).toHaveLength(1)
  })

  it('не доросший — не оставляет, и счёт начинается заново', () => {
    const dead = { ...createState(T0), growth: 0.2, alive: false, deathAt: T0, deathDay: 4 }
    const r = nextGeneration(dead, T0)
    expect(r.state.generation).toBe(1)
    // Журнал переносится всегда — он и есть память игрока о прошлых грибах.
    expect(r.state.journal).toHaveLength(1)
  })

  it('розлив доступен только доросшему и запускает следующее поколение', () => {
    const young = { ...createState(T0), growth: 0.8 }
    expect(bottle(young, T0).rejected).toBe(true)

    const ripe = { ...createState(T0), growth: 1 }
    const r = bottle(ripe, T0)
    expect(r.rejected).toBeFalsy()
    expect(r.state.generation).toBe(2)
    expect(r.state.growth).toBe(B.BOTTLED_START_GROWTH)
    expect(r.state.resentFactor).toBeLessThan(1)
  })
})

describe('сохранение', () => {
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

  it('переживает перезагрузку и досчитывает пропущенное время', () => {
    const store = memory()
    save({ ...createState(T0), food: 1 }, store)

    const back = load(T0 + hours(6), store)
    expect(back.fresh).toBe(false)
    expect(back.awayMs).toBe(hours(6))
    expect(back.state.food).toBeLessThan(1)
    expect(back.state.alive).toBe(true)
  })

  it('битое сохранение не роняет игру, а начинает заново', () => {
    const store = memory()
    store.setItem('gribochi.save.v1', '{ это не json')
    expect(load(T0, store).fresh).toBe(true)

    store.setItem('gribochi.save.v1', JSON.stringify({ version: 99 }))
    expect(load(T0, store).fresh).toBe(true)
  })

  it('стёртое сохранение начинает новую жизнь', () => {
    const store = memory()
    save(createState(T0), store)
    wipe(store)
    expect(load(T0, store).fresh).toBe(true)
  })
})
