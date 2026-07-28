/**
 * Как игра выходит из полноэкранного режима.
 *
 * Способ зависит от того, как её открыли, и наивный document.exitFullscreen()
 * работает ровно в одном случае из трёх. Разбор вынесен в чистую функцию,
 * потому что проверить его в браузере целиком нельзя: полноэкранный режим на
 * itch включает чужая страница, до которой из песочницы не достать.
 */

import { describe, expect, it } from 'vitest'

import { leaveAction, type LeaveEnv } from '../src/ui/leave'

const env = (over: Partial<LeaveEnv> = {}): LeaveEnv => ({
  ownFullscreen: false,
  embedded: false,
  canGoBack: false,
  ...over,
})

describe('выход из полноэкранного режима', () => {
  it('свой полноэкранный режим выключаем сами', () => {
    expect(leaveAction(env({ ownFullscreen: true }))).toBe('exit-fullscreen')
  })

  it('свой режим важнее всего остального', () => {
    // Даже во врезке: если fullscreenElement наш, значит режим включили мы.
    expect(leaveAction(env({ ownFullscreen: true, embedded: true, canGoBack: true }))).toBe(
      'exit-fullscreen',
    )
  })

  it('во врезке просим родительскую страницу', () => {
    // Проверено на живой странице itch: игра сидит во врезке, полноэкранный
    // режим принадлежит родителю, и отменить его дочернему документу браузер
    // не даёт. Сообщение — единственное, что остаётся, и сработает, если itch
    // когда-нибудь начнёт его слушать.
    // document.exitFullscreen() управляет только своим документом. На itch
    // режим включает страница поверх врезки, и наш fullscreenElement пуст —
    // вызов просто отклонится, поэтому и не работал.
    expect(leaveAction(env({ embedded: true }))).toBe('ask-parent')
  })

  it('во врезке не уходим назад по истории', () => {
    // Это увело бы назад саму врезку и оставило бы на странице пустое место.
    expect(leaveAction(env({ embedded: true, canGoBack: true }))).toBe('ask-parent')
  })

  it('отдельной страницей — возвращаемся, откуда пришли', () => {
    expect(leaveAction(env({ canGoBack: true }))).toBe('go-back')
  })

  it('идти некуда — просто гасим прибор', () => {
    // Открыли игру прямой ссылкой в новой вкладке: истории нет, врезки нет.
    expect(leaveAction(env())).toBe('stay')
  })

  it('решение определено для всех сочетаний', () => {
    const known = ['exit-fullscreen', 'ask-parent', 'go-back', 'stay']
    for (const ownFullscreen of [false, true]) {
      for (const embedded of [false, true]) {
        for (const canGoBack of [false, true]) {
          expect(known).toContain(leaveAction({ ownFullscreen, embedded, canGoBack }))
        }
      }
    }
  })
})
