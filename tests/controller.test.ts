/**
 * Полный перебор того, что делает каждая кнопка в каждом состоянии.
 *
 * Это самая ветвистая часть игры и единственная, где поломка тихая: кнопка,
 * которая в каком-то состоянии молчит или делает не то, не роняет ничего
 * и не видна в логах. Поэтому здесь перечислены все сочетания, а не выборочные.
 */

import { describe, expect, it } from 'vitest'

import { intentFor, type ControlContext, type Intent } from '../src/ui/controller'
import type { ButtonId } from '../src/view/shell'

const BUTTONS: ButtonId[] = ['A', 'B', 'C']

const ctx = (over: Partial<ControlContext> = {}): ControlContext => ({
  phase: 'game',
  ui: 'game',
  attract: false,
  washing: false,
  alive: true,
  ready: false,
  deathSettled: true,
  ...over,
})

const kinds = (c: ControlContext): Intent['kind'][] => BUTTONS.map((id) => intentFor(c, id).kind)

describe('экран запуска', () => {
  it('включается любой кнопкой, хотя подсказка зовёт на СОС', () => {
    // Промахнувшийся не должен оказаться в тупике перед выключенным прибором.
    expect(kinds(ctx({ phase: 'start' }))).toEqual(['power-on', 'power-on', 'power-on'])
  })

  it('уход за грибом с выключенного прибора невозможен', () => {
    for (const id of BUTTONS) {
      expect(intentFor(ctx({ phase: 'start' }), id).kind).not.toBe('feed')
    }
  })
})

describe('загрузка', () => {
  it('во время загрузки кнопки молчат', () => {
    expect(kinds(ctx({ phase: 'boot' }))).toEqual(['ignore', 'ignore', 'ignore'])
  })
})

describe('ролик', () => {
  it('нажатие, прервавшее ролик, только его и прерывает', () => {
    for (const id of BUTTONS) {
      expect(intentFor(ctx({ attract: true }), id)).toEqual({ kind: 'ignore', reason: 'attract' })
    }
  })

  it('ролик перекрывает даже экран запуска', () => {
    expect(intentFor(ctx({ attract: true, phase: 'start' }), 'C').kind).toBe('ignore')
  })
})

describe('промывка', () => {
  it('пока идёт смена среды, ввод заблокирован — прибор просил не мешать', () => {
    expect(kinds(ctx({ washing: true }))).toEqual(['ignore', 'ignore', 'ignore'])
  })

  it('но включить прибор промывка не мешает: её ещё не может быть', () => {
    expect(intentFor(ctx({ washing: true, phase: 'start' }), 'A').kind).toBe('power-on')
  })
})

describe('обычная игра', () => {
  it('ЧАЙ кормит, МЫТЬ убирает, СОС открывает сводку', () => {
    expect(kinds(ctx())).toEqual(['feed', 'clean', 'open-report'])
  })

  it('у доросшего объекта СОС превращается в розлив', () => {
    expect(kinds(ctx({ ready: true }))).toEqual(['feed', 'clean', 'bottle'])
  })

  it('готовность к розливу не мешает кормить и мыть', () => {
    const c = ctx({ ready: true })
    expect(intentFor(c, 'A').kind).toBe('feed')
    expect(intentFor(c, 'B').kind).toBe('clean')
  })
})

describe('сводка', () => {
  it('кнопки становятся навигацией', () => {
    expect(kinds(ctx({ ui: 'report' }))).toEqual(['scroll', 'scroll', 'close-report'])
  })

  it('ЧАЙ листает вверх, МЫТЬ вниз', () => {
    const c = ctx({ ui: 'report' })
    expect(intentFor(c, 'A')).toEqual({ kind: 'scroll', delta: -1 })
    expect(intentFor(c, 'B')).toEqual({ kind: 'scroll', delta: 1 })
  })

  it('из сводки нельзя случайно накормить или разлить', () => {
    const c = ctx({ ui: 'report', ready: true })
    for (const id of BUTTONS) {
      expect(['feed', 'clean', 'bottle']).not.toContain(intentFor(c, id).kind)
    }
  })
})

describe('смерть', () => {
  it('пока идёт выдержка, нажатия не принимаются', () => {
    // Сначала игроку дают разглядеть банку с крестиками вместо глаз.
    expect(kinds(ctx({ alive: false, deathSettled: false }))).toEqual([
      'ignore',
      'ignore',
      'ignore',
    ])
  })

  it('после выдержки род продолжает только СОС', () => {
    expect(kinds(ctx({ alive: false }))).toEqual(['ignore', 'ignore', 'next-generation'])
  })

  it('мёртвого нельзя ни накормить, ни помыть, ни разлить', () => {
    const c = ctx({ alive: false, ready: true })
    for (const id of BUTTONS) {
      expect(['feed', 'clean', 'bottle', 'open-report']).not.toContain(intentFor(c, id).kind)
    }
  })

  it('открытая сводка не мешает продолжить род', () => {
    // Смерть могла застать игрока на экране сводки.
    expect(intentFor(ctx({ alive: false, ui: 'report' }), 'C').kind).toBe('next-generation')
  })
})

describe('полнота', () => {
  it('ни одно сочетание состояний не роняет функцию', () => {
    const phases = ['start', 'boot', 'game'] as const
    const uis = ['game', 'report'] as const
    const flags = [false, true]
    let combos = 0

    for (const phase of phases) {
      for (const ui of uis) {
        for (const attract of flags) {
          for (const washing of flags) {
            for (const alive of flags) {
              for (const ready of flags) {
                for (const deathSettled of flags) {
                  for (const id of BUTTONS) {
                    const intent = intentFor(
                      { phase, ui, attract, washing, alive, ready, deathSettled },
                      id,
                    )
                    expect(intent.kind).toBeTruthy()
                    combos++
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(combos).toBe(3 * 2 * 2 * 2 * 2 * 2 * 2 * 3)
  })

  it('действия над объектом возможны только в живой игре', () => {
    const acting: Intent['kind'][] = ['feed', 'clean', 'bottle', 'open-report']
    const phases = ['start', 'boot', 'game'] as const
    for (const phase of phases) {
      for (const alive of [false, true]) {
        for (const id of BUTTONS) {
          const intent = intentFor(ctx({ phase, alive }), id)
          if (acting.includes(intent.kind)) {
            expect(phase).toBe('game')
            expect(alive).toBe(true)
          }
        }
      }
    }
  })
})
