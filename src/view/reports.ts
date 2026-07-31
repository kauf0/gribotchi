/**
 * Содержимое текстовых экранов. Живёт в слое вида, а не симуляции: это
 * бланки для человека, а не состояние объекта.
 */

import type { GameState } from '../sim/state'
import { dayOf, diagnose } from '../sim/derive'
import { rankOf } from '../sim/rank'
import { DAUGHTER_MIN_GROWTH, TEA_KEYS } from '../sim/balance'
import {
  BUTTONS,
  CULL,
  GRAFT,
  INCIDENT,
  JOURNAL,
  POUR,
  REPORT,
  STRAIN,
  TRAIT_NAMES,
  RANK_NAMES,
  objectNo,
  dayNo,
} from '../content/strings'
import type { JournalEntry } from '../sim/journal'
import type { IncidentKind } from '../sim/balance'
import type { TraitKey } from '../sim/traits'
import { prettyCode } from '../sim/strain'
import type { Report } from './screenState'

/** Порядок кнопок прибора — тот же, что у сортов и ответов в balance.ts. */
const BUTTON_ORDER = [BUTTONS.A, BUTTONS.B, BUTTONS.C] as const

/**
 * Запись журнала словами. Симуляция хранит событие по существу, формулировку
 * подбирают здесь — поэтому текст можно править, не трогая чужие сохранения.
 *
 * Час подачи берётся из метки времени именно тут: Date живёт в слое вида,
 * а симуляция о часовых поясах не знает и знать не должна.
 */
export function journalLine(e: JournalEntry): string {
  switch (e.kind) {
    case 'batch':
      return JOURNAL.batch(e.generation, e.day, e.tea ? POUR.batch[e.tea] : null, JOURNAL.grade[e.grade ?? 'second'])
    case 'death':
      return JOURNAL.death(e.generation, e.day, !!e.daughter)
    case 'turned-away':
      return JOURNAL.turnedAway(e.day)
    case 'full-grown':
      return JOURNAL.fullGrown(e.day)
    case 'absence':
      return JOURNAL.absence(e.hours ?? 0)
    case 'absence-record':
      return JOURNAL.absenceRecord(e.hours ?? 0)
    case 'night-pour':
      return JOURNAL.nightPour(clockOf(e.at))
    case 'forgiven':
      return JOURNAL.forgiven(e.day)
    case 'overfed':
      return JOURNAL.overfed(e.day)
    case 'incident':
      return e.incident === undefined
        ? ''
        : JOURNAL.incident(e.day, INCIDENT[e.incident].name, INCIDENT[e.incident].done[e.answer ?? 0])
    // Запись из сохранения, сделанного до перехода на события: формулировка
    // в ней уже готовая, и другой у нас нет.
    default:
      return e.text ?? ''
  }
}

const clockOf = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Сводка аварийной службы: вердикт по обстановке плюс журнал наблюдений. */
export function summary(s: GameState, scroll: number): Report {
  // Версия — в сводке, а не на видном месте: она нужна тестеру для отчёта
  // об ошибке, и экран аварийной службы для того и заведён.
  const lines = [
    ...diagnose(s),
    // Штамм и реестр — здесь, а не отдельным экраном: сводка и так про объект,
    // а лишняя навигация на трёх кнопках дороже двух строк.
    ...(s.traits.length ? [`ШТАММ: ${s.traits.map((k) => TRAIT_NAMES[k]).join(' · ')}`] : []),
    STRAIN.registry(s.bred.length, s.bottlings),
    // Разряд — единственное в сводке, что относится к ВЛАДЕЛЬЦУ, а не
    // к объекту. Стоит рядом с реестром, из которого и считается.
    STRAIN.rank(RANK_NAMES[rankOf(s.bred).key]),
    REPORT.version(__APP_VERSION__),
    '',
    REPORT.journal,
  ]
  if (s.journal.length === 0) {
    lines.push(REPORT.empty)
  } else {
    // Свежие записи сверху — их и хотят видеть.
    for (const entry of [...s.journal].reverse()) lines.push(`· ${journalLine(entry)}`)
  }

  return { title: `${REPORT.title} · ${objectNo(s.generation)}`, lines, scroll, hint: REPORT.hint }
}

