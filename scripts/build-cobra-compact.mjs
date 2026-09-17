import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const META = 'https://cubecobra-public.s3.amazonaws.com/cards/metadatadict.json'
const IDX = 'https://cubecobra-public.s3.amazonaws.com/cards/indexToOracle.json'
const MANIFEST = 'https://cubecobra-public.s3.amazonaws.com/cards/manifest.json'
const ORACLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKETS = ['top', 'creatures', 'spells', 'other']

async function download(url) {
  process.stdout.write(`GET ${url}\n`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function uniqueNeighbors(entry) {
  const seen = new Set()
  const out = []
  for (const bucket of BUCKETS) {
    for (const index of entry?.synergistic?.[bucket] ?? []) {
      if (typeof index !== 'number' || seen.has(index)) continue
      seen.add(index)
      out.push(index)
    }
  }
  return out
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public')
mkdirSync(outDir, { recursive: true })

let updatedAt = new Date().toISOString()
try {
  const manifest = JSON.parse((await download(MANIFEST)).toString('utf8'))
  updatedAt = manifest.lastMetadataDictUpdate ?? manifest.scryfallUpdatedAt ?? updatedAt
} catch (err) {
  process.stdout.write(`manifest skipped: ${err}\n`)
}

const indexToOracle = JSON.parse((await download(IDX)).toString('utf8'))
if (!Array.isArray(indexToOracle)) throw new Error('indexToOracle is not an array')

process.stdout.write('Parsing metadatadict…\n')
const dict = JSON.parse((await download(META)).toString('utf8'))
const neighbors = {}
for (const [oracleId, entry] of Object.entries(dict)) {
  if (!ORACLE_ID.test(oracleId)) continue
  const list = uniqueNeighbors(entry)
  if (list.length) neighbors[oracleId] = list
}

const compact = { updatedAt, indexToOracle, neighbors }
const json = Buffer.from(JSON.stringify(compact))
const gzip = gzipSync(json, { level: 9 })
writeFileSync(join(outDir, 'cobra-neighbors.json.gz'), gzip)
process.stdout.write(
  `Wrote public/cobra-neighbors.json.gz (${gzip.length} bytes gzip, ${json.length} bytes json, ${Object.keys(neighbors).length} cards)\n`,
)
