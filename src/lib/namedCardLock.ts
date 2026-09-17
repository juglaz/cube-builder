import type { LibraryCard } from '../types'
import { isNamedCardTag } from './synergyLanes'

/** Token / marker names that appear after “named” but are not other cards. */
const GENERIC_NAMED = new Set([
  'food',
  'treasure',
  'clue',
  'blood',
  'gold',
  'junk',
  'map',
  'powerstone',
  'lander',
  'servo',
  'thopter',
  'spirit',
  'zombie',
  'soldier',
  'goblin',
  'dragon',
  'beast',
  'elephant',
  'wolf',
  'saproling',
  'construct',
  'golem',
  'horror',
  'angel',
  'demon',
  'devil',
  'elemental',
  'knight',
  'warrior',
  'wizard',
  'vampire',
  'pirate',
  'dinosaur',
  'bird',
  'cat',
  'rat',
  'insect',
  'plant',
  'ox',
  'goat',
  'faerie',
  'giant',
  'merfolk',
  'elf',
  'human',
  'wall',
  'vehicle',
  'stone',
  'shard',
  'role',
  'incubation',
  'phyrexian',
  'germ',
  'assembly-worker',
  'assembly worker',
])

const LOCK_TAGS = new Set(['conjure-named', 'tutor-creature-specific'])

export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function ownNames(card: LibraryCard): string[] {
  const raw = [card.name, ...(card.faces ?? []).map((face) => face.name)]
  const parts = raw.flatMap((name) => name.split('//').map((part) => normalizeCardName(part)))
  return [...new Set(parts.filter(Boolean))]
}

function isOwnName(own: string[], mentioned: string): boolean {
  const m = normalizeCardName(mentioned)
  if (!m) return true
  return own.some((name) => name === m || name.startsWith(`${m} `) || m.startsWith(`${name} `) || name.includes(` ${m} `))
}

function planeswalkerTypes(card: LibraryCard): string[] {
  const lines = [card.typeLine, ...(card.faces ?? []).map((face) => face.typeLine)]
  const types: string[] = []
  for (const line of lines) {
    const match = line.match(/Planeswalker\s+[—-]\s*(.+)/i)
    if (!match?.[1]) continue
    for (const part of match[1].split(/[\/,]/)) {
      const name = normalizeCardName(part)
      if (name) types.push(name)
    }
  }
  return types
}

function joinedOracle(card: LibraryCard): string {
  if (card.faces?.length) return card.faces.map((face) => face.oracleText).join('\n')
  return card.oracleText ?? ''
}

function looksGeneric(mentioned: string): boolean {
  const m = normalizeCardName(mentioned)
  if (!m) return true
  if (GENERIC_NAMED.has(m)) return true
  if (GENERIC_NAMED.has(m.replace(/s$/, ''))) return true
  return false
}

/** True if the card needs a specific other printed card to do what it is for. */
export function cardDependsOnOtherNamedCard(card: LibraryCard): boolean {
  const own = ownNames(card)
  const text = joinedOracle(card)
  if (!text) return false

  const partner = text.match(/Partner with ([^\n(]+)/i)
  if (partner?.[1] && !isOwnName(own, partner[1].replace(/\s*\(.*$/, ''))) return true

  const pwSelf = new Set(planeswalkerTypes(card))
  const pwRef = text.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?) planeswalkers?\b/g)
  for (const match of pwRef) {
    const typeName = normalizeCardName(match[1] ?? '')
    if (typeName && !pwSelf.has(typeName) && !isOwnName(own, typeName)) return true
  }

  for (const match of text.matchAll(/\bnamed ([A-Z][^.\n;:\"*]{1,70})/g)) {
    let mentioned = (match[1] ?? '').replace(/\s+\(.*$/, '').trim()
    mentioned = mentioned.replace(/\s+(from|you|and|or|onto|into|on|to|in|with|that|as|is)\b[\s\S]*$/i, '').trim()
    if (!mentioned || looksGeneric(mentioned) || isOwnName(own, mentioned)) continue
    const before = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index)
    if (/\btoken\s+$/i.test(before)) continue
    return true
  }

  return false
}

export function tagLocksToNamedCard(slug: string | undefined): boolean {
  const s = (slug ?? '').toLowerCase()
  if (!s) return false
  if (LOCK_TAGS.has(s)) return true
  return isNamedCardTag(s)
}

export function cardLockedByNamedTags(
  card: LibraryCard,
  slugs: Iterable<string>,
): boolean {
  const pwSelf = new Set(planeswalkerTypes(card))
  for (const slug of slugs) {
    const s = slug.toLowerCase()
    if (LOCK_TAGS.has(s)) return true
    const pw = s.match(/^(?:synergy|impulse)-pw-(.+)$/)
    if (pw?.[1] && pw[1] !== 'choose' && !pwSelf.has(normalizeCardName(pw[1]))) return true
  }
  return false
}
