/** Диспетчер экранов: ScreenState → пиксели. Единственная точка входа рендера. */

import { Lcd } from './lcd'
import type { ScreenState } from './screenState'
import { drawBoot } from './screens/boot'
import { drawGame } from './screens/game'
import { drawReport, drawDeath } from './screens/report'
import { drawStart } from './screens/start'

export function render(lcd: Lcd, s: ScreenState): void {
  switch (s.mode) {
    case 'start':
      drawStart(lcd, s)
      return
    case 'off':
      // Погасший ЖК: мутная зеленовато-серая подложка, ничего не светится.
      lcd.clear('#4b5540')
      return
    case 'boot':
      drawBoot(lcd, s)
      return
    case 'journal':
    // Бланки подачи и происшествия — тот же бланк аварийной службы,
    // заполненный иначе: заголовок, строки, полоса подсказки внизу.
    case 'pour':
    case 'incident':
      drawReport(lcd, s)
      return
    case 'death':
      drawDeath(lcd, s)
      return
    default:
      drawGame(lcd, s)
  }
}
