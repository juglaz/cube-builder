const CUBES = [
  'thepaupercube',
  'wtwlf123',
  'thepeasantcube',
  'andymangold',
  'regular',
  'neoclassical',
  'mtgovintage',
  'vintage',
]

function cardsFrom(json) {
  const boards = json.cards ?? json.cube?.cards
  if (Array.isArray(boards)) return boards
  if (boards?.mainboard) return boards.mainboard
  if (json.mainboard) return json.mainboard
  return []
}

function mix(cards) {
  const n = cards.length
  let lands = 0, creatures = 0, goldAll = 0, goldNonland = 0, gold3 = 0, colorless = 0, cheap = 0
  const mono = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  const types = { Instant: 0, Sorcery: 0, Enchantment: 0, Artifact: 0 }
  let top = 0
  for (const raw of cards) {
    const d = raw.details ?? raw.card ?? raw
    const type = String(d.type ?? d.type_line ?? '')
    const identity = d.color_identity ?? d.colorIdentity ?? []
    const cmc = Number(d.cmc ?? 0)
    const land = /\bLand\b/i.test(type)
    if (land) lands += 1
    if (/\bCreature\b/i.test(type)) creatures += 1
    if (identity.length === 0) colorless += 1
    else if (identity.length === 1) mono[identity[0]] = (mono[identity[0]] ?? 0) + 1
    else {
      goldAll += 1
      if (!land) goldNonland += 1
      if (!land && identity.length >= 3) gold3 += 1
    }
    if (!land && cmc <= 2) cheap += 1
    if (cmc >= 6) top += 1
    for (const t of Object.keys(types)) {
      if (new RegExp(`\\b${t}\\b`, 'i').test(type)) types[t] += 1
    }
  }
  const share = (x) => x / n
  const monoVals = ['W', 'U', 'B', 'R', 'G'].map((c) => share(mono[c] ?? 0))
  return {
    n,
    goldNonland: share(goldNonland),
    goldThree: share(gold3),
    goldAll: share(goldAll),
    lands: share(lands),
    creatures: share(creatures),
    colorless: share(colorless),
    cheapSpells: share(cheap),
    curveTop: share(top),
    instant: share(types.Instant),
    sorcery: share(types.Sorcery),
    enchantment: share(types.Enchantment),
    artifact: share(types.Artifact),
    monoSpread: Math.max(...monoVals) - Math.min(...monoVals),
    mono: Object.fromEntries(Object.entries(mono).map(([k, v]) => [k, share(v)])),
  }
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const rows = []
for (const id of CUBES) {
  const json = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' },
  }).then((r) => r.json())
  const list = cardsFrom(json)
  const name = (json.cube ?? json).name ?? id
  const stats = mix(list)
  rows.push({ id, name, ...stats })
  console.error(id, name, list.length)
}

const keys = [
  'goldNonland',
  'goldThree',
  'goldAll',
  'lands',
  'creatures',
  'colorless',
  'cheapSpells',
  'curveTop',
  'instant',
  'sorcery',
  'enchantment',
  'artifact',
  'monoSpread',
]
const bands = Object.fromEntries(
  keys.map((key) => {
    const vals = rows.map((r) => r[key])
    return [key, { min: Math.min(...vals), median: median(vals), max: Math.max(...vals) }]
  }),
)
console.log(JSON.stringify({ bands, rows: rows.map((r) => ({ id: r.id, name: r.name, n: r.n, goldNonland: r.goldNonland, goldThree: r.goldThree, lands: r.lands, creatures: r.creatures, cheapSpells: r.cheapSpells, curveTop: r.curveTop, instant: r.instant, sorcery: r.sorcery, monoSpread: r.monoSpread })) }, null, 2))
