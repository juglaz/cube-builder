import { analyzeCube, asFan } from './analysis'
import { cmcBucket, isCreature, isLand, typeFloorTypes, type SpellFloorType } from './cardMeta'
import { expandCobraNeighborhood, type CobraOverlap } from './cobra'
import { eloOf, highEloPerColorFloor, highEloThreshold, MISSING_ELO } from './elo'
import { colorLabel } from './format'
import { parseTypeThemeId, typeThemeId } from './creatureTypes'
import { synergyLaneNeedsCubeSupport } from './synergyLanes'
import {
  cardLaneFlags,
  displayTypalLabel,
  parseSynergyThemeId,
  synergyRoleForSlug,
  themeCreatureType,
  themeSlugsByOracle,
  typalMemberFloor,
  typalRolesForCard,
  typalRowNeedsSupport,
  typalSupportRows,
} from './tagSupport'
import {
  colorCoverageRows,
  colorPipTarget,
  typeCoverageRows,
  typeMinimums,
} from './coverage'
import { goldNonlandTarget, goldThreeTarget, SPELL_CURVE_SHARE, BALANCE_BENCHMARKS, type CubeEvaluation } from './balance'
import { isAmbientTheme, isStructuralTheme, DOMINANT_AS_FAN, PLAYABLE_AS_FAN } from './themeStructure'
import { cardDependsOnOtherNamedCard } from './namedCardLock'
import type { ThemeOverlapContext } from './generatePool'
import type { CardTheme, GenerationSettings, LibraryCard, Theme } from '../types'

export const CURVE_SHARE: Record<string, number> = { ...SPELL_CURVE_SHARE }

/** Favored tags that get as-fan floors. Extra selected tags still score as glue. */
export const MAX_THEME_FLOORS = 4

export const CREATURE_SHARE: Record<string, number> = {
  W: 0.62,
  U: 0.5,
  B: 0.56,
  R: 0.53,
  G: 0.59,
}

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const
export type Color = (typeof COLORS)[number]

export type GeneratorEngine = 'mip'

export type SolverInfo = {
  status: string
  objective: number | null
  runtimeMs: number
  poolSize: number
  gap?: number
}

export type GenerateReport = {
  settings: GenerationSettings
  engine: GeneratorEngine
  solver?: SolverInfo
  selected: string[]
  themeCoverage: Array<{ themeId: string; name: string; count: number; min: number; asFan: number }>
  typeCoverage: Array<{ type: string; count: number; min: number }>
  colorCoverage: Array<{ color: string; pips: number; identity: number; target: number }>
  evaluation: CubeEvaluation
  overlapBands: Array<{ hits: number; count: number }>
  seedNames: string[]
  bridges: Array<{
    oracleId: string
    name: string
    themeIds: string[]
    imageNormal: string
    faces?: LibraryCard['faces']
  }>
  unmet: string[]
  libraryGaps: string[]
  phases: string[]
}

export type GenMeta = {
  tags: CardTheme[]
  colorW: Record<string, number>
  bucket: string
  types: SpellFloorType[]
  land: boolean
  creature: boolean
  synergy: number
  extraThemes: number
  incidental: string[]
  coreTags: string[]
  sparse: string[]
  structTags: string[]
  cobraRank: number
  seedHits: number
  themeGlue: number
  themeOverlapHits: number
  elo: number
  high: boolean
  typalMembers: string[]
  typalPayoffs: string[]
}

export type Targets = {
  minTheme: number
  maxTheme: number
  land: number
  creatures: number
  types: Record<string, number>
  curve: Record<string, number>
  color: number
  goldNonland: number
  goldThree: number
  tightness: number
  overlapBonus: number
  size: number
  floorThemeIds: string[]
  maxSupported: number
  maxDominant: number
  incidentalMax: number
  sparseMax: number
  ambientIds: string[]
  highThreshold: number
  highPerColor: number
  highColorAvailable: Record<string, number>
  typalMemberMin: number
  typalTypeIds: string[]
}

export type GenerationContext = {
  kind: 'seed' | 'theme'
  settings: GenerationSettings
  pool: LibraryCard[]
  poolMap: Map<string, LibraryCard>
  metaOf: Map<string, GenMeta>
  targets: Targets
  themeIds: string[]
  themes: Theme[]
  selectedThemes: Theme[]
  seedSet: Set<string>
  lockSet: Set<string>
  seedCards: LibraryCard[]
  minPerTheme: number
  floorThemeIds: string[]
  typeMins: Record<SpellFloorType, number>
  tags: CardTheme[]
  overlaps: Map<string, CobraOverlap>
  libraryGaps: string[]
  introPhases: string[]
}

export function isColor(value: string): value is Color {
  return (COLORS as readonly string[]).includes(value)
}

export function identityColors(card: LibraryCard): Color[] {
  return card.colorIdentity.filter(isColor)
}

export function colorBand(targets: Targets): number {
  return 8 / Math.max(0.5, targets.tightness)
}

export function colorMin(targets: Targets): number {
  return targets.color - colorBand(targets)
}

