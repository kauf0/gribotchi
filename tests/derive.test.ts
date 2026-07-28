/**
 * Производные величины: настроение, тревога, мошки, глубина погружения,
 * доступность действий и вердикт аварийной службы.
 *
 * Всё это вычисляется из состояния и нигде не хранится, поэтому ошибка здесь
 * не ломает сохранение — она просто показывает игроку неправду.
 */

import { describe, expect, it } from 'vitest'

import {
  alarmOf,
  canBottle,
  canClean,
  canFeed,
  dayOf,
  diagnose,
  fliesOf,
  moodOf,
  overdueDays,
  scobyTopOf,
} from '../src/sim/derive'
import { createState, type GameState } from '../src/sim/state'
import { bottle, feed } from '../src/sim/actions'
import { MSG } from '../src/content/strings'
import * as B from '../src/sim/balance'
import type { Mood } from '../src/view/screenState'

const T0 = 1_700_000_000_000
const gameDays = (d: number) => d * B.GAME_DAY_MS

/** Здоровый сытый гриб — точка отсчёта для всех отклонений. */
const healthy = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.9,
  growth: 0.4,
  mold: 0,
  resentment: 0,
  ...over,
})

describe('номер дня', () => {
  it('день рождения — первый, а не нулевой', () => {
    expect(dayOf(healthy({ ageMs: 0 }))).toBe(1)
    expect(dayOf(healthy({ ageMs: gameDays(0.99) }))).toBe(1)
    expect(dayOf(healthy({ ageMs: gameDays(1) }))).toBe(2)
  })

  it('у мёртвого счётчик замирает на дне гибели', () => {
    const dead = healthy({ alive: false, ageMs: gameDays(90), deathDay: 10 })
    expect(dayOf(dead)).toBe(10)
  })

  it('день считается от прожитого симуляцией, а не от настенных часов', () => {
    // В этом весь смысл: сытость, рост и плесень копятся шагами advance(),
    // и день обязан копиться там же. Иначе после отладочного ускорения или
    // переведённых часов параметры остаются, а счётчик дней падает в единицу.
    const s = healthy({ ageMs: gameDays(9) })
    expect(dayOf(s)).toBe(10)
    expect(dayOf({ ...s, bornAt: T0 - gameDays(500) })).toBe(10)
    expect(dayOf({ ...s, bornAt: T0 + gameDays(500) })).toBe(10)
  })

  it('никогда не бывает нулевым или отрицательным', () => {
    expect(dayOf(healthy({ ageMs: -gameDays(5) }))).toBe(1)
  })
})

describe('настроение', () => {
  it('сытый, чистый и незлопамятный — доволен', () => {
    expect(moodOf(healthy())).toBe('happy')
  })

  it('мёртвый перекрывает всё остальное', () => {
    expect(moodOf(healthy({ alive: false, resentment: 1, mold: 1 }))).toBe('dead')
  })

  it('обида перекрывает сытость: накормленный, но обиженный отворачивается', () => {
    expect(moodOf(healthy({ food: 1, resentment: 0.9 }))).toBe('away')
  })

  it('плесень при полной сытости даёт злость, а не грусть', () => {
    // Так игрок различает «я тебя не кормлю» и «я тебя не мою».
    expect(moodOf(healthy({ food: 1, mold: 0.8 }))).toBe('angry')
  })

  it('голод без плесени и обиды — грусть', () => {
    expect(moodOf(healthy({ food: 0.2 }))).toBe('sad')
  })

  it('середина без крайностей — ровное настроение', () => {
    expect(moodOf(healthy({ food: 0.5, mold: 0.2, resentment: 0.4 }))).toBe('ok')
  })

  it('лёгкая обида отнимает радость, но не отворачивает', () => {
    expect(moodOf(healthy({ resentment: 0.4 }))).toBe('ok')
  })

  it('пороги строгие: ровно на границе настроение ещё не меняется', () => {
    expect(moodOf(healthy({ resentment: B.AWAY_ABOVE }))).not.toBe('away')
    expect(moodOf(healthy({ food: 1, mold: B.ANGRY_MOLD_ABOVE }))).not.toBe('angry')
  })

  it('всегда возвращает одно из шести настроений', () => {
    const all: Mood[] = ['happy', 'ok', 'sad', 'angry', 'away', 'dead']
    for (let food = 0; food <= 1; food += 0.1) {
      for (let mold = 0; mold <= 1; mold += 0.1) {
        for (let resentment = 0; resentment <= 1; resentment += 0.25) {
          expect(all).toContain(moodOf(healthy({ food, mold, resentment })))
        }
      }
    }
  })
})

