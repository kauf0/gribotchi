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
    // Все бланки — та же раскладка аварийной службы, заполненная иначе:
    // заголовок, строки, полоса подсказки внизу.
    case 'pour':
    case 'incident':
    case 'cull':
    case 'graft':
    case 'strain':
      drawReport(lcd, s)
      return
    case 'death':
      drawDeath(lcd, s)
      return
    default:
      drawGame(lcd, s)
  }
}
