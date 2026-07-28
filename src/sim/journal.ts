/**
 * Журнал наблюдений: что прибор записал, пока за грибом ухаживали.
 *
 * Записи хранятся ПО СУЩЕСТВУ — вид события и его данные, — а формулировку
 * даёт слой вида (view/reports.ts). Причин две.
 *
 * Первая: запись «ПОДАЧА В 03:40» требует местного часа, а симуляция намеренно
 * не знает о Date — иначе оффлайн-догон перестал бы быть чистой функцией.
 *
 * Вторая: формулировки хочется править, не трогая чужие сохранения. У игроков
 * в localStorage лежат журналы за неделю, и переписать в них готовый текст
 * нечем — гадать за прежние записи мы не станем, но новые обязаны остаться
 * подвижными.
 */

import type { IncidentKind, TeaKey } from './balance'

/** Качество партии. Слово подбирает вид, симуляция знает только ступень. */
export type Grade = 'top' | 'first' | 'second'

export type JournalKind =
  // Вехи — про объект. Это и есть история цикла, вытеснять их нельзя.
  | 'batch'
  | 'death'
  | 'turned-away'
  | 'full-grown'
  // Наблюдения — про владельца. Их и вытесняем первыми.
  | 'absence'
  | 'absence-record'
  | 'night-pour'
  | 'forgiven'
  | 'overfed'
  | 'incident'

export type JournalEntry = {
  /** Реальное время события — по нему запись сортируется и датируется. */
  at: number
  generation: number
  day: number
  /**
   * Что случилось. Нет у записей из сохранений, сделанных до перехода на
   * события: такие рендерятся по своему text и считаются вехами.
   */
  kind?: JournalKind
  /** Сорт партии; null — поили вразнобой, партия вышла без сорта. */
  tea?: TeaKey | null
  grade?: Grade
  /** Остался ли после гибели дочерний слой. */
  daughter?: boolean
  /** Часы отсутствия владельца. */
  hours?: number
  /** Какое случилось происшествие и каким по счёту ответом владелец отделался. */
  incident?: IncidentKind
  answer?: number
  /** Готовый текст записи, сохранённой до перехода на события. */
  text?: string
}

const MILESTONES: JournalKind[] = ['batch', 'death', 'turned-away', 'full-grown']

/**
 * Запись без вида пришла из старого сохранения. Считаем её вехой: тогда
 * записывались только партия и гибель, и обе — вехи.
 */
export const isMilestone = (e: JournalEntry): boolean =>
  e.kind === undefined || MILESTONES.includes(e.kind)

/**
 * Сколько записей каждого рода журнал держит.
 *
 * До автозаписей журнал не был ограничен ничем и рос на две строки за цикл.
 * Теперь прибор пишет сам, и без предела список за месяц ухода вырос бы
 * до сотен строк — прокручивать их тремя кнопками никто не станет.
 */
export const MILESTONE_CAP = 30
export const OBSERVATION_CAP = 20

/** Добавляет запись и подрезает журнал. */
export const remember = (journal: JournalEntry[], entry: JournalEntry): JournalEntry[] =>
  trim([...journal, entry])

export const rememberAll = (journal: JournalEntry[], entries: JournalEntry[]): JournalEntry[] =>
  entries.length === 0 ? journal : trim([...journal, ...entries])

/**
 * Подрезка: вехи и наблюдения считаются отдельно, вытесняются старые.
 * Порядок записей при этом сохраняется — журнал остаётся хронологическим.
 */
export function trim(journal: JournalEntry[]): JournalEntry[] {
  const milestones = journal.filter(isMilestone)
  const observations = journal.filter((e) => !isMilestone(e))
  if (milestones.length <= MILESTONE_CAP && observations.length <= OBSERVATION_CAP) return journal

  const keep = new Set<JournalEntry>([
    ...milestones.slice(-MILESTONE_CAP),
    ...observations.slice(-OBSERVATION_CAP),
  ])
  return journal.filter((e) => keep.has(e))
}

/** Последняя запись такого вида у этого поколения. */
export const lastOf = (
  journal: JournalEntry[],
  kind: JournalKind,
  generation: number,
): JournalEntry | undefined => {
  for (let i = journal.length - 1; i >= 0; i--) {
    const e = journal[i]
    if (e.kind === kind && e.generation === generation) return e
  }
  return undefined
}
