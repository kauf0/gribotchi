/**
 * Предлагать ли поставить прибор на устройство.
 *
 * Игра выложена в двух местах одной и той же сборкой: на itch она открывается
 * во врезке, на своей странице — отдельно и ставится как приложение. Разных
 * сборок для этого не нужно, потому что установка сама себя выдаёт: во врезке
 * браузер не только не даёт установить, но и не присылает beforeinstallprompt.
 * Решение всё равно вынесено сюда — условий четыре, и на глаз их не перебрать.
 *
 * iOS стоит особняком: события установки в Safari нет вовсе, там остаётся
 * показать, куда нажимать руками.
 */

export type InstallEnv = {
  /** Браузер прислал beforeinstallprompt: ставить можно прямо сейчас. */
  promptAvailable: boolean
  /** Игра уже открыта как установленное приложение. */
  standalone: boolean
  /** Safari на iPhone или iPad: события нет, установка только вручную. */
  ios: boolean
  /** Игрок уже отказался — второй раз не навязываемся. */
  dismissed: boolean
  /** Игра во врезке (itch): устанавливать нечего и некуда. */
  embedded: boolean
}

export type InstallOffer =
  /** Ничего не показываем. */
  | { show: false }
  /** Кнопка: нажатие открывает диалог установки. */
  | { show: true; mode: 'prompt' }
  /** Подсказка: на iOS игрок ставит прибор сам через «Поделиться». */
  | { show: true; mode: 'ios-hint' }

const NOTHING: InstallOffer = { show: false }

export function installOffer(env: InstallEnv): InstallOffer {
  // Порядок отражает приоритет: уже стоит — предлагать нечего; во врезке
  // предложение было бы ложным обещанием; отказ игрока сильнее возможности.
  if (env.standalone) return NOTHING
  if (env.embedded) return NOTHING
  if (env.dismissed) return NOTHING

  if (env.promptAvailable) return { show: true, mode: 'prompt' }
  if (env.ios) return { show: true, mode: 'ios-hint' }
  return NOTHING
}

/** Ключ хранилища отказа. К сохранению гриба отношения не имеет. */
export const DISMISSED_KEY = 'gribochi.install.dismissed'
