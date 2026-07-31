/**
 * Первый кадр и шрифты.
 *
 * Прибор рисует ЖК двумя начертаниями, которые живут только внутри канваса,
 * поэтому перед первым кадром они загружаются явно. Ждать их бесконечно
 * нельзя: зависший или отказавший запрос шрифта — обычное дело в дороге,
 * и владелец в этом случае обязан получить экран запасным начертанием,
 * а не мёртвый прибор в рабочем корпусе.
 *
 * Проверяется это целиком, как и отложенные пометки: запуск живёт в main.ts,
 * отдельной функции для него нет. Модуль поднимается с подставными корпусом
 * и звуком, а вот отрисовку НЕ подменяем — вопрос теста ровно в том, дошло
 * ли дело до пикселей на полотне.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ButtonId } from '../src/view/shell'

/** Что прибор успел нарисовать и попросил ли он вообще кадр. */
const rig = vi.hoisted(() => ({
  frame: null as ((ms: number) => void) | null,
  fills: 0,
}))

/**
 * Полотно, считающее заливки. Настоящему Lcd от контекста нужно немного:
 * заливка прямоугольника, вывод строки и её ширина — остальное он только
 * присваивает.
 */
function recordingCanvas(): HTMLCanvasElement {
  const props: Record<string, unknown> = {
    fillRect: () => void rig.fills++,
    fillText: () => void rig.fills++,
    // Ширины хватает любой: тест смотрит на факт отрисовки, не на раскладку.
    measureText: (text: string) => ({ width: text.length * 6 }),
  }
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
  mountShell: (_root: unknown, _handlers: { onPress: (id: ButtonId) => void }) => {
    const canvas = recordingCanvas()
    return new Proxy(
      { canvas },
      { get: (t, k) => (k === 'canvas' ? t.canvas : () => undefined) },
    )
  },
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
function stubBrowser(fonts: FontFaceSet): void {
  const win: Record<string, unknown> = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  win.self = win
  win.top = win
  win.parent = win

  vi.stubGlobal('window', win)
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('document', {
    // Вкладка спрятана нарочно: иначе прибор счёл бы тишину простоем игрока
    // и завёл ролик, а он рисует другой экран.
    hidden: true,
    getElementById: () => ({}),
    addEventListener: () => undefined,
    fonts,
  })
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('navigator', { userAgent: 'vitest' })
  vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
    // Держим только первый запрос: кадр подаём руками, чтобы прогон не
    // укатился в бесконечный цикл.
    rig.frame ??= cb
    return 0
  })
}

/** Включение прибора с заданным поведением шрифтов. */
async function powerOn(fonts: FontFaceSet): Promise<void> {
  stubBrowser(fonts)
  vi.resetModules()
  await import('../src/main')
}

/**
 * Сколько ждём предохранителя. Больше FONT_WAIT_MS из main.ts: точное значение
 * теста не касается, но за пять секунд прибор обязан сдаться и начать рисовать.
 */
const PATIENCE_MS = 5000

/** Подать кадр, который прибор попросил. */
const tick = (): void => rig.frame?.(1000)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  rig.frame = null
  rig.fills = 0
})

describe('первый кадр не ждёт шрифты вечно', () => {
  it('рисует, когда запрос шрифта повис и не вернётся', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await powerOn({
      // Сеть встала: обещание не разрешится и не отклонится никогда.
      load: () => new Promise<FontFace[]>(() => {}),
      get ready() {
        return new Promise<FontFaceSet>(() => {})
      },
    } as unknown as FontFaceSet)

    // Пока срок не вышел, прибор честно ждёт свои начертания.
    await vi.advanceTimersByTimeAsync(0)
    expect(rig.frame).toBeNull()

    await vi.advanceTimersByTimeAsync(PATIENCE_MS)
    expect(rig.frame, 'прибор так и не попросил кадр').not.toBeNull()

    tick()
    expect(rig.fills, 'на полотне ни одной заливки').toBeGreaterThan(0)
  })

  it('рисует, когда document.fonts.ready отказала', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await powerOn({
      load: () => Promise.resolve([]),
      // Свойством, а не полем: если запуск к ready не обращается, отказу
      // неоткуда взяться и висящего отклонения в прогоне не появится.
      get ready() {
        return Promise.reject(new Error('шрифты документа не доехали'))
      },
    } as unknown as FontFaceSet)

    await vi.advanceTimersByTimeAsync(PATIENCE_MS)
    expect(rig.frame, 'прибор так и не попросил кадр').not.toBeNull()

    tick()
    expect(rig.fills, 'на полотне ни одной заливки').toBeGreaterThan(0)
  })
})
