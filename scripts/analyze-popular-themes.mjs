import { readFile } from 'node:fs/promises'
import path from 'node:path'

const TAG_CACHE = path.join(process.cwd(), 'scripts', '.cache', 'oracle_tags.jsonl')

const CUBES = [
  { id: 'thepaupercube', label: 'The Pauper Cube' },
  { id: 'wtwlf123', label: "wtwlf123's Cube" },
  { id: 'thepeasantcube', label: 'The Peasant Cube 2026' },
  { id: 'andymangold', label: 'Bun Magic Cube' },
  { id: 'regular', label: 'Regular Cube' },
  { id: 'neoclassical', label: 'Neoclassical Cube' },
  { id: 'mtgovintage', label: 'MTGO Vintage Cube' },
  { id: 'vintage', label: 'Traditional Powered Cube' },
]

const AS_FAN = (count, size) => (size > 0 ? (count / size) * 15 : 0)

const COLOR_OR_TYPE = /^(synergy-(white|blue|black|red|green|colorless|multicolor|creature|enchantment|artifact|land|planeswalker|legendary|historic|noncreature|plains|island|swamp|mountain|forest|basic)|hate-(attacker|regenerate)|noncreature[- ]typal)$/i

const GENERIC = /^(evasion|triggered-ability|activated-ability|mana-ability|keyword|enters|etb|leaves-the-battlefield|dies|cast-trigger|combat-damage|attack-trigger|block|draw|discard|destroy|exile|counterspell|removal|flying|trample|haste|vigilance|lifelink|deathtouch|hexproof|ward|menace|reach|flash|first-strike|double-strike|lifegain|ramp|tutor|bounce|burn|cantrip|cycle|scry|surveil|mill|graveyard-hate)$/i

function parseFile(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('[')) return JSON.parse(trimmed)
  return trimmed.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function oracleOf(raw) {
  const d = raw.details ?? raw.card ?? raw
  return d.oracle_id ?? d.oracleId ?? raw.oracle_id ?? raw.oracleId ?? null
}

function cardsFrom(json) {
  const boards = json.cards ?? json.cube?.cards
  if (Array.isArray(boards)) return boards
  if (boards?.mainboard) return boards.mainboard
  if (json.mainboard) return json.mainboard
  return []
}

function kindOf(tag, byId) {
  const slug = String(tag.slug ?? '').toLowerCase()
  const name = String(tag.label ?? tag.name ?? '').toLowerCase()
  const parents = (tag.parent_ids ?? []).map((id) => byId.get(id)).filter(Boolean)
  const parentSlugs = parents.map((p) => String(p.slug ?? '').toLowerCase())
  const hay = `${slug} ${name} ${parentSlugs.join(' ')}`

  if (GENERIC.test(slug) || GENERIC.test(name.replace(/\s+/g, '-'))) return 'generic'
  if (COLOR_OR_TYPE.test(slug) || COLOR_OR_TYPE.test(name.replace(/\s+/g, '-'))) return 'enabler'
  if (/^(synergy|typal|tribal|hate)[-_]/.test(slug) || parentSlugs.some((p) => /^(synergy|typal|tribal|hate)$/.test(p))) {
    return 'archetype'
  }
  if (/\b(token|sacrifice|reanimat|graveyard|flicker|blink|spellslinger|prowess|counters?|aristocrat|go-wide|midrange|aggro|control|combo|storm|landfall|vehicles?|energy|treasure|food|clue|blood|modify|equipment|aura|enchantress|adventurer|party|historic|convoke|cascade|delve|uneart|unearth|madness|flashback|escape|persist|undying|modular|affinity|imprint|charge|oil|incubate|amass|outlast|bolster|proliferate|poison|infect|toxic)\b/.test(hay)) {
    return 'archetype'
  }
  return 'other'
}

function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function quantile(arr, p) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return s[lo]
  return s[lo] * (hi - i) + s[hi] * (i - lo)
}

const rawTags = parseFile(await readFile(TAG_CACHE, 'utf8'))
const byId = new Map(rawTags.map((t) => [t.id, t]))
const kinds = new Map()
for (const tag of rawTags) {
  if (tag.type && tag.type !== 'oracle') continue
  kinds.set(tag.id, {
    id: tag.id,
    slug: tag.slug ?? '',
    name: tag.label ?? tag.name ?? tag.slug ?? tag.id,
    kind: kindOf(tag, byId),
  })
}

