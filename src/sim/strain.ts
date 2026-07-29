/**
 * Код штамма: восемь знаков, которые можно отдать другому человеку.
 *
 * Три признака из тридцати — это 4060 сочетаний, и у каждого должно быть
 * удостоверение: назвать в чате, сравнить, ввести руками. Отсюда требования
 * к кодировке, и все три нетривиальные.
 *
 *  1. КАНОНИЧНОСТЬ. Один и тот же набор обязан давать один и тот же код,
 *     иначе номер перестанет быть удостоверением: два игрока с одинаковыми
 *     грибами назвали бы разные номера. Поэтому признаки сортируются перед
 *     упаковкой, а не пишутся в порядке получения.
 *
 *  2. ЧИТАЕМОСТЬ РУКАМИ. Алфавит — Crockford base32: без I, L, O и U, которые
 *     путают с единицей, нулём и друг с другом. При разборе, наоборот,
 *     принимаем и путаницу, и строчные буквы: человек, переписавший код
 *     с чужого экрана, не должен получить отказ из-за формы буквы.
 *
 *  3. ОТКАЗ ВМЕСТО МУСОРА. Опечатка обязана быть отвергнута, а не превращена
 *     в штамм, которого не бывает. За это отвечает контрольная сумма.
 *
 * Разметка выровнена по границе знаков — 8 знаков по 5 бит, из них шесть
 * полезных и два под сумму. Без выравнивания сумма расползлась бы по знакам,
 * и часть её пришлось бы отбросить: именно так первая версия пропускала
 * каждую сороковую опечатку.
 *
 *     признаки    15  (три по 5, отсортированы) ┐
 *     поколение    7  (обрезается до 127)       ├ 30 бит = 6 знаков
 *     скрещиваний  3  (обрезается до 7)         │
 *     версия       5                            ┘
 *     сумма       10                              = 2 знака
 *
 * Сумма взвешенная: вклад знака умножается на его номер. При десяти битах
 * это ловит ЛЮБУЮ ошибку в одном знаке — сдвиг не превышает 186 и потому
 * не может дать ноль по модулю 1024. Проверяется перебором в тестах.
 */

import { TRAIT_KEYS, TRAIT_SLOTS, type TraitKey } from './traits'

/** Алфавит Crockford: без I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 8

/** Формат кода. Меняется, только когда старые коды становится не разобрать. */
export const STRAIN_FORMAT = 1

export type Strain = {
  traits: TraitKey[]
  generation: number
  crossings: number
}

/** При вводе руками эти знаки означают то же, что и похожие на них. */
const CONFUSED: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' }

const clampInt = (v: number, max: number): number =>
  Math.max(0, Math.min(max, Math.floor(Number.isFinite(v) ? v : 0)))

/** Полезных знаков шесть, на сумму отведены два. */
const PAYLOAD_WORDS = 6
const SUM_BITS = 10

/**
 * Взвешенная сумма: вклад знака умножен на его номер. Ошибка в одном знаке
 * меняет её на d·(i+1), где |d| ≤ 31 и i+1 ≤ 6, то есть не больше 186 —
 * по модулю 1024 это никогда не ноль. Значит любая опечатка в один знак
 * будет отвергнута, а не превращена в чужой штамм.
 */
function checksum(words: number[]): number {
  let sum = 0
  words.forEach((w, i) => {
    sum += w * (i + 1)
  })
  return sum % (1 << SUM_BITS)
}

export function encodeStrain(strain: Strain): string {
  // Каноничность: сортируем по индексу в таблице, а не по порядку получения.
  const ids = strain.traits
    .map((k) => TRAIT_KEYS.indexOf(k))
    .filter((i) => i >= 0)
    .sort((x, y) => x - y)
    .slice(0, TRAIT_SLOTS)
  // Пустые места — 31: такого признака нет, значит гриб ещё без него.
  while (ids.length < TRAIT_SLOTS) ids.push(31)

  let bits = 0n
  for (const id of ids) bits = (bits << 5n) | BigInt(id)
  bits = (bits << 7n) | BigInt(clampInt(strain.generation, 127))
  bits = (bits << 3n) | BigInt(clampInt(strain.crossings, 7))
  bits = (bits << 5n) | BigInt(STRAIN_FORMAT)

  const payload: number[] = []
  for (let i = PAYLOAD_WORDS - 1; i >= 0; i--) payload.push(Number((bits >> BigInt(i * 5)) & 31n))

  const sum = checksum(payload)
  const words = [...payload, (sum >> 5) & 31, sum & 31]
  return words.map((w) => ALPHABET[w]).join('')
}

/** Разбор. null означает «это не наш код» — и опечатка, и чужой формат. */
export function decodeStrain(code: unknown): Strain | null {
  if (typeof code !== 'string') return null

  const cleaned = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .split('')
    .map((c) => CONFUSED[c] ?? c)
    .join('')
  if (cleaned.length !== CODE_LENGTH) return null

  const words: number[] = []
  for (const c of cleaned) {
    const w = ALPHABET.indexOf(c)
    if (w < 0) return null
    words.push(w)
  }

  const payload = words.slice(0, PAYLOAD_WORDS)
  if (checksum(payload) !== ((words[6] << 5) | words[7])) return null

  let bits = 0n
  for (const w of payload) bits = (bits << 5n) | BigInt(w)

  const format = Number(bits & 31n)
  if (format !== STRAIN_FORMAT) return null
  bits >>= 5n
  const crossings = Number(bits & 7n)
  bits >>= 3n
  const generation = Number(bits & 127n)
  bits >>= 7n

  const traits: TraitKey[] = []
  for (let i = 0; i < TRAIT_SLOTS; i++) {
    const id = Number((bits >> BigInt((TRAIT_SLOTS - 1 - i) * 5)) & 31n)
    if (id === 31) continue
    const key = TRAIT_KEYS[id]
    // Признак из будущей версии игры: код формально наш, но разобрать нечем.
    if (!key) return null
    traits.push(key)
  }
  // Повтор означает битый код: набор — это множество, а не список.
  if (new Set(traits).size !== traits.length) return null

  return { traits, generation, crossings }
}

/** Код в том виде, в каком его показывают: 7K3M-9QXA. */
export const prettyCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`
