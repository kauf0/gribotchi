/**
 * Когда гриб подаёт голос сам.
 *
 * Реплики привязаны к ПЕРЕХОДАМ, а не к состояниям: облачко появляется в тот
 * момент, когда что-то изменилось, и висит несколько секунд. Иначе гриб
 * тараторил бы одно и то же весь день.
 *
 * Вынесено из main.ts в чистую функцию, чтобы весь набор переходов можно было
 * перебрать тестом — на глаз проверить 36 сочетаний настроений невозможно.
 */

import type { Mood } from '../view/screenState'
import { BUBBLE } from '../content/strings'

/** Что игра показывает и играет в ответ на перемену. */
export type Reaction = {
  bubble?: string
  /** Амплитуда тряски корпуса в CSS-пикселях. */
  shake?: number
  sound?: 'knell'
}

/** Наблюдаемые признаки объекта, за сменой которых следим. */
export type Signals = {
  mood: Mood
  /** Дорос до максимума и может быть разлит. */
  ready: boolean
}

const NOTHING: Reaction = {}

export function reactionTo(prev: Signals | null, next: Signals): Reaction {
  // Первый кадр сравнивать не с чем: иначе игра здоровалась бы репликой
  // при каждом запуске.
  if (!prev) return NOTHING

  if (prev.mood !== next.mood) {
    switch (next.mood) {
      case 'away':
        return { bubble: BUBBLE.remembers, shake: 3 }
      case 'angry':
        return { bubble: BUBBLE.dirty }
      case 'sad':
        return { bubble: BUBBLE.feedMe }
      case 'dead':
        return { shake: 6, sound: 'knell' }
      case 'happy':
        // Из «ровно» в «доволен» гриб переходит после каждого кормления —
        // благодарить за это значило бы благодарить постоянно. Спасибо
        // достаётся только за вывод из грусти, злости или обиды.
        //
        // Из «мёртв» в «доволен» попадает только новое поколение: благодарить
        // за то, что его завели, ему не за что.
        return prev.mood === 'ok' || prev.mood === 'dead' ? NOTHING : { bubble: BUBBLE.thanks }
      case 'ok':
        return NOTHING
    }
  }

  // Готовность к розливу — единственное важное событие, не меняющее лица.
  if (!prev.ready && next.ready) return { bubble: BUBBLE.ripe }

  return NOTHING
}