export function themeMinimum(size: number, themeCount: number, asFanTarget: number): number {
  if (themeCount <= 0) return 0
  return Math.max(8, Math.round((asFanTarget * size) / 15))
}

/** Floor lanes stay pack-visible without also becoming extra dominant tags. */
export function themeMax(minPerTheme: number, size: number, themeCount: number): number {
  if (themeCount <= 0) return size
  const justBelowDominant = Math.max(0, Math.floor((DOMINANT_AS_FAN * size) / 15) - 1)
  return Math.max(minPerTheme, justBelowDominant)
}

export function floorThemeIdsFor(themeIds: string[]): string[] {
  return themeIds.slice(0, MAX_THEME_FLOORS)
}

function tagShape(
  allTags: CardTheme[],
  structural: Set<string>,
  floorSet: Set<string>,
  ambientSet: Set<string>,
  favored: Set<string>,
): { incidental: string[]; coreTags: string[]; sparse: string[]; structTags: string[] } {
  const incidental: string[] = []
  const coreTags: string[] = []
  const sparse: string[] = []
  const structTags: string[] = []
  const seen = new Set<string>()
  for (const tag of allTags) {
    if (!structural.has(tag.themeId) || seen.has(tag.themeId)) continue
    seen.add(tag.themeId)
    structTags.push(tag.themeId)
    if (floorSet.has(tag.themeId) || ambientSet.has(tag.themeId)) coreTags.push(tag.themeId)
    else sparse.push(tag.themeId)
    if (!favored.has(tag.themeId)) incidental.push(tag.themeId)
  }
  return { incidental, coreTags, sparse, structTags }
}

function densityCaps(size: number, floorThemeIds: string[], minPerTheme: number, themes: Theme[]) {
  const dominantCut = Math.floor((DOMINANT_AS_FAN * size) / 15)
  const playableCut = Math.floor((PLAYABLE_AS_FAN * size) / 15)
  return {
    minTheme: minPerTheme,
    maxTheme: themeMax(minPerTheme, size, Math.max(1, floorThemeIds.length)),
    size,
    floorThemeIds,
    maxSupported: BALANCE_BENCHMARKS.supportedThemes.median,
    maxDominant: Math.round(BALANCE_BENCHMARKS.dominantThemes.median),
    incidentalMax: Math.max(0, dominantCut - 1),
    sparseMax: Math.max(0, playableCut - 1),
    ambientIds: themes.filter(isAmbientTheme).map((theme) => theme.id),
    highThreshold: Number.POSITIVE_INFINITY,
    highPerColor: 0,
    highColorAvailable: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    typalMemberMin: 0,
    typalTypeIds: [],
  }
}

export function highEloWant(targets: Targets, color: Color): number {
  return Math.min(targets.highPerColor, targets.highColorAvailable[color] ?? 0)
}

export function attachHighElo(
  metaOf: Map<string, GenMeta>,
  cards: LibraryCard[],
  targets: Targets,
  settings: GenerationSettings,
  introPhases: string[],
  eloMap?: Map<string, number>,
): void {
  const map = eloMap ?? new Map<string, number>()
  const spellElos: number[] = []
  for (const card of cards) {
    if (isLand(card)) continue
    spellElos.push(eloOf(card.oracleId, map))
  }
  const threshold =
    map.size === 0 ? Number.POSITIVE_INFINITY : highEloThreshold(spellElos, settings.eloMin, settings.eloMax)
  const perColor = map.size === 0 ? 0 : highEloPerColorFloor(settings.targetSize)
  const available: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const card of cards) {
    const meta = metaOf.get(card.oracleId)
    if (!meta) continue
    const elo = eloOf(card.oracleId, map)
    const high = !meta.land && Number.isFinite(threshold) && elo >= threshold
    meta.elo = elo
    meta.high = high
    if (high) {
      for (const color of identityColors(card)) {
        available[color] = (available[color] ?? 0) + 1
      }
    }
  }
  targets.highThreshold = threshold
  targets.highPerColor = perColor
  targets.highColorAvailable = available
  if (perColor > 0 && Number.isFinite(threshold)) {
    introPhases.push(
      `High-Elo magnets: at least ${perColor} identity hits per color at Elo ≥ ${Math.round(threshold)} so each color has cards worth picking into.`,
    )
  }
}

function reportHighEloGaps(cards: LibraryCard[], metaOf: Map<string, GenMeta>, targets: Targets, unmet: string[]): void {
  if (targets.highPerColor <= 0) return
  const have: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const card of cards) {
    const meta = metaOf.get(card.oracleId)
    if (!meta?.high) continue
    for (const color of identityColors(card)) {
      have[color] = (have[color] ?? 0) + 1
    }
  }
  for (const color of COLORS) {
    const want = highEloWant(targets, color)
    if (want <= 0) continue
    const n = have[color] ?? 0
    if (n < want) {
      unmet.push(
        `${colorLabel(color)} high-Elo magnets ${n} < ${want} (Elo ≥ ${Math.round(targets.highThreshold)}).`,
      )
    }
  }
}

