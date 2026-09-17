import { db } from '../db'
import { isUsableOracleCard } from './cardMeta'
import {
  cardHasCreatureType,
  creatureTypesFromCard,
  isTypeThemeId,
  NOT_CREATURE_SUBTYPE,
  parseTypeThemeId,
  typeThemeId,
} from './creatureTypes'
import {
  cardMatchesSynergySpec,
  isNamedCardTag,
  synergyLaneNeedsCubeSupport,
  synergySupportSpec,
} from './synergyLanes'
import type { CardTheme, LibraryCard, Theme } from '../types'

export type SupportKind = 'typal' | 'synergy'

export type TypalRole = {
  typeName: string
  typeId: string
  kind: SupportKind
  member: boolean
  payoff: boolean
  rulesPayoff: boolean
}

export type TypalPayoffCard = {
  oracleId: string
  name: string
  imageNormal: string
  typeLine: string
  faces?: LibraryCard['faces']
  rulesPayoff: boolean
}

export type TypalSupportRow = {
  typeName: string
  typeId: string
  kind: SupportKind
  label: string
  memberNoun: string
  members: number
  want: number
  payoffs: TypalPayoffCard[]
}

/** Pack-visible tribe for a payoff: ~as-fan 0.5, never below 8. */
export function typalMemberFloor(targetSize: number): number {
  return Math.max(8, Math.round(targetSize / 30))
}

export function typalTypeFromSlug(slug: string | undefined): string | null {
  const match = (slug ?? '').toLowerCase().match(/^typal-(.+)$/)
  if (!match) return null
  return match[1]!.replace(/-/g, ' ').trim() || null
}

export function themeCreatureType(theme: Pick<Theme, 'id' | 'slug'>): string | null {
  return parseTypeThemeId(theme.id) ?? typalTypeFromSlug(theme.slug)
}

const SYNERGY_PREFIX = 'synergy:'

export function synergyThemeId(lane: string): string {
  return `${SYNERGY_PREFIX}${lane}`
}

export function parseSynergyThemeId(id: string): string | null {
  if (!id.startsWith(SYNERGY_PREFIX)) return null
  return id.slice(SYNERGY_PREFIX.length) || null
}

export function synergyLaneFromSlug(slug: string | undefined): string | null {
  const role = synergyRoleForSlug(slug)
  return role?.role === 'payoff' ? role.lane : null
}

const MODIFIED_MEMBER_SLUG =
  /(gains-pp-counters|^pp-counters|plus-one-plus-one|p1p1|oil-counter|shield-counter|^equipment$|^equip$|^aura$|^auras$)/i

/**
 * Tagger convention: synergy-X and X-matters are payoffs.
 * Enablers are not “whatever slug matches”: land types come from post-draft
 * basics, type/color/keyword lanes from the card itself, and a few lanes from
 * complementary tags (modified, mill, …).
 */
export function synergyRoleForSlug(
  slug: string | undefined,
): { lane: string; role: 'payoff' | 'member' } | null {
  const s = (slug ?? '').toLowerCase().trim()
  if (!s) return null
  if (s.startsWith('cycle-')) return null
  if (isNamedCardTag(s)) return null
  const syn = s.match(/^synergy-(.+)$/)
  if (syn?.[1]) {
    if (isNamedCardTag(syn[1]) || isNamedCardTag(s)) return null
    const spec = synergySupportSpec(syn[1])
    if (spec.support === 'ignore') return null
    return { lane: syn[1], role: 'payoff' }
  }
  const matters = s.match(/^(.+)-matters$/)
  if (matters?.[1]) {
    const spec = synergySupportSpec(matters[1])
    if (spec.support === 'ignore') return null
    return { lane: matters[1], role: 'payoff' }
  }
  if (MODIFIED_MEMBER_SLUG.test(s)) return { lane: 'modified', role: 'member' }
  const spec = synergySupportSpec(s)
  if (spec.tagSlugs?.includes(s) && spec.support === 'cube') return { lane: spec.lane, role: 'member' }
  return null
}

export function memberThemeIdsForLane(lane: string, themes: Theme[]): string[] {
  const slugs = new Set(synergySupportSpec(lane).tagSlugs ?? [])
  if (slugs.size === 0) return []
  return themes.filter((theme) => slugs.has((theme.slug ?? '').toLowerCase())).map((theme) => theme.id)
}

