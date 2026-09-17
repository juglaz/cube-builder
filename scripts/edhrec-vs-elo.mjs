import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '.cache')

function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  let sx = 0
  let sy = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]
    const y = ys[i]
    sx += x
    sy += y
    sxx += x * x
    syy += y * y
    sxy += x * y
  }
  const cov = n * sxy - sx * sy
  const vx = n * sxx - sx * sx
  const vy = n * syy - sy * sy
  if (vx <= 0 || vy <= 0) return null
  return cov / Math.sqrt(vx * vy)
}

function rankAverage(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const ranks = new Array(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg
    i = j + 1
  }
  return ranks
}

function spearman(xs, ys) {
  return pearson(rankAverage(xs), rankAverage(ys))
}

function quantile(sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo)
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  return quantile(s, 0.5)
}

function typeBucket(type) {
  if (/\bLand\b/i.test(type)) return 'Land'
  if (/\bCreature\b/i.test(type)) return 'Creature'
  if (/\bInstant\b/i.test(type)) return 'Instant'
  if (/\bSorcery\b/i.test(type)) return 'Sorcery'
  if (/\bPlaneswalker\b/i.test(type)) return 'Planeswalker'
  if (/\bEnchantment\b/i.test(type)) return 'Enchantment'
  if (/\bArtifact\b/i.test(type)) return 'Artifact'
  return 'Other'
}

function cmcBucket(cmc) {
  if (cmc <= 1) return '0-1'
  if (cmc <= 2) return '2'
  if (cmc <= 3) return '3'
  if (cmc <= 4) return '4'
  if (cmc <= 5) return '5'
  return '6+'
}

function skipType(type) {
  return /\b(Token|Card|Scheme|Plane|Phenomenon|Conspiracy|Dungeon|Emblem|Vanguard)\b/i.test(type)
}

const cobra = JSON.parse(await readFile(join(root, 'simpleCardDict.json'), 'utf8'))

const edhrec = new Map()
const names = new Map()
const layouts = new Map()
const rl = createInterface({
  input: createReadStream(join(root, 'oracle-cards.jsonl.gz')).pipe(createGunzip()),
  crlfDelay: Infinity,
})
for await (const line of rl) {
  if (!line) continue
  const card = JSON.parse(line)
  if (!card.oracle_id) continue
  names.set(card.oracle_id, card.name)
  layouts.set(card.oracle_id, card.layout)
  if (typeof card.edhrec_rank === 'number') edhrec.set(card.oracle_id, card.edhrec_rank)
}

const rows = []
let cobraCards = 0
let missingRank = 0
for (const [oracleId, info] of Object.entries(cobra)) {
  if (!/^[0-9a-f-]{36}$/i.test(oracleId)) continue
  cobraCards++
  const type = String(info.type ?? '')
  if (skipType(type)) continue
  const elo = Number(info.elo)
  const rank = edhrec.get(oracleId)
  if (!Number.isFinite(elo) || rank == null) {
    if (Number.isFinite(elo) && rank == null) missingRank++
    continue
  }
  rows.push({
    oracleId,
    name: info.name || names.get(oracleId) || oracleId,
    type,
    typeBucket: typeBucket(type),
    cmc: Number(info.cmc) || 0,
    elo,
    rank,
    logRank: Math.log10(rank),
  })
}

const xsElo = rows.map((r) => r.elo)
const ysRank = rows.map((r) => r.rank)
const ysLog = rows.map((r) => r.logRank)

function sliceStats(list) {
  const elo = list.map((r) => r.elo)
  const rank = list.map((r) => r.rank)
  const logRank = list.map((r) => r.logRank)
  return {
    n: list.length,
    pearsonEloVsNegLogRank: pearson(elo, logRank.map((x) => -x)),
    spearmanEloVsRank: spearman(elo, rank),
    medianElo: median(elo),
    medianRank: median(rank),
  }
}

const byType = {}
for (const row of rows) {
  ;(byType[row.typeBucket] ??= []).push(row)
}
const byCmc = {}
for (const row of rows) {
  ;(byCmc[cmcBucket(row.cmc)] ??= []).push(row)
}