describe('тревога и мошки', () => {
  it('тревога включается на голоде и только у живого', () => {
    expect(alarmOf(healthy({ food: 0.1 }))).toBe(true)
    expect(alarmOf(healthy({ food: 0.5 }))).toBe(false)
    expect(alarmOf(healthy({ food: 0.1, alive: false }))).toBe(false)
  })

  it('мошки заводятся, когда давно не убирали', () => {
    expect(fliesOf(healthy({ mold: 0.2 }))).toBe(false)
    expect(fliesOf(healthy({ mold: 0.9 }))).toBe(true)
  })
})

describe('погружение', () => {
  it('здоровый плавает у поверхности, запущенный опускается', () => {
    expect(scobyTopOf(healthy())).toBe(15)
    expect(scobyTopOf(healthy({ food: 0 }))).toBe(18)
    expect(scobyTopOf(healthy({ mold: 1 }))).toBe(18)
  })

  it('никогда не уходит ниже дна банки', () => {
    for (let food = 0; food <= 1; food += 0.1) {
      for (let mold = 0; mold <= 1; mold += 0.1) {
        const top = scobyTopOf(healthy({ food, mold }))
        expect(top).toBeGreaterThanOrEqual(15)
        expect(top).toBeLessThanOrEqual(18)
      }
    }
  })
})

describe('доступность действий', () => {
  it('мёртвого нельзя ни кормить, ни мыть, ни разливать', () => {
    const dead = healthy({ alive: false, growth: 1, lastFedAt: 0, lastCleanedAt: 0 })
    expect(canFeed(dead, T0)).toBe(false)
    expect(canClean(dead, T0)).toBe(false)
    expect(canBottle(dead)).toBe(false)
  })

  it('кулдаун кормления — ровно пятнадцать минут', () => {
    const s = healthy({ lastFedAt: T0 })
    expect(canFeed(s, T0 + B.FEED_COOLDOWN_MS - 1)).toBe(false)
    expect(canFeed(s, T0 + B.FEED_COOLDOWN_MS)).toBe(true)
  })

  it('розлив открывается только на полном росте', () => {
    expect(canBottle(healthy({ growth: 0.99 }))).toBe(false)
    expect(canBottle(healthy({ growth: 1 }))).toBe(true)
  })
})

describe('сердечки — благодарность, а не индикатор сытости', () => {
  const fresh = () => ({ ...createState(T0), lastFedAt: 0 })

  it('спокойный гриб благодарит сердечками', () => {
    const r = feed({ ...fresh(), food: 0.5, resentment: 0 }, T0)
    expect(r.effect).toBe('hearts')
    expect(r.msg).toBe(MSG.fed)
  })

  it('обиженный сердечек не даёт — только сахар и условные извинения', () => {
    // Обида гасится кормлением на 0.12, поэтому проверяем по итоговой.
    const r = feed({ ...fresh(), food: 0.5, resentment: 0.8 }, T0)
    expect(r.effect).toBe('sugar')
    expect(r.msg).toBe(MSG.forgiven)
  })

  it('граница ровно на пороге радости', () => {
    const below = feed({ ...fresh(), food: 0.5, resentment: B.HAPPY_RESENT_BELOW + B.FEED_FORGIVE - 0.01 }, T0)
    const above = feed({ ...fresh(), food: 0.5, resentment: B.HAPPY_RESENT_BELOW + B.FEED_FORGIVE + 0.01 }, T0)
    expect(below.effect).toBe('hearts')
    expect(above.effect).toBe('sugar')
  })

  it('перекорм сердечек не приносит вовсе', () => {
    const r = feed({ ...fresh(), food: 0.95, resentment: 0 }, T0)
    expect(r.effect).toBe('sugar')
    expect(r.msg).toBe(MSG.overfed)
    expect(r.state.mold).toBeGreaterThan(0)
  })

  it('розлив партии — тоже повод для сердечек', () => {
    expect(bottle({ ...fresh(), growth: 1 }, T0).effect).toBe('hearts')
  })

  it('отказ не даёт никакого эффекта', () => {
    const s = { ...createState(T0), lastFedAt: T0 }
    expect(feed(s, T0).effect).toBe('none')
    expect(feed(s, T0).rejected).toBe(true)
  })
})