export function themeSynergyLane(theme: Pick<Theme, 'id' | 'slug'>): string | null {
  return parseSynergyThemeId(theme.id) ?? synergyLaneFromSlug(theme.slug)
}

export function displayTypalLabel(typeName: string): string {
  return typeName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function memberNounFor(kind: SupportKind, typeName: string): string {
  if (kind === 'synergy') return synergySupportSpec(typeName).memberNoun
  return `${displayTypalLabel(typeName)} type-line members`
}

function tagsForCard(tags: CardTheme[], oracleId: string): CardTheme[] {
  return tags.filter((tag) => tag.oracleId === oracleId)
}

function cardOracleText(card: LibraryCard): string {
  if (card.faces && card.faces.length > 0) {
    return card.faces.map((face) => face.oracleText).join('\n')
  }
  return card.oracleText
}

const IRREGULAR_TYPES: Record<string, string> = {
  elves: 'elf',
  wolves: 'wolf',
  werewolves: 'werewolf',
  merfolk: 'merfolk',
  sheep: 'sheep',
  mice: 'mouse',
  oxen: 'ox',
  fungi: 'fungus',
  djinn: 'djinn',
}

const NOT_TRIBAL_WORD = new Set([
  'creature',
  'permanent',
  'spell',
  'card',
  'token',
  'artifact',
  'enchantment',
  'land',
  'planeswalker',
  'instant',
  'sorcery',
  'battle',
  'saga',
  'other',
  'modified',
  'nontoken',
  'attacking',
  'blocking',
  'tapped',
  'untapped',
  'legendary',
  'historic',
  'share',
  'reach',
  'another',
  'target',
  'each',
  'all',
  'the',
  'this',
  'that',
  'those',
  'these',
])

const MULTIWORD_TYPES = new Set(['time lord'])

function normalizeCreatureTypeWord(raw: string): string | null {
  const lower = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!lower) return null
  if (MULTIWORD_TYPES.has(lower)) return lower
  if (IRREGULAR_TYPES[lower]) return IRREGULAR_TYPES[lower]
  if (lower.includes(' ')) return null
  const singular = lower.endsWith('s') && lower.length > 3 ? lower.slice(0, -1) : lower
  if (NOT_TRIBAL_WORD.has(lower) || NOT_TRIBAL_WORD.has(singular)) return null
  if (NOT_CREATURE_SUBTYPE.has(lower) || NOT_CREATURE_SUBTYPE.has(singular)) return null
  if (!/^[a-z][a-z'-]*$/.test(singular)) return null
  return singular
}

/** Lords and anthems: “Knights you control”. */
export function creatureTypesPaidOffInText(card: LibraryCard): string[] {
  const text = cardOracleText(card)
  if (!text) return []
  const found = new Set<string>()
  const patterns = [
    /\bother ([A-Z][a-z]+(?: [A-Z][a-z]+)?)s you control\b/g,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)s you control\b/g,
    /\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) creatures you control\b/g,
  ]
  for (const line of text.split(/\n+/)) {
    for (const re of patterns) {
      re.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = re.exec(line))) {
        const typeName = normalizeCreatureTypeWord(match[1] ?? '')
        if (typeName) found.add(typeName)
      }
    }
  }
  return [...found]
}

function upsertRole(
  byType: Map<string, TypalRole>,
  typeName: string,
  kind: SupportKind,
  patch: Partial<Pick<TypalRole, 'member' | 'payoff' | 'rulesPayoff'>>,
): void {
  const key = typeName.toLowerCase()
  const id = kind === 'synergy' ? synergyThemeId(key) : typeThemeId(key)
  const existing = byType.get(id)
  if (existing) {
    if (patch.member) existing.member = true
    if (patch.payoff) existing.payoff = true
    if (patch.rulesPayoff) existing.rulesPayoff = true
    return
  }
  byType.set(id, {
    typeName: key,
    typeId: id,
    kind,
    member: Boolean(patch.member),
    payoff: Boolean(patch.payoff),
    rulesPayoff: Boolean(patch.rulesPayoff),
  })
}

