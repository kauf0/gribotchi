/**
 * Паспорт изделия: брошюра поверх комнаты.
 *
 * Почему не на ЖК. Экран прибора — 50×40 клеток, 44 знака в строке и три
 * кнопки; листать там сотню строк невыносимо. Но паспорт и не орган
 * управления: это вкладыш из коробки, и живёт он рядом с прибором, а не
 * внутри него. Три кнопки остаются тремя кнопками.
 *
 * Все иллюстрации рисует САМА ИГРА — теми же render(), project() и drawScoby(),
 * что работают в приборе. Нарисованных руками картинок здесь нет ни одной,
 * иначе руководство однажды показало бы то, чего в игре не бывает.
 *
 * Время под паспортом не останавливается: на том, что объект живёт без
 * владельца, держится вся игра, и пауза здесь была бы враньём.
 */

import './manual.css'

import { Lcd, W, H } from '../view/lcd'
import { render } from '../view/render'
import { project } from '../view/project'
import { drawScoby } from '../view/draw/scoby'
import { drawJar, drawTea, TEA_FLOOR, JAR } from '../view/draw/jar'
import { pourBlank, incidentBlank, cullBlank, strainBlank, summary } from '../view/reports'
import { createState, type GameState } from '../sim/state'
import { TRAITS, TRAIT_KEYS, type TraitKey, type TraitFamily } from '../sim/traits'
import { encodeStrain } from '../sim/strain'
import { BRAND, MANUAL, TRAIT_NAMES, STRAIN_NAMES } from '../content/strings'
import { NAMED } from '../sim/named'
import {
  SECTIONS,
  TRAIT_HINTS,
  FAMILY_NAMES,
  AXIS_NAMES,
  MANUAL_TITLE,
  MANUAL_SUB,
  type Section,
} from '../content/manual'
import type { Mood, ScreenState } from '../view/screenState'

const T0 = new Date(2026, 0, 1, 12, 0, 0).getTime()

/** Образцовое состояние для иллюстраций: ничего не мигает, всё узнаваемо. */
const sample = (over: Partial<GameState> = {}): GameState => ({
  ...createState(T0),
  ageMs: 11 * 3 * 3600_000,
  food: 0.72,
  growth: 0.55,
  mold: 0.12,
  ...over,
})

/**
 * Один холст на все картинки. Тридцать живых canvas по 300×240 — это около
 * девяти мегабайт видеопамяти, на телефоне неприемлемо; поэтому рисуем
 * по очереди в общий буфер и переносим результат в <img>.
 */
let scratch: { canvas: HTMLCanvasElement; lcd: Lcd } | null = null

function paint(draw: (lcd: Lcd) => void): string {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    scratch = { canvas, lcd: new Lcd(canvas, 'amber') }
  }
  scratch.lcd.clear()
  draw(scratch.lcd)
  return scratch.canvas.toDataURL()
}

/**
 * Кадр для брошюры. `crop` показывает не весь ЖК, а вырезку по банке: в тайле
 * размером с ноготь целый экран превращается в кашу, и вклад признака в силуэт
 * разглядеть невозможно — а ради него перечень и затеян.
 */
const shot = (draw: (lcd: Lcd) => void, caption: string, crop = false): HTMLElement => {
  const fig = document.createElement('figure')
  fig.className = 'm-shot'

  const img = document.createElement('img')
  img.src = paint(draw)
  img.width = W
  img.height = H
  img.alt = caption

  if (crop) {
    const box = document.createElement('div')
    box.className = 'm-crop'
    box.append(img)
    fig.append(box)
  } else {
    fig.append(img)
  }

  const cap = document.createElement('figcaption')
  cap.textContent = caption
  fig.append(cap)
  return fig
}

/** Спокойный кадр: никаких эффектов, чтобы иллюстрация не зависела от времени. */
const CALM = { sugar: 0, hearts: 0, washing: 0 } as const

