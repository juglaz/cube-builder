import { queryCatalogCards } from './catalogCards'
import { emptyFilter, isCreature, isLand, isUsableOracleCard, SPELL_FLOOR_TYPES, typeLineHas } from './cardMeta'
import { loadCobraNeighborMap, rankByCobraOverlap, scoreCobraOverlaps, type CobraOverlap } from './cobra'
import { cardPassesEloBand, eloBandIsOpen, loadCobraEloMap } from './elo'
import {
  cardHasCreatureType,
  creatureTypesFromCard,
  dropRedundantTypalThemeIds,
  isTypeThemeId,
  mapTypalTagsToTypeThemes,
  oracleIdsForCreatureTypes,
  parseTypeThemeId,
  typeTagsForCards,
  typeThemeId,
  typalThemeForCreatureType,
} from './creatureTypes'
import { memberThemeIdsForLane, oracleIdsForModifiedSupport, supportLanesFromPool } from './tagSupport'
import { cardDependsOnOtherNamedCard, cardLockedByNamedTags } from './namedCardLock'
import { db } from '../db'
import {
  catalogTagsForOracleIds,
  slimOracleIdsForThemes,
} from './tagger'
import type { CardTheme, LibraryCard } from '../types'

const SEED_TAG_MIN: CardTheme['synergy'] = 2
const MAX_OVERLAP_THEMES = 4

function dropNamedCardLocks(
  byOracle: Map<string, LibraryCard>,
  seedSet: Set<string>,
  catalogTags: CardTheme[],
  themes: Array<{ id: string; slug?: string }>,
): void {
  const themesById = new Map(themes.map((theme) => [theme.id, theme]))
  const slugsByOracle = new Map<string, string[]>()
  for (const tag of catalogTags) {
    const slug = themesById.get(tag.themeId)?.slug
    if (!slug) continue
    const list = slugsByOracle.get(tag.oracleId) ?? []
    list.push(slug)
    slugsByOracle.set(tag.oracleId, list)
  }
  for (const [oracleId, card] of [...byOracle.entries()]) {
    if (seedSet.has(oracleId)) continue
    if (cardDependsOnOtherNamedCard(card) || cardLockedByNamedTags(card, slugsByOracle.get(oracleId) ?? [])) {
      byOracle.delete(oracleId)
    }
  }
}

export { isUsableOracleCard }

export async function searchOracleCards(
  query: string,
  exclude: string[] = [],
  limit = 20,
): Promise<LibraryCard[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const { cards } = await queryCatalogCards(
    { ...emptyFilter(), query: q },
    { exclude, limit, usableOnly: true },
  )
  return cards
}

const POOL_COLORS = ['W', 'U', 'B', 'R', 'G'] as const

function rankSpellCandidate(a: LibraryCard, b: LibraryCard, prefer: Set<string>): number {
  const aPref = prefer.has(a.oracleId) ? 0 : 1
  const bPref = prefer.has(b.oracleId) ? 0 : 1
  if (aPref !== bPref) return aPref - bPref
  const aMono = a.colorIdentity.length === 1 ? 0 : 1
  const bMono = b.colorIdentity.length === 1 ? 0 : 1
  if (aMono !== bMono) return aMono - bMono
  const aBody = isCreature(a) ? 1 : 0
  const bBody = isCreature(b) ? 1 : 0
  if (aBody !== bBody) return aBody - bBody
  if (a.cmc !== b.cmc) return a.cmc - b.cmc
  return a.name.localeCompare(b.name)
}

async function oracleIdsForSpellTypes(prefer: Set<string>, perType = 140): Promise<string[]> {
  const catalog = await db.oracleCards.toArray()
  const keep = new Set<string>()
  const perColor = Math.max(24, Math.ceil(perType / POOL_COLORS.length))
  for (const typeName of SPELL_FLOOR_TYPES) {
    for (const color of POOL_COLORS) {
      const hits = catalog.filter((card) => {
        if (!isUsableOracleCard(card) || !typeLineHas(card, typeName)) return false
        if ((typeName === 'Instant' || typeName === 'Sorcery') && isCreature(card)) return false
        return card.colorIdentity.includes(color)
      })
      hits.sort((a, b) => rankSpellCandidate(a, b, prefer))
      for (const card of hits.slice(0, perColor)) keep.add(card.oracleId)
    }
    if (typeName === 'Artifact') {
      const colorless = catalog.filter(
        (card) =>
          isUsableOracleCard(card) && typeLineHas(card, 'Artifact') && card.colorIdentity.length === 0,
      )
      colorless.sort((a, b) => rankSpellCandidate(a, b, prefer))
      for (const card of colorless.slice(0, perColor)) keep.add(card.oracleId)
    }
  }
  return [...keep]
}

