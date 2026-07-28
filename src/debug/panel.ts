/**
 * Отладочная панель: ползунки экрана и живая сводка по симуляции.
 *
 * Два режима, и их легко перепутать, поэтому они разведены жёстко:
 *
 *  — РУЧНОЙ. Любой ползунок, настроение, флажок или текстовое поле подменяют
 *    картинку целиком. Симуляция при этом продолжает идти, но её не видно.
 *    Нужен для сверки рендера с кадрами из reference/screens/.
 *
 *  — ЖИВОЙ. Панель показывает настоящее состояние объекта и ускоритель
 *    времени. Кнопки ×60 и ×600 сами выключают ручной режим: иначе ускорение
 *    крутило бы симуляцию за подменённой картинкой, и казалось бы, что время
 *    стоит.
 *
 * В прод не попадает (собирается только при import.meta.env.DEV).
 */

import type { Mood, ScreenState } from '../view/screenState'
import { SKIN_KEYS, type SkinKey } from '../content/tokens'

const MOODS: Mood[] = ['happy', 'ok', 'sad', 'angry', 'away', 'dead']

/** Срез симуляции для показа. Обиды нет в ScreenState, а следить за ней нужно. */
export type DebugProbe = {
  phase: string
  day: number
  food: number
  growth: number
  mold: number
  resentment: number
  generation: number
  alive: boolean
  mood: Mood
}

export type DebugControls = {
  /** Панель перехватила управление экраном — симуляцию не показываем. */
  enabled: boolean
  state: ScreenState
  skin: SkinKey
  /** Множитель хода времени для симуляции: 1, 60 или 600. */
  timeScale: number
  /** Живое состояние симуляции; задаётся main.ts. */
  probe?: () => DebugProbe
  /**
   * Стереть сохранение. Делает это main.ts, а не панель: перед перезагрузкой
   * игра сохраняется по pagehide и тут же возвращала бы стёртое обратно.
   */
  onReset?: () => void
}

const CSS = `
.dbg { position: fixed; top: 8px; left: 8px; z-index: 100; width: 244px;
  font: 12px/1.35 ui-monospace, monospace; color: #d9c9a3;
  background: rgba(12,13,8,.92); border: 1px solid #4a4a38; border-radius: 6px; }
.dbg summary { cursor: pointer; padding: 6px 8px; list-style: none; letter-spacing: .5px;
  text-transform: uppercase; opacity: .75; }
.dbg summary::-webkit-details-marker { display: none; }
.dbg__body { padding: 4px 8px 10px; display: grid; gap: 6px; }
.dbg label { display: grid; grid-template-columns: 62px 1fr 34px; align-items: center; gap: 6px; }
.dbg input[type=range] { width: 100%; accent-color: #e05a3a; }
.dbg select, .dbg input[type=text] { width: 100%; background: #20211a; color: #d9c9a3;
  border: 1px solid #4a4a38; border-radius: 3px; padding: 2px 4px; font: inherit; }
.dbg .dbg__row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.dbg .dbg__row label { display: inline-flex; grid-template-columns: none; gap: 4px; }
.dbg output { text-align: right; opacity: .8; }
.dbg button { background: #20211a; color: #d9c9a3; border: 1px solid #4a4a38;
  border-radius: 3px; padding: 2px 7px; font: inherit; cursor: pointer; }
.dbg button.is-on { border-color: #e05a3a; color: #f0e4cd; }
.dbg__live { border-top: 1px solid #4a4a38; padding-top: 6px; margin-top: 2px;
  white-space: pre; opacity: .85; font-size: 11px; line-height: 1.5; }
.dbg__live b { color: #e0b070; font-weight: normal; }
.dbg__hint { opacity: .5; font-size: 11px; }
`

