import { BALANCE_BENCHMARKS } from './balance'
import { TYPE_FLOOR_ORDER } from './coverage'
import {
  COLORS,
  CREATURE_SHARE,
  CURVE_SHARE,
  colorMin,
  glueScore,
  highEloWant,
  identityColors,
  themeCap,
  type Color,
  type GenerationContext,
  type GenMeta as Meta,
  type Targets,
} from './generationShared'
import { densestIds, DOMINANT_AS_FAN, overlapFromTagLists, PLAYABLE_AS_FAN, STRUCTURE_TOP_N } from './themeStructure'
import type { LibraryCard } from '../types'

export type { GenerateReport } from './generationShared'
export { themeMinimum } from './generationShared'

function deficitColors(counts: Counts, target: number, slack = 1): Color[] {
  return COLORS.filter((color) => (counts.color[color] ?? 0) < target - slack)
}

function surplusColors(counts: Counts, target: number, slack = 1): Color[] {
  return COLORS.filter((color) => (counts.color[color] ?? 0) > target + slack)
}

function helpsColors(card: LibraryCard, colors: Color[]): boolean {
  if (colors.length === 0) return false
  return identityColors(card).some((color) => colors.includes(color))
}

function mainlySurplus(card: LibraryCard, surplus: Color[], deficit: Color[]): boolean {
  const colors = identityColors(card)
  if (colors.length === 0) return false
  if (colors.some((color) => deficit.includes(color))) return false
  return colors.some((color) => surplus.includes(color))
}

/** Lower is better: prefer cards whose identity sits below the current mean. */
function colorFillScore(card: LibraryCard, counts: Counts): number {
  const colors = identityColors(card)
  if (colors.length === 0) return 0.15
  const mean = COLORS.reduce((sum, color) => sum + (counts.color[color] ?? 0), 0) / COLORS.length
  return colors.reduce((sum, color) => sum + ((counts.color[color] ?? 0) - mean), 0) / colors.length
}

function compareColorThen(
  counts: Counts,
  compare: (a: LibraryCard, b: LibraryCard) => number,
): (a: LibraryCard, b: LibraryCard) => number {
  return (a, b) => {
    const diff = colorFillScore(a, counts) - colorFillScore(b, counts)
    if (Math.abs(diff) > 0.05) return diff
    return compare(a, b)
  }
}

function breaksColorFloor(
  dropMeta: Meta,
  addMeta: Meta,
  counts: Counts,
  minPip: number,
): boolean {
  for (const color of COLORS) {
    const have = counts.color[color] ?? 0
    const next = have - (dropMeta.colorW[color] ?? 0) + (addMeta.colorW[color] ?? 0)
    if (next < minPip && next < have - 0.01) return true
  }
  return false
}

function breaksHighEloFloor(
  drop: LibraryCard,
  add: LibraryCard,
  dropMeta: Meta,
  addMeta: Meta,
  counts: Counts,
  targets: Targets,
): boolean {
  if (targets.highPerColor <= 0) return false
  for (const color of COLORS) {
    const want = highEloWant(targets, color)
    if (want <= 0) continue
    const have = counts.highColor[color] ?? 0
    const next =
      have -
      (dropMeta.high && identityColors(drop).includes(color) ? 1 : 0) +
      (addMeta.high && identityColors(add).includes(color) ? 1 : 0)
    if (next < want && next < have) return true
  }
  return false
}

function pickColorSwap(
  current: LibraryCard[],
  open: LibraryCard[],
  counts: Counts,
  targets: Targets,
  random: () => number,
  rankAdds: (cards: LibraryCard[]) => LibraryCard[],
): { drop: LibraryCard; add: LibraryCard } | null {
  if (current.length === 0 || open.length === 0) return null
  const short = deficitColors(counts, targets.color, 1)
  const long = surplusColors(counts, targets.color, 1)
  const dropPool = current.filter((card) => mainlySurplus(card, long, short))
  const dropFrom = dropPool.length >= 3 ? dropPool : current
  const drop = dropFrom[Math.floor(random() * dropFrom.length)]!
  const addPool = short.length > 0 ? open.filter((card) => helpsColors(card, short)) : open
  const ranked = rankAdds(addPool.length > 0 ? addPool : open).slice(0, 80)
  if (ranked.length === 0) return null
  const add = ranked[Math.floor(random() * Math.min(24, ranked.length))]!
  if (add.oracleId === drop.oracleId) return null
  return { drop, add }
}

