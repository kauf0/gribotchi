/**
 * Слой вида: шов симуляции с картинкой, бланки отчётов, эфемерные эффекты
 * и таймлайн ролика.
 *
 * Пикселей тут нет — проверяется то, что до них доходит. Ошибка в проекции
 * показывает игроку неправильный гриб при правильной симуляции, и поймать
 * такое на глаз тяжело.
 */

import { describe, expect, it } from 'vitest'

import { project } from '../src/view/project'
import { summary, obituary, maxScroll } from '../src/view/reports'
import { Fx } from '../src/view/fx'
import { demoFrameAt, DEMO_DURATION, DEMO_SCENES } from '../src/demo/timeline'
import { VISIBLE_LINES } from '../src/view/screens/report'
import { createState, type GameState } from '../src/sim/state'
import { moodOf } from '../src/sim/derive'
import * as B from '../src/sim/balance'
import type { Mood } from '../src/view/screenState'

const T0 = 1_700_000_000_000
const gameDays = (d: number) => d * B.GAME_DAY_MS
const NO_FX = { sugar: 0, hearts: 0, washing: 0 }

const state = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  food: 0.9,
  growth: 0.4,
  ...over,
})

describe('проекция состояния на экран', () => {
  it('переносит параметры объекта без искажений', () => {
    const s = state({ food: 0.62, growth: 0.31, mold: 0.17 })
    const screen = project(s, 5, NO_FX)
    expect(screen.food).toBe(0.62)
    expect(screen.growth).toBe(0.31)
    expect(screen.mold).toBe(0.17)
    expect(screen.mood).toBe(moodOf(s))
    expect(screen.t).toBe(5)
    expect(screen.mode).toBe('game')
  })

  it('эффекты берутся из эфемерного слоя, а не из симуляции', () => {
    const screen = project(state(), 0, { sugar: 1, hearts: 0.5, washing: 0.25 })
    expect(screen.sugar).toBe(1)
    expect(screen.hearts).toBe(0.5)
    expect(screen.washing).toBe(0.25)
  })

  it('реплика прибора перебивает дежурную строку', () => {
    const screen = project(state(), 0, { ...NO_FX, msg: 'СЫТ. НО ЭТО НЕНАДОЛГО.' })
    expect(screen.msg).toBe('СЫТ. НО ЭТО НЕНАДОЛГО.')
  })

  it('дежурная строка говорит о самом срочном', () => {
    // Порядок важен: сначала то, от чего гриб умрёт раньше.
    const starving = project(state({ food: 0.05, ageMs: gameDays(4), fedAtAge: 0 }), 0, NO_FX)
    expect(starving.msg).toContain('ПРОСРОЧЕНО')

    const moldy = project(state({ food: 0.9, mold: 0.8 }), 0, NO_FX)
    expect(moldy.msg).toContain('СМЕНА СРЕДЫ')

    const ripe = project(state({ growth: 1 }), 0, NO_FX)
    expect(ripe.msg).toContain('РОЗЛИВУ')

    const offended = project(state({ resentment: 0.9 }), 0, NO_FX)
    expect(offended.msg).toContain('ОТВЕРНУЛСЯ')
  })

  it('мёртвому объекту сообщает о гибели, а не о голоде', () => {
    const dead = project(state({ alive: false, food: 0 }), 0, NO_FX)
    expect(dead.msg).toContain('ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ')
  })

  it('никогда не отдаёт NaN и не выходит за границы', () => {
    for (let food = 0; food <= 1; food += 0.25) {
      for (let mold = 0; mold <= 1; mold += 0.25) {
        for (const alive of [true, false]) {
          const screen = project(state({ food, mold, alive }), 1, NO_FX)
          for (const v of [screen.food, screen.growth, screen.mold, screen.day, screen.t]) {
            expect(Number.isFinite(v)).toBe(true)
          }
          expect(screen.day).toBeGreaterThanOrEqual(1)
          expect(screen.msg && screen.msg.length).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe('бланки отчётов', () => {
  it('сводка складывает вердикт и журнал', () => {
    const s = state({
      journal: [
        { at: T0, generation: 1, day: 8, text: 'ПАРТИЯ №1' },
        { at: T0 + 1, generation: 2, day: 9, text: 'ПАРТИЯ №2' },
      ],
    })
    const r = summary(s, 0)
    expect(r.lines.join(' ')).toContain('ЖУРНАЛ НАБЛЮДЕНИЙ')
    // Свежие записи сверху — их и хотят видеть.
    const first = r.lines.indexOf('· ПАРТИЯ №2')
    const second = r.lines.indexOf('· ПАРТИЯ №1')
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(second)
  })

  it('сводка называет версию — по ней тестер отчитается об ошибке', () => {
    const line = summary(state(), 0).lines.find((l) => l.includes('ВЕРСИИ'))
    expect(line).toBeDefined()
    // Версия подставляется на сборке из package.json, а не хранится в коде.
    expect(line).toMatch(/\d+\.\d+\.\d+/)
  })

  it('пустой журнал так и говорит, а не молчит', () => {
    expect(summary(state(), 0).lines).toContain('ЗАПИСЕЙ НЕТ.')
  })

  it('извещение о гибели различает судьбу дочернего слоя', () => {
    const grown = obituary(state({ alive: false, deathDay: 12, growth: 0.7 }))
    expect(grown.lines.join(' ')).toContain('ОБНАРУЖЕН ДОЧЕРНИЙ СЛОЙ')
    expect(grown.hint).toContain('СОС')

    const small = obituary(state({ alive: false, deathDay: 3, growth: 0.1 }))
    expect(small.lines.join(' ')).toContain('НЕ ОБРАЗОВАЛОСЬ')
  })

  it('прокрутка не уезжает в пустоту', () => {
    expect(maxScroll(3, VISIBLE_LINES)).toBe(0)
    expect(maxScroll(VISIBLE_LINES + 4, VISIBLE_LINES)).toBe(4)
  })

  it('короткий отчёт вовсе не прокручивается', () => {
    const short = obituary(state({ alive: false, deathDay: 1 }))
    expect(maxScroll(short.lines.length, VISIBLE_LINES)).toBe(0)
  })
})

describe('эфемерные эффекты', () => {
  it('сахар и сердечки гаснут сами', () => {
    const fx = new Fx()
    fx.play('hearts', 'СЫТ.', 1000)
    expect(fx.snapshot(1100).hearts).toBeGreaterThan(0)
    expect(fx.snapshot(1100).sugar).toBe(1)
    expect(fx.snapshot(9000).hearts).toBe(0)
    expect(fx.snapshot(9000).sugar).toBe(0)
  })

  it('реплика прибора живёт ограниченное время', () => {
    const fx = new Fx()
    fx.say('ОБЪЕКТ ЖИВ.', 0)
    expect(fx.snapshot(1000).msg).toBe('ОБЪЕКТ ЖИВ.')
    expect(fx.snapshot(99_000).msg).toBeUndefined()
  })

  it('промывка блокирует ввод ровно пока идёт', () => {
    const fx = new Fx()
    fx.play('wash', 'СМЕНА СРЕДЫ.', 0)
    expect(fx.isWashing(500)).toBe(true)
    expect(fx.snapshot(500).washing).toBeGreaterThan(0)
    expect(fx.isWashing(5000)).toBe(false)
  })

  it('тряска затухает и не остаётся навсегда', () => {
    const fx = new Fx()
    fx.shake(6, 0)
    const [x0, y0] = fx.shakeOffset(50)
    expect(Math.abs(x0) + Math.abs(y0)).toBeGreaterThan(0)
    expect(fx.shakeOffset(5000)).toEqual([0, 0])
  })

  it('нетронутый слой ничего не показывает', () => {
    const fx = new Fx()
    const snap = fx.snapshot(12_345)
    expect(snap).toEqual({ sugar: 0, hearts: 0, washing: 0, msg: undefined, bubble: undefined })
    expect(fx.shakeOffset(12_345)).toEqual([0, 0])
  })
})

describe('таймлайн ролика', () => {
  it('длится ровно столько, сколько обещает спецификация', () => {
    expect(DEMO_DURATION).toBeCloseTo(35, 5)
    expect(DEMO_SCENES).toHaveLength(7)
  })

  it('каждый кадр — годное состояние экрана', () => {
    const moods: Mood[] = ['happy', 'ok', 'sad', 'angry', 'away', 'dead']
    for (let t = 0; t < DEMO_DURATION; t += 0.05) {
      const frame = demoFrameAt(t)
      const s = frame.screen
      expect(moods).toContain(s.mood)
      for (const v of [s.food, s.growth, s.mold, s.day, s.t]) {
        expect(Number.isFinite(v)).toBe(true)
      }
      expect(s.food).toBeGreaterThanOrEqual(0)
      expect(s.food).toBeLessThanOrEqual(1)
      expect(s.growth).toBeGreaterThanOrEqual(0)
      expect(s.growth).toBeLessThanOrEqual(1)
      expect(frame.captionOpacity).toBeGreaterThanOrEqual(0)
      expect(frame.captionOpacity).toBeLessThanOrEqual(1)
      expect(frame.caption.length).toBeGreaterThan(0)
    }
  })

  it('зацикливается без разрыва', () => {
    const first = demoFrameAt(0.5)
    const looped = demoFrameAt(DEMO_DURATION + 0.5)
    expect(looped.caption).toBe(first.caption)
    expect(looped.screen.mode).toBe(first.screen.mode)
  })

  it('проходит весь драматический цикл, а не топчется на месте', () => {
    const seen = new Set<Mood>()
    for (let t = 0; t < DEMO_DURATION; t += 0.1) seen.add(demoFrameAt(t).screen.mood)
    // Знакомство, забвение, обида — ролик обязан показать весь путь.
    expect(seen.has('happy')).toBe(true)
    expect(seen.has('sad')).toBe(true)
    expect(seen.has('away')).toBe(true)
  })

  it('финальная плашка наплывает только в конце', () => {
    expect(demoFrameAt(1).title).toBe(0)
    expect(demoFrameAt(DEMO_DURATION - 20).title).toBe(0)
    expect(demoFrameAt(DEMO_DURATION - 0.2).title).toBeGreaterThan(0.9)
  })

  it('субтитр уступает место финальной плашке', () => {
    const last = demoFrameAt(DEMO_DURATION - 0.2)
    expect(last.captionOpacity).toBeLessThan(0.15)
  })

  it('заставка начинается с выключенного прибора', () => {
    expect(demoFrameAt(0).screen.mode).toBe('off')
    expect(demoFrameAt(0).led).toBe(false)
    expect(demoFrameAt(2).screen.mode).toBe('boot')
  })

  it('в сцене спасения кнопки жмут по кругу', () => {
    // «Чай. Сахар. Извинения. Именно в таком порядке.»
    const pressed = new Set<string | null>()
    for (let t = 24; t < 26; t += 0.05) pressed.add(demoFrameAt(t).press)
    expect(pressed.has('A')).toBe(true)
    expect(pressed.has('B')).toBe(true)
    expect(pressed.has('C')).toBe(true)
  })
})
