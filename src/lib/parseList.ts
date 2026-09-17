import type { NamedIdentifier } from '../api/scryfall'

const SKIP = /^(sideboard|maybeboard|deck|commander|companion|#)/i

export type ParsedLine = NamedIdentifier & {
  raw: string
  quantity: number
}

export function parseCardList(text: string): { entries: ParsedLine[]; skipped: string[] } {
  const entries: ParsedLine[] = []
  const skipped: string[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim()
    if (!raw) continue
    if (SKIP.test(raw)) continue

    const match = raw.match(
      /^(?:(\d+)x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]+)\))?(?:\s+\d+)?$/i,
    )
    if (!match) {
      skipped.push(raw)
      continue
    }

    const name = (match[2] ?? '').trim()
    if (!name) {
      skipped.push(raw)
      continue
    }

    entries.push({
      raw,
      quantity: match[1] ? Number(match[1]) : 1,
      name,
      set: match[3],
    })
  }

  return { entries, skipped }
}

export function uniqueIdentifiers(entries: ParsedLine[]): NamedIdentifier[] {
  const seen = new Set<string>()
  const out: NamedIdentifier[] = []
  for (const entry of entries) {
    const key = `${entry.name.toLowerCase()}|${(entry.set ?? '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: entry.name, set: entry.set })
  }
  return out
}
