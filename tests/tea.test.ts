/**
 * Сорта заварки: выбор при каждой подаче.
 *
 * Проверяется не только арифметика сдвигов, но и главное свойство замысла —
 * ни один сорт не должен быть правильным ответом всегда. Как только он таким
 * станет, выбор снова превратится в обязанность, а обязанностей в игре и так
 * достаточно.
 */

import { describe, expect, it } from 'vitest'

import { createState, emptyPoured, type GameState } from '../src/sim/state'
import { feed, bottle } from '../src/sim/actions'
import { dominantTea } from '../src/sim/derive'
import * as B from '../src/sim/balance'
import { POUR } from '../src/content/strings'
import { journalLine } from '../src/view/reports'

const T0 = 1_700_000_000_000

/** Объект в середине жизни: сытость и плесень не у краёв, обрезки не мешают. */
const mid = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.4,
  mold: 0.3,
  growth: 0.4,
  resentment: 0.4,
  ...over,
})

/** Кормить можно: кулдаун у новорождённого объекта заведомо истёк. */
const near = (s: GameState) => s.lastFedAt + B.FEED_COOLDOWN_MS + 1

describe('сдвиги сортов', () => {
  it('каждый сорт даёт ровно заявленные сдвиги и ничего сверх', () => {
    for (const key of B.TEA_KEYS) {
      const before = mid()
      const recipe = B.TEAS[key]
      const after = feed(before, near(before), key).state

      expect(after.food, key).toBeCloseTo(before.food + recipe.food, 10)
      expect(after.growth, key).toBeCloseTo(before.growth + recipe.growth, 10)
      expect(after.mold, key).toBeCloseTo(before.mold + recipe.mold, 10)
      expect(after.resentment, key).toBeCloseTo(before.resentment - recipe.forgive, 10)

      // Всё прочее подача не трогает.
      expect(after.alive).toBe(before.alive)
      expect(after.generation).toBe(before.generation)
      expect(after.ageMs).toBe(before.ageMs)
      expect(after.journal).toEqual(before.journal)
    }
  })

  it('величины остаются в границах 0…1 даже на краях', () => {
    for (const key of B.TEA_KEYS) {
      const full = mid({ food: 1, mold: 1, growth: 1, resentment: 0 })
      const after = feed(full, near(full), key).state
      for (const v of [after.food, after.mold, after.growth, after.resentment]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('ни один сорт не лучше другого по всем величинам сразу', () => {
    // Больше — лучше для сытости, роста и прощения; для плесени наоборот,
    // поэтому знак у неё перевёрнут.
    const axes = (k: B.TeaKey) => {
      const r = B.TEAS[k]
      return [r.food, r.growth, -r.mold, r.forgive]
    }

    for (const a of B.TEA_KEYS) {
      for (const b of B.TEA_KEYS) {
        if (a === b) continue
        const [x, y] = [axes(a), axes(b)]
        const dominates = x.every((v, i) => v >= y[i]) && x.some((v, i) => v > y[i])
        expect(dominates, `${a} строго лучше, чем ${b} — выбора больше нет`).toBe(false)
      }
    }
  })

  it('имбирь мирит с обиженным быстрее прочих', () => {
    // Обещание игры: обиженному завариваешь другое.
    const sulking = mid({ resentment: 0.8 })
    const after = B.TEA_KEYS.map((k) => feed(sulking, near(sulking), k).state.resentment)
    const ginger = feed(sulking, near(sulking), 'ginger').state.resentment
    expect(Math.min(...after)).toBe(ginger)
  })

  it('зелёный растит, но и киснет — за скорость платят мытьём', () => {
    const s = mid()
    const green = feed(s, near(s), 'green').state
    expect(green.growth).toBeGreaterThan(s.growth)
    expect(green.mold).toBeGreaterThan(s.mold)
  })

  it('перелив закисает средой поверх сорта, а не вместо него', () => {
    const stuffed = mid({ food: B.OVERFEED_ABOVE + 0.01, mold: 0.2 })
    const res = feed(stuffed, near(stuffed), 'green')
    expect(res.state.mold).toBeCloseTo(stuffed.mold + B.TEAS.green.mold + B.OVERFEED_MOLD, 10)
  })

  it('кулдаун и смерть отменяют подачу любого сорта', () => {
    for (const key of B.TEA_KEYS) {
      const s = mid()
      expect(feed(s, s.lastFedAt + 1, key).rejected, key).toBe(true)
      const dead = mid({ alive: false })
      expect(feed(dead, near(dead), key).rejected, key).toBe(true)
      // Отказ ничего не считает: счётчик остаётся нетронутым.
      expect(feed(dead, near(dead), key).state.poured).toEqual(emptyPoured())
    }
  })

  it('без указания сорта подача остаётся прежней — чёрным', () => {
    // Старые вызовы не должны молча менять баланс.
    const s = mid()
    expect(feed(s, near(s)).state).toEqual(feed(s, near(s), 'black').state)
  })
})

describe('счётчик поданного', () => {
  it('подача увеличивает счётчик своего сорта и только его', () => {
    let s = mid()
    s = feed(s, near(s), 'green').state
    expect(s.poured).toEqual({ ...emptyPoured(), green: 1 })
    s = feed(s, near(s), 'green').state
    s = feed(s, near(s), 'ginger').state
    expect(s.poured).toEqual({ ...emptyPoured(), green: 2, ginger: 1 })
  })

  it('преобладающий сорт — тот, которого больше', () => {
    expect(dominantTea(mid({ poured: { black: 1, green: 4, ginger: 2 } }))).toBe('green')
  })

  it('при ничьей преобладающего сорта нет', () => {
    expect(dominantTea(mid({ poured: { black: 3, green: 3, ginger: 1 } }))).toBe(null)
  })

  it('у ещё не кормленного объекта преобладающего сорта нет', () => {
    expect(dominantTea(mid())).toBe(null)
  })
})

describe('сорт партии', () => {
  const ripe = (poured: Record<B.TeaKey, number>) =>
    mid({ growth: 1, mold: 0.05, poured })

  it('преобладающий сорт попадает в запись о партии', () => {
    const s = ripe({ black: 1, green: 0, ginger: 5 })
    const entry = bottle(s, T0).state.journal.at(-1)!
    expect(entry.kind).toBe('batch')
    expect(entry.tea).toBe('ginger')
    expect(journalLine(entry)).toContain(POUR.batch.ginger)
    expect(journalLine(entry)).toContain('ВЫСШЕЕ')
  })

  it('поили вразнобой — партия выходит без сорта', () => {
    const s = ripe({ black: 2, green: 2, ginger: 0 })
    const entry = bottle(s, T0).state.journal.at(-1)!
    expect(entry.tea).toBe(null)
    const line = journalLine(entry)
    for (const name of Object.values(POUR.batch)) expect(line).not.toContain(name)
    expect(line).toContain('ПАРТИЯ')
  })

  it('новое поколение начинает счёт сортов заново', () => {
    const s = ripe({ black: 0, green: 7, ginger: 0 })
    expect(bottle(s, T0).state.poured).toEqual(emptyPoured())
  })
})
