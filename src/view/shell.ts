/**
 * Корпус прибора в DOM: градиенты, шильдик, кнопки, динамик, светодиод.
 * Строится один раз; каждый кадр меняются только светодиод и класс нажатия.
 *
 * Масштабирование. Пиксельной сетке ЖК нужен ЦЕЛЫЙ множитель, иначе одни
 * «пиксели» люминофора выйдут шире других и экран будет рябить. Поэтому
 * подбирается целое S — сколько device-пикселей приходится на единицу прибора, —
 * а вся сцена масштабируется на S / devicePixelRatio и прижимается к целым
 * device-пикселям. Буфер канваса остаётся 300×240 и апскейлится ровно в S раз.
 */

import { GEOM, SKINS, type SkinKey } from '../content/tokens'
import { BRAND, BUTTONS } from '../content/strings'
import { W, H } from './lcd'

export type ButtonId = 'A' | 'B' | 'C'

export type Shell = {
  canvas: HTMLCanvasElement
  setLed(on: boolean): void
  setPressed(id: ButtonId | null): void
  setSkin(skin: SkinKey): void
  setScreenOn(on: boolean): void
  /** Смещение всего прибора в CSS-пикселях — тряска на резких событиях. */
  setShake(x: number, y: number): void
  setMuted(muted: boolean): void
  /** Субтитр аттракт-режима. */
  setCaption(text: string, opacity: number): void
  /** Финальная плашка ролика. */
  setTitleCard(opacity: number): void
  /** Текущий множитель: device-пикселей на единицу прибора. */
  scale(): number
}

/** Ушко торчит выше корпуса, поэтому сцена выше прибора на 46 единиц. */
const Y_OFFSET = 46
const STAGE_W = GEOM.body.w
const STAGE_H = GEOM.bounds.h
/** Поля вокруг прибора, чтобы он не упирался в края экрана. */
const PADDING = 12

/**
 * Значок динамика. Волны и перечёркивание — два отдельных слоя: класс
 * .is-muted гасит первое и показывает второе, так что состояние звука видно,
 * не нажимая.
 */
const SOUND_ICON = `
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path class="sound__cone" d="M3 9h3.6L11 5.2v13.6L6.6 15H3z"/>
  <g class="sound__waves" fill="none" stroke-width="1.8" stroke-linecap="round">
    <path d="M14.2 9.4a3.6 3.6 0 0 1 0 5.2"/>
    <path d="M16.8 6.8a7.2 7.2 0 0 1 0 10.4"/>
  </g>
  <g class="sound__cross" fill="none" stroke-width="1.8" stroke-linecap="round">
    <path d="M14.6 9.4l5.4 5.2"/>
    <path d="M20 9.4l-5.4 5.2"/>
  </g>
</svg>`

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  style?: Partial<CSSStyleDeclaration>,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (style) Object.assign(node.style, style)
  return node
}

const px = (n: number) => `${n}px`

/** Ставит элемент в координатах прибора. */
function place(node: HTMLElement, x: number, y: number, w?: number, h?: number): void {
  node.style.left = px(x)
  node.style.top = px(y + Y_OFFSET)
  if (w !== undefined) node.style.width = px(w)
  if (h !== undefined) node.style.height = px(h)
}

export type ShellHandlers = {
  onPress: (id: ButtonId) => void
  /** Нажатие на динамик — переключатель звука. */
  onSpeaker: () => void
}

