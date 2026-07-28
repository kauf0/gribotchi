import './style.css'

import { mountShell, type ButtonId } from './view/shell'
import { Lcd } from './view/lcd'
import { render } from './view/render'
import { DEFAULT_SKIN, type SkinKey } from './content/tokens'
import type { ScreenState, StartCard } from './view/screenState'
import { BRAND, BUBBLE, MSG, START, wereAway } from './content/strings'
import { mountDebugPanel, type DebugControls } from './debug/panel'
import { readUrlSeed } from './debug/params'

import { load, save, wipe } from './sim/persist'
import { advance } from './sim/tick'
import { bottle, clean, feed, nextGeneration, sos, type ActionResult } from './sim/actions'
import { canBottle, dayOf, moodOf } from './sim/derive'
import type { GameState } from './sim/state'
import { Fx } from './view/fx'
import { project } from './view/project'
import { summary, obituary, maxScroll } from './view/reports'
import { VISIBLE_LINES } from './view/screens/report'
import { Audio } from './audio'
import { intentFor, type Phase, type UiMode } from './ui/controller'
import { reactionTo, type Signals } from './ui/reactions'
import { describeEnv, leaveAction, LEAVE_MESSAGE, type LeaveEnv } from './ui/leave'
import { demoFrameAt } from './demo/timeline'

/** Тайминги включения прибора, секунды. */
const BOOT = { led: 0.4, from: 0.5, to: 2.6, done: 3.0 } as const
const SAVE_EVERY_MS = 20_000
/** Сколько показывать банку с мёртвым грибом, прежде чем выдать извещение. */
const DEATH_LINGER_MS = 6000
/** Отсутствие дольше этого стоит того, чтобы прибор о нём напомнил. */
const AWAY_WORTH_MENTION_MS = 6 * 3600_000
/** Через столько бездействия прибор сам показывает ролик — как автомат в зале. */
const IDLE_BEFORE_ATTRACT_MS = 120_000

const root = document.getElementById('app')
if (!root) throw new Error('нет #app')

/**
 * Часы игры. Обычно это просто Date.now(), но отладочный ускоритель добавляет
 * смещение — для симуляции это неотличимо от того, что игрок долго отсутствовал.
 */
class Clock {
  private offset = 0
  scale = 1
  now(): number {
    return Date.now() + this.offset
  }
  tick(dtRealMs: number): void {
    if (this.scale !== 1) this.offset += dtRealMs * (this.scale - 1)
  }
}

const clock = new Clock()
const fx = new Fx()
const audio = new Audio()

let skin: SkinKey = DEFAULT_SKIN
let ui: UiMode = 'game'
let phase: Phase = 'start'
let bootStartedAt = 0
let scroll = 0
let lastSaved = 0
/**
 * Запись приостановлена. Нужна ровно для стирания сохранения: страница
 * перезагружается, а по дороге срабатывает pagehide и без этого флага
 * записал бы состояние обратно — кнопка выглядела бы нерабочей.
 */
let saveSuspended = false
let prevSignals: Signals | null = null
/** Когда прибор впервые заметил гибель объекта. */
let noticedDeathAt = 0
/** Момент последнего действия игрока — по нему запускается аттракт-режим. */
let lastInputAt = Date.now()
/** Секунды с начала показа ролика; null — ролик не идёт. */
let attractSince: number | null = null
let forceAttract = false
/** Когда ролик был прерван: нажатие, погасившее его, не должно ещё и кормить. */
let attractEndedAt = -Infinity

const restored = load(clock.now())
let state: GameState = restored.state

const shell = mountShell(root, { onPress: handlePress, onSpeaker: toggleSound, onLeave: leaveForNow })
const lcd = new Lcd(shell.canvas, skin)
shell.setMuted(!audio.on)

/** Ручное состояние для отладки: панель и параметры URL правят его, а не симуляцию. */
const manualState: ScreenState = {
  mode: 'game',
  t: 0,
  day: 1,
  food: 0.8,
  growth: 0.12,
  mold: 0,
  mood: 'happy',
  msg: MSG.aliveForNow,
  bubble: BUBBLE.feedMe,
}

const debug: DebugControls = {
  enabled: false,
  state: manualState,
  skin,
  timeScale: 1,
  // Панель читает симуляцию напрямую: обиды нет в ScreenState, а следить
  // за ней при балансировке нужнее всего.
  probe: () => {
    return {
      phase,
      day: dayOf(state),
      food: state.food,
      growth: state.growth,
      mold: state.mold,
      resentment: state.resentment,
      generation: state.generation,
      alive: state.alive,
      mood: moodOf(state),
    }
  },
  onReset: () => {
    saveSuspended = true
    wipe()
    location.reload()
  },
}

