/**
 * Полный перебор того, что делает каждая кнопка в каждом состоянии.
 *
 * Это самая ветвистая часть игры и единственная, где поломка тихая: кнопка,
 * которая в каком-то состоянии молчит или делает не то, не роняет ничего
 * и не видна в логах. Поэтому здесь перечислены все сочетания, а не выборочные.
 */

import { describe, expect, it } from 'vitest'

import { intentFor, type ControlContext, type Intent } from '../src/ui/controller'
import { TEA_KEYS } from '../src/sim/balance'
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
  canFeed: true,
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
  it('ЧАЙ открывает бланк подачи, МЫТЬ убирает, СОС открывает сводку', () => {
    expect(kinds(ctx())).toEqual(['open-pour', 'clean', 'open-report'])
  })

  it('у доросшего объекта СОС превращается в розлив', () => {
    expect(kinds(ctx({ ready: true }))).toEqual(['open-pour', 'clean', 'bottle'])
  })

  it('готовность к розливу не мешает подать чай и помыть', () => {
    const c = ctx({ ready: true })
    expect(intentFor(c, 'A').kind).toBe('open-pour')
    expect(intentFor(c, 'B').kind).toBe('clean')
  })

  it('до истечения кулдауна бланк не открывается — отповедь выдаёт симуляция', () => {
    // Незачем звать выбирать сорт, если наливать всё равно рано.
    expect(intentFor(ctx({ canFeed: false }), 'A').kind).toBe('feed')
  })
})

describe('бланк подачи', () => {
  it('три кнопки становятся тремя сортами по порядку', () => {
    const c = ctx({ ui: 'pour' })
    expect(intentFor(c, 'A')).toEqual({ kind: 'pour', tea: 'black' })
    expect(intentFor(c, 'B')).toEqual({ kind: 'pour', tea: 'green' })
    expect(intentFor(c, 'C')).toEqual({ kind: 'pour', tea: 'ginger' })
  })

  it('каждой кнопке достаётся свой сорт: ни один не потерян и не удвоен', () => {
    const c = ctx({ ui: 'pour' })
    const teas = BUTTONS.map((id) => {
      const intent = intentFor(c, id)
      return intent.kind === 'pour' ? intent.tea : null
    })
    expect(new Set(teas).size).toBe(TEA_KEYS.length)
    expect(teas).toEqual(TEA_KEYS)
  })

  it('с открытого бланка нельзя случайно помыть или разлить', () => {
    const c = ctx({ ui: 'pour', ready: true })
    for (const id of BUTTONS) {
      expect(['clean', 'bottle', 'open-report']).not.toContain(intentFor(c, id).kind)
    }
  })

  it('смерть с открытым бланком закрывает его: подавать уже некому', () => {
    expect(kinds(ctx({ ui: 'pour', alive: false }))).toEqual(['ignore', 'ignore', 'next-generation'])
  })

  it('промывка и ролик перекрывают бланк', () => {
    expect(kinds(ctx({ ui: 'pour', washing: true }))).toEqual(['ignore', 'ignore', 'ignore'])
    expect(kinds(ctx({ ui: 'pour', attract: true }))).toEqual(['ignore', 'ignore', 'ignore'])
  })
})

describe('сводка', () => {
  it('кнопки становятся навигацией, а СОС ведёт дальше — на штамм', () => {
    // Отдельного входа в удостоверение взять неоткуда: кнопок три, и СОС
    // проходит цикл игра → сводка → штамм → игра.
    expect(kinds(ctx({ ui: 'report' }))).toEqual(['scroll', 'scroll', 'open-strain'])
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

describe('бланк происшествия', () => {
  it('три кнопки становятся тремя ответами по порядку', () => {
    const c = ctx({ ui: 'incident' })
    expect(kinds(c)).toEqual(['answer', 'answer', 'answer'])
    expect(BUTTONS.map((id) => intentFor(c, id))).toEqual([
      { kind: 'answer', index: 0 },
      { kind: 'answer', index: 1 },
      { kind: 'answer', index: 2 },
    ])
  })

  it('промахнуться нельзя: отмены нет, любой ответ годится', () => {
    // В том числе «переложить на службу» — потому бланк и не боится
    // случайного нажатия.
    const c = ctx({ ui: 'incident' })
    for (const id of BUTTONS) expect(intentFor(c, id).kind).not.toBe('ignore')
  })

  it('с открытого бланка нельзя случайно накормить, помыть или разлить', () => {
    const c = ctx({ ui: 'incident', ready: true })
    for (const id of BUTTONS) {
      expect(['feed', 'open-pour', 'clean', 'bottle', 'open-report']).not.toContain(
        intentFor(c, id).kind,
      )
    }
  })

  it('смерть и промывка перекрывают бланк', () => {
    expect(kinds(ctx({ ui: 'incident', alive: false }))).toEqual([
      'ignore',
      'ignore',
      'next-generation',
    ])
    expect(kinds(ctx({ ui: 'incident', washing: true }))).toEqual(['ignore', 'ignore', 'ignore'])
  })
})

describe('бланк штамма', () => {
  it('ЧАЙ копирует код, МЫТЬ вставляет чужой, СОС выходит', () => {
    expect(kinds(ctx({ ui: 'strain' }))).toEqual(['copy-strain', 'paste-strain', 'close-strain'])
  })

  it('со штамма нельзя случайно накормить или разлить', () => {
    const c = ctx({ ui: 'strain', ready: true })
    for (const id of BUTTONS) {
      expect(['feed', 'open-pour', 'clean', 'bottle']).not.toContain(intentFor(c, id).kind)
    }
  })
})

describe('выбраковка', () => {
  it('две кнопки исключают признак, третья отказывается от нового', () => {
    const c = ctx({ ui: 'cull' })
    expect(BUTTONS.map((id) => intentFor(c, id))).toEqual([
      { kind: 'cull', index: 0 },
      { kind: 'cull', index: 1 },
      { kind: 'cull', index: 2 },
    ])
  })

  it('промахнуться нельзя: любой ответ разрешает выбраковку', () => {
    const c = ctx({ ui: 'cull' })
    for (const id of BUTTONS) expect(intentFor(c, id).kind).toBe('cull')
  })

  it('выбраковка важнее происшествия и сводки, но не смерти', () => {
    // Оставлять четвёртый признак подвешенным нельзя, а мёртвому он не нужен.
    expect(kinds(ctx({ ui: 'cull', ready: true }))).toEqual(['cull', 'cull', 'cull'])
    expect(kinds(ctx({ ui: 'cull', alive: false }))).toEqual(['ignore', 'ignore', 'next-generation'])
    expect(kinds(ctx({ ui: 'cull', washing: true }))).toEqual(['ignore', 'ignore', 'ignore'])
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
    const uis = ['game', 'report', 'pour', 'incident', 'cull', 'strain'] as const
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
                    for (const canFeed of flags) {
                      const intent = intentFor(
                        { phase, ui, attract, washing, alive, ready, deathSettled, canFeed },
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
    }
    expect(combos).toBe(3 * 6 * 2 * 2 * 2 * 2 * 2 * 2 * 3)
  })

  it('действия над объектом возможны только в живой игре', () => {
    const acting: Intent['kind'][] = ['feed', 'pour', 'answer', 'clean', 'bottle', 'open-report']
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