/** Кадр игры целиком — через тот же шов, что и в приборе. */
const gameShot =
  (s: GameState, patch: Partial<ScreenState> = {}) =>
  (lcd: Lcd) =>
    render(lcd, { ...project(s, 0, CALM), ...patch })

/** Бланк — тоже настоящий: берём его у view/reports.ts. */
const blankShot = (report: ReturnType<typeof pourBlank>) => (lcd: Lcd) =>
  render(lcd, { ...project(sample(), 0, CALM), mode: 'journal', report })

/** Объект с одним признаком — чтобы был виден вклад именно этого признака. */
const traitShot = (traits: TraitKey[], mood: Mood = 'ok') => (lcd: Lcd) => {
  drawJar(lcd)
  drawTea(lcd, 1)
  drawScoby(lcd, {
    cx: 25,
    top: 15,
    growth: 0.85,
    mood,
    mold: 0,
    t: 0,
    floor: TEA_FLOOR,
    maxHalfWidth: JAR.teaW / 2,
    traits,
  })
}

function figureFor(kind: NonNullable<Section['figure']>): HTMLElement {
  switch (kind) {
    case 'screen':
      return shot(gameShot(sample()), MANUAL.figScreen)
    case 'moods': {
      const row = document.createElement('div')
      row.className = 'm-row'
      const moods: [Mood, string][] = [
        ['happy', MANUAL.moodHappy],
        ['sad', MANUAL.moodSad],
        ['away', MANUAL.moodAway],
        ['dead', MANUAL.moodDead],
      ]
      for (const [mood, caption] of moods) row.append(shot(traitShot([], mood), caption, true))
      return row
    }
    case 'pour':
      return shot(blankShot(pourBlank(6)), MANUAL.figPour)
    case 'incident':
      return shot(blankShot(incidentBlank('flies')), MANUAL.figIncident)
    case 'cull':
      return shot(blankShot(cullBlank('wiry', ['healing', 'devoted'])), MANUAL.figCull)
    case 'strain': {
      const s = sample({ traits: ['wiry', 'healing', 'devoted'], bred: ['00000000'] })
      const code = encodeStrain({ traits: s.traits, generation: s.generation, crossings: 0 })
      return shot(blankShot(strainBlank(s, code)), MANUAL.figStrain)
    }
    case 'summary':
      return shot(blankShot(summary(sample({ generation: 3 }), 0)), MANUAL.figSummary)
    case 'traits':
      return traitTable()
    case 'named': {
      // Три имени: два обычных и одно недостижимое в одиночку — чтобы разница
      // была видна, а не только описана. Выбираются ПО ПРИЗНАКУ graftOnly,
      // а не по номеру в таблице: имена ещё будут добавляться.
      const row = document.createElement('div')
      row.className = 'm-row'
      const plain = NAMED.filter((n) => !n.graftOnly).slice(0, 2)
      const graft = NAMED.find((n) => n.graftOnly)
      const shown = [...plain, ...(graft ? [graft] : [])]
      for (const strain of shown) {
        const name = STRAIN_NAMES[strain.key as keyof typeof STRAIN_NAMES]
        row.append(shot(traitShot([...strain.traits]), strain.graftOnly ? MANUAL.namedGraft(name) : name, true))
      }
      return row
    }
  }
}

