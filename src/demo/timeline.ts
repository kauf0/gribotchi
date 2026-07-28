/**
 * Аттракт-режим: тридцатипятисекундный ролик из семи сцен.
 *
 * Здесь окупается главное решение всей архитектуры — таймлайн собирает такой же
 * ScreenState, что и симуляция, и рисует его тот же рендерер. Ролик не может
 * разойтись с игрой при редизайне, потому что рисовать его больше нечем.
 *
 * Тайминги, тексты и параметры сцен — из reference/README.md. Камеры и комнаты
 * нет: прибор и так занимает экран, а наезжать в тамагочи некуда.
 */

import type { ScreenState } from '../view/screenState'
import type { ButtonId } from '../view/shell'
import { BUBBLE, MSG } from '../content/strings'

export type DemoFrame = {
  screen: ScreenState
  caption: string
  captionOpacity: number
  press: ButtonId | null
  led: boolean
  /** 0…1 — наплыв финальной плашки. */
  title: number
}

type Scene = {
  name: string
  dur: number
  caption: string
  build: (p: number, t: number) => Omit<DemoFrame, 'caption' | 'captionOpacity'>
}

const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v)

/** Общая часть игрового кадра, чтобы сцены не повторяли одно и то же. */
const game = (t: number, over: Partial<ScreenState>): ScreenState => ({
  mode: 'game',
  t,
  day: 1,
  food: 0.8,
  growth: 0.12,
  mold: 0,
  mood: 'happy',
  ...over,
})

/** Диод: 6 Гц в норме, чаще в тревоге. */
const blink = (t: number, fast = false): boolean => (fast ? Math.sin(t * 12) > 0 : Math.sin(t * 6) > -0.3)

