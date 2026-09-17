import { downloadCobraElo, downloadCobraNeighbors } from '../api/cubecobra'
import { db } from '../db'

export async function replaceCobraCatalog(
  indexToOracle: string[],
  rows: Array<{ oracleId: string; neighbors: number[] }>,
  updatedAt: string,
): Promise<number> {
  const neighbors: Record<string, number[]> = {}
  for (const row of rows) neighbors[row.oracleId] = row.neighbors
  await db.transaction('rw', db.cobraNeighbors, db.cobraIndex, db.meta, async () => {
    await db.cobraNeighbors.clear()
    await db.cobraIndex.clear()
    await db.cobraIndex.put({ key: 'indexToOracle', oracles: indexToOracle, neighbors })
    await db.meta.put({
      key: 'cobra_neighbors',
      updatedAt,
      syncedAt: Date.now(),
      tagCount: rows.length,
      taggingCount: indexToOracle.length,
    })
  })
  return rows.length
}

export async function replaceCobraEloCatalog(
  rows: Array<{ oracleId: string; elo: number }>,
  histogram: number[],
  updatedAt: string,
): Promise<number> {
  await db.transaction('rw', db.cobraElo, db.meta, async () => {
    await db.cobraElo.clear()
    await db.cobraElo.bulkPut(rows)
    await db.meta.put({
      key: 'cobra_elo',
      updatedAt,
      syncedAt: Date.now(),
      tagCount: rows.length,
      taggingCount: rows.length,
      histogram,
    })
  })
  return rows.length
}

export async function syncCobraCatalog(onProgress?: (message: string) => void): Promise<number> {
  const catalog = await downloadCobraNeighbors(onProgress)
  onProgress?.(`Writing ${catalog.rows.length.toLocaleString()} Cube Cobra neighbor lists…`)
  return replaceCobraCatalog(catalog.indexToOracle, catalog.rows, catalog.updatedAt)
}

export async function syncCobraEloCatalog(onProgress?: (message: string) => void): Promise<number> {
  const elo = await downloadCobraElo(onProgress)
  onProgress?.(`Writing ${elo.rows.length.toLocaleString()} Cube Cobra Elo ratings…`)
  return replaceCobraEloCatalog(elo.rows, elo.histogram, elo.updatedAt)
}

/** oracleId → ranked synergistic neighbor oracle IDs (Cube Cobra Seed Crystal order). */
export async function loadCobraNeighborMap(): Promise<Map<string, string[]>> {
  const indexRow = await db.cobraIndex.get('indexToOracle')
  if (!indexRow?.oracles.length) return new Map()
  const oracles = indexRow.oracles
  const packed = indexRow.neighbors
  const map = new Map<string, string[]>()
  const resolve = (oracleId: string, indexes: number[]) => {
    const neighbors: string[] = []
    const seen = new Set<string>()
    for (const i of indexes) {
      const id = oracles[i]
      if (!id || seen.has(id) || id === oracleId) continue
      seen.add(id)
      neighbors.push(id)
    }
    if (neighbors.length > 0) map.set(oracleId, neighbors)
  }

  if (packed && Object.keys(packed).length > 0) {
    for (const [oracleId, indexes] of Object.entries(packed)) resolve(oracleId, indexes)
    return map
  }

  const rows = await db.cobraNeighbors.toArray()
  for (const row of rows) resolve(row.oracleId, row.neighbors)
  return map
}

export type CobraOverlap = {
  /** How many seed cards list this card as a direct synergistic neighbor (or vice versa). */
  seedHits: number
  hop: 1 | 2
  bestRank: number
  seedIds: string[]
}

/**
 * Score every card in the synergistic graphs of the given seeds.
 * Hop-1 seedHits is the overlap signal: a card listed by 3 seeds is glue between those crystals.
 */
