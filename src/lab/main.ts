/**
 * Лаборатория: стенд для проверки механики штаммов.
 *
 * Живёт только в разработке — в сборку не попадает, потому что Vite собирает
 * один index.html, а эта страница лежит отдельным lab.html.
 *
 * Главное правило стенда: он НЕ повторяет игру, а вызывает её же функции.
 * Состояние — настоящий GameState, время идёт настоящим advance(), кадр
 * собирается настоящими project() и render(). Поэтому стенд не может показать
 * то, чего не будет в игре, — а именно ради этого он и нужен.
 *
 * Что здесь можно, чего нельзя в самой игре:
 *   · прыгать по времени сразу на дни и недели;
 *   · видеть все тридцать признаков и то, какие условия уже выполнены;
 *   · назначать признаки руками и сразу смотреть силуэт;
 *   · подавать чай в любой час — иначе НОЧНОГО не проверить;
 *   · собрать чужой штамм и скрестить, не заводя второго игрока.
 */

import './lab.css'

import { createState, type GameState } from '../sim/state'
import { advance } from '../sim/tick'
import { feed, clean, bottle, nextGeneration } from '../sim/actions'
import { observe } from '../sim/observations'
import { counted, recordAll, type TallyKey } from '../sim/journal'
import { canBottle, dayOf, dominantTea, moodOf } from '../sim/derive'
import {
  TRAITS,
  TRAIT_KEYS,
  TRAIT_SLOTS,
  earnedTraits,
  ratesFor,
  type TraitKey,
} from '../sim/traits'
import { encodeStrain, decodeStrain, prettyCode } from '../sim/strain'
import { TRAIT_NAMES } from '../content/strings'
import { journalLine } from '../view/reports'
import { project } from '../view/project'
import { render } from '../view/render'
import { Lcd } from '../view/lcd'
import { Fx } from '../view/fx'
import { drawScoby } from '../view/draw/scoby'
import { drawJar, TEA_FLOOR, JAR } from '../view/draw/jar'
import * as B from '../sim/balance'

const HOUR = 3600_000
/** Начало отсчёта: фиксированное, чтобы прогоны сходились между собой. */
const T0 = new Date(2026, 0, 1, 12, 0, 0).getTime()

let state: GameState = createState(T0)
let now = T0
/** Час, в который «происходят» действия. Ради проверки НОЧНОГО. */
let hour = 12
const fx = new Fx()
const log: string[] = []

const say = (line: string) => {
  log.unshift(`д${String(dayOf(state)).padStart(3)} · ${line}`)
  log.length = Math.min(log.length, 200)
}

/**
 * Общий шаг после любого изменения: досчитать время и дать прибору заметить
 * то, что он замечает в игре. Ровно то же делает main.ts на каждом кадре.
 */
function settle(prev: GameState): void {
  state = recordAll(state, observe(prev, state, { now, hour }))

  // Признаки закрепляются сами, пока есть места. Полные места в игре открывают
  // бланк выбраковки; на стенде просто говорим, кто ждёт очереди.
  let guard = 0
  while (guard++ < TRAIT_KEYS.length) {
    const gained = earnedTraits(state)[0]
    if (!gained) break
    if (state.traits.length >= TRAIT_SLOTS) {
      say(`мест нет: ждёт ${TRAIT_NAMES[gained]}`)
      break
    }
    state = { ...state, traits: [...state.traits, gained] }
    say(`закреплён ${TRAIT_NAMES[gained]}`)
  }
  draw()
}

/** Прыжок во времени. Идёт теми же шагами, что и оффлайн-догон в игре. */
function jump(ms: number): void {
  const prev = state
  now += ms
  state = advance(state, now)
  if (prev.alive && !state.alive) say('ОБЪЕКТ ПОГИБ')
  settle(prev)
}

function act(fn: () => { state: GameState; msg: string; rejected?: boolean }, gapMs: number): void {
  // Действия разнесены во времени: кулдауны игры настоящие, и обходить их
  // стенду незачем — достаточно не жать две кнопки в одну миллисекунду.
  now += gapMs
  const caught = advance(state, now)
  const prev = caught
  state = caught
  const res = fn()
  state = res.state
  say(res.rejected ? `отказ: ${res.msg}` : res.msg)
  settle(prev)
}