const SCENES: Scene[] = [
  {
    name: 'Заставка',
    dur: 4,
    caption: '1987 год. Вам подарили гриб. В корпусе.',
    build: (p, t) => {
      const on = p > 0.12
      if (!on) return { screen: game(t, { mode: 'off' }), press: null, led: false, title: 0 }
      if (p <= 0.68) {
        return {
          screen: game(t, { mode: 'boot', boot: clamp((p - 0.16) / 0.42) }),
          press: null,
          led: blink(t),
          title: 0,
        }
      }
      return { screen: game(t, { msg: MSG.hello }), press: null, led: blink(t), title: 0 }
    },
  },
  {
    name: 'Знакомство',
    dur: 4.5,
    caption: 'День 1. Он маленький, слепой и уже голодный.',
    build: (p, t) => ({
      screen: game(t, {
        msg: MSG.aliveForNow,
        bubble: p > 0.35 && p < 0.85 ? BUBBLE.feedMe : undefined,
      }),
      press: null,
      led: blink(t),
      title: 0,
    }),
  },
  {
    name: 'Кормление',
    dur: 4.5,
    caption: 'Сладкий чай раз в три дня. Спасибо он не скажет.',
    build: (p, t) => {
      const pour = clamp((p - 0.22) / 0.5)
      return {
        screen: game(t, {
          day: 3,
          food: 0.5 + pour * 0.5,
          growth: 0.12 + clamp((p - 0.25) / 0.6) * 0.18,
          mood: p > 0.55 ? 'happy' : 'ok',
          sugar: p > 0.2 && p < 0.8 ? 1 : 0,
          hearts: p > 0.55 ? clamp((p - 0.55) / 0.35) : 0,
          msg: p > 0.6 ? MSG.fed : MSG.pouring,
        }),
        press: (p > 0.18 && p < 0.3) || (p > 0.4 && p < 0.5) ? 'A' : null,
        led: blink(t),
        title: 0,
      }
    },
  },
  {
    name: 'Забыли',
    dur: 5.5,
    caption: 'Вы уехали на две недели. Он считал дни. Все.',
    build: (p, t) => ({
      screen: game(t, {
        day: 3 + Math.floor(clamp((p - 0.1) / 0.75) * 14),
        food: 1 - clamp((p - 0.1) / 0.8),
        growth: 0.3,
        mood: p > 0.6 ? 'sad' : 'ok',
        mold: clamp((p - 0.6) / 0.5) * 0.5,
        scobyTop: 15 + Math.round(clamp((p - 0.5) / 0.5) * 3),
        msg: p > 0.75 ? 'КОРМЛЕНИЕ ПРОСРОЧЕНО НА 11 ДН.' : MSG.waiting,
      }),
      press: null,
      led: blink(t, p > 0.7),
      title: 0,
    }),
  },
  {
    name: 'Обида',
    dur: 5,
    caption: 'Гриб не кричит. Гриб отворачивается и ждёт.',
    build: (p, t) => ({
      screen: game(t, {
        day: 17,
        food: 0.05,
        growth: 0.26,
        mood: p > 0.45 ? 'away' : 'angry',
        mold: 0.8,
        flies: true,
        alarm: p > 0.1 && p < 0.9,
        scobyTop: 18,
        bubble: p > 0.35 && p < 0.8 ? BUBBLE.remembers : undefined,
        msg: MSG.turnedAway,
      }),
      press: null,
      led: blink(t, true),
      title: 0,
    }),
  },
  {
    name: 'Спасение',
    dur: 5.5,
    caption: 'Чай. Сахар. Извинения. Именно в таком порядке.',
    build: (p, t) => {
      const mash = p < 0.55
      const rec = clamp((p - 0.2) / 0.7)
      return {
        screen: game(t, {
          day: 18,
          food: 0.05 + rec * 0.9,
          growth: 0.26 + rec * 0.12,
          mood: p > 0.72 ? 'ok' : 'away',
          mold: 0.8 * (1 - rec),
          flies: p < 0.45,
          sugar: p < 0.6 ? 1 : 0,
          hearts: p > 0.8 ? clamp((p - 0.8) / 0.18) : 0,
          scobyTop: 17,
          msg: p > 0.72 ? MSG.forgiven : 'ЧАЙ! САХАР! ЧТО УГОДНО!',
        }),
        // Паническое нажатие кнопок по кругу, шесть раз в секунду.
        press: mash ? (['A', 'B', 'C'] as ButtonId[])[Math.floor(t * 6) % 3] : null,
        led: blink(t, mash),
        title: 0,
      }
    },
  },
  {
    name: 'Финал',
    dur: 6,
    caption: 'День 30. Теперь он больше вас.',
    build: (p, t) => ({
      screen: game(t, {
        day: 30,
        food: 0.9,
        growth: 0.38 + clamp((p - 0.05) / 0.45) * 0.62,
        scobyTop: 14,
        msg: p > 0.4 ? MSG.biggerThanOwner : MSG.growing,
      }),
      press: null,
      led: blink(t),
      title: clamp((p - 0.62) / 0.18),
    }),
  },
]

export const DEMO_DURATION = SCENES.reduce((sum, s) => sum + s.dur, 0)

/** Субтитр проявляется к 6 % сцены и уходит к 96 %. */
const captionFade = (p: number): number => Math.min(clamp((p - 0.06) / 0.12), clamp((1 - p - 0.04) / 0.1))

export function demoFrameAt(time: number): DemoFrame {
  let t = time % DEMO_DURATION
  for (const scene of SCENES) {
    if (t < scene.dur) {
      const p = t / scene.dur
      const frame = scene.build(p, t)
      return {
        ...frame,
        caption: scene.caption,
        // На финальной плашке субтитр уступает место заголовку.
        captionOpacity: captionFade(p) * (1 - frame.title),
      }
    }
    t -= scene.dur
  }
  // Недостижимо: сумма длительностей и есть DEMO_DURATION.
  const last = SCENES[SCENES.length - 1]
  return { ...last.build(1, time), caption: last.caption, captionOpacity: 0 }
}

export { SCENES as DEMO_SCENES }
