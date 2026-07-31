import './style.css'

import { mountShell, type ButtonId } from './view/shell'
import { Lcd } from './view/lcd'
import { render } from './view/render'
import { DEFAULT_SKIN, type SkinKey } from './content/tokens'
import type { ScreenState, StartCard } from './view/screenState'
import { BRAND, BUBBLE, CULL, GRAFT, MSG, START, STRAIN, TRAIT_NAMES, wereAway } from './content/strings'
import { mountDebugPanel, type DebugControls } from './debug/panel'
import { readUrlSeed } from './debug/params'

import { load, save, wipe } from './sim/persist'
import { advance } from './sim/tick'
import { ABSENCE_WORTH_NOTING_MS } from './sim/balance'
import { bottle, clean, feed, nextGeneration, sos, type ActionResult } from './sim/actions'
import { canBottle, canFeed, dayOf, moodOf } from './sim/derive'
import type { GameState } from './sim/state'
import { Fx } from './view/fx'
import { project } from './view/project'
import {
  summary,
  obituary,
  pourBlank,
  incidentBlank,
  cullBlank,
  graftBlank,
  strainBlank,
  maxScroll,
} from './view/reports'
import { VISIBLE_LINES } from './view/screens/report'
import { Audio } from './audio'
import { intentFor, type Phase, type UiMode } from './ui/controller'
import { reactionTo, type Signals } from './ui/reactions'
import { observe, noteReturn } from './sim/observations'
import { incidentFor, answer, type IncidentKind } from './sim/incidents'
import { earnedTraits, TRAIT_SLOTS, type TraitKey } from './sim/traits'
import { encodeStrain, decodeStrain } from './sim/strain'
import { copyText, readText, onPaste } from './ui/clipboard'
import { recordAll, type JournalKind } from './sim/journal'
import { leaveAction, LEAVE_MESSAGE, type LeaveEnv } from './ui/leave'
import { openManual, closeManual, isManualOpen } from './ui/manual'
import { installOffer, DISMISSED_KEY, type InstallOffer } from './ui/install'
import { demoFrameAt } from './demo/timeline'

/** Тайминги включения прибора, секунды. */
const BOOT = { led: 0.4, from: 0.5, to: 2.6, done: 3.0 } as const
const SAVE_EVERY_MS = 20_000
/** Сколько показывать банку с мёртвым грибом, прежде чем выдать извещение. */
const DEATH_LINGER_MS = 6000
/** Сколько бланк подачи ждёт выбора сорта, прежде чем закрыться сам. */
const POUR_BLANK_MS = 6000
/** Через столько бездействия прибор сам показывает ролик — как автомат в зале. */
const IDLE_BEFORE_ATTRACT_MS = 60_000

/**
 * То же значение, но его можно укоротить параметром ?idle=3 в режиме
 * разработки. Иначе проверить срабатывание по простою нечем: ждать минуту
 * в каждом прогоне теста никто не станет, и оно так и оставалось
 * единственным непроверенным поведением игры.
 */
let idleBeforeAttract = IDLE_BEFORE_ATTRACT_MS

/** Принудительный показ предложения установки из ?install= — только в разработке. */
let forcedInstall: 'prompt' | 'ios-hint' | undefined

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
/**
 * Когда открыт бланк подачи, по performance.now(). Отмены у него нет: не выбрали
 * сорт — бланк закроется сам, и подача просто не состоится. Так одно лишнее
 * нажатие не превращается в ловушку, а прибор остаётся немногословным.
 *
 * Время здесь настоящее, а не игровое: при отладочном ускорении шесть игровых
 * секунд пролетают за десяток миллисекунд, и выбрать сорт стало бы нельзя.
 * Тот же приём, что у загрузочного экрана.
 */
let pourOpenedAt = 0
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

/** Состояние на прошлом кадре — с ним сверяются наблюдения журнала. */
let prevJournal: GameState | null = null

/**
 * Происшествие, о котором прибор доложит, как только закончит загрузку.
 *
 * Живёт только в памяти вкладки: перезагрузка — это тоже возвращение, но уже
 * без отлучки, и нового происшествия не будет. Потерять доклад при закрытии
 * вкладки не жалко, а тащить его через сохранение значило бы держать игрока
 * на бланке до тех пор, пока он не ответит.
 */
let pendingIncident: IncidentKind | null = null

/** Признак, который закрепился, но мест не нашлось: ждёт выбраковки. */
let pendingTrait: TraitKey | null = null

