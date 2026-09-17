import { isLand } from './cardMeta'
import { COVERAGE_COLORS } from './coverage'
import { ELO_AXIS_MAX, ELO_AXIS_MIN, highEloPerColorFloor, highEloThreshold, MISSING_ELO } from './elo'
import type { LibraryCard } from '../types'

type Color = (typeof COVERAGE_COLORS)[number]

function identityColors(card: LibraryCard): Color[] {
  return card.colorIdentity.filter((value): value is Color =>
    (COVERAGE_COLORS as readonly string[]).includes(value),
  )
}

export type PowerCard = {
  oracleId: string
  name: string
  elo: number
  rated: boolean
  isLand: boolean
  colorIdentity: Color[]
  imageNormal: string
  typeLine: string
  faces?: LibraryCard['faces']
}

export type ColorPowerRow = {
  color: Color
  n: number
  slice: PowerSlice
  high: number
  highWant: number
  meanDelta: number
  top: PowerCard | null
  elos: number[]
}

export type PowerSlice = {
  n: number
  mean: number
  sd: number
  min: number
  p10: number
  p25: number
  median: number
  p75: number
  p90: number
  max: number
  iqr: number
  below1200: number
  atLeast1500: number
  atLeast1700: number
}

export type PowerHistBar = {
  label: string
  start: number
  count: number
}

export type PowerProfile = {
  catalogReady: boolean
  missing: number
  all: PowerSlice
  spells: PowerSlice
  lands: PowerSlice | null
  histogram: PowerHistBar[]
  spellHistogram: PowerHistBar[]
  top: PowerCard[]
  bottomSpells: PowerCard[]
  byColor: ColorPowerRow[]
  colorMeanSpread: number
  highThreshold: number
  highPerColor: number
}

const HIST_STEP = 100

/** Median nonland share in each 100-point Elo band (1000s–2100s). */
export const POPULAR_SPELL_ELO_SHARES = [
  0.0009, 0.0495, 0.2556, 0.3245, 0.1625, 0.0849, 0.0564, 0.0236, 0.0083, 0, 0, 0,
] as const

export function typicalSpellCount(shareIndex: number, spellCount: number): number {
  const share = POPULAR_SPELL_ELO_SHARES[shareIndex] ?? 0
  return Math.round(share * spellCount)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo)
}

export function summarizeElo(values: number[]): PowerSlice {
  const xs = [...values].sort((a, b) => a - b)
  const n = xs.length
  if (n === 0) {
    return {
      n: 0,
      mean: 0,
      sd: 0,
      min: 0,
      p10: 0,
      p25: 0,
      median: 0,
      p75: 0,
      p90: 0,
      max: 0,
      iqr: 0,
      below1200: 0,
      atLeast1500: 0,
      atLeast1700: 0,
    }
  }
  const mean = xs.reduce((sum, v) => sum + v, 0) / n
  const variance = xs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n
  const p25 = percentile(xs, 0.25)
  const p75 = percentile(xs, 0.75)
  return {
    n,
    mean,
    sd: Math.sqrt(variance),
    min: xs[0]!,
    p10: percentile(xs, 0.1),
    p25,
    median: percentile(xs, 0.5),
    p75,
    p90: percentile(xs, 0.9),
    max: xs[n - 1]!,
    iqr: p75 - p25,
    below1200: xs.filter((v) => v < 1200).length,
    atLeast1500: xs.filter((v) => v >= 1500).length,
    atLeast1700: xs.filter((v) => v >= 1700).length,
  }
}

function histogram(values: number[]): PowerHistBar[] {
  const bars: PowerHistBar[] = []
  for (let start = ELO_AXIS_MIN; start < ELO_AXIS_MAX; start += HIST_STEP) {
    const end = start + HIST_STEP
    bars.push({
      label: `${start}s`,
      start,
      count: values.filter((v) => v >= start && v < end).length,
    })
  }
  return bars
}