export function cardEnablesModified(card: LibraryCard): boolean {
  const types = [card.typeLine, ...(card.faces ?? []).map((face) => face.typeLine)].join(' ')
  if (/\bEquipment\b/i.test(types)) return true
  if (/\bAura\b/i.test(types)) return true
  const text = cardOracleText(card)
  if (!text) return false
  if (/\bmodified creatures you control\b/i.test(text)) return false
  return (
    /\b(?:oil |shield |\+1\/\+1 |lore |finality )?counters?\b/i.test(text) &&
    /\b(?:this creature|this permanent|onto? (?:it|this)|equipped creature|enchanted creature|target creature)\b/i.test(
      text,
    )
  )
}

export function cardIsModifiedPayoff(card: LibraryCard): boolean {
  return /\bmodified creatures you control\b/i.test(cardOracleText(card))
}

export function typalRolesForCard(
  card: LibraryCard,
  tags: CardTheme[],
  themesById: Map<string, Theme>,
): TypalRole[] {
  const byType = new Map<string, TypalRole>()
  for (const typeName of creatureTypesFromCard(card)) {
    upsertRole(byType, typeName, 'typal', { member: true })
  }
  for (const tag of tagsForCard(tags, card.oracleId)) {
    if (isTypeThemeId(tag.themeId)) continue
    const theme = themesById.get(tag.themeId)
    if (!theme) continue
    const typeName = themeCreatureType(theme)
    const typeKey = typeName ? normalizeCreatureTypeWord(typeName) : null
    if (typeKey) {
      const member = cardHasCreatureType(card, typeKey)
      const payoff = tag.synergy >= 3 || (!member && tag.synergy >= 2)
      upsertRole(byType, typeKey, 'typal', { member, payoff })
      continue
    }
    const role = synergyRoleForSlug(theme.slug)
    if (role && tag.synergy >= 2) {
      upsertRole(byType, role.lane, 'synergy', {
        payoff: role.role === 'payoff',
        member: role.role === 'member',
      })
    }
  }
  for (const typeName of creatureTypesPaidOffInText(card)) {
    upsertRole(byType, typeName, 'typal', { payoff: true, rulesPayoff: true })
  }
  if (cardIsModifiedPayoff(card)) {
    upsertRole(byType, 'modified', 'synergy', { payoff: true, rulesPayoff: true })
  }
  if (cardEnablesModified(card) && !cardIsModifiedPayoff(card)) {
    upsertRole(byType, 'modified', 'synergy', { member: true })
  }
  return [...byType.values()]
}

export function typalSupportRows(
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  size = cards.length,
): TypalSupportRow[] {
  const themesById = new Map(themes.map((theme) => [theme.id, theme]))
  const payoffs = new Map<string, TypalPayoffCard[]>()
  const members = new Map<string, number>()
  const kinds = new Map<string, SupportKind>()
  for (const card of cards) {
    const roles = typalRolesForCard(card, tags, themesById)
    for (const role of roles) {
      kinds.set(role.typeId, role.kind)
      if (role.member) members.set(role.typeId, (members.get(role.typeId) ?? 0) + 1)
      if (role.payoff) {
        const list = payoffs.get(role.typeId) ?? []
        list.push({
          oracleId: card.oracleId,
          name: card.name,
          imageNormal: card.imageNormal,
          typeLine: card.typeLine,
          faces: card.faces,
          rulesPayoff: role.rulesPayoff,
        })
        payoffs.set(role.typeId, list)
      }
    }
  }
  const slugsByOracle = new Map<string, Set<string>>()
  for (const tag of tags) {
    const slug = themesById.get(tag.themeId)?.slug
    if (!slug) continue
    const set = slugsByOracle.get(tag.oracleId) ?? new Set<string>()
    set.add(slug.toLowerCase())
    slugsByOracle.set(tag.oracleId, set)
  }
  const wantFloor = typalMemberFloor(size)
  return [...payoffs.entries()]
    .map(([typeId, cardsForType]) => {
      const typeName = parseTypeThemeId(typeId) ?? parseSynergyThemeId(typeId) ?? typeId
      const kind = kinds.get(typeId) ?? (typeId.startsWith(SYNERGY_PREFIX) ? 'synergy' : 'typal')
      const spec = kind === 'synergy' ? synergySupportSpec(typeName) : null
      let memberCount = members.get(typeId) ?? 0
      let want = wantFloor
      if (spec && spec.support !== 'cube') {
        memberCount = 0
        want = 0
      } else if (spec && spec.mode !== 'modified') {
        memberCount = 0
        for (const card of cards) {
          if (cardMatchesSynergySpec(card, spec, slugsByOracle.get(card.oracleId))) memberCount += 1
        }
      }
      const unique = [...new Map(cardsForType.map((card) => [card.oracleId, card])).values()]
      return {
        typeName,
        typeId,
        kind,
        label: displayTypalLabel(typeName.replace(/-/g, ' ')),
        memberNoun: memberNounFor(kind, typeName),
        members: memberCount,
        want,
        payoffs: unique.sort((a, b) => a.name.localeCompare(b.name)),
      }
    })
    .sort((a, b) => b.payoffs.length - a.payoffs.length || a.label.localeCompare(b.label))
}

