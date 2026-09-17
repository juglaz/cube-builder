import type { ScryfallTag } from '../api/scryfall'
import { db } from '../db'
import type { CardTheme, CatalogTagging, LibraryCard, Synergy, Theme } from '../types'

const ACCENTS = ['#c4a35a', '#4c7c9c', '#6b4c7c', '#9c4c4c', '#4c7c5a', '#8a6b4c', '#7c6b4c']

export function accentFromSlug(slug: string): string {
  let n = 0
  for (let i = 0; i < slug.length; i += 1) n += slug.charCodeAt(i)
  return ACCENTS[n % ACCENTS.length]!
}

export function weightToSynergy(weight?: string): Synergy {
  if (weight === 'weak') return 1
  if (weight === 'strong') return 3
  if (weight === 'very_strong') return 4
  return 2
}

export function themeFromTag(tag: ScryfallTag, existing?: Theme): Theme {
  return {
    id: tag.id,
    name: tag.label,
    description: tag.description ?? '',
    accent: existing?.accent ?? accentFromSlug(tag.slug),
    source: 'tagger',
    slug: tag.slug,
    parentIds: tag.parent_ids ?? [],
    childIds: tag.child_ids ?? [],
    aliases: tag.aliases ?? [],
    enabled: existing?.enabled ?? true,
    hidden: existing?.hidden ?? false,
    taggingCount: tag.taggings?.length ?? 0,
  }
}

export async function replaceCatalog(tags: ScryfallTag[], updatedAt: string): Promise<CatalogTagging[]> {
  const existing = new Map((await db.themes.toArray()).map((t) => [t.id, t]))
  const themeRows: Theme[] = []
  const taggingRows: CatalogTagging[] = []

  for (const tag of tags) {
    if (tag.type && tag.type !== 'oracle') continue
    themeRows.push(themeFromTag(tag, existing.get(tag.id)))
    for (const tagging of tag.taggings ?? []) {
      if (!tagging.oracle_id) continue
      taggingRows.push({
        oracleId: tagging.oracle_id,
        tagId: tag.id,
        synergy: weightToSynergy(tagging.weight),
      })
    }
  }

  const custom = [...existing.values()].filter((t) => t.source === 'custom')

  await db.transaction('rw', db.themes, db.catalogTaggings, db.meta, async () => {
    await db.catalogTaggings.clear()
    await db.themes.where('source').equals('tagger').delete()
    await db.themes.bulkPut([...themeRows, ...custom])
    const chunk = 4000
    for (let i = 0; i < taggingRows.length; i += chunk) {
      await db.catalogTaggings.bulkPut(taggingRows.slice(i, i + chunk))
    }
    await db.meta.put({
      key: 'oracle_tags',
      updatedAt,
      syncedAt: Date.now(),
      tagCount: themeRows.length,
      taggingCount: taggingRows.length,
    })
  })

  return taggingRows
}

export async function replaceOracleCardCatalog(cards: LibraryCard[], updatedAt: string): Promise<number> {
  const chunk = 500
  await db.transaction('rw', db.oracleCards, db.meta, async () => {
    await db.oracleCards.clear()
    for (let i = 0; i < cards.length; i += chunk) {
      await db.oracleCards.bulkPut(cards.slice(i, i + chunk))
    }
    await db.meta.put({
      key: 'oracle_cards',
      updatedAt,
      syncedAt: Date.now(),
      tagCount: cards.length,
      taggingCount: 0,
    })
  })
  return cards.length
}

export async function backfillLibraryFromCatalog(): Promise<number> {
  const libraryIds = (await db.cards.toArray()).map((c) => c.oracleId)
  return applyTaggerToOracleIds(libraryIds)
}

export async function oracleIdsForThemes(themeIds: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const themeId of themeIds) {
    const hits = await db.catalogTaggings.where('tagId').equals(themeId).toArray()
    for (const hit of hits) ids.add(hit.oracleId)
  }
  return [...ids]
}

export async function catalogTagsForOracleIds(oracleIds: string[]): Promise<CardTheme[]> {
  if (oracleIds.length === 0) return []
  const hidden = new Set((await db.themes.filter((t) => t.hidden).toArray()).map((t) => t.id))
  const unique = [...new Set(oracleIds)]
  const rows: CardTheme[] = []
  const chunk = 400
  for (let i = 0; i < unique.length; i += chunk) {
    const hits = await db.catalogTaggings.where('oracleId').anyOf(unique.slice(i, i + chunk)).toArray()
    for (const hit of hits) {
      if (hidden.has(hit.tagId)) continue
      rows.push({
        oracleId: hit.oracleId,
        themeId: hit.tagId,
        synergy: hit.synergy,
        userOverride: false,
      })
    }
  }
  return rows
}

