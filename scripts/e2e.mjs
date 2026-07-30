/**
 * Живой прогон игры в настоящем браузере: нажатия, реакция симуляции,
 * переживает ли сохранение перезагрузку вкладки.
 *
 * Юнит-тесты проверяют симуляцию, но не проводку: что кнопка вообще доходит
 * до feed(), что состояние ложится в localStorage и поднимается обратно.
 * Здесь это и проверяется — через CDP, без сторонних зависимостей.
 *
 * Запуск (нужен работающий `npm run dev`):
 *   node --experimental-websocket scripts/e2e.mjs
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.GRIBOCHI_URL ?? 'http://127.0.0.1:5173/'
const PORT = 9333
const SHOT = '/tmp/gribochi-shots/e2e-after-feed.png'
const MUTED_SHOT = '/tmp/gribochi-shots/e2e-muted.png'
const RETURN_SHOT = '/tmp/gribochi-shots/e2e-return.png'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })

  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    const slot = pending.get(msg.id)
    if (!slot) return
    pending.delete(msg.id)
    msg.error ? slot.rej(new Error(msg.error.message)) : slot.res(msg.result)
  })

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id
      pending.set(mid, { res, rej })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })

  return { send, close: () => ws.close() }
}

/** Выполняет выражение на странице и возвращает готовое значение. */
async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'ошибка на странице')
  return result.value
}

/** О реакции симуляции судим по сохранению — оно и есть её наблюдаемый выход. */
const READ_SAVE = `JSON.parse(localStorage.getItem('gribochi.save.v1') ?? 'null')`

/** Нажать кнопку ускорения времени в панели отладки. */
const pick = (m) => `[...document.querySelectorAll('.dbg button')].find(b => b.textContent === '×${m}').click()`

/**
 * Отпечаток ЖК: экран сжимается в сетку 25×20 средних яркостей. Средней
 * яркости всего кадра не хватает — фон у всех экранов одинаковый, — а сетка
 * ловит именно смену структуры: банка сменилась строками бланка.
 */
const LCD_FINGERPRINT = `(() => {
  const c = document.querySelector('canvas')
  const W = c.width, H = c.height, GX = 25, GY = 20
  const d = c.getContext('2d').getImageData(0, 0, W, H).data
  const cw = W / GX, ch = H / GY
  const out = []
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let sum = 0, n = 0
      for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y++) {
        for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x++) {
          sum += d[(y * W + x) * 4]
          n++
        }
      }
      out.push(sum / n)
    }
  }
  return out
})()`

/** Доля заметно изменившихся клеток отпечатка. */
const diffRatio = (a, b) => a.filter((v, i) => Math.abs(v - b[i]) > 12).length / a.length

/**
 * Счётчики звука. Услышать headless-браузер нельзя, но можно посчитать, что
 * игра реально ставит в очередь WebAudio: буферы — это ноты партитуры,
 * осцилляторы — служебные писки.
 */
const AUDIO_PROBE = `(() => {
  window.__notes = 0
  window.__noise = 0
  window.__oscs = 0
  const bufStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a) {
    // Ноты партитуры рендерятся на 22.05 кГц, как оригинальный wav, а треск
    // дуги и шелест чая — на частоте контекста. По ней их и различаем: иначе
    // разряд при загрузке считался бы музыкой.
    if (this.buffer && this.buffer.sampleRate === 22050) window.__notes++
    else window.__noise++
    return bufStart.apply(this, a)
  }
  const oscStart = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) {
    window.__oscs++
    return oscStart.apply(this, a)
  }
  return true
})()`

/**
 * Настоящий щелчок мимо прибора, по «комнате».
 *
 * Именно так и надо будить звук: событие, созданное из JS, не считается
 * пользовательской активацией, и AudioContext на него не отзовётся. Input.*
 * в CDP порождает доверенные события, поэтому проверка идёт по той же
 * политике автовоспроизведения, что и у живого игрока, — без послаблений
 * командной строки.
 */
async function realClick(cdp, x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
}

/**
 * Применились ли шрифты корпуса.
 *
 * Ловит поломку, которую видно только из подкаталога: если в fonts.css пути
 * к файлам абсолютные, то на itch (игра лежит в /html/<id>/) они уходят в 404,
 * всё рисуется системным шрифтом, а он шире — подписи вылезают за корпус
 * и обрезаются. Сравниваем ширину текста с шириной его коробки.
 */
const SHELL_FONT_FITS = `(async () => {
  await document.fonts.ready
  const boxes = ['.subtitle', '.plate']
  const bad = boxes.filter((sel) => {
    const el = document.querySelector(sel)
    return !el || el.scrollWidth > el.clientWidth
  })
  return { bad, ok: bad.length === 0 }
})()`

/**
 * Предложение установки помещается в экран и никого не задевает. Проверяется
 * на телефоне: там оно длиннее всего (подсказка для iOS) и места меньше всего.
 */
const INSTALL_FITS = `(async () => {
  await document.fonts.ready
  const el = document.querySelector('.install')
  if (!el || el.classList.contains('is-hidden')) return { ok: false, why: 'предложение не показано' }
  const r = el.getBoundingClientRect()
  const leave = document.querySelector('.leave').getBoundingClientRect()
  return {
    ok: r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth && r.bottom < leave.top,
    text: el.textContent,
    box: Math.round(r.width) + '×' + Math.round(r.height) + ' в ' + innerWidth,
    cut: el.scrollWidth > el.clientWidth,
  }
})()`

