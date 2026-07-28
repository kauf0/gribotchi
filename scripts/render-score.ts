/**
 * Сводит партитуру в WAV тем же синтезом, что играет в игре.
 *
 * Нужен, чтобы музыку можно было послушать и сравнить с эталонным
 * reference/kombucha-score.wav, не открывая браузер: юнит-тесты проверяют
 * арифметику, но не то, как это звучит.
 *
 *   npx vite-node scripts/render-score.ts [настроение] [тактов]
 *   → /tmp/gribochi-score.wav
 */

import { writeFileSync } from 'node:fs'

import { renderNote, type Voice } from '../src/audio/synth'
import { PHRASES, BASS_CYCLE, BEAT, BEATS_PER_BAR } from '../src/audio/score'

const RATE = 22050

const MOODS: Record<string, { order: string[]; transpose: number; tempo: number }> = {
  happy: { order: ['A', 'C', 'A', 'D'], transpose: 0, tempo: 1 },
  ok: { order: ['A', 'B', 'C', 'D'], transpose: 0, tempo: 1 },
  away: { order: ['B', 'D'], transpose: -12, tempo: 0.8 },
}

/** Контекст-заглушка: renderNote нужен только createBuffer. */
const ctx = {
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    return { length, sampleRate, getChannelData: () => data }
  },
} as unknown as BaseAudioContext

const cache = new Map<string, Float32Array>()
const note = (midi: number, voice: Voice): Float32Array => {
  const key = `${voice}:${midi}`
  let buf = cache.get(key)
  if (!buf) {
    buf = renderNote(ctx, midi, voice).getChannelData(0)
    cache.set(key, buf)
  }
  return buf
}

function main(): void {
  const moodName = process.argv[2] ?? 'ok'
  const bars = Number(process.argv[3] ?? 8)
  const mood = MOODS[moodName] ?? MOODS.ok

  const beatLen = BEAT / mood.tempo
  const totalBeats = bars * BEATS_PER_BAR
  // Хвост под последнюю ноту, чтобы её спад не обрезало.
  const frames = Math.ceil((totalBeats * beatLen + 4) * RATE)
  const mix = new Float32Array(frames)

  const add = (buf: Float32Array, atSec: number, gain: number): void => {
    const start = Math.floor(atSec * RATE)
    for (let i = 0; i < buf.length && start + i < frames; i++) mix[start + i] += buf[i] * gain
  }

  const phraseLen = PHRASES.A.length
  for (let beat = 0; beat < totalBeats; beat++) {
    const at = beat * beatLen
    const phraseIndex = Math.floor(beat / phraseLen)
    // Последняя фраза — каденция: заканчиваем на тонике, а не обрывом.
    const isLast = phraseIndex === Math.floor((totalBeats - 1) / phraseLen)
    const phrase = isLast ? PHRASES.CADENCE : PHRASES[mood.order[phraseIndex % mood.order.length]]

    const melody = phrase[beat % phraseLen]
    if (melody) add(note(melody + mood.transpose, 'melody'), at, 1)

    if (beat % BEATS_PER_BAR === 0) {
      const bar = Math.floor(beat / BEATS_PER_BAR) % BASS_CYCLE.length
      add(note(BASS_CYCLE[bar] + mood.transpose, 'bass'), at, 0.9)
    }
  }

  writeFileSync('/tmp/gribochi-score.wav', wav(mix, RATE))
  const peak = mix.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  console.log(`настроение ${moodName}, ${bars} тактов, пик ${peak.toFixed(3)}`)
  console.log('→ /tmp/gribochi-score.wav')
}

/** Моно 16 бит — ровно как эталонный файл. */
function wav(samples: Float32Array, rate: number): Buffer {
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
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // моно
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

main()
