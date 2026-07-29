/**
 * Сидирование состояния экрана из URL — headless-близнец отладочной панели.
 *
 * Панелью удобно крутить руками, но снимок для сверки с reference/screens/
 * нужно уметь снять без единого клика:
 *   ?manual&food=.8&growth=.12&mood=happy&bubble=КОРМИ
 * Работает только в dev-сборке.
 */

import type { Mood, ScreenState } from '../view/screenState'
import { SKIN_KEYS, type SkinKey } from '../content/tokens'

const MOODS: Mood[] = ['happy', 'ok', 'sad', 'angry', 'away', 'dead']

/**
 * Правки самой симуляции: `sim.food=.1&sim.dead` собирает нужное состояние
 * объекта, а не подменяет картинку. Так экраны сводки и гибели снимаются
 * настоящим кодом, а не декорацией.
 */
export type SimSeed = {
  food?: number
  growth?: number
  mold?: number
  resentment?: number
  generation?: number
  dead?: boolean
  /** Сколько выдуманных записей положить в журнал — чтобы проверить прокрутку. */
  journal?: number
}

export type UrlSeed = {
  manual: boolean
  /** Начальное значение часов, секунды: ?t=5 перескакивает загрузку. */
  clock?: number
  skin?: SkinKey
  patch: Partial<ScreenState>
  sim?: SimSeed
  /** Какой экран открыть поверх игры. */
  open?: 'report' | 'pour' | 'incident' | 'strain'
  /** Запустить ролик сразу, с указанной секунды: ?attract=20. */
  attract?: number
  /**
   * Показать предложение установки: ?install=prompt или ?install=ios.
   * Событие beforeinstallprompt в headless-браузере не приходит, а посмотреть
   * на надпись и проверить её расположение надо.
   */
  install?: 'prompt' | 'ios-hint'
  /**
   * Признаки штамма для снимков: ?traits=wiry,healing,devoted. Дожидаться,
   * пока они закрепятся сами, никакой съёмки не хватит.
   */
  traits?: string[]
  /**
   * Через сколько секунд простоя прибор сам показывает ролик: ?idle=3.
   * В игре это минута, и ждать её в каждом прогоне теста никто не станет.
   */
  idleBeforeAttract?: number
}

const num = (q: URLSearchParams, key: string): number | undefined => {
  const raw = q.get(key)
  if (raw === null) return undefined
  const v = Number(raw)
  return Number.isFinite(v) ? v : undefined
}

const flag = (q: URLSearchParams, key: string): boolean | undefined => {
  const raw = q.get(key)
  if (raw === null) return undefined
  return raw !== '0' && raw !== 'false'
}

export function readUrlSeed(search: string): UrlSeed {
  const q = new URLSearchParams(search)
  const patch: Partial<ScreenState> = {}

  for (const key of ['food', 'growth', 'mold', 'day', 'sugar', 'hearts', 'washing'] as const) {
    const v = num(q, key)
    if (v !== undefined) patch[key] = v
  }
  for (const key of ['alarm', 'flies'] as const) {
    const v = flag(q, key)
    if (v !== undefined) patch[key] = v
  }
  for (const key of ['msg', 'bubble'] as const) {
    const v = q.get(key)
    if (v !== null) patch[key] = v || undefined
  }

  const mood = q.get('mood')
  if (mood && (MOODS as string[]).includes(mood)) patch.mood = mood as Mood

  const scobyTop = num(q, 'scobyTop')
  if (scobyTop !== undefined) patch.scobyTop = scobyTop

  const skinRaw = q.get('skin')
  const skin = skinRaw && (SKIN_KEYS as string[]).includes(skinRaw) ? (skinRaw as SkinKey) : undefined

  const sim: SimSeed = {}
  for (const key of ['food', 'growth', 'mold', 'resentment', 'generation', 'journal'] as const) {
    const v = num(q, `sim.${key}`)
    if (v !== undefined) sim[key] = v
  }
  if (flag(q, 'sim.dead')) sim.dead = true

  const openRaw = q.get('open')
  const open =
    openRaw === 'report' || openRaw === 'pour' || openRaw === 'incident' || openRaw === 'strain'
      ? openRaw
      : undefined
  const attract = q.has('attract') ? (num(q, 'attract') ?? 0) : undefined
  const idle = num(q, 'idle')
  const traitsRaw = q.get('traits')
  const traits = traitsRaw ? traitsRaw.split(',').filter(Boolean) : undefined
  const installRaw = q.get('install')
  const install =
    installRaw === 'prompt' ? ('prompt' as const) : installRaw === 'ios' ? ('ios-hint' as const) : undefined

  return {
    manual: q.has('manual') || Object.keys(patch).length > 0,
    clock: num(q, 't'),
    skin,
    patch,
    sim: Object.keys(sim).length > 0 ? sim : undefined,
    open,
    traits,
    install,
    attract,
    idleBeforeAttract: idle !== undefined && idle >= 0 ? idle * 1000 : undefined,
  }
}
