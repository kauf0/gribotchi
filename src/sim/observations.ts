/**
 * Что прибор замечает сам.
 *
 * «ОН ТОЖЕ ВАС НЕ ЗАБУДЕТ» — обещание, которое до сих пор было ничем не
 * подкреплено: в журнале стояли только партия и гибель, обе про гриб. Здесь
 * появляются записи про ВЛАДЕЛЬЦА — во сколько приходил, надолго ли пропадал,
 * приняты ли извинения.
 *
 * Правило раздела: actions.ts записывает то, что игрок сделал НАМЕРЕННО
 * (разлил партию, продолжил род), а этот модуль — то, что прибор ПОДМЕТИЛ.
 * Поэтому здесь нет ни одного вызова из кнопок: всё выводится из перехода
 * между двумя состояниями, и подать сюда нечего, кроме прежнего и нынешнего.
 *
 * Вынесено в чистую функцию по образцу ui/reactions.ts: решение «что считать
 * событием» ветвистое, и в main.ts оно бы расползлось так же, как когда-то
 * расползлись реплики.
 */

import * as B from './balance'
import { dayOf } from './derive'
import type { GameState } from './state'
import { lastOf, record, type JournalEntry } from './journal'

/**
 * Обстоятельства, которых симуляция знать не может.
 *
 * Час приходит снаружи: игра намеренно не знает о Date, иначе оффлайн-догон
 * перестал бы быть чистой функцией от времени.
 */
export type Occasion = {
  now: number
  /** Местный час суток, 0…23. */
  hour: number
}

const isNight = (hour: number): boolean => hour >= B.NIGHT_FROM && hour < B.NIGHT_TO

const entry = (s: GameState, occ: Occasion, rest: Partial<JournalEntry>): JournalEntry => ({
  at: occ.now,
  generation: s.generation,
  day: dayOf(s),
  ...rest,
})

/**
 * Что изменилось между двумя состояниями и стоит записи.
 *
 * Вызывается на каждом кадре, поэтому почти всегда возвращает пустой список:
 * записываются только ПЕРЕХОДЫ, как и реплики гриба.
 */
export function observe(prev: GameState, next: GameState, occ: Occasion): JournalEntry[] {
  // Смена поколения обнуляет разом всё: рост, обиду, сытость. Считать это
  // переходами нельзя — иначе каждая смерть заканчивалась бы записью
  // «извинения приняты».
  if (prev.generation !== next.generation) return []
  if (!next.alive) return []

  const out: JournalEntry[] = []
  const once = (kind: Parameters<typeof lastOf>[1]) => !lastOf(next.journal, kind, next.generation)

  // Веха: объект отвернулся. Один раз за поколение — дальше это уже не новость.
  if (prev.resentment <= B.AWAY_ABOVE && next.resentment > B.AWAY_ABOVE && once('turned-away')) {
    out.push(entry(next, occ, { kind: 'turned-away' }))
  }

  // Веха: дорос до предела и ждёт розлива.
  if (prev.growth < 1 && next.growth >= 1 && once('full-grown')) {
    out.push(entry(next, occ, { kind: 'full-grown' }))
  }

  // Наблюдение: помирились. Записывается только после того, как объект
  // действительно отворачивался, — иначе это не примирение, а обычный уход.
  if (prev.resentment >= B.HAPPY_RESENT_BELOW && next.resentment < B.HAPPY_RESENT_BELOW) {
    const away = lastOf(next.journal, 'turned-away', next.generation)
    const made = lastOf(next.journal, 'forgiven', next.generation)
    if (away && (!made || made.at < away.at)) out.push(entry(next, occ, { kind: 'forgiven' }))
  }

  // Подачу узнаём по сдвинувшейся метке кормления: сообщать об этом из кнопки
  // не нужно, переход виден и так.
  if (next.lastFedAt !== prev.lastFedAt) {
    if (isNight(occ.hour)) out.push(entry(next, occ, { kind: 'night-pour' }))
    // Перелив: сытость была под потолок ещё до подачи.
    if (prev.food > B.OVERFEED_ABOVE) out.push(entry(next, occ, { kind: 'overfed' }))
  }

  return out
}

/**
 * Возвращение владельца. Отдельно от observe(), потому что это единственное
 * событие, о котором симуляция не догадается сама: сколько игрока не было,
 * знает только тот, кто открыл страницу.
 *
 * Рекорд отсутствия живёт в состоянии, а не выводится из журнала: наблюдения
 * вытесняются, и вычисленный по ним рекорд однажды «сбросился» бы сам.
 */
export function noteReturn(s: GameState, awayMs: number, occ: Occasion): GameState {
  if (awayMs < B.ABSENCE_WORTH_NOTING_MS) return s

  const hours = Math.floor(awayMs / 3600_000)
  const best = awayMs > s.longestAwayMs
  return record(
    { ...s, longestAwayMs: Math.max(s.longestAwayMs, awayMs) },
    entry(s, occ, { kind: best ? 'absence-record' : 'absence', hours }),
  )
}