/** Strongest tagged cards per theme — keeps generation pools from swallowing the whole catalog. */
export async function slimOracleIdsForThemes(themeIds: string[], perTheme = 90): Promise<string[]> {
  const keep = new Set<string>()
  for (const themeId of themeIds) {
    if (!themeId || themeId.startsWith('type:')) continue
    const hits = await db.catalogTaggings.where('tagId').equals(themeId).toArray()
    hits.sort((a, b) => b.synergy - a.synergy)
    let taken = 0
    for (const hit of hits) {
      if (hit.synergy >= 4 || taken < perTheme) {
        keep.add(hit.oracleId)
        taken += 1
      }
    }
  }
  return [...keep]
}

/** Theme rows for generation: catalog taggings, with local 1–4 edits winning. */
export async function tagsForThemes(themeIds: string[]): Promise<CardTheme[]> {
  if (themeIds.length === 0) return []
  const byKey = new Map<string, CardTheme>()

  for (const themeId of themeIds) {
    const catalogHits = await db.catalogTaggings.where('tagId').equals(themeId).toArray()
    for (const hit of catalogHits) {
      byKey.set(`${hit.oracleId}:${themeId}`, {
        oracleId: hit.oracleId,
        themeId,
        synergy: hit.synergy,
        userOverride: false,
      })
    }
    const localHits = await db.cardThemes.where('themeId').equals(themeId).toArray()
    for (const row of localHits) {
      byKey.set(`${row.oracleId}:${themeId}`, row)
    }
  }

  return [...byKey.values()]
}

export async function applyTaggerToOracleIds(oracleIds: string[]): Promise<number> {
  if (oracleIds.length === 0) return 0
  const hidden = new Set((await db.themes.filter((t) => t.hidden).toArray()).map((t) => t.id))

  let written = 0
  await db.transaction('rw', db.catalogTaggings, db.cardThemes, async () => {
    for (const oracleId of oracleIds) {
      const hits = await db.catalogTaggings.where('oracleId').equals(oracleId).toArray()
      for (const hit of hits) {
        if (hidden.has(hit.tagId)) continue
        const existing = await db.cardThemes.get([oracleId, hit.tagId])
        if (existing?.userOverride) continue
        await db.cardThemes.put({
          oracleId,
          themeId: hit.tagId,
          synergy: hit.synergy,
          userOverride: false,
        })
        written += 1
      }
    }
  })
  return written
}

export async function backfillEnabledTheme(themeId: string): Promise<number> {
  const libraryIds = new Set((await db.cards.toArray()).map((c) => c.oracleId))
  const hits = await db.catalogTaggings.where('tagId').equals(themeId).toArray()
  let written = 0
  await db.transaction('rw', db.cardThemes, async () => {
    for (const hit of hits) {
      if (!libraryIds.has(hit.oracleId)) continue
      const existing = await db.cardThemes.get([hit.oracleId, themeId])
      if (existing?.userOverride) continue
      await db.cardThemes.put({
        oracleId: hit.oracleId,
        themeId,
        synergy: hit.synergy,
        userOverride: false,
      })
      written += 1
    }
  })
  return written
}

export function parentLabel(themes: Theme[], theme: Theme): string {
  if (!theme.parentIds?.length) return ''
  return theme.parentIds
    .map((id) => themes.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(' / ')
}

const GENERIC_IDENTITY = new Set([
  'creature',
  'creatures',
  'instant',
  'instants',
  'sorcery',
  'sorceries',
  'enchantment',
  'enchantments',
  'artifact',
  'artifacts',
  'land',
  'lands',
  'planeswalker',
  'planeswalkers',
  'legendary',
  'snow',
  'token',
  'tokens',
  'card',
  'cards',
  'permanent',
  'permanents',
  'spell',
  'spells',
  'white',
  'blue',
  'black',
  'red',
  'green',
  'colorless',
  'multicolor',
  'mono',
  'monocolor',
  'hybrid',
])

/** True when a tag name/slug looks like a creature type (or similar) printed on the card. */
export function themeMatchesCardIdentity(theme: Theme, card: LibraryCard): boolean {
  const hay = `${card.typeLine} ${card.name}`.toLowerCase()
  const labels = [theme.name, theme.slug, ...(theme.aliases ?? [])]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase().replace(/[_-]+/g, ' ').trim())

  for (const label of labels) {
    if (!label) continue
    const words = label.split(/\s+/).filter(Boolean)
    if (words.length === 0 || words.every((w) => GENERIC_IDENTITY.has(w))) continue
    if (label.length >= 4 && (hay.includes(label) || hay.includes(label.replace(/s$/, '')))) {
      return true
    }
    for (const word of words) {
      if (GENERIC_IDENTITY.has(word) || word.length < 4) continue
      const stem = word.replace(/s$/, '')
      if (hay.includes(word) || (stem.length >= 4 && hay.includes(stem))) return true
    }
  }
  return false
}
