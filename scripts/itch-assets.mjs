/**
 * Собирает материалы для страницы на itch.io: обложку и скриншоты.
 *
 * Через CDP с настоящим ожиданием, а не через scripts/shot.py. Разница
 * принципиальная: shot.py снимает с --virtual-time-budget и ловит кадр до того,
 * как подгрузятся веб-шрифты. Надписи на корпусе при этом рисуются запасным
 * начертанием, которое шире, и подпись «ИГРУШКА ЭЛЕКТРОННАЯ СИМБИОТИЧЕСКАЯ»
 * вылезает за прибор. Для отладки это неважно, для витрины — стыдно.
 *
 * Кадры берутся из самой игры, в том числе из аттракт-режима: финальная плашка
 * ролика уже нарисована и годится обложкой без единой правки.
 *
 *   npm run dev            (в соседнем окне)
 *   npm run itch:assets
 *   → itch/
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.GRIBOCHI_URL ?? 'http://127.0.0.1:5173/'
const PORT = 9511
const OUT = 'itch'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Что снимаем. Размеры разные не случайно: обложка itch — 630×500, а скриншоты
 * лучше брать в пропорции витрины, 560×780, ровно в том размере, в каком игра
 * будет стоять на странице.
 */
const SHOTS = [
  {
    name: 'cover',
    width: 630,
    height: 500,
    // Финальная плашка ролика: «ГРИБОЧИ / グリボッチ / ОН ТОЖЕ ВАС НЕ ЗАБУДЕТ».
    // Ролик продолжает идти и во время ожидания, поэтому стартуем раньше цели:
    // 30.2 + четыре секунды ожидания попадают в окно плашки (32.6…35 с),
    // а шрифтам этих же четырёх секунд хватает на загрузку.
    query: 'attract=30.2',
    wait: 4000,
    note: 'обложка 630×500',
  },
  {
    name: 'screen-1-zapusk',
    width: 560,
    height: 780,
    query: '',
    wait: 2500,
    note: 'экран запуска',
  },
  {
    name: 'screen-2-kormlenie',
    width: 560,
    height: 780,
    query: 'manual&day=3&food=1&growth=.30&mood=happy&sugar=1&hearts=.5&bubble=&msg=СЫТ. НО ЭТО НЕНАДОЛГО.',
    wait: 2000,
    note: 'кормление: сахар и сердечки',
  },
  {
    name: 'screen-3-obida',
    width: 560,
    height: 780,
    query:
      'manual&day=17&food=.05&growth=.26&mold=.8&mood=away&flies=1&scobyTop=18&bubble=ОН ВСЁ ПОМНИТ&msg=ОБЪЕКТ ОТВЕРНУЛСЯ. ОБЪЕКТ ЖДЁТ.',
    wait: 2000,
    note: 'обида: «ОН ВСЁ ПОМНИТ»',
  },
  {
    name: 'screen-4-svodka',
    width: 560,
    height: 780,
    query: 't=4&sim.food=.12&sim.mold=.55&sim.growth=.4&sim.resentment=.7&sim.generation=3&sim.journal=3&open=report',
    wait: 2500,
    note: 'сводка аварийной службы',
  },
]

const encode = (query) =>
  query
    .split('&')
    .filter(Boolean)
    .map((chunk) => {
      const i = chunk.indexOf('=')
      return i < 0 ? chunk : `${chunk.slice(0, i)}=${encodeURIComponent(chunk.slice(i + 1))}`
    })
    .join('&')

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    const slot = pending.get(m.id)
    if (!slot) return
    pending.delete(m.id)
    m.error ? slot.rej(new Error(m.error.message)) : slot.res(m.result)
  })
  return {
    send: (method, params = {}) =>
      new Promise((res, rej) => {
        const mid = ++id
        pending.set(mid, { res, rej })
        ws.send(JSON.stringify({ id: mid, method, params }))
      }),
    close: () => ws.close(),
  }
}

/** Ждём, пока шрифт корпуса реально применится, а не просто истечёт таймер. */
const FONTS_READY = `(async () => {
  await document.fonts.ready
  const box = document.querySelector('.subtitle')
  return !!box && box.scrollWidth <= box.clientWidth
})()`

async function shoot(shot) {
  const profile = mkdtempSync(join(tmpdir(), 'gribochi-asset-'))
  const url = `${URL}?${encode(shot.query)}`
  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${shot.width},${shot.height}`,
      url,
    ],
    { stdio: 'ignore' },
  )

  let cdp
  try {
    let target
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250)
      try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
        target = list.find((t) => t.type === 'page' && t.url.startsWith('http'))
      } catch {
        // порт ещё не слушает
      }
    }
    if (!target) throw new Error('вкладка не появилась — запущен ли `npm run dev`?')

    cdp = await connect(target.webSocketDebuggerUrl)
    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await sleep(shot.wait)

    const { result } = await cdp.send('Runtime.evaluate', {
      expression: FONTS_READY,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.value !== true) {
      console.log(`  ! ${shot.name}: подпись корпуса не помещается — шрифт не применился`)
    }

    // Снимаем с dev-сервера — только там работают параметры URL, которыми
    // выставляются нужные состояния. Панель отладки при этом лишняя: убираем
    // её из DOM, и кадр становится точь-в-точь как в собранной версии, где
    // панели нет вовсе.
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.dbg')?.remove()` })
    await sleep(400)

    const png = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const path = join(OUT, `${shot.name}.png`)
    writeFileSync(path, Buffer.from(png.data, 'base64'))
    console.log(`  ${path.padEnd(30)} ${shot.width}×${shot.height}  ${shot.note}`)
  } finally {
    cdp?.close()
    chrome.kill()
    await sleep(300)
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // мусор в /tmp не повод падать
    }
  }
}

// Необязательный аргумент — снять только подходящие кадры: node … cover
const filter = process.argv[2]
const chosen = filter ? SHOTS.filter((s) => s.name.includes(filter)) : SHOTS
if (!chosen.length) throw new Error(`нет кадров с именем «${filter}»`)

mkdirSync(OUT, { recursive: true })
for (const shot of chosen) await shoot(shot)
console.log(`\nГотово. Описание страницы — ${OUT}/description.md`)