export function themeSlugsByOracle(tags: CardTheme[], themes: Theme[]): Map<string, Set<string>> {
  const themesById = new Map(themes.map((theme) => [theme.id, theme]))
  const slugsByOracle = new Map<string, Set<string>>()
  for (const tag of tags) {
    const slug = themesById.get(tag.themeId)?.slug
    if (!slug) continue
    const set = slugsByOracle.get(tag.oracleId) ?? new Set<string>()
    set.add(slug.toLowerCase())
    slugsByOracle.set(tag.oracleId, set)
  }
  return slugsByOracle
}

export function cardLaneFlags(
  card: LibraryCard,
  typeId: string,
  kind: SupportKind,
  typeName: string,
  tags: CardTheme[],
  themesById: Map<string, Theme>,
  slugs?: Set<string>,
): { member: boolean; payoff: boolean } {
  const role = typalRolesForCard(card, tags, themesById).find((entry) => entry.typeId === typeId)
  let member = role?.member ?? false
  const payoff = role?.payoff ?? false
  const spec = kind === 'synergy' ? synergySupportSpec(typeName) : null
  if (spec && spec.support === 'cube' && spec.mode !== 'modified') {
    member = cardMatchesSynergySpec(card, spec, slugs)
  }
  return { member, payoff }
}

export function typalRowNeedsSupport(
  row: TypalSupportRow,
  _cards?: LibraryCard[],
  preferOracleIds?: Set<string>,
): boolean {
  if (row.payoffs.length === 0) return false
  if (row.kind === 'synergy' && !synergyLaneNeedsCubeSupport(row.typeName)) return false
  if (row.want > 0 && row.members >= row.want) return false
  if (preferOracleIds && row.payoffs.some((card) => preferOracleIds.has(card.oracleId))) return true
  return row.kind === 'typal' || row.kind === 'synergy'
}

export function payoffTypeNamesFromPool(
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  limit = 6,
  preferOracleIds?: Set<string>,
): string[] {
  return supportLanesFromPool(cards, tags, themes, limit, preferOracleIds)
    .filter((row) => row.kind === 'typal')
    .map((row) => row.typeName)
}

export function supportLanesFromPool(
  cards: LibraryCard[],
  tags: CardTheme[],
  themes: Theme[],
  limit = 6,
  preferOracleIds?: Set<string>,
): TypalSupportRow[] {
  return typalSupportRows(cards, tags, themes, cards.length)
    .filter((row) => typalRowNeedsSupport(row, cards, preferOracleIds))
    .sort((a, b) => {
      const aSeed = preferOracleIds && a.payoffs.some((card) => preferOracleIds.has(card.oracleId)) ? 1 : 0
      const bSeed = preferOracleIds && b.payoffs.some((card) => preferOracleIds.has(card.oracleId)) ? 1 : 0
      if (aSeed !== bSeed) return bSeed - aSeed
      return b.payoffs.length - a.payoffs.length
    })
    .slice(0, limit)
}

export async function oracleIdsForModifiedSupport(prefer: Set<string>, cap = 160): Promise<string[]> {
  const catalog = await db.oracleCards.toArray()
  const hits = catalog.filter((card) => isUsableOracleCard(card) && cardEnablesModified(card))
  hits.sort((a, b) => {
    const aPref = prefer.has(a.oracleId) ? 0 : 1
    const bPref = prefer.has(b.oracleId) ? 0 : 1
    if (aPref !== bPref) return aPref - bPref
    return a.name.localeCompare(b.name)
  })
  return hits.slice(0, cap).map((card) => card.oracleId)
}
