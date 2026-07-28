/**
 * Содержимое текстовых экранов. Живёт в слое вида, а не симуляции: это
 * бланки для человека, а не состояние объекта.
 */

import type { GameState } from '../sim/state'
import { dayOf, diagnose } from '../sim/derive'
import { DAUGHTER_MIN_GROWTH } from '../sim/balance'
import { REPORT, objectNo, dayNo } from '../content/strings'
import type { Report } from './screenState'

/** Сводка аварийной службы: вердикт по обстановке плюс журнал наблюдений. */
export function summary(s: GameState, scroll: number, env?: string): Report {
  // Версия — в сводке, а не на видном месте: она нужна тестеру для отчёта
  // об ошибке, и экран аварийной службы для того и заведён. Там же строка
  // об обстановке: как открыта игра и что кнопка «отойти» может сделать.
  const lines = [...diagnose(s), REPORT.version(__APP_VERSION__)]
  if (env) lines.push(env)
  lines.push('', REPORT.journal)
  if (s.journal.length === 0) {
    lines.push(REPORT.empty)
  } else {
    // Свежие записи сверху — их и хотят видеть.
    for (const entry of [...s.journal].reverse()) lines.push(`· ${entry.text}`)
  }

  return { title: `${REPORT.title} · ${objectNo(s.generation)}`, lines, scroll, hint: REPORT.hint }
}

/** Извещение о гибели. */
export function obituary(s: GameState): Report {
  const hasDaughter = s.growth >= DAUGHTER_MIN_GROWTH
  return {
    title: objectNo(s.generation),
    lines: [
      REPORT.ceased,
      dayNo(s.deathDay ?? dayOf(s)),
      '',
      hasDaughter ? REPORT.daughterFound : REPORT.daughterNone,
      hasDaughter ? REPORT.cycleGoesOn : REPORT.needStarter,
    ],
    scroll: 0,
    hint: REPORT.deathHint,
  }
}

/** Сколько строк можно прокрутить, чтобы список не уехал в пустоту. */
export const maxScroll = (lines: number, visible: number): number =>
  Math.max(0, lines - visible)
