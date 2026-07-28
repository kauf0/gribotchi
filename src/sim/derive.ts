/**
 * Производные величины: всё, что вычисляется из состояния и не хранится.
 * Чистые функции — их удобно проверять и невозможно рассинхронизировать
 * с сохранением.
 */

import type { Mood } from '../view/screenState'
import type { GameState } from './state'
import * as B from './balance'

/**
 * Номер игрового дня. Считается от прожитого симуляцией времени, а не от
 * разницы настенных часов: только так день не расходится с сытостью, ростом
 * и плесенью, которые копятся шагами advance(). У мёртвого счётчик замирает
 * на дне гибели.
 */
export function dayOf(s: GameState): number {
  if (!s.alive && s.deathDay !== null) return s.deathDay
  return Math.max(1, Math.floor(s.ageMs / B.GAME_DAY_MS) + 1)
}

export function moodOf(s: GameState): Mood {
  if (!s.alive) return 'dead'
  // Обида перекрывает всё: накормленный, но обиженный гриб всё равно отвернётся.
  if (s.resentment > B.AWAY_ABOVE) return 'away'
  if (s.mold > B.ANGRY_MOLD_ABOVE) return 'angry'
  if (s.food < B.SAD_FOOD_BELOW) return 'sad'
  if (s.food > B.HAPPY_FOOD_ABOVE && s.mold < B.HAPPY_MOLD_BELOW && s.resentment < B.HAPPY_RESENT_BELOW) {
    return 'happy'
  }
  return 'ok'
}

export const alarmOf = (s: GameState): boolean => s.alive && s.food < B.ALARM_FOOD_BELOW

export const fliesOf = (s: GameState): boolean => s.mold > B.FLIES_MOLD_ABOVE

/**
 * Верх диска гриба. Здоровый плавает у поверхности, запущенный опускается —
 * ровно тот приём, которым в ролике показывали две недели без ухода.
 */
export function scobyTopOf(s: GameState): number {
  const sinking = Math.max(1 - s.food, s.mold)
  return 15 + Math.round(sinking * 3)
}

export const canFeed = (s: GameState, now: number): boolean =>
  s.alive && now - s.lastFedAt >= B.FEED_COOLDOWN_MS

export const canClean = (s: GameState, now: number): boolean =>
  s.alive && now - s.lastCleanedAt >= B.CLEAN_COOLDOWN_MS

export const canBottle = (s: GameState): boolean => s.alive && s.growth >= 1

/**
 * Сколько игровых дней просрочено кормление. Тоже по возрасту симуляции:
 * кулдаун кнопки живёт по настенным часам, а эта строка — часть рассказа
 * и обязана совпадать с номером дня.
 */
export const overdueDays = (s: GameState): number =>
  Math.max(0, Math.floor((s.ageMs - s.fedAtAge) / B.GAME_DAY_MS))

/** Сухой вердикт аварийной службы для кнопки СОС. */
export function diagnose(s: GameState): string[] {
  if (!s.alive) {
    return [
      `ОБЪЕКТ ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ НА ${s.deathDay ?? dayOf(s)} ДЕНЬ.`,
      s.growth >= B.DAUGHTER_MIN_GROWTH
        ? 'ОБНАРУЖЕН ДОЧЕРНИЙ СЛОЙ. ЦИКЛ МОЖНО ПРОДОЛЖИТЬ.'
        : 'ДОЧЕРНЕГО СЛОЯ НЕ ОБРАЗОВАЛОСЬ.',
    ]
  }

  const lines: string[] = []
  const overdue = overdueDays(s)
  lines.push(overdue > 0 ? `КОРМЛЕНИЕ ПРОСРОЧЕНО НА ${overdue} ДН.` : 'КОРМЛЕНИЕ В НОРМЕ.')
  lines.push(`ПЛЕСЕНЬ ${Math.round(s.mold * 100)}%. РОСТ ${Math.round(s.growth * 100)}%.`)

  if (s.resentment > B.AWAY_ABOVE) lines.push('ОБЪЕКТ ОБИЖЕН. КОНТАКТ ОТСУТСТВУЕТ.')
  else if (s.resentment > B.HAPPY_RESENT_BELOW) lines.push('ОБЪЕКТ ПОМНИТ. КОНТАКТ ОГРАНИЧЕН.')

  if (s.mold > 0.75) lines.push('ПРОГНОЗ НЕБЛАГОПРИЯТНЫЙ.')
  else if (s.mold > 0.4 || s.food < B.ALARM_FOOD_BELOW) lines.push('ПРОГНОЗ СОМНИТЕЛЬНЫЙ.')
  else lines.push('ПРОГНОЗ УДОВЛЕТВОРИТЕЛЬНЫЙ.')

  return lines
}

/**
 * Преобладающий сорт за жизнь поколения — из него складывается сорт партии.
 * При ничьей сорта нет: партия остаётся просто партией, и это честнее, чем
 * выбирать победителя по порядку ключей.
 */
export function dominantTea(s: GameState): B.TeaKey | null {
  let best: B.TeaKey | null = null
  let top = 0
  let tied = false
  for (const key of B.TEA_KEYS) {
    const n = s.poured[key] ?? 0
    if (n > top) {
      top = n
      best = key
      tied = false
    } else if (n === top && n > 0) {
      tied = true
    }
  }
  return tied ? null : best
}
