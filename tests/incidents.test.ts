/**
 * Происшествия на возвращении: «пока вас не было, случилось X».
 *
 * Проверяется и выбор происшествия, и последствия каждого из трёх ответов.
 * Случайности здесь нет намеренно — происшествие выбирает обстановка в банке,
 * поэтому перебрать можно всё до конца.
 */

import { describe, expect, it } from 'vitest'

import { createState, type GameState } from '../src/sim/state'
import { incidentFor, answer, ANSWERS } from '../src/sim/incidents'
import { journalLine } from '../src/view/reports'
import { INCIDENT } from '../src/content/strings'
import * as B from '../src/sim/balance'

const T0 = 1_700_000_000_000
const hours = (n: number) => n * 3600_000

/** Образцовая банка: ни плесени, ни голода, ни лишнего роста. */
const tidy = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.7,
  growth: 0.3,
  mold: 0.1,
  resentment: 0.1,
  ...over,
})

/** Отлучка, которой хватает на доклад. */
const away = B.ABSENCE_WORTH_NOTING_MS + 1

describe('когда прибор докладывает', () => {
  it('в образцовой банке не случается ничего — и это тоже ответ', () => {
    expect(incidentFor(tidy(), away, T0)).toBe(null)
  })

  it('короткая отлучка происшествия не стоит', () => {
    // Закрытая на обед вкладка — не событие.
    const s = tidy({ mold: 0.8 })
    expect(incidentFor(s, B.ABSENCE_WORTH_NOTING_MS - 1, T0)).toBe(null)
    expect(incidentFor(s, away, T0)).not.toBe(null)
  })

  it('мёртвому объекту происшествий не бывает', () => {
    expect(incidentFor(tidy({ mold: 0.8, alive: false }), away, T0)).toBe(null)
  })

  it('происшествие выбирает обстановка, а не жребий', () => {
    expect(incidentFor(tidy({ mold: B.INCIDENT_FLIES_MOLD + 0.01 }), away, T0)).toBe('flies')
    expect(incidentFor(tidy({ food: B.INCIDENT_CLOUDY_FOOD - 0.01 }), away, T0)).toBe('cloudy')
    expect(incidentFor(tidy({ growth: B.INCIDENT_NEIGHBOUR_GROWTH + 0.01 }), away, T0)).toBe(
      'neighbour',
    )
  })

  it('один и тот же вход всегда даёт один и тот же исход', () => {
    // Случайности нет, значит перезагрузка не «перекатывает» происшествие.
    const s = tidy({ mold: 0.5, food: 0.1, growth: 0.9 })
    const once = incidentFor(s, away, T0)
    for (let i = 0; i < 20; i++) expect(incidentFor(s, away, T0)).toBe(once)
  })

  it('худшее опережает терпимое', () => {
    // Плесень важнее помутнения, помутнение важнее просьбы соседа.
    const all = tidy({ mold: 0.9, food: 0.05, growth: 0.95 })
    expect(incidentFor(all, away, T0)).toBe('flies')
    expect(incidentFor({ ...all, mold: 0.1 }, away, T0)).toBe('cloudy')
    expect(incidentFor({ ...all, mold: 0.1, food: 0.9 }, away, T0)).toBe('neighbour')
  })

  it('чаще раза в полсуток прибор не беспокоит', () => {
    const s = tidy({ mold: 0.8, lastIncidentAt: T0 })
    expect(incidentFor(s, away, T0 + B.INCIDENT_COOLDOWN_MS - 1)).toBe(null)
    expect(incidentFor(s, away, T0 + B.INCIDENT_COOLDOWN_MS + 1)).toBe('flies')
  })
})

