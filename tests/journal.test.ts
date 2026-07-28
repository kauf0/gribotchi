/**
 * Журнал: что прибор записывает и как это переживает обновление.
 *
 * Слоган обещает «ОН ТОЖЕ ВАС НЕ ЗАБУДЕТ», и до сих пор он был ничем не
 * подкреплён: в журнале стояли только партия и гибель, обе про гриб. Здесь
 * проверяется вторая половина обещания — записи про владельца.
 */

import { describe, expect, it } from 'vitest'

import { createState, type GameState } from '../src/sim/state'
import {
  isMilestone,
  trim,
  remember,
  rememberAll,
  MILESTONE_CAP,
  OBSERVATION_CAP,
  type JournalEntry,
  type JournalKind,
} from '../src/sim/journal'
import { observe, noteReturn } from '../src/sim/observations'
import { bottle, feed, nextGeneration } from '../src/sim/actions'
import { journalLine } from '../src/view/reports'
import { load, save } from '../src/sim/persist'
import * as B from '../src/sim/balance'

const T0 = 1_700_000_000_000
const hours = (n: number) => n * 3600_000

/** Полдень: обычный час, ночная подача не примешивается. */
const noon = { now: T0, hour: 12 }

const base = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.5,
  growth: 0.4,
  mold: 0.2,
  resentment: 0.1,
  ...over,
})

const kinds = (entries: JournalEntry[]) => entries.map((e) => e.kind)