export function scoreCobraOverlaps(
  seeds: string[],
  neighborMap: Map<string, string[]>,
): Map<string, CobraOverlap> {
  const seedSet = new Set(seeds)
  const hop1 = new Map<string, { seeds: Set<string>; bestRank: number }>()

  function bumpHop1(id: string, seed: string, rank: number) {
    if (!id || id === seed || seedSet.has(id)) return
    let row = hop1.get(id)
    if (!row) {
      row = { seeds: new Set(), bestRank: rank }
      hop1.set(id, row)
    }
    row.seeds.add(seed)
    if (rank < row.bestRank) row.bestRank = rank
  }

  for (const seed of seeds) {
    const neighbors = neighborMap.get(seed) ?? []
    neighbors.forEach((id, i) => bumpHop1(id, seed, i + 1))
  }

  for (const [card, neighbors] of neighborMap) {
    if (seedSet.has(card)) continue
    neighbors.forEach((id, i) => {
      if (!seedSet.has(id)) return
      bumpHop1(card, id, i + 1)
    })
  }

  const out = new Map<string, CobraOverlap>()
  for (const [id, row] of hop1) {
    out.set(id, {
      seedHits: row.seeds.size,
      hop: 1,
      bestRank: row.bestRank,
      seedIds: [...row.seeds],
    })
  }

  const hop2Seen = new Set(out.keys())
  for (const id of hop1.keys()) {
    const midNeighbors = neighborMap.get(id) ?? []
    midNeighbors.forEach((id2, j) => {
      if (!id2 || seedSet.has(id2) || hop2Seen.has(id2)) return
      hop2Seen.add(id2)
      out.set(id2, { seedHits: 0, hop: 2, bestRank: 200 + j + 1, seedIds: [] })
    })
  }

  return out
}

/** Hop-1 Cube Cobra hits against an arbitrary locked list (not just seed crystals). */
export function scoreCobraHitsAgainst(
  lockedIds: string[],
  neighborMap: Map<string, string[]>,
): Map<string, { hits: number; bestRank: number }> {
  const locked = new Set(lockedIds)
  const hop1 = new Map<string, { seeds: Set<string>; bestRank: number }>()

  function bump(id: string, from: string, rank: number) {
    if (!id || locked.has(id)) return
    let row = hop1.get(id)
    if (!row) {
      row = { seeds: new Set(), bestRank: rank }
      hop1.set(id, row)
    }
    row.seeds.add(from)
    if (rank < row.bestRank) row.bestRank = rank
  }

  for (const seed of locked) {
    const neighbors = neighborMap.get(seed) ?? []
    neighbors.forEach((id, i) => bump(id, seed, i + 1))
  }
  for (const [card, neighbors] of neighborMap) {
    if (locked.has(card)) continue
    neighbors.forEach((id, i) => {
      if (locked.has(id)) bump(card, id, i + 1)
    })
  }

  const out = new Map<string, { hits: number; bestRank: number }>()
  for (const [id, row] of hop1) {
    out.set(id, { hits: row.seeds.size, bestRank: row.bestRank })
  }
  return out
}

export function rankByCobraOverlap(overlaps: Map<string, CobraOverlap>): string[] {
  return [...overlaps.entries()]
    .sort((a, b) => {
      const oa = a[1]
      const ob = b[1]
      if (ob.seedHits !== oa.seedHits) return ob.seedHits - oa.seedHits
      if (oa.hop !== ob.hop) return oa.hop - ob.hop
      return oa.bestRank - ob.bestRank
    })
    .map(([id]) => id)
}

export function expandCobraNeighborhood(
  seeds: string[],
  neighborMap: Map<string, string[]>,
  hops = 2,
): string[] {
  const ranked: string[] = []
  const seen = new Set<string>()
  let frontier = [...seeds]
  for (const id of seeds) {
    if (seen.has(id)) continue
    seen.add(id)
    ranked.push(id)
  }
  for (let hop = 0; hop < hops; hop += 1) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of neighborMap.get(id) ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        ranked.push(neighbor)
        next.push(neighbor)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return ranked
}
