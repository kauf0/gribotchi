/**
 * Разряд владельца.
 *
 * Считается ЦЕЛИКОМ из реестра — новых полей в состоянии не требует, а значит
 * засчитывается задним числом всем, кто уже играл. Это не украшение решения,
 * а его причина: разряд, который у старого игрока начался бы с нуля, читался
 * бы как отнятое.
 *
 * Пороги — в balance.ts, оттуда же их берут реестр и паспорт: числа в игре
 * и числа в руководстве обязаны быть одним и тем же числом.
 */

import { decodeStrain } from './strain'
import { namesFound } from './named'
import { RANKS } from './balance'
import type { TraitKey } from './traits'

export type RankKey = (typeof RANKS)[number]['key']
export type RankDef = (typeof RANKS)[number]

/** Три величины, по которым меряется владелец. Все — про широту. */
export type Breadth = {
  /** Разных штаммов в реестре. */
  strains: number
  /** Найдено именованных штаммов. */
  names: number
  /** Разных признаков, побывавших в выведенном. */
  traits: number
}

export function breadthOf(bred: readonly string[]): Breadth {
  const seen = new Set<TraitKey>()
  for (const code of bred) {
    const strain = decodeStrain(code)
    if (!strain) continue
    for (const key of strain.traits) seen.add(key)
  }
  return { strains: bred.length, names: namesFound(bred).length, traits: seen.size }
}

const reached = (b: Breadth, r: RankDef): boolean =>
  b.strains >= r.strains && b.names >= r.names && b.traits >= r.traits

/** Текущий разряд. Пустой реестр даёт первый — без разряда никто не остаётся. */
export function rankOf(bred: readonly string[]): RankDef {
  const b = breadthOf(bred)
  let out: RankDef = RANKS[0]
  for (const r of RANKS) if (reached(b, r)) out = r
  return out
}

/**
 * Чего не хватает до следующего разряда. null — разряд последний.
 *
 * Возвращаются НЕДОСТАЮЩИЕ числа, а не пороги: «ещё 6 штаммов и 5 имён»
 * понятнее, чем «14 штаммов, 6 имён», когда часть уже набрана. Нули значат
 * «эта величина набрана», их показывать не надо.
 */
export function toNextRank(bred: readonly string[]): { rank: RankDef; need: Breadth } | null {
  const b = breadthOf(bred)
  const current = rankOf(bred)
  const next = RANKS[RANKS.indexOf(current) + 1]
  if (!next) return null
  return {
    rank: next,
    need: {
      strains: Math.max(0, next.strains - b.strains),
      names: Math.max(0, next.names - b.names),
      traits: Math.max(0, next.traits - b.traits),
    },
  }
}