// ── разметка ──────────────────────────────────────────────────────

const root = document.getElementById('lab')!
root.innerHTML = `
  <div>
    <div class="panel">
      <h2>Экран</h2>
      <canvas class="lcd"></canvas>
      <p class="hint" id="mood"></p>
    </div>
    <div class="panel"><h2>Состояние</h2><div id="stats"></div></div>
    <div class="panel">
      <h2>Время</h2>
      <div class="row" id="time"></div>
      <div class="row" id="hours"></div>
      <p class="hint">Игровой день — 3 реальных часа. Час подачи нужен признакам НОЧНОЙ и ДНЕВНОЙ.</p>
    </div>
    <div class="panel"><h2>Действия</h2><div class="row" id="acts"></div><div class="row" id="acts2"></div></div>
    <div class="panel">
      <h2>Прогон стиля ухода</h2>
      <div class="row" id="runs"></div>
      <p class="hint">Шесть реальных суток за раз — примерно полтора цикла жизни. Когда мест нет, прогон выбраковывает наименее выразительный признак — как поступил бы игрок. Так видно, какой штамм вырастает из привычки, — по одному нажатию вместо шестидесяти.</p>
    </div>
  </div>
  <div>
    <div class="cols">
      <div>
        <div class="panel"><h2>Штамм</h2><div id="strain"></div></div>
        <div class="panel"><h2>Счётчики</h2><div id="tally"></div></div>
      </div>
      <div class="panel"><h2>Журнал и события</h2><pre class="log" id="log"></pre></div>
    </div>
    <div class="panel">
      <h2>Признаки — клик назначает или снимает</h2>
      <div class="traits" id="traits"></div>
      <p class="hint">Рамка — условие выполнено сейчас. Заливка — признак у объекта. Зачёркнут — отказано.</p>
    </div>
    <div class="panel">
      <h2>Силуэты: вклад каждого признака по отдельности</h2>
      <div class="gallery" id="gallery"></div>
    </div>
  </div>`

const lcd = new Lcd(root.querySelector('canvas.lcd')!, 'amber')

const buttons = (host: string, items: [string, () => void][], active?: (label: string) => boolean) => {
  const el = root.querySelector(host)!
  el.innerHTML = ''
  for (const [label, fn] of items) {
    const b = document.createElement('button')
    b.textContent = label
    if (active?.(label)) b.classList.add('on')
    b.onclick = fn
    el.append(b)
  }
}

buttons('#time', [
  ['+15 мин', () => jump(15 * 60_000)],
  ['+1 ч', () => jump(HOUR)],
  ['+1 день', () => jump(B.GAME_DAY_MS)],
  ['+3 дня', () => jump(3 * B.GAME_DAY_MS)],
  ['+7 дней', () => jump(7 * B.GAME_DAY_MS)],
  ['+30 дней', () => jump(30 * B.GAME_DAY_MS)],
])

const drawHours = () =>
  buttons(
    '#hours',
    ([0, 3, 6, 9, 12, 15, 18, 21] as const).map((h) => [
      `${String(h).padStart(2, '0')}:00`,
      () => {
        hour = h
        drawHours()
        say(`час подачи: ${h}:00`)
      },
    ]),
    (label) => label === `${String(hour).padStart(2, '0')}:00`,
  )
drawHours()

buttons('#acts', [
  ['ЧАЙ чёрный', () => act(() => feed(state, now, 'black'), B.FEED_COOLDOWN_MS + 1)],
  ['ЧАЙ зелёный', () => act(() => feed(state, now, 'green'), B.FEED_COOLDOWN_MS + 1)],
  ['ЧАЙ имбирь', () => act(() => feed(state, now, 'ginger'), B.FEED_COOLDOWN_MS + 1)],
  ['МЫТЬ', () => act(() => clean(state, now), B.CLEAN_COOLDOWN_MS + 1)],
])

buttons('#acts2', [
  ['РОЗЛИВ', () => act(() => bottle(state, now), 1000)],
  ['УБИТЬ', () => {
    const prev = state
    state = { ...state, alive: false, deathAt: now, deathDay: dayOf(state) }
    say('объект умерщвлён вручную')
    settle(prev)
  }],
  ['ПОКОЛЕНИЕ', () => act(() => nextGeneration(state, now), 1000)],
  ['СНАЧАЛА', () => {
    now = T0
    state = createState(T0)
    log.length = 0
    say('новая закваска')
    draw()
  }],
])