export function profileCubePower(
  cards: LibraryCard[],
  eloByOracle: Map<string, number>,
  catalogReady: boolean,
  band?: { eloMin?: number; eloMax?: number },
): PowerProfile | null {
  if (cards.length === 0) return null
  const rated = [...eloByOracle.values()].filter((v) => Number.isFinite(v)).length
  if (!catalogReady && rated === 0) {
    return {
      catalogReady: false,
      missing: cards.length,
      all: summarizeElo([]),
      spells: summarizeElo([]),
      lands: null,
      histogram: [],
      spellHistogram: [],
      top: [],
      bottomSpells: [],
      byColor: [],
      colorMeanSpread: 0,
      highThreshold: Number.POSITIVE_INFINITY,
      highPerColor: 0,
    }
  }

  const rows: PowerCard[] = cards.map((card) => {
    const ratedElo = eloByOracle.get(card.oracleId)
    const has = Number.isFinite(ratedElo)
    return {
      oracleId: card.oracleId,
      name: card.name,
      elo: has ? Number(ratedElo) : MISSING_ELO,
      rated: has,
      isLand: isLand(card),
      colorIdentity: identityColors(card),
      imageNormal: card.imageNormal,
      typeLine: card.typeLine,
      faces: card.faces,
    }
  })
  const spells = rows.filter((row) => !row.isLand)
  const lands = rows.filter((row) => row.isLand)
  const top = [...rows].sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name)).slice(0, 10)
  const bottomSpells = [...spells]
    .sort((a, b) => a.elo - b.elo || a.name.localeCompare(b.name))
    .slice(0, 8)
  const spellElos = spells.map((row) => row.elo)
  const eloMin = Number.isFinite(band?.eloMin) ? Number(band?.eloMin) : ELO_AXIS_MIN
  const eloMax = Number.isFinite(band?.eloMax) ? Number(band?.eloMax) : ELO_AXIS_MAX
  const highThreshold = highEloThreshold(spellElos, eloMin, eloMax)
  const highPerColor = highEloPerColorFloor(cards.length)
  const byColor = colorPowerRows(spells, highThreshold, highPerColor)
  const colorMeans = byColor.filter((row) => row.n > 0).map((row) => row.slice.mean)
  const colorMeanSpread =
    colorMeans.length >= 2 ? Math.max(...colorMeans) - Math.min(...colorMeans) : 0

  return {
    catalogReady: catalogReady || rated > 0,
    missing: rows.filter((row) => !row.rated).length,
    all: summarizeElo(rows.map((row) => row.elo)),
    spells: summarizeElo(spellElos),
    lands: lands.length ? summarizeElo(lands.map((row) => row.elo)) : null,
    histogram: histogram(rows.map((row) => row.elo)),
    spellHistogram: histogram(spellElos),
    top,
    bottomSpells,
    byColor,
    colorMeanSpread,
    highThreshold,
    highPerColor,
  }
}

function colorPowerRows(
  spells: PowerCard[],
  highThreshold: number,
  highPerColor: number,
): ColorPowerRow[] {
  const groups = new Map<Color, PowerCard[]>()
  for (const color of COVERAGE_COLORS) groups.set(color, [])
  for (const row of spells) {
    for (const color of row.colorIdentity) {
      groups.get(color)?.push(row)
    }
  }
  const rows = COVERAGE_COLORS.map((color) => {
    const group = groups.get(color) ?? []
    const elos = group.map((card) => card.elo)
    const slice = summarizeElo(elos)
    const high = group.filter((card) => card.elo >= highThreshold).length
    const top =
      [...group].sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name))[0] ?? null
    return {
      color,
      n: group.length,
      slice,
      high,
      highWant: group.length > 0 ? Math.min(highPerColor, group.length) : 0,
      meanDelta: 0,
      top,
      elos,
    }
  })
  const active = rows.filter((row) => row.n > 0)
  const mean =
    active.length > 0 ? active.reduce((sum, row) => sum + row.slice.mean, 0) / active.length : 0
  for (const row of rows) {
    row.meanDelta = row.n > 0 ? row.slice.mean - mean : 0
  }
  return rows
}

export function colorEloSpreads(
  cards: LibraryCard[],
  eloByOracle: Map<string, number>,
): { colors: number; meanSpread: number; p10Spread: number; p90Spread: number } | null {
  const groups = new Map<Color, number[]>()
  for (const color of COVERAGE_COLORS) groups.set(color, [])
  for (const card of cards) {
    if (isLand(card)) continue
    const rated = eloByOracle.get(card.oracleId)
    const elo = Number.isFinite(rated) ? Number(rated) : MISSING_ELO
    for (const color of identityColors(card)) {
      groups.get(color)?.push(elo)
    }
  }
  const means: number[] = []
  const p10s: number[] = []
  const p90s: number[] = []
  for (const color of COVERAGE_COLORS) {
    const elos = groups.get(color) ?? []
    if (elos.length === 0) continue
    const slice = summarizeElo(elos)
    means.push(slice.mean)
    p10s.push(slice.p10)
    p90s.push(slice.p90)
  }
  if (means.length < 2) return null
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
  return {
    colors: means.length,
    meanSpread: spread(means),
    p10Spread: spread(p10s),
    p90Spread: spread(p90s),
  }
}

export function formatElo(n: number): string {
  return Math.round(n).toLocaleString()
}

export function silvermanBandwidth(values: number[]): number {
  if (values.length < 2) return 24
  const slice = summarizeElo(values)
  const iqrScale = slice.iqr > 0 ? slice.iqr / 1.349 : slice.sd
  const sigma = Math.min(slice.sd, iqrScale) || slice.sd || 24
  const h = 1.06 * sigma * values.length ** -0.2
  return Math.min(48, Math.max(14, h))
}

export function gaussianKde(values: number[], xs: number[], bandwidth: number): number[] {
  if (values.length === 0) return xs.map(() => 0)
  const inv = 1 / (values.length * bandwidth * Math.sqrt(2 * Math.PI))
  const twoH2 = 2 * bandwidth * bandwidth
  return xs.map((x) => {
    let sum = 0
    for (const value of values) {
      const d = x - value
      sum += Math.exp(-(d * d) / twoH2)
    }
    return sum * inv
  })
}
