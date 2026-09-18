import { CMC_BUCKETS, type CardTheme, type LibraryCard, type Theme } from '../types'
import { cmcBucket, colorListColumn, isLand, listType, sortThemesByCardCount } from './cardMeta'
import { creatureTypesFromCard, typeThemeFromId, typeThemeId } from './creatureTypes'

export type GroupAxis = 'color' | 'theme' | 'type' | 'cmc' | 'kind' | 'none'

export const PRIMARY_AXES: Array<{ id: Exclude<GroupAxis, 'none'>; label: string }> = [
  { id: 'color', label: 'Color' },
  { id: 'theme', label: 'Theme' },
  { id: 'type', label: 'Card type' },
  { id: 'cmc', label: 'Mana value' },
  { id: 'kind', label: 'Role' },
]

export const SECONDARY_AXES: Array<{ id: GroupAxis; label: string }> = [
  { id: 'none', label: 'None' },
  ...PRIMARY_AXES,
]

export const LIST_TYPE_ORDER = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Enchantment',
  'Artifact',
  'Land',
  'Other',
] as const

export type CubeListSection = {
  id: string
  label: string
  accent?: string
  cards: LibraryCard[]
}

export type CubeListColumn = {
  id: string
  label: string
  accent: string
  cards: LibraryCard[]
  sections: CubeListSection[]
}

export const COLOR_LIST_COLUMNS: Array<{ id: string; label: string; accent: string }> = [
  { id: 'W', label: 'White', accent: '#f3ead2' },
  { id: 'U', label: 'Blue', accent: '#6eb5e0' },
  { id: 'B', label: 'Black', accent: '#c5c0b8' },
  { id: 'R', label: 'Red', accent: '#e07a6a' },
  { id: 'G', label: 'Green', accent: '#7cbf7c' },
  { id: 'C', label: 'Colorless', accent: '#d4c06a' },
  { id: 'M', label: 'Multicolored', accent: '#e0c25c' },
  { id: 'Hybrid', label: 'Hybrid', accent: '#c4b06a' },
  { id: 'Lands', label: 'Lands', accent: '#7aa0c4' },
]

const KIND_COLUMNS: Array<{ id: string; label: string; accent: string }> = [
  { id: 'creature', label: 'Creatures', accent: '#e0c25c' },
  { id: 'spell', label: 'Instants & sorceries', accent: '#7aa0c4' },
  { id: 'permanent', label: 'Other permanents', accent: '#c4b06a' },
  { id: 'land', label: 'Lands', accent: '#7cbf7c' },
]

type BucketSpec = { id: string; label: string; accent: string; keepEmpty: boolean }

function sortByName(cards: LibraryCard[]): LibraryCard[] {
  return [...cards].sort((a, b) => a.name.localeCompare(b.name))
}

function column(
  id: string,
  label: string,
  accent: string,
  cards: LibraryCard[],
  sections: CubeListSection[],
): CubeListColumn {
  return { id, label, accent, cards, sections }
}

function tagsByOracle(tags: CardTheme[]): Map<string, CardTheme[]> {
  const map = new Map<string, CardTheme[]>()
  for (const tag of tags) {
    const list = map.get(tag.oracleId) ?? []
    list.push(tag)
    map.set(tag.oracleId, list)
  }
  return map
}

function themeIdsOnCard(card: LibraryCard, tagsByCard: Map<string, CardTheme[]>): Set<string> {
  const ids = new Set<string>()
  for (const tag of tagsByCard.get(card.oracleId) ?? []) ids.add(tag.themeId)
  for (const typeName of creatureTypesFromCard(card)) ids.add(typeThemeId(typeName))
  return ids
}

export function themeCountsForCards(
  cards: LibraryCard[],
  tags: CardTheme[],
): Map<string, number> {
  const tagsByCard = tagsByOracle(tags)
  const counts = new Map<string, number>()
  for (const card of cards) {
    for (const themeId of themeIdsOnCard(card, tagsByCard)) {
      counts.set(themeId, (counts.get(themeId) ?? 0) + 1)
    }
  }
  return counts
}

export function densestThemeIds(
  cards: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
  limit = 20,
): string[] {
  const counts = themeCountsForCards(cards, tags)
  const byId = new Map(themes.map((theme) => [theme.id, theme]))
  for (const id of counts.keys()) {
    if (byId.has(id)) continue
    const fromType = typeThemeFromId(id)
    if (fromType) byId.set(id, fromType)
  }
  return sortThemesByCardCount(
    [...byId.values()].filter((theme) => (counts.get(theme.id) ?? 0) > 0),
    counts,
  )
    .slice(0, limit)
    .map((theme) => theme.id)
}

function cardKind(card: LibraryCard): string {
  if (isLand(card) && !/\bCreature\b/i.test(card.typeLine)) return 'land'
  if (/\bCreature\b/i.test(card.typeLine)) return 'creature'
  if (/\bInstant\b/i.test(card.typeLine) || /\bSorcery\b/i.test(card.typeLine)) return 'spell'
  return 'permanent'
}

