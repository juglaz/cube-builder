import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  CATALOG_DISPLAY_LIMIT,
  loadCardsByOracleIds,
  mergedTagsForOracleIds,
  queryCatalogCards,
  type CatalogQueryOptions,
  type CatalogQueryResult,
} from '../lib/catalogCards'
import type { CardFilter, CardTheme, CatalogMeta, CobraEloRow, Cube, CubeCard, LibraryCard } from '../types'

export function useLiveData() {
  const catalog = useLiveQuery(() => db.themes.orderBy('name').toArray(), []) ?? []
  const themes = catalog.filter((t) => !t.hidden)
  const tags = useLiveQuery(() => db.cardThemes.toArray(), []) ?? []
  const cubes = useLiveQuery(() => db.cubes.orderBy('updatedAt').reverse().toArray(), []) ?? []
  const cubeCards = useLiveQuery(() => db.cubeCards.toArray(), []) ?? []
  const catalogMeta = useLiveQuery(() => db.meta.get('oracle_tags'), []) ?? null
  const cardCatalogMeta = useLiveQuery(() => db.meta.get('oracle_cards'), []) ?? null
  const cobraCatalogMeta = useLiveQuery(() => db.meta.get('cobra_neighbors'), []) ?? null
  const cobraEloMeta = useLiveQuery(() => db.meta.get('cobra_elo'), []) ?? null
  const ready = useLiveQuery(() => db.themes.count().then(() => true), []) ?? false

  return {
    catalog,
    themes,
    tags,
    cubes,
    cubeCards,
    catalogMeta,
    cardCatalogMeta,
    cobraCatalogMeta,
    cobraEloMeta,
    ready,
  }
}

export function useEloForOracles(oracleIds: string[]): { map: Map<string, number>; loading: boolean } {
  const key = oracleIds.join('|')
  const rows = useLiveQuery(
    (): Promise<(CobraEloRow | undefined)[]> =>
      oracleIds.length > 0 ? db.cobraElo.bulkGet(oracleIds) : Promise.resolve([]),
    [key],
  )
  const map = useMemo(() => {
    const next = new Map<string, number>()
    if (!rows) return next
    oracleIds.forEach((id, i) => {
      const row = rows[i]
      if (row && Number.isFinite(row.elo)) next.set(id, row.elo)
    })
    return next
  }, [key, rows])
  return { map, loading: oracleIds.length > 0 && rows === undefined }
}

export function useCardsByOracleIds(oracleIds: string[]): LibraryCard[] {
  const key = oracleIds.join('|')
  return (
    useLiveQuery(async () => {
      // Touch cubeCards so deleting a row invalidates this query, not only oracle catalog reads.
      if (oracleIds.length === 0) {
        await db.cubeCards.limit(1).toArray()
        return []
      }
      await db.cubeCards.where('oracleId').anyOf(oracleIds).toArray()
      return loadCardsByOracleIds(oracleIds)
    }, [key]) ?? []
  )
}

export function useMergedTags(oracleIds: string[]): CardTheme[] {
  const key = oracleIds.join('|')
  return useLiveQuery(() => mergedTagsForOracleIds(oracleIds), [key]) ?? []
}

export function useOracleCard(oracleId: string | null): LibraryCard | null {
  return (
    useLiveQuery(
      () => (oracleId ? loadCardsByOracleIds([oracleId]).then((rows) => rows[0] ?? null) : null),
      [oracleId],
    ) ?? null
  )
}

export function useCatalogQuery(
  filter: CardFilter,
  options: CatalogQueryOptions & { enabled?: boolean } = {},
): CatalogQueryResult & { searching: boolean } {
  const { enabled = true, exclude, limit, usableOnly } = options
  const meta = useLiveQuery(() => db.meta.get('oracle_cards'), []) ?? null
  const [result, setResult] = useState<CatalogQueryResult>({
    cards: [],
    total: 0,
    catalogSize: 0,
  })
  const [searching, setSearching] = useState(false)
  const excludeKey = exclude?.join('|') ?? ''

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setSearching(true)
    const handle = window.setTimeout(() => {
      void queryCatalogCards(filter, { exclude, limit: limit ?? CATALOG_DISPLAY_LIMIT, usableOnly }).then(
        (next) => {
          if (!cancelled) {
            setResult(next)
            setSearching(false)
          }
        },
      )
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [
    enabled,
    filter.query,
    filter.colorMode,
    filter.minSynergy,
    filter.colors.join('|'),
    filter.types.join('|'),
    filter.cmcBuckets.join('|'),
    filter.themeIds.join('|'),
    excludeKey,
    limit,
    usableOnly,
    meta?.syncedAt,
  ])

  return { ...result, searching }
}

export function tagsForCard(tags: CardTheme[], oracleId: string): CardTheme[] {
  return tags.filter((t) => t.oracleId === oracleId)
}

export function cardsInCube(
  cards: LibraryCard[],
  cubeCards: CubeCard[],
  cubeId: string,
): LibraryCard[] {
  const ids = new Set(cubeCards.filter((c) => c.cubeId === cubeId).map((c) => c.oracleId))
  return cards.filter((c) => ids.has(c.oracleId))
}

export function cubeById(cubes: Cube[], id: string | undefined): Cube | undefined {
  return cubes.find((c) => c.id === id)
}

export function catalogUpdatedLabel(meta: CatalogMeta | null): string {
  if (!meta) return 'Tagger catalog not downloaded yet'
  const when = new Date(meta.syncedAt).toLocaleString()
  return `${meta.tagCount} oracle tags · ${meta.taggingCount.toLocaleString()} taggings · synced ${when}`
}

export function cardCatalogLabel(meta: CatalogMeta | null): string {
  if (!meta) return 'Oracle card catalog not downloaded yet'
  const when = new Date(meta.syncedAt).toLocaleString()
  return `${meta.tagCount.toLocaleString()} unique cards · synced ${when}`
}

export function cobraCatalogLabel(meta: CatalogMeta | null): string {
  if (!meta) return 'Cube Cobra neighbors not downloaded yet'
  const when = new Date(meta.syncedAt).toLocaleString()
  return `${meta.tagCount.toLocaleString()} cards with synergistic neighbors · synced ${when}`
}

export function cobraEloLabel(meta: CatalogMeta | null): string {
  if (!meta) return 'Cube Cobra Elo not downloaded yet'
  const when = new Date(meta.syncedAt).toLocaleString()
  return `${meta.tagCount.toLocaleString()} cards with draft Elo · synced ${when}`
}
