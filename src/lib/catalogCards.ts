import { db } from '../db'
import { isUsableOracleCard, matchesFilter } from './cardMeta'
import { catalogTagsForOracleIds, oracleIdsForThemes } from './tagger'
import type { CardFilter, CardTheme, LibraryCard } from '../types'

export const CATALOG_DISPLAY_LIMIT = 200

let catalogCache: LibraryCard[] | null = null
let catalogCacheSyncedAt = -1
let catalogCacheCount = -1
let catalogInflight: Promise<LibraryCard[]> | null = null

export async function loadOracleCatalog(): Promise<LibraryCard[]> {
  const [count, meta] = await Promise.all([db.oracleCards.count(), db.meta.get('oracle_cards')])
  const syncedAt = meta?.syncedAt ?? 0
  if (catalogCache && catalogCacheCount === count && catalogCacheSyncedAt === syncedAt) {
    return catalogCache
  }
  if (!catalogInflight) {
    catalogInflight = db.oracleCards.toArray().then((rows) => {
      rows.sort((a, b) => a.name.localeCompare(b.name))
      catalogCache = rows
      catalogCacheCount = rows.length
      catalogCacheSyncedAt = syncedAt
      catalogInflight = null
      return rows
    })
  }
  return catalogInflight
}

export async function loadCardsByOracleIds(oracleIds: string[]): Promise<LibraryCard[]> {
  if (oracleIds.length === 0) return []
  const unique = [...new Set(oracleIds)]
  const fromOracle = await db.oracleCards.bulkGet(unique)
  const found = new Map<string, LibraryCard>()
  unique.forEach((id, i) => {
    const card = fromOracle[i]
    if (card) found.set(id, card)
  })
  const missing = unique.filter((id) => !found.has(id))
  if (missing.length > 0) {
    const fromLibrary = await db.cards.bulkGet(missing)
    missing.forEach((id, i) => {
      const card = fromLibrary[i]
      if (card) found.set(id, card)
    })
  }
  return oracleIds.map((id) => found.get(id)).filter((card): card is LibraryCard => Boolean(card))
}

export async function mergedTagsForOracleIds(oracleIds: string[]): Promise<CardTheme[]> {
  if (oracleIds.length === 0) return []
  const unique = [...new Set(oracleIds)]
  const catalog = await catalogTagsForOracleIds(unique)
  const local: CardTheme[] = []
  const chunk = 400
  for (let i = 0; i < unique.length; i += chunk) {
    local.push(...(await db.cardThemes.where('oracleId').anyOf(unique.slice(i, i + chunk)).toArray()))
  }
  const byKey = new Map(catalog.map((tag) => [`${tag.oracleId}:${tag.themeId}`, tag]))
  for (const row of local) {
    const key = `${row.oracleId}:${row.themeId}`
    if (row.userOverride || !byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()]
}

export type CatalogQueryOptions = {
  exclude?: string[]
  limit?: number
  usableOnly?: boolean
}

export type CatalogQueryResult = {
  cards: LibraryCard[]
  total: number
  catalogSize: number
}

function tagIndex(tags: CardTheme[]): Map<string, CardTheme[]> {
  const map = new Map<string, CardTheme[]>()
  for (const tag of tags) {
    const list = map.get(tag.oracleId) ?? []
    list.push(tag)
    map.set(tag.oracleId, list)
  }
  return map
}

export async function queryCatalogCards(
  filter: CardFilter,
  options: CatalogQueryOptions = {},
): Promise<CatalogQueryResult> {
  const limit = options.limit ?? CATALOG_DISPLAY_LIMIT
  const usableOnly = options.usableOnly ?? true
  const exclude = new Set(options.exclude ?? [])
  const catalogSize = await db.oracleCards.count()
  if (catalogSize === 0) return { cards: [], total: 0, catalogSize }

  let pool: LibraryCard[]
  let tagsByCard = new Map<string, CardTheme[]>()
  const needTags = filter.themeIds.length > 0 || Boolean(filter.minSynergy)

  if (filter.themeIds.length > 0) {
    pool = await loadCardsByOracleIds(await oracleIdsForThemes(filter.themeIds))
  } else if (filter.minSynergy) {
    const rows = await db.catalogTaggings
      .filter((row) => row.synergy >= filter.minSynergy)
      .toArray()
    pool = await loadCardsByOracleIds(rows.map((row) => row.oracleId))
    tagsByCard = tagIndex(
      rows.map((row) => ({
        oracleId: row.oracleId,
        themeId: row.tagId,
        synergy: row.synergy,
        userOverride: false,
      })),
    )
  } else {
    pool = await loadOracleCatalog()
  }

  if (needTags && filter.themeIds.length > 0) {
    tagsByCard = tagIndex(await mergedTagsForOracleIds(pool.map((card) => card.oracleId)))
  } else if (needTags && filter.minSynergy && filter.themeIds.length === 0) {
    const overrides = await mergedTagsForOracleIds(pool.map((card) => card.oracleId))
    tagsByCard = tagIndex(overrides)
  }

  const q = filter.query.trim().toLowerCase()
  const namePrefix: LibraryCard[] = []
  const nameHit: LibraryCard[] = []
  const other: LibraryCard[] = []
  let total = 0

  for (const card of pool) {
    if (exclude.has(card.oracleId)) continue
    if (usableOnly && !isUsableOracleCard(card)) continue
    if (!matchesFilter(card, filter, tagsByCard.get(card.oracleId) ?? [])) continue
    total += 1
    if (q) {
      const name = card.name.toLowerCase()
      if (name.startsWith(q)) namePrefix.push(card)
      else if (name.includes(q)) nameHit.push(card)
      else other.push(card)
    } else {
      other.push(card)
    }
  }

  const ranked = q ? [...namePrefix, ...nameHit, ...other] : other
  return { cards: ranked.slice(0, limit), total, catalogSize }
}

export async function resolveNamesFromCatalog(
  names: Array<{ name: string; set?: string }>,
): Promise<{ cards: LibraryCard[]; notFound: Array<{ name: string; set?: string }> }> {
  const catalog = await loadOracleCatalog()
  const byName = new Map<string, LibraryCard>()
  for (const card of catalog) {
    const key = card.name.toLowerCase()
    if (!byName.has(key)) byName.set(key, card)
    const front = card.name.split(' // ')[0]?.toLowerCase()
    if (front && !byName.has(front)) byName.set(front, card)
  }
  const cards: LibraryCard[] = []
  const notFound: Array<{ name: string; set?: string }> = []
  const seen = new Set<string>()
  for (const id of names) {
    const hit = byName.get(id.name.trim().toLowerCase())
    if (!hit) {
      notFound.push(id)
      continue
    }
    if (seen.has(hit.oracleId)) continue
    seen.add(hit.oracleId)
    cards.push(hit)
  }
  return { cards, notFound }
}
