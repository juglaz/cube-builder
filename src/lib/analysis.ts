import { isCreature, isLand } from './cardMeta'
import {
  BALANCE_BENCHMARKS,
  evaluateCube,
  identityMix,
  type CubeEvaluation,
} from './balance'
import { computeThemeMix } from './themeStructure'
import {
  colorCoverageRows,
  colorPipTarget,
  typeCoverageRows,
  typeMinimums,
  type ColorCoverageRow,
  type TypeCoverageRow,
} from './coverage'
import {
  creatureTypesFromCard,
  typeThemeFromId,
  typeThemeId,
  typeThemesFromIds,
} from './creatureTypes'
import { typalRowNeedsSupport, typalSupportRows, type TypalPayoffCard, type TypalSupportRow } from './tagSupport'
import type { CardTheme, LibraryCard, Theme } from '../types'

const CREATURE_SHARE: Record<string, number> = {
  W: 0.62,
  U: 0.5,
  B: 0.56,
  R: 0.53,
  G: 0.59,
}

export const TOP_THEME_COUNT = 20

export function asFan(count: number, cubeSize: number, packSize = 15): number {
  if (cubeSize <= 0) return 0
  return (count / cubeSize) * packSize
}

/** Expected copies one player sees in an 8x3x15 draft, after color sharing. */
export function gannonExposure(
  count: number,
  cubeSize: number,
  drafted = 360,
  players = 8,
  colorShare = 5,
): number {
  if (cubeSize <= 0) return 0
  const seenInDraft = count * Math.min(1, drafted / cubeSize)
  const playersPerColor = players / colorShare
  return seenInDraft / playersPerColor
}

export type ThemeDensity = {
  themeId: string
  name: string
  count: number
  weighted: number
  asFan: number
  exposure: number
  overlapCount: number
  orphans: number
}

export type Warning = {
  id: string
  severity: 'warn' | 'info'
  message: string
  cards?: TypalPayoffCard[]
}

export type BridgeCard = {
  oracleId: string
  name: string
  themeIds: string[]
  imageNormal: string
  faces?: LibraryCard['faces']
}

export type BridgeGroup = {
  themeIds: [string, string]
  count: number
  cards: BridgeCard[]
}

export type CubeAnalysis = {
  size: number
  colorCounts: Record<string, number>
  typeCounts: Record<string, number>
  curve: Record<string, number>
  curveByColor: Record<string, Record<string, number>>
  landCount: number
  landShare: number
  spellCount: number
  creatureCount: number
  creatureShare: number
  themeDensity: ThemeDensity[]
  focusedDensity: ThemeDensity[]
  focusedThemeIds: string[]
  typeCoverage: TypeCoverageRow[]
  colorCoverage: ColorCoverageRow[]
  evaluation: CubeEvaluation
  overlapMatrix: Array<{ a: string; b: string; count: number }>
  bridges: BridgeCard[]
  bridgeGroups: BridgeGroup[]
  orphans: Array<{ oracleId: string; name: string; themeId: string }>
  typalSupport: TypalSupportRow[]
  warnings: Warning[]
}

export type AnalyzeOptions = {
  /** When set, density / bridges / overlap are relative to these themes instead of the densest 20. */
  focusThemeIds?: string[]
  /** Seed / favored tags scored against playable as-fan and bridge bands. */
  scoreThemeIds?: string[]
  /** Cube Cobra Elo by oracle id; enables color power metrics in the design score. */
  eloByOracle?: Map<string, number>
}

function curveBucket(cmc: number): string {
  if (cmc <= 1) return '0-1'
  if (cmc <= 5) return String(Math.floor(cmc))
  return '6+'
}