export type ThemeOverlapContext = {
  /** Favored seed tags (user-selected), or tags shared by 2+ seeds if none were picked. */
  overlapThemeIds: string[]
  /** All strong seed tags plus favored tags. */
  unionThemeIds: string[]
  /** seed oracleId → strong theme ids */
  themesBySeed: Map<string, string[]>
}

function deriveThemeOverlap(
  seedIds: string[],
  seedTags: CardTheme[],
  pinnedThemeIds: string[],
): ThemeOverlapContext {
  const themesBySeed = new Map<string, string[]>()
  const themeToSeeds = new Map<string, Set<string>>()

  for (const seedId of seedIds) themesBySeed.set(seedId, [])
  for (const tag of seedTags) {
    if (tag.synergy < SEED_TAG_MIN) continue
    const list = themesBySeed.get(tag.oracleId) ?? []
    if (!list.includes(tag.themeId)) list.push(tag.themeId)
    themesBySeed.set(tag.oracleId, list)
    const owners = themeToSeeds.get(tag.themeId) ?? new Set()
    owners.add(tag.oracleId)
    themeToSeeds.set(tag.themeId, owners)
  }

  const shared = [...themeToSeeds.entries()]
    .filter(([, owners]) => owners.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([id]) => id)

  const favored = [...new Set(pinnedThemeIds.filter(Boolean))]
  const overlapThemeIds =
    favored.length > 0 ? favored : shared.slice(0, MAX_OVERLAP_THEMES)
  const unionThemeIds = [
    ...new Set([...[...themesBySeed.values()].flat(), ...pinnedThemeIds]),
  ]
  return { overlapThemeIds, unionThemeIds, themesBySeed }
}