export function attachTypalSupport(
  metaOf: Map<string, GenMeta>,
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  targets: Targets,
  settings: GenerationSettings,
  introPhases: string[],
): void {
  const themesById = new Map(themes.map((theme) => [theme.id, theme]))
  const ranked = typalSupportRows(cards, tags, themes, settings.targetSize)
    .filter((row) => typalRowNeedsSupport(row, cards))
    .slice(0, 8)
  const payoffTypes = new Set(ranked.map((row) => row.typeId))
  for (const card of cards) {
    const meta = metaOf.get(card.oracleId)
    if (!meta) continue
    const roles = typalRolesForCard(card, tags, themesById)
    meta.typalMembers = roles.filter((role) => role.member && payoffTypes.has(role.typeId)).map((role) => role.typeId)
    meta.typalPayoffs = roles.filter((role) => role.payoff && payoffTypes.has(role.typeId)).map((role) => role.typeId)
  }
  const typeIds = [...payoffTypes]
  const min = typeIds.length > 0 ? typalMemberFloor(settings.targetSize) : 0
  targets.typalTypeIds = typeIds
  targets.typalMemberMin = min
  for (const meta of metaOf.values()) {
    meta.incidental = meta.incidental.filter((id) => {
      const theme = themesById.get(id)
      const typeName = theme ? themeCreatureType(theme) : parseTypeThemeId(id)
      if (typeName && payoffTypes.has(typeThemeId(typeName))) return false
      const role = synergyRoleForSlug(theme?.slug)
      const lane = role?.lane ?? parseSynergyThemeId(id)
      if (lane && payoffTypes.has(`synergy:${lane}`)) return false
      return true
    })
  }
  if (typeIds.length > 0) {
    const labels = typeIds.map((id) => displayTypalLabel(parseTypeThemeId(id) ?? parseSynergyThemeId(id) ?? id))
    introPhases.push(
      `Payoff support: at least ${min} members/enablers for ${labels.join(', ')} whenever those payoffs are in the cube.`,
    )
  }
}

function reportTypalGaps(
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  targets: Targets,
  unmet: string[],
): void {
  for (const row of typalSupportRows(cards, tags, themes, targets.size)) {
    if (!typalRowNeedsSupport(row, cards)) continue
    unmet.push(
      `${row.label} has ${row.payoffs.length} payoff${row.payoffs.length === 1 ? '' : 's'} but only ${row.members} ${row.memberNoun} (need ${row.want}).`,
    )
  }
}

export function enforcePayoffSupport(
  ctx: GenerationContext,
  picked: Set<string>,
): { swapped: number; dropped: string[]; refilled: number } {
  const { pool, poolMap, metaOf, tags, themes, lockSet, settings } = ctx
  const themesById = new Map(themes.map((theme) => [theme.id, theme]))
  const slugsByOracle = themeSlugsByOracle(tags, themes)
  const bonus = settings.overlapBonus
  const wantFloor = typalMemberFloor(settings.targetSize)

  const glue = (id: string) => {
    const meta = metaOf.get(id)
    return meta ? glueScore(meta, bonus) : 0
  }

  const flags = (card: LibraryCard, row: { typeId: string; kind: 'typal' | 'synergy'; typeName: string }) =>
    cardLaneFlags(card, row.typeId, row.kind, row.typeName, tags, themesById, slugsByOracle.get(card.oracleId))

  const pickedCards = () => [...picked].map((id) => poolMap.get(id)).filter((card): card is LibraryCard => Boolean(card))

  const cubeRows = () => typalSupportRows(pickedCards(), tags, themes, settings.targetSize)
  const starving = () => cubeRows().filter((row) => typalRowNeedsSupport(row))

  let swapped = 0
  for (let round = 0; round < 12; round += 1) {
    const rows = starving()
    if (rows.length === 0) break
    let moved = 0
    for (const row of rows) {
      const short = row.want - row.members
      if (short <= 0) continue
      const members = pool
        .filter((card) => !picked.has(card.oracleId) && flags(card, row).member)
        .sort((a, b) => glue(b.oracleId) - glue(a.oracleId))
      const droppable = pickedCards()
        .filter((card) => !lockSet.has(card.oracleId) && !flags(card, row).member && !flags(card, row).payoff)
        .sort((a, b) => glue(a.oracleId) - glue(b.oracleId))
      const n = Math.min(short, members.length, droppable.length)
      for (let i = 0; i < n; i += 1) {
        const drop = droppable[i]!
        const add = members[i]!
        if (!picked.has(drop.oracleId) || picked.has(add.oracleId)) continue
        picked.delete(drop.oracleId)
        picked.add(add.oracleId)
        swapped += 1
        moved += 1
      }
      if (moved > 0) break
    }
    if (moved === 0) break
  }

  const dropped: string[] = []
  for (const row of starving()) {
    for (const payoff of row.payoffs) {
      if (lockSet.has(payoff.oracleId)) continue
      if (picked.delete(payoff.oracleId)) dropped.push(payoff.name)
    }
  }

  const memberByType = () => new Map(cubeRows().map((row) => [row.typeId, row.members] as const))

  const wouldStarve = (card: LibraryCard, membersNow: Map<string, number>) => {
    const roles = typalRolesForCard(card, tags, themesById)
    for (const role of roles) {
      if (!role.payoff) continue
      if (role.kind === 'synergy' && !synergyLaneNeedsCubeSupport(role.typeName)) continue
      const lane = flags(card, role)
      const members = (membersNow.get(role.typeId) ?? 0) + (lane.member ? 1 : 0)
      if (members < wantFloor) return true
    }
    return false
  }

  let refilled = 0
  const ranked = pool.slice().sort((a, b) => glue(b.oracleId) - glue(a.oracleId))
  while (picked.size < settings.targetSize) {
    const membersNow = memberByType()
    const next = ranked.find((card) => !picked.has(card.oracleId) && !wouldStarve(card, membersNow))
    if (!next) break
    picked.add(next.oracleId)
    refilled += 1
  }

  return { swapped, dropped, refilled }
}

