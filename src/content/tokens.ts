/**
 * Дизайн-токены из reference/README.md.
 *
 * Геометрия корпуса перенесена из «сценических» координат прототипа (стол 1280×720,
 * прибор в точке 400,100) в локальные координаты самого прибора: начало отсчёта —
 * левый верхний угол корпуса, единица — один пиксель ЖК-буфера. Благодаря этому
 * canvas 300×240 масштабируется вместе с корпусом ровно целым множителем.
 */

export const SHELL = {
  hi: '#ded4b6', // блик
  body: '#c6bb9c', // тело
  lo: '#9c9174', // тень
  deep: '#6f664f', // глубокая тень
  red: '#8e3a2a', // кнопка СОС
  ink: '#2b271d', // краска на корпусе
  bezel: '#3b3627', // рамка экрана
  ledOff: '#5c4030',
  ledOn: '#e05a3a',
  lightText: '#f0e4cd',
} as const

export const ROOM = {
  wall1: '#4a4a38',
  wall2: '#2a2b21',
  wall3: '#16170f',
  bg: '#101109',
} as const

/** Палитра ЖК: фон, два оттенка заливки и «чернила». */
export type Palette = {
  lcd: string
  c1: string
  c2: string
  c3: string
  glow: string
}

export const SKINS = {
  olive: { lcd: '#9fb07c', c1: '#7b8d5d', c2: '#4a573a', c3: '#1b2314', glow: 'rgba(190,215,140,.35)' },
  amber: { lcd: '#c8a15a', c1: '#a97f3f', c2: '#6a4a20', c3: '#241706', glow: 'rgba(240,190,110,.35)' },
  ash: { lcd: '#a8a99e', c1: '#87887d', c2: '#4e4f47', c3: '#1c1d18', glow: 'rgba(210,212,200,.3)' },
} satisfies Record<string, Palette>

export type SkinKey = keyof typeof SKINS
export const SKIN_KEYS = Object.keys(SKINS) as SkinKey[]
export const DEFAULT_SKIN: SkinKey = 'amber'

/** Габариты прибора в локальных координатах. Ушко торчит выше корпуса — отсюда минусы. */
export const GEOM = {
  body: { x: 0, y: 0, w: 480, h: 600 },
  /** Полный габарит с ушком — по нему считается вписывание во вьюпорт. */
  bounds: { top: -46, h: 646 },
  ring: { x: 220, y: -42, d: 40, border: 10 },
  lug: { x: 208, y: -12, w: 64, h: 40 },
  bezel: { x: 62, y: 52, w: 356, h: 296 },
  lcd: { x: 90, y: 80, w: 300, h: 240 },
  plate: { x: 62, y: 356, w: 356 },
  sub: { x: 62, y: 400 },
  buttons: { y: 428, d: 68, cx: [112, 240, 368] },
  speaker: { x: 140, y: 520, w: 200, h: 34 },
  led: { x: 32, y: 28, d: 16 },
  /**
   * Переключатель звука. Центр зеркалит светодиод (40, 36) относительно
   * середины корпуса, поэтому верх прибора читается как пара: индикатор
   * слева, накладка справа.
   */
  sound: { x: 422, y: 18, d: 36 },
} as const

export const FONT_LCD = '"Handjet", monospace'
export const FONT_JP = '"DotGothic16", "Handjet", monospace'
export const FONT_SHELL = '"PT Sans Narrow", sans-serif'
