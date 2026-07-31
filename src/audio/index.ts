/**
 * Фасад звука. Контекст создаётся только по первому жесту пользователя —
 * без этого политика автовоспроизведения молча заглушит всё, и отладка
 * превратится в гадание.
 */

import type { Mood } from '../view/screenState'
import { NoteBank } from './synth'
import { Music } from './score'
import { Sfx } from './sfx'

const PREF_KEY = 'gribochi.sound'
/** Как часто повторяется сигнал тревоги, пока объект голодает. */
const ALARM_EVERY_MS = 5000

const readPref = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

const writePref = (on: boolean): void => {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off')
  } catch {
    // приватный режим — настройка просто не запомнится
  }
}

export class Audio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: Music | null = null
  private sfx: Sfx | null = null
  private enabled = readPref()
  private lastAlarmAt = 0
  /**
   * Главная тема молчит, пока прибор не загрузился: на экране запуска он
   * выключен, а во время загрузки играет заряд конденсатора, и вальс поверх
   * него был бы кашей.
   */
  private themeAllowed = false

  get on(): boolean {
    return this.enabled
  }

  /**
   * Готовит звук заранее, ещё до жеста.
   *
   * Политика автовоспроизведения запрещает начинать звучать до касания, но
   * создать контекст и попросить его запуститься можно всегда: если браузер
   * разрешит (установленное приложение, знакомый сайт), музыка пойдёт сразу,
   * а если нет — контекст останется приостановленным и подхватится по
   * statechange. Заодно тут отрабатывает синтез нот, и первое нажатие не
   * платит за него задержкой.
   */
  prime(): void {
    if (!this.enabled || this.ctx) return
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.55
    this.master.connect(this.ctx.destination)
    this.sfx = new Sfx(this.ctx, this.master)
    this.music = new Music(this.ctx, new NoteBank(this.ctx), this.master)

    this.ctx.addEventListener('statechange', () => this.onRunning())
    void this.ctx.resume().catch(() => undefined)
    this.onRunning()
  }

  /**
   * Поднимает звук из обработчика жеста. Безопасно звать сколько угодно раз.
   */
  unlock(): void {
    if (!this.enabled) return
    this.prime()
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => undefined)
    this.onRunning()
  }

  /**
   * Секвенсер мог быть остановлен выключением звука; start() идемпотентен.
   * Без этого музыка после включения обратно не возобновлялась бы никогда.
   */
  private onRunning(): void {
    if (!this.enabled || !this.themeAllowed || this.ctx?.state !== 'running') return
    this.music?.start()
  }

  /**
   * Прибор ушёл в фон: свёрнутое приложение, другая вкладка, погасший экран.
   *
   * Секвенсер живёт на window.setInterval, а тот в свёрнутой вкладке
   * продолжает тикать — браузер лишь придушивает его до раза в секунду.
   * Кадры при этом встают, но секвенсеру они и не нужны, поэтому музыка
   * играла бы из кармана дальше. Останавливаем её и усыпляем контекст:
   * это и тишина, и сбережённая батарея.
   *
   * Симуляции это не касается — время идёт от настенных часов и досчитается
   * при первом же кадре после возвращения.
   */
  pause(): void {
    this.music?.stop()
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => undefined)
  }

  /**
   * Вернулись из фона. Тему возвращает именно этот вызов, а не следующий кадр:
   * setThemeAllowed() рано выходит, когда значение не изменилось, — а оно
   * и не менялось, менялась видимость.
   *
   * Отказ resume() без жеста законен (так ведёт себя iOS), и тогда музыка
   * просто дождётся первого прикосновения: то же самое происходит при запуске.
   */
  resume(): void {
    if (!this.enabled || !this.ctx) return
    void this.ctx.resume().then(() => this.onRunning()).catch(() => undefined)
  }

  /** Заряд конденсатора на время загрузки прибора. */
  charge(seconds: number): void {
    this.fire((s) => s.charge(seconds))
  }

  /**
   * Разрешена ли сейчас главная тема. Зовётся каждый кадр и потому описывает
   * состояние, а не событие: прибор может уйти обратно на экран запуска,
   * и тема должна замолчать вместе с ним.
   */
  setThemeAllowed(allowed: boolean): void {
    if (allowed === this.themeAllowed) return
    this.themeAllowed = allowed
    if (allowed) this.onRunning()
    else this.music?.stop()
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    writePref(this.enabled)
    if (this.enabled) this.unlock()
    else this.music?.stop()
    if (this.master) this.master.gain.value = this.enabled ? 0.55 : 0
    return this.enabled
  }

  /** Раз в кадр: подстраивает музыку под настроение и подаёт сигнал тревоги. */
  update(mood: Mood, alarm: boolean, now: number): void {
    if (!this.enabled || !this.music) return
    this.music.setMood(mood, alarm)
    if (alarm && now - this.lastAlarmAt > ALARM_EVERY_MS) {
      this.lastAlarmAt = now
      this.sfx?.alarm()
    }
  }

  private fire(play: (s: Sfx) => void): void {
    if (this.enabled && this.sfx) play(this.sfx)
  }

  click(): void {
    this.fire((s) => s.click())
  }
  reject(): void {
    this.fire((s) => s.reject())
  }
  chirp(): void {
    this.fire((s) => s.chirp())
  }
  wash(): void {
    this.fire((s) => s.wash())
  }
  knell(): void {
    this.fire((s) => s.knell())
  }
}
