export type Synergy = 1 | 2 | 3 | 4

export type ThemeSource = 'tagger' | 'custom'

export type Theme = {
  id: string
  name: string
  description: string
  accent: string
  source: ThemeSource
  slug?: string
  parentIds?: string[]
  childIds?: string[]
  aliases?: string[]
  enabled: boolean
  hidden: boolean
  taggingCount: number
}

export type CatalogTagging = {
  oracleId: string
  tagId: string
  synergy: Synergy
}

export type CatalogMeta = {
  key: string
  updatedAt: string
  syncedAt: number
  tagCount: number
  taggingCount: number
  histogram?: number[]
}

/** Cube Cobra synergistic neighbor indexes (into cobraIndex.oracles). */
export type CobraNeighborRow = {
  oracleId: string
  neighbors: number[]
}

export type CobraIndexRow = {
  key: string
  oracles: string[]
  neighbors?: Record<string, number[]>
}

export type CobraEloRow = {
  oracleId: string
  elo: number
}

export type CardFace = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  imageNormal?: string
  imageLarge?: string
}

export type LibraryCard = {
  oracleId: string
  scryfallId: string
  name: string
  cmc: number
  typeLine: string
  colors: string[]
  colorIdentity: string[]
  manaCost: string
  oracleText: string
  power: string | null
  toughness: string | null
  keywords: string[]
  imageNormal: string
  imageLarge: string
  layout: string
  faces?: CardFace[]
}

export type CardTheme = {
  oracleId: string
  themeId: string
  synergy: Synergy
  userOverride?: boolean
}

export type GenerationKnobs = {
  targetSize: number
  overlapBonus: number
  landQuota: number
  colorTightness: number
  themeAsFanTarget: number
  eloMin: number
  eloMax: number
  eloExemptLands: boolean
}

export type GenerationSettings = GenerationKnobs & {
  themeIds: string[]
  seedOracleIds?: string[]
  seedCards?: Array<{
    oracleId: string
    name: string
    imageNormal: string
    typeLine: string
    faces?: CardFace[]
  }>
  engine?: 'mip' | 'greedy'
  /** Extra cards forced into the MIP solution (current cube when filling gaps). */
  lockOracleIds?: string[]
  /** Candidates the MIP must not add (skipped fill suggestions). */
  excludeOracleIds?: string[]
}

export type GenerationPreset = {
  id: string
  name: string
  builtin: boolean
  knobs: GenerationKnobs
}

export type Cube = {
  id: string
  name: string
  targetSize: number
  notes: string
  /** Stable docs folder assigned when this cube is first published. */
  docsSlug?: string | null
  infoArt?: string | null
  /** When set, the info card uses these instead of generation seeds or densest tags. */
  primaryThemeIds?: string[] | null
  createdAt: number
  updatedAt: number
  generationSettings?: GenerationSettings | null
}

export type CubeCard = {
  cubeId: string
  oracleId: string
}

export type CardFilter = {
  query: string
  colors: string[]
  colorMode: 'any' | 'exact' | 'identity'
  types: string[]
  cmcBuckets: string[]
  themeIds: string[]
  minSynergy: Synergy | 0
}

export const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G'] as const
export type ColorLetter = (typeof COLOR_LETTERS)[number]

export const TYPE_FILTERS = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Land',
] as const

export const CMC_BUCKETS = ['0-1', '2', '3', '4', '5', '6+'] as const
