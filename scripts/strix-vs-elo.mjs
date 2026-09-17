import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cobra = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '.cache/simpleCardDict.json'), 'utf8'),
)

/** Community Strix labels (absolute scale, not pauper-rescaled). */
const CUBES = [
  { id: 'mtgovintage', strix: 10, name: 'MTGO Vintage Cube' },
  { id: 'vintage', strix: 10, name: 'Vintage Cube (CC)' },
  { id: 'wtwlf123', strix: 10, name: "wtwlf123's Cube" },
  { id: 'powered', strix: 10, name: 'Traditional Powered' },
  { id: 'lsv', strix: 8, name: "LSV's Cube" },
  { id: 'regular', strix: 8, name: 'Regular Cube' },
  { id: 'andymangold', strix: 8, name: 'Bun Magic (Andy)' },
  { id: 'neoclassical', strix: 6, name: 'Neoclassical Cube' },
  { id: 'thepeasantcube', strix: null, name: 'The Peasant Cube (rescale)' },
  { id: 'thepaupercube', strix: null, name: 'The Pauper Cube (rescale)' },
  { id: 'lsvpauper', strix: null, name: 'LSV Pauper' },
]

function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo)
}

function cardsFrom(json) {
  const boards = json.cards ?? json.cube?.cards
  if (Array.isArray(boards)) return boards
  if (boards?.mainboard) return boards.mainboard
  if (json.mainboard) return json.mainboard
  return []
}

function oracleId(raw) {
  const d = raw.details ?? raw.card ?? raw
  return d.oracle_id ?? d.oracleId ?? raw.oracle_id ?? raw.oracleId ?? null
}

function isLand(raw) {
  const d = raw.details ?? raw.card ?? raw
  return /\bLand\b/i.test(String(d.type ?? d.type_line ?? ''))
}

const rows = []
for (const cube of CUBES) {
  const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${cube.id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' },
  })
  if (!res.ok) {
    rows.push({ ...cube, status: res.status })
    continue
  }
  const json = await res.json()
  const cards = cardsFrom(json)
  const elos = []
  const spellElos = []
  let missing = 0
  for (const card of cards) {
    const id = oracleId(card)
    const elo = id ? cobra[id]?.elo : null
    if (!Number.isFinite(elo)) {
      missing++
      continue
    }
    elos.push(elo)
    if (!isLand(card)) spellElos.push(elo)
  }
  elos.sort((a, b) => a - b)
  spellElos.sort((a, b) => a - b)
  const name = json.name ?? json.cube?.name ?? cube.name
  rows.push({
    id: cube.id,
    name,
    strix: cube.strix,
    n: cards.length,
    matched: elos.length,
    missing,
    following: json.following ?? json.cube?.following ?? json.usersFollowing ?? null,
    median: quantile(elos, 0.5),
    p10: quantile(elos, 0.1),
    p25: quantile(elos, 0.25),
    p75: quantile(elos, 0.75),
    p90: quantile(elos, 0.9),
    mean: elos.reduce((a, b) => a + b, 0) / elos.length,
    share1600: elos.filter((e) => e >= 1600).length / elos.length,
    share1800: elos.filter((e) => e >= 1800).length / elos.length,
    spellMedian: quantile(spellElos, 0.5),
    spellP90: quantile(spellElos, 0.9),
  })
}

function fmt(n) {
  return n == null ? '—' : n.toFixed(0)
}
function pct(n) {
  return n == null ? '—' : `${(100 * n).toFixed(1)}%`
}

console.log(
  [
    'strix',
    'id',
    'n',
    'median',
    'p10',
    'p25',
    'p75',
    'p90',
    'mean',
    '>=1600',
    '>=1800',
    'spellMed',
    'spellP90',
    'name',
  ].join('\t'),
)
for (const r of rows.sort((a, b) => (b.strix ?? -1) - (a.strix ?? -1) || (b.median ?? 0) - (a.median ?? 0))) {
  if (r.status) {
    console.log(`${r.strix}\t${r.id}\tFAIL ${r.status}`)
    continue
  }
  console.log(
    [
      r.strix ?? 'n/a',
      r.id,
      r.n,
      fmt(r.median),
      fmt(r.p10),
      fmt(r.p25),
      fmt(r.p75),
      fmt(r.p90),
      fmt(r.mean),
      pct(r.share1600),
      pct(r.share1800),
      fmt(r.spellMedian),
      fmt(r.spellP90),
      r.name,
    ].join('\t'),
  )
}
