/**
 * Служебные звуки прибора: щелчки кнопок, сирена тревоги, похоронный удар
 * и заряд конденсатора при включении. Мелочь — короткая и квадратная:
 * динамик у игрушки один и маленький. Заряд, наоборот, собран из слоёв —
 * это единственный звук, который длится секундами и должен расти.
 */

export class Sfx {
  constructor(
    private readonly ctx: AudioContext,
    private readonly out: GainNode,
  ) {}

  /** Короткий тон. type square даёт ту самую пищалку из корпуса. */
  private blip(hz: number, duration: number, gain: number, at = 0, type: OscillatorType = 'square'): void {
    const t = this.ctx.currentTime + at
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(hz, t)
    // Мгновенная атака и быстрый спад: щелчок, а не нота.
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(g).connect(this.out)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  click(): void {
    this.blip(880, 0.05, 0.12)
  }

  /** Отказ: две низкие ноты вниз — «нет». */
  reject(): void {
    this.blip(320, 0.07, 0.12)
    this.blip(240, 0.09, 0.12, 0.08)
  }

  /**
   * Включение: заряд высоковольтного конденсатора и пробой в конце.
   *
   * Собран из четырёх слоёв, потому что дуга — это не тон, а процесс:
   * щелчок тумблера, ползущий вверх вой обмотки, гул сети на 50 Гц (та самая
   * розетка по ту сторону железного занавеса) и рваный треск разрядов, который
   * учащается по мере накопления заряда. В конце — пробой: яркий выброс шума
   * и низкий удар. Разряд приходится ровно на тот кадр, где загрузка
   * заканчивается и экран оживает.
   */
  charge(seconds: number): void {
    const t0 = this.ctx.currentTime
    // seconds — время до пробоя, а не общая длина: разряд должен попасть
    // ровно в тот кадр, где экран оживает, а гул ещё немного дотягивает.
    const strike = t0 + seconds
    const peak = strike + 0.45

    this.blip(140, 0.06, 0.16, 0, 'square') // щелчок тумблера

    // Вой обмотки. Пила ползёт вверх, и следом за ней едет срез фильтра —
    // звук становится не просто выше, а ярче, как настоящий разгон.
    const whine = this.ctx.createOscillator()
    whine.type = 'sawtooth'
    whine.frequency.setValueAtTime(55, t0)
    whine.frequency.exponentialRampToValueAtTime(1750, strike)

    const whineFilter = this.ctx.createBiquadFilter()
    whineFilter.type = 'lowpass'
    whineFilter.Q.value = 7
    whineFilter.frequency.setValueAtTime(240, t0)
    whineFilter.frequency.exponentialRampToValueAtTime(5200, strike)

    const whineGain = this.ctx.createGain()
    whineGain.gain.setValueAtTime(0.0001, t0)
    whineGain.gain.exponentialRampToValueAtTime(0.06, t0 + seconds * 0.55)
    whineGain.gain.exponentialRampToValueAtTime(0.13, strike)
    whineGain.gain.exponentialRampToValueAtTime(0.0001, strike + 0.12)

    whine.connect(whineFilter).connect(whineGain).connect(this.out)
    whine.start(t0)
    whine.stop(strike + 0.2)

    // Гул сети: 50 Гц с гармониками, нарастающий вместе с нагрузкой.
    const hum = this.ctx.createOscillator()
    hum.type = 'sawtooth'
    hum.frequency.setValueAtTime(50, t0)
    const humFilter = this.ctx.createBiquadFilter()
    humFilter.type = 'lowpass'
    humFilter.frequency.value = 320
    const humGain = this.ctx.createGain()
    humGain.gain.setValueAtTime(0.0001, t0)
    humGain.gain.exponentialRampToValueAtTime(0.07, strike)
    humGain.gain.exponentialRampToValueAtTime(0.0001, peak)
    hum.connect(humFilter).connect(humGain).connect(this.out)
    hum.start(t0)
    hum.stop(peak + 0.05)

    // Треск дуги: шум с рваной огибающей, всё чаще к концу заряда.
    const arc = this.ctx.createBufferSource()
    arc.buffer = this.arcBuffer(seconds + 0.1)
    const arcFilter = this.ctx.createBiquadFilter()
    arcFilter.type = 'bandpass'
    arcFilter.frequency.value = 2600
    arcFilter.Q.value = 0.8
    const arcGain = this.ctx.createGain()
    arcGain.gain.setValueAtTime(0.05, t0)
    arcGain.gain.linearRampToValueAtTime(0.3, strike)
    arc.connect(arcFilter).connect(arcGain).connect(this.out)
    arc.start(t0)

    this.discharge(strike)
  }

  /** Пробой: яркий выброс шума и низкий удар под ним. */
  private discharge(at: number): void {
    const crack = this.ctx.createBufferSource()
    crack.buffer = this.noise(0.4, (i, n) => Math.pow(1 - i / n, 3))
    const crackFilter = this.ctx.createBiquadFilter()
    crackFilter.type = 'highpass'
    crackFilter.frequency.value = 900
    const crackGain = this.ctx.createGain()
    crackGain.gain.value = 0.5
    crack.connect(crackFilter).connect(crackGain).connect(this.out)
    crack.start(at)

    const thump = this.ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(90, at)
    thump.frequency.exponentialRampToValueAtTime(38, at + 0.35)
    const thumpGain = this.ctx.createGain()
    thumpGain.gain.setValueAtTime(0.28, at)
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4)
    thump.connect(thumpGain).connect(this.out)
    thump.start(at)
    thump.stop(at + 0.45)
  }

  /** Шум с заданной огибающей. */
  private noise(seconds: number, envelope: (i: number, n: number) => number): AudioBuffer {
    const n = Math.ceil(this.ctx.sampleRate * seconds)
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * envelope(i, n)
    return buf
  }

  /**
   * Дуга: разряды вспыхивают редко и гаснут за миллисекунды, отсюда рваная
   * огибающая. Вероятность вспышки растёт к концу — заряд копится.
   */
  private arcBuffer(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate
    const n = Math.ceil(rate * seconds)
    const buf = this.ctx.createBuffer(1, n, rate)
    const data = buf.getChannelData(0)
    const decay = Math.exp(-1 / (rate * 0.012))
    let spark = 0
    for (let i = 0; i < n; i++) {
      const progress = i / n
      if (Math.random() < 0.0004 + progress * 0.004) spark = 1
      spark *= decay
      data[i] = (Math.random() * 2 - 1) * spark * spark
    }
    return buf
  }

  /** Сытость восстановлена. */
  chirp(): void {
    this.blip(988, 0.07, 0.12)
    this.blip(1319, 0.12, 0.12, 0.07)
  }

  /** Смена среды: шелест вместо тона. */
  wash(): void {
    const t = this.ctx.currentTime
    const seconds = 1.2
    const frames = Math.ceil(this.ctx.sampleRate * seconds)
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < frames; i++) {
      // Розоватый шум с затуханием — струя чая, а не белый шип.
      const white = Math.random() * 2 - 1
      last = last * 0.92 + white * 0.08
      data[i] = last * 3 * (1 - i / frames)
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = 0.25
    src.connect(g).connect(this.out)
    src.start(t)
  }

  /** Объект в беде. Диод в это время мигает вдвое чаще. */
  alarm(): void {
    this.blip(1046, 0.1, 0.16)
    this.blip(784, 0.14, 0.16, 0.14)
  }

  /** Объект прекратил существование. */
  knell(): void {
    this.blip(196, 0.5, 0.18, 0, 'triangle')
    this.blip(147, 0.9, 0.18, 0.35, 'triangle')
  }
}
