import { db } from '../db'
import { isCreature } from './cardMeta'
import { accentFromSlug } from './tagger'
import type { CardTheme, LibraryCard, Theme } from '../types'

const TYPE_PREFIX = 'type:'

/** Subtypes that appear after the dash on mixed cards but are not creature types. */
export const NOT_CREATURE_SUBTYPE = new Set([
  'adventure',
  'attraction',
  'aura',
  'background',
  'blood',
  'cartouche',
  'case',
  'cave',
  'class',
  'clue',
  'contraption',
  'curse',
  'desert',
  'dungeon',
  'equipment',
  'food',
  'forest',
  'fortification',
  'gate',
  'gold',
  'island',
  'junk',
  'lair',
  'locus',
  'map',
  'mine',
  'mountain',
  'plains',
  'power-plant',
  'powerstone',
  'quest',
  'room',
  'saga',
  'shrine',
  'sphere',
  'swamp',
  'tower',
  'treasure',
  'urza\'s',
  'vehicle',
  'waste',
])

export function isTypeThemeId(id: string): boolean {
  return id.startsWith(TYPE_PREFIX)
}

export function typeThemeId(typeName: string): string {
  return `${TYPE_PREFIX}${typeName.trim().toLowerCase()}`
}

export function parseTypeThemeId(id: string): string | null {
  if (!isTypeThemeId(id)) return null
  const name = id.slice(TYPE_PREFIX.length).trim()
  return name || null
}

export function displayCreatureType(typeName: string): string {
  return typeName
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function typeThemeFromId(id: string): Theme | null {
  const name = parseTypeThemeId(id)
  if (!name) return null
  const label = displayCreatureType(name)
  return {
    id,
    name: label,
    description: `Creature type ${label}. The generator pulls cards with this type, plus Tagger typal payoffs when that catalog is installed.`,
    accent: accentFromSlug(name),
    source: 'custom',
    slug: `type-${name.replace(/\s+/g, '-')}`,
    enabled: true,
    hidden: false,
    taggingCount: 0,
  }
}

export function typeThemesFromIds(ids: string[]): Theme[] {
  return ids.map(typeThemeFromId).filter((t): t is Theme => Boolean(t))
}

export function creatureTypesFromTypeLine(typeLine: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const face of typeLine.split('//')) {
    const parts = face.split(/\s+(?:—|--|–)\s+/)
    if (parts.length < 2) continue
    const prefix = (parts[0] ?? '').toLowerCase()
    if (!/\b(creature|kindred|tribal)\b/.test(prefix)) continue
    const subtypes = (parts.slice(1).join(' ') ?? '').trim()
    for (const raw of subtypes.split(/\s+/)) {
      const word = raw.replace(/[^A-Za-z'-]/g, '')
      if (!word) continue
      const key = word.toLowerCase()
      if (NOT_CREATURE_SUBTYPE.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push(word)
    }
  }
  return out
}

export function creatureTypesFromCard(card: LibraryCard): string[] {
  const lines =
    card.faces && card.faces.length > 0 ? card.faces.map((face) => face.typeLine) : [card.typeLine]
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    for (const typeName of creatureTypesFromTypeLine(line)) {
      const key = typeName.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(typeName)
    }
  }
  return out
}

export function cardHasCreatureType(card: LibraryCard, typeName: string): boolean {
  const want = typeName.trim().toLowerCase()
  return creatureTypesFromCard(card).some((t) => t.toLowerCase() === want)
}

export function isRedundantTypalTag(theme: Theme, typeNames: string[]): boolean {
  if (typeNames.length === 0) return false
  const types = new Set(typeNames.map((t) => t.toLowerCase()))
  const slug = (theme.slug ?? '').toLowerCase()
  const name = theme.name.toLowerCase().replace(/[_-]+/g, ' ').trim()
  for (const typeName of types) {
    if (slug === `typal-${typeName}` || slug === typeName || slug === `${typeName}s`) return true
    const pretty = name.replace(/^typal\s+/, '')
    if (pretty === typeName || pretty === `${typeName}s`) return true
  }
  return false
}

function usableOracleCard(card: LibraryCard): boolean {
  if (card.layout === 'art_series' || card.layout === 'token' || card.layout === 'emblem') return false
  if (/\bToken\b/i.test(card.typeLine)) return false
  return true
}

export async function typalThemeForCreatureType(typeName: string): Promise<Theme | undefined> {
  const slug = `typal-${typeName.trim().toLowerCase()}`
  const bySlug = await db.themes.where('slug').equals(slug).first()
  if (bySlug) return bySlug
  return undefined
}

export async function dropRedundantTypalThemeIds(themeIds: string[]): Promise<string[]> {
  const typeNames = themeIds.map(parseTypeThemeId).filter((n): n is string => Boolean(n))
  if (typeNames.length === 0) return themeIds
  const drop = new Set<string>()
  for (const typeName of typeNames) {
    const typal = await typalThemeForCreatureType(typeName)
    if (typal) drop.add(typal.id)
  }
  return themeIds.filter((id) => !drop.has(id))
}

export async function oracleIdsForCreatureTypes(
  typeNames: string[],
  prefer: Set<string>,
  perType = 160,
): Promise<string[]> {
  if (typeNames.length === 0) return []
  const catalog = await db.oracleCards.toArray()
  const keep = new Set<string>()
  for (const typeName of typeNames) {
    const hits = catalog.filter(
      (card) => usableOracleCard(card) && cardHasCreatureType(card, typeName),
    )
    hits.sort((a, b) => {
      const aPref = prefer.has(a.oracleId) ? 0 : 1
      const bPref = prefer.has(b.oracleId) ? 0 : 1
      if (aPref !== bPref) return aPref - bPref
      const aC = isCreature(a) ? 0 : 1
      const bC = isCreature(b) ? 0 : 1
      if (aC !== bC) return aC - bC
      if (a.cmc !== b.cmc) return a.cmc - b.cmc
      return a.name.localeCompare(b.name)
    })
    for (const card of hits.slice(0, perType)) keep.add(card.oracleId)
  }
  return [...keep]
}

export function typeTagsForCards(
  cards: LibraryCard[],
  typeThemeIds: string[],
  seeds: Set<string>,
): CardTheme[] {
  const rows: CardTheme[] = []
  for (const card of cards) {
    for (const id of typeThemeIds) {
      const typeName = parseTypeThemeId(id)
      if (!typeName || !cardHasCreatureType(card, typeName)) continue
      rows.push({
        oracleId: card.oracleId,
        themeId: id,
        synergy: seeds.has(card.oracleId) ? 4 : 3,
      })
    }
  }
  return rows
}

export function mapTypalTagsToTypeThemes(
  tags: CardTheme[],
  typalIdToTypeThemeId: Map<string, string>,
  cards?: Map<string, LibraryCard>,
): CardTheme[] {
  const extra: CardTheme[] = []
  for (const tag of tags) {
    const typeId = typalIdToTypeThemeId.get(tag.themeId)
    if (!typeId) continue
    const typeName = parseTypeThemeId(typeId)
    const card = cards?.get(tag.oracleId)
    if (typeName && card && !cardHasCreatureType(card, typeName)) continue
    extra.push({
      oracleId: tag.oracleId,
      themeId: typeId,
      synergy: tag.synergy,
    })
  }
  return extra
}