/**
 * Прогон стиля ухода. Ради этого стенд и затевался: понять, что вырастает
 * из привычки, а не из отдельного нажатия.
 *
 * Политика получает состояние и час и решает, что сделать в этот час игры.
 * Дальше всё идёт настоящими функциями — никаких упрощений, иначе прогон
 * показывал бы не ту игру, что у игрока.
 */
type Policy = (s: GameState, h: number) => 'black' | 'green' | 'ginger' | 'clean' | null

const STYLES: [string, Policy][] = [
  // Час важен: подача между полуночью и шестью считается ночной, и дневные
  // стили обязаны кормить днём, иначе НОЧНОЙ полезет во все прогоны разом.
  //
  // Окно визита в несколько часов, а не один: за одну подачу бак прибавляет
  // 0.45, а тратит 2.0 за реальные сутки. Игрок жмёт ЧАЙ несколько раз подряд
  // — стенд с одной подачей за визит показывал вечно голодный объект и врал
  // про баланс.
  ['образцовый', (s, h) => (s.mold > 0.35 ? 'clean' : visit(h, [9, 21], 3) && s.food < 0.8 ? 'black' : null)],
  ['зелёный гонщик', (s, h) => (s.mold > 0.5 ? 'clean' : visit(h, [8, 14, 20], 2) && s.food < 0.85 ? 'green' : null)],
  ['имбирный лекарь', (s, h) => (s.mold > 0.55 ? 'clean' : visit(h, [10, 18], 3) && s.food < 0.8 ? 'ginger' : null)],
  ['ночной', (s, h) => (s.mold > 0.45 ? 'clean' : visit(h, [1], 4) && s.food < 0.9 ? 'black' : null)],
  ['небрежный', (s, h) => (visit(h, [13], 2) && s.food < 0.25 ? 'black' : null)],
  ['перекормщик', (_s, h) => (h >= 7 && h <= 22 ? 'black' : null)],
  ['грязнуля', (s, h) => (visit(h, [9, 21], 3) && s.food < 0.8 ? 'black' : null)],
]

/** Визит длится несколько часов подряд: игрок жмёт ЧАЙ, пока бак не полон. */
const visit = (hour: number, starts: number[], hours: number): boolean =>
  starts.some((start) => hour >= start && hour < start + hours)

function runStyle(name: string, policy: Policy, days = 6): void {
  now = T0
  state = createState(T0)
  log.length = 0
  say(`прогон: ${name}`)

  // Час за часом: шаг мельче игрового дня, иначе политика не успевала бы
  // отреагировать на голод и всё сводилось бы к смерти.
  for (let h = 0; h < days * 24 && state.alive; h++) {
    now += HOUR
    state = advance(state, now)
    hour = (12 + h) % 24
    const want = policy(state, hour)
    if (!want) continue

    const prev = state
    const res = want === 'clean' ? clean(state, now) : feed(state, now, want)
    state = res.state
    if (!res.rejected) state = recordAll(state, observe(prev, state, { now, hour }))

    // Признаки закрепляются по ходу, как в игре. Когда мест нет, прогон
    // ВЫБРАКОВЫВАЕТ наименее выразительный — так поступил бы игрок, который
    // выводит штамм. Без этого места навсегда занимали бы те признаки, что
    // подвернулись раньше, и сравнивать стили было бы нечего.
    const gained = earnedTraits(state)[0]
    if (!gained) continue
    if (state.traits.length < TRAIT_SLOTS) {
      state = { ...state, traits: [...state.traits, gained] }
      say(`закреплён ${TRAIT_NAMES[gained]}`)
    } else {
      const weakest = [...state.traits].sort((a, b) => TRAITS[a].rank - TRAITS[b].rank)[0]
      if (TRAITS[weakest].rank < TRAITS[gained].rank) {
        state = { ...state, traits: [...state.traits.filter((k) => k !== weakest), gained] }
        say(`${TRAIT_NAMES[gained]} вытеснил ${TRAIT_NAMES[weakest]}`)
      }
    }
  }

  const code = encodeStrain({ traits: state.traits, generation: state.generation, crossings: 0 })
  say(
    `${state.alive ? 'выжил' : 'ПОГИБ'} · день ${dayOf(state)} · рост ${state.growth.toFixed(2)} · ` +
      `штамм ${prettyCode(code)} = ${state.traits.map((k) => TRAIT_NAMES[k]).join(', ') || 'без признаков'}`,
  )
  draw()
}

