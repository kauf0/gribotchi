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

import { MSG, BUBBLE, REPORT, START, overdue, wereAway } from '../src/content/strings'

/** Строка служебных сообщений внизу экрана. */
const MSG_LIMIT = 36
/** Облачко: рамка съедает две клетки, и оно должно влезть в 50. */
const BUBBLE_LIMIT = 40
/** Подсказка в нижней полосе текстовых экранов. */
const HINT_LIMIT = 36

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

  it('строка вернувшегося владельца помещается на экран запуска', () => {
    // Она рисуется кеглем помельче, поэтому предел выше.
    check('START.waiting', START.waiting(999, 99), 44)
    check('START.ceased', START.ceased(99), 44)
  })
})