const rankSorted = [...rows].sort((a, b) => a.rank - b.rank)
const quintileSize = Math.floor(rankSorted.length / 5)
const quintiles = []
for (let q = 0; q < 5; q++) {
  const start = q * quintileSize
  const end = q === 4 ? rankSorted.length : start + quintileSize
  const slice = rankSorted.slice(start, end)
  quintiles.push({
    label: `Q${q + 1}`,
    meaning:
      q === 0
        ? 'Most played on EDHREC'
        : q === 4
          ? 'Least played on EDHREC'
          : `EDHREC rank band ${q + 1}`,
    n: slice.length,
    rankLo: slice[0].rank,
    rankHi: slice[slice.length - 1].rank,
    meanElo: mean(slice.map((r) => r.elo)),
    medianElo: median(slice.map((r) => r.elo)),
  })
}

const z = (value, mu, sd) => (sd > 0 ? (value - mu) / sd : 0)
const eloMu = mean(xsElo)
const eloSd = Math.sqrt(mean(xsElo.map((x) => (x - eloMu) ** 2)))
const logMu = mean(ysLog)
const logSd = Math.sqrt(mean(ysLog.map((x) => (x - logMu) ** 2)))

const scored = rows.map((r) => ({
  ...r,
  cubeMinusEdh: z(r.elo, eloMu, eloSd) - z(-r.logRank, -logMu, logSd),
}))

const cubeNotEdh = [...scored].sort((a, b) => b.cubeMinusEdh - a.cubeMinusEdh).slice(0, 20)
const edhNotCube = [...scored].sort((a, b) => a.cubeMinusEdh - b.cubeMinusEdh).slice(0, 20)

const topElo = [...rows].sort((a, b) => b.elo - a.elo).slice(0, 15)
const topEdh = [...rows].sort((a, b) => a.rank - b.rank).slice(0, 15)

const rankedElo = [...rows].sort((a, b) => b.elo - a.elo)
function overlapAt(k) {
  const a = new Set(rankedElo.slice(0, k).map((r) => r.oracleId))
  const b = new Set([...rows].sort((x, y) => x.rank - y.rank).slice(0, k).map((r) => r.oracleId))
  let n = 0
  for (const id of a) if (b.has(id)) n++
  return { k, overlap: n, pct: n / k }
}

function typeStats() {
  const out = {}
  for (const [key, list] of Object.entries(byType)) out[key] = sliceStats(list)
  return out
}
function cmcStats() {
  const out = {}
  for (const key of ['0-1', '2', '3', '4', '5', '6+']) {
    if (byCmc[key]) out[key] = sliceStats(byCmc[key])
  }
  return out
}

const report = {
  generatedAt: new Date().toISOString(),
  sources: {
    cobra: 'Cube Cobra export/simpleCardDict.json (draft Elo)',
    scryfall: 'oracle-cards-20260915210151.jsonl.gz (edhrec_rank)',
  },
  nCobraOracleCards: cobraCards,
  nWithBothScores: rows.length,
  nCobraMissingEdhrecRank: missingRank,
  overall: sliceStats(rows),
  interpretation: {
    spearmanNote:
      'Spearman of Elo vs EDHREC rank: negative means more-played Commander cards also get picked higher in cube. |r| < 0.3 weak, 0.3–0.5 moderate, >0.5 strong.',
    pearsonNote:
      'Pearson uses -log10(edhrec_rank) so both axes point “stronger is higher.”',
  },
  byType: typeStats(),
  byCmc: cmcStats(),
  quintilesByEdhrecRank: quintiles,
  topKOverlap: [50, 100, 250, 500, 1000].map(overlapAt),
  topCubeElo: topElo.map((r) => ({ name: r.name, elo: +r.elo.toFixed(1), rank: r.rank, type: r.typeBucket })),
  topEdhrec: topEdh.map((r) => ({ name: r.name, elo: +r.elo.toFixed(1), rank: r.rank, type: r.typeBucket })),
  cubeStrongEdhWeak: cubeNotEdh.map((r) => ({
    name: r.name,
    elo: +r.elo.toFixed(1),
    rank: r.rank,
    type: r.typeBucket,
  })),
  edhStrongCubeWeak: edhNotCube.map((r) => ({
    name: r.name,
    elo: +r.elo.toFixed(1),
    rank: r.rank,
    type: r.typeBucket,
  })),
}

await writeFile(join(root, 'edhrec-vs-elo.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