/**
 * Признаки чужого штамма, из которых владелец выбирает один при смене
 * поколения. Выбор здесь, а не в симуляции: у чужого гриба обычно есть ровно
 * тот признак, которого своим не заработать, и решать, брать ли его,
 * должен человек.
 */
let pendingGraft: TraitKey[] | null = null

/** Поколение на прошлом кадре — по нему видно смену. */
let lastGeneration = 0

/** Удостоверение объекта — восемь знаков, которые можно отдать другому. */
const strainCode = (s: GameState): string =>
  encodeStrain({ traits: s.traits, generation: s.generation, crossings: s.crossings })

/**
 * Приём чужой закваски. Кладём на хранение, ничего не затирая: скрестится
 * при следующей смене поколения, и решение остаётся за владельцем.
 */
function acceptStarter(text: string | null, now: number): void {
  if (!text) return fx.say(STRAIN.pasteFailed, now)
  const strain = decodeStrain(text)
  if (!strain) return fx.say(STRAIN.badCode, now)
  // Свой же код принимать незачем: скрещивать не с кем.
  if (decodeStrain(strainCode(state))?.traits.join() === strain.traits.join()) {
    return fx.say(STRAIN.ownCode, now)
  }
  state = { ...state, offered: text.toUpperCase().replace(/[\s-]/g, '') }
  fx.say(STRAIN.accepted, now)
  persist(now, true)
}

/**
 * Что закрепилось само. Проверяется на каждом кадре рядом с наблюдениями:
 * признак даётся В МОМЕНТ выполнения условия, а не при розливе, — так отдача
 * приходит по ходу игры.
 *
 * Мест три. Свободно — берём молча; занято — прибор требует выбраковки, и до
 * ответа игра ждёт.
 */
/**
 * Смена поколения с закваской на хранении — время пересадки. Показываем, что
 * есть у чужого штамма, и даём выбрать.
 */
function watchGraft(): void {
  const changed = lastGeneration !== 0 && state.generation !== lastGeneration
  lastGeneration = state.generation
  if (!changed || !state.offered || pendingGraft) return

  const foreign = decodeStrain(state.offered)
  // Берём только то, чего у своего нет: своё и так на месте.
  const gift = foreign?.traits.filter((k) => !state.traits.includes(k)) ?? []
  if (gift.length === 0) {
    state = { ...state, offered: null }
    return
  }
  pendingGraft = gift.slice(0, 3)
  ui = 'graft'
}

function watchTraits(now: number): void {
  if (!state.alive || ui !== 'game' || pendingTrait || pendingIncident || pendingGraft) return
  const gained = earnedTraits(state)[0]
  if (!gained) return

  if (state.traits.length < TRAIT_SLOTS) {
    state = { ...state, traits: [...state.traits, gained] }
    fx.say(CULL.fixed(TRAIT_NAMES[gained]), now)
    persist(now, true)
    return
  }
  pendingTrait = gained
  ui = 'cull'
}

/** Закваска ссылкой: ?shtamm=7K3M9QXA. Работает и на itch, и на своей странице. */
const sharedStrain = new URLSearchParams(location.search).get('shtamm')

const restored = load(clock.now())
let state: GameState = restored.state
// Отлучку записываем сразу: она уже случилась, и от того, включит ли игрок
// прибор, факт не зависит.
if (!restored.fresh) {
  state = noteReturn(state, restored.awayMs, occasion(clock.now()))
  pendingIncident = incidentFor(state, restored.awayMs, clock.now())
}
if (sharedStrain) acceptStarter(sharedStrain, clock.now())

/** Обстоятельства для наблюдений: симуляция о часовых поясах не знает. */
function occasion(now: number) {
  // Час берётся из часов игры, а не из настенных: при отладочном ускорении он
  // бежит вместе с ними, и ночную подачу можно проверить, не дожидаясь ночи.
  return { now, hour: new Date(now).getHours() }
}

