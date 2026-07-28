/**
 * Голос прибора. Синтез ровно по рецепту из reference/README.md: синус плюс
 * тихие 3-я и 5-я гармоники, атака 30 мс, экспоненциальный спад, двойной
 * однополюсный ФНЧ.
 *
 * Почему синтез, а не готовый kombucha-score.wav: файл весит 1.5 МБ на 36
 * секунд и в игре, куда заходят на полминуты, зациклится до отвращения за день.
 * Ноты же лежат прямо в спецификации, и из них бесплатно получается
 * адаптивность — темп и регистр ведут себя по настроению гриба.
 *
 * Буферы рендерятся на 22.05 кГц, как и оригинал: коэффициент ФНЧ a = 0.35
 * задаёт срез относительно частоты дискретизации, и на 44.1 кГц тот же
 * коэффициент звучал бы заметно ярче. Браузер пересемплирует при
 * воспроизведении сам.
 */

export type Voice = 'melody' | 'bass'

const RENDER_RATE = 22050
const ATTACK = 0.03
const PEAK = 0.34
const LPF_A = 0.35
const DECAY: Record<Voice, number> = { melody: 0.68, bass: 0.95 }

/** Множитель частоты и амплитуда. Третья и пятая — «тихие». */
const HARMONICS: [number, number][] = [
  [1, 1],
  [3, 0.15],
  [5, 0.07],
]
const HARMONIC_SUM = HARMONICS.reduce((a, [, amp]) => a + amp, 0)

export const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12)

/** Рендерит одну ноту в буфер. Дорого, поэтому результат кешируется. */
export function renderNote(ctx: BaseAudioContext, midi: number, voice: Voice): AudioBuffer {
  const decay = DECAY[voice]
  // Хвост обрубаем там, где экспонента уже неслышна.
  const duration = ATTACK + decay * 4
  const length = Math.ceil(duration * RENDER_RATE)
  const buffer = ctx.createBuffer(1, length, RENDER_RATE)
  const data = buffer.getChannelData(0)
  const hz = midiToHz(midi)

  let lp1 = 0
  let lp2 = 0
  for (let i = 0; i < length; i++) {
    const t = i / RENDER_RATE
    const env = t < ATTACK ? t / ATTACK : Math.exp(-(t - ATTACK) / decay)

    let raw = 0
    for (const [mult, amp] of HARMONICS) raw += Math.sin(2 * Math.PI * hz * mult * t) * amp

    const s = (raw / HARMONIC_SUM) * env * PEAK
    lp1 += LPF_A * (s - lp1)
    lp2 += LPF_A * (lp1 - lp2)
    data[i] = lp2
  }
  return buffer
}

/** Кеш нот: партитура ходит по полутора десяткам высот, считать их заново незачем. */
export class NoteBank {
  private cache = new Map<string, AudioBuffer>()

  constructor(private readonly ctx: BaseAudioContext) {}

  get(midi: number, voice: Voice): AudioBuffer {
    const key = `${voice}:${midi}`
    let buf = this.cache.get(key)
    if (!buf) {
      buf = renderNote(this.ctx, midi, voice)
      this.cache.set(key, buf)
    }
    return buf
  }
}