export function themeCap(id: string, targets: Targets, floorSet?: Set<string>, ambientSet?: Set<string>): number {
  const floors = floorSet ?? new Set(targets.floorThemeIds)
  const ambient = ambientSet ?? new Set(targets.ambientIds)
  if (floors.has(id)) return targets.maxTheme
  if (ambient.has(id)) return targets.size
  return targets.sparseMax
}

export function isDraftable(card: LibraryCard): boolean {
  if (card.layout === 'art_series' || card.layout === 'token' || card.layout === 'emblem') return false
  if (/\bToken\b/i.test(card.typeLine)) return false
  if (/\bBasic\b/.test(card.typeLine) && isLand(card)) return false
  if (cardDependsOnOtherNamedCard(card)) return false
  return true
}

export function colorWeights(card: LibraryCard): Record<string, number> {
  const id = card.colorIdentity
  if (id.length === 0) return { C: 1 }
  const w = 1 / id.length
  return Object.fromEntries(id.map((c) => [c, w]))
}

/** Combined Cobra + Tagger glue. Theme overlap can beat a single-seed Cobra neighbor. */
export function glueScore(meta: GenMeta, overlapBonus: number): number {
  const cobraRankBonus = meta.cobraRank > 0 ? Math.max(0, 8 - meta.cobraRank / 20) : 0
  return (
    meta.seedHits * 10 +
    meta.themeGlue * (8 + overlapBonus) +
    meta.themeOverlapHits * (8 + overlapBonus) +
    meta.synergy * 0.25 +
    cobraRankBonus +
    overlapBonus * meta.extraThemes * 0.12 -
    meta.sparse.length * 0.55 +
    Math.min(2, meta.coreTags.length) * 2.1 -
    Math.max(0, meta.coreTags.length - 2) * 2.2
  )
}

export function curveTargets(size: number, landSlots: number): Record<string, number> {
  const spells = Math.max(1, size - landSlots)
  return Object.fromEntries(
    Object.entries(CURVE_SHARE).map(([k, share]) => [k, Math.round(spells * share)]),
  )
}

function buildTagIndex(tags: CardTheme[]): Map<string, CardTheme[]> {
  const map = new Map<string, CardTheme[]>()
  for (const tag of tags) {
    const list = map.get(tag.oracleId) ?? []
    list.push(tag)
    map.set(tag.oracleId, list)
  }
  return map
}

function tagsFor(card: LibraryCard, index: Map<string, CardTheme[]>, themeIds: string[]): CardTheme[] {
  return (index.get(card.oracleId) ?? []).filter((t) => themeIds.includes(t.themeId))
}

function slimPool(library: LibraryCard[], metaOf: Map<string, GenMeta>, themeIds: string[]): LibraryCard[] {
  const keep = new Set<string>()
  for (const themeId of themeIds) {
    const ranked = library
      .filter((card) => metaOf.get(card.oracleId)?.tags.some((t) => t.themeId === themeId))
      .sort((a, b) => {
        const ma = metaOf.get(a.oracleId)!
        const mb = metaOf.get(b.oracleId)!
        const sa = ma.tags.find((t) => t.themeId === themeId)?.synergy ?? 0
        const sb = mb.tags.find((t) => t.themeId === themeId)?.synergy ?? 0
        if (sb !== sa) return sb - sa
        return mb.synergy - ma.synergy
      })
    let taken = 0
    for (const card of ranked) {
      const syn = metaOf.get(card.oracleId)?.tags.find((t) => t.themeId === themeId)?.synergy ?? 0
      if (syn >= 4 || taken < 80) {
        keep.add(card.oracleId)
        taken += 1
      }
    }
  }
  for (const card of library) {
    if (isLand(card) || (metaOf.get(card.oracleId)?.cobraRank ?? 0) > 0) keep.add(card.oracleId)
    if ((metaOf.get(card.oracleId)?.types.length ?? 0) > 0) keep.add(card.oracleId)
    if (metaOf.get(card.oracleId)?.high) keep.add(card.oracleId)
    const meta = metaOf.get(card.oracleId)
    if (meta && (meta.typalMembers.length > 0 || meta.typalPayoffs.length > 0)) keep.add(card.oracleId)
  }
  return library.filter((card) => keep.has(card.oracleId))
}

