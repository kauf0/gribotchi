/**
 * Эфемерный слой: сахар, сердечки, промывка и временные реплики прибора.
 *
 * В симуляции им не место — они ничего не решают и не должны попадать
 * в сохранение. Живут ровно столько, сколько длится анимация.
 */

import type { Effect } from '../sim/actions'

const SUGAR_MS = 2200
const HEARTS_MS = 1800
const WASH_MS = 3000
const MSG_MS = 4000
const BUBBLE_MS = 3500
const SHAKE_MS = 600

export type FxSnapshot = {
  sugar: number
  hearts: number
  washing: number
  msg?: string
  bubble?: string
}

/**
 * Доля пройденного отрезка, 0 — если он не начинался или уже кончился.
 * «Не начинался» помечается −Infinity, а не нулём: ноль — это законный момент
 * времени, и на нём эффекты молча не запускались бы.
 */
const progress = (start: number, now: number, span: number): number => {
  const p = (now - start) / span
  return p >= 0 && p < 1 ? p : 0
}

export class Fx {
  private sugarAt = -Infinity
  private heartsAt = -Infinity
  private washAt = -Infinity
  private msgAt = -Infinity
  private msgText = ''
  private bubbleAt = -Infinity
  private bubbleText = ''
  private shakeAt = -Infinity
  private shakePower = 0

  /** Реакция на действие: показать эффект и реплику прибора. */
  play(effect: Effect, msg: string, now: number): void {
    if (effect === 'sugar') this.sugarAt = now
    if (effect === 'hearts') {
      this.heartsAt = now
      this.sugarAt = now
    }
    if (effect === 'wash') this.washAt = now
    this.say(msg, now)
  }

  say(text: string, now: number): void {
    this.msgText = text
    this.msgAt = now
  }

  /** Реплика самого гриба в облачке над банкой. */
  speak(text: string, now: number): void {
    this.bubbleText = text
    this.bubbleAt = now
  }

  /** Тряска корпуса: резкое событие, а не постоянный фон. */
  shake(power: number, now: number): void {
    this.shakeAt = now
    this.shakePower = power
  }

  /** Смещение прибора в CSS-пикселях; затухает к концу. */
  shakeOffset(now: number): [number, number] {
    const p = progress(this.shakeAt, now, SHAKE_MS)
    if (!p) return [0, 0]
    const a = this.shakePower * (1 - p)
    return [Math.sin(now * 0.09) * a, Math.cos(now * 0.073) * a]
  }

  /** Промывка блокирует ввод: банка пуста, объект на дне. */
  isWashing(now: number): boolean {
    return progress(this.washAt, now, WASH_MS) > 0
  }

  snapshot(now: number): FxSnapshot {
    const msgAlive = now - this.msgAt < MSG_MS
    const bubbleAlive = now - this.bubbleAt < BUBBLE_MS
    return {
      sugar: progress(this.sugarAt, now, SUGAR_MS) > 0 ? 1 : 0,
      hearts: progress(this.heartsAt, now, HEARTS_MS),
      washing: progress(this.washAt, now, WASH_MS),
      msg: msgAlive ? this.msgText : undefined,
      bubble: bubbleAlive ? this.bubbleText : undefined,
    }
  }
}