if (import.meta.env.DEV) {
  const seed = readUrlSeed(location.search)
  Object.assign(manualState, seed.patch)
  debug.enabled = seed.manual
  // ?t= означает «прибор уже включён»: снимкам экран запуска не нужен.
  if (seed.clock !== undefined) phase = 'game'
  if (seed.skin) {
    skin = seed.skin
    debug.skin = seed.skin
  }
  if (seed.sim) {
    const now = clock.now()
    const { dead, journal, ...values } = seed.sim
    Object.assign(state, values)
    if (journal) {
      state.journal = Array.from({ length: journal }, (_, i) => ({
        at: now - (journal - i) * 3600_000,
        generation: Math.max(1, state.generation - 1),
        day: i + 1,
        text: `ПАРТИЯ №${i + 1} · ДЕНЬ ${8 + i * 3} · КАЧЕСТВО ПЕРВОЕ`,
      }))
    }
    if (dead) {
      state.alive = false
      state.deathAt = now
      state.deathDay = 12
      // Извещение показывается не сразу — для снимка выдержку отматываем назад.
      noticedDeathAt = now - DEATH_LINGER_MS - 1
    }
  }
  if (seed.open === 'report') ui = 'report'
  if (seed.attract !== undefined) {
    forceAttract = true
    attractSince = seed.attract
  }
}

applySkin(skin)
shell.setScreenOn(false)

/**
 * «Он считал дни. Все.» Реплика ждёт конца загрузки: сказанная при открытии
 * страницы, она бы истекла, пока игрок разглядывает экран запуска.
 */
let awayMessage =
  !restored.fresh && restored.awayMs > AWAY_WORTH_MENTION_MS
    ? wereAway(Math.floor(restored.awayMs / 3600_000))
    : null

/** Когда игрок выключил прибор кнопкой «отойти по делам». */
let leftAt = 0

/**
 * «Отойти по делам»: гасит прибор и выходит из полноэкранного режима.
 *
 * Время НЕ останавливается — на том, что гриб живёт без владельца, держится
 * вся игра. Это выключатель игрушки, а не паузы: экран гаснет, музыка смолкает,
 * а вернувшись, вы застаёте последствия и слышите, сколько вас не было.
 */
function leaveForNow(): void {
  const now = clock.now()
  persist(now, true)

  leftAt = now
  phase = 'start'
  ui = 'game'
  prevSignals = null
  // Ролик после осознанного ухода включаться не должен: игрок не «завис»,
  // он ушёл. Аттракт вернётся после следующего касания.
  lastInputAt = Number.POSITIVE_INFINITY
  attractSince = null

  exitFullscreen()
}

/**
 * Выход из полноэкранного режима. Способ зависит от того, как открыта игра,
 * см. ui/leave.ts — вслепую звать exitFullscreen() бесполезно, если режим
 * включила родительская страница.
 */
function currentEnv(): LeaveEnv {
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return {
    ownFullscreen: !!(document.fullscreenElement ?? doc.webkitFullscreenElement),
    embedded: window.top !== window.self,
    canGoBack: window.history.length > 1,
  }
}

function exitFullscreen(): void {
  const doc = document as Document & { webkitExitFullscreen?: () => void }
  const action = leaveAction(currentEnv())

  try {
    if (action === 'exit-fullscreen') {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined)
      else doc.webkitExitFullscreen?.()
    } else if (action === 'ask-parent') {
      // Изнутри врезки полноэкранный режим родителя не выключить. Просим его
      // сами: если страница itch этого не слушает, вреда никакого, а прибор
      // всё равно уже погашен.
      window.parent.postMessage(LEAVE_MESSAGE, '*')
    } else if (action === 'go-back') {
      // Игра открыта отдельной страницей — «выйти» для игрока значит
      // вернуться туда, откуда он пришёл.
      window.history.back()
    }
  } catch {
    // Не дали — прибор всё равно выключен, а это главное.
  }
}

function applySkin(next: SkinKey): void {
  skin = next
  lcd.setSkin(next)
  shell.setSkin(next)
}

function toggleSound(): void {
  const on = audio.toggle()
  shell.setMuted(!on)
  fx.say(on ? MSG.soundOn : MSG.soundOff, clock.now())
}

function apply(result: ActionResult, now: number): void {
  state = result.state
  fx.play(result.effect, result.msg, now)
  if (result.rejected) {
    fx.shake(2, now)
    audio.reject()
    return
  }
  if (result.effect === 'hearts') audio.chirp()
  else if (result.effect === 'wash') audio.wash()
  else audio.click()
  persist(now, true)
}

