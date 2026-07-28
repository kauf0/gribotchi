/**
 * Происшествия: «пока вас не было, случилось X» и одно решение тремя кнопками.
 *
 * Срабатывает В МОМЕНТ ВОЗВРАЩЕНИЯ, а не пока игрока нет. Событие, случившееся
 * в отсутствие и разрешившееся само, — это просто ещё один штраф за то, что
 * владелец живёт своей жизнью; таких в игре уже достаточно. Здесь же
 * возвращение впервые становится чем-то большим, чем сводка убытков.
 *
 * Разбор вынесен в чистую функцию по образцу ui/controller.ts: выбор
 * происшествия и последствия ответа перебираются тестом целиком, без браузера.
 */

import * as B from './balance'
import { clamp01, type GameState } from './state'
import { dayOf } from './derive'
import { remember } from './journal'
import { INCIDENT } from '../content/strings'
import type { ActionResult, Effect } from './actions'

export type { IncidentKind } from './balance'

/** Номер ответа: он же номер кнопки — ЧАЙ, МЫТЬ, СОС. */
export type AnswerIndex = 0 | 1 | 2
export const ANSWERS: AnswerIndex[] = [0, 1, 2]

/**
 * Что случилось, пока владельца не было.
 *
 * Происшествие выбирает обстановка в банке, а не жребий: событие всегда про
 * то, что игрок и правда запустил. Порядок проверок — от худшего к терпимому,
 * тот же приём, что в idleMessage().
 */
export function incidentFor(s: GameState, awayMs: number, now: number): B.IncidentKind | null {
  if (!s.alive) return null
  // Отлучка короче той, о которой прибор вообще заговаривает, происшествия
  // не стоит: это просто закрытая на обед вкладка.
  if (awayMs < B.ABSENCE_WORTH_NOTING_MS) return null
  if (now - s.lastIncidentAt < B.INCIDENT_COOLDOWN_MS) return null

  if (s.mold > B.INCIDENT_FLIES_MOLD) return 'flies'
  if (s.food < B.INCIDENT_CLOUDY_FOOD) return 'cloudy'
  if (s.growth > B.INCIDENT_NEIGHBOUR_GROWTH) return 'neighbour'
  // В образцовой банке ничего не случается — и это тоже ответ.
  return null
}

/**
 * Ответ владельца. Сдвиги разовые, новых непрерывных величин происшествия
 * не заводят — их легко считать, читать и проверять.
 */
export function answer(
  s: GameState,
  kind: B.IncidentKind,
  index: AnswerIndex,
  now: number,
): ActionResult {
  const d = B.INCIDENT_EFFECTS[kind][index] as {
    food?: number
    growth?: number
    mold?: number
    resentment?: number
  }

  const state: GameState = {
    ...s,
    food: clamp01(s.food + (d.food ?? 0)),
    growth: clamp01(s.growth + (d.growth ?? 0)),
    mold: clamp01(s.mold + (d.mold ?? 0)),
    resentment: clamp01(s.resentment + (d.resentment ?? 0)),
    lastIncidentAt: now,
    // Как поступил владелец — запись про него, а не про гриб: журнал для того
    // и перестроен, чтобы помнить решения, а не только события.
    journal: remember(s.journal, {
      at: now,
      generation: s.generation,
      day: dayOf(s),
      kind: 'incident',
      incident: kind,
      answer: index,
    }),
  }

  return { state, msg: INCIDENT[kind].msg[index], effect: effectOf(d) }
}

/**
 * Чем прибор отзовётся на ответ. Выводится из самих сдвигов, чтобы не держать
 * рядом с числами ещё и таблицу анимаций: залили — сыплется сахар, сменили
 * среду — идёт промывка.
 */
function effectOf(d: { food?: number; mold?: number }): Effect {
  if ((d.mold ?? 0) <= -0.2) return 'wash'
  if ((d.food ?? 0) > 0) return 'sugar'
  return 'none'
}