/** Центр кнопки прибора в координатах окна — прибор масштабируется под вьюпорт. */
async function centerOf(cdp, index) {
  const p = await evaluate(
    cdp,
    `(() => {
      const r = document.querySelectorAll('.btn')[${index}].getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`,
  )
  return [p.x, p.y]
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'gribochi-e2e-'))
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
      '--window-size=1100,1360',
      URL,
    ],
    { stdio: 'ignore' },
  )

  let cdp
  try {
    // Ждём, пока браузер поднимет отладочный порт и отдаст вкладку.
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

    // Счётчики звука ставим ДО загрузки страницы и перезагружаемся: игра
    // пробует зазвучать сразу при старте, и патч, наложенный позже, пропустил
    // бы и писк включения, и первые ноты.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: AUDIO_PROBE })
    await cdp.send('Page.reload')

    // Заставка длится три секунды, потом прибор сохраняет состояние.
    await sleep(4500)

    const before = await evaluate(cdp, READ_SAVE)
    check('состояние сохраняется в localStorage', before !== null)
    check('новая игра начинается с первого дня', before?.generation === 1 && before?.growth <= 0.1)

    const buttons = await evaluate(cdp, `document.querySelectorAll('.btn').length`)
    check('на корпусе три кнопки', buttons === 3, `найдено ${buttons}`)

    const fonts = await evaluate(cdp, SHELL_FONT_FITS)
    check(
      'надписи на корпусе помещаются — значит шрифт загрузился',
      fonts.ok,
      fonts.ok ? '' : `не помещается: ${fonts.bad.join(', ')}`,
    )

    // Игра не начинается сама: на экране запуска ждут нажатия. Пока его нет,
    // кнопки ухода за грибом ничего не делают.
    const onStart = await evaluate(cdp, LCD_FINGERPRINT)
    check('до запуска музыка молчит', (await evaluate(cdp, `window.__notes`)) === 0)
    await evaluate(cdp, `document.querySelectorAll('.btn')[0].click()`)
    await sleep(400)
    check(
      'на экране запуска ЧАЙ не кормит',
      (await evaluate(cdp, READ_SAVE)).food === before.food,
    )

    // Нажатие СОС включает прибор. Щёлкаем по-настоящему: событие, созданное
    // из JS, не даёт пользовательской активации, и звук бы не поднялся.
    await realClick(cdp, ...(await centerOf(cdp, 2)))

    // Середина загрузки: играет заряд конденсатора, а вальс ещё молчит —
    // иначе они наложились бы друг на друга кашей.
    await sleep(1500)
    const midBoot = await evaluate(
      cdp,
      `({ notes: window.__notes, noise: window.__noise, oscs: window.__oscs })`,
    )
    check(
      'во время загрузки звучит заряд',
      midBoot.oscs >= 3 && midBoot.noise > 0,
      `тонов ${midBoot.oscs}, шумов ${midBoot.noise}`,
    )
    check('во время загрузки тема молчит', midBoot.notes === 0, `нот ${midBoot.notes}`)

    await sleep(2800)
    const started = diffRatio(onStart, await evaluate(cdp, LCD_FINGERPRINT))
    check('СОС запускает игру', started > 0.2, `изменилось ${(started * 100).toFixed(0)}% экрана`)

    const afterUnlock = await evaluate(cdp, `({ notes: window.__notes, oscs: window.__oscs })`)
    check('после загрузки вступает тема', afterUnlock.notes > 3, `нот в очереди ${afterUnlock.notes}`)

    // ЧАЙ открывает бланк подачи: сорт заварки выбирается каждый раз, и три
    // кнопки прибора на время становятся тремя сортами.
    const onGameBeforePour = await evaluate(cdp, LCD_FINGERPRINT)
    await evaluate(cdp, `document.querySelectorAll('.btn')[0].click()`)
    await sleep(400)
    const onPour = await evaluate(cdp, LCD_FINGERPRINT)
    const pourOpened = diffRatio(onGameBeforePour, onPour)
    check('ЧАЙ открывает бланк подачи', pourOpened > 0.2, `изменилось ${(pourOpened * 100).toFixed(0)}% экрана`)
    check(
      'открытый бланк ещё не кормит — сорт не выбран',
      (await evaluate(cdp, READ_SAVE)).food === before.food,
    )

    // Отмены у бланка нет: не выбрали сорт — он закроется сам, и подача
    // не состоится. Ждём дольше самих шести секунд.
    await sleep(7000)
    const pourClosed = diffRatio(onGameBeforePour, await evaluate(cdp, LCD_FINGERPRINT))
    check('бланк закрывается сам', pourClosed < 0.1, `отличие от игры ${(pourClosed * 100).toFixed(0)}%`)
    check(
      'закрывшийся сам бланк не кормит',
      (await evaluate(cdp, READ_SAVE)).food === before.food,
    )

    // Второй заход — теперь с выбором. На бланке МЫТЬ означает зелёный сорт,
    // а не смену среды.
    await evaluate(cdp, `document.querySelectorAll('.btn')[0].click()`)
    await sleep(400)
    await evaluate(cdp, `document.querySelectorAll('.btn')[1].click()`)
    await sleep(400)
    const afterFeed = await evaluate(cdp, READ_SAVE)
    check(
      'выбранный сорт поднимает сытость',
      afterFeed.food > before.food,
      `${before.food.toFixed(2)} → ${afterFeed.food.toFixed(2)}`,
    )
    check(
      'подан именно зелёный, и он записан в счётчик',
      afterFeed.poured?.green === 1 && afterFeed.poured?.black === 0,
      `счётчик ${JSON.stringify(afterFeed.poured)}`,
    )
    // Сравниваем с самим бланком, а не с игрой: после подачи на экране сыплется
    // сахар и меняется лицо, так что до игры «как было» кадр уже не совпадёт.
    const leftPour = diffRatio(onPour, await evaluate(cdp, LCD_FINGERPRINT))
    check('после выбора бланк закрывается', leftPour > 0.2, `отличие от бланка ${(leftPour * 100).toFixed(0)}%`)
    const oscsAfterFeed = await evaluate(cdp, `window.__oscs`)
    check(
      'кормление отзывается звуком',
      oscsAfterFeed > afterUnlock.oscs,
      `${afterUnlock.oscs} → ${oscsAfterFeed}`,
    )

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(SHOT, Buffer.from(shot.data, 'base64'))

    // МЫТЬ
    await evaluate(cdp, `document.querySelectorAll('.btn')[1].click()`)
    await sleep(400)
    const afterClean = await evaluate(cdp, READ_SAVE)
    check(
      'МЫТЬ забирает часть питания — смена среды не бесплатна',
      afterClean.food < afterFeed.food,
      `${afterFeed.food.toFixed(2)} → ${afterClean.food.toFixed(2)}`,
    )

    // СОС открывает сводку. Читать текст с канваса незачем — достаточно того,
    // что средняя яркость ЖК резко меняется: бланк со строками светлее банки.
    // Промывка длится три секунды и намеренно глушит ввод («НЕ МЕШАЙТЕ») —
    // дожидаемся её конца, иначе следующее нажатие просто не дойдёт.
    await sleep(3200)
    const onGame = await evaluate(cdp, LCD_FINGERPRINT)
    await evaluate(cdp, `document.querySelectorAll('.btn')[2].click()`)
    await sleep(600)
    const onReport = await evaluate(cdp, LCD_FINGERPRINT)
    const opened = diffRatio(onGame, onReport)
    check('СОС открывает сводку', opened > 0.2, `изменилось ${(opened * 100).toFixed(0)}% экрана`)
    check('СОС не меняет состояние объекта', (await evaluate(cdp, READ_SAVE)).food === afterClean.food)

    // СОС проходит цикл: сводка → штамм → банка. Отдельного входа в штамм
    // на трёх кнопках взять неоткуда, поэтому выход стал на нажатие длиннее.
    await evaluate(cdp, `document.querySelectorAll('.btn')[2].click()`)
    await sleep(600)
    const onStrainBlank = await evaluate(cdp, LCD_FINGERPRINT)
    check(
      'со сводки СОС ведёт на штамм',
      diffRatio(onReport, onStrainBlank) > 0.1,
      `изменилось ${(diffRatio(onReport, onStrainBlank) * 100).toFixed(0)}%`,
    )
    await evaluate(cdp, `document.querySelectorAll('.btn')[2].click()`)
    await sleep(600)
    const back = diffRatio(onGame, await evaluate(cdp, LCD_FINGERPRINT))
    check('третий СОС возвращает к банке', back < 0.1, `отличие от исходного ${(back * 100).toFixed(0)}%`)

    // «Отойти по делам»: прибор гаснет, а время идёт дальше — на этом стоит
    // вся игра, и кнопка не должна оказаться паузой.
    const beforeLeave = await evaluate(cdp, READ_SAVE)
    const playing = await evaluate(cdp, LCD_FINGERPRINT)
    await evaluate(cdp, `document.querySelector('.leave').click()`)
    await sleep(700)
    const parked = diffRatio(playing, await evaluate(cdp, LCD_FINGERPRINT))
    check('«отойти по делам» гасит прибор', parked > 0.2, `изменилось ${(parked * 100).toFixed(0)}% экрана`)

    const notesParked = await evaluate(cdp, `window.__notes`)
    await sleep(1200)
    check('после ухода музыка молчит', (await evaluate(cdp, `window.__notes`)) === notesParked)

    // Симуляция при этом продолжает жить. Увидеть это за секунды можно только
    // ускорителем: шаг симуляции — реальная минута, и без разгона возраст
    // за время прогона просто не сдвинется. В собранной версии панели нет,
    // поэтому там проверка честно пропускается.
    if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
      console.log('  ––   ход времени с погашенным прибором: пропущено (нужен ускоритель из панели)')
    } else {
      const speed = (m) =>
        `[...document.querySelectorAll('.dbg button')].find((b) => b.textContent === '×${m}').click()`
      await evaluate(cdp, speed(600))
      await sleep(3000)
      await evaluate(cdp, speed(1))
      const afterLeave = await evaluate(cdp, READ_SAVE)
      check(
        'время идёт и с погашенным прибором — это не пауза',
        afterLeave.ageMs > beforeLeave.ageMs,
        `${Math.round(beforeLeave.ageMs / 60000)} → ${Math.round(afterLeave.ageMs / 60000)} игровых минут`,
      )
    }

    // И включается обратно тем же СОС.
    await realClick(cdp, ...(await centerOf(cdp, 2)))
    await sleep(3800)
    const resumed = diffRatio(playing, await evaluate(cdp, LCD_FINGERPRINT))
    check('прибор включается обратно', resumed < 0.25, `отличие от прежнего ${(resumed * 100).toFixed(0)}%`)

    // Динамик работает переключателем звука; настройка должна пережить сеанс.
    // Всё, что опирается на счётчики звука, обязано стоять ДО перезагрузки:
    // она сбрасывает и счётчики, и подмену прототипов.
    await evaluate(cdp, `document.querySelector('.speaker').click()`)
    await sleep(300)
    check(
      'нажатие на динамик отключает звук и запоминает это',
      (await evaluate(cdp, `localStorage.getItem('gribochi.sound')`)) === 'off',
    )
    check(
      'решётка динамика гаснет вместе со звуком',
      await evaluate(cdp, `document.querySelector('.speaker').classList.contains('is-muted')`),
    )
    check(
      'значок динамика показывает, что звук выключен',
      await evaluate(cdp, `document.querySelector('.sound').classList.contains('is-muted')`),
    )
    const muted = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(MUTED_SHOT, Buffer.from(muted.data, 'base64'))

    // Кнопка со значком — та же самая функция, что и решётка.
    const notesWhileMuted = await evaluate(cdp, `window.__notes`)
    await sleep(1200)
    check(
      'выключенный звук перестаёт ставить ноты в очередь',
      (await evaluate(cdp, `window.__notes`)) === notesWhileMuted,
    )

    await evaluate(cdp, `document.querySelector('.sound').click()`)
    await sleep(2500)
    check(
      'кнопка со значком возвращает звук',
      (await evaluate(cdp, `localStorage.getItem('gribochi.sound')`)) === 'on',
    )
    // Секвенсер останавливается при выключении, и без явного перезапуска
    // музыка после включения обратно молчала бы навсегда.
    check(
      'музыка возобновляется после включения',
      (await evaluate(cdp, `window.__notes`)) > notesWhileMuted,
      `${notesWhileMuted} → ${await evaluate(cdp, `window.__notes`)}`,
    )

    // Перезагрузка вкладки
    await cdp.send('Page.reload')
    await sleep(5000)
    const reloaded = await evaluate(cdp, READ_SAVE)
    check(
      'сохранение переживает перезагрузку',
      reloaded !== null && reloaded.bornAt === before.bornAt,
      `поколение ${reloaded?.generation}, день рождения совпал: ${reloaded?.bornAt === before.bornAt}`,
    )
    // Экран запуска вернувшегося владельца: с днём и поколением.
    const returning = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(RETURN_SHOT, Buffer.from(returning.data, 'base64'))

    // После перезагрузки прибор снова выключен: без повторного пуска все
    // нажатия уходили бы на включение, а не на уход за грибом.
    await realClick(cdp, ...(await centerOf(cdp, 2)))
    await sleep(3800)

    // Отладочная панель живёт только в dev-сборке.
    const hasPanel = await evaluate(cdp, `!!document.querySelector('.dbg')`)
    if (!hasPanel) {
      console.log('  ––   отладочная панель: пропущено (её нет в сборке)')
    } else {
      const manualOn = `document.querySelectorAll('.dbg input[type=checkbox]')[0].checked`
      // [0] — «ручной режим», дальше «тревога» и «мошки».
      await evaluate(cdp, `document.querySelectorAll('.dbg input[type=checkbox]')[2].click()`)
      await sleep(300)
      check('флажок в панели включает ручной режим', await evaluate(cdp, manualOn))

      await evaluate(cdp, `document.querySelectorAll('.dbg input[type=text]')[0].value = 'ПРОВЕРКА'
        document.querySelectorAll('.dbg input[type=text]')[0].dispatchEvent(new Event('input'))`)
      await sleep(300)
      check('текстовое поле тоже включает ручной режим', await evaluate(cdp, manualOn))

      // Ускорение имеет смысл только для живой симуляции, поэтому само гасит
      // ручной режим — иначе кажется, что время стоит.
      const savedBefore = await evaluate(cdp, READ_SAVE)
      await evaluate(cdp, pick(600))
      await sleep(300)
      check('ускорение времени выключает ручной режим', !(await evaluate(cdp, manualOn)))

      await sleep(4000)
      const savedAfter = await evaluate(cdp, READ_SAVE)
      const gameSeconds = (savedAfter.lastTick - savedBefore.lastTick) / 1000
      check(
        'при ×600 время идёт в шестьсот раз быстрее',
        gameSeconds > 1500,
        `${Math.round(gameSeconds)} с игрового за ~4 с реального`,
      )
      check('ускоренное время расходует сытость', savedAfter.food < savedBefore.food)

      // Кормление при ×600 пишет lastFedAt в будущее. После перезагрузки часы
      // возвращаются к настоящим, и без подрезки прибор твердил бы «не чаще
      // раза в 15 мин», пока реальное время не догонит.
      await evaluate(cdp, `document.querySelectorAll('.btn')[0].click()`)
      await sleep(500)
      await evaluate(cdp, `document.querySelectorAll('.btn')[0].click()`)
      await sleep(500)
      await evaluate(cdp, pick(1))
      await cdp.send('Page.reload')
      await sleep(4500)
      await realClick(cdp, ...(await centerOf(cdp, 2)))
      await sleep(3800)
      const staleFeed = await evaluate(cdp, READ_SAVE)
      // Возраст — величина симуляции, а не разница настенных часов. Если бы
      // день считался от bornAt, после перезагрузки он падал бы в единицу при
      // живых сытости и плесени.
      check(
        'прожитое время переживает перезагрузку',
        staleFeed.ageMs > savedBefore.ageMs + 1000,
        `${Math.round(savedBefore.ageMs / 60000)} → ${Math.round(staleFeed.ageMs / 60000)} игровых минут`,
      )
      // ЧАЙ открывает бланк, сорт выбирается на нём: подача — два нажатия.
      await realClick(cdp, ...(await centerOf(cdp, 0)))
      await sleep(600)
      await realClick(cdp, ...(await centerOf(cdp, 0)))
      await sleep(600)
      const freshFeed = await evaluate(cdp, READ_SAVE)
      check(
        'после ускорения и перезагрузки кормить снова можно',
        freshFeed.food > staleFeed.food,
        `${staleFeed.food.toFixed(2)} → ${freshFeed.food.toFixed(2)}`,
      )

      // Стирание: страница перезагружается, а по дороге срабатывает pagehide,
      // и без приостановки записи он вернул бы стёртое состояние обратно.
      const bornBefore = (await evaluate(cdp, READ_SAVE)).bornAt
      await evaluate(
        cdp,
        `[...document.querySelectorAll('.dbg button')]
          .find((b) => b.textContent === 'стереть сохранение').click()`,
      )
      await sleep(5000)
      const afterWipe = await evaluate(cdp, READ_SAVE)
      check(
        'кнопка стирания и правда начинает новую жизнь',
        !afterWipe || afterWipe.bornAt !== bornBefore,
        afterWipe ? `bornAt ${bornBefore} → ${afterWipe.bornAt}` : 'сохранения нет',
      )
    }

    // Журнал наблюдений. Прибор обещает, что помнит не только про гриб, —
    // проверяем самый показательный случай: объект отвернулся, и это попало
    // в журнал само, без единого нажатия.
    if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
      console.log('  ––   журнал наблюдений: пропущено (сидирование только в разработке)')
    } else {
      // Голодный объект с обидой у самого порога: при ×600 он переступит его
      // за пару секунд, а умирать будет ещё минуту — успеваем.
      await cdp.send('Page.navigate', { url: `${URL}?sim.food=.05&sim.resentment=.58` })
      await sleep(1500)
      await realClick(cdp, ...(await centerOf(cdp, 2)))
      await sleep(3800)

      const beforeWatch = await evaluate(cdp, READ_SAVE)
      check(
        'до перехода журнал пуст — прибор не пишет о том, чего не было',
        (beforeWatch.journal ?? []).length === 0,
        `записей ${(beforeWatch.journal ?? []).length}`,
      )

      await evaluate(cdp, pick(600))
      await sleep(4000)
      const watched = await evaluate(cdp, READ_SAVE)
      const kinds = (watched.journal ?? []).map((e) => e.kind)
      check(
        'прибор сам записал, что объект отвернулся',
        kinds.includes('turned-away'),
        `записи: ${kinds.join(', ') || 'нет'}`,
      )
      check(
        'запись легла в сохранение по существу, а не готовой строкой',
        (watched.journal ?? []).every((e) => typeof e.kind === 'string' && e.text === undefined),
      )

      // Веха не должна дублироваться: это уже не новость.
      await sleep(3000)
      const later = (await evaluate(cdp, READ_SAVE)).journal ?? []
      check(
        'веха не повторяется',
        later.filter((e) => e.kind === 'turned-away').length === 1,
        `повторов ${later.filter((e) => e.kind === 'turned-away').length}`,
      )
    }

    // Происшествие на возвращении. Отлучку подделываем прямо в сохранении:
    // ждать семь часов в тесте невозможно, а это ровно тот случай, ради
    // которого происшествия и заведены.
    {
      await cdp.send('Page.navigate', { url: URL })
      await sleep(1200)
      await evaluate(
        cdp,
        `(() => {
          const now = Date.now()
          const day = 3 * 60 * 60 * 1000
          const away = 7 * 3600 * 1000
          localStorage.setItem('gribochi.save.v1', JSON.stringify({
            version: 1,
            bornAt: now - 20 * day,
            ageMs: 20 * day,
            lastTick: now - away,
            generation: 2,
            food: 1, growth: 0.4, mold: 0.5, resentment: 0.1,
            alive: true, deathAt: null, deathDay: null,
            lastFedAt: now - away,
            lastCleanedAt: now - away,
            fedAtAge: 19 * day, stressUntil: 0, resentFactor: 1,
            poured: { black: 2, green: 0, ginger: 0 },
            longestAwayMs: 0, lastIncidentAt: 0, journal: [],
          }))
          // Замораживаем запись: при перезагрузке игра сохраняется по pagehide
          // и затёрла бы подделку своим состоянием.
          localStorage.setItem = () => {}
        })()`,
      )
      await cdp.send('Page.reload')
      await sleep(1500)
      await realClick(cdp, ...(await centerOf(cdp, 2)))
      await sleep(4200)

      const onIncident = await evaluate(cdp, LCD_FINGERPRINT)
      const beforeAnswer = await evaluate(cdp, READ_SAVE)
      check(
        'подделанная отлучка догналась: обстановка запущенная',
        beforeAnswer.mold > 0.45 && beforeAnswer.alive,
        `плесень ${beforeAnswer.mold.toFixed(2)}, жив ${beforeAnswer.alive}`,
      )

      // МЫТЬ на бланке — «сменить среду»: дорого и до конца. Решающая проверка
      // не в цифрах (обычное МЫТЬ тоже снимает плесень), а в записи журнала.
      await realClick(cdp, ...(await centerOf(cdp, 1)))
      await sleep(900)
      const answered = await evaluate(cdp, READ_SAVE)
      const entry = (answered.journal ?? []).find((e) => e.kind === 'incident')
      check(
        'прибор доложил о происшествии и запомнил решение владельца',
        !!entry && entry.incident === 'flies' && entry.answer === 1,
        entry ? `${entry.incident} / ответ ${entry.answer}` : `записи нет: ${JSON.stringify(answered.journal)}`,
      )
      check(
        'ответ разбирается с происшествием',
        answered.mold < beforeAnswer.mold - 0.2,
        `плесень ${beforeAnswer.mold.toFixed(2)} → ${answered.mold.toFixed(2)}`,
      )
      // На сохранении с историей прибор сразу после ответа закрепляет
      // несколько признаков и может открыть выбраковку — тоже бланк. Поэтому
      // проверяем, что происшествие ушло, а не что на экране непременно банка.
      const afterAnswer = diffRatio(onIncident, await evaluate(cdp, LCD_FINGERPRINT))
      check(
        'после ответа происшествие уходит с экрана',
        afterAnswer > 0.05,
        `изменилось ${(afterAnswer * 100).toFixed(0)}% экрана`,
      )
    }

    // Ролик по простою. В игре ждать минуту, здесь — три секунды:
    // параметр ?idle укорачивает порог и живёт только в разработке. Без него
    // это поведение оставалось единственным непроверенным в игре.
    if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
      console.log('  ––   ролик по простою: пропущено (параметр ?idle только в разработке)')
    } else {
      const caption = `(() => {
        const c = document.querySelector('.caption')
        return { text: c.textContent, shown: +getComputedStyle(c).opacity > 0.05 }
      })()`
      const playing = async () => (await evaluate(cdp, caption)).shown

      await cdp.send('Page.navigate', { url: `${URL}?idle=3` })
      await sleep(1500)
      check('сразу после загрузки ролик не идёт', !(await playing()))

      // Прибор ещё не включён: игрок к игре не приступил, и ролик ему незачем.
      await sleep(4500)
      check('на экране запуска ролик не запускается', !(await playing()))

      // Включаем — теперь простой считается по-настоящему.
      await realClick(cdp, ...(await centerOf(cdp, 2)))
      await sleep(3800)
      await sleep(4000)
      const running = await evaluate(cdp, caption)
      check(
        'в работающей игре простой запускает ролик',
        running.shown && running.text.length > 0,
        running.text,
      )

      // Любое касание обрывает ролик и возвращает прибор к делу.
      await realClick(cdp, 20, 20)
      await sleep(600)
      check('касание обрывает ролик', !(await playing()))

      // После осознанного ухода — тоже незачем: игрок не завис, он ушёл.
      await evaluate(cdp, `document.querySelector('.leave').click()`)
      await sleep(5000)
      check('после «отойти по делам» ролик не запускается', !(await playing()))
    }

    const errors = await evaluate(cdp, `(window.__errors ?? []).length`)
    check('на странице нет накопленных ошибок', errors === 0 || errors === undefined)

    // Штамм: признаки закрепляются сами, выбраковка требует решения, а код
    // ходит через буфер. Всё это — главное в выпуске, и проверяется живьём.
    if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
      console.log('  ––   штамм: пропущено (сидирование только в разработке)')
    } else {
      // Чистое сохранение: возраст из прошлых прогонов закрепил бы лишние
      // признаки, и проверка стала бы гадательной.
      await cdp.send('Page.navigate', { url: URL })
      await sleep(1000)
      await evaluate(cdp, `localStorage.clear()`)

      // Три признака сразу и объект на пороге четвёртого: доросший до предела
      // молодой гриб заработает СКОРОСПЕЛОГО и упрётся в нехватку мест.
      await cdp.send('Page.navigate', {
        url: `${URL}?traits=wiry,healing,devoted&sim.growth=1&sim.food=.9`,
      })
      await sleep(1500)
      await realClick(cdp, ...(await centerOf(cdp, 2)))
      await sleep(4200)

      const onCull = await evaluate(cdp, LCD_FINGERPRINT)
      const beforeCull = await evaluate(cdp, READ_SAVE)
      check(
        'признак закрепился сам и потребовал выбраковки',
        (beforeCull.traits ?? []).length === 3,
        `признаки: ${(beforeCull.traits ?? []).join(', ') || 'нет'}`,
      )

      // ЧАЙ исключает первый признак и ставит на его место новый.
      await realClick(cdp, ...(await centerOf(cdp, 0)))
      await sleep(900)
      const afterCull = await evaluate(cdp, READ_SAVE)
      check(
        'выбраковка меняет признак, а не добавляет четвёртый',
        (afterCull.traits ?? []).length === 3 && !afterCull.traits.includes('wiry'),
        `признаки: ${(afterCull.traits ?? []).join(', ')}`,
      )

      // Отказ должен запоминаться: без этого бланк открывался бы вечно.
      await sleep(1200)
      const looping = await evaluate(cdp, LCD_FINGERPRINT)
      if (diffRatio(onCull, looping) < 0.1) {
        await realClick(cdp, ...(await centerOf(cdp, 2)))
        await sleep(900)
      }
      const settled = await evaluate(cdp, READ_SAVE)
      await sleep(1500)
      check(
        'отказ от признака запоминается — бланк не открывается вечно',
        (await evaluate(cdp, READ_SAVE)).traits.join() === settled.traits.join(),
        `признаки: ${settled.traits.join(', ')}, отказов ${(settled.declined ?? []).length}`,
      )

      // Дальше — бланк штамма. Открываем его параметром, а не проходом по СОС:
      // у доросшего объекта СОС означает розлив, и путь зависел бы от того,
      // каким гриб оказался к этому моменту.
      await cdp.send('Page.navigate', {
        url: `${URL}?t=4&traits=wiry,healing,devoted&sim.growth=.5&open=strain`,
      })
      await sleep(2000)

      // Настоящего буфера в headless нет, а проверять чужой браузер и не наше
      // дело: подменяем сам вызов и смотрим, что игра в него передала. Всё,
      // что принадлежит нам, при этом проверено — код собран из признаков
      // объекта и отдан в буфер.
      await evaluate(
        cdp,
        `(() => {
          window.__copied = null
          navigator.clipboard.writeText = async (text) => { window.__copied = text }
        })()`,
      )
      const onStrainScreen = await evaluate(cdp, LCD_FINGERPRINT)

      await realClick(cdp, ...(await centerOf(cdp, 0)))
      await sleep(900)
      const copied = await evaluate(cdp, `window.__copied`)
      check(
        'ЧАЙ отдаёт в буфер восьмизначный код штамма',
        typeof copied === 'string' && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(copied),
        `отдано: «${copied}»`,
      )

      // Свой же код принимать незачем: скрещивать не с кем.
      await realClick(cdp, ...(await centerOf(cdp, 1)))
      await sleep(900)
      check(
        'вставка своего кода отвергается — скрещивать не с кем',
        (await evaluate(cdp, READ_SAVE)).offered === null,
      )
      check(
        'бланк штамма при этом остаётся открытым',
        diffRatio(onStrainScreen, await evaluate(cdp, LCD_FINGERPRINT)) < 0.2,
      )

      // А ЧУЖАЯ закваска ссылкой принимается и ложится на хранение. Код
      // заведомо не свой: ТУЧНЫЙ, БУЙНЫЙ, НОЧНОЙ — ни одного общего признака.
      const FOREIGN = '09C0G14C'
      await cdp.send('Page.navigate', { url: `${URL}?shtamm=${FOREIGN}` })
      await sleep(1800)
      const shared = await evaluate(cdp, READ_SAVE)
      check(
        'чужая закваска ссылкой ложится на хранение',
        shared?.offered === FOREIGN,
        `на хранении: ${shared?.offered}`,
      )
    }

    // Паспорт изделия. Проверяем и то, ради чего он затеян (открывается,
    // читается, закрывается), и главное правило игры — время под ним идёт.
    {
      await cdp.send('Page.navigate', { url: `${URL}?t=4` })
      await sleep(1800)

      const onGame = await evaluate(cdp, LCD_FINGERPRINT)
      await evaluate(cdp, `document.querySelector('.pasport').click()`)
      await sleep(900)

      const manual = await evaluate(
        cdp,
        `(() => {
          const sheet = document.querySelector('.manual__sheet')
          if (!sheet) return { open: false }
          const imgs = [...sheet.querySelectorAll('.m-shot img')]
          return {
            open: true,
            sections: sheet.querySelectorAll('.m-section').length,
            traits: sheet.querySelectorAll('.m-trait').length,
            figures: imgs.length,
            drawn: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
            // Горизонтальной прокрутки быть не должно ни на одном разделе.
            overflows: sheet.scrollWidth > sheet.clientWidth + 1,
            opaque: getComputedStyle(document.querySelector('.manual')).opacity,
          }
        })()`,
      )
      check('кнопка ПАСПОРТ открывает руководство', manual.open)
      check(
        'в руководстве есть разделы и все тридцать признаков',
        manual.sections >= 10 && manual.traits === 30,
        `разделов ${manual.sections}, признаков ${manual.traits}`,
      )
      check(
        'все иллюстрации нарисованы игрой и загрузились',
        manual.figures > 30 && manual.drawn === manual.figures,
        `${manual.drawn} из ${manual.figures}`,
      )
      check('брошюра непрозрачна', manual.opaque === '1', `прозрачность ${manual.opaque}`)
      check('текст не уезжает вбок', !manual.overflows)

      // Время под паспортом НЕ останавливается — на этом стоит вся игра.
      // Увидеть это за секунды можно только ускорителем: шаг симуляции —
      // реальная минута. В собранной версии панели нет, и проверка честно
      // пропускается, а не жмёт несуществующую кнопку.
      if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
        console.log('  ––   ход времени под паспортом: пропущено (нужен ускоритель из панели)')
      } else {
        const beforeRead = await evaluate(cdp, READ_SAVE)
        await evaluate(cdp, pick(600))
        await sleep(4000)
        const afterRead = await evaluate(cdp, READ_SAVE)
        check(
          'под открытым паспортом время идёт',
          afterRead.ageMs > beforeRead.ageMs + 1000,
          `${Math.round(beforeRead.ageMs / 60000)} → ${Math.round(afterRead.ageMs / 60000)} игровых минут`,
        )
        await evaluate(cdp, pick(1))
      }

      // Esc закрывает, игра возвращается на место.
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await sleep(600)
      check(
        'Esc закрывает паспорт',
        !(await evaluate(cdp, `!!document.querySelector('.manual')`)),
      )
      const back = diffRatio(onGame, await evaluate(cdp, LCD_FINGERPRINT))
      check('после паспорта игра на месте', back < 0.25, `отличие ${(back * 100).toFixed(0)}%`)

      // Щелчок мимо брошюры — тоже выход.
      await evaluate(cdp, `document.querySelector('.pasport').click()`)
      await sleep(700)
      await evaluate(cdp, `document.querySelector('.manual').click()`)
      await sleep(500)
      check(
        'щелчок мимо брошюры закрывает её',
        !(await evaluate(cdp, `!!document.querySelector('.manual')`)),
      )
    }

    // Предложение установки. В разработке его можно вызвать параметром —
    // beforeinstallprompt в headless-браузере не приходит, а проверить, что
    // надпись помещается в телефон, надо.
    if (!(await evaluate(cdp, `!!document.querySelector('.dbg')`))) {
      console.log('  ––   предложение установки: пропущено (параметр ?install только в разработке)')
    } else {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 360,
        height: 780,
        deviceScaleFactor: 2,
        mobile: true,
      })
      for (const [mode, what] of [
        ['prompt', 'кнопка установки'],
        ['ios', 'подсказка для iOS'],
      ]) {
        await cdp.send('Page.navigate', { url: `${URL}?t=4&install=${mode}` })
        await sleep(1800)
        const fit = await evaluate(cdp, INSTALL_FITS)
        check(
          `${what} помещается в экран телефона`,
          fit.ok,
          fit.why || `${fit.box}${fit.cut ? ', обрезано' : ''} — «${fit.text}»`,
        )
      }
      await cdp.send('Emulation.clearDeviceMetricsOverride')
    }

    // Установка как приложения. Игра выложена в двух местах одной сборкой:
    // врезкой на itch и отдельной страницей на GitHub Pages, где её ставят
    // на устройство. Проверяем то, без чего браузер не считает страницу
    // устанавливаемой, — и делаем это на собранной версии, поданной ИЗ
    // ПОДПАПКИ, как на Pages: абсолютный путь там отвалится молча.
    const manifest = await evaluate(
      cdp,
      `(async () => {
        const link = document.querySelector('link[rel=manifest]')
        if (!link) return { ok: false, why: 'нет ссылки на манифест' }
        const res = await fetch(link.href)
        if (!res.ok) return { ok: false, why: 'манифест не отдался: ' + res.status }
        const m = await res.json()
        const icons = await Promise.all(
          m.icons.map(async (i) => {
            const url = new URL(i.src, link.href)
            const r = await fetch(url)
            return { src: i.src, ok: r.ok }
          }),
        )
        return {
          ok: true,
          display: m.display,
          orientation: m.orientation,
          maskable: m.icons.some((i) => i.purpose === 'maskable'),
          sizes: m.icons.map((i) => i.sizes),
          missing: icons.filter((i) => !i.ok).map((i) => i.src),
          href: link.href,
        }
      })()`,
    )
    check('манифест отдаётся из подпапки', manifest.ok, manifest.why || manifest.href)
    if (manifest.ok) {
      check(
        'все иконки манифеста на месте',
        manifest.missing.length === 0,
        manifest.missing.length ? `не отдались: ${manifest.missing.join(', ')}` : manifest.sizes.join(', '),
      )
      check('есть maskable-иконка — иначе Android срежет углы', manifest.maskable)
      check(
        'прибор открывается вертикально и во весь экран',
        manifest.orientation === 'portrait' && manifest.display === 'fullscreen',
        `${manifest.display} / ${manifest.orientation}`,
      )
    }

    // Офлайн. Service worker регистрируется только в собранной версии, поэтому
    // на dev-сервере проверка честно пропускается, а не выдаёт ложное «ok».
    const controlled = await evaluate(
      cdp,
      `navigator.serviceWorker ? !!navigator.serviceWorker.controller : false`,
    )
    if (!controlled) {
      console.log('  ––   офлайн-запуск: пропущено (service worker живёт только в сборке)')
    } else {
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      })
      await cdp.send('Page.reload')
      await sleep(5000)
      const alive = await evaluate(
        cdp,
        `!!document.querySelector('canvas') && document.querySelectorAll('.btn').length`,
      )
      check('игра открывается без сети', alive === 3, `кнопок найдено ${alive}`)
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    }

    console.log(`\nснимок после кормления: ${SHOT}`)
  } finally {
    cdp?.close()
    chrome.kill()
    // Браузер ещё дописывает профиль — даём ему закрыться, а мусор в /tmp
    // не повод ронять прогон.
    await sleep(500)
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // не страшно
    }
  }

  if (failures) {
    console.error(`\n${failures} проверок не прошло`)
    process.exit(1)
  }
  console.log('\nвсе проверки пройдены')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