const shell = mountShell(root, {
  onPress: handlePress,
  onSpeaker: toggleSound,
  onLeave: leaveForNow,
  onInstall: installPrompt,
  onManual: () => {
    // Время под паспортом идёт дальше: на том, что объект живёт без владельца,
    // держится вся игра. Но ролик придерживаем — игрок занят чтением.
    lastInputAt = Date.now()
    openManual(__APP_VERSION__, () => {
      lastInputAt = Date.now()
    })
  },
})
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
      // Перебираем виды по кругу: снимок должен показывать и вехи, и
      // наблюдения, а самая длинная запись — партия с сортом.
      const kinds: JournalKind[] = [
        'batch',
        'absence-record',
        'turned-away',
        'night-pour',
        'forgiven',
        'full-grown',
        'overfed',
        'death',
      ]
      // Ночной подаче нужен ночной час: время записи берётся из её метки,
      // и с дневной строка «ВЛАДЕЛЕЦ НЕ СПИТ» читалась бы как ошибка.
      const night = new Date(now)
      night.setHours(3, 40, 0, 0)
      state.journal = Array.from({ length: journal }, (_, i) => ({
        at: kinds[i % kinds.length] === 'night-pour' ? night.getTime() : now - (journal - i) * 3600_000,
        generation: Math.max(1, state.generation - 1),
        day: 8 + i * 3,
        kind: kinds[i % kinds.length],
        tea: 'ginger' as const,
        grade: 'top' as const,
        daughter: true,
        hours: 14 + i,
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
  if (seed.pasport) openManual(__APP_VERSION__)
  if (seed.traits) {
    state.traits = seed.traits.filter((k) => k in TRAIT_NAMES) as TraitKey[]
  }
  if (seed.open === 'strain') ui = 'strain'
  if (seed.open === 'incident') {
    // Какое именно — решает обстановка, её задают тем же ?sim.mold и прочими.
    pendingIncident = incidentFor({ ...state, lastIncidentAt: 0 }, ABSENCE_WORTH_NOTING_MS + 1, clock.now())
    if (pendingIncident) ui = 'incident'
  }
  if (seed.open === 'pour') {
    ui = 'pour'
    // Бланк для снимка не должен закрыться сам через шесть секунд.
    pourOpenedAt = Infinity
  }
  if (seed.attract !== undefined) {
    forceAttract = true
    attractSince = seed.attract
  }
  if (seed.idleBeforeAttract !== undefined) idleBeforeAttract = seed.idleBeforeAttract
  forcedInstall = seed.install
}

applySkin(skin)
shell.setScreenOn(false)

/**
 * «Он считал дни. Все.» Реплика ждёт конца загрузки: сказанная при открытии
 * страницы, она бы истекла, пока игрок разглядывает экран запуска.
 */
let awayMessage =
  !restored.fresh && restored.awayMs > ABSENCE_WORTH_NOTING_MS
    ? wereAway(Math.floor(restored.awayMs / 3600_000))
    : null

/** Когда игрок выключил прибор кнопкой «отойти по делам». */
let leftAt = 0

/**
 * «Отойти по делам»: гасит прибор.
 *
 * Время НЕ останавливается — на том, что гриб живёт без владельца, держится
 * вся игра. Это выключатель игрушки, а не паузы: экран гаснет, музыка смолкает,
 * а вернувшись, вы застаёте последствия и слышите, сколько вас не было.
 *
 * Из полноэкранного режима кнопка выходит только там, где это вообще возможно.
 * На itch игра сидит во врезке, полноэкранный режим принадлежит родительской
 * странице, и браузер не даёт дочернему документу его отменить — проверено на
 * живой странице. Зато при отдельном размещении (те же GitHub Pages) выход
 * работает, поэтому разбор обстановки оставлен.
 */
function leaveForNow(): void {
  closeManual()
  const now = clock.now()
  persist(now, true)

  leftAt = now
  phase = 'start'
  ui = 'game'
  prevSignals = null
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
      canFeed: canFeed(state, now),
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
        if (away > ABSENCE_WORTH_NOTING_MS) awayMessage = wereAway(Math.floor(away / 3600_000))
        state = noteReturn(state, away, occasion(now))
        pendingIncident = incidentFor(state, away, now)
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
      // Сюда попадаем только при неистёкшем кулдауне: бланк не открывается,
      // отповедь выдаёт сама симуляция.
      apply(feed(state, now), now)
      return

    case 'open-pour':
      audio.click()
      ui = 'pour'
      pourOpenedAt = performance.now()
      return

    case 'pour':
      ui = 'game'
      apply(feed(state, now, intent.tea), now)
      return

    case 'answer': {
      const kind = pendingIncident
      pendingIncident = null
      ui = 'game'
      if (kind) apply(answer(state, kind, intent.index, now), now)
      persist(now, true)
      return
    }

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

    case 'open-strain':
      audio.click()
      ui = 'strain'
      return

    case 'close-strain':
      audio.click()
      ui = 'game'
      return

    case 'copy-strain':
      audio.click()
      void copyText(strainCode(state)).then((ok) => fx.say(ok ? STRAIN.copied : STRAIN.copyFailed, clock.now()))
      return

    case 'paste-strain':
      audio.click()
      void readText().then((text) => acceptStarter(text, clock.now()))
      return

    case 'graft': {
      audio.click()
      const gift = pendingGraft
      pendingGraft = null
      ui = 'game'
      state = { ...state, offered: null }
      const taken = gift?.[intent.index]
      if (!taken) {
        fx.say(GRAFT.refused, now)
        persist(now, true)
        return
      }
      state = { ...state, crossings: state.crossings + 1 }
      // Дальше — обычный путь признака: есть место, берём; нет — выбраковка.
      if (state.traits.length < TRAIT_SLOTS) {
        state = { ...state, traits: [...state.traits, taken] }
        fx.say(CULL.fixed(TRAIT_NAMES[taken]), now)
      } else {
        pendingTrait = taken
        ui = 'cull'
      }
      persist(now, true)
      return
    }

    case 'cull': {
      audio.click()
      const gained = pendingTrait
      pendingTrait = null
      ui = 'game'
      if (!gained) return
      // Третья кнопка отказывается от нового признака, первые две меняют его
      // на один из занятых мест.
      if (intent.index === 2) {
        // Отказ надо запомнить: условие-то по-прежнему выполнено, и без
        // отметки прибор потребовал бы того же на следующем кадре.
        state = { ...state, declined: [...state.declined, gained] }
        fx.say(CULL.refused, now)
        persist(now, true)
        return
      }
      const dropped = state.traits[intent.index]
      if (!dropped) return
      state = { ...state, traits: [...state.traits.filter((k) => k !== dropped), gained] }
      fx.say(CULL.dropped(TRAIT_NAMES[dropped]), now)
      persist(now, true)
      return
    }

    case 'scroll': {
      audio.click()
      const lines = summary(state, scroll).lines.length
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

/**
 * Что прибор заметил и записал. Решение принимает чистая observe() из
 * sim/observations.ts — здесь только сверка кадра с кадром.
 */
function watchJournal(now: number): void {
  const prev = prevJournal
  prevJournal = state
  // Первый кадр сравнивать не с чем.
  if (!prev) return

  const found = observe(prev, state, occasion(now))
  if (found.length === 0) return

  state = recordAll(state, found)
  prevJournal = state
  // Записанное сохраняем сразу: событие редкое, а потерять его при закрытой
  // вкладке обиднее, чем лишний раз записать в хранилище.
  persist(now, true)
}

/**
 * Установка прибора на устройство.
 *
 * Событие beforeinstallprompt браузер присылает только там, где ставить есть
 * куда: на своей странице и не во врезке. Поэтому одна и та же сборка молчит
 * на itch и предлагает установку на отдельной странице — разных сборок для
 * этого не нужно.
 */
let installEvent: (Event & { prompt: () => Promise<void> }) | null = null
let installDismissed = readDismissed()
// Обстановка, которая за кадр не меняется, — считается один раз: refreshInstall()
// вызывается на каждом кадре, и создавать там MediaQueryList было бы расточительно.
const standaloneQuery = matchMedia('(display-mode: standalone), (display-mode: fullscreen)')
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
/** Что показано сейчас — чтобы не трогать DOM, когда ничего не изменилось. */
let installShown = ''

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Приватный режим: предложение просто будет появляться снова.
    return false
  }
}

function refreshInstall(): void {
  const offer: InstallOffer = forcedInstall
    ? { show: true, mode: forcedInstall }
    : installOffer({
        promptAvailable: installEvent !== null,
        standalone: standaloneQuery.matches,
        ios: isIos,
        dismissed: installDismissed,
        embedded: window.parent !== window,
      })

  const key = offer.show ? offer.mode : 'нет'
  if (key === installShown) return
  installShown = key
  shell.setInstall(offer)
}

function installPrompt(): void {
  const event = installEvent
  // Второй раз не навязываемся: нажали — либо поставили, либо посмотрели
  // подсказку и закрыли.
  installEvent = null
  installDismissed = true
  try {
    localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // см. readDismissed
  }
  refreshInstall()
  void event?.prompt()
}

window.addEventListener('beforeinstallprompt', (event) => {
  // Свой значок вместо баннера браузера: он не должен закрывать прибор.
  event.preventDefault()
  installEvent = event as Event & { prompt: () => Promise<void> }
  refreshInstall()
})
// Настоящая вставка работает даже там, где читать буфер по кнопке нельзя.
onPaste((text) => acceptStarter(text, clock.now()))

window.addEventListener('appinstalled', () => {
  installEvent = null
  refreshInstall()
})
refreshInstall()

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
    return { ...screen, mode: 'journal', report: summary(state, scroll) }
  }
  if (ui === 'graft' && pendingGraft) {
    return { ...screen, mode: 'graft', report: graftBlank(pendingGraft) }
  }
  if (ui === 'cull' && pendingTrait) {
    return { ...screen, mode: 'cull', report: cullBlank(pendingTrait, state.traits) }
  }
  if (ui === 'strain') {
    return { ...screen, mode: 'strain', report: strainBlank(state, strainCode(state)) }
  }
  if (ui === 'incident' && pendingIncident) {
    return { ...screen, mode: 'incident', report: incidentBlank(pendingIncident) }
  }
  if (ui === 'pour') {
    // Отсчёт подрезан сверху: снимок бланка открывает его «навсегда», и без
    // этого в подсказке оказалась бы бесконечность.
    const left = Math.min(POUR_BLANK_MS, POUR_BLANK_MS - (performance.now() - pourOpenedAt)) / 1000
    return { ...screen, mode: 'pour', report: pourBlank(left) }
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
    // Доклад о происшествии — после загрузки: на экране запуска отвечать
    // ещё нечем, прибор туда даже не смотрит.
    if (pendingIncident) ui = 'incident'
  }

  const wasAlive = state.alive
  state = advance(state, now)
  if (wasAlive && !state.alive) {
    noticedDeathAt = now
    ui = 'game'
    // Доклад некому: объект погиб, пока владелец читал бланк.
    pendingIncident = null
    // Выбраковка и пересадка снимаются по той же причине, но им это ещё нужнее:
    // спросить уже не о чем, а бланк рисуется только при своём ui, и пометка
    // осталась бы висеть навсегда — вместе с ней встало бы и закрепление
    // признаков у следующего поколения.
    pendingTrait = null
    pendingGraft = null
    persist(now, true)
  }

  // Бланк подачи закрывается сам: отмены у него нет, и висеть он не должен.
  if (ui === 'pour' && ms - pourOpenedAt >= POUR_BLANK_MS) ui = 'game'

  watchSignals(now)
  watchJournal(now)
  watchGraft()
  watchTraits(now)
  persist(now)
  audio.setThemeAllowed(phase === 'game' || attractSince !== null)

  // Аттракт-режим: прибор сам показывает ролик, когда его давно не трогали.
  //
  // Только при работающем приборе. На экране запуска и после «отойти по делам»
  // игрок не завис над игрой — он к ней ещё не приступил или уже ушёл, и
  // подсовывать ему ролик незачем. Принудительный запуск (?attract=) фазу не
  // проверяет: им снимают материалы для витрины.
  const idle = Date.now() - lastInputAt
  // Открытый паспорт — тоже занятие: подсовывать ролик поверх чтения незачем.
  const idleEnough =
    idle > idleBeforeAttract && !document.hidden && phase === 'game' && !isManualOpen()
  if (attractSince === null && (forceAttract || idleEnough)) {
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
    // Ролик — витрина: ни надписей поверх прибора, ни предложений установки.
    if (installShown !== 'нет') {
      installShown = 'нет'
      shell.setInstall({ show: false })
    }
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
  refreshInstall()
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

/**
 * Сколько ждём начертания канваса. В норме они приезжают за четверть секунды,
 * так что это не порог, а предохранитель: зависший запрос шрифта не должен
 * оставлять владельца перед мёртвым экраном навсегда.
 */
const FONT_WAIT_MS = 1500

let looping = false

/**
 * Запуск цикла кадров — ровно один раз, каким бы путём сюда ни пришли:
 * по готовности шрифтов, по истечении срока или после отказа. Первый кадр
 * запасным начертанием лучше, чем отсутствие первого кадра.
 */
function startLoop(): void {
  if (looping) return
  looping = true
  if (import.meta.env.DEV) mountDebugPanel(debug, applySkin)
  requestAnimationFrame(frame)
}

// Ждём ровно те начертания, которыми рисует канвас. document.fonts.ready здесь
// была бы ошибкой: она ждёт ВСЕ шрифты документа, включая PT Sans Narrow
// надписей корпуса, — а канвас им не рисует ничего.
Promise.race([
  Promise.all(CANVAS_FONTS.map(([font, text]) => document.fonts.load(font, text))),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
])
  .then(startLoop)
  .catch(startLoop)