export async function loadGenerationPool(
  seedOracleIds: string[],
  targetSize: number,
  onProgress: (message: string) => void,
  pinnedThemeIds: string[] = [],
  elo?: { min: number; max: number; exemptLands: boolean },
): Promise<{
  cards: LibraryCard[]
  cobraNeighbors: Map<string, string[]>
  overlaps: Map<string, CobraOverlap>
  seeds: LibraryCard[]
  tags: CardTheme[]
  themeOverlap: ThemeOverlapContext
  eloMap: Map<string, number>
}> {
  const catalogSize = await db.oracleCards.count()
  if (catalogSize === 0) {
    throw new Error(
      'Download the Oracle card catalog on Themes / Tagger first. Generate uses that local file, not live Scryfall lookups.',
    )
  }
  if (seedOracleIds.length === 0) {
    throw new Error('Select at least one seed crystal card.')
  }

  onProgress('Loading Cube Cobra synergistic neighbors…')
  const cobraNeighbors = await loadCobraNeighborMap()
  if (cobraNeighbors.size === 0) {
    throw new Error(
      'Download Cube Cobra neighbors on Themes first. Seed crystals need that synergistic index.',
    )
  }

  onProgress('Looking up seed cards in the local catalog…')
  const seeds = (await db.oracleCards.bulkGet(seedOracleIds)).filter(
    (c): c is LibraryCard => c != null && isUsableOracleCard(c),
  )
  if (seeds.length === 0) {
    throw new Error('None of the seed cards are in the local Oracle catalog. Refresh catalogs on Themes.')
  }
  const seedIds = seeds.map((s) => s.oracleId)

  onProgress('Reading Tagger tags on the seed crystals…')
  const seedTags = await catalogTagsForOracleIds(seedIds)
  const typeSeedTags: CardTheme[] = []
  for (const seed of seeds) {
    for (const typeName of creatureTypesFromCard(seed)) {
      const id = typeThemeId(typeName)
      if (!pinnedThemeIds.includes(id)) continue
      typeSeedTags.push({ oracleId: seed.oracleId, themeId: id, synergy: 4 })
    }
  }
  const rawOverlap = deriveThemeOverlap(seedIds, [...seedTags, ...typeSeedTags], pinnedThemeIds)
  const overlapThemeIds = await dropRedundantTypalThemeIds(rawOverlap.overlapThemeIds)
  const droppedTypal = new Set(rawOverlap.overlapThemeIds.filter((id) => !overlapThemeIds.includes(id)))
  const themeOverlap = {
    ...rawOverlap,
    overlapThemeIds,
    unionThemeIds: rawOverlap.unionThemeIds.filter((id) => !droppedTypal.has(id)),
  }

  onProgress('Scoring overlapping Cube Cobra synergies between seeds…')
  const overlaps = scoreCobraOverlaps(seedIds, cobraNeighbors)
  const ranked = rankByCobraOverlap(overlaps)
  const hop1 = ranked.filter((id) => overlaps.get(id)?.hop === 1)
  const hop2 = ranked.filter((id) => overlaps.get(id)?.hop === 2)
  const hop2Cap = Math.max(targetSize * 3, 200)
  const cobraIds = [...hop1, ...hop2.slice(0, hop2Cap)]

  const typeThemeIds = overlapThemeIds.filter(isTypeThemeId)
  const taggerThemeIds = overlapThemeIds.filter((id) => !isTypeThemeId(id))
  const typalIdToTypeThemeId = new Map<string, string>()
  for (const id of typeThemeIds) {
    const typeName = parseTypeThemeId(id)
    if (!typeName) continue
    const typal = await typalThemeForCreatureType(typeName)
    if (typal) typalIdToTypeThemeId.set(typal.id, id)
  }

  const extraThemeIds: string[] = []
  if (taggerThemeIds.length > 0) {
    onProgress(`Pulling on-theme cards for ${taggerThemeIds.length} favored Tagger tags…`)
    extraThemeIds.push(...(await slimOracleIdsForThemes(taggerThemeIds, 140)))
  }
  if (typeThemeIds.length > 0) {
    const typeNames = typeThemeIds
      .map(parseTypeThemeId)
      .filter((n): n is string => Boolean(n))
    onProgress(
      `Pulling ${typeNames.map((n) => n).join(', ')} cards from the Oracle catalog…`,
    )
    extraThemeIds.push(
      ...(await oracleIdsForCreatureTypes(typeNames, new Set(cobraIds), 160)),
    )
    if (typalIdToTypeThemeId.size > 0) {
      extraThemeIds.push(
        ...(await slimOracleIdsForThemes([...typalIdToTypeThemeId.keys()], 80)),
      )
    }
  }

  const extraIds = [...new Set([...cobraIds, ...extraThemeIds])]
  onProgress('Pulling instants, sorceries, and other spells by color…')
  extraIds.push(...(await oracleIdsForSpellTypes(new Set(cobraIds), 140)))
  const uniqueExtra = [...new Set(extraIds)]
  onProgress(
    `Loading ${uniqueExtra.length.toLocaleString()} candidates (${hop1.length} Cobra neighbors, ${extraThemeIds.length.toLocaleString()} favored-theme cards, plus spells)…`,
  )
  const extra = (await db.oracleCards.bulkGet(uniqueExtra)).filter(
    (c): c is LibraryCard => c != null && isUsableOracleCard(c) && !cardDependsOnOtherNamedCard(c),
  )

  onProgress('Adding a land package from the local catalog…')
  const lands = await db.oracleCards
    .filter((card) => isLand(card) && (/\bBasic\b/.test(card.typeLine) || card.colorIdentity.length >= 2))
    .toArray()

  const byOracle = new Map<string, LibraryCard>()
  for (const card of [...seeds, ...extra, ...lands]) {
    if (isUsableOracleCard(card) || isLand(card)) byOracle.set(card.oracleId, card)
  }

  const seedSet = new Set(seedIds)
  const eloMap = await loadCobraEloMap()
  const applyElo = elo && !eloBandIsOpen(elo.min, elo.max)
  if (applyElo) {
    onProgress('Filtering candidates by Cube Cobra Elo band…')
    if (eloMap.size === 0) {
      throw new Error(
        'Download Cube Cobra data on Themes again so draft Elo ratings are installed. Elo bands need that catalog.',
      )
    }
    for (const [oracleId, card] of [...byOracle.entries()]) {
      if (seedSet.has(oracleId)) continue
      if (cardPassesEloBand(card, eloMap.get(oracleId), elo.min, elo.max, elo.exemptLands)) continue
      byOracle.delete(oracleId)
    }
  }

  onProgress('Applying Tagger weights for the candidate pool…')
  let catalogTags = await catalogTagsForOracleIds([...byOracle.keys()])
  const themeIds = [...new Set(catalogTags.map((tag) => tag.themeId))]
  const tagThemes = (await db.themes.bulkGet(themeIds)).filter((theme): theme is NonNullable<typeof theme> =>
    Boolean(theme),
  )
  dropNamedCardLocks(byOracle, seedSet, catalogTags, tagThemes)
  catalogTags = catalogTags.filter((tag) => byOracle.has(tag.oracleId))
  const lanes = supportLanesFromPool([...byOracle.values()], catalogTags, tagThemes, 6, seedSet)
  const payoffTypes = lanes.filter((row) => row.kind === 'typal').map((row) => row.typeName)
  const synergyLanes = lanes.filter((row) => row.kind === 'synergy')
  if (payoffTypes.length > 0 || synergyLanes.length > 0) {
    const labels = [...payoffTypes, ...synergyLanes.map((row) => row.typeName)]
    onProgress(`Pulling support cards for ${labels.join(', ')} payoffs…`)
    const allThemes = await db.themes.toArray()
    const memberThemeIds = [...new Set(synergyLanes.flatMap((row) => memberThemeIdsForLane(row.typeName, allThemes)))]
    const supportIds = [
      ...(await oracleIdsForCreatureTypes(payoffTypes, new Set(cobraIds), 120)),
      ...(synergyLanes.some((row) => row.typeName === 'modified')
        ? await oracleIdsForModifiedSupport(new Set(cobraIds), 160)
        : []),
      ...(memberThemeIds.length > 0 ? await slimOracleIdsForThemes(memberThemeIds, 80) : []),
    ]
    const fresh = supportIds.filter((id) => !byOracle.has(id))
    if (fresh.length > 0) {
      const extraSupport = (await db.oracleCards.bulkGet(fresh)).filter(
        (c): c is LibraryCard =>
          c != null && isUsableOracleCard(c) && (seedSet.has(c.oracleId) || !cardDependsOnOtherNamedCard(c)),
      )
      for (const card of extraSupport) {
        if (seedSet.has(card.oracleId)) {
          byOracle.set(card.oracleId, card)
          continue
        }
        if (applyElo && !cardPassesEloBand(card, eloMap.get(card.oracleId), elo.min, elo.max, elo.exemptLands)) {
          continue
        }
        byOracle.set(card.oracleId, card)
      }
      catalogTags = await catalogTagsForOracleIds([...byOracle.keys()])
      dropNamedCardLocks(byOracle, seedSet, catalogTags, allThemes)
      catalogTags = catalogTags.filter((tag) => byOracle.has(tag.oracleId))
    }
  }

  const supportTypeIds = payoffTypes.map((name) => typeThemeId(name))
  const typedThemeIds = [...new Set([...typeThemeIds, ...supportTypeIds])]
  for (const id of supportTypeIds) {
    const typeName = parseTypeThemeId(id)
    if (!typeName) continue
    const typal = await typalThemeForCreatureType(typeName)
    if (typal) typalIdToTypeThemeId.set(typal.id, id)
  }
  const tagMap = new Map<string, CardTheme>()
  for (const tag of catalogTags) {
    const typeId = typalIdToTypeThemeId.get(tag.themeId)
    if (typeId) {
      const typeName = parseTypeThemeId(typeId)
      const card = byOracle.get(tag.oracleId)
      if (typeName && card && cardHasCreatureType(card, typeName)) continue
    }
    tagMap.set(`${tag.oracleId}:${tag.themeId}`, tag)
  }
  for (const tag of typeTagsForCards([...byOracle.values()], typedThemeIds, new Set(seedIds))) {
    tagMap.set(`${tag.oracleId}:${tag.themeId}`, tag)
  }
  for (const tag of mapTypalTagsToTypeThemes(catalogTags, typalIdToTypeThemeId, byOracle)) {
    const key = `${tag.oracleId}:${tag.themeId}`
    const existing = tagMap.get(key)
    if (!existing || tag.synergy > existing.synergy) tagMap.set(key, tag)
  }
  const tags = [...tagMap.values()]

  return {
    cards: [...byOracle.values()],
    cobraNeighbors,
    overlaps,
    seeds,
    tags,
    themeOverlap,
    eloMap,
  }
}
