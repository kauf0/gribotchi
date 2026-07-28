/**
 * Предложение установки: перебор всех обстоятельств.
 *
 * Игра выложена в двух местах ОДНОЙ сборкой — во врезке на itch и отдельной
 * страницей, которую можно поставить как приложение. Разных сборок для этого
 * нет, значит правильность целиком держится на этих условиях.
 */

import { describe, expect, it } from 'vitest'

import { installOffer, type InstallEnv } from '../src/ui/install'

const env = (over: Partial<InstallEnv> = {}): InstallEnv => ({
  promptAvailable: false,
  standalone: false,
  ios: false,
  dismissed: false,
  embedded: false,
  ...over,
})

describe('когда предлагать установку', () => {
  it('на своей странице с готовым диалогом — предлагаем', () => {
    expect(installOffer(env({ promptAvailable: true }))).toEqual({ show: true, mode: 'prompt' })
  })

  it('во врезке не предлагаем никогда', () => {
    // На itch игра живёт во врезке: ставить некуда, и обещать это нечестно.
    expect(installOffer(env({ embedded: true, promptAvailable: true })).show).toBe(false)
    expect(installOffer(env({ embedded: true, ios: true })).show).toBe(false)
  })

  it('уже установленному приложению предлагать нечего', () => {
    expect(installOffer(env({ standalone: true, promptAvailable: true })).show).toBe(false)
    expect(installOffer(env({ standalone: true, ios: true })).show).toBe(false)
  })

  it('отказ игрока сильнее возможности', () => {
    expect(installOffer(env({ dismissed: true, promptAvailable: true })).show).toBe(false)
    expect(installOffer(env({ dismissed: true, ios: true })).show).toBe(false)
  })

  it('на iOS вместо кнопки — подсказка: события установки там нет', () => {
    expect(installOffer(env({ ios: true }))).toEqual({ show: true, mode: 'ios-hint' })
  })

  it('готовый диалог важнее подсказки', () => {
    // Если браузер на iPad всё же прислал событие, нажимать лучше, чем читать.
    expect(installOffer(env({ ios: true, promptAvailable: true })).show).toBe(true)
    expect(installOffer(env({ ios: true, promptAvailable: true }))).toEqual({
      show: true,
      mode: 'prompt',
    })
  })

  it('без события и не на iOS молчим', () => {
    // Десктопный Firefox приложения не ставит — кнопка была бы обманом.
    expect(installOffer(env()).show).toBe(false)
  })
})

describe('полнота', () => {
  it('ни одно сочетание не роняет функцию и не выдумывает третий вид', () => {
    const flags = [false, true]
    let combos = 0
    for (const promptAvailable of flags) {
      for (const standalone of flags) {
        for (const ios of flags) {
          for (const dismissed of flags) {
            for (const embedded of flags) {
              const offer = installOffer({ promptAvailable, standalone, ios, dismissed, embedded })
              if (offer.show) expect(['prompt', 'ios-hint']).toContain(offer.mode)
              combos++
            }
          }
        }
      }
    }
    expect(combos).toBe(32)
  })

  it('предложение показывается только там, где установка вообще возможна', () => {
    const flags = [false, true]
    for (const standalone of flags) {
      for (const embedded of flags) {
        for (const promptAvailable of flags) {
          for (const ios of flags) {
            const offer = installOffer({ promptAvailable, standalone, ios, dismissed: false, embedded })
            if (offer.show) {
              expect(standalone).toBe(false)
              expect(embedded).toBe(false)
              expect(promptAvailable || ios).toBe(true)
            }
          }
        }
      }
    }
  })
})
