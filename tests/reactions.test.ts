/**
 * Полная таблица того, когда гриб подаёт голос.
 *
 * Шесть настроений дают тридцать шесть переходов — на глаз такое не проверить,
 * а поломка тихая: облачко просто перестаёт появляться. Здесь перебраны все.
 */

import { describe, expect, it } from 'vitest'

import { reactionTo, type Signals } from '../src/ui/reactions'
import { BUBBLE } from '../src/content/strings'
import type { Mood } from '../src/view/screenState'

const MOODS: Mood[] = ['happy', 'ok', 'sad', 'angry', 'away', 'dead']

const at = (mood: Mood, ready = false): Signals => ({ mood, ready })

describe('первый кадр', () => {
  it('без прошлого гриб молчит', () => {
    // Иначе игра здоровалась бы репликой при каждом запуске.
    for (const mood of MOODS) expect(reactionTo(null, at(mood))).toEqual({})
  })
})

describe('реплики на смену настроения', () => {
  it('отвернулся — «ОН ВСЁ ПОМНИТ» и тряска', () => {
    expect(reactionTo(at('ok'), at('away'))).toEqual({ bubble: BUBBLE.remembers, shake: 3 })
  })

  it('разозлился — жалоба на грязь', () => {
    expect(reactionTo(at('ok'), at('angry'))).toEqual({ bubble: BUBBLE.dirty })
  })

  it('загрустил — просит корма', () => {
    expect(reactionTo(at('ok'), at('sad'))).toEqual({ bubble: BUBBLE.feedMe })
  })

  it('погиб — тряска и похоронный удар, без слов', () => {
    const r = reactionTo(at('sad'), at('dead'))
    expect(r.sound).toBe('knell')
    expect(r.shake).toBe(6)
    expect(r.bubble).toBeUndefined()
  })

  it('обычное кормление благодарности не вызывает', () => {
    // Переход «ровно → доволен» случается после каждой подачи чая, и спасибо
    // за него превратилось бы в фон.
    expect(reactionTo(at('ok'), at('happy'))).toEqual({})
  })

  it('спасибо достаётся только за вывод из плохого состояния', () => {
    for (const from of ['sad', 'angry', 'away'] as Mood[]) {
      expect(reactionTo(at(from), at('happy'))).toEqual({ bubble: BUBBLE.thanks })
    }
  })

  it('новое поколение не благодарит за то, что его завели', () => {
    // «Мёртв → доволен» бывает только при смене поколения.
    expect(reactionTo(at('dead'), at('happy'))).toEqual({})
  })

  it('возвращение в «ровно» проходит молча', () => {
    for (const from of MOODS) {
      if (from === 'ok') continue
      expect(reactionTo(at(from), at('ok'))).toEqual({})
    }
  })

  it('без перемены настроения гриб молчит', () => {
    for (const mood of MOODS) expect(reactionTo(at(mood), at(mood))).toEqual({})
  })
})

describe('готовность к розливу', () => {
  it('объявляется облачком в момент созревания', () => {
    expect(reactionTo(at('happy', false), at('happy', true))).toEqual({ bubble: BUBBLE.ripe })
  })

  it('объявляется один раз, а не каждый кадр', () => {
    expect(reactionTo(at('happy', true), at('happy', true))).toEqual({})
  })

  it('розлив снимает готовность молча', () => {
    expect(reactionTo(at('happy', true), at('happy', false))).toEqual({})
  })

  it('смена настроения важнее созревания', () => {
    // Совпадают они редко, но приоритет должен быть определён.
    expect(reactionTo(at('sad', false), at('away', true))).toEqual({
      bubble: BUBBLE.remembers,
      shake: 3,
    })
  })
})

describe('полнота таблицы', () => {
  it('ни один из 36 переходов не роняет функцию и не выдаёт мусора', () => {
    const known = Object.values(BUBBLE) as string[]
    let checked = 0
    for (const from of MOODS) {
      for (const to of MOODS) {
        for (const wasReady of [false, true]) {
          for (const isReady of [false, true]) {
            const r = reactionTo(at(from, wasReady), at(to, isReady))
            if (r.bubble !== undefined) expect(known).toContain(r.bubble)
            if (r.shake !== undefined) expect(r.shake).toBeGreaterThan(0)
            if (r.sound !== undefined) expect(r.sound).toBe('knell')
            checked++
          }
        }
      }
    }
    expect(checked).toBe(MOODS.length * MOODS.length * 4)
  })

  it('говорящих переходов ровно столько, сколько задумано', () => {
    const speaking: string[] = []
    for (const from of MOODS) {
      for (const to of MOODS) {
        const r = reactionTo(at(from), at(to))
        if (r.bubble) speaking.push(`${from}→${to}`)
      }
    }
    // По пять источников ведут в «отвернулся», «зол» и «грустен», и три
    // плохих состояния дают благодарность за возвращение к «доволен».
    expect(speaking.sort()).toEqual(
      [
        'angry→away',
        'angry→happy',
        'angry→sad',
        'away→angry',
        'away→happy',
        'away→sad',
        'dead→angry',
        'dead→away',
        'dead→sad',
        'happy→angry',
        'happy→away',
        'happy→sad',
        'ok→angry',
        'ok→away',
        'ok→sad',
        'sad→angry',
        'sad→away',
        'sad→happy',
      ].sort(),
    )
  })
})