export function mountDebugPanel(controls: DebugControls, onSkin: (s: SkinKey) => void): void {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const box = document.createElement('details')
  box.className = 'dbg'
  box.open = true
  const summary = document.createElement('summary')
  summary.textContent = 'Отладка'
  const body = document.createElement('div')
  body.className = 'dbg__body'
  box.append(summary, body)
  document.body.append(box)

  const takeover = document.createElement('label')
  const check = document.createElement('input')
  check.type = 'checkbox'
  check.checked = controls.enabled
  check.addEventListener('change', () => {
    controls.enabled = check.checked
  })
  const takeoverText = document.createElement('span')
  takeoverText.textContent = 'ручной режим'
  takeover.style.gridTemplateColumns = 'auto 1fr'
  takeover.append(check, takeoverText)
  body.append(takeover)

  /**
   * Любая правка картинки включает ручной режим. Раньше это делали только
   * ползунки, а флажки и текстовые поля молча писали в состояние, которое
   * никто не показывал.
   */
  const takeControl = (): void => {
    controls.enabled = true
    check.checked = true
  }

  const s = controls.state

  const slider = (
    label: string,
    get: () => number,
    set: (v: number) => void,
    max = 1,
    step = 0.01,
  ): ((v: number) => void) => {
    const row = document.createElement('label')
    const name = document.createElement('span')
    name.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = String(max)
    input.step = String(step)
    input.value = String(get())
    const out = document.createElement('output')
    const show = (v: number): void => {
      out.textContent = step < 1 ? v.toFixed(2) : String(Math.round(v))
    }
    show(get())
    input.addEventListener('input', () => {
      const v = Number(input.value)
      set(v)
      show(v)
      takeControl()
    })
    row.append(name, input, out)
    body.append(row)
    // Возвращаем «показать значение снаружи»: в живом режиме ползунки следуют
    // за симуляцией, иначе ускорение времени выглядело бы как ничего.
    return (v: number) => {
      if (controls.enabled) return
      input.value = String(v)
      show(v)
    }
  }

  const followFood = slider('сытость', () => s.food, (v) => (s.food = v))
  const followGrowth = slider('рост', () => s.growth, (v) => (s.growth = v))
  const followMold = slider('плесень', () => s.mold, (v) => (s.mold = v))
  const followDay = slider('день', () => s.day, (v) => (s.day = v), 60, 1)
  slider('промывка', () => s.washing ?? 0, (v) => (s.washing = v))
  slider('сахар', () => s.sugar ?? 0, (v) => (s.sugar = v))
  slider('сердечки', () => s.hearts ?? 0, (v) => (s.hearts = v))

  const select = <T extends string>(
    label: string,
    options: readonly T[],
    get: () => T,
    set: (v: T) => void,
  ): ((v: T) => void) => {
    const row = document.createElement('label')
    row.style.gridTemplateColumns = '62px 1fr'
    const name = document.createElement('span')
    name.textContent = label
    const sel = document.createElement('select')
    for (const o of options) {
      const opt = document.createElement('option')
      opt.value = o
      opt.textContent = o
      sel.append(opt)
    }
    sel.value = get()
    sel.addEventListener('change', () => set(sel.value as T))
    row.append(name, sel)
    body.append(row)
    return (v: T) => {
      if (!controls.enabled) sel.value = v
    }
  }

  const followMood = select('настрой', MOODS, () => s.mood, (v) => {
    s.mood = v
    takeControl()
  })
  select('люминофор', SKIN_KEYS, () => controls.skin, (v) => {
    controls.skin = v
    onSkin(v)
  })

  const toggles = document.createElement('div')
  toggles.className = 'dbg__row'
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
    const row = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = get()
    input.addEventListener('change', () => {
      set(input.checked)
      takeControl()
    })
    const text = document.createElement('span')
    text.textContent = label
    row.append(input, text)
    toggles.append(row)
  }
  toggle('тревога', () => !!s.alarm, (v) => (s.alarm = v))
  toggle('мошки', () => !!s.flies, (v) => (s.flies = v))
  body.append(toggles)

  const textField = (label: string, get: () => string, set: (v: string) => void): void => {
    const row = document.createElement('label')
    row.style.gridTemplateColumns = '62px 1fr'
    const name = document.createElement('span')
    name.textContent = label
    const input = document.createElement('input')
    input.type = 'text'
    input.value = get()
    input.addEventListener('input', () => {
      set(input.value)
      takeControl()
    })
    row.append(name, input)
    body.append(row)
  }
  textField('сообщение', () => s.msg ?? '', (v) => (s.msg = v || undefined))
  textField('облачко', () => s.bubble ?? '', (v) => (s.bubble = v || undefined))

  // ── ускоритель времени ──────────────────────────────────────────
  const speeds = document.createElement('div')
  speeds.className = 'dbg__row'
  const speedLabel = document.createElement('span')
  speedLabel.textContent = 'время:'
  speedLabel.style.opacity = '.7'
  speeds.append(speedLabel)

  const speedButtons: HTMLButtonElement[] = []
  for (const mult of [1, 60, 600]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = `×${mult}`
    b.classList.toggle('is-on', mult === controls.timeScale)
    b.addEventListener('click', () => {
      controls.timeScale = mult
      // Ускорять время имеет смысл только для живой симуляции: под ручным
      // режимом её просто не видно, и кажется, что время стоит.
      controls.enabled = false
      check.checked = false
      for (const other of speedButtons) other.classList.toggle('is-on', other === b)
    })
    speedButtons.push(b)
    speeds.append(b)
  }
  body.append(speeds)

  const hint = document.createElement('div')
  hint.className = 'dbg__hint'
  hint.textContent = 'ускорение выключает ручной режим'
  body.append(hint)

  // ── живая сводка ────────────────────────────────────────────────
  const live = document.createElement('div')
  live.className = 'dbg__live'
  body.append(live)

  const bar = (v: number): string => '█'.repeat(Math.round(v * 10)).padEnd(10, '·')

  const refresh = (): void => {
    const probe = controls.probe?.()
    if (!probe) return

    live.innerHTML =
      `<b>${probe.phase}</b>  ×${controls.timeScale}  ${controls.enabled ? 'РУЧНОЙ' : 'живой'}\n` +
      `день ${probe.day}   поколение ${probe.generation}   ${probe.alive ? probe.mood : 'МЁРТВ'}\n` +
      `сыт  ${bar(probe.food)} ${probe.food.toFixed(2)}\n` +
      `рост ${bar(probe.growth)} ${probe.growth.toFixed(2)}\n` +
      `плес ${bar(probe.mold)} ${probe.mold.toFixed(2)}\n` +
      `обид ${bar(probe.resentment)} ${probe.resentment.toFixed(2)}`

    // В живом режиме органы управления следуют за симуляцией — тогда видно,
    // что ускоренное время действительно идёт.
    followFood(probe.food)
    followGrowth(probe.growth)
    followMold(probe.mold)
    followDay(probe.day)
    followMood(probe.mood)
  }

  refresh()
  window.setInterval(refresh, 200)

  // Полный цикл жизни занимает несколько реальных суток — без сброса
  // сохранения плейтестить смерть и смену поколений невозможно.
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.textContent = 'стереть сохранение'
  reset.addEventListener('click', () => controls.onReset?.())
  body.append(reset)
}
