/**
 * Реестр штаммов: второй бумажный разворот рядом с паспортом.
 *
 * Почему не на ЖК — по той же причине, что и паспорт: на экране прибора
 * пятьдесят клеток и три кнопки, а здесь двадцать четыре имени с силуэтами
 * и признаками. Но есть и вторая причина, важнее. Задание на селекцию — это
 * выбор из двух десятков вариантов, и в три кнопки он не помещается никак.
 * Реестр — единственное место, где такой руль вообще может существовать.
 *
 * Силуэты рисует САМА ИГРА: та же drawScoby() с теми же признаками, что
 * в приборе. Нарисованных руками картинок здесь нет — иначе реестр однажды
 * показал бы штамм, которого не бывает.
 *
 * Невыведенные имена показаны ЦЕЛИКОМ, с именем и признаками: цель, которую
 * не видно, целью не является. Скрывать их было бы кокетством — игрок всё
 * равно прочтёт таблицу в паспорте.
 */

import './registry.css'

import { Lcd } from '../view/lcd'
import { drawScoby } from '../view/draw/scoby'
import { drawJar, drawTea, TEA_FLOOR, JAR } from '../view/draw/jar'
import { NAMED, namedKey, type NamedStrain } from '../sim/named'
import { rankOf, toNextRank, breadthOf } from '../sim/rank'
import { decodeStrain, strainCounts, prettyCode } from '../sim/strain'
import { TRAITS, TRAIT_KEYS, type TraitKey } from '../sim/traits'
import { REGISTRY, TRAIT_NAMES, STRAIN_NAMES, RANK_NAMES, BRAND } from '../content/strings'
import type { GameState } from '../sim/state'

/** Сколько сочетаний есть всего и сколько из них берётся без обмена. */
const COUNTS = (): { total: number; alone: number } =>
  strainCounts(TRAIT_KEYS.map((k) => TRAITS[k].family))

/**
 * Один холст на все силуэты — как в паспорте. Два десятка живых canvas
 * по 300×240 съели бы несколько мегабайт видеопамяти на телефоне.
 */
let scratch: { canvas: HTMLCanvasElement; lcd: Lcd } | null = null

function silhouette(traits: readonly TraitKey[]): string {
  if (!scratch) {
    const canvas = document.createElement('canvas')
    scratch = { canvas, lcd: new Lcd(canvas, 'amber') }
  }
  const { lcd, canvas } = scratch
  lcd.clear()
  drawJar(lcd)
  drawTea(lcd, 1)
  drawScoby(lcd, {
    cx: 25,
    top: 15,
    growth: 0.85,
    mood: 'ok',
    mold: 0,
    t: 0,
    floor: TEA_FLOOR,
    maxHalfWidth: JAR.teaW / 2,
    traits: [...traits],
  })
  return canvas.toDataURL()
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

/** Кадр в рамке: вырезка по банке, иначе в тайле с ноготь ничего не разобрать. */
function frame(traits: readonly TraitKey[] | null): HTMLElement {
  const box = el('div', 'r-crop')
  if (!traits) {
    // Пустая рамка — честнее заглушки: место под штамм есть, штамма нет.
    box.classList.add('r-crop--empty')
    return box
  }
  const img = el('img')
  img.src = silhouette(traits)
  img.alt = ''
  box.append(img)
  return box
}

const traitLine = (traits: readonly TraitKey[]): string =>
  traits.map((k) => TRAIT_NAMES[k]).join(' · ')

/** Карточка именованного штамма — она же кнопка задания. */
function namedCard(
  strain: NamedStrain,
  owned: boolean,
  target: string | null,
  onTarget: (key: string | null) => void,
): HTMLElement {
  const card = el('article', 'r-card')
  if (owned) card.classList.add('r-card--own')
  if (target === strain.key) card.classList.add('r-card--target')

  card.append(frame(owned ? strain.traits : null))

  const text = el('div', 'r-card__text')
  const head = el('h4', 'r-card__name', STRAIN_NAMES[strain.key as keyof typeof STRAIN_NAMES])

  const marks = el('p', 'r-card__marks')
  marks.append(el('span', owned ? 'r-mark r-mark--own' : 'r-mark', owned ? REGISTRY.own : REGISTRY.notOwn))
  if (strain.graftOnly) {
    const graft = el('span', 'r-mark r-mark--graft', REGISTRY.graftOnly)
    graft.title = REGISTRY.graftNote
    marks.append(graft)
  }

  text.append(head, marks, el('p', 'r-card__traits', traitLine(strain.traits)))

  // Задание берётся и снимается одной кнопкой: цель у владельца одна.
  if (!owned) {
    const taken = target === strain.key
    const btn = el('button', 'r-take', taken ? REGISTRY.drop : REGISTRY.take)
    btn.type = 'button'
    if (taken) btn.classList.add('r-take--on')
    btn.addEventListener('click', () => onTarget(taken ? null : strain.key))
    text.append(btn)
  }

  card.append(text)
  return card
}

/** Строка собственного штамма: силуэт, код и признаки. */
function ownRow(code: string): HTMLElement | null {
  const strain = decodeStrain(code)
  if (!strain) return null

  const row = el('article', 'r-row')
  row.append(frame(strain.traits))

  const text = el('div', 'r-card__text')
  const named = NAMED.find((n) => namedKey(n) === code)
  text.append(
    el(
      'h4',
      'r-card__name',
      named ? STRAIN_NAMES[named.key as keyof typeof STRAIN_NAMES] : REGISTRY.unnamed,
    ),
    el('p', 'r-row__code', prettyCode(code)),
    el('p', 'r-card__traits', traitLine(strain.traits)),
  )
  row.append(text)
  return row
}

let overlay: HTMLElement | null = null
let onClosed: (() => void) | null = null

/** Открыт ли реестр — по нему main.ts придерживает ролик, как и под паспортом. */
export const isRegistryOpen = (): boolean => overlay !== null

export function closeRegistry(): void {
  if (!overlay) return
  overlay.remove()
  overlay = null
  document.removeEventListener('keydown', onKey)
  onClosed?.()
}

const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeRegistry()
}

