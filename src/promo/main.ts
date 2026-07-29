/**
 * Промо-картинка к выпуску штаммов: каталог образцов.
 *
 * Грибы здесь нарисованы НЕ иллюстратором, а той же drawScoby(), что рисует
 * их в приборе, и силуэт собирается той же silhouetteOf() из настоящих
 * признаков. Поэтому картинка не может пообещать того, чего в игре нет, —
 * и это важнее любой красоты: витрина обязана быть правдой.
 *
 * Кодов штаммов здесь нет намеренно: восьмизначный набор ничего не говорит
 * тому, кто игру ещё не видел, и только отнимает место у названий признаков —
 * а рассказывают о механике именно они.
 *
 * Размер задаётся адресом: ?w=1200&h=630&cols=4. Одна страница отдаёт и
 * широкий кадр для девлога, и обложку itch.
 *
 * Живёт только в разработке — Vite собирает один index.html.
 */

import './promo.css'

import { Lcd } from '../view/lcd'
import { drawScoby } from '../view/draw/scoby'
import { drawJar, drawTea, TEA_FLOOR, JAR } from '../view/draw/jar'
import { TRAIT_NAMES } from '../content/strings'
import { BRAND } from '../content/strings'
import type { TraitKey } from '../sim/traits'

/**
 * Образцы для витрины. Отобраны по одному признаку: они должны отличаться
 * НА ГЛАЗ, а не подписью. Внутри каждой тройки признаки из разных семей —
 * такие штаммы и бывают.
 */
const SPECIMENS: { traits: TraitKey[]; growth: number; mold: number }[] = [
  { traits: ['wild', 'greedy', 'early'], growth: 1, mold: 0.05 },
  { traits: ['stout', 'slow', 'longline'], growth: 0.9, mold: 0.1 },
  { traits: ['wiry', 'neglected', 'seasoned'], growth: 0.8, mold: 0.35 },
  { traits: ['healing', 'sterile', 'devoted'], growth: 0.85, mold: 0 },
  { traits: ['nocturnal', 'spiteful', 'ancient'], growth: 0.9, mold: 0.15 },
  { traits: ['lean', 'stunted', 'generous'], growth: 0.55, mold: 0.05 },
  { traits: ['abandoned', 'litigious', 'motley'], growth: 0.75, mold: 0.2 },
  { traits: ['foundling', 'scrubbed', 'even'], growth: 0.95, mold: 0 },
]

const q = new URLSearchParams(location.search)
const W = Number(q.get('w') ?? 1200)
const H = Number(q.get('h') ?? 630)
const COLS = Number(q.get('cols') ?? 4)
const COUNT = Number(q.get('n') ?? 8)

const root = document.getElementById('promo')!
root.style.width = `${W}px`
root.style.height = `${H}px`
root.style.setProperty('--cols', String(COLS))
root.style.setProperty('--k', String(Math.max(0.62, Math.min(1, W / 1200))))

const shown = SPECIMENS.slice(0, COUNT)

root.innerHTML = `
  <div class="cloth"></div>
  <header>
    <div class="brand">
      <h1>${BRAND.ru}</h1>
      <span class="jp">${BRAND.jp}</span>
    </div>
    <div class="meta">
      <b>КАТАЛОГ ШТАММОВ</b>
      <span>${BRAND.gost}</span>
    </div>
  </header>

  <div class="grid">
    ${shown
      .map(
        (spec, i) => `
      <figure class="card" data-i="${i}">
        <div class="shot"><canvas></canvas></div>
        <figcaption>${spec.traits.map((k) => `<span>${TRAIT_NAMES[k]}</span>`).join('')}</figcaption>
      </figure>`,
      )
      .join('')}
  </div>

  <footer>
    <span class="big">30 ПРИЗНАКОВ · 3 МЕСТА · 4060 ШТАММОВ</span>
    <span class="tag">${BRAND.tagline}</span>
  </footer>`

/*
 * Всё, что меряет размеры, ждёт шрифтов.
 *
 * Подгонка до document.fonts.ready считает по запасному начертанию: шапка и
 * подписи там ниже, содержимое «влезает», а после подмены шрифта вылезает за
 * край. Ровно на этом однажды уже погорели шрифты в самой игре.
 */
void document.fonts.ready.then(() => {
  // Каждый образец рисуется настоящим кодом игры: банка, чай, гриб.
  for (const card of root.querySelectorAll<HTMLElement>('.card')) {
    const spec = shown[Number(card.dataset.i)]
    const lcd = new Lcd(card.querySelector('canvas')!, 'amber')
    lcd.clear()
    drawJar(lcd)
    drawTea(lcd, 1)
    drawScoby(lcd, {
      cx: 25,
      // Диск плавает у поверхности чая, как и в игре.
      top: 15,
      growth: spec.growth,
      mood: 'ok',
      mold: spec.mold,
      t: 0,
      floor: TEA_FLOOR,
      maxHalfWidth: JAR.teaW / 2,
      traits: spec.traits,
    })
  }

  /*
   * Подгонка — ПОСЛЕ того, как подписи заполнены, и только по загруженным
   * шрифтам. Оба порядка выстраданы: с пустыми подписями содержимое меряется
   * на полсотни пикселей ниже, а по запасному шрифту — ещё ниже, и в обоих
   * случаях второй ряд уезжает за кадр.
   *
   * Сама высота образца подбирается ужиманием, а не формулой: так её нельзя
   * посчитать неверно.
   */
  // Мерим корень целиком: складывать шапку, сетку и подвал значило бы забыть
  // про поля и внешние отступы — на восьми забытых пикселях подвал и уезжал.
  const fits = () => root.scrollHeight <= H
  let shotH = Math.floor(H / Math.ceil(COUNT / COLS))
  root.style.setProperty('--shot', `${shotH}px`)
  while (shotH > 60 && !fits()) {
    shotH -= 3
    root.style.setProperty('--shot', `${shotH}px`)
  }

  // Съёмщику: можно снимать.
  document.body.setAttribute('data-ready', '1')
})
