import { loadCardsByOracleIds } from './catalogCards'
import { db } from '../db'
import { isTypeThemeId, typeThemesFromIds } from './creatureTypes'
import { cardPassesEloBand } from './elo'
import { withNormalizedKnobs } from './generationPresets'
import { catalogTagsForOracleIds } from './tagger'
import { loadGenerationPool, type ThemeOverlapContext } from './generatePool'
import { generateCubeMip, mipFillSuggestions } from './generatorMip'
import type { CobraOverlap } from './cobra'
import type { GenerateReport } from './generationShared'
import type { CardTheme, GenerationSettings, LibraryCard, Theme } from '../types'

export type { GenerateReport }

export type PreparedGeneration = {
  pool: LibraryCard[]
  cobraNeighbors: Map<string, string[]>
  overlaps: Map<string, CobraOverlap>
  tags: CardTheme[]
  themeOverlap: ThemeOverlapContext
  themes: Theme[]
  eloMap: Map<string, number>
}

export async function prepareGenerationInputs(
  rawSettings: GenerationSettings,
  fallbackThemes: Theme[],
  onProgress: (message: string) => void,
): Promise<PreparedGeneration> {
  const settings = withNormalizedKnobs(rawSettings)
  const seedOracleIds = settings.seedOracleIds ?? []
  if (seedOracleIds.length === 0) {
    throw new Error('This cube has no seed crystals to regenerate from.')
  }
  const { cards: pool, cobraNeighbors, overlaps, tags, themeOverlap, eloMap } = await loadGenerationPool(
    seedOracleIds,
    settings.targetSize,
    onProgress,
    settings.themeIds ?? [],
    {
      min: settings.eloMin,
      max: settings.eloMax,
      exemptLands: settings.eloExemptLands,
    },
  )
  const wantedThemeIds = [...new Set([...themeOverlap.overlapThemeIds, ...settings.themeIds])]
  const fromDb = (
    await db.themes.bulkGet(wantedThemeIds.filter((id) => !isTypeThemeId(id)))
  ).filter((theme): theme is Theme => Boolean(theme))
  const catalog = (await db.themes.filter((theme) => !theme.hidden).toArray())
  const byId = new Map<string, Theme>()
  for (const theme of [...catalog, ...fallbackThemes, ...fromDb, ...typeThemesFromIds(wantedThemeIds)]) {
    byId.set(theme.id, theme)
  }
  return {
    pool,
    cobraNeighbors,
    overlaps,
    tags,
    themeOverlap,
    themes: [...byId.values()],
    eloMap,
  }
}

export async function generateFromSettings(
  rawSettings: GenerationSettings,
  fallbackThemes: Theme[],
  onProgress: (message: string) => void,
): Promise<{ oracleIds: string[]; report: GenerateReport; pool: LibraryCard[] }> {
  const settings = withNormalizedKnobs(rawSettings)
  const prepared = await prepareGenerationInputs(settings, fallbackThemes, onProgress)
  const { pool, cobraNeighbors, overlaps, tags, themeOverlap, themes, eloMap } = prepared
  onProgress(`MIP builder: solving a ${settings.targetSize}-card model from ${pool.length} candidates…`)
  const result = await generateCubeMip(
    pool,
    themes,
    tags,
    settings,
    cobraNeighbors,
    overlaps,
    themeOverlap,
    eloMap,
  )
  return { ...result, pool }
}

export async function suggestFillCards(
  rawSettings: GenerationSettings,
  lockedIds: string[],
  excludeIds: string[],
  fallbackThemes: Theme[],
  onProgress: (message: string) => void,
): Promise<LibraryCard[]> {
  const lock = [...new Set(lockedIds)]
  const exclude = [...new Set(excludeIds.filter((id) => !lock.includes(id)))]
  const settings: GenerationSettings = {
    ...withNormalizedKnobs(rawSettings),
    themeIds: rawSettings.themeIds ?? [],
    seedOracleIds: rawSettings.seedOracleIds,
    seedCards: rawSettings.seedCards,
    lockOracleIds: lock,
    excludeOracleIds: exclude,
  }
  onProgress('Loading the generator pool with this cube locked…')
  const prepared = await prepareGenerationInputs(settings, fallbackThemes, onProgress)
  const inPool = new Set(prepared.pool.map((card) => card.oracleId))
  const neighborExtra: string[] = []
  const seenNeighbor = new Set(lock)
  for (const id of lock) {
    const neighbors = prepared.cobraNeighbors.get(id) ?? []
    for (const n of neighbors.slice(0, 24)) {
      if (seenNeighbor.has(n) || inPool.has(n)) continue
      seenNeighbor.add(n)
      neighborExtra.push(n)
    }
  }
  const extraCards = await loadCardsByOracleIds([
    ...lock.filter((id) => !inPool.has(id)),
    ...neighborExtra,
  ])
  const extraTags = await catalogTagsForOracleIds(extraCards.map((card) => card.oracleId))
  const skip = new Set(exclude)
  const pool = [...prepared.pool, ...extraCards].filter((card) => {
    if (skip.has(card.oracleId) && !lock.includes(card.oracleId)) return false
    if (lock.includes(card.oracleId)) return true
    return cardPassesEloBand(
      card,
      prepared.eloMap.get(card.oracleId),
      settings.eloMin,
      settings.eloMax,
      settings.eloExemptLands,
    )
  })
  onProgress(`Ranking adds that overlap this ${lock.length}-card list…`)
  return mipFillSuggestions(
    pool,
    prepared.themes,
    [...prepared.tags, ...extraTags],
    settings,
    prepared.cobraNeighbors,
    prepared.overlaps,
    prepared.themeOverlap,
    prepared.eloMap,
  )
}
