import { eloBinIndex, ELO_HIST_BINS } from '../lib/elo'
import type { CobraNeighborRow } from '../types'

const PUBLIC_BASE = 'https://cubecobra-public.s3.amazonaws.com'
const PROXY_BASE = '/cobra-data'
const HOSTED_COMPACT = ['/cobra-neighbors.json.gz', '/cobra-neighbors.json']

const BUCKETS = ['top', 'creatures', 'spells', 'other'] as const
const ORACLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type NeighborBuckets = Partial<Record<(typeof BUCKETS)[number], number[]>>

type MetadataEntry = {
  synergistic?: NeighborBuckets
}

type CobraManifest = {
  lastMetadataDictUpdate?: string
  scryfallUpdatedAt?: string
}

type CompactFile = {
  updatedAt?: string
  indexToOracle: string[]
  neighbors: Record<string, number[]>
}

export type CobraNeighborCatalog = {
  indexToOracle: string[]
  rows: CobraNeighborRow[]
  updatedAt: string
}

export type CobraEloCatalog = {
  rows: Array<{ oracleId: string; elo: number }>
  histogram: number[]
  updatedAt: string
}

function rowsFromNeighborMap(neighbors: Record<string, number[]>): CobraNeighborRow[] {
  const rows: CobraNeighborRow[] = []
  for (const [oracleId, list] of Object.entries(neighbors)) {
    if (!ORACLE_ID.test(oracleId) || !list?.length) continue
    rows.push({ oracleId, neighbors: list })
  }
  return rows
}

async function decodeMaybeGzip(bytes: Uint8Array): Promise<string> {
  const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  if (!gzip) return new TextDecoder().decode(copy)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}

async function downloadCompactHosted(
  onProgress?: (message: string) => void,
): Promise<CobraNeighborCatalog | null> {
  for (const url of HOSTED_COMPACT) {
    const res = await fetch(url, { headers: { Accept: 'application/octet-stream, application/json' } })
    if (!res.ok) continue
    onProgress?.('Installing packaged Cube Cobra neighbors…')
    const text = await decodeMaybeGzip(new Uint8Array(await res.arrayBuffer()))
    const json = JSON.parse(text) as CompactFile
    if (!Array.isArray(json.indexToOracle) || !json.neighbors) continue
    const rows = rowsFromNeighborMap(json.neighbors)
    if (rows.length === 0) continue
    return {
      indexToOracle: json.indexToOracle,
      rows,
      updatedAt: json.updatedAt ?? new Date().toISOString(),
    }
  }
  return null
}

async function downloadCobraFile(
  path: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ bytes: Uint8Array; lastModified: string | null }> {
  const candidates = import.meta.env.DEV
    ? [`${PROXY_BASE}${path}`, `${PUBLIC_BASE}${path}`]
    : [`${PUBLIC_BASE}${path}`, `${PROXY_BASE}${path}`]
  let lastError = `Could not download Cube Cobra ${path}`
  for (const url of candidates) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      lastError = `Could not download ${url} (${res.status})`
      continue
    }
    const total = Number(res.headers.get('content-length') ?? 0)
    const lastModified = res.headers.get('last-modified')
    if (!res.body || !onProgress) {
      return { bytes: new Uint8Array(await res.arrayBuffer()), lastModified }
    }
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        loaded += value.byteLength
        onProgress(loaded, total)
      }
    }
    const bytes = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes, lastModified }
  }
  throw new Error(lastError)
}

function uniqueNeighborIndexes(entry: MetadataEntry | undefined): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const bucket of BUCKETS) {
    for (const index of entry?.synergistic?.[bucket] ?? []) {
      if (typeof index !== 'number' || seen.has(index)) continue
      seen.add(index)
      out.push(index)
    }
  }
  return out
}

