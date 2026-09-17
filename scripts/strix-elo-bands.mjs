import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cache = join(dirname(fileURLToPath(import.meta.url)), '.cache')
const cobra = JSON.parse(await readFile(join(cache, 'simpleCardDict.json'), 'utf8'))

/** Absolute Strix (not rarity-rescaled). Labels are curator/community, not a fit. */
const CUBES = [
  { id: 'mtgovintage', strix: 10 },
  { id: 'vintage', strix: 10 },
  { id: 'wtwlf123', strix: 10 },
  { id: 'titancube', strix: 9 },
  { id: 'titan', strix: 9 },
  { id: 'drruler', strix: 8 },
  { id: 'andymangold', strix: 8 },
  { id: 'm6p', strix: 8 },
  { id: 'chirdaki', strix: 8 },
  { id: 'steveman', strix: 8 },
  { id: 'fleish', strix: 8 },
  { id: 'samblack', strix: 7 },
  { id: 'alphafrog', strix: 7 },
  { id: 'eleusis', strix: 7 },
  { id: 'neoclassical', strix: 6 },
  { id: '63330c7e5526132b2a290e9e', strix: 6 },
  { id: 'moderncube', strix: 6 },
  { id: 'regular', strix: 5 },
  { id: 'legendarycube', strix: 5 },
  { id: '61b81543e63718103684d457', strix: 5 },
  { id: 'theboardgamecube', strix: 4 },
  { id: 'standardcube', strix: 4 },
  { id: 'frontier', strix: 4 },
  { id: 'innistradcube', strix: 2 },
  { id: 'InnistradPlanarCube', strix: 2 },
  { id: 'desolation', strix: 8 },
  { id: 'mixed', strix: 8 },
  { id: 'thecube', strix: 8 },
  { id: 'lprsrp', strix: 6 },
]

function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo)
}

function flattenCards(json) {
  const candidates = [
    json.cards,
    json.cube?.cards,
    json.mainboard,
    json.cards?.mainboard,
    json.cube?.cards?.mainboard,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const vals = Object.values(c)
      if (vals.length && (vals[0]?.oracle_id || vals[0]?.details || vals[0]?.cardID)) return vals
    }
  }
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

function summarize(elos) {
  const s = [...elos].sort((a, b) => a - b)
  return {
    n: s.length,
    p10: quantile(s, 0.1),
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    share1600: s.filter((e) => e >= 1600).length / s.length,
    share1800: s.filter((e) => e >= 1800).length / s.length,
    iqr: quantile(s, 0.75) - quantile(s, 0.25),
  }
}

const cubes = []
for (const spec of CUBES) {
  const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${spec.id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' },
  })
  if (!res.ok) {
    cubes.push({ id: spec.id, strix: spec.strix, error: res.status })
    continue
  }
  const json = await res.json()
  const cards = flattenCards(json)
  const elos = []
  const spellElos = []
  for (const card of cards) {
    const id = oracleId(card)
    const elo = id ? cobra[id]?.elo : null
    if (!Number.isFinite(elo)) continue
    elos.push(elo)
    if (!isLand(card)) spellElos.push(elo)
  }
  cubes.push({
    id: spec.id,
    strix: spec.strix,
    name: json.name ?? json.cube?.name ?? spec.id,
    size: cards.length,
    matched: elos.length,
    all: elos.length ? summarize(elos) : null,
    spells: spellElos.length ? summarize(spellElos) : null,
  })
}

function band(values) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!s.length) return null
  return { min: s[0], max: s[s.length - 1], median: quantile(s, 0.5) }
}

const byStrix = {}
for (const cube of cubes) {
  if (!cube.all || cube.strix == null) continue
  ;(byStrix[cube.strix] ??= []).push(cube)
}

const bands = {}
for (const [strix, list] of Object.entries(byStrix)) {
  const pick = (fn) => list.map(fn)
  bands[strix] = {
    nCubes: list.length,
    cubes: list.map((c) => c.name),
    median: band(pick((c) => c.all.median)),
    p10: band(pick((c) => c.all.p10)),
    p90: band(pick((c) => c.all.p90)),
    iqr: band(pick((c) => c.all.iqr)),
    share1600: band(pick((c) => c.all.share1600)),
    share1800: band(pick((c) => c.all.share1800)),
    spellMedian: band(pick((c) => c.spells?.median)),
  }
}

const report = { generatedAt: new Date().toISOString(), cubes, bands }
await writeFile(join(cache, 'strix-elo-bands.json'), JSON.stringify(report, null, 2))

const r = (n, d = 0) => (n == null ? '—' : n.toFixed(d))
const pct = (n) => (n == null ? '—' : `${(100 * n).toFixed(1)}%`)

console.log('=== CUBES ===')
for (const c of [...cubes].sort((a, b) => (b.strix ?? 0) - (a.strix ?? 0))) {
  if (c.error) {
    console.log(`${c.strix}\t${c.id}\tERR ${c.error}`)
    continue
  }
  if (!c.all) {
    console.log(`${c.strix}\t${c.id}\t${c.name}\tn=${c.size} no elo`)
    continue
  }
  console.log(
    [
      c.strix,
      c.id,
      c.size,
      r(c.all.p10),
      r(c.all.p25),
      r(c.all.median),
      r(c.all.p75),
      r(c.all.p90),
      r(c.all.iqr),
      pct(c.all.share1600),
      pct(c.all.share1800),
      c.name,
    ].join('\t'),
  )
}

console.log('\n=== BANDS (min–max of cubes at that Strix) ===')
for (const strix of Object.keys(bands).sort((a, b) => Number(b) - Number(a))) {
  const b = bands[strix]
  console.log(
    `Strix ${strix} (${b.nCubes}): median ${r(b.median.min)}–${r(b.median.max)} | p10 ${r(b.p10.min)}–${r(b.p10.max)} | p90 ${r(b.p90.min)}–${r(b.p90.max)} | IQR ${r(b.iqr.min)}–${r(b.iqr.max)} | ≥1600 ${pct(b.share1600.min)}–${pct(b.share1600.max)} | ≥1800 ${pct(b.share1800.min)}–${pct(b.share1800.max)}`,
  )
  console.log(`  ${b.cubes.join('; ')}`)
}