buttons(
  '#runs',
  STYLES.map(([name, policy]) => [name, () => runStyle(name, policy)] as [string, () => void]),
)

// ── отрисовка ─────────────────────────────────────────────────────

const bar = (label: string, v: number, warn = false) =>
  `<div class="stat${warn ? ' warn' : ''}"><b>${label}</b>
     <span class="bar"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>
     <span class="num">${v.toFixed(2)}</span></div>`

function drawStats(): void {
  const rate = ratesFor(state.traits)
  root.querySelector('#stats')!.innerHTML =
    bar('сытость', state.food, state.food < B.SAD_FOOD_BELOW) +
    bar('рост', state.growth) +
    bar('плесень', state.mold, state.mold > B.ANGRY_MOLD_ABOVE) +
    bar('обида', state.resentment, state.resentment > B.AWAY_ABOVE) +
    bar('худшая плесень', state.maxMold) +
    `<div class="stat"><b>день</b><span>${dayOf(state)} · поколение ${state.generation}</span><span></span></div>` +
    `<div class="stat"><b>скорости</b><span>сыт ×${rate.food.toFixed(2)} плес ×${rate.mold.toFixed(2)}
       рост ×${rate.growth.toFixed(2)} обид ×${rate.resent.toFixed(2)}</span><span></span></div>`

  root.querySelector('#mood')!.textContent =
    `настрой ${moodOf(state)} · ${state.alive ? 'жив' : 'мёртв'}${canBottle(state) ? ' · готов к розливу' : ''}`
}

function drawTraits(): void {
  const ready = new Set(earnedTraits(state))
  root.querySelector('#traits')!.innerHTML = TRAIT_KEYS.map((key) => {
    const def = TRAITS[key]
    const cls = state.traits.includes(key)
      ? 'held'
      : state.declined.includes(key)
        ? 'declined'
        : ready.has(key)
          ? 'ready'
          : ''
    return `<div class="trait ${cls}" data-key="${key}">
      <span style="opacity:1">${TRAIT_NAMES[key]}</span>
      <span>${def.up}+ ${def.down}−</span>
    </div>`
  }).join('')

  for (const el of root.querySelectorAll<HTMLElement>('.trait')) {
    el.onclick = () => {
      const key = el.dataset.key as TraitKey
      const prev = state
      if (state.traits.includes(key)) {
        state = { ...state, traits: state.traits.filter((k) => k !== key) }
      } else if (state.traits.length < TRAIT_SLOTS) {
        // Из одной семьи держать два нельзя — вытесняем соседа по семье.
        const family = TRAITS[key].family
        const kept = state.traits.filter((k) => TRAITS[k].family !== family)
        state = { ...state, traits: [...kept, key] }
      } else {
        say('мест нет — снимите признак')
        return draw()
      }
      settle(prev)
    }
  }
}