export async function downloadCobraNeighbors(
  onProgress?: (message: string) => void,
): Promise<CobraNeighborCatalog> {
  const hosted = await downloadCompactHosted(onProgress)
  if (hosted) return hosted

  onProgress?.('Fetching Cube Cobra catalog date…')
  let updatedAt = ''
  try {
    const manifestRes = await downloadCobraFile('/cards/manifest.json')
    const manifest = JSON.parse(new TextDecoder().decode(manifestRes.bytes)) as CobraManifest
    updatedAt = manifest.lastMetadataDictUpdate ?? manifest.scryfallUpdatedAt ?? ''
  } catch {
    // Manifest is optional; metadatadict last-modified is enough.
  }

  onProgress?.('Downloading Cube Cobra index → Oracle map…')
  const indexFile = await downloadCobraFile('/cards/indexToOracle.json')
  const indexToOracle = JSON.parse(new TextDecoder().decode(indexFile.bytes)) as string[]
  if (!Array.isArray(indexToOracle) || indexToOracle.length === 0) {
    throw new Error('Cube Cobra indexToOracle.json is empty or not an array')
  }

  onProgress?.('Downloading Cube Cobra synergistic neighbors (~91 MB)…')
  const metaFile = await downloadCobraFile('/cards/metadatadict.json', (loaded, total) => {
    const mb = (loaded / 1_000_000).toFixed(0)
    const of = total ? ` / ${(total / 1_000_000).toFixed(0)}` : ''
    onProgress?.(`Downloading Cube Cobra synergistic neighbors… ${mb}${of} MB`)
  })
  if (!updatedAt && metaFile.lastModified) {
    updatedAt = new Date(metaFile.lastModified).toISOString()
  }
  if (!updatedAt) updatedAt = new Date().toISOString()

  onProgress?.('Parsing Cube Cobra neighbor lists…')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const dict = JSON.parse(new TextDecoder().decode(metaFile.bytes)) as Record<string, MetadataEntry>
  const rows: CobraNeighborRow[] = []
  for (const [oracleId, entry] of Object.entries(dict)) {
    if (!ORACLE_ID.test(oracleId)) continue
    const neighbors = uniqueNeighborIndexes(entry)
    if (neighbors.length === 0) continue
    rows.push({ oracleId, neighbors })
  }
  if (rows.length === 0) {
    throw new Error('Cube Cobra metadatadict had no synergistic neighbor lists')
  }
  return { indexToOracle, rows, updatedAt }
}

export async function downloadCobraElo(
  onProgress?: (message: string) => void,
): Promise<CobraEloCatalog> {
  onProgress?.('Downloading Cube Cobra draft Elo…')
  const file = await downloadCobraFile('/export/simpleCardDict.json', (loaded, total) => {
    const mb = (loaded / 1_000_000).toFixed(0)
    const of = total ? ` / ${(total / 1_000_000).toFixed(0)}` : ''
    onProgress?.(`Downloading Cube Cobra draft Elo… ${mb}${of} MB`)
  })
  onProgress?.('Parsing Cube Cobra Elo ratings…')
  await new Promise((resolve) => setTimeout(resolve, 0))
  const dict = JSON.parse(new TextDecoder().decode(file.bytes)) as Record<
    string,
    { elo?: number }
  >
  const histogram = Array.from({ length: ELO_HIST_BINS }, () => 0)
  const rows: Array<{ oracleId: string; elo: number }> = []
  for (const [oracleId, info] of Object.entries(dict)) {
    if (!ORACLE_ID.test(oracleId)) continue
    const elo = Number(info?.elo)
    if (!Number.isFinite(elo)) continue
    rows.push({ oracleId, elo })
    histogram[eloBinIndex(elo)] += 1
  }
  if (rows.length === 0) {
    throw new Error('Cube Cobra simpleCardDict had no Elo ratings')
  }
  const updatedAt = file.lastModified
    ? new Date(file.lastModified).toISOString()
    : new Date().toISOString()
  return { rows, histogram, updatedAt }
}
