/**
 * Отложенные пометки и гибель объекта.
 *
 * Бланк выбраковки и бланк пересадки останавливают закрепление признаков: пока
 * ответа нет, watchTraits() выходит первой строкой. Если объект гибнет с
 * открытым бланком, показать бланк уже негде — значит пометку обязан снять сам
 * прибор, иначе следующее поколение не закрепит ни одного признака до
 * перезагрузки страницы.
 *
 * Проверяется это только целиком: пометки живут в main.ts, и чистой функции,
 * которую можно позвать отдельно, здесь нет. Поэтому модуль запускается как
 * есть, с подставными корпусом, экраном и звуком, а кадры и нажатия подаются
 * вручную.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { load, save } from '../src/sim/persist'
import { createState, type GameState } from '../src/sim/state'
import { encodeStrain } from '../src/sim/strain'
import type { ScreenState } from '../src/view/screenState'
import type { ButtonId } from '../src/view/shell'

const T0 = 1_700_000_000_000
const minutes = (n: number) => n * 60_000
const hours = (n: number) => n * 3_600_000

/** Что прибор показал и через что удалось нажать. */
const rig = vi.hoisted(() => ({
  press: null as ((id: ButtonId) => void) | null,
  frame: null as ((ms: number) => void) | null,
  screens: [] as ScreenState[],
}))

/**
 * Канвас-пустышка. Настоящему Lcd нужен только контекст: рисование заглушено
 * подменой render(), и до него дело не доходит.
 */
function fakeCanvas(): HTMLCanvasElement {
  const props: Record<string, unknown> = {}
  const ctx = new Proxy(props, {
    get: (t, k) => (k in t ? t[k as string] : () => undefined),
    set: (t, k, v) => {
      t[k as string] = v
      return true
    },
    has: () => true,
  })
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
}

vi.mock('../src/view/shell', () => ({
  mountShell: (_root: unknown, handlers: { onPress: (id: ButtonId) => void }) => {
    rig.press = handlers.onPress
    const canvas = fakeCanvas()
    return new Proxy(
      { canvas },
      { get: (t, k) => (k === 'canvas' ? t.canvas : () => undefined) },
    )
  },
}))

vi.mock('../src/view/render', () => ({
  render: (_lcd: unknown, screen: ScreenState) => void rig.screens.push(screen),
}))

vi.mock('../src/debug/panel', () => ({ mountDebugPanel: () => undefined }))

vi.mock('../src/audio', () => ({
  Audio: class {
    on = false
    toggle() {
      return false
    }
    prime() {}
    unlock() {}
    charge() {}
    click() {}
    chirp() {}
    wash() {}
    reject() {}
    knell() {}
    update() {}
    setThemeAllowed() {}
  },
}))

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
}

/** Браузер вокруг прибора: ровно то, чего main.ts касается при запуске. */
function stubBrowser(saved: GameState): Storage {
  const storage = memoryStorage()
  save(saved, storage)

  const win: Record<string, unknown> = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  win.self = win
  win.top = win
  win.parent = win

  vi.stubGlobal('window', win)
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('document', {
    // Вкладка спрятана нарочно: тесты гоняют часы на сутки вперёд, и прибор
    // счёл бы это простоем игрока — начался бы ролик, а он глотает нажатия.
    hidden: true,
    getElementById: () => ({}),
    addEventListener: () => undefined,
    fonts: { load: () => Promise.resolve(), ready: Promise.resolve() },
  })
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('navigator', { userAgent: 'vitest' })
  vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
    rig.frame = cb
    return 0
  })

  return storage
}

const press = (id: ButtonId): void => rig.press?.(id)

/**
 * Кадр. Метка времени берётся с запасом: по ней прибор отмеряет только
 * загрузку, а игровое время идёт от подставных часов.
 */
const tick = (): void => rig.frame?.(performance.now() + 5000)

/** Что прибор показывал на последнем кадре. */
const shown = (): ScreenState => rig.screens[rig.screens.length - 1]

/** Сколько прошло с начала испытания. */
const jump = (ms: number): void => void vi.setSystemTime(Date.now() + ms)

/** Запуск прибора с уже лежащим в хранилище сохранением. */
async function powerOn(saved: GameState): Promise<Storage> {
  const storage = stubBrowser(saved)
  vi.resetModules()
  await import('../src/main')
  // Первый кадр прибор просит только после шрифтов.
  await new Promise((resolve) => setTimeout(resolve, 0))
  press('C')
  tick()
  return storage
}

/** Признаки объекта в хранилище — единственное, что видно снаружи. */
const savedTraits = (storage: Storage): string[] => load(Date.now(), storage).state.traits

/**
 * Объект при смерти: пустой бак и плесень у самого верха. Пара кадров с
 * подвинутыми часами — и он гибнет.
 */
function dying(over: Partial<GameState> = {}): GameState {
  return {
    ...createState(Date.now()),
    food: 0,
    mold: 0.99,
    growth: 0.05,
    // Рекорд отсутствия принадлежит владельцу и переживает поколение — на нём
    // держится ЗАБЫТЫЙ, единственный признак, который новорождённый объект
    // зарабатывает сразу.
    longestAwayMs: hours(25),
    ...over,
  }
}

/** Довести объект до гибели и дождаться извещения. */
function killOff(after: number): void {
  jump(after)
  tick()
  // Банку с крестиками вместо глаз дают разглядеть, и только потом приходит
  // извещение; до него смена поколения недоступна.
  jump(minutes(1))
  tick()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  rig.press = null
  rig.frame = null
  rig.screens = []
})

describe('гибель с открытым бланком', () => {
  it('после выбраковки, оставшейся без ответа, признаки закрепляются снова', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)

    // Три места заняты, а ЗАБЫТЫЙ заработан — прибор потребует выбраковки.
    const storage = await powerOn(dying({ traits: ['stout', 'wiry', 'healing'] }))
    expect(shown().mode).toBe('cull')

    // Объект гибнет, пока владелец разглядывает бланк.
    killOff(minutes(20))
    expect(shown().mode).toBe('death')

    press('C')
    tick()

    expect(savedTraits(storage)).toContain('abandoned')
  })

  it('после пересадки, оставшейся без ответа, признаки закрепляются снова', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)

    // Чужая закваска ждёт смены поколения: там прибор и предложит пересадку.
    const offered = encodeStrain({ traits: ['lean', 'sterile', 'healing'], generation: 2, crossings: 0 })
    const storage = await powerOn(
      dying({ generation: 3, traits: ['abandoned', 'stout', 'wiry'], offered }),
    )

    killOff(minutes(20))
    press('C')
    tick()
    // Смена поколения с закваской на хранении — бланк пересадки.
    expect(shown().mode).toBe('graft')

    // И на нём объект гибнет: новорождённый голодает те же несколько дней.
    killOff(hours(24))
    expect(shown().mode).toBe('death')

    press('C')
    tick()

    expect(savedTraits(storage)).toContain('abandoned')
  })
})