/**
 * Бланк подачи: три кнопки прибора на время становятся тремя сортами.
 * Отмены нет — вместо неё в подсказке идёт обратный отсчёт, чтобы
 * самозакрытие бланка читалось как правило прибора, а не как сбой.
 */
export function pourBlank(secondsLeft: number): Report {
  const lines: string[] = [POUR.prompt, '']
  for (const [i, key] of TEA_KEYS.entries()) {
    lines.push(`${BUTTON_ORDER[i]} · ${POUR.name[key]}`)
    lines.push(`   ${POUR.note[key]}`)
  }
  return { title: POUR.title, lines, scroll: 0, hint: POUR.closing(Math.max(0, Math.ceil(secondsLeft))) }
}

/**
 * Бланк происшествия. Та же раскладка, что у сводки и подачи: заголовок,
 * строки, полоса подсказки. Три кнопки прибора становятся тремя ответами —
 * приём уже привычный игроку по бланку подачи.
 */
export function incidentBlank(kind: IncidentKind): Report {
  const card = INCIDENT[kind]
  const lines: string[] = [INCIDENT.intro, ...card.lines, '']
  card.answers.forEach((label, i) => lines.push(`${BUTTON_ORDER[i]} · ${label}`))
  return { title: INCIDENT.title, lines, scroll: 0, hint: INCIDENT.hint }
}

/**
 * Бланк выбраковки. Мест три, признак четвёртый — прибор требует решения.
 * Кандидатов может быть и шесть (скрещивание с чужой закваской), тогда бланк
 * проходится несколько раз: показываем первую тройку.
 */
export function cullBlank(gained: TraitKey, holding: TraitKey[]): Report {
  const lines: string[] = [CULL.full, CULL.gained(TRAIT_NAMES[gained]), '']
  holding.slice(0, 2).forEach((key, i) => {
    lines.push(`${BUTTON_ORDER[i]} · ${CULL.drop(TRAIT_NAMES[key])}`)
  })
  lines.push(`${BUTTON_ORDER[2]} · ${CULL.keep}`)
  return { title: CULL.title, lines, scroll: 0, hint: CULL.hint }
}

/**
 * Бланк пересадки. Показывает, что есть у чужого штамма, и даёт взять один
 * признак. Третья кнопка отказывается: чужое берут по желанию, а не по долгу.
 */
export function graftBlank(gift: TraitKey[]): Report {
  const lines: string[] = [GRAFT.intro, GRAFT.prompt, '']
  gift.slice(0, 2).forEach((key, i) => {
    lines.push(`${BUTTON_ORDER[i]} · ${GRAFT.take(TRAIT_NAMES[key])}`)
  })
  // Третий признак предлагается, только если места на бланке хватило.
  lines.push(`${BUTTON_ORDER[2]} · ${gift.length > 2 ? GRAFT.take(TRAIT_NAMES[gift[2]]) : GRAFT.refuse}`)
  return { title: GRAFT.title, lines, scroll: 0, hint: GRAFT.hint }
}

/**
 * Бланк штамма: удостоверение объекта и обмен закваской. Код показан всегда,
 * даже когда буфер недоступен, — восемь знаков без похожих букв затем и
 * выбраны, чтобы их можно было переписать с чужого экрана.
 */
export function strainBlank(s: GameState, code: string): Report {
  const lines: string[] = [prettyCode(code), '']
  if (s.traits.length === 0) lines.push(STRAIN.none)
  else for (const key of s.traits) lines.push(`· ${TRAIT_NAMES[key]}`)

  lines.push('', STRAIN.registry(s.bred.length, s.bottlings))
  if (s.offered) lines.push(STRAIN.offered(prettyCode(s.offered)), STRAIN.offeredHint)

  return { title: STRAIN.title, lines, scroll: 0, hint: STRAIN.hint }
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
