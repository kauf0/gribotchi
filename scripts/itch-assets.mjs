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

import { spawn, spawnSync } from 'node:child_process'
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
    hideLeave: true,
    note: 'обложка 630×500',
  },
  {
    // Анимированная обложка: itch крутит GIF прямо в витрине, и живой прибор
    // там читается несравнимо лучше застывшего. Кадр берётся из игры, а не
    // из ролика: банка с грибом, пузырьки и мигающий диод зациклены сами по
    // себе, поэтому склейка не бросается в глаза.
    name: 'cover-animated',
    kind: 'gif',
    width: 630,
    height: 500,
    query: 't=4&food=.8&growth=.45&mood=happy&msg=ОБЪЕКТ ЖИВ. ПОКА ЧТО.&bubble=КОРМИ',
    wait: 3000,
    seconds: 4,
    fps: 12,
    hideLeave: true,
    note: 'анимированная обложка',
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
    name: 'wide-1-komnata',
    width: 960,
    height: 540,
    query: 't=4&food=.75&growth=.6&mood=happy&msg=ОБЪЕКТ РАСТЁТ.',
    wait: 2500,
    note: 'широкий кадр: прибор на столе',
  },
  {
    name: 'wide-2-final',
    width: 960,
    height: 540,
    query: 'attract=30.2',
    wait: 4000,
    hideLeave: true,
    note: 'широкий кадр: финальная плашка',
  },
  {
    name: 'screen-4-podacha',
    width: 560,
    height: 780,
    // Бланк подачи. Открытый параметром, он не закрывается сам через шесть
    // секунд — иначе снять его было бы нечем.
    query: 't=4&sim.food=.35&sim.growth=.45&open=pour',
    wait: 2500,
    note: 'бланк подачи: выбор сорта',
  },
  {
    name: 'screen-5-proisshestvie',
    width: 560,
    height: 780,
    // Какое именно происшествие — решает обстановка в банке, поэтому задаём
    // плесень: с ней прибор докладывает про мошку.
    query: 't=4&sim.mold=.6&sim.food=.4&sim.growth=.45&open=incident',
    wait: 2500,
    note: 'происшествие на возвращении',
  },
  {
    name: 'screen-6-svodka',
    width: 560,
    height: 780,
    query: 't=4&sim.food=.12&sim.mold=.55&sim.growth=.4&sim.resentment=.7&sim.generation=3&sim.journal=6&open=report',
    wait: 2500,
    note: 'сводка: журнал наблюдений',
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
      // Звук считается по вызовам WebAudio, а не на слух, поэтому выводить
      // его в динамики машины незачем — это просто мешает работать.
      '--mute-audio',
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
    // Панель отладки и предложение установки — служебные, в витрине им не место.
    // Предложение вдобавок было бы враньём: на странице itch игра стоит во
    // врезке, и устанавливать её оттуда браузер не даёт.
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.dbg')?.remove(); document.querySelector('.install')?.remove()`,
    })
    // На обложке кнопка «отойти по делам» лишняя: это орган управления,
    // а витрина показывает игру. В скриншотах она остаётся — там честно.
    if (shot.hideLeave) {
      await cdp.send('Runtime.evaluate', { expression: `document.querySelector('.leave')?.remove()` })
    }
    await sleep(400)

    if (shot.kind === 'gif') {
      await recordGif(cdp, shot)
    } else {
      const png = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const path = join(OUT, `${shot.name}.png`)
      writeFileSync(path, Buffer.from(png.data, 'base64'))
      console.log(`  ${path.padEnd(30)} ${shot.width}×${shot.height}  ${shot.note}`)
    }
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

/**
 * Снимает череду кадров и склеивает их в GIF.
 *
 * Игра анимируется по реальному времени, останавливать её снаружи нечем,
 * поэтому кадры берутся как получится, а задержка GIF считается по факту:
 * так ролик идёт с той же скоростью, что и игра, даже если съёмка шла рывками.
 */
async function recordGif(cdp, shot) {
  const frames = mkdtempSync(join(tmpdir(), 'gribochi-gif-'))
  const total = Math.round(shot.seconds * shot.fps)
  const started = Date.now()

  for (let i = 0; i < total; i++) {
    const png = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.png`), Buffer.from(png.data, 'base64'))
    const due = started + ((i + 1) * 1000) / shot.fps
    const left = due - Date.now()
    if (left > 0) await sleep(left)
  }

  // Сотые доли секунды на кадр — единица измерения GIF.
  const delay = Math.max(2, Math.round((Date.now() - started) / total / 10))
  const path = join(OUT, `${shot.name}.gif`)
  const out = spawnSync(
    'convert',
    [
      '-delay', String(delay),
      '-loop', '0',
      join(frames, 'f*.png'),
      // Без этого обложка весит под три мегабайта и витрина грузит её
      // мучительно долго. Палитра у игры и так узкая, поэтому 48 цветов
      // ничего не портят, а fuzz склеивает шум градиента в комнате.
      '-fuzz', '5%',
      '-layers', 'OptimizeTransparency',
      '-colors', '48',
      '-layers', 'Optimize',
      path,
    ],
    { encoding: 'utf8' },
  )
  rmSync(frames, { recursive: true, force: true })
  if (out.status !== 0) throw new Error(`convert не справился: ${out.stderr?.slice(0, 200)}`)

  const size = spawnSync('du', ['-h', path], { encoding: 'utf8' }).stdout.split('\t')[0]
  console.log(`  ${path.padEnd(30)} ${shot.width}×${shot.height}  ${shot.note}, ${total} кадров, ${size}`)
}

// Необязательный аргумент — снять только подходящие кадры: node … cover
const filter = process.argv[2]
const chosen = filter ? SHOTS.filter((s) => s.name.includes(filter)) : SHOTS
if (!chosen.length) throw new Error(`нет кадров с именем «${filter}»`)

mkdirSync(OUT, { recursive: true })
for (const shot of chosen) await shoot(shot)
console.log(`\nГотово. Описание страницы — ${OUT}/description.md`)
