import type { CardFace, LibraryCard } from '../types'

const BASE = 'https://api.scryfall.com'
const BATCH = 75

type ScryfallFace = {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  image_uris?: { normal?: string; large?: string }
}

type ScryfallCard = {
  id: string
  oracle_id?: string
  name: string
  cmc?: number
  type_line?: string
  colors?: string[]
  color_identity?: string[]
  mana_cost?: string
  oracle_text?: string
  power?: string
  toughness?: string
  keywords?: string[]
  image_uris?: { normal?: string; large?: string }
  layout?: string
  card_faces?: ScryfallFace[]
}

type CollectionResponse = {
  data: ScryfallCard[]
  not_found: Array<{ name?: string; set?: string }>
}

export type NamedIdentifier = {
  name: string
  set?: string
}

async function scryfallFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  return res
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function firstImage(card: ScryfallCard, size: 'normal' | 'large'): string {
  const fromCard = card.image_uris?.[size]
  if (fromCard) return fromCard
  const fromFace = card.card_faces?.find((face) => face.image_uris?.[size])?.image_uris?.[size]
  return fromFace ?? ''
}

export function normalizeScryfallCard(card: ScryfallCard): LibraryCard | null {
  const oracleId = card.oracle_id
  if (!oracleId) return null

  const faces: CardFace[] | undefined = card.card_faces?.map((face) => ({
    name: face.name ?? card.name,
    manaCost: face.mana_cost ?? '',
    typeLine: face.type_line ?? '',
    oracleText: face.oracle_text ?? '',
    imageNormal: face.image_uris?.normal,
    imageLarge: face.image_uris?.large,
  }))

  return {
    oracleId,
    scryfallId: card.id,
    name: card.name,
    cmc: card.cmc ?? 0,
    typeLine: card.type_line ?? faces?.map((f) => f.typeLine).join(' // ') ?? '',
    colors: card.colors ?? [],
    colorIdentity: card.color_identity ?? [],
    manaCost: card.mana_cost ?? faces?.map((f) => f.manaCost).filter(Boolean).join(' // ') ?? '',
    oracleText: card.oracle_text ?? faces?.map((f) => f.oracleText).join('\n//\n') ?? '',
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    keywords: card.keywords ?? [],
    imageNormal: firstImage(card, 'normal'),
    imageLarge: firstImage(card, 'large'),
    layout: card.layout ?? 'normal',
    faces,
  }
}

export async function searchCards(query: string): Promise<LibraryCard[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `${BASE}/cards/search?q=${encodeURIComponent(q)}&unique=cards`
  const res = await scryfallFetch(url)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Scryfall search failed (${res.status})`)
  const json = (await res.json()) as { data?: ScryfallCard[] }
  return (json.data ?? []).map(normalizeScryfallCard).filter((c): c is LibraryCard => c !== null)
}

export async function namedCard(name: string, fuzzy = true): Promise<LibraryCard | null> {
  const param = fuzzy ? 'fuzzy' : 'exact'
  const url = `${BASE}/cards/named?${param}=${encodeURIComponent(name)}`
  const res = await scryfallFetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Scryfall named lookup failed (${res.status})`)
  return normalizeScryfallCard((await res.json()) as ScryfallCard)
}

