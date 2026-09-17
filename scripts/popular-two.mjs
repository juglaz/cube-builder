import { pathToFileURL } from 'node:url'

function cardsFrom(json) {
  const boards = json.cards ?? json.cube?.cards
  if (Array.isArray(boards)) return boards
  if (boards?.mainboard) return boards.mainboard
  if (json.mainboard) return json.mainboard
  return []
}

function mix(cards) {
  const n = cards.length
  let lands = 0, creatures = 0, goldAll = 0, goldNonland = 0, gold3 = 0, cheap = 0, top = 0
  const types = { Instant: 0, Sorcery: 0, Enchantment: 0, Artifact: 0 }
  const mono = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const raw of cards) {
    const d = raw.details ?? raw.card ?? raw
    const type = String(d.type ?? d.type_line ?? raw.type_line ?? '')
    const identity = d.color_identity ?? d.colorIdentity ?? []
    const cmc = Number(d.cmc ?? raw.cmc ?? 0)
    const land = /\bLand\b/i.test(type)
    if (land) lands += 1
    if (/\bCreature\b/i.test(type)) creatures += 1
    if (identity.length === 0) {
      /* colorless */
    } else if (identity.length === 1) mono[identity[0]] = (mono[identity[0]] ?? 0) + 1
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
  const s = (x) => x / n
  const mv = ['W', 'U', 'B', 'R', 'G'].map((c) => s(mono[c] ?? 0))
  return {
    n,
    goldNonland: s(goldNonland),
    goldThree: s(gold3),
    goldAll: s(goldAll),
    lands: s(lands),
    creatures: s(creatures),
    cheapSpells: s(cheap),
    curveTop: s(top),
    instant: s(types.Instant),
    sorcery: s(types.Sorcery),
    enchantment: s(types.Enchantment),
    artifact: s(types.Artifact),
    monoSpread: Math.max(...mv) - Math.min(...mv),
  }
}

for (const id of ['thepaupercube', 'regular']) {
  const json = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${id}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'cube-builder-research' },
  }).then((r) => r.json())
  console.log(JSON.stringify({ id, name: json.name, typeSample: (json.cards?.mainboard?.[0]?.details?.type ?? json.cards?.mainboard?.[0]?.type_line), ...mix(cardsFrom(json)) }, null, 2))
}