export function mountShell(root: HTMLElement, handlers: ShellHandlers): Shell {
  const { onPress, onSpeaker } = handlers
  const room = el('div', 'room')
  room.append(el('div', 'room__cloth'))

  const stage = el('div', 'stage')

  // Ушко — под корпусом, снаружи видна только дужка.
  const ring = el('div', 'lug-ring')
  place(ring, GEOM.ring.x, GEOM.ring.y)
  const neck = el('div', 'lug-neck')
  place(neck, GEOM.lug.x, GEOM.lug.y)

  const body = el('div', 'body')
  place(body, GEOM.body.x, GEOM.body.y)

  const bezel = el('div', 'bezel')
  place(bezel, GEOM.bezel.x, GEOM.bezel.y, GEOM.bezel.w, GEOM.bezel.h)

  const canvas = el('canvas', 'lcd')
  canvas.width = W
  canvas.height = H
  place(canvas, GEOM.lcd.x, GEOM.lcd.y, GEOM.lcd.w, GEOM.lcd.h)

  const overlay = el('div', 'lcd-overlay')
  place(overlay, GEOM.lcd.x, GEOM.lcd.y, GEOM.lcd.w, GEOM.lcd.h)

  const glow = el('div', 'lcd-glow')
  place(glow, GEOM.lcd.x, GEOM.lcd.y, GEOM.lcd.w, GEOM.lcd.h)

  // Шильдик: слева крупное название, справа столбиком служебные маркировки.
  const plate = el('div', 'plate')
  place(plate, GEOM.plate.x, GEOM.plate.y, GEOM.plate.w)
  const name = el('span', 'plate__name')
  name.textContent = BRAND.ru
  const marks = el('div', 'plate__marks')
  const gost = el('span', 'plate__gost')
  gost.textContent = BRAND.gost
  const jp = el('span', 'plate__jp')
  jp.textContent = BRAND.jp
  jp.lang = 'ja'
  marks.append(gost, jp)
  plate.append(name, marks)

  const subtitle = el('div', 'subtitle')
  place(subtitle, GEOM.sub.x, GEOM.sub.y, GEOM.plate.w)
  subtitle.textContent = BRAND.sub

  const ids: ButtonId[] = ['A', 'B', 'C']
  const buttons = new Map<ButtonId, HTMLButtonElement>()
  const btnNodes = ids.map((id, i) => {
    const b = el('button', id === 'C' ? 'btn btn--sos' : 'btn')
    b.type = 'button'
    b.textContent = BUTTONS[id]
    place(b, GEOM.buttons.cx[i] - GEOM.buttons.d / 2, GEOM.buttons.y)
    b.addEventListener('click', () => onPress(id))
    b.addEventListener('pointerdown', () => b.classList.add('is-pressed'))
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) {
      b.addEventListener(ev, () => b.classList.remove('is-pressed'))
    }
    b.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') b.classList.add('is-pressed')
    })
    b.addEventListener('keyup', () => b.classList.remove('is-pressed'))
    buttons.set(id, b)
    return b
  })

  // Решётка тоже глушит звук — жест понятный, — но доступным элементом
  // управления служит кнопка с иконкой: два табстопа на одно действие только
  // мешали бы клавиатуре.
  const speaker = el('div', 'speaker')
  speaker.setAttribute('aria-hidden', 'true')
  place(speaker, GEOM.speaker.x, GEOM.speaker.y, GEOM.speaker.w, GEOM.speaker.h)
  for (let i = 0; i < 20; i++) speaker.append(el('i'))
  speaker.addEventListener('click', onSpeaker)

  const sound = el('button', 'sound')
  sound.type = 'button'
  place(sound, GEOM.sound.x, GEOM.sound.y, GEOM.sound.d, GEOM.sound.d)
  sound.innerHTML = SOUND_ICON
  sound.addEventListener('click', onSpeaker)

  const led = el('div', 'led')
  place(led, GEOM.led.x, GEOM.led.y)

  stage.append(ring, neck, body, bezel, canvas, overlay, glow, plate, subtitle, ...btnNodes, speaker, led, sound)

  // Слои аттракт-режима живут вне сцены: субтитры и плашка принадлежат экрану,
  // а не прибору, и масштабироваться вместе с ним не должны.
  const scrim = el('div', 'caption-scrim', { opacity: '0' })
  const caption = el('div', 'caption', { opacity: '0' })
  const titleCard = el('div', 'title-card', { opacity: '0', display: 'none' })
  const titleName = el('div', 'title-card__name')
  titleName.textContent = BRAND.ru
  const titleJp = el('div', 'title-card__jp')
  titleJp.textContent = BRAND.jp
  titleJp.lang = 'ja'
  const titleTag = el('div', 'title-card__tagline')
  titleTag.textContent = BRAND.tagline
  titleCard.append(titleName, titleJp, titleTag)

  root.append(room, stage, el('div', 'room__vignette'), scrim, caption, titleCard)

  let currentScale = 1
  let cssScale = 1
  let shakeX = 0
  let shakeY = 0

  const applyTransform = (): void => {
    stage.style.transform = `translate(${shakeX}px, ${shakeY}px) scale(${cssScale})`
  }

  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1
    const availW = (window.innerWidth - PADDING * 2) * dpr
    const availH = (window.innerHeight - PADDING * 2) * dpr
    const raw = Math.min(availW / STAGE_W, availH / STAGE_H)
    // Обычно берём целый множитель — только так пиксельная сетка не рябит.
    // Но если прибор не влезает даже один к одному (узкое окно на экране без
    // ретины), обрезать его хуже, чем смасштабировать дробно: там всё равно
    // не до хрустящих пикселей, и канвас переходит на сглаживание.
    const s = raw >= 1 ? Math.floor(raw) : Math.max(0.2, raw)
    currentScale = s
    canvas.style.imageRendering = s >= 1 ? 'pixelated' : 'auto'

    const k = s / dpr
    const w = STAGE_W * k
    const h = STAGE_H * k
    // Прижимаем к целым device-пикселям, иначе целый апскейл съедет на полпикселя.
    const left = Math.round(((window.innerWidth - w) / 2) * dpr) / dpr
    const top = Math.round(((window.innerHeight - h) / 2) * dpr) / dpr

    stage.style.left = px(left)
    stage.style.top = px(top)
    cssScale = k
    applyTransform()

    // Сканлайны задаются в единицах прибора, но должны оставаться ~3 CSS-пикселя
    // на любом масштабе: одна единица занимает s device-пикселей, значит период
    // в единицах равен 3 · dpr / s.
    stage.style.setProperty('--scan-line', px((1 * dpr) / s))
    stage.style.setProperty('--scan-period', px((3 * dpr) / s))
  }

  fit()
  window.addEventListener('resize', fit)
  window.addEventListener('orientationchange', fit)

  return {
    canvas,
    setLed: (on) => led.classList.toggle('is-on', on),
    setPressed: (id) => {
      for (const [key, node] of buttons) node.classList.toggle('is-pressed', key === id)
    },
    setSkin: (skin) => {
      stage.style.setProperty('--glow', SKINS[skin].glow)
    },
    setScreenOn: (on) => {
      glow.style.opacity = on ? '1' : '0'
    },
    setShake: (x, y) => {
      if (x === shakeX && y === shakeY) return
      shakeX = x
      shakeY = y
      applyTransform()
    },
    setMuted: (muted) => {
      speaker.classList.toggle('is-muted', muted)
      sound.classList.toggle('is-muted', muted)
      sound.title = muted ? 'Включить звук' : 'Выключить звук'
      sound.setAttribute('aria-label', sound.title)
      sound.setAttribute('aria-pressed', String(muted))
    },
    setCaption: (text, opacity) => {
      if (caption.textContent !== text) caption.textContent = text
      const o = String(opacity)
      caption.style.opacity = o
      scrim.style.opacity = o
    },
    setTitleCard: (opacity) => {
      titleCard.style.display = opacity > 0 ? 'flex' : 'none'
      titleCard.style.opacity = String(opacity)
    },
    scale: () => currentScale,
  }
}
