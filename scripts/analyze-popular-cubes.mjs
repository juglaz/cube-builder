const IDS = [
  'regular',
  'neoclassical',
  'andymangold',
  'thepaupercube',
  'vintage',
  'mtgovintage',
  'wtwlf123',
  'lsvpauper',
  'thepeasantcube',
  'peasant',
  'powered',
  'titancube',
  'titan',
  'alphafrog',
  'samblack',
  'lprsrp',
  'desolation',
  'mixed',
  'thecube',
  'lsv',
]

async function fetchCube(id) {
  const url = `https://cubecobra.com/cube/api/cubeJSON/${id}`
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' } })
  if (!res.ok) return { id, status: res.status }
  const json = await res.json()
  return { id, status: 200, json }
}

function cardsFrom(json) {
  const boards = json.cards ?? json.cube?.cards
  if (Array.isArray(boards)) return boards
  if (boards?.mainboard) return boards.mainboard
  if (json.mainboard) return json.mainboard
  return []
}

function stats(name, following, cards) {
  const n = cards.length
  if (!n) return { name, n, following }
  let lands = 0, creatures = 0, gold = 0, goldNonland = 0, gold3 = 0, hybrid = 0, colorless = 0
  const mono = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  const curve = { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 }
  const types = { Instant: 0, Sorcery: 0, Enchantment: 0, Artifact: 0, Planeswalker: 0 }
  for (const raw of cards) {
    const d = raw.details ?? raw.card ?? raw
    const type = String(d.type ?? d.type_line ?? '')
    const identity = d.color_identity ?? d.colorIdentity ?? []
    const colors = d.colors ?? []
    const cmc = Number(d.cmc ?? 0)
    const cost = String(d.parsed_cost ?? d.mana_cost ?? d.manaCost ?? '')
    const isLand = /\bLand\b/i.test(type)
    const isCreature = /\bCreature\b/i.test(type)
    if (isLand) lands += 1
    if (isCreature) creatures += 1
    if (identity.length === 0) colorless += 1
    else if (identity.length === 1) mono[identity[0]] = (mono[identity[0]] ?? 0) + 1
    else {
      gold += 1
      if (!isLand) goldNonland += 1
      if (identity.length >= 3) gold3 += 1
    }
    if (/[WUBRG]\/[WUBRG]/i.test(cost) || /\{[WUBRG]\/[WUBRG]\}/.test(cost)) hybrid += 1
    const bucket = cmc <= 1 ? '0-1' : cmc <= 5 ? String(Math.floor(cmc)) : '6+'
    curve[bucket] += 1
    for (const t of Object.keys(types)) {
      if (new RegExp(`\\b${t}\\b`, 'i').test(type)) types[t] += 1
    }
  }
  const pct = (x) => Math.round((1000 * x) / n) / 10
  return {
    name,
    following,
    n,
    lands: pct(lands),
    creatures: pct(creatures),
    gold: pct(gold),
    goldNonland: pct(goldNonland),
    gold3: pct(gold3),
    hybrid: pct(hybrid),
    colorless: pct(colorless),
    mono: Object.fromEntries(Object.entries(mono).map(([k, v]) => [k, pct(v)])),
    curve: Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, pct(v)])),
    types: Object.fromEntries(Object.entries(types).map(([k, v]) => [k, pct(v)])),
  }
}

const out = []
for (const id of IDS) {
  try {
    const { status, json } = await fetchCube(id)
    if (status !== 200) {
      out.push({ id, status })
      continue
    }
    const cube = json.cube ?? json
    const list = cardsFrom(json)
    const name = cube.name ?? json.name ?? id
    const following = cube.following ?? cube.users_following ?? cube.numDecks ?? null
    const keys = Object.keys(json)
    out.push({
      id,
      status,
      topKeys: keys.slice(0, 12),
      cardCount: list.length,
      sample: list[0] ? Object.keys(list[0]).slice(0, 12) : [],
      stats: stats(name, following, list),
    })
    console.log(id, status, name, list.length, following)
  } catch (err) {
    out.push({ id, error: String(err) })
    console.log(id, 'ERR', err)
  }
}
console.log(JSON.stringify(out, null, 2))
