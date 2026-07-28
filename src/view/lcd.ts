/**
 * ЖК-экран: буфер 300×240 = сетка 50×40 клеток по 6 px.
 *
 * Примитивы повторяют прототип (reference/kombucha-scenes.jsx:17-25): координаты
 * задаются в клетках, дробные значения допустимы — округление идёт до целого
 * пикселя буфера, а не до клетки, иначе пузырьки и мошки будут дёргаться.
 *
 * Сканлайны здесь НЕ рисуются: буфер апскейлится целым множителем, и линия
 * толщиной в пиксель буфера превратилась бы в жирную полосу. Они лежат
 * CSS-оверлеем поверх канваса, в реальных пикселях экрана — см. style.css.
 */

import { SKINS, DEFAULT_SKIN, FONT_LCD, FONT_JP, type Palette, type SkinKey } from '../content/tokens'

export const U = 6
export const SW = 50
export const SH = 40
export const W = SW * U // 300
export const H = SH * U // 240

export type TextOpts = {
  /** Японский начертанием DotGothic16 — Handjet каны не содержит. */
  jp?: boolean
  tracking?: number
  align?: 'left' | 'center' | 'right'
  weight?: number
  alpha?: number
}

/**
 * Детерминированный псевдорандом по индексу — из прототипа
 * (reference/kombucha-scenes.jsx:27). Заменять на Math.random() нельзя:
 * нити, точки плесени и пузырьки должны стоять на месте от кадра к кадру,
 * иначе гриб превращается в кипящую кашу.
 */
export const rnd = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

export class Lcd {
  readonly ctx: CanvasRenderingContext2D
  pal: Palette = SKINS[DEFAULT_SKIN]

  private readonly supportsTracking: boolean

  constructor(canvas: HTMLCanvasElement, skin: SkinKey = DEFAULT_SKIN) {
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Браузер не дал 2d-контекст')
    this.ctx = ctx
    this.ctx.imageSmoothingEnabled = false
    // Прототип позиционировал текст как div с line-height: 1 — глифы centrируются
    // в боксе высотой в кегль. Canvas с textBaseline 'top' ставит их по линии
    // ascent, то есть заметно ниже. 'middle' + смещение на полкегля повторяет
    // поведение прототипа один в один, поэтому все координаты из README подходят
    // без пересчёта.
    this.ctx.textBaseline = 'middle'
    this.supportsTracking = 'letterSpacing' in ctx
    this.setSkin(skin)
  }

  setSkin(skin: SkinKey): void {
    this.pal = SKINS[skin]
  }

  /** Заливка всего экрана цветом фона люминофора. */
  clear(color: string = this.pal.lcd): void {
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, W, H)
  }

  /** Прямоугольник в клетках сетки. */
  r(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    const c = this.ctx
    if (alpha !== 1) c.globalAlpha = alpha
    c.fillStyle = color
    c.fillRect(Math.round(x * U), Math.round(y * U), Math.round(w * U), Math.round(h * U))
    if (alpha !== 1) c.globalAlpha = 1
  }

  /** Текст. x, y — в клетках; y задаёт ВЕРХ строки, как top у div в прототипе. */
  txt(x: number, y: number, text: string, size: number, color: string, opts: TextOpts = {}): void {
    const c = this.ctx
    const { jp = false, tracking = 0.5, align = 'left', weight = 400, alpha = 1 } = opts
    c.font = `${weight} ${size}px ${jp ? FONT_JP : FONT_LCD}`
    if (this.supportsTracking) c.letterSpacing = `${tracking}px`
    c.fillStyle = color
    if (alpha !== 1) c.globalAlpha = alpha
    let px = x * U
    if (align !== 'left') {
      const w = c.measureText(text).width
      px -= align === 'center' ? w / 2 : w
    }
    c.fillText(text, Math.round(px), Math.round(y * U + size / 2))
    if (alpha !== 1) c.globalAlpha = 1
    if (this.supportsTracking) c.letterSpacing = '0px'
  }

  /** Ширина строки в клетках — для облачка реплики и центрирования. */
  measure(text: string, size: number, opts: TextOpts = {}): number {
    const c = this.ctx
    const { jp = false, tracking = 0.5, weight = 400 } = opts
    c.font = `${weight} ${size}px ${jp ? FONT_JP : FONT_LCD}`
    if (this.supportsTracking) c.letterSpacing = `${tracking}px`
    const w = c.measureText(text).width
    if (this.supportsTracking) c.letterSpacing = '0px'
    return w / U
  }
}