type Counts = {
  size: number
  theme: Record<string, number>
  color: Record<string, number>
  curve: Record<string, number>
  types: Record<string, number>
  lands: number
  creatures: number
  goldNonland: number
  gold3: number
  colorCards: Record<string, number>
  colorCreatures: Record<string, number>
  highColor: Record<string, number>
  incidental: Record<string, number>
  typal: Record<string, number>
  typalPayoffs: Record<string, number>
  cardTags: Map<string, string[]>
}

function emptyCounts(themeIds: string[]): Counts {
  return {
    size: 0,
    theme: Object.fromEntries(themeIds.map((id) => [id, 0])),
    color: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    curve: { '0-1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 },
    types: Object.fromEntries(TYPE_FLOOR_ORDER.map((type) => [type, 0])),
    lands: 0,
    creatures: 0,
    goldNonland: 0,
    gold3: 0,
    colorCards: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    colorCreatures: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    highColor: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    incidental: {},
    typal: {},
    typalPayoffs: {},
    cardTags: new Map(),
  }
}

function applyCard(counts: Counts, card: LibraryCard, meta: Meta, dir: 1 | -1) {
  counts.size += dir
  for (const tag of meta.tags) {
    counts.theme[tag.themeId] = (counts.theme[tag.themeId] ?? 0) + dir
  }
  for (const [color, weight] of Object.entries(meta.colorW)) {
    counts.color[color] = (counts.color[color] ?? 0) + dir * weight
  }
  counts.curve[meta.bucket] = (counts.curve[meta.bucket] ?? 0) + (meta.land ? 0 : dir)
  for (const type of meta.types) {
    if (type in counts.types) counts.types[type] = (counts.types[type] ?? 0) + dir
  }
  if (meta.land) counts.lands += dir
  if (meta.creature) counts.creatures += dir
  if (!meta.land && card.colorIdentity.length > 1) counts.goldNonland += dir
  if (!meta.land && card.colorIdentity.length >= 3) counts.gold3 += dir
  for (const color of card.colorIdentity) {
    counts.colorCards[color] = (counts.colorCards[color] ?? 0) + dir
    if (meta.creature) counts.colorCreatures[color] = (counts.colorCreatures[color] ?? 0) + dir
    if (meta.high) counts.highColor[color] = (counts.highColor[color] ?? 0) + dir
  }
  for (const id of meta.incidental) {
    counts.incidental[id] = (counts.incidental[id] ?? 0) + dir
  }
  for (const id of meta.typalMembers) {
    counts.typal[id] = (counts.typal[id] ?? 0) + dir
  }
  for (const id of meta.typalPayoffs) {
    counts.typalPayoffs[id] = (counts.typalPayoffs[id] ?? 0) + dir
  }
  if (dir === 1) counts.cardTags.set(card.oracleId, meta.structTags)
  else counts.cardTags.delete(card.oracleId)
}

function sq(n: number): number {
  return n * n
}

function structuralTotals(counts: Counts): Map<string, number> {
  const totals = new Map<string, number>()
  for (const [id, n] of Object.entries(counts.theme)) totals.set(id, n)
  for (const [id, n] of Object.entries(counts.incidental)) {
    totals.set(id, (totals.get(id) ?? 0) + n)
  }
  return totals
}

function themeDensity(counts: Counts, targets: Targets): { supported: number; dominant: number } {
  const playableCut = (targets.size * PLAYABLE_AS_FAN) / 15
  const dominantCut = (targets.size * DOMINANT_AS_FAN) / 15
  let supported = 0
  let dominant = 0
  for (const n of structuralTotals(counts).values()) {
    if (n >= playableCut) supported += 1
    if (n >= dominantCut) dominant += 1
  }
  return { supported, dominant }
}

function top8Overlap(counts: Counts): { coverage: number; bridgeShare: number; connectedPairs: number } {
  const top = densestIds(structuralTotals(counts), STRUCTURE_TOP_N)
  return overlapFromTagLists(counts.cardTags.values(), new Set(top), counts.size)
}

function bandGap(value: number, low: number, high: number, over = 1): number {
  return Math.max(0, low - value) + over * Math.max(0, value - high)
}

function energy(counts: Counts, themeIds: string[], targets: Targets, quality: number): number {
  let e = -quality * 0.35
  const floorSet = new Set(targets.floorThemeIds)
  const ambientSet = new Set(targets.ambientIds)
  for (const id of targets.floorThemeIds) {
    const n = counts.theme[id] ?? 0
    e += 22 * sq(Math.max(0, targets.minTheme - n))
    e += 3 * sq(Math.max(0, n - targets.maxTheme))
  }
  for (const id of themeIds) {
    if (floorSet.has(id)) continue
    const n = counts.theme[id] ?? 0
    e += 14 * sq(Math.max(0, n - themeCap(id, targets, floorSet, ambientSet)))
  }
  for (const [id, n] of Object.entries(counts.incidental)) {
    e += 14 * sq(Math.max(0, n - themeCap(id, targets, floorSet, ambientSet)))
  }
  e += 9 * sq(counts.lands - targets.land)
  e += 7 * sq(counts.creatures - targets.creatures)
  for (const type of TYPE_FLOOR_ORDER) {
    const min = targets.types[type] ?? 0
    e += 16 * sq(Math.max(0, min - (counts.types[type] ?? 0)))
  }
  for (const bucket of Object.keys(CURVE_SHARE)) {
    e += 5 * sq((counts.curve[bucket] ?? 0) - targets.curve[bucket]!)
  }
  const colorTarget = targets.color
  for (const color of COLORS) {
    e += 55 * targets.tightness * sq((counts.color[color] ?? 0) - colorTarget)
    const n = counts.colorCards[color] ?? 0
    if (n >= 10) {
      const share = (counts.colorCreatures[color] ?? 0) / n
      e += 18 * sq(share - (CREATURE_SHARE[color] ?? 0.53))
    }
  }
  if (targets.highPerColor > 0) {
    const highs: number[] = []
    for (const color of COLORS) {
      const want = highEloWant(targets, color)
      const have = counts.highColor[color] ?? 0
      if (want > 0) {
        e += 48 * sq(Math.max(0, want - have))
        highs.push(have)
      }
    }
    if (highs.length >= 2) {
      const mean = highs.reduce((sum, n) => sum + n, 0) / highs.length
      e += 10 * highs.reduce((sum, n) => sum + sq(n - mean), 0)
    }
  }
  for (const typeId of targets.typalTypeIds) {
    const payoffs = counts.typalPayoffs[typeId] ?? 0
    if (payoffs <= 0) continue
    e += 52 * sq(Math.max(0, targets.typalMemberMin - (counts.typal[typeId] ?? 0)))
  }
  e += 45 * sq(Math.max(0, counts.goldNonland - targets.goldNonland))
  e += 60 * sq(Math.max(0, counts.gold3 - targets.goldThree))
  const density = themeDensity(counts, targets)
  e += 55 * sq(Math.max(0, density.supported - targets.maxSupported))
  e += 160 * sq(Math.max(0, density.supported - BALANCE_BENCHMARKS.supportedThemes.high))
  e += 110 * sq(Math.max(0, density.dominant - targets.maxDominant))
  e += 200 * sq(Math.max(0, density.dominant - BALANCE_BENCHMARKS.dominantThemes.high))
  const overlap = top8Overlap(counts)
  e += 22 * sq(
    bandGap(
      overlap.coverage * 100,
      BALANCE_BENCHMARKS.themeCoverage.low * 100,
      BALANCE_BENCHMARKS.themeCoverage.high * 100,
      3.4,
    ),
  )
  e += 24 * sq(
    bandGap(
      overlap.bridgeShare * 100,
      BALANCE_BENCHMARKS.themeBridges.low * 100,
      BALANCE_BENCHMARKS.themeBridges.high * 100,
      2.6,
    ),
  )
  e += 8 * sq(bandGap(overlap.connectedPairs, BALANCE_BENCHMARKS.connectedPairs.low, BALANCE_BENCHMARKS.connectedPairs.high))
  const ranked = [...structuralTotals(counts).values()].sort((a, b) => b - a)
  const eighth = ranked[7] ?? 0
  const eighthAsFan = counts.size > 0 ? (eighth / counts.size) * 15 : 0
  e += 10 * sq(
    bandGap(eighthAsFan * 100, BALANCE_BENCHMARKS.eighthTheme.low * 100, BALANCE_BENCHMARKS.eighthTheme.high * 100),
  )
  return e
}

function breaksTypeFloor(
  dropMeta: Meta,
  addMeta: Meta,
  counts: Counts,
  typeMins: Record<string, number>,
): boolean {
  for (const type of TYPE_FLOOR_ORDER) {
    const min = typeMins[type] ?? 0
    if (min <= 0) continue
    const have = counts.types[type] ?? 0
    const next =
      have - (dropMeta.types.includes(type) ? 1 : 0) + (addMeta.types.includes(type) ? 1 : 0)
    if (next < min && next < have) return true
  }
  return false
}

function breaksTypalFloor(dropMeta: Meta, addMeta: Meta, counts: Counts, targets: Targets): boolean {
  if (targets.typalTypeIds.length === 0 || targets.typalMemberMin <= 0) return false
  for (const typeId of targets.typalTypeIds) {
    const payoffs = counts.typalPayoffs[typeId] ?? 0
    const nextPay =
      payoffs -
      (dropMeta.typalPayoffs.includes(typeId) ? 1 : 0) +
      (addMeta.typalPayoffs.includes(typeId) ? 1 : 0)
    if (nextPay <= 0) continue
    const have = counts.typal[typeId] ?? 0
    const next =
      have -
      (dropMeta.typalMembers.includes(typeId) ? 1 : 0) +
      (addMeta.typalMembers.includes(typeId) ? 1 : 0)
    if (next < targets.typalMemberMin && next < have) return true
  }
  return false
}

function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: number): () => number {
  let a = seed || 1
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Local search polish after the MIP solve. Seeds stay locked. */
export function polishPicked(
  ctx: GenerationContext,
  picked: Set<string>,
  iterations = 1800,
): { accepted: number; energyStart: number; energyNow: number } {
  const { pool, poolMap, metaOf, targets, themeIds, lockSet, typeMins, settings } = ctx
  const counts = emptyCounts(themeIds)
  for (const id of picked) {
    const card = poolMap.get(id)
    const meta = metaOf.get(id)
    if (card && meta) applyCard(counts, card, meta, 1)
  }
  const leftover = () => pool.filter((card) => !picked.has(card.oracleId))
  const qualityOfPicked = () =>
    [...picked].reduce((sum, id) => {
      const meta = metaOf.get(id)
      return sum + (meta ? glueScore(meta, settings.overlapBonus) : 0)
    }, 0)
  let energyNow = energy(counts, themeIds, targets, qualityOfPicked())
  const energyStart = energyNow
  let accepted = 0
  const random = rng(hashSeed(`polish:${settings.targetSize}:${[...picked].slice(0, 12).join('|')}`))
  const byGlue = (a: LibraryCard, b: LibraryCard) =>
    glueScore(metaOf.get(b.oracleId)!, settings.overlapBonus) -
    glueScore(metaOf.get(a.oracleId)!, settings.overlapBonus)

  for (let step = 0; step < iterations; step += 1) {
    const current = [...picked].map((id) => poolMap.get(id)!).filter((c) => c && !lockSet.has(c.oracleId))
    if (current.length === 0) break
    const temperature = 12 * (1 - step / iterations)
    const open = leftover()
    if (open.length === 0) break
    const swap = pickColorSwap(current, open, counts, targets, random, (cards) =>
      cards.slice().sort(compareColorThen(counts, byGlue)),
    )
    if (!swap) continue
    const { drop, add: addCard } = swap
    const dropMeta = metaOf.get(drop.oracleId)!
    const addMeta = metaOf.get(addCard.oracleId)!
    if (breaksTypeFloor(dropMeta, addMeta, counts, typeMins)) continue
    if (breaksColorFloor(dropMeta, addMeta, counts, colorMin(targets))) continue
    if (breaksHighEloFloor(drop, addCard, dropMeta, addMeta, counts, targets)) continue
    if (breaksTypalFloor(dropMeta, addMeta, counts, targets)) continue

    applyCard(counts, drop, dropMeta, -1)
    applyCard(counts, addCard, addMeta, 1)
    const nextE = energy(
      counts,
      themeIds,
      targets,
      qualityOfPicked() - glueScore(dropMeta, settings.overlapBonus) + glueScore(addMeta, settings.overlapBonus),
    )
    const delta = nextE - energyNow
    const take = delta < 0 || random() < Math.exp(-delta / Math.max(0.4, temperature))
    if (take) {
      picked.delete(drop.oracleId)
      picked.add(addCard.oracleId)
      energyNow = nextE
      accepted += 1
    } else {
      applyCard(counts, addCard, addMeta, -1)
      applyCard(counts, drop, dropMeta, 1)
    }
  }

  const eighthLow = Math.ceil((BALANCE_BENCHMARKS.eighthTheme.low * Math.max(1, counts.size)) / 15)
  for (let step = 0; step < 400; step += 1) {
    const totals = structuralTotals(counts)
    const rankedIds = densestIds(totals, STRUCTURE_TOP_N)
    const eighthId = rankedIds[7]
    const eighthCount = eighthId ? (totals.get(eighthId) ?? 0) : 0
    const overlap = top8Overlap(counts)
    if (eighthCount >= eighthLow && overlap.coverage <= BALANCE_BENCHMARKS.themeCoverage.high) break
    const current = [...picked].map((id) => poolMap.get(id)!).filter((c) => c && !lockSet.has(c.oracleId))
    const open = leftover()
    if (current.length === 0 || open.length === 0) break
    const topSet = new Set(rankedIds)
    const covHigh = overlap.coverage > BALANCE_BENCHMARKS.themeCoverage.high
    const swap = pickColorSwap(current, open, counts, targets, random, (cards) =>
      cards.slice().sort((a, b) => {
        const ma = metaOf.get(a.oracleId)!
        const mb = metaOf.get(b.oracleId)!
        const a8 = eighthId && ma.structTags.includes(eighthId) ? 1 : 0
        const b8 = eighthId && mb.structTags.includes(eighthId) ? 1 : 0
        if (a8 !== b8) return b8 - a8
        const aTop = ma.structTags.filter((id) => topSet.has(id)).length
        const bTop = mb.structTags.filter((id) => topSet.has(id)).length
        return covHigh ? aTop - bTop : bTop - aTop
      }),
    )
    if (!swap) continue
    const dropMeta = metaOf.get(swap.drop.oracleId)!
    const addMeta = metaOf.get(swap.add.oracleId)!
    if (breaksTypeFloor(dropMeta, addMeta, counts, typeMins)) continue
    if (breaksColorFloor(dropMeta, addMeta, counts, colorMin(targets))) continue
    if (breaksHighEloFloor(swap.drop, swap.add, dropMeta, addMeta, counts, targets)) continue
    if (breaksTypalFloor(dropMeta, addMeta, counts, targets)) continue
    applyCard(counts, swap.drop, dropMeta, -1)
    applyCard(counts, swap.add, addMeta, 1)
    const nextE = energy(
      counts,
      themeIds,
      targets,
      qualityOfPicked() - glueScore(dropMeta, settings.overlapBonus) + glueScore(addMeta, settings.overlapBonus),
    )
    if (nextE <= energyNow) {
      picked.delete(swap.drop.oracleId)
      picked.add(swap.add.oracleId)
      energyNow = nextE
      accepted += 1
    } else {
      applyCard(counts, swap.add, addMeta, -1)
      applyCard(counts, swap.drop, dropMeta, 1)
    }
  }
  return { accepted, energyStart, energyNow }
}
