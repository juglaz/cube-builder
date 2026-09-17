import type { CardTheme, LibraryCard, Theme } from '../types'

export const STRUCTURE_TOP_N = 8
export const PLAYABLE_AS_FAN = 1
export const DOMINANT_AS_FAN = 1.5
export const PAIR_GLUE = 4

const FLAVOR =
  /alliteration|single[- ]english[- ]word|pun\b|anagram|palindrome|rhyme|named[- ](?:for|after)|flavor[- ]name/

/** Ubiquitous mechanics that show up in every cube. Not archetype lanes. */
const AMBIENT =
  /^(evasion|triggered-ability|activated-ability|mana-ability|keyword(?:-ability)?|static-ability|enters(?:-the-battlefield)?|etb|leaves-the-battlefield|dies|cast-trigger|combat-damage|attack-trigger|block|draw|discard|destroy|exile|counterspell|(?:spot-|multi-)?removal|single-target|modal|flying|trample|haste|vigilance|lifelink|deathtouch|hexproof|ward|menace|reach|flash|first-strike|double-strike|lifegain|ramp|tutor|bounce|burn|cantrip|cycle|scry|surveil|mill|graveyard-hate)$/i

export type ThemeMix = {
  size: number
  hasTags: boolean
  hasFocus: boolean
  supported: number
  dominant: number
  eighthAsFan: number
  topAsFan: number
  top8MedianAsFan: number
  coverage: number
  bridgeShare: number
  connectedPairs: number
  focusCount: number
  focusMinAsFan: number
  focusMedianAsFan: number
  focusSupportedShare: number
  focusBridgeShare: number
  focusConnectedPairs: number
}

function asFan(count: number, size: number): number {
  return size > 0 ? (count / size) * 15 : 0
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function isFlavorTheme(theme: Pick<Theme, 'name' | 'slug'>): boolean {
  return FLAVOR.test(`${theme.slug ?? ''} ${theme.name}`.toLowerCase())
}

export function isAmbientTheme(theme: Pick<Theme, 'name' | 'slug'>): boolean {
  const slug = (theme.slug ?? '').toLowerCase()
  const name = theme.name.toLowerCase().replace(/\s+/g, '-')
  return AMBIENT.test(slug) || AMBIENT.test(name)
}

export function isStructuralTheme(theme: Theme): boolean {
  if (theme.hidden) return false
  if (theme.id.startsWith('type:')) return false
  return !isFlavorTheme(theme)
}

function tagsByCard(tags: CardTheme[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const tag of tags) {
    const list = map.get(tag.oracleId) ?? []
    if (!list.includes(tag.themeId)) list.push(tag.themeId)
    map.set(tag.oracleId, list)
  }
  return map
}

function countsFor(
  cards: LibraryCard[],
  byCard: Map<string, string[]>,
  allowed: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const card of cards) {
    const seen = new Set<string>()
    for (const id of byCard.get(card.oracleId) ?? []) {
      if (!allowed.has(id) || seen.has(id)) continue
      seen.add(id)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  return counts
}

export function densestIds(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id]) => id)
}

export function overlapFromTagLists(
  tagLists: Iterable<readonly string[]>,
  topIds: Set<string>,
  size: number,
): { coverage: number; bridgeShare: number; connectedPairs: number } {
  let inTheme = 0
  let bridged = 0
  const pairs = new Map<string, number>()
  for (const tags of tagLists) {
    const hits = [...new Set(tags.filter((id) => topIds.has(id)))].sort()
    if (hits.length === 0) continue
    inTheme += 1
    if (hits.length >= 2) bridged += 1
    for (let i = 0; i < hits.length; i += 1) {
      for (let j = i + 1; j < hits.length; j += 1) {
        const key = `${hits[i]}|${hits[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  return {
    coverage: size > 0 ? inTheme / size : 0,
    bridgeShare: inTheme > 0 ? bridged / inTheme : 0,
    connectedPairs: [...pairs.values()].filter((n) => n >= PAIR_GLUE).length,
  }
}

function overlapStats(
  cards: LibraryCard[],
  byCard: Map<string, string[]>,
  focusIds: Set<string>,
  size: number,
): { coverage: number; bridgeShare: number; connectedPairs: number } {
  return overlapFromTagLists(
    cards.map((card) => byCard.get(card.oracleId) ?? []),
    focusIds,
    size,
  )
}

const EMPTY: ThemeMix = {
  size: 0,
  hasTags: false,
  hasFocus: false,
  supported: 0,
  dominant: 0,
  eighthAsFan: 0,
  topAsFan: 0,
  top8MedianAsFan: 0,
  coverage: 0,
  bridgeShare: 0,
  connectedPairs: 0,
  focusCount: 0,
  focusMinAsFan: 0,
  focusMedianAsFan: 0,
  focusSupportedShare: 0,
  focusBridgeShare: 0,
  focusConnectedPairs: 0,
}

export function computeThemeMix(
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  focusThemeIds: string[] = [],
): ThemeMix {
  const size = cards.length
  if (size === 0 || tags.length === 0) return { ...EMPTY, size }

  const themeById = new Map(themes.map((theme) => [theme.id, theme]))
  const structuralIds = new Set(
    themes.filter(isStructuralTheme).map((theme) => theme.id),
  )
  const byCard = tagsByCard(tags)
  const counts = countsFor(cards, byCard, structuralIds)
  const ranked = [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: themeById.get(id)?.name ?? id,
      count,
      asFan: asFan(count, size),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const top = ranked.slice(0, STRUCTURE_TOP_N)
  const topIds = new Set(top.map((row) => row.id))
  const overlap = overlapStats(cards, byCard, topIds, size)

  const focus = [...new Set(focusThemeIds.filter(Boolean))]
  const focusSet = new Set(focus)
  const focusFans = focus.map((id) => {
    let n = 0
    for (const card of cards) {
      if ((byCard.get(card.oracleId) ?? []).includes(id)) n += 1
    }
    return asFan(n, size)
  })
  const focusOverlap =
    focus.length >= 2 ? overlapStats(cards, byCard, focusSet, size) : { coverage: 0, bridgeShare: 0, connectedPairs: 0 }

  return {
    size,
    hasTags: true,
    hasFocus: focus.length > 0,
    supported: ranked.filter((row) => row.asFan >= PLAYABLE_AS_FAN).length,
    dominant: ranked.filter((row) => row.asFan >= DOMINANT_AS_FAN).length,
    eighthAsFan: ranked[STRUCTURE_TOP_N - 1]?.asFan ?? 0,
    topAsFan: ranked[0]?.asFan ?? 0,
    top8MedianAsFan: median(top.map((row) => row.asFan)),
    coverage: overlap.coverage,
    bridgeShare: overlap.bridgeShare,
    connectedPairs: overlap.connectedPairs,
    focusCount: focus.length,
    focusMinAsFan: focusFans.length ? Math.min(...focusFans) : 0,
    focusMedianAsFan: median(focusFans),
    focusSupportedShare: focusFans.length
      ? focusFans.filter((n) => n >= PLAYABLE_AS_FAN).length / focusFans.length
      : 0,
    focusBridgeShare: focusOverlap.bridgeShare,
    focusConnectedPairs: focusOverlap.connectedPairs,
  }
}