/**
 * Кнопки. Решение о том, что означает нажатие в текущем состоянии, принимает
 * чистая intentFor() из ui/controller.ts — здесь остаётся только исполнение.
 */
function handlePress(id: ButtonId): void {
  const now = clock.now()
  const intent = intentFor(
    {
      phase,
      ui,
      // Нажатие, прервавшее ролик, только его и прерывает. pointerdown гасит
      // ролик раньше, чем долетает click, поэтому одной проверки мало.
      attract: attractSince !== null || performance.now() - attractEndedAt < 400,
      washing: fx.isWashing(now),
      alive: state.alive,
      ready: canBottle(state),
      deathSettled: now - noticedDeathAt > DEATH_LINGER_MS,
    },
    id,
  )

  switch (intent.kind) {
    case 'ignore':
      return

    case 'power-on':
      // Вернулись после «отойти по делам» — прибор посчитает, сколько прошло.
      if (leftAt) {
        const away = Math.max(0, now - leftAt)
        if (away > AWAY_WORTH_MENTION_MS) awayMessage = wereAway(Math.floor(away / 3600_000))
        leftAt = 0
      }
      phase = 'boot'
      bootStartedAt = performance.now()
      audio.unlock()
      // Пробой приходится ровно на конец загрузки — на тот кадр, где экран
      // оживает и вступает главная тема.
      audio.charge(BOOT.done)
      return

    case 'feed':
      apply(feed(state, now), now)
      return

    case 'clean':
      apply(clean(state, now), now)
      return

    case 'bottle':
      apply(bottle(state, now), now)
      return

    case 'open-report':
      audio.click()
      apply(sos(state), now)
      ui = 'report'
      scroll = 0
      return

    case 'close-report':
      audio.click()
      ui = 'game'
      return

    case 'scroll': {
      audio.click()
      const lines = summary(state, scroll, describeEnv(currentEnv())).lines.length
      scroll = Math.max(0, Math.min(maxScroll(lines, VISIBLE_LINES), scroll + intent.delta))
      return
    }

    case 'next-generation':
      audio.click()
      apply(nextGeneration(state, now), now)
      ui = 'game'
      noticedDeathAt = 0
      prevSignals = null
      return
  }
}

function persist(now: number, force = false): void {
  if (saveSuspended) return
  if (!force && now - lastSaved < SAVE_EVERY_MS) return
  lastSaved = now
  save(state)
}

/** Гриб подаёт голос сам, когда с ним что-то происходит. */
function watchSignals(now: number): void {
  const signals: Signals = { mood: moodOf(state), ready: canBottle(state) }
  const reaction = reactionTo(prevSignals, signals)

  if (reaction.bubble) fx.speak(reaction.bubble, now)
  if (reaction.shake) fx.shake(reaction.shake, now)
  if (reaction.sound === 'knell') audio.knell()

  prevSignals = signals
}

/** Что показывает прибор: экран запуска, загрузку или саму игру. */
function startCard(): StartCard {
  if (restored.fresh) return { action: START.action, hint: START.hint }
  return {
    action: START.action,
    note: state.alive
      ? START.waiting(dayOf(state), state.generation)
      : START.ceased(state.generation),
    hint: START.hint,
  }
}

/** Собирает кадр: ручное состояние из панели, запуск, загрузка или симуляция. */
function buildScreen(t: number): ScreenState {
  if (debug.enabled) return { ...manualState, t }

  if (phase === 'start') return { ...manualState, mode: 'start', t, start: startCard() }

  if (phase === 'boot') {
    const elapsed = (performance.now() - bootStartedAt) / 1000
    if (elapsed < BOOT.led) return { ...manualState, mode: 'off', t }
    const b = Math.min(1, Math.max(0, (elapsed - BOOT.from) / (BOOT.to - BOOT.from)))
    return { ...manualState, mode: 'boot', boot: b, t }
  }

  const screen = project(state, t, fx.snapshot(clock.now()))
  screen.generation = state.generation

  // Сначала даём разглядеть банку с крестиками вместо глаз, и только потом
  // прибор выдаёт сухое извещение.
  if (!state.alive && clock.now() - noticedDeathAt > DEATH_LINGER_MS) {
    return { ...screen, mode: 'death', report: obituary(state) }
  }
  if (ui === 'report') {
    return { ...screen, mode: 'journal', report: summary(state, scroll, describeEnv(currentEnv())) }
  }
  return screen
}

function ledOn(s: ScreenState, t: number): boolean {
  // На экране запуска прибор ещё не включён — диод молчит.
  if (s.mode === 'off' || s.mode === 'start' || s.mood === 'dead') return false
  // Мигает 6 Гц в норме, чаще в тревоге — как обещает спецификация.
  return s.alarm ? Math.sin(t * 12) > 0 : Math.sin(t * 6) > -0.3
}

