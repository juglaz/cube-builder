import { db } from '../db'
import { isLand } from './cardMeta'
import type { LibraryCard } from '../types'

export const ELO_AXIS_MIN = 1000
export const ELO_AXIS_MAX = 2200
export const ELO_HIST_BINS = 60
export const MISSING_ELO = 1200

export function eloBinIndex(elo: number): number {
  const t = (elo - ELO_AXIS_MIN) / (ELO_AXIS_MAX - ELO_AXIS_MIN)
  return Math.max(0, Math.min(ELO_HIST_BINS - 1, Math.floor(t * ELO_HIST_BINS)))
}

export function eloInBand(
  elo: number | null | undefined,
  min: number,
  max: number,
): boolean {
  const value = Number.isFinite(elo) ? Number(elo) : MISSING_ELO
  return value >= min && value <= max
}

export function cardPassesEloBand(
  card: LibraryCard,
  elo: number | undefined,
  min: number,
  max: number,
  exemptLands: boolean,
): boolean {
  if (exemptLands && isLand(card)) return true
  return eloInBand(elo, min, max)
}

export async function loadCobraEloMap(): Promise<Map<string, number>> {
  const rows = await db.cobraElo.toArray()
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.oracleId, row.elo)
  return map
}

export function defaultEloBand(): { eloMin: number; eloMax: number } {
  return { eloMin: 1220, eloMax: 1520 }
}

export function eloBandIsOpen(min: number, max: number): boolean {
  return min <= ELO_AXIS_MIN && max >= ELO_AXIS_MAX
}

export function eloOf(oracleId: string, eloMap: Map<string, number>): number {
  const value = eloMap.get(oracleId)
  return Number.isFinite(value) ? Number(value) : MISSING_ELO
}

function percentileAsc(sorted: number[], p: number): number {
  if (sorted.length === 0) return MISSING_ELO
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

/** Top quarter of the candidate pool, floored by the upper part of a set Elo band. */
export function highEloThreshold(spellElos: number[], eloMin: number, eloMax: number): number {
  if (spellElos.length === 0) return Number.POSITIVE_INFINITY
  const asc = [...spellElos].sort((a, b) => a - b)
  const poolCut = percentileAsc(asc, 0.75)
  if (eloBandIsOpen(eloMin, eloMax)) return poolCut
  const bandCut = eloMin + 0.55 * Math.max(40, eloMax - eloMin)
  return Math.max(poolCut, bandCut)
}

export function highEloPerColorFloor(targetSize: number): number {
  return Math.max(5, Math.round(targetSize / 48))
}
