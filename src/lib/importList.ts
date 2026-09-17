import { resolveCollection } from '../api/scryfall'
import type { LibraryCard } from '../types'
import { resolveNamesFromCatalog } from './catalogCards'
import { parseCardList, uniqueIdentifiers } from './parseList'
import { upsertCards } from './repo'

export type ResolvedPaste = {
  cards: LibraryCard[]
  unmatched: string[]
  parsedCount: number
  skippedCount: number
}

export async function resolvePastedCardList(text: string): Promise<ResolvedPaste> {
  const parsed = parseCardList(text)
  const identifiers = uniqueIdentifiers(parsed.entries)
  if (identifiers.length === 0) {
    return { cards: [], unmatched: [], parsedCount: 0, skippedCount: parsed.skipped.length }
  }
  const local = await resolveNamesFromCatalog(identifiers)
  let cards = local.cards
  let missing = local.notFound
  if (missing.length > 0) {
    const extra = await resolveCollection(missing)
    if (extra.cards.length > 0) await upsertCards(extra.cards)
    cards = [...cards, ...extra.cards]
    missing = extra.notFound
  }
  return {
    cards,
    unmatched: missing.map((row) => (row.set ? `${row.name} (${row.set})` : row.name)),
    parsedCount: parsed.entries.length,
    skippedCount: parsed.skipped.length,
  }
}