/** Полный перечень признаков по семьям: силуэт, что даёт, чем платит, как взять. */
function traitTable(): HTMLElement {
  const host = document.createElement('div')
  host.className = 'm-traits'

  const byFamily = new Map<TraitFamily, TraitKey[]>()
  for (const key of TRAIT_KEYS) {
    const family = TRAITS[key].family
    byFamily.set(family, [...(byFamily.get(family) ?? []), key])
  }

  for (const [family, keys] of byFamily) {
    const group = document.createElement('section')
    group.className = 'm-family'

    const head = document.createElement('h4')
    head.textContent = FAMILY_NAMES[family]
    const note = document.createElement('p')
    note.className = 'm-family__note'
    note.textContent = MANUAL.familyNote
    group.append(head, note)

    for (const key of keys) {
      const def = TRAITS[key]
      const card = document.createElement('article')
      card.className = 'm-trait'
      card.append(shot(traitShot([key]), '', true))

      const text = document.createElement('div')
      text.innerHTML = `
        <h5>${TRAIT_NAMES[key]}</h5>
        <p class="m-trait__rates">
          <span class="up">${AXIS_NAMES[def.up]} ${def.up === 'growth' ? 'быстрее' : 'меньше'}</span>
          <span class="down">${AXIS_NAMES[def.down]} ${def.down === 'growth' ? 'медленнее' : 'больше'}</span>
        </p>
        <p class="m-trait__how">${TRAIT_HINTS[key]}</p>`
      card.append(text)
      group.append(card)
    }
    host.append(group)
  }
  return host
}

/** Разметка одного раздела. */
function sectionEl(section: Section, index: number): HTMLElement {
  const el = document.createElement('section')
  el.className = 'm-section'
  el.id = `m-${section.id}`

  const h = document.createElement('h3')
  h.innerHTML = `<span class="m-num">${index}</span>${section.title}`
  el.append(h)

  let list: HTMLUListElement | null = null
  for (const line of section.body) {
    if (line.startsWith('· ')) {
      if (!list) {
        list = document.createElement('ul')
        el.append(list)
      }
      const li = document.createElement('li')
      li.textContent = line.slice(2)
      list.append(li)
      continue
    }
    list = null
    const p = document.createElement('p')
    p.textContent = line
    el.append(p)
  }

  if (section.figure) el.append(figureFor(section.figure))
  return el
}

let overlay: HTMLElement | null = null
let onClosed: (() => void) | null = null

/** Открыт ли паспорт — по нему main.ts придерживает ролик. */
export const isManualOpen = (): boolean => overlay !== null

export function closeManual(): void {
  if (!overlay) return
  overlay.remove()
  overlay = null
  document.removeEventListener('keydown', onKey)
  onClosed?.()
}

const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeManual()
}

/**
 * Собирается заново при каждом открытии: паспорт открывают редко, а держать
 * три десятка картинок в памяти постоянно незачем.
 */
export function openManual(version: string, onClose?: () => void): void {
  if (overlay) return
  onClosed = onClose ?? null

  overlay = document.createElement('div')
  overlay.className = 'manual'
  // Щелчок мимо брошюры закрывает — как отложить вкладыш в сторону.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeManual()
  })

  const sheet = document.createElement('article')
  sheet.className = 'manual__sheet'

  const close = document.createElement('button')
  close.className = 'manual__close'
  close.type = 'button'
  close.textContent = MANUAL.close
  close.addEventListener('click', closeManual)

  const cover = document.createElement('header')
  cover.className = 'm-cover'
  cover.innerHTML = `
    <div class="m-cover__brand">
      <span class="m-cover__name">${BRAND.ru}</span>
      <span class="m-cover__jp">${BRAND.jp}</span>
    </div>
    <h2>${MANUAL_TITLE}</h2>
    <p class="m-cover__sub">${MANUAL_SUB}</p>
    <p class="m-cover__marks">${BRAND.gost} · ИЗДЕЛИЕ ВЕРСИИ ${version}</p>`

  const toc = document.createElement('nav')
  toc.className = 'm-toc'
  toc.innerHTML =
    `<h3>${MANUAL.contents}</h3><ol>` +
    SECTIONS.map((s) => `<li><a href="#m-${s.id}">${s.title}</a></li>`).join('') +
    '</ol>'

  sheet.append(close, cover, toc)
  SECTIONS.forEach((section, i) => sheet.append(sectionEl(section, i + 1)))

  const foot = document.createElement('footer')
  foot.className = 'm-foot'
  foot.textContent = MANUAL.footer
  sheet.append(foot)

  overlay.append(sheet)
  document.body.append(overlay)
  document.addEventListener('keydown', onKey)
  sheet.scrollTop = 0
}
