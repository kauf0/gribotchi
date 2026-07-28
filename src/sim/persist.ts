/**
 * Сохранение и оффлайн-догон.
 *
 * Гриб живёт по календарю, а не по времени, проведённому в игре: при загрузке
 * состояние досчитывается от последнего тика до текущего момента тем же
 * advance(), что крутится в живом кадре.
 */

import { advance } from './tick'
import { createState, SAVE_VERSION, type GameState } from './state'
import { CLEAN_STRESS_MS } from './balance'

const KEY = 'gribochi.save.v1'

export type LoadResult = {
  state: GameState
  /** Сколько реального времени игрок отсутствовал, мс. Ноль для новой игры. */
  awayMs: number
  fresh: boolean
}

export function load(now: number, storage: Storage | null = safeStorage()): LoadResult {
  const raw = storage?.getItem(KEY)
  if (!raw) return { state: createState(now), awayMs: 0, fresh: true }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { state: createState(now), awayMs: 0, fresh: true }
  }

  const saved = migrate(parsed, now)
  if (!saved) return { state: createState(now), awayMs: 0, fresh: true }

  const awayMs = Math.max(0, now - saved.lastTick)
  return { state: advance(saved, now), awayMs, fresh: false }
}

export function save(s: GameState, storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(s))
  } catch {
    // Приватный режим или переполненное хранилище — игра продолжается без записи.
  }
}

export function wipe(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // см. выше
  }
}

/**
 * Подъём сохранения до текущей схемы.
 *
 * Игра выложена, у игроков в localStorage лежат живые грибы, которых растили
 * несколько дней. Поэтому здесь действует правило: новые поля ВОССТАНАВЛИВАЮТСЯ
 * из уже сохранённых данных, а не берут значение по умолчанию. Отбросить
 * непонятное сохранение — значит молча убить чужой объект, и игрок воспримет
 * это как поломку, а не как обновление.
 *
 * SAVE_VERSION поднимается, только когда конвертация действительно невозможна;
 * тогда её надо писать явно, а не полагаться на сброс. Каждая миграция
 * закрывается тестом в tests/lifecycle.test.ts.
 */
function migrate(parsed: unknown, now: number): GameState | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const s = parsed as Partial<GameState>
  if (s.version !== SAVE_VERSION) return null

  const nums: (keyof GameState)[] = ['bornAt', 'lastTick', 'generation', 'food', 'growth', 'mold', 'resentment']
  for (const key of nums) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key] as number)) return null
  }
  if (typeof s.alive !== 'boolean') return null

  const fresh = createState(now)
  const merged: GameState = { ...fresh, ...(s as GameState) }

  /**
   * Сохранения, сделанные до того, как возраст стал величиной симуляции,
   * поля ageMs не имеют. Восстанавливаем его из сырых, ещё не подрезанных
   * меток: их разница и есть прожитое время, включая накрученное отладочным
   * ускорителем. Иначе номер дня у старых сохранений обнулился бы.
   */
  const raw = s as GameState
  if (typeof raw.ageMs !== 'number' || !Number.isFinite(raw.ageMs)) {
    merged.ageMs = Math.max(0, raw.lastTick - raw.bornAt)
  }
  if (typeof raw.fedAtAge !== 'number' || !Number.isFinite(raw.fedAtAge)) {
    const sinceFed = Math.max(0, raw.lastTick - raw.lastFedAt)
    merged.fedAtAge = Math.max(0, merged.ageMs - sinceFed)
  }

  /**
   * Метки времени из будущего оставлять нельзя. Их пишет отладочный ускоритель
   * (покормили при ×600 — и lastFedAt уехал на часы вперёд) и переведённые
   * системные часы. После перезагрузки часы возвращаются к настоящим, и игра
   * застревает: кулдаун кормления не истечёт, пока реальное время не догонит,
   * а прибор будет твердить «не чаще раза в 15 мин».
   */
  const past = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v <= now ? v : fallback

  merged.bornAt = past(merged.bornAt, now)
  merged.lastTick = past(merged.lastTick, now)
  // Кулдауны берут запасное значение новорождённого объекта, то есть считаются
  // истёкшими: подрезать их к «прямо сейчас» значило бы наказать игрока
  // пятнадцатиминутным ожиданием за чужую ошибку.
  merged.lastFedAt = past(merged.lastFedAt, fresh.lastFedAt)
  merged.lastCleanedAt = past(merged.lastCleanedAt, fresh.lastCleanedAt)
  merged.deathAt = merged.deathAt === null ? null : past(merged.deathAt, now)
  // Стресс после промывки законно смотрит вперёд, но не дальше своей длины.
  merged.stressUntil = Math.min(
    typeof merged.stressUntil === 'number' && Number.isFinite(merged.stressUntil) ? merged.stressUntil : 0,
    now + CLEAN_STRESS_MS,
  )

  return merged
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