export async function resolveOracleIds(
  oracleIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<LibraryCard[]> {
  const unique = [...new Set(oracleIds.filter(Boolean))]
  const cards: LibraryCard[] = []

  for (let i = 0; i < unique.length; i += BATCH) {
    if (i > 0) await sleep(80)
    const chunk = unique.slice(i, i + BATCH)
    const res = await scryfallFetch(`${BASE}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifiers: chunk.map((oracle_id) => ({ oracle_id })),
      }),
    })
    if (!res.ok) throw new Error(`Scryfall collection failed (${res.status})`)
    const json = (await res.json()) as CollectionResponse
    for (const raw of json.data) {
      const card = normalizeScryfallCard(raw)
      if (card) cards.push(card)
    }
    onProgress?.(Math.min(i + BATCH, unique.length), unique.length)
  }

  const byOracle = new Map<string, LibraryCard>()
  for (const card of cards) byOracle.set(card.oracleId, card)
  return [...byOracle.values()]
}

export async function searchAllCards(query: string): Promise<LibraryCard[]> {
  const cards: LibraryCard[] = []
  let url: string | null =
    `${BASE}/cards/search?q=${encodeURIComponent(query)}&unique=cards`
  while (url) {
    const res = await scryfallFetch(url)
    if (res.status === 404) break
    if (!res.ok) throw new Error(`Scryfall search failed (${res.status})`)
    const json = (await res.json()) as { data?: ScryfallCard[]; has_more?: boolean; next_page?: string }
    for (const raw of json.data ?? []) {
      const card = normalizeScryfallCard(raw)
      if (card) cards.push(card)
    }
    url = json.has_more && json.next_page ? json.next_page : null
    if (url) await sleep(80)
  }
  return cards
}

export async function resolveCollection(identifiers: NamedIdentifier[]): Promise<{
  cards: LibraryCard[]
  notFound: NamedIdentifier[]
}> {
  const cards: LibraryCard[] = []
  const notFound: NamedIdentifier[] = []

  for (let i = 0; i < identifiers.length; i += BATCH) {
    if (i > 0) await sleep(80)
    const chunk = identifiers.slice(i, i + BATCH)
    const res = await scryfallFetch(`${BASE}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifiers: chunk.map((id) =>
          id.set ? { name: id.name, set: id.set.toLowerCase() } : { name: id.name },
        ),
      }),
    })
    if (!res.ok) throw new Error(`Scryfall collection failed (${res.status})`)
    const json = (await res.json()) as CollectionResponse
    for (const raw of json.data) {
      const card = normalizeScryfallCard(raw)
      if (card) cards.push(card)
    }
    for (const missing of json.not_found) {
      if (missing.name) notFound.push({ name: missing.name, set: missing.set })
    }
  }

  const stillMissing: NamedIdentifier[] = []
  for (const miss of notFound) {
    await sleep(60)
    const fuzzy = await namedCard(miss.name, true)
    if (fuzzy) cards.push(fuzzy)
    else stillMissing.push(miss)
  }

  const unique = new Map<string, LibraryCard>()
  for (const card of cards) unique.set(card.oracleId, card)

  return { cards: [...unique.values()], notFound: stillMissing }
}

export type BulkDataItem = {
  type: string
  name: string
  updated_at: string
  download_uri?: string
  jsonl_download_uri?: string
}

export type ScryfallTag = {
  id: string
  slug: string
  label: string
  description?: string | null
  type: string
  parent_ids?: string[] | null
  child_ids?: string[] | null
  aliases?: string[] | null
  taggings: Array<{
    oracle_id?: string | null
    weight?: string
  }>
}

export async function fetchBulkData(): Promise<BulkDataItem[]> {
  const res = await scryfallFetch(`${BASE}/bulk-data`)
  if (!res.ok) throw new Error(`Scryfall bulk-data failed (${res.status})`)
  const json = (await res.json()) as { data: BulkDataItem[] }
  return json.data
}

export async function fetchBulkItem(type: string): Promise<BulkDataItem> {
  const res = await scryfallFetch(`${BASE}/bulk-data/${type}`)
  if (!res.ok) throw new Error(`Scryfall bulk-data/${type} failed (${res.status})`)
  return (await res.json()) as BulkDataItem
}

function proxyBulkUrl(url: string): string {
  const parsed = new URL(url)
  return `/scryfall-data${parsed.pathname}`
}

async function downloadBytes(url: string): Promise<Response> {
  const candidates = import.meta.env.DEV ? [proxyBulkUrl(url), url] : [url, proxyBulkUrl(url)]
  let lastError = `Could not download ${url}`
  for (const candidate of candidates) {
    const res = await fetch(candidate, { headers: { Accept: 'application/octet-stream' } })
    if (res.ok) return res
    lastError = `Could not download ${candidate} (${res.status})`
  }
  throw new Error(lastError)
}

async function readMaybeGzip(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  if (!gzip) return new TextDecoder().decode(bytes)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

function parseJsonOrJsonl<T>(text: string): T[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as T[]
  const rows: T[] = []
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue
    rows.push(JSON.parse(line) as T)
  }
  return rows
}

function parseTagFile(text: string): ScryfallTag[] {
  return parseJsonOrJsonl<ScryfallTag>(text)
}

export async function downloadOracleTags(): Promise<{ tags: ScryfallTag[]; updatedAt: string }> {
  const item = await fetchBulkItem('oracle_tags')
  const url = item.jsonl_download_uri ?? item.download_uri
  if (!url) throw new Error('Scryfall oracle_tags has no download URI')
  const res = await downloadBytes(url)
  const text = await readMaybeGzip(res)
  return { tags: parseTagFile(text), updatedAt: item.updated_at }
}

/** One unique card per Oracle ID (names, types, mana, image URLs — not printings). */
export async function downloadOracleCards(): Promise<{ cards: LibraryCard[]; updatedAt: string }> {
  const item = await fetchBulkItem('oracle_cards')
  const url = item.jsonl_download_uri ?? item.download_uri
  if (!url) throw new Error('Scryfall oracle_cards has no download URI')
  const res = await downloadBytes(url)
  const text = await readMaybeGzip(res)
  const cards = parseJsonOrJsonl<ScryfallCard>(text)
    .map(normalizeScryfallCard)
    .filter((c): c is LibraryCard => c !== null)
  return { cards, updatedAt: item.updated_at }
}
