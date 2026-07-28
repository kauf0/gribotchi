/**
 * Как выйти из полноэкранного режима — зависит от того, как открыта игра.
 *
 * Тонкость, из-за которой наивный вызов не работает: document.exitFullscreen()
 * управляет только СВОИМ документом. На itch полноэкранный режим включает
 * родительская страница поверх врезки, и у нашего документа fullscreenElement
 * пуст — выйти изнутри нельзя, промис просто отклоняется.
 *
 * Поэтому способ выбирается по обстановке, а не вызывается вслепую.
 */

export type LeaveEnv = {
  /** Наш документ сам находится в полноэкранном режиме. */
  ownFullscreen: boolean
  /** Игра открыта во врезке, а не отдельной страницей. */
  embedded: boolean
  /** Есть куда вернуться назад по истории. */
  canGoBack: boolean
}

export type LeaveAction =
  /** Полноэкранный режим наш — просто выходим. */
  | 'exit-fullscreen'
  /** Врезка: сами выйти не можем, просим родительскую страницу. */
  | 'ask-parent'
  /** Отдельная страница: «выйти» для игрока значит вернуться на itch. */
  | 'go-back'
  /** Выходить неоткуда — гасим прибор и только. */
  | 'stay'

export function leaveAction(env: LeaveEnv): LeaveAction {
  if (env.ownFullscreen) return 'exit-fullscreen'
  if (env.embedded) return 'ask-parent'
  if (env.canGoBack) return 'go-back'
  return 'stay'
}

/**
 * Короткая сводка обстановки для экрана аварийной службы.
 *
 * Полноэкранный режим на телефоне включает не игра, и какой именно случай
 * достался игроку, снаружи не увидеть: до страницы itch из среды разработки
 * не достать. Поэтому пусть прибор докладывает сам — это ровно та работа,
 * для которой кнопка СОС и заведена.
 */
export function describeEnv(env: LeaveEnv): string {
  const where = env.embedded ? 'ВРЕЗКА' : 'СТРАНИЦА'
  const screen = env.ownFullscreen ? 'ЭКРАН СВОЙ' : 'ЭКРАН ЧУЖОЙ'
  const plan: Record<LeaveAction, string> = {
    'exit-fullscreen': 'ВЫХОД САМИ',
    'ask-parent': 'ПРОСИМ СТРАНИЦУ',
    'go-back': 'НАЗАД',
    stay: 'ВЫХОДА НЕТ',
  }
  return `${where} · ${screen} · ${plan[leaveAction(env)]}`
}

/** Сообщение родительской странице. Если её никто не слушает — вреда нет. */
export const LEAVE_MESSAGE = { type: 'gribochi:leave' } as const
