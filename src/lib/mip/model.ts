import {
  COLORS,
  CREATURE_SHARE,
  CURVE_SHARE,
  glueScore,
  highEloWant,
  identityColors,
  isDraftable,
  themeCap,
  type GenerationContext,
} from '../generationShared'
import { TYPE_FLOOR_ORDER } from '../coverage'
import { isLand } from '../cardMeta'
import type { LibraryCard } from '../../types'

const MAX_MIP_CARDS = 4800
const INF = 1e20

const W = {
  glue: 0.35,
  sizeShort: 8000,
  typeUnder: 400,
  themeUnder: 350,
  themeOver: 8,
  incidentalOver: 28,
  landUnder: 40,
  landOver: 20,
  creature: 18,
  curve: 12,
  colorUnder: 80,
  colorOver: 25,
  share: 20,
  highColorUnder: 90,
  typalUnder: 380,
} as const

export type PackedMipModel = {
  oracleIds: string[]
  cardCount: number
  numCols: number
  numRows: number
  colCost: number[]
  colLower: number[]
  colUpper: number[]
  rowLower: number[]
  rowUpper: number[]
  starts: number[]
  indices: number[]
  values: number[]
  integrality: number[]
  timeLimit: number
  mipRelGap: number
}

type RowSpec = { lower: number; upper: number; cols: number[]; vals: number[] }

function capCandidates(ctx: GenerationContext): LibraryCard[] {
  const { pool, metaOf, lockSet, targets, settings } = ctx
  const eligible = pool.filter((card) => lockSet.has(card.oracleId) || isDraftable(card))
  if (eligible.length <= MAX_MIP_CARDS) return eligible

  const bonus = settings.overlapBonus
  const keep = new Set(lockSet)
  const rest = eligible.filter((card) => !keep.has(card.oracleId))
  const glueOf = (card: LibraryCard) => {
    const meta = metaOf.get(card.oracleId)
    return meta ? glueScore(meta, bonus) : 0
  }
  const byGlue = (a: LibraryCard, b: LibraryCard) => glueOf(b) - glueOf(a)

  for (const type of TYPE_FLOOR_ORDER) {
    const want = Math.max(40, (targets.types[type] ?? 0) * 3)
    const hits = rest.filter((card) => metaOf.get(card.oracleId)?.types.includes(type)).sort(byGlue)
    for (const card of hits.slice(0, want)) keep.add(card.oracleId)
  }
  for (const color of COLORS) {
    const hits = rest
      .filter((card) => identityColors(card).includes(color) && !isLand(card))
      .sort(byGlue)
    for (const card of hits.slice(0, 90)) keep.add(card.oracleId)
  }
  for (const color of COLORS) {
    const hits = rest
      .filter((card) => metaOf.get(card.oracleId)?.high && identityColors(card).includes(color))
      .sort((a, b) => {
        const eloDiff = (metaOf.get(b.oracleId)?.elo ?? 0) - (metaOf.get(a.oracleId)?.elo ?? 0)
        if (eloDiff !== 0) return eloDiff
        return byGlue(a, b)
      })
    for (const card of hits.slice(0, 36)) keep.add(card.oracleId)
  }
  for (const typeId of targets.typalTypeIds) {
    const members = rest
      .filter((card) => metaOf.get(card.oracleId)?.typalMembers.includes(typeId))
      .sort(byGlue)
    for (const card of members.slice(0, Math.max(40, targets.typalMemberMin * 4))) keep.add(card.oracleId)
    const payoffs = rest
      .filter((card) => metaOf.get(card.oracleId)?.typalPayoffs.includes(typeId))
      .sort(byGlue)
    for (const card of payoffs.slice(0, 24)) keep.add(card.oracleId)
  }
  const lands = rest.filter((card) => metaOf.get(card.oracleId)?.land).sort(byGlue)
  for (const card of lands.slice(0, Math.max(80, targets.land * 2))) keep.add(card.oracleId)

  for (const card of [...rest].sort(byGlue)) {
    if (keep.size >= MAX_MIP_CARDS) break
    keep.add(card.oracleId)
  }
  return eligible.filter((card) => keep.has(card.oracleId))
}

