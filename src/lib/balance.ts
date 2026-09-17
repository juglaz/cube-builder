import { isCreature, isLand } from './cardMeta'
import { colorEloSpreads } from './powerAnalysis'
import type { ThemeMix } from './themeStructure'
import type { LibraryCard } from '../types'

/** Observed min / median / max from 8 Cube Cobra lists (Sep 2026). Not IQR, not padded. */
export const BALANCE_BENCHMARKS = {
  goldNonland: { median: 0.121, low: 0.036, high: 0.156 },
  goldThree: { median: 0.005, low: 0, high: 0.033 },
  goldAll: { median: 0.235, low: 0.161, high: 0.259 },
  lands: { median: 0.176, low: 0.093, high: 0.219 },
  creatures: { median: 0.408, low: 0.272, high: 0.535 },
  colorless: { median: 0.157, low: 0.07, high: 0.17 },
  curveTop: { median: 0.064, low: 0.029, high: 0.083 },
  cheapSpells: { median: 0.458, low: 0.431, high: 0.556 },
  instant: { median: 0.154, low: 0.096, high: 0.197 },
  sorcery: { median: 0.113, low: 0.086, high: 0.139 },
  enchantment: { median: 0.054, low: 0.04, high: 0.12 },
  artifact: { median: 0.15, low: 0.06, high: 0.17 },
  monoEach: { median: 0.135, low: 0.11, high: 0.155 },
  supportedThemes: { median: 13, low: 10, high: 16 },
  dominantThemes: { median: 5.5, low: 4, high: 7 },
  eighthTheme: { median: 1.275, low: 1.13, high: 1.47 },
  themeCoverage: { median: 0.798, low: 0.763, high: 0.839 },
  themeBridges: { median: 0.47, low: 0.458, high: 0.523 },
  connectedPairs: { median: 20, low: 16, high: 25 },
  monoSpread: { median: 0.022, low: 0, high: 0.044 },
  colorMeanSpread: { median: 95, low: 0, high: 117 },
  colorP90Spread: { median: 131, low: 0, high: 164 },
  colorP10Spread: { median: 59, low: 0, high: 94 },
} as const

/** One copy per 15-card pack. Not a popular-cube measurement. */
export const PACK_AS_FAN_FLOOR = 1

export const GOLD_NONLAND_SHARE = BALANCE_BENCHMARKS.goldNonland.median
export const GOLD_THREE_SHARE = BALANCE_BENCHMARKS.goldThree.median

/** Nonland mana-value mix (lands counted separately). */
export const SPELL_CURVE_SHARE: Record<string, number> = {
  '0-1': 0.26,
  '2': 0.31,
  '3': 0.19,
  '4': 0.11,
  '5': 0.06,
  '6+': 0.07,
}

export const SECTION_SHARE: Record<string, number> = {
  W: 0.126,
  U: 0.126,
  B: 0.126,
  R: 0.126,
  G: 0.126,
  C: 0.08,
  M: GOLD_NONLAND_SHARE,
  L: BALANCE_BENCHMARKS.lands.median,
}

export type Band = { median: number; low: number; high: number }

export type IdentityMix = {
  size: number
  lands: number
  creatures: number
  goldAll: number
  goldNonland: number
  goldThree: number
  colorless: number
  mono: Record<string, number>
  curve: Record<string, number>
  spellCurve: Record<string, number>
  cheapSpells: number
  types: Record<string, number>
}

export type MetricUnit = '%' | 'pp' | 'n' | 'as-fan' | 'elo'

export type MetricBasis = 'observed' | 'floor'

export type MetricScore = {
  id: string
  label: string
  value: number
  unit: MetricUnit
  band: Band
  score: number
  note: string
  basis: MetricBasis
}

export type CubeEvaluation = {
  overall: number
  metrics: MetricScore[]
}

function pct(count: number, size: number): number {
  return size > 0 ? count / size : 0
}

function curveBucket(cmc: number): string {
  if (cmc <= 1) return '0-1'
  if (cmc <= 5) return String(Math.floor(cmc))
  return '6+'
}

