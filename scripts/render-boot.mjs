/**
 * Сводит звук включения в WAV, чтобы его можно было послушать и посмотреть
 * на форму волны, не открывая браузер.
 *
 * Заряд собран на узлах WebAudio, поэтому считает его настоящий браузер через
 * OfflineAudioContext — иначе пришлось бы дублировать фильтры и огибающие
 * вручную, и проверялась бы копия, а не то, что звучит в игре.
 *
 *   node --experimental-websocket scripts/render-boot.mjs
 *   → /tmp/gribochi-boot.wav
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL = process.env.GRIBOCHI_URL ?? 'http://127.0.0.1:5173/'
const PORT = 9466
const OUT = '/tmp/gribochi-boot.wav'
const SECONDS = 3.8
const RATE = 44100

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Прогоняем Sfx.charge() в offline-контексте и забираем сырые отсчёты.
 * Модуль тянем прямо со страницы: так рендерится ровно тот код, что в игре.
 */
const RENDER = `(async () => {
  const { Sfx } = await import('/src/audio/sfx.ts')
  const ctx = new OfflineAudioContext(1, ${Math.ceil(SECONDS * RATE)}, ${RATE})
  const out = ctx.createGain()
  out.gain.value = 0.55
  out.connect(ctx.destination)
  new Sfx(ctx, out).charge(3.0)
  const buf = await ctx.startRendering()
  return Array.from(buf.getChannelData(0))
})()`

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

function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    data.writeInt16LE(Math.round(v * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const profile = mkdtempSync(join(tmpdir(), 'gribochi-boot-'))
const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    URL,
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
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
    expression: RENDER,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.text)

  const samples = result.value
  writeFileSync(OUT, wav(samples, RATE))

  // Короткая сводка: где пик и как громкость идёт по времени.
  const chunk = Math.floor(samples.length / 12)
  const bars = []
  for (let i = 0; i < 12; i++) {
    let peak = 0
    for (let j = i * chunk; j < (i + 1) * chunk; j++) peak = Math.max(peak, Math.abs(samples[j]))
    bars.push(peak)
  }
  const peak = Math.max(...bars)
  console.log(`пик ${peak.toFixed(3)}${peak >= 1 ? '  ← ПЕРЕГРУЗ' : ''}`)
  console.log('громкость по времени:')
  for (const [i, v] of bars.entries()) {
    const at = ((i * SECONDS) / 12).toFixed(2)
    console.log(`  ${at}с ${'█'.repeat(Math.round(v * 40)).padEnd(40, '·')} ${v.toFixed(3)}`)
  }
  console.log(`\n→ ${OUT}`)
} finally {
  cdp?.close()
  chrome.kill()
  await sleep(400)
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // мусор в /tmp не повод падать
  }
}