function axisSpecs(
  axis: GroupAxis,
  themes: Theme[],
  themeIds: string[],
): BucketSpec[] {
  if (axis === 'none') return [{ id: 'all', label: '', accent: '#c4b06a', keepEmpty: true }]
  if (axis === 'color') return COLOR_LIST_COLUMNS.map((spec) => ({ ...spec, keepEmpty: true }))
  if (axis === 'type') {
    return LIST_TYPE_ORDER.map((id) => ({ id, label: id, accent: '#c4b06a', keepEmpty: false }))
  }
  if (axis === 'cmc') {
    return [
      ...CMC_BUCKETS.map((id) => ({
        id,
        label: id === '0-1' ? '0–1' : id,
        accent: '#c4b06a',
        keepEmpty: false,
      })),
      { id: 'land', label: 'Lands', accent: '#7aa0c4', keepEmpty: false },
    ]
  }
  if (axis === 'kind') return KIND_COLUMNS.map((spec) => ({ ...spec, keepEmpty: false }))
  const byId = new Map(themes.map((theme) => [theme.id, theme]))
  return [
    ...themeIds.map((id) => {
      const theme = byId.get(id) ?? typeThemeFromId(id)
      return {
        id,
        label: theme?.name ?? id,
        accent: theme?.accent ?? '#c4b06a',
        keepEmpty: true,
      }
    }),
    { id: 'other', label: 'Other', accent: '#8a8680', keepEmpty: false },
  ]
}

function idsForCard(
  card: LibraryCard,
  axis: GroupAxis,
  tagsByCard: Map<string, CardTheme[]>,
  selectedThemes: Set<string>,
): string[] {
  if (axis === 'none') return ['all']
  if (axis === 'color') return [colorListColumn(card)]
  if (axis === 'type') return [listType(card)]
  if (axis === 'cmc') return [isLand(card) ? 'land' : cmcBucket(card.cmc)]
  if (axis === 'kind') return [cardKind(card)]
  const hit = [...themeIdsOnCard(card, tagsByCard)].filter((id) => selectedThemes.has(id))
  return hit.length > 0 ? hit : ['other']
}

function partition(
  cards: LibraryCard[],
  axis: GroupAxis,
  specs: BucketSpec[],
  tagsByCard: Map<string, CardTheme[]>,
  selectedThemes: Set<string>,
): Map<string, LibraryCard[]> {
  const map = new Map<string, LibraryCard[]>()
  for (const spec of specs) map.set(spec.id, [])
  for (const card of cards) {
    for (const id of idsForCard(card, axis, tagsByCard, selectedThemes)) {
      map.get(id)?.push(card)
    }
  }
  return map
}

export function defaultSecondary(primary: GroupAxis): GroupAxis {
  if (primary === 'color') return 'type'
  if (primary === 'theme') return 'color'
  return 'color'
}

export function groupCube(
  cards: LibraryCard[],
  options: {
    primary: GroupAxis
    secondary: GroupAxis
    themes?: Theme[]
    tags?: CardTheme[]
    themeIds?: string[]
  },
): CubeListColumn[] {
  const primary = options.primary
  const secondary = options.secondary === primary ? 'none' : options.secondary
  const themes = options.themes ?? []
  const tags = options.tags ?? []
  const themeIds = options.themeIds ?? []
  const tagsByCard = tagsByOracle(tags)
  const selectedThemes = new Set(themeIds)
  const primarySpecs = axisSpecs(primary, themes, themeIds)
  const secondarySpecs = axisSpecs(secondary, themes, themeIds)
  const primaryMap = partition(cards, primary, primarySpecs, tagsByCard, selectedThemes)

  return primarySpecs
    .filter((spec) => spec.keepEmpty || (primaryMap.get(spec.id)?.length ?? 0) > 0)
    .map((spec) => {
      const list = primaryMap.get(spec.id) ?? []
      if (secondary === 'none') {
        return column(spec.id, spec.label, spec.accent, list, [
          { id: 'all', label: '', cards: sortByName(list) },
        ])
      }
      const sectionMap = partition(list, secondary, secondarySpecs, tagsByCard, selectedThemes)
      const sections = secondarySpecs
        .filter((section) => (sectionMap.get(section.id)?.length ?? 0) > 0)
        .map((section) => ({
          id: section.id,
          label: section.label,
          accent: section.accent,
          cards: sortByName(sectionMap.get(section.id) ?? []),
        }))
      return column(spec.id, spec.label, spec.accent, list, sections)
    })
}

export function nameColorClass(card: LibraryCard): string {
  if (isLand(card) && !/\bCreature\b/i.test(card.typeLine) && card.colorIdentity.length !== 1) {
    if (card.colorIdentity.length === 0) return 'text-[#c5b88a]'
    return 'text-[#e0c25c]'
  }
  if (card.colorIdentity.length === 0) return 'text-[#d4c06a]'
  if (card.colorIdentity.length > 1) return 'text-[#e8c84a]'
  const color = card.colorIdentity[0]
  if (color === 'W') return 'text-[#f3ead2]'
  if (color === 'U') return 'text-[#64b5f6]'
  if (color === 'B') return 'text-[#c8c4bc]'
  if (color === 'R') return 'text-[#ef9a9a]'
  if (color === 'G') return 'text-[#81c784]'
  return 'text-stone-200'
}