function reportColorGaps(cards: LibraryCard[], targets: Targets, unmet: string[]): void {
  const min = colorMin(targets)
  for (const row of colorCoverageRows(cards, targets.color)) {
    if (row.pips + 0.01 < min) {
      unmet.push(`${row.color} pips ${row.pips.toFixed(0)} < ${min.toFixed(0)}.`)
    }
  }
}

function reportTypeFloorGaps(
  cards: LibraryCard[],
  typeMins: Record<SpellFloorType, number>,
  unmet: string[],
): void {
  for (const row of typeCoverageRows(cards, typeMins)) {
    if (row.count < row.min) unmet.push(`${row.type} count ${row.count} < ${row.min}.`)
  }
}

export function prepareSeedGeneration(
  library: LibraryCard[],
  settings: GenerationSettings,
  cobraNeighbors: Map<string, string[]>,
  overlaps: Map<string, CobraOverlap>,
  tags: CardTheme[],
  themes: Theme[],
  themeOverlap?: ThemeOverlapContext,
  eloMap?: Map<string, number>,
): GenerationContext {
  const seedIds = settings.seedOracleIds ?? []
  const seedSet = new Set(seedIds)
  const lockSet = new Set([...seedIds, ...(settings.lockOracleIds ?? [])])
  const libraryGaps: string[] = []
  const introPhases: string[] = []
  const poolMap = new Map(library.map((card) => [card.oracleId, card]))
  const seedCards = seedIds.map((id) => poolMap.get(id)).filter((c): c is LibraryCard => Boolean(c))

  if (seedCards.length < seedIds.length) {
    libraryGaps.push('Some seed cards were missing from the local Oracle catalog.')
  }
  for (const seed of seedCards) {
    if (!cobraNeighbors.has(seed.oracleId)) {
      libraryGaps.push(`${seed.name} has no Cube Cobra synergistic list — it will still sit in the cube.`)
    }
  }
  if (overlaps.size === 0) {
    libraryGaps.push('Cube Cobra returned no neighbors for these seeds. Try cards that see more cube play.')
  }

  const overlapThemeIds = themeOverlap?.overlapThemeIds ?? []
  const unionThemeIds = new Set(themeOverlap?.unionThemeIds ?? overlapThemeIds)
  const overlapSet = new Set(overlapThemeIds)
  const floorThemeIds = floorThemeIdsFor(overlapThemeIds)
  const floorSet = new Set(floorThemeIds)
  const structural = new Set(themes.filter(isStructuralTheme).map((theme) => theme.id))
  const ambientSet = new Set(themes.filter(isAmbientTheme).map((theme) => theme.id))
  const themesBySeed = themeOverlap?.themesBySeed ?? new Map<string, string[]>()
  const tagIndex = buildTagIndex(tags)
  const selectedThemes = themes.filter((t) => overlapSet.has(t.id))

  const metaOf = new Map<string, GenMeta>()
  for (const card of library) {
    const isSeed = seedSet.has(card.oracleId)
    const ov = overlaps.get(card.oracleId)
    const seedHits = isSeed ? Math.max(2, seedIds.length) : (ov?.seedHits ?? 0)
    const allTags = tagIndex.get(card.oracleId) ?? []
    const cardTags = allTags.filter((t) => unionThemeIds.has(t.themeId))
    let themeGlue = 0
    for (const seedThemeIds of themesBySeed.values()) {
      if (cardTags.some((t) => seedThemeIds.includes(t.themeId))) themeGlue += 1
    }
    if (isSeed) themeGlue = Math.max(themeGlue, themesBySeed.size || seedIds.length)
    const themeOverlapHits = cardTags.filter((t) => overlapSet.has(t.themeId)).length
    const themeWeight = cardTags.reduce((sum, t) => sum + t.synergy, 0)
    const cobraPart = isSeed ? 48 : ov ? (ov.hop === 1 ? ov.seedHits * 8 + 10 : 3) : 0
    const shape = tagShape(allTags, structural, floorSet, ambientSet, overlapSet)
    metaOf.set(card.oracleId, {
      tags: cardTags.filter((t) => overlapSet.has(t.themeId)),
      colorW: colorWeights(card),
      bucket: cmcBucket(card.cmc),
      types: typeFloorTypes(card),
      land: isLand(card),
      creature: isCreature(card),
      synergy: cobraPart + themeGlue * 6 + themeWeight,
      extraThemes:
        (isSeed ? Math.max(0, seedIds.length - 1) : Math.max(0, seedHits - 1)) +
        Math.max(0, themeGlue - 1) +
        themeOverlapHits,
      incidental: shape.incidental,
      coreTags: shape.coreTags,
      sparse: shape.sparse,
      structTags: shape.structTags,
      cobraRank: isSeed ? 1 : (ov?.bestRank ?? 0),
      seedHits,
      themeGlue,
      themeOverlapHits,
      elo: MISSING_ELO,
      high: false,
      typalMembers: [],
      typalPayoffs: [],
    })
  }

  const rawMin = themeMinimum(settings.targetSize, floorThemeIds.length, settings.themeAsFanTarget)
  const floorCap = Math.max(
    8,
    Math.floor((settings.targetSize * 0.42) / Math.max(1, floorThemeIds.length)),
  )
  const minPerTheme = floorThemeIds.length > 0 ? Math.min(rawMin, floorCap) : 0
  const typeMins = typeMinimums(settings.targetSize)
  const targets: Targets = {
    ...densityCaps(settings.targetSize, floorThemeIds, minPerTheme, themes),
    land: Math.round(settings.targetSize * settings.landQuota),
    creatures: Math.round(settings.targetSize * 0.408),
    types: typeMins,
    curve: curveTargets(settings.targetSize, Math.round(settings.targetSize * settings.landQuota)),
    color: colorPipTarget(settings.targetSize),
    goldNonland: goldNonlandTarget(settings.targetSize),
    goldThree: goldThreeTarget(settings.targetSize),
    tightness: Math.max(0.5, settings.colorTightness),
    overlapBonus: settings.overlapBonus,
  }
  attachHighElo(metaOf, library, targets, settings, introPhases, eloMap)
  attachTypalSupport(metaOf, library, tags, themes, targets, settings, introPhases)

  if ([...themesBySeed.values()].every((ids) => ids.length === 0) && overlapThemeIds.length === 0) {
    libraryGaps.push(
      'No Tagger tags on these seeds. Download Tagger on Themes, or favor tags on the seed cards.',
    )
  }

  const hop1 = [...overlaps.values()].filter((o) => o.hop === 1)
  const multi = hop1.filter((o) => o.seedHits >= 2).length
  introPhases.push(
    `${hop1.length} direct synergistic neighbors; ${multi} overlap ${seedIds.length > 1 ? 'at least two seeds' : 'with the seed'}.`,
  )
  if (selectedThemes.length > 0) {
    introPhases.push(`Favored seed tags: ${selectedThemes.map((t) => t.name).join(', ')}.`)
    if (floorThemeIds.length < overlapThemeIds.length) {
      const floored = selectedThemes.filter((t) => floorSet.has(t.id)).map((t) => t.name)
      introPhases.push(
        `As-fan floors apply to ${floorThemeIds.length} of ${overlapThemeIds.length} favored tags (${floored.join(', ')}); the rest stay as glue so the cube does not theme-soup.`,
      )
    }
    introPhases.push(
      `Theme mix aims for ~${BALANCE_BENCHMARKS.supportedThemes.median} playable / ${Math.round(BALANCE_BENCHMARKS.dominantThemes.median)} dominant tags, with top-8 coverage and bridges in the popular-cube band.`,
    )
  } else {
    introPhases.push('No favored Tagger tags on the seeds (or Tagger catalog is missing).')
  }

  return {
    kind: 'seed',
    settings,
    pool: library,
    poolMap,
    metaOf,
    targets,
    themeIds: overlapThemeIds,
    themes,
    selectedThemes,
    seedSet,
    lockSet,
    seedCards,
    minPerTheme,
    floorThemeIds,
    typeMins,
    tags,
    overlaps,
    libraryGaps,
    introPhases,
  }
}