export function identityMix(cards: LibraryCard[]): IdentityMix {
  const size = cards.length
  const mix: IdentityMix = {
    size,
    lands: 0,
    creatures: 0,
    goldAll: 0,
    goldNonland: 0,
    goldThree: 0,
    colorless: 0,
    mono: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    curve: { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 },
    spellCurve: { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 },
    cheapSpells: 0,
    types: { Instant: 0, Sorcery: 0, Enchantment: 0, Artifact: 0 },
  }
  for (const card of cards) {
    const land = isLand(card)
    const identity = card.colorIdentity
    if (land) mix.lands += 1
    if (isCreature(card)) mix.creatures += 1
    if (identity.length === 0) mix.colorless += 1
    else if (identity.length === 1) mix.mono[identity[0]!] = (mix.mono[identity[0]!] ?? 0) + 1
    else {
      mix.goldAll += 1
      if (!land) mix.goldNonland += 1
      if (!land && identity.length >= 3) mix.goldThree += 1
    }
    const bucket = curveBucket(card.cmc)
    mix.curve[bucket] = (mix.curve[bucket] ?? 0) + 1
    if (!land) {
      mix.spellCurve[bucket] = (mix.spellCurve[bucket] ?? 0) + 1
      if (card.cmc <= 2) mix.cheapSpells += 1
    }
    const line = card.typeLine
    for (const type of Object.keys(mix.types)) {
      if (new RegExp(`\\b${type}\\b`, 'i').test(line)) mix.types[type] += 1
    }
  }
  return mix
}

function bandScore(value: number, band: Band): number {
  if (value >= band.low && value <= band.high) return 100
  if (!Number.isFinite(band.high)) {
    if (value >= band.low) return 100
    const span = Math.max(0.01, band.low)
    return Math.max(0, 100 - (100 * (band.low - value)) / span)
  }
  const span = Math.max(0.01, band.high - band.low)
  if (value < band.low) return Math.max(0, 100 - (100 * (band.low - value)) / span)
  return Math.max(0, 100 - (100 * (value - band.high)) / span)
}

function metric(
  id: string,
  label: string,
  countOrShare: number,
  size: number,
  band: Band,
  note: string,
  alreadyShare = false,
): MetricScore {
  const value = alreadyShare ? countOrShare : pct(countOrShare, size)
  return {
    id,
    label,
    value,
    unit: '%',
    band,
    score: Math.round(bandScore(value, band)),
    note,
    basis: 'observed',
  }
}

const WEIGHTS: Record<string, number> = {
  goldNonland: 1.6,
  goldThree: 1.3,
  lands: 1.2,
  creatures: 1,
  cheapSpells: 1.1,
  curveTop: 0.9,
  instant: 0.8,
  sorcery: 0.8,
  monoBalance: 1.2,
  colorMeanSpread: 1.15,
  colorP90Spread: 1.1,
  colorP10Spread: 0.85,
  supportedThemes: 1.1,
  dominantThemes: 0.9,
  eighthTheme: 1.2,
  themeCoverage: 1,
  themeBridges: 1.3,
  connectedPairs: 0.8,
}

function metricRaw(
  id: string,
  label: string,
  value: number,
  band: Band,
  unit: MetricUnit,
  note: string,
  basis: MetricBasis = 'observed',
): MetricScore {
  return {
    id,
    label,
    value,
    unit,
    band,
    score: Math.round(bandScore(value, band)),
    note,
    basis,
  }
}

function formatPct(n: number): string {
  const x = 100 * n
  return Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1)
}

export function formatMetricValue(row: MetricScore): string {
  if (row.unit === '%') return `${(row.value * 100).toFixed(1)}%`
  if (row.unit === 'pp') return `${(row.value * 100).toFixed(1)} pp`
  if (row.unit === 'as-fan') return row.value.toFixed(2)
  if (row.unit === 'elo') return String(Math.round(row.value))
  return Number.isInteger(row.value) ? String(row.value) : row.value.toFixed(1)
}