const cubes = []
for (const spec of CUBES) {
  const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${spec.id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' },
  })
  const json = await res.json()
  const list = cardsFrom(json)
  const cube = json.cube ?? json
  cubes.push({
    id: spec.id,
    name: cube.name ?? spec.label,
    size: list.length,
    oracleIds: list.map(oracleOf).filter(Boolean),
  })
  console.error(spec.id, list.length)
}

const wanted = new Set(cubes.flatMap((c) => c.oracleIds))
const tagsByOracle = { all: new Map(), archetype: new Map() }
for (const tag of rawTags) {
  if (tag.type && tag.type !== 'oracle') continue
  const meta = kinds.get(tag.id)
  if (!meta) continue
  for (const tagging of tag.taggings ?? []) {
    const oracleId = tagging.oracle_id
    if (!oracleId || !wanted.has(oracleId)) continue
    const all = tagsByOracle.all.get(oracleId) ?? []
    all.push(tag.id)
    tagsByOracle.all.set(oracleId, all)
    if (meta.kind === 'archetype') {
      const list = tagsByOracle.archetype.get(oracleId) ?? []
      list.push(tag.id)
      tagsByOracle.archetype.set(oracleId, list)
    }
  }
}

function analyze(oracleIds, size, map) {
  const counts = new Map()
  let tagged = 0
  for (const id of oracleIds) {
    const tags = map.get(id) ?? []
    if (tags.length) tagged += 1
    for (const tagId of tags) counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
  }
  const rows = [...counts.entries()]
    .map(([id, count]) => ({
      ...(kinds.get(id) ?? { id, name: id, slug: id, kind: 'other' }),
      count,
      asFan: AS_FAN(count, size),
    }))
    .sort((a, b) => b.count - a.count)

  const supported = rows.filter((r) => r.asFan >= 1)
  const dominant = rows.filter((r) => r.asFan >= 1.5)
  const playable = rows.filter((r) => r.asFan >= 0.75)
  const topN = rows.slice(0, 8)
  const topIds = new Set(topN.map((r) => r.id))

  let inTheme = 0
  let bridged = 0
  const pairs = new Map()
  for (const id of oracleIds) {
    const hits = [...new Set((map.get(id) ?? []).filter((t) => topIds.has(t)))]
    if (!hits.length) continue
    inTheme += 1
    if (hits.length >= 2) bridged += 1
    hits.sort()
    for (let i = 0; i < hits.length; i += 1) {
      for (let j = i + 1; j < hits.length; j += 1) {
        const key = `${hits[i]}|${hits[j]}`
        pairs.set(key, (pairs.get(key) ?? 0) + 1)
      }
    }
  }
  const connected = [...pairs.values()].filter((n) => n >= 4).length
  return {
    taggedShare: size ? tagged / size : 0,
    uniqueTags: rows.length,
    playable: playable.length,
    supported: supported.length,
    dominant: dominant.length,
    eighthAsFan: rows[7]?.asFan ?? 0,
    topAsFan: rows[0]?.asFan ?? 0,
    top8Median: median(topN.map((r) => r.asFan)),
    coverage: size ? inTheme / size : 0,
    bridgeShare: inTheme ? bridged / inTheme : 0,
    connectedPairs: connected,
    top: topN.map((r) => `${r.name} ${r.asFan.toFixed(2)}`),
  }
}

const reports = cubes.map((cube) => ({
  id: cube.id,
  name: cube.name,
  size: cube.size,
  all: analyze(cube.oracleIds, cube.size, tagsByOracle.all),
  archetype: analyze(cube.oracleIds, cube.size, tagsByOracle.archetype),
}))

function band(rows, pathKeys) {
  const nums = rows.map((row) => pathKeys.reduce((acc, key) => acc[key], row))
  return {
    min: Math.min(...nums),
    p25: quantile(nums, 0.25),
    median: quantile(nums, 0.5),
    p75: quantile(nums, 0.75),
    max: Math.max(...nums),
  }
}

const metricKeys = [
  'taggedShare',
  'uniqueTags',
  'playable',
  'supported',
  'dominant',
  'eighthAsFan',
  'topAsFan',
  'top8Median',
  'coverage',
  'bridgeShare',
  'connectedPairs',
]

const bands = {
  all: Object.fromEntries(metricKeys.map((key) => [key, band(reports, ['all', key])])),
  archetype: Object.fromEntries(metricKeys.map((key) => [key, band(reports, ['archetype', key])])),
}

console.log(JSON.stringify({ bands, reports }, null, 2))