export type RegistryOpts = {
  /** Состояние на момент открытия: реестр ничего не считает сам. */
  state: GameState
  /** Взять или снять задание. Реестр перерисовывается заново. */
  onTarget: (key: string | null) => void
  onClose?: () => void
}

/**
 * Собирается заново при каждом открытии — как и паспорт. Заодно это делает
 * перерисовку после смены задания тривиальной: закрыть и открыть.
 */
export function openRegistry(opts: RegistryOpts): void {
  const { state, onTarget } = opts
  if (overlay) closeRegistry()
  onClosed = opts.onClose ?? null

  overlay = el('div', 'registry')
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeRegistry()
  })

  const sheet = el('article', 'registry__sheet')

  const close = el('button', 'registry__close', REGISTRY.close)
  close.type = 'button'
  close.addEventListener('click', closeRegistry)

  const head = el('header', 'r-head')
  head.innerHTML = `
    <div class="r-head__brand">
      <span class="r-head__name">${BRAND.ru}</span>
      <span class="r-head__jp">${BRAND.jp}</span>
    </div>
    <h2>${REGISTRY.title}</h2>
    <p class="r-head__sub">${REGISTRY.sub}</p>`

  // ── разряд ────────────────────────────────────────────────────
  const b = breadthOf(state.bred)
  const rank = el('section', 'r-rank')
  rank.append(
    el('p', 'r-rank__label', REGISTRY.rank),
    el('p', 'r-rank__name', RANK_NAMES[rankOf(state.bred).key]),
  )

  const next = toNextRank(state.bred)
  if (next) {
    const need = [
      next.need.strains > 0 ? REGISTRY.needStrains(next.need.strains) : null,
      next.need.names > 0 ? REGISTRY.needNames(next.need.names) : null,
      next.need.traits > 0 ? REGISTRY.needTraits(next.need.traits) : null,
    ].filter((x) => x !== null)
    rank.append(el('p', 'r-rank__next', REGISTRY.toNext(RANK_NAMES[next.rank.key], need.join(' и '))))
  } else {
    rank.append(el('p', 'r-rank__next', REGISTRY.topRank))
  }

  // ── счётчики ──────────────────────────────────────────────────
  const tally = el('section', 'r-tally')
  for (const line of [
    REGISTRY.bred(state.bred.length),
    REGISTRY.bottlings(state.bottlings),
    REGISTRY.names(b.names, NAMED.length),
    REGISTRY.traits(b.traits, TRAIT_KEYS.length),
  ]) {
    tally.append(el('span', 'r-tally__cell', line))
  }

  // ── именованные ───────────────────────────────────────────────
  const owned = new Set(state.bred)
  const named = el('section', 'r-section')
  named.append(
    el('h3', undefined, REGISTRY.namedTitle),
    el('p', 'r-note', REGISTRY.namedNote),
    el('p', 'r-note', REGISTRY.taskNote),
  )
  const grid = el('div', 'r-grid')
  for (const strain of NAMED) {
    grid.append(namedCard(strain, owned.has(namedKey(strain)), state.target, onTarget))
  }
  named.append(grid)

  // ── свои ──────────────────────────────────────────────────────
  const mine = el('section', 'r-section')
  mine.append(el('h3', undefined, REGISTRY.mineTitle))
  if (state.bred.length === 0) {
    mine.append(el('p', 'r-note', REGISTRY.mineEmpty))
  } else {
    const list = el('div', 'r-list')
    for (const code of state.bred) {
      const row = ownRow(code)
      if (row) list.append(row)
    }
    mine.append(list)
  }

  // ── итог ──────────────────────────────────────────────────────
  const counts = COUNTS()
  const foot = el('footer', 'r-foot')
  foot.append(
    el('p', 'r-foot__totals', REGISTRY.totals(counts.total, counts.alone)),
    el('p', 'r-note', REGISTRY.totalsNote(counts.total - counts.alone)),
    el('p', 'r-foot__stamp', REGISTRY.footer),
  )

  sheet.append(close, head, rank, tally, named, mine, foot)
  overlay.append(sheet)
  document.body.append(overlay)
  document.addEventListener('keydown', onKey)
  sheet.scrollTop = 0
}