const memory = (): Storage => {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

describe('что прибор замечает', () => {
  it('отвернувшегося объекта записывает вехой — один раз за поколение', () => {
    const calm = base({ resentment: B.AWAY_ABOVE - 0.01 })
    const sulking = { ...calm, resentment: B.AWAY_ABOVE + 0.01 }

    const first = observe(calm, sulking, noon)
    expect(kinds(first)).toEqual(['turned-away'])

    // С записью в журнале второй раз это уже не новость.
    const withEntry = { ...sulking, journal: first }
    expect(observe(calm, withEntry, noon)).toEqual([])
  })

  it('полный рост — тоже веха и тоже один раз', () => {
    const growing = base({ growth: 0.98 })
    const grown = { ...growing, growth: 1 }
    const found = observe(growing, grown, noon)
    expect(kinds(found)).toEqual(['full-grown'])
    expect(observe(growing, { ...grown, journal: found }, noon)).toEqual([])
  })

  it('примирение записывается только после того, как объект отворачивался', () => {
    const angry = base({ resentment: B.HAPPY_RESENT_BELOW + 0.01 })
    const calm = { ...angry, resentment: B.HAPPY_RESENT_BELOW - 0.01 }

    // Обычный уход за необиженным объектом примирением не считается.
    expect(observe(angry, calm, noon)).toEqual([])

    const turned: JournalEntry = { at: T0 - 1000, generation: 1, day: 3, kind: 'turned-away' }
    const found = observe(angry, { ...calm, journal: [turned] }, noon)
    expect(kinds(found)).toEqual(['forgiven'])

    // И только один раз на каждую обиду.
    const already = { ...calm, journal: [turned, ...found] }
    expect(observe(angry, already, noon)).toEqual([])
  })

  it('после новой обиды примирение записывается снова', () => {
    const angry = base({ resentment: B.HAPPY_RESENT_BELOW + 0.01 })
    const calm = { ...angry, resentment: B.HAPPY_RESENT_BELOW - 0.01 }
    const journal: JournalEntry[] = [
      { at: T0 - 3000, generation: 1, day: 2, kind: 'turned-away' },
      { at: T0 - 2000, generation: 1, day: 2, kind: 'forgiven' },
      { at: T0 - 1000, generation: 1, day: 5, kind: 'turned-away' },
    ]
    expect(kinds(observe(angry, { ...calm, journal }, noon))).toEqual(['forgiven'])
  })

  it('ночная подача узнаётся по сдвинувшейся метке кормления', () => {
    const before = base()
    const after = { ...before, lastFedAt: before.lastFedAt + 1000 }
    expect(kinds(observe(before, after, { now: T0, hour: 3 }))).toEqual(['night-pour'])
    // Днём подача — не событие: она и так дважды в сутки.
    expect(observe(before, after, { now: T0, hour: 13 })).toEqual([])
  })

  it('перелив записывается наблюдением', () => {
    const stuffed = base({ food: B.OVERFEED_ABOVE + 0.01 })
    const after = { ...stuffed, lastFedAt: stuffed.lastFedAt + 1000, food: 1 }
    expect(kinds(observe(stuffed, after, noon))).toEqual(['overfed'])
  })

  it('смена поколения не считается переходом', () => {
    // Иначе каждая смерть заканчивалась бы записью «извинения приняты»:
    // у наследника обида обнулена, рост сброшен, сытость полная.
    const old = base({ resentment: 0.9, growth: 1 })
    const heir = nextGeneration({ ...old, alive: false }, T0).state
    expect(observe(old, heir, noon)).toEqual([])
  })

  it('за мёртвым объектом наблюдать нечего', () => {
    const alive = base({ growth: 0.98 })
    const dead = { ...alive, growth: 1, alive: false }
    expect(observe(alive, dead, noon)).toEqual([])
  })

  it('на спокойном кадре не пишется ничего', () => {
    const s = base()
    expect(observe(s, s, noon)).toEqual([])
  })
})

describe('отлучки владельца', () => {
  it('короткая отлучка прибору не интересна', () => {
    const s = base()
    expect(noteReturn(s, hours(2), noon)).toBe(s)
  })

  it('долгая записывается вместе с часами', () => {
    const back = noteReturn(base(), hours(14), noon)
    const entry = back.journal.at(-1)!
    expect(entry.kind).toBe('absence-record')
    expect(entry.hours).toBe(14)
    expect(journalLine(entry)).toContain('14')
  })

  it('рекорд отмечается только когда он и правда рекорд', () => {
    let s = noteReturn(base(), hours(30), noon)
    expect(s.longestAwayMs).toBe(hours(30))

    s = noteReturn(s, hours(10), noon)
    expect(s.journal.at(-1)!.kind).toBe('absence')
    expect(s.longestAwayMs).toBe(hours(30))

    s = noteReturn(s, hours(40), noon)
    expect(s.journal.at(-1)!.kind).toBe('absence-record')
    expect(s.longestAwayMs).toBe(hours(40))
  })

  it('рекорд переживает смерть гриба: он про владельца, а не про объект', () => {
    const s = noteReturn(base({ growth: 0.9 }), hours(30), noon)
    const dead = { ...s, alive: false, deathDay: 12 }
    expect(nextGeneration(dead, T0).state.longestAwayMs).toBe(hours(30))
    // И у начатой с нуля закваски тоже: игрок-то тот же.
    const noHeir = nextGeneration({ ...dead, growth: 0.1 }, T0).state
    expect(noHeir.generation).toBe(1)
    expect(noHeir.longestAwayMs).toBe(hours(30))
  })

  it('порог записи совпадает с порогом, о котором прибор говорит вслух', () => {
    const s = base()
    expect(noteReturn(s, B.ABSENCE_WORTH_NOTING_MS - 1, noon).journal).toHaveLength(0)
    expect(noteReturn(s, B.ABSENCE_WORTH_NOTING_MS + 1, noon).journal).toHaveLength(1)
  })
})

describe('предел журнала', () => {
  const make = (kind: JournalKind, i: number): JournalEntry => ({
    at: T0 + i * 1000,
    generation: 1,
    day: i,
    kind,
  })

  it('вехи и наблюдения считаются отдельно', () => {
    const many = [
      ...Array.from({ length: 40 }, (_, i) => make('batch', i)),
      ...Array.from({ length: 40 }, (_, i) => make('overfed', 100 + i)),
    ]
    const kept = trim(many)
    expect(kept.filter(isMilestone)).toHaveLength(MILESTONE_CAP)
    expect(kept.filter((e) => !isMilestone(e))).toHaveLength(OBSERVATION_CAP)
  })

  it('вытесняются старые, а порядок остаётся хронологическим', () => {
    const many = Array.from({ length: 40 }, (_, i) => make('batch', i))
    const kept = trim(many)
    expect(kept[0].day).toBe(40 - MILESTONE_CAP)
    expect(kept.at(-1)!.day).toBe(39)
    expect(kept.map((e) => e.at)).toEqual([...kept.map((e) => e.at)].sort((a, b) => a - b))
  })

  it('наплыв наблюдений не вытесняет ни одной вехи', () => {
    // Ради этого разделения предел и заведён: партии и гибели — история цикла,
    // и потерять их из-за десятка ночных подач было бы обидно.
    let journal = Array.from({ length: 5 }, (_, i) => make('batch', i))
    for (let i = 0; i < 100; i++) journal = remember(journal, make('night-pour', 100 + i))
    expect(journal.filter(isMilestone)).toHaveLength(5)
    expect(journal.filter((e) => !isMilestone(e))).toHaveLength(OBSERVATION_CAP)
  })

  it('запись без вида считается вехой — так выглядят старые сохранения', () => {
    expect(isMilestone({ at: T0, generation: 1, day: 1, text: 'ПАРТИЯ №1' })).toBe(true)
  })
})

describe('записи словами', () => {
  it('каждый вид получает свою формулировку', () => {
    const all: JournalKind[] = [
      'batch',
      'death',
      'turned-away',
      'full-grown',
      'absence',
      'absence-record',
      'night-pour',
      'forgiven',
      'overfed',
    ]
    for (const kind of all) {
      const line = journalLine({ at: T0, generation: 2, day: 7, kind, hours: 9 })
      expect(line.length, kind).toBeGreaterThan(0)
    }
  })

  it('старая запись рендерится по сохранённому тексту', () => {
    const old: JournalEntry = { at: T0, generation: 1, day: 4, text: 'ПАРТИЯ №1 · ДЕНЬ 4' }
    expect(journalLine(old)).toBe('ПАРТИЯ №1 · ДЕНЬ 4')
  })

  it('час ночной подачи берётся из метки времени', () => {
    const at = new Date(2026, 6, 27, 3, 40).getTime()
    expect(journalLine({ at, generation: 1, day: 5, kind: 'night-pour' })).toContain('03:40')
  })
})

describe('журнал переживает обновление', () => {
  it('старые записи с готовым текстом не теряются', () => {
    const store = memory()
    const old = { ...createState(T0) } as Record<string, unknown>
    old.journal = [
      { at: T0 - 2000, generation: 1, day: 4, text: 'ПАРТИЯ №1 · ДЕНЬ 4 · КАЧЕСТВО ПЕРВОЕ' },
      { at: T0 - 1000, generation: 1, day: 9, text: 'ОБЪЕКТ №1 ПОГИБ НА ДЕНЬ 9.' },
    ]
    delete old.longestAwayMs
    store.setItem('gribochi.save.v1', JSON.stringify(old))

    const back = load(T0, store)
    expect(back.fresh).toBe(false)
    expect(back.state.journal).toHaveLength(2)
    expect(journalLine(back.state.journal[0])).toContain('КАЧЕСТВО ПЕРВОЕ')
    expect(back.state.longestAwayMs).toBe(0)
  })

  it('журнал сверх предела подрезается на загрузке, а не растёт дальше', () => {
    const store = memory()
    const old = { ...createState(T0) } as Record<string, unknown>
    old.journal = Array.from({ length: 200 }, (_, i) => ({
      at: T0 - (200 - i) * 1000,
      generation: 1,
      day: i,
      text: `ПАРТИЯ №${i}`,
    }))
    store.setItem('gribochi.save.v1', JSON.stringify(old))
    expect(load(T0, store).state.journal).toHaveLength(MILESTONE_CAP)
  })

  it('нечитаемая запись выбрасывается, остальные остаются', () => {
    const store = memory()
    const old = { ...createState(T0) } as Record<string, unknown>
    old.journal = [
      { at: T0, generation: 1, day: 1, kind: 'batch', grade: 'top' },
      { generation: 1, day: 2 },
      null,
      'мусор',
      { at: T0 + 1, generation: 1, day: 3, text: 'ЕСТЬ ТЕКСТ' },
    ]
    store.setItem('gribochi.save.v1', JSON.stringify(old))
    expect(load(T0, store).state.journal).toHaveLength(2)
  })

  it('структурная запись переживает запись и чтение', () => {
    const store = memory()
    const s = bottle({ ...base(), growth: 1, poured: { black: 0, green: 3, ginger: 0 } }, T0).state
    save(s, store)
    const entry = load(T0, store).state.journal.at(-1)!
    expect(entry.kind).toBe('batch')
    expect(entry.tea).toBe('green')
    expect(journalLine(entry)).toContain('ЗЕЛЁНАЯ')
  })
})

describe('журнал наполняется сам', () => {
  /** Тот же шаг, что делает main.ts на каждом кадре: сверить и дописать. */
  const step = (prev: GameState, next: GameState, occ: { now: number; hour: number }): GameState => ({
    ...next,
    journal: rememberAll(next.journal, observe(prev, next, occ)),
  })

  it('за жизнь поколения набирается история и про объект, и про владельца', () => {
    // Проверка того самого обещания: журнал должен говорить о владельце,
    // а не только о грибе.
    let s = base({ resentment: B.AWAY_ABOVE - 0.01 })

    // Владелец пропал на сутки и вернулся.
    s = noteReturn(s, hours(24), { now: T0, hour: 9 })

    // За это время объект успел отвернуться.
    let prev = s
    s = step(prev, { ...s, resentment: 0.9 }, { now: T0 + hours(1), hour: 9 })

    // Ночью пришли мириться имбирём.
    prev = s
    s = feed(s, T0 + hours(2), 'ginger').state
    s = step(prev, s, { now: T0 + hours(2), hour: 3 })

    // И поили дальше, пока обида не сошла.
    prev = s
    s = step(prev, { ...s, resentment: 0.1 }, { now: T0 + hours(9), hour: 12 })

    expect(kinds(s.journal)).toEqual(['absence-record', 'turned-away', 'night-pour', 'forgiven'])
  })

  it('дорастив объект и разлив партию, получаем и веху, и запись о партии', () => {
    let s = base({ growth: 0.99, mold: 0.05, poured: { black: 0, green: 0, ginger: 4 } })
    s = step(s, { ...s, growth: 1 }, { now: T0 + 1000, hour: 12 })
    s = bottle(s, T0 + 2000).state
    expect(kinds(s.journal)).toEqual(['full-grown', 'batch'])
    expect(journalLine(s.journal.at(-1)!)).toContain('ИМБИРНАЯ')
  })
})