function drawStrain(): void {
  const code = encodeStrain({
    traits: state.traits,
    generation: state.generation,
    crossings: state.crossings,
  })
  root.querySelector('#strain')!.innerHTML = `
    <div class="row"><code>${prettyCode(code)}</code></div>
    <div class="row">${state.traits.map((k) => TRAIT_NAMES[k]).join(' · ') || '— признаков нет —'}</div>
    <div class="row">выведено ${state.bred.length} · скрещиваний ${state.crossings}</div>
    <div class="row">
      <input type="text" id="foreign" placeholder="чужой код" value="${state.offered ?? ''}" />
      <button id="take">принять</button>
      <button id="rnd">случайный</button>
    </div>
    <div class="row"><button id="graft">пересадить и сменить поколение</button></div>`

  const input = root.querySelector<HTMLInputElement>('#foreign')!
  root.querySelector<HTMLButtonElement>('#take')!.onclick = () => {
    const strain = decodeStrain(input.value)
    if (!strain) return say(`код не опознан: ${input.value}`)
    state = { ...state, offered: input.value.toUpperCase().replace(/[\s-]/g, '') }
    say(`принята закваска: ${strain.traits.map((k) => TRAIT_NAMES[k]).join(', ')}`)
    draw()
  }
  root.querySelector<HTMLButtonElement>('#rnd')!.onclick = () => {
    // Чужой штамм из признаков РАЗНЫХ семей — такой и приходит от живого игрока.
    const pool = [...TRAIT_KEYS].sort(() => Math.random() - 0.5)
    const picked: TraitKey[] = []
    const families = new Set<string>()
    for (const k of pool) {
      if (picked.length >= TRAIT_SLOTS) break
      if (families.has(TRAITS[k].family)) continue
      families.add(TRAITS[k].family)
      picked.push(k)
    }
    input.value = encodeStrain({ traits: picked, generation: 3, crossings: 1 })
  }
  root.querySelector<HTMLButtonElement>('#graft')!.onclick = () => {
    const foreign = decodeStrain(state.offered)
    if (!foreign) return say('закваски на хранении нет')
    const prev = state
    now += 1000
    state = bottle({ ...state, growth: 1 }, now).state
    // В игре это бланк ПЕРЕСАДКА; здесь берём первый чужой признак, которого
    // у объекта нет, — чтобы увидеть результат сразу.
    const gift = foreign.traits.find((k) => !state.traits.includes(k))
    if (gift) {
      const kept = state.traits.filter((k) => TRAITS[k].family !== TRAITS[gift].family).slice(0, 2)
      state = { ...state, traits: [...kept, gift], crossings: state.crossings + 1, offered: null }
      say(`пересажен ${TRAIT_NAMES[gift]}`)
    }
    settle(prev)
  }
}

function drawTally(): void {
  const keys: TallyKey[] = [
    'clean',
    'overfed',
    'night-pour',
    'turned-away',
    'forgiven',
    'incident',
    'answer-0',
    'answer-2',
    'absence',
  ]
  const pours = B.TEA_KEYS.map((k) => `${k} ${state.poured[k]}`).join(' · ')
  root.querySelector('#tally')!.innerHTML =
    `<div class="row">подачи: ${pours} → ${dominantTea(state) ?? 'вразнобой'}</div>` +
    keys.map((k) => `<div class="stat"><b>${k}</b><span>${counted(state.tally, k)}</span><span></span></div>`).join('')
}

function drawLog(): void {
  const entries = [...state.journal].reverse().map((e) => `· ${journalLine(e)}`)
  root.querySelector('#log')!.innerHTML =
    `<b>${log.slice(0, 40).join('\n')}</b>\n\n${entries.join('\n')}`
}

/** Галерея: каждый признак в одиночку, чтобы видеть его вклад. */
function drawGallery(): void {
  const host = root.querySelector('#gallery')!
  if (host.childElementCount) return
  for (const key of ['none' as const, ...TRAIT_KEYS]) {
    const fig = document.createElement('figure')
    const shot = document.createElement('div')
    shot.className = 'shot'
    const canvas = document.createElement('canvas')
    shot.append(canvas)
    fig.append(shot)
    const cap = document.createElement('figcaption')
    cap.textContent = key === 'none' ? 'без признаков' : TRAIT_NAMES[key]
    fig.append(cap)
    host.append(fig)

    const one = new Lcd(canvas, 'amber')
    one.clear()
    drawJar(one)
    drawScoby(one, {
      cx: 25,
      top: 17,
      growth: 0.85,
      mood: 'ok',
      mold: 0,
      t: 0,
      floor: TEA_FLOOR,
      maxHalfWidth: JAR.teaW / 2,
      traits: key === 'none' ? [] : [key],
    })
  }
}

function draw(): void {
  drawStats()
  drawTraits()
  drawStrain()
  drawTally()
  drawLog()
  drawGallery()
}

// Живой кадр — тот же, что в игре: project() → render().
let t = 0
function frame(ms: number): void {
  t = ms / 1000
  render(lcd, project(state, t, fx.snapshot(now)))
  requestAnimationFrame(frame)
}

say('стенд готов')
draw()
requestAnimationFrame(frame)
