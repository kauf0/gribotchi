/**
 * Что делает нажатие кнопки в каждом состоянии игры.
 *
 * Вынесено из main.ts в чистую функцию по одной причине: это самая ветвистая
 * часть игры и единственная, где легко получить тихую поломку — кнопка,
 * которая в каком-то состоянии ничего не делает или делает не то. Здесь она
 * вся на виду и проверяется тестами без браузера.
 *
 * Намерение (Intent) описывает ЧТО игрок хочет сделать, а не как это исполнить:
 * саму симуляцию, звук и экраны трогает уже main.ts.
 */

import type { ButtonId } from '../view/shell'
import { TEA_KEYS, type TeaKey } from '../sim/balance'

export type Phase = 'start' | 'boot' | 'game'
export type UiMode = 'game' | 'report' | 'pour' | 'incident'

export type Intent =
  /** Ничего не происходит; reason — только для отладки и тестов. */
  | { kind: 'ignore'; reason: IgnoreReason }
  | { kind: 'power-on' }
  | { kind: 'feed' }
  /** Открыть бланк подачи: три кнопки становятся тремя сортами. */
  | { kind: 'open-pour' }
  | { kind: 'pour'; tea: TeaKey }
  /** Ответ на происшествие: номер совпадает с номером кнопки. */
  | { kind: 'answer'; index: 0 | 1 | 2 }
  | { kind: 'clean' }
  | { kind: 'bottle' }
  | { kind: 'open-report' }
  | { kind: 'close-report' }
  | { kind: 'scroll'; delta: -1 | 1 }
  | { kind: 'next-generation' }

export type IgnoreReason =
  | 'attract'
  | 'booting'
  | 'washing'
  | 'death-not-settled'
  | 'dead-wrong-button'

export type ControlContext = {
  phase: Phase
  ui: UiMode
  /** Идёт ролик — нажатие уже потрачено на то, чтобы его прервать. */
  attract: boolean
  /** Идёт промывка: прибор просил не мешать. */
  washing: boolean
  alive: boolean
  /** Объект дорос до максимума и готов к розливу. */
  ready: boolean
  /** Прошла ли выдержка, за которую игрок разглядывает мёртвый объект. */
  deathSettled: boolean
  /**
   * Истёк ли кулдаун подачи. Проверяется ДО открытия бланка: незачем звать
   * выбирать сорт, если наливать всё равно рано. Отказ выдаёт сама симуляция,
   * поэтому текст отповеди остаётся в одном месте.
   */
  canFeed: boolean
}

const BUTTON_INDEX: Record<ButtonId, 0 | 1 | 2> = { A: 0, B: 1, C: 2 }

/**
 * Порядок проверок важен и отражает приоритет состояний: ролик перекрывает
 * всё, выключенный прибор — почти всё, смерть — обычное управление.
 */
export function intentFor(ctx: ControlContext, id: ButtonId): Intent {
  if (ctx.attract) return { kind: 'ignore', reason: 'attract' }

  // На экране запуска любая кнопка включает прибор, хотя подсказка зовёт на СОС:
  // промахнувшийся не должен оказаться в тупике.
  if (ctx.phase === 'start') return { kind: 'power-on' }
  if (ctx.phase === 'boot') return { kind: 'ignore', reason: 'booting' }

  if (ctx.washing) return { kind: 'ignore', reason: 'washing' }

  if (!ctx.alive) {
    if (!ctx.deathSettled) return { kind: 'ignore', reason: 'death-not-settled' }
    // Извещение о гибели предлагает ровно один выход, и он на СОС.
    return id === 'C' ? { kind: 'next-generation' } : { kind: 'ignore', reason: 'dead-wrong-button' }
  }

  // Бланк подачи открыт: кнопки прибора — это сорта, по порядку.
  if (ctx.ui === 'pour') return { kind: 'pour', tea: TEA_KEYS[BUTTON_INDEX[id]] as TeaKey }

  // Происшествие ждёт ответа. Отмены нет и таймера нет: любой из трёх ответов
  // годится, включая «переложить на службу», и мимо не промахнёшься.
  if (ctx.ui === 'incident') return { kind: 'answer', index: BUTTON_INDEX[id] }

  if (ctx.ui === 'report') {
    if (id === 'A') return { kind: 'scroll', delta: -1 }
    if (id === 'B') return { kind: 'scroll', delta: 1 }
    return { kind: 'close-report' }
  }

  if (id === 'A') return ctx.canFeed ? { kind: 'open-pour' } : { kind: 'feed' }
  if (id === 'B') return { kind: 'clean' }
  // СОС меняет назначение в тупиковых состояниях: доросшему объекту нужен
  // розлив, а не сводка.
  return ctx.ready ? { kind: 'bottle' } : { kind: 'open-report' }
}