export function formatMetricBand(row: MetricScore): string {
  const { low, high } = row.band
  if (row.basis === 'floor' || !Number.isFinite(high)) {
    if (row.unit === '%') return `≥ ${formatPct(low)}%`
    if (row.unit === 'as-fan') return `≥ ${low.toFixed(2)}`
    if (row.unit === 'pp') return `≥ ${formatPct(low)} pp`
    if (row.unit === 'elo') return `≥ ${Math.round(low)}`
    return `≥ ${low}`
  }
  if (row.unit === '%') return `${formatPct(low)}–${formatPct(high)}%`
  if (row.unit === 'pp') return `${formatPct(low)}–${formatPct(high)} pp`
  if (row.unit === 'as-fan') return `${low.toFixed(2)}–${high.toFixed(2)}`
  if (row.unit === 'elo') return `${Math.round(low)}–${Math.round(high)}`
  return `${low}–${high}`
}

export function evaluateCube(
  cards: LibraryCard[],
  theme?: ThemeMix,
  eloByOracle?: Map<string, number>,
): CubeEvaluation {
  const mix = identityMix(cards)
  const size = mix.size
  const monoVals = ['W', 'U', 'B', 'R', 'G'].map((c) => pct(mix.mono[c] ?? 0, size))
  const monoMean = monoVals.reduce((a, b) => a + b, 0) / 5
  const monoSpread = Math.max(...monoVals) - Math.min(...monoVals)

  let metrics: MetricScore[] = [
    metric(
      'goldNonland',
      'Gold nonlands',
      mix.goldNonland,
      size,
      BALANCE_BENCHMARKS.goldNonland,
      'Multicolor nonlands. Observed 3.6–15.6% on the eight lists (Neoclassical–Regular).',
    ),
    metric(
      'goldThree',
      '3+ color spells',
      mix.goldThree,
      size,
      BALANCE_BENCHMARKS.goldThree,
      'Nonland cards with 3+ color identity. Observed 0–3.3% on the eight lists.',
    ),
    metric(
      'lands',
      'Lands',
      mix.lands,
      size,
      BALANCE_BENCHMARKS.lands,
      'Observed 9.3–21.9% on the eight lists (Peasant–Bun Magic).',
    ),
    metric(
      'creatures',
      'Creatures',
      mix.creatures,
      size,
      BALANCE_BENCHMARKS.creatures,
      'Observed 27.2–53.5% on the eight lists (Neoclassical–Peasant).',
    ),
    metric(
      'cheapSpells',
      'MV 0–2 nonlands',
      mix.cheapSpells,
      size,
      BALANCE_BENCHMARKS.cheapSpells,
      'Nonlands with MV ≤ 2, as a share of the whole cube. Observed 43.1–55.6%.',
    ),
    metric(
      'curveTop',
      'MV 6+',
      mix.curve['6+'] ?? 0,
      size,
      BALANCE_BENCHMARKS.curveTop,
      'Observed 2.9–8.3% on the eight lists.',
    ),
    metric(
      'instant',
      'Instants',
      mix.types.Instant ?? 0,
      size,
      BALANCE_BENCHMARKS.instant,
      'Observed 9.6–19.7% on the eight lists.',
    ),
    metric(
      'sorcery',
      'Sorceries',
      mix.types.Sorcery ?? 0,
      size,
      BALANCE_BENCHMARKS.sorcery,
      'Observed 8.6–13.9% on the eight lists.',
    ),
    {
      id: 'monoBalance',
      label: 'Mono color spread',
      value: monoSpread,
      unit: 'pp',
      band: BALANCE_BENCHMARKS.monoSpread,
      score: Math.round(bandScore(monoSpread, BALANCE_BENCHMARKS.monoSpread)),
      note: `Exclusive mono max−min. Observed 0–4.4 pp on the eight lists (mean ${(100 * monoMean).toFixed(1)}%).`,
      basis: 'observed',
    },
  ]

  const colorPower = eloByOracle && eloByOracle.size > 0 ? colorEloSpreads(cards, eloByOracle) : null
  if (colorPower && colorPower.colors >= 2) {
    metrics.push(
      metricRaw(
        'colorMeanSpread',
        'Color mean Elo spread',
        colorPower.meanSpread,
        BALANCE_BENCHMARKS.colorMeanSpread,
        'elo',
        'WUBRG identity nonland mean Elo max−min. Observed 55–117 on the eight lists; lower is more even.',
      ),
      metricRaw(
        'colorP90Spread',
        'Color top-10% Elo spread',
        colorPower.p90Spread,
        BALANCE_BENCHMARKS.colorP90Spread,
        'elo',
        'P90 Elo max−min per color (top 10% of nonlands). Observed 109–164. P10 is the bottom 10%.',
      ),
      metricRaw(
        'colorP10Spread',
        'Color floor Elo spread',
        colorPower.p10Spread,
        BALANCE_BENCHMARKS.colorP10Spread,
        'elo',
        'P10 Elo max−min per color (bottom 10% of nonlands). Observed 37–94 on the eight lists.',
      ),
    )
  }

  if (theme?.hasTags) {
    metrics.push(
      metricRaw(
        'supportedThemes',
        'Playable themes',
        theme.supported,
        BALANCE_BENCHMARKS.supportedThemes,
        'n',
        'Tagger tags with as-fan ≥ 1.0. Observed 10–16 on the eight lists.',
      ),
      metricRaw(
        'dominantThemes',
        'Dominant themes',
        theme.dominant,
        BALANCE_BENCHMARKS.dominantThemes,
        'n',
        'Tags with as-fan ≥ 1.5. Across the eight popular lists this is 4–7, and they are almost always dense mechanics (activated/triggered, removal, evasion), not distinct draft archetypes.',
      ),
      metricRaw(
        'eighthTheme',
        '8th theme as-fan',
        theme.eighthAsFan,
        BALANCE_BENCHMARKS.eighthTheme,
        'as-fan',
        'The 8th-densest gameplay tag. Observed as-fan 1.13–1.47 on the eight lists.',
      ),
      metricRaw(
        'themeCoverage',
        'Top-8 coverage',
        theme.coverage,
        BALANCE_BENCHMARKS.themeCoverage,
        '%',
        'Share of the cube in at least one of the eight densest gameplay tags. Observed 76.3–83.9%.',
      ),
      metricRaw(
        'themeBridges',
        'Theme bridges',
        theme.bridgeShare,
        BALANCE_BENCHMARKS.themeBridges,
        '%',
        'Of cards in those top eight tags, share that also sit in a second one. Observed 45.8–52.3%.',
      ),
      metricRaw(
        'connectedPairs',
        'Connected theme pairs',
        theme.connectedPairs,
        BALANCE_BENCHMARKS.connectedPairs,
        'n',
        'Top-8 tag pairs that share at least 4 cards. Observed 16–25 on the eight lists.',
      ),
    )
    if (theme.hasFocus) {
      metrics.push(
        metricRaw(
          'focusMinAsFan',
          'Favored theme floor',
          theme.focusMinAsFan,
          { median: PACK_AS_FAN_FLOOR, low: PACK_AS_FAN_FLOOR, high: Number.POSITIVE_INFINITY },
          'as-fan',
          'Weakest seed/favored tag. As-fan 1.0 is one copy per pack. This is a playability floor, not an observed popular-cube range, and it is not in the overall score.',
          'floor',
        ),
      )
    }
  }

  let weightSum = 0
  let acc = 0
  for (const row of metrics) {
    if (row.basis !== 'observed') continue
    const w = WEIGHTS[row.id] ?? 1
    acc += w * row.score
    weightSum += w
  }
  return { overall: Math.round(acc / weightSum), metrics }
}

export function goldNonlandTarget(size: number): number {
  return Math.round(size * GOLD_NONLAND_SHARE)
}

export function goldThreeTarget(size: number): number {
  return Math.max(0, Math.round(size * GOLD_THREE_SHARE))
}
