/**
 * Все тексты игры. Единственное место, где название существует как строка —
 * ни одного захардкоженного «ГРИБОЧИ» в компонентах.
 *
 * Тон: канцелярит и сухой чёрный юмор. Прибор говорит о грибе «объект»,
 * об игроке — «владелец», и никогда не радуется вслух.
 */

export const BRAND = {
  ru: 'ГРИБОЧИ',
  jp: 'グリボッチ',
  gost: 'ГОСТ 28376-89',
  sub: 'ИГРУШКА ЭЛЕКТРОННАЯ СИМБИОТИЧЕСКАЯ · 1 ШТ.',
  tagline: 'ОН ТОЖЕ ВАС НЕ ЗАБУДЕТ',
} as const

export const BUTTONS = {
  A: 'ЧАЙ',
  B: 'МЫТЬ',
  C: 'СОС',
} as const

/** Загрузочный экран. y — в клетках сетки 50×40, размер — в пикселях буфера. */
export const BOOT_LINES = [
  { text: BRAND.ru, y: 6, size: 30, ink: true, jp: false },
  { text: BRAND.jp, y: 11, size: 16, ink: false, jp: true },
  { text: BRAND.gost, y: 15.5, size: 20, ink: false, jp: false },
  { text: 'ЖИВОЙ ОБЪЕКТ', y: 21, size: 20, ink: false, jp: false },
  { text: 'ПРОБУЖДЕНИЕ...', y: 25, size: 20, ink: false, jp: false },
] as const

export const MSG = {
  hello: 'ЗДРАВСТВУЙТЕ.',
  aliveForNow: 'ОБЪЕКТ ЖИВ. ПОКА ЧТО.',
  pouring: 'ПОДАЧА СЛАДКОГО ЧАЯ...',
  fed: 'СЫТ. НО ЭТО НЕНАДОЛГО.',
  overfed: 'ПЕРЕЛИВ. ОБЪЕКТ НЕДОВОЛЕН.',
  waiting: 'ОЖИДАНИЕ...',
  turnedAway: 'ОБЪЕКТ ОТВЕРНУЛСЯ. ОБЪЕКТ ЖДЁТ.',
  forgiven: 'ИЗВИНЕНИЯ ПРИНЯТЫ. УСЛОВНО.',
  growing: 'ОБЪЕКТ РАСТЁТ.',
  biggerThanOwner: 'ОБЪЕКТ БОЛЬШЕ ВЛАДЕЛЬЦА.',
  cleaning: 'СМЕНА СРЕДЫ. НЕ МЕШАЙТЕ.',
  cleaned: 'СРЕДА ОБНОВЛЕНА. ОБЪЕКТ В СТРЕССЕ.',
  hungry: 'ТРЕБУЕТСЯ ПОДАЧА ЧАЯ.',
  cooldown: 'ПОДАЧА НЕ ЧАЩЕ РАЗА В 15 МИН.',
  cleanCooldown: 'СРЕДА УЖЕ СМЕНЕНА. НЕ УСЕРДСТВУЙТЕ.',
  report: 'АВАРИЙНАЯ СЛУЖБА НА СВЯЗИ.',
  dead: 'ОБЪЕКТ НЕ ОТВЕЧАЕТ.',
  died: 'ОБЪЕКТ ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ.',
  notReady: 'РОЗЛИВ ПРЕЖДЕВРЕМЕНЕН.',
  bottled: 'ПАРТИЯ РАЗЛИТА. ЦИКЛ ПРОДОЛЖАЕТСЯ.',
  daughter: 'ДОЧЕРНИЙ СЛОЙ ПРИНЯТ К УЧЁТУ.',
  startedOver: 'НОВАЯ ЗАКВАСКА. ПОКОЛЕНИЕ 1.',
  moldy: 'ТРЕБУЕТСЯ СМЕНА СРЕДЫ.',
  bottleReady: 'ГОТОВ К РОЗЛИВУ. НАЖМИТЕ СОС.',
  soundOn: 'ЗВУК ВКЛЮЧЁН.',
  soundOff: 'ЗВУК ОТКЛЮЧЁН.',
} as const

export const BUBBLE = {
  feedMe: 'КОРМИ',
  remembers: 'ОН ВСЁ ПОМНИТ',
  thanks: 'СПАСИБО. НЕ ПРИВЫКАЙТЕ.',
  dirty: 'ЗДЕСЬ ГРЯЗНО',
  ripe: 'ПОРА РАЗЛИВАТЬ',
} as const

export const ALARM = 'ТРЕВОГА'

/** Экран запуска. */
export const START = {
  action: 'КОРМИТЬ ГРИБОЧИ',
  hint: 'НАЖМИТЕ СОС',
  waiting: (day: number, generation: number) => `ОБЪЕКТ ЖДЁТ · ДЕНЬ ${day} · ПОКОЛЕНИЕ ${generation}`,
  ceased: (generation: number) => `ОБЪЕКТ №${generation} НЕ ОТВЕЧАЕТ`,
} as const

/** Экраны сводки и извещения о гибели. */
export const REPORT = {
  title: 'СВОДКА',
  journal: 'ЖУРНАЛ НАБЛЮДЕНИЙ:',
  empty: 'ЗАПИСЕЙ НЕТ.',
  hint: 'ЧАЙ ↑   МЫТЬ ↓   СОС — ВЫХОД',
  deathHint: 'СОС — ПРОДОЛЖИТЬ',
  ceased: 'ПРЕКРАТИЛ СУЩЕСТВОВАНИЕ.',
  daughterFound: 'ОБНАРУЖЕН ДОЧЕРНИЙ СЛОЙ.',
  daughterNone: 'ДОЧЕРНЕГО СЛОЯ НЕ ОБРАЗОВАЛОСЬ.',
  cycleGoesOn: 'ЦИКЛ МОЖЕТ БЫТЬ ПРОДОЛЖЕН.',
  needStarter: 'ТРЕБУЕТСЯ НОВАЯ ЗАКВАСКА.',
  version: (v: string) => `ИЗДЕЛИЕ ВЕРСИИ ${v}`,
} as const

/** Просроченное кормление: «КОРМЛЕНИЕ ПРОСРОЧЕНО НА 11 ДН.» */
export const overdue = (days: number) => `КОРМЛЕНИЕ ПРОСРОЧЕНО НА ${days} ДН.`

/** Возвращение владельца: «ВАС НЕ БЫЛО 14 Ч. ОБЪЕКТ СЧИТАЛ.» */
export const wereAway = (hours: number) => `ВАС НЕ БЫЛО ${hours} Ч. ОБЪЕКТ СЧИТАЛ.`

export const objectNo = (n: number) => `ОБЪЕКТ №${n}`
export const dayNo = (n: number) => `ДЕНЬ ${n}.`