export function analyzeCube(
  cards: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
  options?: AnalyzeOptions,
): CubeAnalysis {
  const size = cards.length
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, M: 0 }
  const typeCounts: Record<string, number> = {}
  const curve: Record<string, number> = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 }
  const curveByColor: Record<string, Record<string, number>> = {}

  let landCount = 0
  let creatureCount = 0

  const typeTags: CardTheme[] = []
  const typeThemeIdSet = new Set<string>()
  for (const card of cards) {
    for (const typeName of creatureTypesFromCard(card)) {
      const id = typeThemeId(typeName)
      typeThemeIdSet.add(id)
      typeTags.push({ oracleId: card.oracleId, themeId: id, synergy: 3 })
    }
  }
  const allThemesById = new Map<string, Theme>()
  for (const theme of [...themes, ...typeThemesFromIds([...typeThemeIdSet])]) {
    allThemesById.set(theme.id, theme)
  }
  const focusThemeIds = [...new Set((options?.focusThemeIds ?? []).filter(Boolean))]
  for (const id of focusThemeIds) {
    if (allThemesById.has(id)) continue
    const fromType = typeThemeFromId(id)
    if (fromType) allThemesById.set(id, fromType)
  }
  const allThemes = [...allThemesById.values()]
  const allTags = [...tags, ...typeTags]

  const tagsByCard = new Map<string, CardTheme[]>()
  for (const tag of allTags) {
    const list = tagsByCard.get(tag.oracleId) ?? []
    if (list.some((row) => row.themeId === tag.themeId)) continue
    list.push(tag)
    tagsByCard.set(tag.oracleId, list)
  }

  for (const card of cards) {
    const id = card.colorIdentity
    if (id.length === 0) colorCounts.C += 1
    else if (id.length > 1) colorCounts.M += 1
    for (const color of id) {
      colorCounts[color] = (colorCounts[color] ?? 0) + 1
    }

    const types = card.typeLine.split(/\s|—/).filter(Boolean)
    const primary = types[0] ?? 'Other'
    typeCounts[primary] = (typeCounts[primary] ?? 0) + 1

    if (isLand(card)) landCount += 1
    else {
      const bucket = curveBucket(card.cmc)
      curve[bucket] = (curve[bucket] ?? 0) + 1
      const colorGroup = id.length === 0 ? 'C' : id.length > 1 ? 'M' : id[0]!
      curveByColor[colorGroup] ??= { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 }
      curveByColor[colorGroup][bucket] = (curveByColor[colorGroup][bucket] ?? 0) + 1
    }

    if (isCreature(card)) creatureCount += 1
  }

  const presentIds = new Set<string>()
  for (const card of cards) {
    for (const tag of tagsByCard.get(card.oracleId) ?? []) presentIds.add(tag.themeId)
  }
  const activeThemes = allThemes.filter((t) => !t.hidden && presentIds.has(t.id))
  const themeIds = new Set(activeThemes.map((t) => t.id))
  const themeDensity: ThemeDensity[] = activeThemes
    .map((theme) => {
      const onTheme = cards
        .map((card) => ({
          card,
          tag: (tagsByCard.get(card.oracleId) ?? []).find((t) => t.themeId === theme.id),
        }))
        .filter((row) => row.tag)
      const overlapCount = onTheme.filter(
        ({ card }) =>
          (tagsByCard.get(card.oracleId) ?? []).filter((t) => themeIds.has(t.themeId)).length > 1,
      ).length
      const orphans = onTheme.length - overlapCount
      const weighted = onTheme.reduce((sum, row) => sum + (row.tag?.synergy ?? 0), 0)
      return {
        themeId: theme.id,
        name: theme.name,
        count: onTheme.length,
        weighted,
        asFan: asFan(onTheme.length, size),
        exposure: gannonExposure(onTheme.length, size),
        overlapCount,
        orphans,
      }
    })
    .sort((a, b) => b.count - a.count || b.weighted - a.weighted || a.name.localeCompare(b.name))

  const densityById = new Map(themeDensity.map((row) => [row.themeId, row]))
  const focusedDensity: ThemeDensity[] = focusThemeIds.length
    ? focusThemeIds.map((id) => {
        const existing = densityById.get(id)
        if (existing) return existing
        const theme = allThemesById.get(id)
        return {
          themeId: id,
          name: theme?.name ?? typeThemeFromId(id)?.name ?? id,
          count: 0,
          weighted: 0,
          asFan: 0,
          exposure: 0,
          overlapCount: 0,
          orphans: 0,
        }
      })
    : themeDensity.slice(0, TOP_THEME_COUNT)
  const topThemes = focusedDensity
  const topIds = new Set(topThemes.map((row) => row.themeId))
  for (const row of topThemes) {
    const overlapCount = cards.filter((card) => {
      const ts = (tagsByCard.get(card.oracleId) ?? []).filter((t) => topIds.has(t.themeId))
      return ts.some((t) => t.themeId === row.themeId) && ts.length >= 2
    }).length
    row.overlapCount = overlapCount
    row.orphans = row.count - overlapCount
  }

  const overlapMatrix: Array<{ a: string; b: string; count: number }> = []
  for (let i = 0; i < topThemes.length; i += 1) {
    for (let j = i + 1; j < topThemes.length; j += 1) {
      const a = topThemes[i]!
      const b = topThemes[j]!
      let count = 0
      for (const card of cards) {
        const ts = tagsByCard.get(card.oracleId) ?? []
        if (ts.some((t) => t.themeId === a.themeId) && ts.some((t) => t.themeId === b.themeId)) {
          count += 1
        }
      }
      if (count > 0) overlapMatrix.push({ a: a.themeId, b: b.themeId, count })
    }
  }
  overlapMatrix.sort((x, y) => y.count - x.count)

  const bridges: BridgeCard[] = []
  const pairCards = new Map<string, BridgeCard[]>()
  const orphans: CubeAnalysis['orphans'] = []
  function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  for (const card of cards) {
    const ts = [
      ...new Set(
        (tagsByCard.get(card.oracleId) ?? [])
          .map((t) => t.themeId)
          .filter((id) => topIds.has(id)),
      ),
    ].sort((a, b) => a.localeCompare(b))
    if (ts.length >= 2) {
      const bridge: BridgeCard = {
        oracleId: card.oracleId,
        name: card.name,
        themeIds: ts,
        imageNormal: card.imageNormal,
        faces: card.faces,
      }
      bridges.push(bridge)
      for (let i = 0; i < ts.length; i += 1) {
        for (let j = i + 1; j < ts.length; j += 1) {
          const key = pairKey(ts[i]!, ts[j]!)
          const list = pairCards.get(key) ?? []
          list.push(bridge)
          pairCards.set(key, list)
        }
      }
    } else if (ts.length === 1) {
      orphans.push({ oracleId: card.oracleId, name: card.name, themeId: ts[0]! })
    }
  }

  const nameOf = (id: string) => themeDensity.find((row) => row.themeId === id)?.name ?? id
  const bridgeGroups: BridgeGroup[] = [...pairCards.entries()]
    .map(([key, groupCards]) => {
      const [a, b] = key.split('|') as [string, string]
      const seen = new Set<string>()
      const unique = groupCards.filter((card) => {
        if (seen.has(card.oracleId)) return false
        seen.add(card.oracleId)
        return true
      })
      unique.sort((x, y) => x.name.localeCompare(y.name))
      return { themeIds: [a, b] as [string, string], count: unique.length, cards: unique }
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        nameOf(a.themeIds[0]).localeCompare(nameOf(b.themeIds[0])) ||
        nameOf(a.themeIds[1]).localeCompare(nameOf(b.themeIds[1])),
    )

  const typeCoverage = typeCoverageRows(cards, typeMinimums(size))
  const colorCoverage = colorCoverageRows(cards, colorPipTarget(size))
  const themeMix = computeThemeMix(cards, allTags, allThemes, options?.scoreThemeIds ?? [])
  const evaluation = evaluateCube(cards, themeMix, options?.eloByOracle)
  const mix = identityMix(cards)

  const warnings: Warning[] = []
  const goldMetric = evaluation.metrics.find((row) => row.id === 'goldNonland')
  if (goldMetric && goldMetric.score < 70) {
    warnings.push({
      id: 'gold',
      severity: 'warn',
      message: `Gold nonlands are ${(100 * mix.goldNonland / Math.max(1, size)).toFixed(1)}% (observed 3.6–15.6% on the eight popular lists).`,
    })
  }
  const gold3 = evaluation.metrics.find((row) => row.id === 'goldThree')
  if (gold3 && gold3.score < 70) {
    warnings.push({
      id: 'gold3',
      severity: 'warn',
      message: `3+ color nonlands are ${(100 * mix.goldThree / Math.max(1, size)).toFixed(1)}% of the cube (observed 0–3.3% on the eight popular lists).`,
    })
  }
  const supportedRow = evaluation.metrics.find((row) => row.id === 'supportedThemes')
  if (supportedRow && supportedRow.score < 70) {
    warnings.push({
      id: 'themes-supported',
      severity: 'warn',
      message: `${themeMix.supported} Tagger tags reach as-fan 1.0 (observed 10–16 on the eight popular lists).`,
    })
  }
  const eighth = evaluation.metrics.find((row) => row.id === 'eighthTheme')
  if (eighth && eighth.score < 70) {
    warnings.push({
      id: 'themes-eighth',
      severity: 'warn',
      message: `The 8th-densest tag is as-fan ${themeMix.eighthAsFan.toFixed(2)} (observed 1.13–1.47 on the eight popular lists).`,
    })
  }
  const bridgesRow = evaluation.metrics.find((row) => row.id === 'themeBridges')
  if (bridgesRow && bridgesRow.score < 70) {
    warnings.push({
      id: 'themes-bridges',
      severity: 'warn',
      message: `${(100 * themeMix.bridgeShare).toFixed(1)}% of cards in the densest eight tags also sit in a second of those tags (observed 45.8–52.3%).`,
    })
  }
  const coverageRow = evaluation.metrics.find((row) => row.id === 'themeCoverage')
  if (coverageRow && coverageRow.score < 70) {
    warnings.push({
      id: 'themes-coverage',
      severity: 'warn',
      message: `${(100 * themeMix.coverage).toFixed(1)}% of the cube sits in the densest eight tags (observed 76.3–83.9%).`,
    })
  }
  const pairsRow = evaluation.metrics.find((row) => row.id === 'connectedPairs')
  if (pairsRow && pairsRow.score < 70) {
    warnings.push({
      id: 'themes-pairs',
      severity: 'warn',
      message: `${themeMix.connectedPairs} top-8 tag pairs share at least 4 cards (observed 16–25).`,
    })
  }
  const colorMean = evaluation.metrics.find((row) => row.id === 'colorMeanSpread')
  if (colorMean && colorMean.score < 70) {
    warnings.push({
      id: 'color-mean-elo',
      severity: 'warn',
      message: `Color mean Elo spread is ${Math.round(colorMean.value)} (observed max 117 on the eight popular lists).`,
    })
  }
  const colorTop = evaluation.metrics.find((row) => row.id === 'colorP90Spread')
  if (colorTop && colorTop.score < 70) {
    warnings.push({
      id: 'color-top-elo',
      severity: 'warn',
      message: `Color top-10% Elo spread is ${Math.round(colorTop.value)} (observed max 164 on the eight popular lists).`,
    })
  }
  const focusFloor = evaluation.metrics.find((row) => row.id === 'focusMinAsFan')
  if (focusFloor && focusFloor.score < 70) {
    warnings.push({
      id: 'themes-focus',
      severity: 'warn',
      message: `The weakest favored tag is as-fan ${themeMix.focusMinAsFan.toFixed(2)}. Below 1.0 you will not see it every pack.`,
    })
  }
  if (themeMix.hasFocus && themeMix.focusCount >= 2 && themeMix.focusBridgeShare === 0) {
    warnings.push({
      id: 'themes-focus-bridges',
      severity: 'warn',
      message: 'No favored-tag card sits in two favored tags, so the seed themes have no glue.',
    })
  }
  if (size > 0 && landCount / size < BALANCE_BENCHMARKS.lands.low) {
    warnings.push({
      id: 'lands',
      severity: 'warn',
      message: `Fixing/lands are ${(100 * landCount / size).toFixed(1)}% of the cube (observed 9.3–21.9% on the eight popular lists).`,
    })
  }
  if (size > 0 && creatureCount / size < BALANCE_BENCHMARKS.creatures.low) {
    warnings.push({
      id: 'creatures',
      severity: 'warn',
      message: `Only ${(100 * creatureCount / size).toFixed(0)}% of the cube is creatures (observed 27–54% on the eight popular lists).`,
    })
  }
  for (const color of ['W', 'U', 'B', 'R', 'G']) {
    const colorCards = cards.filter((c) => c.colorIdentity.includes(color))
    const colorCreatures = colorCards.filter(isCreature).length
    const target = CREATURE_SHARE[color] ?? 0.5
    if (colorCards.length >= 12 && colorCreatures / colorCards.length < target - 0.15) {
      warnings.push({
        id: `creatures-${color}`,
        severity: 'info',
        message: `${color} creature share is ${((100 * colorCreatures) / colorCards.length).toFixed(0)}% (Rosewater default ~${Math.round(target * 100)}%).`,
      })
    }
  }
  const cheap = evaluation.metrics.find((row) => row.id === 'cheapSpells')
  if (cheap && cheap.score < 70) {
    warnings.push({
      id: 'cheap',
      severity: 'warn',
      message: `MV 0–2 nonlands are ${(100 * cheap.value).toFixed(1)}% of the cube (observed 43.1–55.6% on the eight popular lists).`,
    })
  }
  const spellCount = Math.max(0, size - landCount)
  if (spellCount > 0 && (curve['6+'] ?? 0) / spellCount > BALANCE_BENCHMARKS.curveTop.high + 0.04) {
    warnings.push({
      id: 'curve-high',
      severity: 'warn',
      message: `The 6+ bucket is ${(100 * (curve['6+'] ?? 0) / spellCount).toFixed(0)}% of nonlands — curve may be piled at the top.`,
    })
  }
  const colorCards = size - (colorCounts.C ?? 0)
  for (const color of ['W', 'U', 'B', 'R', 'G']) {
    const n = colorCounts[color] ?? 0
    if (colorCards > 40 && n < colorCards * 0.12) {
      warnings.push({
        id: `color-${color}`,
        severity: 'warn',
        message: `${color} identity appears on only ${n} cards and may be starved.`,
      })
    }
  }
  for (const row of typeCoverage) {
    if (row.count < row.min) {
      warnings.push({
        id: `type-${row.type}`,
        severity: 'warn',
        message: `${row.type} count ${row.count} is below the generation floor of ${row.min}.`,
      })
    }
  }
  for (const row of colorCoverage) {
    if (row.pips + 0.01 < row.target - 8) {
      warnings.push({
        id: `color-pips-${row.color}`,
        severity: 'warn',
        message: `${row.color} pips ${row.pips.toFixed(0)} are below the even-split target of ${row.target.toFixed(0)}.`,
      })
    }
  }
  for (const row of topThemes) {
    if (size > 0 && row.count >= 12 && row.asFan < 1) {
      warnings.push({
        id: `theme-${row.themeId}`,
        severity: 'warn',
        message: `${row.name} as-fan is ${row.asFan.toFixed(2)} (below 1.0 per pack).`,
      })
    }
  }
  const typalSupport = typalSupportRows(cards, allTags, allThemes, size).filter((row) =>
    typalRowNeedsSupport(row, cards),
  )
  for (const row of typalSupport) {
    if (row.members < row.want) {
      warnings.push({
        id: `typal-${row.typeId}`,
        severity: 'warn',
        message: `${row.label} has ${row.payoffs.length} payoff${row.payoffs.length === 1 ? '' : 's'} (${row.payoffs
          .map((card) => card.name)
          .join(', ')}) but only ${row.members} ${row.memberNoun} (need ${row.want}).`,
        cards: row.payoffs,
      })
    }
  }

  return {
    size,
    colorCounts,
    typeCounts,
    curve,
    curveByColor,
    landCount,
    landShare: size ? landCount / size : 0,
    spellCount,
    creatureCount,
    creatureShare: size ? creatureCount / size : 0,
    themeDensity,
    focusedDensity,
    focusedThemeIds: [...topIds],
    typeCoverage,
    colorCoverage,
    evaluation,
    overlapMatrix,
    bridges,
    bridgeGroups,
    orphans,
    typalSupport,
    warnings,
  }
}