describe('просрочка кормления', () => {
  it('считается в целых игровых днях от возраста симуляции', () => {
    // Кулдаун кнопки живёт по настенным часам, а эта строка — часть рассказа
    // и обязана совпадать с номером дня на экране.
    expect(overdueDays(healthy({ ageMs: gameDays(0.9), fedAtAge: 0 }))).toBe(0)
    expect(overdueDays(healthy({ ageMs: gameDays(3.5), fedAtAge: 0 }))).toBe(3)
  })

  it('накормленному только что не приписывается просрочка', () => {
    const age = gameDays(12)
    expect(overdueDays(healthy({ ageMs: age, fedAtAge: age }))).toBe(0)
  })
})

describe('вердикт аварийной службы', () => {
  it('у благополучного объекта прогноз удовлетворительный', () => {
    const lines = diagnose(healthy())
    expect(lines.join(' ')).toContain('КОРМЛЕНИЕ В НОРМЕ')
    expect(lines.join(' ')).toContain('УДОВЛЕТВОРИТЕЛЬНЫЙ')
  })

  it('сообщает о просрочке и о плесени числом', () => {
    const s = healthy({ ageMs: gameDays(11), fedAtAge: 0, mold: 0.6, growth: 0.42 })
    const lines = diagnose(s).join(' ')
    expect(lines).toContain('ПРОСРОЧЕНО НА 11 ДН.')
    expect(lines).toContain('ПЛЕСЕНЬ 60%')
    expect(lines).toContain('РОСТ 42%')
  })

  it('различает лёгкую обиду и полный отказ от контакта', () => {
    expect(diagnose(healthy({ resentment: 0.45 })).join(' ')).toContain(
      'КОНТАКТ ОГРАНИЧЕН',
    )
    expect(diagnose(healthy({ resentment: 0.9 })).join(' ')).toContain(
      'КОНТАКТ ОТСУТСТВУЕТ',
    )
  })

  it('прогноз мрачнеет вместе с плесенью', () => {
    const at = (mold: number) => diagnose(healthy({ mold })).join(' ')
    expect(at(0.5)).toContain('СОМНИТЕЛЬНЫЙ')
    expect(at(0.9)).toContain('НЕБЛАГОПРИЯТНЫЙ')
  })

  it('мёртвому сообщает день гибели и судьбу дочернего слоя', () => {
    const grown = diagnose(healthy({ alive: false, deathDay: 14, growth: 0.8 })).join(' ')
    expect(grown).toContain('14 ДЕНЬ')
    expect(grown).toContain('ОБНАРУЖЕН ДОЧЕРНИЙ СЛОЙ')

    const small = diagnose(healthy({ alive: false, deathDay: 4, growth: 0.2 })).join(' ')
    expect(small).toContain('ДОЧЕРНЕГО СЛОЯ НЕ ОБРАЗОВАЛОСЬ')
  })

  it('никогда не отдаёт пустых строк', () => {
    for (const s of [healthy(), healthy({ alive: false }), healthy({ food: 0, mold: 0.99 })]) {
      const lines = diagnose(s)
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) expect(line.trim()).not.toBe('')
    }
  })
})