describe('ответы', () => {
  it('каждый ответ даёт ровно заявленные сдвиги и ничего сверх', () => {
    for (const kind of B.INCIDENT_KINDS) {
      for (const i of ANSWERS) {
        // Все величины в середине: самый крупный сдвиг — 0.35, обрезка
        // до 0…1 в подсчёт не вмешается. Края проверяются отдельно.
        const before = tidy({ food: 0.5, growth: 0.5, mold: 0.5, resentment: 0.5 })
        const d = B.INCIDENT_EFFECTS[kind][i] as Record<string, number | undefined>
        const after = answer(before, kind, i, T0).state
        const where = `${kind}/${i}`

        expect(after.food, where).toBeCloseTo(before.food + (d.food ?? 0), 10)
        expect(after.growth, where).toBeCloseTo(before.growth + (d.growth ?? 0), 10)
        expect(after.mold, where).toBeCloseTo(before.mold + (d.mold ?? 0), 10)
        expect(after.resentment, where).toBeCloseTo(before.resentment + (d.resentment ?? 0), 10)

        // Кулдаунов кнопок происшествие не трогает: это не подача и не промывка.
        expect(after.lastFedAt, where).toBe(before.lastFedAt)
        expect(after.lastCleanedAt, where).toBe(before.lastCleanedAt)
        expect(after.generation, where).toBe(before.generation)
        expect(after.alive, where).toBe(true)
      }
    }
  })

  it('величины остаются в границах 0…1 на любом краю', () => {
    for (const kind of B.INCIDENT_KINDS) {
      for (const i of ANSWERS) {
        for (const edge of [0, 1]) {
          const s = tidy({ food: edge, growth: edge, mold: edge, resentment: edge })
          const after = answer(s, kind, i, T0).state
          for (const v of [after.food, after.growth, after.mold, after.resentment]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('любой ответ ставит паузу — второго доклада сразу не будет', () => {
    for (const kind of B.INCIDENT_KINDS) {
      for (const i of ANSWERS) {
        const after = answer(tidy({ mold: 0.8 }), kind, i, T0).state
        expect(after.lastIncidentAt).toBe(T0)
        expect(incidentFor(after, away, T0 + 1000)).toBe(null)
      }
    }
  })

  it('каждый ответ отзывается своей строкой', () => {
    for (const kind of B.INCIDENT_KINDS) {
      const seen = ANSWERS.map((i) => answer(tidy(), kind, i, T0).msg)
      expect(seen).toEqual([...INCIDENT[kind].msg])
      expect(new Set(seen).size, kind).toBe(3)
    }
  })

  it('ответ попадает в журнал: прибор помнит не событие, а решение', () => {
    const res = answer(tidy({ mold: 0.8 }), 'flies', 1, T0)
    const entry = res.state.journal.at(-1)!
    expect(entry.kind).toBe('incident')
    expect(entry.incident).toBe('flies')
    expect(entry.answer).toBe(1)

    const line = journalLine(entry)
    expect(line).toContain(INCIDENT.flies.name)
    expect(line).toContain(INCIDENT.flies.done[1])
  })

  it('у каждого происшествия три РАЗНЫХ размена, а не один правильный', () => {
    // Иначе бланк превратился бы в проверку внимательности: два ответа
    // наказывают, третий нет.
    for (const kind of B.INCIDENT_KINDS) {
      const shapes = B.INCIDENT_EFFECTS[kind].map((d) => JSON.stringify(d))
      expect(new Set(shapes).size, kind).toBe(3)
    }
  })

  it('ни один ответ не бьёт сразу по всем величинам', () => {
    // Происшествие — размен, а не наказание за то, что игрок вернулся.
    for (const kind of B.INCIDENT_KINDS) {
      for (const i of ANSWERS) {
        const d = B.INCIDENT_EFFECTS[kind][i] as Record<string, number | undefined>
        const harm = [
          (d.food ?? 0) < 0,
          (d.growth ?? 0) < 0,
          (d.mold ?? 0) > 0,
          (d.resentment ?? 0) > 0,
        ].filter(Boolean).length
        expect(harm, `${kind}/${i}`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('смена среды отзывается промывкой, залив — сахаром', () => {
    expect(answer(tidy(), 'flies', 1, T0).effect).toBe('wash')
    expect(answer(tidy(), 'cloudy', 0, T0).effect).toBe('sugar')
    expect(answer(tidy(), 'neighbour', 1, T0).effect).toBe('none')
  })

  it('пауза происшествий переживает смену поколений', () => {
    // Она про владельца: гриб погиб, а беспокоить человека чаще не стали.
    const s = answer(tidy({ growth: 0.9 }), 'flies', 0, T0).state
    const dead = { ...s, alive: false, deathDay: 20 }
    const heir = incidentFor(
      { ...dead, alive: true, generation: 2, mold: 0.8, lastIncidentAt: s.lastIncidentAt },
      away,
      T0 + hours(1),
    )
    expect(heir).toBe(null)
  })
})
