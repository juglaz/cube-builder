import { scoreCobraHitsAgainst, type CobraOverlap } from './cobra'
import { polishPicked } from './generator'
import {
  enforcePayoffSupport,
  finishGeneration,
  glueScore,
  prepareGeneration,
  type GenerateReport,
} from './generationShared'
import type { ThemeOverlapContext } from './generatePool'
import { buildPackedMip, MIP_POOL_CAP } from './mip/model'
import { solvePackedMip } from './mip/solve'
import type { CardTheme, GenerationSettings, LibraryCard, Theme } from '../types'

export async function generateCubeMip(
  library: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
  settings: GenerationSettings,
  cobraNeighbors: Map<string, string[]> = new Map(),
  overlaps: Map<string, CobraOverlap> = new Map(),
  themeOverlap?: ThemeOverlapContext,
  eloMap?: Map<string, number>,
): Promise<{ oracleIds: string[]; report: GenerateReport }> {
  const ctx = prepareGeneration(library, themes, tags, settings, cobraNeighbors, overlaps, themeOverlap, eloMap)
  const packed = buildPackedMip(ctx)
  const phases: string[] = [
    `MIP model: ${packed.cardCount} card variables, ${packed.numCols - packed.cardCount} slacks, ${packed.numRows} constraints` +
      (library.length > packed.cardCount
        ? ` (capped from ${library.length} pool cards, max ${MIP_POOL_CAP}).`
        : '.'),
    `Solving with HiGHS (time limit ${packed.timeLimit}s, ${Math.round(packed.mipRelGap * 100)}% gap)…`,
    ctx.seedCards.length > 0
      ? `Seeds are locked (x = 1): ${ctx.seedCards.map((c) => c.name).join(', ')}.`
      : 'No seed crystals; theme tags drive the objective.',
  ]

  const solved = await solvePackedMip(packed)
  if (solved.error) {
    throw new Error(`MIP solver failed: ${solved.error}`)
  }
  if (solved.status === 8) {
    throw new Error('MIP model is infeasible. Relax floors or add more candidates to the pool.')
  }

  const picked = new Set<string>()
  for (let i = 0; i < packed.cardCount; i += 1) {
    if ((solved.colValue[i] ?? 0) > 0.5) picked.add(packed.oracleIds[i]!)
  }
  if (picked.size === 0) {
    throw new Error(
      `MIP returned no cards (status ${solved.statusName}). The solver may still be loading, or the model had no feasible integer solution.`,
    )
  }

  phases.push(
    `HiGHS ${solved.statusName.toLowerCase()} in ${solved.runtimeMs} ms; objective ${
      solved.objective == null ? 'n/a' : solved.objective.toFixed(1)
    }; selected ${picked.size} cards.`,
  )

  const polish = polishPicked(ctx, picked)
  phases.push(
    `Theme-density polish accepted ${polish.accepted}/1800 swaps (energy ${polish.energyStart.toFixed(0)} → ${polish.energyNow.toFixed(0)}).`,
  )

  const support = enforcePayoffSupport(ctx, picked)
  const dropped =
    support.dropped.length === 0
      ? 'none'
      : support.dropped.length <= 8
        ? support.dropped.join(', ')
        : `${support.dropped.slice(0, 8).join(', ')} (+${support.dropped.length - 8} more)`
  phases.push(
    `Payoff support pass swapped in ${support.swapped} enablers, dropped ${support.dropped.length} unsupported payoff${support.dropped.length === 1 ? '' : 's'} (${dropped}), then refilled ${support.refilled} cards.`,
  )

  return finishGeneration(ctx, picked, phases, {
    engine: 'mip',
    solver: {
      status: solved.statusName,
      objective: solved.objective,
      runtimeMs: solved.runtimeMs,
      poolSize: packed.cardCount,
    },
  })
}

const FILL_QUEUE = 40

function cubeThemeWeight(lockSet: Set<string>, tags: CardTheme[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tag of tags) {
    if (!lockSet.has(tag.oracleId)) continue
    counts.set(tag.themeId, (counts.get(tag.themeId) ?? 0) + tag.synergy)
  }
  return counts
}

function fillFitScore(
  id: string,
  ctx: ReturnType<typeof prepareGeneration>,
  cubeHits: Map<string, { hits: number; bestRank: number }>,
  themeWeight: Map<string, number>,
  cardTags: CardTheme[],
  mipWanted: Set<string>,
): number {
  const hit = cubeHits.get(id)
  const cobra = hit ? hit.hits * 14 - Math.min(8, hit.bestRank / 12) : 0
  let themeFit = 0
  for (const tag of cardTags) themeFit += themeWeight.get(tag.themeId) ?? 0
  const meta = ctx.metaOf.get(id)
  const glue = meta ? glueScore(meta, ctx.settings.overlapBonus) : 0
  const mip = mipWanted.has(id) ? 18 : 0
  return cobra + Math.log1p(themeFit) * 10 + glue * 0.35 + mip
}

/** Lock the current list and return cards that fit it, not only leftover MIP slots. */
export async function mipFillSuggestions(
  library: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
  settings: GenerationSettings,
  cobraNeighbors: Map<string, string[]> = new Map(),
  overlaps: Map<string, CobraOverlap> = new Map(),
  themeOverlap?: ThemeOverlapContext,
  eloMap?: Map<string, number>,
): Promise<LibraryCard[]> {
  const ctx = prepareGeneration(library, themes, tags, settings, cobraNeighbors, overlaps, themeOverlap, eloMap)
  const packed = buildPackedMip(ctx, 4, 0.05, { fill: true })
  const solved = await solvePackedMip(packed)
  if (solved.error) throw new Error(`MIP solver failed: ${solved.error}`)

  const mipWanted = new Set<string>()
  if (solved.status !== 8) {
    for (let i = 0; i < packed.cardCount; i += 1) {
      if ((solved.colValue[i] ?? 0) > 0.5 && !ctx.lockSet.has(packed.oracleIds[i]!)) {
        mipWanted.add(packed.oracleIds[i]!)
      }
    }
  }

  const cubeHits = scoreCobraHitsAgainst([...ctx.lockSet], cobraNeighbors)
  const themeWeight = cubeThemeWeight(ctx.lockSet, tags)
  const tagsByCard = new Map<string, CardTheme[]>()
  for (const tag of tags) {
    const list = tagsByCard.get(tag.oracleId)
    if (list) list.push(tag)
    else tagsByCard.set(tag.oracleId, [tag])
  }
  const extraIds = ctx.pool
    .map((card) => card.oracleId)
    .filter((id) => !ctx.lockSet.has(id) && ctx.metaOf.has(id))
    .sort(
      (a, b) =>
        fillFitScore(b, ctx, cubeHits, themeWeight, tagsByCard.get(b) ?? [], mipWanted) -
        fillFitScore(a, ctx, cubeHits, themeWeight, tagsByCard.get(a) ?? [], mipWanted),
    )

  return extraIds
    .slice(0, FILL_QUEUE)
    .map((id) => ctx.poolMap.get(id))
    .filter((card): card is LibraryCard => Boolean(card))
}
