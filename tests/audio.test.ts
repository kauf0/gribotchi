/**
 * Синтез — обычная арифметика, поэтому проверяется в Node без WebAudio:
 * подсовываем контексту заглушку createBuffer и смотрим на числа.
 *
 * Отдельно сверяется сама партитура: ноты в reference/README.md выписаны
 * вручную, и опечатка в одной цифре испортила бы мелодию незаметно.
 */

import { describe, expect, it } from 'vitest'

import { renderNote, midiToHz, NoteBank } from '../src/audio/synth'
import { PHRASES, BASS_CYCLE, BEAT, BEATS_PER_BAR } from '../src/audio/score'

const fakeCtx = {
  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length)
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      duration: length / sampleRate,
      getChannelData: () => data,
    }
  },
} as unknown as BaseAudioContext

const rms = (data: Float32Array, from: number, to: number): number => {
  let sum = 0
  for (let i = from; i < to; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / (to - from))
}

/** Основной тон по автокорреляции: ищем период с наибольшим совпадением. */
const fundamental = (data: Float32Array, rate: number, from: number, to: number): number => {
  const seg = data.subarray(from, to)
  let bestLag = 1
  let best = -Infinity
  for (let lag = Math.floor(rate / 1600); lag < Math.floor(rate / 60); lag++) {
    let r = 0
    for (let i = 0; i + lag < seg.length; i++) r += seg[i] * seg[i + lag]
    if (r > best) {
      best = r
      bestLag = lag
    }
  }
  return rate / bestLag
}

describe('высота тона', () => {
  it('ля первой октавы — 440 Гц', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6)
  })

  it('октава — ровно вдвое', () => {
    expect(midiToHz(81) / midiToHz(69)).toBeCloseTo(2, 10)
  })
})

describe('голос прибора', () => {
  const buf = renderNote(fakeCtx, 69, 'melody')
  const data = buf.getChannelData(0)

  it('рендерится на 22.05 кГц, как оригинал', () => {
    // Коэффициент ФНЧ a = 0.35 задаёт срез относительно частоты дискретизации:
    // на 44.1 кГц тот же фильтр звучал бы заметно ярче.
    expect(buf.sampleRate).toBe(22050)
  })

  it('не выходит за пик 0.34 и не молчит', () => {
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v))
    expect(peak).toBeGreaterThan(0.05)
    expect(peak).toBeLessThanOrEqual(0.34)
  })

  it('в сигнале нет NaN', () => {
    expect(data.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('начинается с атаки, а не со щелчка', () => {
    // Первые миллисекунды тише, чем разгар ноты: 30 мс атаки.
    const sr = buf.sampleRate
    expect(rms(data, 0, Math.floor(sr * 0.005))).toBeLessThan(rms(data, Math.floor(sr * 0.04), Math.floor(sr * 0.08)))
  })

  it('спадает экспоненциально', () => {
    const sr = buf.sampleRate
    const early = rms(data, Math.floor(sr * 0.05), Math.floor(sr * 0.1))
    const late = rms(data, Math.floor(sr * 1.0), Math.floor(sr * 1.05))
    expect(late).toBeLessThan(early * 0.3)
  })

  it('нота действительно звучит на своей высоте', () => {
    const sr = buf.sampleRate
    // Мерим на сустейне, где атака уже кончилась, а спад ещё не съел сигнал.
    const hz = fundamental(data, sr, Math.floor(sr * 0.05), Math.floor(sr * 0.2))
    expect(hz).toBeGreaterThan(430)
    expect(hz).toBeLessThan(450)
  })

  it('бас звучит на две октавы ниже — как и записано в цикле', () => {
    const bass = renderNote(fakeCtx, 45, 'bass')
    const sr = bass.sampleRate
    const hz = fundamental(bass.getChannelData(0), sr, Math.floor(sr * 0.05), Math.floor(sr * 0.25))
    expect(hz).toBeGreaterThan(107)
    expect(hz).toBeLessThan(113)
  })

  it('бас звучит дольше мелодии', () => {
    const bass = renderNote(fakeCtx, 45, 'bass')
    expect(bass.duration).toBeGreaterThan(buf.duration)
  })

  it('одна и та же нота считается один раз', () => {
    const bank = new NoteBank(fakeCtx)
    expect(bank.get(69, 'melody')).toBe(bank.get(69, 'melody'))
    expect(bank.get(69, 'melody')).not.toBe(bank.get(69, 'bass'))
  })
})

describe('партитура', () => {
  // Ноты в reference/README.md выписаны вручную; опечатка в одной цифре
  // испортила бы мелодию незаметно, поэтому сверяем дословно.
  it('фразы совпадают со спецификацией', () => {
    expect(PHRASES.A).toEqual([69, 0, 72, 0, 76, 0, 74, 0, 72, 0, 71, 0, 69, 0, 0, 0])
    expect(PHRASES.B).toEqual([67, 0, 71, 0, 74, 0, 72, 0, 71, 0, 69, 0, 68, 0, 0, 0])
    expect(PHRASES.C).toEqual([69, 0, 72, 0, 76, 0, 79, 0, 77, 0, 76, 0, 74, 0, 0, 0])
    expect(PHRASES.D).toEqual([76, 0, 74, 0, 72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0])
    expect(PHRASES.CADENCE).toEqual([72, 0, 71, 0, 69, 0, 68, 0, 69, 0, 0, 0, 0, 0, 0, 0])
  })

  it('бас и доля совпадают со спецификацией', () => {
    expect(BASS_CYCLE).toEqual([45, 45, 40, 40, 43, 43, 40, 40, 45, 45, 38, 38, 43, 40])
    expect(BEAT).toBe(0.34)
    expect(BEATS_PER_BAR).toBe(4)
  })

  it('все фразы одной длины — иначе такты разъедутся', () => {
    for (const notes of Object.values(PHRASES)) expect(notes).toHaveLength(16)
  })

  it('мелодия держится в ля-миноре', () => {
    // Ля-минор натуральный плюс соль-диез: это повышенная седьмая ступень
    // гармонического минора, вводный тон к тонике — для вальса обязательный.
    // Чужими остаются до-диез, ре-диез, фа-диез и си-бемоль.
    const alien = [1, 3, 6, 10]
    const notes = Object.values(PHRASES).flat().filter(Boolean)
    expect(notes.filter((n) => alien.includes(n % 12))).toEqual([])
  })

  it('бас стоит на устоях лада', () => {
    // Тоника ля, субдоминанта ре, доминанта ми и нижняя ре — опора вальса.
    for (const note of BASS_CYCLE) expect([38, 40, 43, 45]).toContain(note)
  })
})