export function prepareThemeGeneration(
  library: LibraryCard[],
  settings: GenerationSettings,
  cobraNeighbors: Map<string, string[]>,
  tags: CardTheme[],
  themes: Theme[],
  eloMap?: Map<string, number>,
): GenerationContext {
  const themeIds = settings.themeIds
  const selectedThemes = themes.filter((t) => themeIds.includes(t.id))
  const floorThemeIds = floorThemeIdsFor(themeIds)
  const favored = new Set(themeIds)
  const structural = new Set(themes.filter(isStructuralTheme).map((theme) => theme.id))
  const ambientSet = new Set(themes.filter(isAmbientTheme).map((theme) => theme.id))
  const floorSet = new Set(floorThemeIds)
  const libraryGaps: string[] = []
  const introPhases: string[] = []
  const tagIndex = buildTagIndex(tags)
  const metaOf = new Map<string, GenMeta>()
  for (const card of library) {
    const allTags = tagIndex.get(card.oracleId) ?? []
    const cardTags = tagsFor(card, tagIndex, themeIds)
    const shape = tagShape(allTags, structural, floorSet, ambientSet, favored)
    metaOf.set(card.oracleId, {
      tags: cardTags,
      colorW: colorWeights(card),
      bucket: cmcBucket(card.cmc),
      types: typeFloorTypes(card),
      land: isLand(card),
      creature: isCreature(card),
      synergy: cardTags.reduce((sum, t) => sum + t.synergy, 0),
      extraThemes: Math.max(0, cardTags.length - 1),
      incidental: shape.incidental,
      coreTags: shape.coreTags,
      sparse: shape.sparse,
      structTags: shape.structTags,
      cobraRank: 0,
      seedHits: 0,
      themeGlue: 0,
      themeOverlapHits: 0,
      elo: MISSING_ELO,
      high: false,
      typalMembers: [],
      typalPayoffs: [],
    })
  }

  if (cobraNeighbors.size > 0) {
    const seedOracleIds = library
      .filter((card) => metaOf.get(card.oracleId)?.tags.some((t) => t.synergy === 4))
      .map((card) => card.oracleId)
    const ranked = expandCobraNeighborhood(seedOracleIds, cobraNeighbors, 2)
    ranked.forEach((id, i) => {
      const meta = metaOf.get(id)
      if (meta) meta.cobraRank = i + 1
    })
  }

  const taggedIds = new Set(
    library.filter((card) => (metaOf.get(card.oracleId)?.tags.length ?? 0) > 0).map((c) => c.oracleId),
  )
  const minPerTheme = themeMinimum(settings.targetSize, floorThemeIds.length, settings.themeAsFanTarget)
  const typeMins = typeMinimums(settings.targetSize)
  for (const theme of selectedThemes.filter((t) => floorThemeIds.includes(t.id))) {
    const available = library.filter((c) =>
      metaOf.get(c.oracleId)?.tags.some((t) => t.themeId === theme.id),
    ).length
    if (available === 0) libraryGaps.push(`${theme.name} has no library cards with that tag.`)
    else if (available < minPerTheme) {
      libraryGaps.push(`${theme.name} has only ${available} tagged cards; target is ${minPerTheme}.`)
    }
  }
  if (library.length === 0) libraryGaps.push('The library is empty, so no cards can be selected.')
  else if (taggedIds.size === 0) libraryGaps.push('No library cards match the selected tags.')

  const targets: Targets = {
    ...densityCaps(settings.targetSize, floorThemeIds, minPerTheme, themes),
    land: Math.round(settings.targetSize * settings.landQuota),
    creatures: Math.round(settings.targetSize * 0.408),
    types: typeMins,
    curve: curveTargets(settings.targetSize, Math.round(settings.targetSize * settings.landQuota)),
    color: colorPipTarget(settings.targetSize),
    goldNonland: goldNonlandTarget(settings.targetSize),
    goldThree: goldThreeTarget(settings.targetSize),
    tightness: Math.max(0.5, settings.colorTightness),
    overlapBonus: settings.overlapBonus,
  }
  attachHighElo(metaOf, library, targets, settings, introPhases, eloMap)
  attachTypalSupport(metaOf, library, tags, themes, targets, settings, introPhases)
  const pool = slimPool(library, metaOf, themeIds)
  const poolMap = new Map(pool.map((card) => [card.oracleId, card]))

  introPhases.push(`Theme pool slimmed to ${pool.length} candidates for ${selectedThemes.length} tags.`)
  if (floorThemeIds.length < themeIds.length) {
    introPhases.push(
      `As-fan floors apply to ${floorThemeIds.length} of ${themeIds.length} tags; the rest stay as glue.`,
    )
  }
  introPhases.push(
    `Theme mix aims for ~${BALANCE_BENCHMARKS.supportedThemes.median} playable / ${Math.round(BALANCE_BENCHMARKS.dominantThemes.median)} dominant tags, with top-8 coverage and bridges in the popular-cube band.`,
  )

  return {
    kind: 'theme',
    settings,
    pool,
    poolMap,
    metaOf,
    targets,
    themeIds,
    themes,
    selectedThemes,
    seedSet: new Set(),
    lockSet: new Set(settings.lockOracleIds ?? []),
    seedCards: [],
    minPerTheme,
    floorThemeIds,
    typeMins,
    tags,
    overlaps: new Map(),
    libraryGaps,
    introPhases,
  }
}

