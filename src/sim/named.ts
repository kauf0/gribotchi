/**
 * Именованные штаммы: двадцать четыре тройки, у которых есть имя.
 *
 * Смысл не в награде — именованный штамм ничем не сильнее безымянного, —
 * а в том, что к нему можно ИДТИ. «Выведите какую-нибудь тройку из 4060» —
 * не цель; «АПТЕЧНЫЙ = целебный, стерильный, преданный» читается как
 * «поите имбирём, держите в чистоте, не обижайте» — и это уже задание.
 *
 * Поэтому в таблицу берутся только описуемые стили ухода. Случайных троек
 * здесь нет: если сочетание невозможно объяснить одной фразой, ему не место
 * в реестре.
 *
 * Четыре имени намеренно НЕДОСТИЖИМЫ в одиночку: они содержат два признака
 * одной семьи, а своими руками признаки семей не смешиваются. Такие берутся
 * только пересадкой чужой закваски — они и есть живое доказательство, зачем
 * нужен обмен. Пометка graftOnly не пишется руками, а СЧИТАЕТСЯ по семьям:
 * поправят таблицу признаков — пометка поедет сама и врать не начнёт.
 *
 * ВСЁ, что берётся из таблицы признаков, вычисляется ЛЕНИВО. Таблица смотрит
 * сюда в ответ — задание на селекцию поднимает нужные признаки в очереди, —
 * и модули ссылаются друг на друга. Круг безопасен ровно до тех пор, пока
 * в теле этого файла при загрузке ничего из traits.ts не вычисляется:
 * к первому вызову обе таблицы готовы. Здесь уже стояло TABLE.map(по семьям),
 * и три набора тестов падали с «Cannot read properties of undefined».
 */

import { TRAITS, type TraitKey } from './traits'
import { strainKey } from './strain'

export type NamedStrain = {
  /** Ключ для строк и реестра. */
  key: string
  traits: readonly [TraitKey, TraitKey, TraitKey]
  /** Два признака одной семьи: своими руками не собрать, только обменом. */
  graftOnly: boolean
}

/**
 * Тройки. Порядок внутри тройки — тот, в каком имя читается вслух; для
 * сравнения он не важен, ключ всё равно сортирует.
 */
const TABLE: [string, [TraitKey, TraitKey, TraitKey]][] = [
  // Уход, который можно описать одной фразой
  ['pharmacy', ['healing', 'sterile', 'devoted']],
  ['factory', ['even', 'scrubbed', 'diurnal']],
  ['nightshift', ['nocturnal', 'strict', 'seasoned']],
  ['dorm', ['neglected', 'motley', 'forgiving']],
  ['dacha', ['lean', 'wild', 'slow']],
  ['resort', ['greedy', 'scrubbed', 'early']],
  ['field', ['wiry', 'lean', 'seasoned']],
  ['lab', ['sterile', 'careful', 'strict']],
  ['archive', ['ancient', 'longline', 'careful']],
  ['mayday', ['firstborn', 'early', 'wild']],
  ['duty', ['shift', 'even', 'careful']],
  ['communal', ['stout', 'neglected', 'spiteful']],
  ['forgotten', ['abandoned', 'stunted', 'wiry']],
  ['heirloom', ['longline', 'devoted', 'even']],
  ['cellar', ['nocturnal', 'wiry', 'slow']],
  ['adopted', ['foundling', 'healing', 'devoted']],
  ['complaint', ['litigious', 'spiteful', 'stout']],
  ['exemplary', ['scrubbed', 'devoted', 'early']],
  ['popular', ['generous', 'healing', 'diurnal']],
  ['winter', ['slow', 'lean', 'strict']],

  // Невозможные в одиночку: два признака одной семьи
  ['tempered', ['sterile', 'wiry', 'seasoned']],
  ['oldtimer', ['ancient', 'slow', 'longline']],
  ['blend', ['healing', 'strict', 'generous']],
  ['twofaced', ['spiteful', 'forgiving', 'shift']],
]

export const NAMED: readonly NamedStrain[] = TABLE.map(([key, traits]) => ({
  key,
  traits,
  // Считается при обращении, а не при загрузке — см. про круг выше.
  get graftOnly(): boolean {
    return new Set(traits.map((k) => TRAITS[k].family)).size < traits.length
  },
}))

/** Поиск по ключу набора: порядок признаков значения не имеет. */
let byKey: Map<string, NamedStrain> | null = null
const index = (): Map<string, NamedStrain> =>
  (byKey ??= new Map(NAMED.map((n) => [namedKey(n), n])))

/** Имеет ли этот набор признаков имя. null — безымянный штамм, и это нормально. */
export function namedStrain(traits: readonly TraitKey[]): NamedStrain | null {
  if (traits.length < 3) return null
  return index().get(strainKey([...traits])) ?? null
}

/** Сколько имён найдено в реестре владельца. */
export const namesFound = (bred: readonly string[]): NamedStrain[] => {
  const owned = new Set(bred)
  return NAMED.filter((n) => owned.has(namedKey(n)))
}

/** Именованный штамм по его ключу. null — ключа такого нет. */
export const namedByKey = (key: unknown): NamedStrain | null =>
  typeof key === 'string' ? (NAMED.find((n) => n.key === key) ?? null) : null

/** Ключ набора именованного штамма — тот же, что лежит в реестре. */
export const namedKey = (n: NamedStrain): string => strainKey([...n.traits])
