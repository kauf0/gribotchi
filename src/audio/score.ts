/**
 * Партитура и секвенсер. Ноты, доля и басовый цикл — из reference/README.md:
 * восьмибитный вальс в ля-миноре, доля 0.34 с, фразы по 16 долей.
 *
 * Адаптивность — то, чего готовый wav дать не мог: набор фраз, регистр и темп
 * выбираются по настроению объекта. Довольный гриб получает светлые фразы,
 * обиженный — минорные октавой ниже и медленнее, а в тревоге музыка просто
 * замолкает, оставляя писк.
 */

import type { Mood } from '../view/screenState'
import { NoteBank } from './synth'

/** Фразы мелодии по 16 долей. Ноль — пауза. */
export const PHRASES: Record<string, number[]> = {
  A: [69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0, 69, 0, 0, 0],
  B: [67, 0, 71, 0, 74, 0, 72, 0, 71, 0, 69, 0, 68, 0, 0, 0],
  C: [69, 0, 72, 0, 76, 0, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0],
  D: [76, 0, 74, 0, 72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0],
  /** Каденция: заканчивается на тонике, чтобы цикл не обрывался на полуслове. */
  CADENCE: [72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0, 0, 0, 0, 0],
}

/** Бас — одна нота на такт из четырёх долей. */
export const BASS_CYCLE = [45, 45, 40, 40, 43, 43, 40, 40, 45, 45, 38, 38, 43, 40]

export const BEAT = 0.34
export const BEATS_PER_BAR = 4

/** Какие фразы и в каком виде играть при данном настроении. */
type Colour = { order: string[]; transpose: number; tempo: number; gain: number }

const COLOURS: Record<Mood, Colour> = {
  happy: { order: ['A', 'C', 'A', 'D'], transpose: 0, tempo: 1, gain: 1 },
  ok: { order: ['A', 'B', 'C', 'D'], transpose: 0, tempo: 1, gain: 0.9 },
  sad: { order: ['B', 'D'], transpose: -12, tempo: 0.85, gain: 0.8 },
  angry: { order: ['B', 'D'], transpose: -12, tempo: 0.9, gain: 0.8 },
  away: { order: ['B', 'D'], transpose: -12, tempo: 0.8, gain: 0.7 },
  dead: { order: ['D'], transpose: -24, tempo: 0.7, gain: 0.6 },
}

const SCHEDULE_EVERY_MS = 25
const LOOKAHEAD_S = 0.25

export class Music {
  private timer: number | null = null
  private nextBeatAt = 0
  private beat = 0
  private mood: Mood = 'ok'
  private silent = false

  constructor(
    private readonly ctx: AudioContext,
    private readonly bank: NoteBank,
    private readonly out: GainNode,
  ) {}

  /** Тревога глушит музыку: прибору в этот момент не до вальса. */
  setMood(mood: Mood, alarm: boolean): void {
    this.mood = mood
    this.silent = alarm
  }

  start(): void {
    if (this.timer !== null) return
    this.nextBeatAt = this.ctx.currentTime + 0.1
    this.timer = window.setInterval(() => this.schedule(), SCHEDULE_EVERY_MS)
  }

  stop(): void {
    if (this.timer === null) return
    window.clearInterval(this.timer)
    this.timer = null
  }

  private schedule(): void {
    const colour = COLOURS[this.mood]
    const beatLen = BEAT / colour.tempo
    const now = this.ctx.currentTime

    // Свёрнутую вкладку браузер душит до одного setInterval в секунду, и
    // очередь отстаёт от звуковых часов. Досылать накопленное нельзя — все
    // просроченные ноты выстрелили бы разом при возвращении. Просто
    // перескакиваем в настоящее, потеряв такт.
    if (this.nextBeatAt < now) this.nextBeatAt = now + 0.05

    while (this.nextBeatAt < now + LOOKAHEAD_S) {
      if (!this.silent) this.emit(this.beat, colour)
      this.nextBeatAt += beatLen
      this.beat++
    }
  }

  private emit(beat: number, colour: Colour): void {
    const phraseLen = PHRASES.A.length
    // Каденция замыкает каждый круг фраз — иначе петля звучит бесконечным
    // вопросом без ответа.
    const cycle = [...colour.order, 'CADENCE']
    const phrase = PHRASES[cycle[Math.floor(beat / phraseLen) % cycle.length]]
    const note = phrase[beat % phraseLen]
    if (note) this.play(note + colour.transpose, 'melody', colour.gain)

    // Бас вступает на первую долю каждого такта.
    if (beat % BEATS_PER_BAR === 0) {
      const bar = Math.floor(beat / BEATS_PER_BAR) % BASS_CYCLE.length
      this.play(BASS_CYCLE[bar] + colour.transpose, 'bass', colour.gain * 0.9)
    }
  }

  private play(midi: number, voice: 'melody' | 'bass', gain: number): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.bank.get(midi, voice)
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.out)
    src.start(this.nextBeatAt)
  }
}
