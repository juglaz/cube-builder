import type { CardFilter, CardTheme, LibraryCard, Theme } from '../types'

export function libraryThemeCounts(tags: CardTheme[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tag of tags) {
    counts.set(tag.themeId, (counts.get(tag.themeId) ?? 0) + 1)
  }
  return counts
}

export function themeCardCount(theme: Theme, libraryCounts?: Map<string, number>): number {
  return libraryCounts?.get(theme.id) ?? theme.taggingCount ?? 0
}

export function sortThemesByCardCount<T extends Theme>(
  themes: T[],
  libraryCounts?: Map<string, number>,
): T[] {
  return [...themes].sort((a, b) => {
    const diff = themeCardCount(b, libraryCounts) - themeCardCount(a, libraryCounts)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
}

export function isLand(card: LibraryCard): boolean {
  return /\bLand\b/i.test(card.typeLine)
}

/** Name, types, keywords, and rules text (including every face). */
export function cardSearchHaystack(card: LibraryCard): string {
  const faces = card.faces ?? []
  return [
    card.name,
    card.typeLine,
    card.oracleText,
    (card.keywords ?? []).join(' '),
    ...faces.flatMap((face) => [face.name, face.typeLine, face.oracleText]),
  ]
    .join(' ')
    .toLowerCase()
}

export function isCreature(card: LibraryCard): boolean {
  return /\bCreature\b/i.test(card.typeLine)
}

export function isUsableOracleCard(card: LibraryCard): boolean {
  if (card.layout === 'art_series' || card.layout === 'token' || card.layout === 'emblem') return false
  if (/\bToken\b/i.test(card.typeLine)) return false
  return true
}

export const CARD_TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
  'Land',
] as const

export type CardTypeName = (typeof CARD_TYPES)[number]

export function cardHasType(card: LibraryCard, type: string): boolean {
  const hay = [card.typeLine, ...(card.faces ?? []).map((face) => face.typeLine)].join(' ')
  return new RegExp(`\\b${type}\\b`, 'i').test(hay)
}

export function cardTypes(card: LibraryCard): CardTypeName[] {
  return CARD_TYPES.filter((type) => cardHasType(card, type))
}

export const SPELL_FLOOR_TYPES = ['Instant', 'Sorcery', 'Enchantment', 'Artifact'] as const

export type SpellFloorType = (typeof SPELL_FLOOR_TYPES)[number]

export function typeLineHas(card: LibraryCard, type: string): boolean {
  return new RegExp(`\\b${type}\\b`, 'i').test(card.typeLine)
}

/** Types that count toward generation floors. Instant/Sorcery skip adventure creatures. */
export function typeFloorTypes(card: LibraryCard): SpellFloorType[] {
  return SPELL_FLOOR_TYPES.filter((type) => {
    if (!typeLineHas(card, type)) return false
    if (type === 'Instant' || type === 'Sorcery') return !isCreature(card)
    return true
  })
}

export function cmcBucket(cmc: number): string {
  if (cmc <= 1) return '0-1'
  if (cmc <= 5) return String(Math.floor(cmc))
  return '6+'
}

export function isHybridMana(manaCost: string): boolean {
  return /\{[WUBRGC2]\/[WUBRGC]\}/.test(manaCost)
}

export function listType(card: LibraryCard): string {
  const line = card.typeLine
  if (/\bCreature\b/i.test(line)) return 'Creature'
  if (/\bPlaneswalker\b/i.test(line)) return 'Planeswalker'
  if (/\bBattle\b/i.test(line)) return 'Battle'
  if (/\bInstant\b/i.test(line)) return 'Instant'
  if (/\bSorcery\b/i.test(line)) return 'Sorcery'
  if (/\bEnchantment\b/i.test(line)) return 'Enchantment'
  if (/\bArtifact\b/i.test(line)) return 'Artifact'
  if (/\bLand\b/i.test(line)) return 'Land'
  return 'Other'
}

export function colorListColumn(card: LibraryCard): string {
  if (isLand(card) && !/\bCreature\b/i.test(card.typeLine)) return 'Lands'
  const identity = card.colorIdentity
  if (identity.length === 0) return 'C'
  if (identity.length === 1) return identity[0]!
  if (isHybridMana(card.manaCost)) return 'Hybrid'
  return 'M'
}

export function matchesFilter(
  card: LibraryCard,
  filter: CardFilter,
  cardThemes: Array<{ themeId: string; synergy: number }>,
): boolean {
  const q = filter.query.trim().toLowerCase()
  if (q && !cardSearchHaystack(card).includes(q)) return false

  if (filter.types.length > 0) {
    const ok = filter.types.some((type) =>
      card.typeLine.toLowerCase().includes(type.toLowerCase()),
    )
    if (!ok) return false
  }

  if (filter.cmcBuckets.length > 0) {
    if (isLand(card) || !filter.cmcBuckets.includes(cmcBucket(card.cmc))) return false
  }

  if (filter.colors.length > 0) {
    const id = card.colorIdentity
    if (filter.colorMode === 'exact') {
      if (id.length !== filter.colors.length || filter.colors.some((c) => !id.includes(c))) {
        return false
      }
    } else if (filter.colorMode === 'identity') {
      if (filter.colors.some((c) => !id.includes(c))) return false
    } else if (filter.colors.includes('C')) {
      if (id.length > 0) return false
    } else if (!filter.colors.some((c) => id.includes(c))) {
      return false
    }
  }

  if (filter.themeIds.length > 0) {
    const tagged = cardThemes.filter((t) => filter.themeIds.includes(t.themeId))
    if (tagged.length === 0) return false
    if (filter.minSynergy && !tagged.some((t) => t.synergy >= filter.minSynergy)) return false
  } else if (filter.minSynergy && !cardThemes.some((t) => t.synergy >= filter.minSynergy)) {
    return false
  }

  return true
}

export function emptyFilter(): CardFilter {
  return {
    query: '',
    colors: [],
    colorMode: 'any',
    types: [],
    cmcBuckets: [],
    themeIds: [],
    minSynergy: 0,
  }
}
