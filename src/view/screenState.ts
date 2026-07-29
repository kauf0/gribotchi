/**
 * Контракт рендера — единственный шов между симуляцией и картинкой.
 *
 * Симуляция ничего не знает о пикселях, рендерер ничего не знает о реальном
 * времени и сохранениях. Оба общаются только через этот объект. Отсюда же
 * бесплатно получается аттракт-режим: таймлайн ролика собирает такой же
 * ScreenState, и его рисует тот же код.
 */

import type { TraitKey } from '../sim/traits'

export type Mood = 'happy' | 'ok' | 'sad' | 'angry' | 'away' | 'dead'

export type ScreenMode = 'start' | 'off' | 'boot' | 'game' | 'journal' | 'death' | 'pour' | 'incident' | 'cull' | 'graft' | 'strain'

/**
 * Экран запуска. Он же — та самая нажатая кнопка, без которой браузер не даёт
 * зазвучать музыке: игра не начинается сама, значит и объяснять политику
 * автовоспроизведения никому не приходится.
 */
export type StartCard = {
  action: string
  /** Строка для вернувшегося владельца: день и поколение. */
  note?: string
  hint: string
}

export type ScreenState = {
  mode: ScreenMode
  /** Время для анимаций, секунды. Непрерывно, не сбрасывается между кадрами. */
  t: number

  /** Прогресс построчной загрузки 0…1 (mode === 'boot'). */
  boot?: number

  day: number
  food: number // 0…1
  growth: number // 0…1
  mold: number // 0…1
  mood: Mood

  /** Верх диска гриба в клетках; по умолчанию 15. Опускается, когда грибу плохо. */
  scobyTop?: number

  /** Строка сообщения внизу экрана. */
  msg?: string
  /** Облачко реплики над банкой. */
  bubble?: string

  alarm?: boolean
  flies?: boolean
  /** 0…1 — доля видимых падающих крупинок сахара. */
  sugar?: number
  /** 0…1 — прогресс всплытия сердечек. */
  hearts?: number
  /** 0…1 — прогресс промывки: 0…0.5 слив, 0.5…1 залив. */
  washing?: number

  /** Текстовые экраны: сводка, извещение о гибели, бланк подачи. */
  report?: Report

  /** Экран запуска. */
  start?: StartCard

  generation?: number

  /**
   * Признаки штамма: от них зависит силуэт гриба. Шов цел — симуляция
   * по-прежнему не знает о пикселях, а вид не знает об условиях закрепления.
   */
  traits?: TraitKey[]
}

export type Report = {
  title: string
  lines: string[]
  /** Индекс первой видимой строки: экран узкий, всё сразу не помещается. */
  scroll: number
  /** Подсказка по кнопкам в самом низу. */
  hint: string
}

export const DEFAULT_SCREEN: ScreenState = {
  mode: 'off',
  t: 0,
  day: 1,
  food: 1,
  growth: 0,
  mold: 0,
  mood: 'ok',
}