export function buildPackedMip(
  ctx: GenerationContext,
  timeLimit = 5,
  mipRelGap = 0.03,
  opts?: { fill?: boolean },
): PackedMipModel {
  const cards = capCandidates(ctx)
  const { metaOf, targets, themeIds, lockSet, settings } = ctx
  const n = cards.length
  const tightness = targets.tightness
  const colCost: number[] = []
  const colLower: number[] = []
  const colUpper: number[] = []
  const integrality: number[] = []

  for (let i = 0; i < n; i += 1) {
    const card = cards[i]!
    const meta = metaOf.get(card.oracleId)
    if (!meta) {
      colCost.push(0)
      colLower.push(lockSet.has(card.oracleId) ? 1 : 0)
      colUpper.push(1)
      integrality.push(1)
      continue
    }
    colCost.push(glueScore(meta, settings.overlapBonus) * W.glue)
    const locked = lockSet.has(card.oracleId)
    colLower.push(locked ? 1 : 0)
    colUpper.push(1)
    integrality.push(1)
  }

  function addSlack(cost: number): number {
    const idx = colCost.length
    colCost.push(cost)
    colLower.push(0)
    colUpper.push(INF)
    integrality.push(0)
    return idx
  }

  const rows: RowSpec[] = []
  function addRow(lower: number, upper: number, entries: Array<[number, number]>) {
    const merged = new Map<number, number>()
    for (const [col, val] of entries) {
      if (!Number.isFinite(val) || val === 0) continue
      merged.set(col, (merged.get(col) ?? 0) + val)
    }
    const cols: number[] = []
    const vals: number[] = []
    for (const col of [...merged.keys()].sort((a, b) => a - b)) {
      const val = merged.get(col) ?? 0
      if (val === 0) continue
      cols.push(col)
      vals.push(val)
    }
    rows.push({ lower, upper, cols, vals })
  }

  function addBinary(): number {
    const idx = colCost.length
    colCost.push(0)
    colLower.push(0)
    colUpper.push(1)
    integrality.push(1)
    return idx
  }

  const lockedInModel = cards.reduce((count, card) => count + (lockSet.has(card.oracleId) ? 1 : 0), 0)
  const sizeShort = addSlack(-W.sizeShort)
  const sizeTarget =
    opts?.fill && lockedInModel > settings.targetSize ? lockedInModel : settings.targetSize
  addRow(
    sizeTarget,
    sizeTarget,
    [...Array.from({ length: n }, (_, i) => [i, 1] as [number, number]), [sizeShort, 1]],
  )

  for (const type of TYPE_FLOOR_ORDER) {
    const min = targets.types[type] ?? 0
    if (min <= 0) continue
    const under = addSlack(-W.typeUnder)
    const entries: Array<[number, number]> = [[under, 1]]
    for (let i = 0; i < n; i += 1) {
      if (metaOf.get(cards[i]!.oracleId)?.types.includes(type)) entries.push([i, 1])
    }
    addRow(min, INF, entries)
  }

  const floorSet = new Set(targets.floorThemeIds)
  const ambientSet = new Set(targets.ambientIds)
  for (const themeId of themeIds) {
    if (targets.minTheme > 0 && floorSet.has(themeId)) {
      const under = addSlack(-W.themeUnder)
      const entries: Array<[number, number]> = [[under, 1]]
      for (let i = 0; i < n; i += 1) {
        if (metaOf.get(cards[i]!.oracleId)?.tags.some((t) => t.themeId === themeId)) entries.push([i, 1])
      }
      addRow(targets.minTheme, INF, entries)
    }
    const cap = themeCap(themeId, targets, floorSet, ambientSet)
    if (cap < settings.targetSize) {
      const over = addSlack(-W.themeOver)
      const entries: Array<[number, number]> = [[over, -1]]
      for (let i = 0; i < n; i += 1) {
        if (metaOf.get(cards[i]!.oracleId)?.tags.some((t) => t.themeId === themeId)) entries.push([i, 1])
      }
      addRow(-INF, cap, entries)
    }
  }

  const incidentalFreq = new Map<string, number>()
  for (const card of cards) {
    for (const id of metaOf.get(card.oracleId)?.incidental ?? []) {
      incidentalFreq.set(id, (incidentalFreq.get(id) ?? 0) + 1)
    }
  }
  const incidentalIds = [...incidentalFreq.entries()]
    .filter(([, count]) => count >= 12)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([id]) => id)
  for (const themeId of incidentalIds) {
    const cap = themeCap(themeId, targets, floorSet, ambientSet)
    if (cap >= settings.targetSize) continue
    const over = addSlack(-W.incidentalOver)
    const entries: Array<[number, number]> = [[over, -1]]
    for (let i = 0; i < n; i += 1) {
      if (metaOf.get(cards[i]!.oracleId)?.incidental.includes(themeId)) entries.push([i, 1])
    }
    addRow(-INF, cap, entries)
  }

  const landUnder = addSlack(-W.landUnder)
  const landOver = addSlack(-W.landOver)
  addRow(targets.land, targets.land, [
    ...cards.flatMap((card, i) => (metaOf.get(card.oracleId)?.land ? [[i, 1] as [number, number]] : [])),
    [landUnder, 1],
    [landOver, -1],
  ])

  const crUnder = addSlack(-W.creature)
  const crOver = addSlack(-W.creature)
  addRow(targets.creatures, targets.creatures, [
    ...cards.flatMap((card, i) => (metaOf.get(card.oracleId)?.creature ? [[i, 1] as [number, number]] : [])),
    [crUnder, 1],
    [crOver, -1],
  ])

  for (const bucket of Object.keys(CURVE_SHARE)) {
    const target = targets.curve[bucket] ?? 0
    const under = addSlack(-W.curve)
    const over = addSlack(-W.curve)
    addRow(target, target, [
      ...cards.flatMap((card, i) => {
        const meta = metaOf.get(card.oracleId)
        return meta && !meta.land && meta.bucket === bucket ? [[i, 1] as [number, number]] : []
      }),
      [under, 1],
      [over, -1],
    ])
  }

  for (const color of COLORS) {
    const under = addSlack(-W.colorUnder * tightness)
    const over = addSlack(-W.colorOver * tightness)
    addRow(targets.color, targets.color, [
      ...cards.flatMap((card, i) => {
        const w = metaOf.get(card.oracleId)?.colorW[color] ?? 0
        return w > 0 ? [[i, w] as [number, number]] : []
      }),
      [under, 1],
      [over, -1],
    ])
  }

  const goldEntries = (minColors: number): Array<[number, number]> =>
    cards.flatMap((card, i) => {
      const meta = metaOf.get(card.oracleId)
      return meta && !meta.land && identityColors(card).length >= minColors ? [[i, 1] as [number, number]] : []
    })
  const goldNonlandOver = opts?.fill ? addSlack(-W.share) : null
  const goldThreeOver = opts?.fill ? addSlack(-W.share) : null
  addRow(0, targets.goldNonland, [
    ...goldEntries(2),
    ...(goldNonlandOver == null ? [] : [[goldNonlandOver, -1] as [number, number]]),
  ])
  addRow(0, targets.goldThree, [
    ...goldEntries(3),
    ...(goldThreeOver == null ? [] : [[goldThreeOver, -1] as [number, number]]),
  ])

  for (const color of COLORS) {
    const share = CREATURE_SHARE[color] ?? 0.53
    const under = addSlack(-W.share)
    const over = addSlack(-W.share)
    const entries: Array<[number, number]> = [
      [under, 1],
      [over, -1],
    ]
    for (let i = 0; i < n; i += 1) {
      const card = cards[i]!
      if (!card.colorIdentity.includes(color)) continue
      const meta = metaOf.get(card.oracleId)
      if (!meta) continue
      entries.push([i, (meta.creature ? 1 : 0) - share])
    }
    addRow(0, 0, entries)
  }

  if (!opts?.fill && targets.highPerColor > 0) {
    for (const color of COLORS) {
      const want = highEloWant(targets, color)
      if (want <= 0) continue
      const under = addSlack(-W.highColorUnder)
      const entries: Array<[number, number]> = [[under, 1]]
      for (let i = 0; i < n; i += 1) {
        const card = cards[i]!
        const meta = metaOf.get(card.oracleId)
        if (meta?.high && identityColors(card).includes(color)) entries.push([i, 1])
      }
      addRow(want, INF, entries)
    }
  }

  for (const typeId of targets.typalTypeIds) {
    const min = targets.typalMemberMin
    if (min <= 0) continue
    const memberCols: number[] = []
    const payoffCols: number[] = []
    for (let i = 0; i < n; i += 1) {
      const meta = metaOf.get(cards[i]!.oracleId)
      if (meta?.typalMembers.includes(typeId)) memberCols.push(i)
      if (meta?.typalPayoffs.includes(typeId)) payoffCols.push(i)
    }
    if (payoffCols.length === 0) continue
    const z = addBinary()
    const under = addSlack(-W.typalUnder)
    addRow(0, INF, [
      [under, 1],
      [z, -min],
      ...memberCols.map((col) => [col, 1] as [number, number]),
    ])
    for (const i of payoffCols) {
      addRow(-INF, 0, [
        [i, 1],
        [z, -1],
      ])
    }
  }

  const numCols = colCost.length
  const numRows = rows.length
  const starts: number[] = [0]
  const indices: number[] = []
  const values: number[] = []
  for (const row of rows) {
    for (let k = 0; k < row.cols.length; k += 1) {
      indices.push(row.cols[k]!)
      values.push(row.vals[k]!)
    }
    starts.push(indices.length)
  }

  return {
    oracleIds: cards.map((card) => card.oracleId),
    cardCount: n,
    numCols,
    numRows,
    colCost,
    colLower,
    colUpper,
    rowLower: rows.map((r) => r.lower),
    rowUpper: rows.map((r) => r.upper),
    starts,
    indices,
    values,
    integrality,
    timeLimit,
    mipRelGap,
  }
}

export const MIP_POOL_CAP = MAX_MIP_CARDS
