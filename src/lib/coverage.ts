import { SPELL_FLOOR_TYPES, typeFloorTypes, type SpellFloorType } from './cardMeta'
import type { LibraryCard } from '../types'

export const TYPE_FLOOR_ORDER: SpellFloorType[] = [...SPELL_FLOOR_TYPES]
export const COVERAGE_COLORS = ['W', 'U', 'B', 'R', 'G'] as const
export const COLOR_PIP_SHARE = 0.18

const TYPE_MIN_SHARE: Record<SpellFloorType, number> = {
  Instant: 0.125,
  Sorcery: 0.11,
  Enchantment: 0.07,
  Artifact: 0.08,
}

export type TypeCoverageRow = { type: string; count: number; min: number }
export type ColorCoverageRow = { color: string; pips: number; identity: number; target: number }

export function typeMinimums(size: number): Record<SpellFloorType, number> {
  return Object.fromEntries(
    TYPE_FLOOR_ORDER.map((type) => [type, Math.max(8, Math.round(size * TYPE_MIN_SHARE[type]))]),
  ) as Record<SpellFloorType, number>
}

export function colorPipTarget(size: number): number {
  return size * COLOR_PIP_SHARE
}

export function typeCoverageRows(
  cards: LibraryCard[],
  typeMins: Record<SpellFloorType, number>,
): TypeCoverageRow[] {
  const have: Record<string, number> = Object.fromEntries(TYPE_FLOOR_ORDER.map((type) => [type, 0]))
  for (const card of cards) {
    for (const type of typeFloorTypes(card)) have[type] = (have[type] ?? 0) + 1
  }
  return TYPE_FLOOR_ORDER.map((type) => ({ type, count: have[type] ?? 0, min: typeMins[type] }))
}

export function colorCoverageRows(cards: LibraryCard[], target: number): ColorCoverageRow[] {
  const pips = Object.fromEntries(COVERAGE_COLORS.map((color) => [color, 0])) as Record<
    (typeof COVERAGE_COLORS)[number],
    number
  >
  const identity = Object.fromEntries(COVERAGE_COLORS.map((color) => [color, 0])) as Record<
    (typeof COVERAGE_COLORS)[number],
    number
  >
  for (const card of cards) {
    const colors = card.colorIdentity.filter((value): value is (typeof COVERAGE_COLORS)[number] =>
      (COVERAGE_COLORS as readonly string[]).includes(value),
    )
    if (colors.length === 0) continue
    const weight = 1 / colors.length
    for (const color of colors) {
      pips[color] += weight
      identity[color] += 1
    }
  }
  return COVERAGE_COLORS.map((color) => ({
    color,
    pips: pips[color],
    identity: identity[color],
    target,
  }))
}
