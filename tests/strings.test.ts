/**
 * Тексты обязаны помещаться на экран.
 *
 * ЖК шириной 300 пикселей, строка сообщения начинается с отступа в полторы
 * клетки, то есть на текст остаётся 291. Handjet в 20 пикселях даёт около
 * 7.7 пикселя на знак — отсюда предел примерно в 37 знаков, берём с запасом.
 * Проверять шириной по-настоящему нельзя: для этого нужен браузер со шрифтом,
 * а счёт знаков ловит ровно ту ошибку, которая случается на практике —
 * кто-то добавил строку подлиннее, и её обрезало.
 */

import { describe, expect, it } from 'vitest'

import { MSG, BUBBLE, INCIDENT, JOURNAL, POUR, REPORT, START, overdue, wereAway } from '../src/content/strings'
import { INCIDENT_KINDS } from '../src/sim/balance'
import { pourBlank, incidentBlank } from '../src/view/reports'
import { VISIBLE_LINES } from '../src/view/screens/report'

/** Строка служебных сообщений внизу экрана. */
const MSG_LIMIT = 36
/** Облачко: рамка съедает две клетки, и оно должно влезть в 50. */
const BUBBLE_LIMIT = 40
/** Подсказка в нижней полосе текстовых экранов. */
const HINT_LIMIT = 36
/**
 * Строка бланка: кегль 17, на текст остаётся 288 пикселей, знак выходит около
 * 6.4 — влезает 45. Берём 44 с запасом в один знак.
 *
 * Предел выведен не на глаз: запись о партии с сортом сняли снимком и увидели
 * обрезанный краем экрана хвост. Заодно выяснилось, что и запись о гибели
 * не помещалась с самого начала.
 */
const LINE_LIMIT = 44

const check = (where: string, text: string, limit: number) => {
  expect(text.length, `${where}: «${text}» — ${text.length} знаков, предел ${limit}`).toBeLessThanOrEqual(limit)
}

describe('длина текстов', () => {
  it('служебные сообщения помещаются в строку', () => {
    for (const [key, text] of Object.entries(MSG)) check(`MSG.${key}`, text, MSG_LIMIT)
  })

  it('самые длинные подставляемые сообщения тоже помещаются', () => {
    // Числа растут: день трёхзначным быть может, часы отсутствия тоже.
    check('overdue', overdue(999), MSG_LIMIT)
    check('wereAway', wereAway(999), MSG_LIMIT)
  })

  it('реплики гриба помещаются в облачко', () => {
    for (const [key, text] of Object.entries(BUBBLE)) check(`BUBBLE.${key}`, text, BUBBLE_LIMIT)
  })

  it('подсказки на текстовых экранах помещаются', () => {
    check('REPORT.hint', REPORT.hint, HINT_LIMIT)
    check('REPORT.deathHint', REPORT.deathHint, HINT_LIMIT)
    check('START.hint', START.hint, HINT_LIMIT)
  })

  it('записи журнала помещаются в строку бланка', () => {
    // Числа берём заведомо крупные: поколение двузначное, день трёхзначный,
    // отсутствие трёхзначное в часах. В сводке записи идут с маркером «· »,
    // он тоже занимает место.
    for (const sort of [null, ...Object.values(POUR.batch)]) {
      for (const grade of Object.values(JOURNAL.grade)) {
        check('JOURNAL.batch', `· ${JOURNAL.batch(44, 177, sort, grade)}`, LINE_LIMIT)
      }
    }
    for (const hasDaughter of [false, true]) {
      check('JOURNAL.death', `· ${JOURNAL.death(44, 177, hasDaughter)}`, LINE_LIMIT)
    }
    check('JOURNAL.turnedAway', `· ${JOURNAL.turnedAway(177)}`, LINE_LIMIT)
    check('JOURNAL.fullGrown', `· ${JOURNAL.fullGrown(177)}`, LINE_LIMIT)
    check('JOURNAL.absence', `· ${JOURNAL.absence(999)}`, LINE_LIMIT)
    check('JOURNAL.absenceRecord', `· ${JOURNAL.absenceRecord(999)}`, LINE_LIMIT)
    check('JOURNAL.nightPour', `· ${JOURNAL.nightPour('03:40')}`, LINE_LIMIT)
    check('JOURNAL.forgiven', `· ${JOURNAL.forgiven(177)}`, LINE_LIMIT)
    check('JOURNAL.overfed', `· ${JOURNAL.overfed(177)}`, LINE_LIMIT)
    for (const kind of INCIDENT_KINDS) {
      for (const done of INCIDENT[kind].done) {
        check('JOURNAL.incident', `· ${JOURNAL.incident(177, INCIDENT[kind].name, done)}`, LINE_LIMIT)
      }
    }
  })

  it('ни один вид записи не остался без проверки длины', () => {
    // Формулировку легко добавить и забыть про экран — здесь это заметно.
    const named = Object.keys(JOURNAL).filter((k) => k !== 'grade')
    expect(named.sort()).toEqual(
      [
        'batch',
        'death',
        'turnedAway',
        'fullGrown',
        'absence',
        'absenceRecord',
        'nightPour',
        'forgiven',
        'overfed',
        'incident',
      ].sort(),
    )
  })

  it('бланк подачи помещается в экран целиком', () => {
    const blank = pourBlank(6)
    for (const line of blank.lines) check('POUR', line, LINE_LIMIT)
    check('POUR.hint', blank.hint, HINT_LIMIT)
    // Строк должно хватать на видимую часть: бланк не прокручивается.
    expect(blank.lines.length).toBeLessThanOrEqual(VISIBLE_LINES)
  })

  it('бланк происшествия помещается в экран целиком', () => {
    for (const kind of INCIDENT_KINDS) {
      const blank = incidentBlank(kind)
      for (const line of blank.lines) check(`INCIDENT.${kind}`, line, LINE_LIMIT)
      check('INCIDENT.hint', blank.hint, HINT_LIMIT)
      // Бланк не прокручивается: всё должно быть видно сразу.
      expect(blank.lines.length).toBeLessThanOrEqual(VISIBLE_LINES)
      // Строка внизу экрана после ответа — там предел строже.
      for (const msg of INCIDENT[kind].msg) check(`INCIDENT.${kind}.msg`, msg, MSG_LIMIT)
    }
  })

  it('строка вернувшегося владельца помещается на экран запуска', () => {
    // Она рисуется кеглем помельче, поэтому предел выше.
    check('START.waiting', START.waiting(999, 99), 44)
    check('START.ceased', START.ceased(99), 44)
  })
})