export function prepareGeneration(
  library: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
  settings: GenerationSettings,
  cobraNeighbors: Map<string, string[]> = new Map(),
  overlaps: Map<string, CobraOverlap> = new Map(),
  themeOverlap?: ThemeOverlapContext,
  eloMap?: Map<string, number>,
): GenerationContext {
  if ((settings.seedOracleIds ?? []).length > 0) {
    return prepareSeedGeneration(library, settings, cobraNeighbors, overlaps, tags, themes, themeOverlap, eloMap)
  }
  return prepareThemeGeneration(library, settings, cobraNeighbors, tags, themes, eloMap)
}

export function finishGeneration(
  ctx: GenerationContext,
  picked: Set<string>,
  extraPhases: string[],
  extras?: { engine: GeneratorEngine; solver?: SolverInfo },
): { oracleIds: string[]; report: GenerateReport } {
  const {
    settings,
    poolMap,
    metaOf,
    targets,
    selectedThemes,
    seedSet,
    seedCards,
    minPerTheme,
    floorThemeIds,
    typeMins,
    tags,
    overlaps,
    libraryGaps,
    introPhases,
    kind,
    themes,
  } = ctx
  const phases = [...introPhases, ...extraPhases]
  const unmet: string[] = []
  const oracleIds = [...picked]
  const finalCards = oracleIds.map((id) => poolMap.get(id)!).filter(Boolean)
  if (finalCards.length < settings.targetSize) {
    unmet.push(`Only ${finalCards.length} of ${settings.targetSize} slots filled — pool is thin.`)
  }

  const overlapBands: Array<{ hits: number; count: number }> = []
  if (kind === 'seed') {
    const hitCounts = new Map<number, number>()
    for (const card of finalCards) {
      if (seedSet.has(card.oracleId)) continue
      const hits = metaOf.get(card.oracleId)?.seedHits ?? 0
      hitCounts.set(hits, (hitCounts.get(hits) ?? 0) + 1)
    }
    for (const hits of [...hitCounts.keys()].sort((a, b) => b - a)) {
      overlapBands.push({ hits, count: hitCounts.get(hits) ?? 0 })
    }
  }

  const analysis = analyzeCube(finalCards, themes, tags, {
    focusThemeIds: selectedThemes.map((t) => t.id),
    scoreThemeIds: selectedThemes.map((t) => t.id),
    eloByOracle: new Map(
      [...metaOf.entries()].map(([id, meta]) => [id, meta.elo] as const),
    ),
  })
  const evaluation = analysis.evaluation
  const goldRow = evaluation.metrics.find((row) => row.id === 'goldNonland')
  if (goldRow && goldRow.score < 70) {
    unmet.push(
      `Gold nonlands are ${(goldRow.value * 100).toFixed(1)}% of the cube (observed 3.6–15.6% on the eight popular lists).`,
    )
  }
  const dominantRow = evaluation.metrics.find((row) => row.id === 'dominantThemes')
  if (dominantRow && dominantRow.value > BALANCE_BENCHMARKS.dominantThemes.high) {
    unmet.push(
      `Dominant themes landed at ${dominantRow.value} (observed max ${BALANCE_BENCHMARKS.dominantThemes.high} on the eight popular lists).`,
    )
  }
  const supportedRow = evaluation.metrics.find((row) => row.id === 'supportedThemes')
  if (supportedRow && supportedRow.value > BALANCE_BENCHMARKS.supportedThemes.high) {
    unmet.push(
      `Playable themes landed at ${supportedRow.value} (observed max ${BALANCE_BENCHMARKS.supportedThemes.high} on the eight popular lists).`,
    )
  }
  const coverageRow = evaluation.metrics.find((row) => row.id === 'themeCoverage')
  if (coverageRow && coverageRow.score < 70) {
    unmet.push(
      `Top-8 coverage is ${(coverageRow.value * 100).toFixed(1)}% (observed 76.3–83.9%).`,
    )
  }
  const bridgeRow = evaluation.metrics.find((row) => row.id === 'themeBridges')
  if (bridgeRow && bridgeRow.score < 70) {
    unmet.push(
      `Theme bridges are ${(bridgeRow.value * 100).toFixed(1)}% of top-8 cards (observed 45.8–52.3%).`,
    )
  }
  const floorSet = new Set(floorThemeIds)
  for (const theme of selectedThemes.filter((t) => floorSet.has(t.id))) {
    const row =
      analysis.focusedDensity.find((t) => t.themeId === theme.id) ??
      analysis.themeDensity.find((t) => t.themeId === theme.id)
    if (!row || row.count < minPerTheme) {
      unmet.push(`${theme.name} coverage ${row?.count ?? 0} < ${minPerTheme}.`)
    }
  }
  reportTypeFloorGaps(finalCards, typeMins, unmet)
  reportColorGaps(finalCards, targets, unmet)
  reportHighEloGaps(finalCards, metaOf, targets, unmet)
  reportTypalGaps(finalCards, tags, themes, targets, unmet)

  const bridges =
    kind === 'seed'
      ? finalCards
          .filter((card) => {
            if (seedSet.has(card.oracleId)) return false
            const meta = metaOf.get(card.oracleId)
            return (meta?.seedHits ?? 0) >= 2 || (meta?.themeGlue ?? 0) >= 2
          })
          .map((card) => ({
            oracleId: card.oracleId,
            name: card.name,
            themeIds: [
              ...(overlaps.get(card.oracleId)?.seedIds ?? []),
              ...(metaOf.get(card.oracleId)?.tags.map((t) => t.themeId) ?? []),
            ],
            imageNormal: card.imageNormal,
            faces: card.faces,
          }))
      : analysis.bridges

  if (kind === 'seed' && (settings.seedOracleIds ?? []).length > 1 && bridges.length === 0) {
    unmet.push(
      'No cards synergistic with two or more seeds, or sharing themes across seeds, made the list. Try closer seeds, pin a tag, or raise overlap bonus.',
    )
  }

  return {
    oracleIds,
    report: {
      settings: { ...settings, engine: extras?.engine ?? 'mip' },
      engine: extras?.engine ?? 'mip',
      solver: extras?.solver,
      selected: oracleIds,
      themeCoverage: selectedThemes.map((theme) => {
        const row =
          analysis.focusedDensity.find((t) => t.themeId === theme.id) ??
          analysis.themeDensity.find((t) => t.themeId === theme.id)
        return {
          themeId: theme.id,
          name: theme.name,
          count: row?.count ?? 0,
          min: floorSet.has(theme.id) ? minPerTheme : 0,
          asFan: row?.asFan ?? asFan(0, finalCards.length),
        }
      }),
      typeCoverage: typeCoverageRows(finalCards, typeMins),
      colorCoverage: colorCoverageRows(finalCards, targets.color),
      evaluation,
      overlapBands,
      seedNames: seedCards.map((c) => c.name),
      bridges,
      unmet,
      libraryGaps,
      phases,
    },
  }
}