let lastFrame = 0
let animClock = 0

function frame(ms: number): void {
  const dtReal = lastFrame ? Math.min(250, ms - lastFrame) : 0
  lastFrame = ms
  animClock += dtReal / 1000

  clock.scale = debug.timeScale
  clock.tick(dtReal)
  const now = clock.now()

  if (phase === 'boot' && (ms - bootStartedAt) / 1000 >= BOOT.done) {
    phase = 'game'
    if (awayMessage) fx.say(awayMessage, now)
    awayMessage = null
  }

  const wasAlive = state.alive
  state = advance(state, now)
  if (wasAlive && !state.alive) {
    noticedDeathAt = now
    ui = 'game'
    persist(now, true)
  }

  watchSignals(now)
  persist(now)
  audio.setThemeAllowed(phase === 'game' || attractSince !== null)

  // Аттракт-режим: прибор сам показывает ролик, когда его давно не трогали.
  const idle = Date.now() - lastInputAt
  if (attractSince === null && (forceAttract || (idle > IDLE_BEFORE_ATTRACT_MS && !document.hidden))) {
    attractSince = 0
  }

  if (attractSince !== null) {
    attractSince += dtReal / 1000
    const demo = demoFrameAt(attractSince)
    render(lcd, demo.screen)
    shell.setLed(demo.led)
    shell.setScreenOn(demo.screen.mode !== 'off')
    shell.setPressed(demo.press)
    shell.setShake(0, 0)
    shell.setCaption(demo.caption, demo.captionOpacity)
    shell.setTitleCard(demo.title)
    shell.setLeaveVisible(false)
    audio.update(demo.screen.mood, !!demo.screen.alarm, now)
    requestAnimationFrame(frame)
    return
  }

  const s = buildScreen(animClock)
  render(lcd, s)
  shell.setLed(ledOn(s, animClock))
  shell.setScreenOn(s.mode !== 'off')
  shell.setShake(...fx.shakeOffset(now))
  // Отходить по делам можно только от работающего прибора: на экране запуска
  // уходить неоткуда, а кнопка лишь путала бы.
  shell.setLeaveVisible(phase === 'game')
  audio.update(s.mood, !!s.alarm, now)

  requestAnimationFrame(frame)
}

for (const ev of ['pagehide', 'visibilitychange']) {
  window.addEventListener(ev, () => persist(clock.now(), true))
}

// Пробуем зазвучать сразу: если браузер разрешит (установленное приложение,
// знакомый сайт), музыка пойдёт без касания. Если нет — контекст просто ждёт.
audio.prime()

// Ловим ЛЮБОЕ взаимодействие, а не только кнопки прибора: щелчок по столу,
// клавиша, касание экрана — всё годится, чтобы поднять звук.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(
    ev,
    () => {
      audio.unlock()
      lastInputAt = Date.now()
      // Любое действие прерывает ролик и возвращает прибор к делу.
      if (attractSince !== null) {
        attractSince = null
        attractEndedAt = performance.now()
        forceAttract = false
        shell.setCaption('', 0)
        shell.setTitleCard(0)
        shell.setPressed(null)
      }
    },
    { passive: true },
  )
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') toggleSound()
})

/**
 * Шрифты нужны до первого кадра. document.fonts.ready тут недостаточно: она
 * ждёт только те шрифты, что уже запрошены, а Handjet и DotGothic16 живут
 * исключительно внутри канваса, и fillText запрашивает их асинхронно — первые
 * кадры нарисовались бы запасным начертанием с другими метриками.
 */
const CANVAS_FONTS: [string, string][] = [
  ['17px "Handjet"', 'СЫТОСТЬ'],
  ['20px "Handjet"', 'ОБЪЕКТ'],
  ['30px "Handjet"', BRAND.ru],
  ['16px "DotGothic16"', BRAND.jp],
]

// Офлайн-запуск. Только в собранной версии: в разработке service worker
// кешировал бы модули и прятал правки.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Версия в адресе меняет и файл воркера, и имя его кеша: без этого игрок
    // беты застревал бы на старой сборке и слал отчёты о починенном.
    void navigator.serviceWorker.register(`./sw.js?v=${__APP_VERSION__}`).catch(() => undefined)
  })
}

Promise.all(CANVAS_FONTS.map(([font, text]) => document.fonts.load(font, text)))
  .catch(() => undefined)
  .then(() => document.fonts.ready)
  .then(() => {
    if (import.meta.env.DEV) mountDebugPanel(debug, applySkin)
    requestAnimationFrame(frame)
  })
