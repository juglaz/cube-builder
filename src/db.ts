import Dexie, { type Table } from 'dexie'
import type {
  CardTheme,
  CatalogMeta,
  CatalogTagging,
  CobraEloRow,
  CobraIndexRow,
  CobraNeighborRow,
  Cube,
  CubeCard,
  GenerationPreset,
  LibraryCard,
  Theme,
} from './types'

export class CubeBuilderDB extends Dexie {
  themes!: Table<Theme, string>
  cards!: Table<LibraryCard, string>
  cardThemes!: Table<CardTheme, [string, string]>
  cubes!: Table<Cube, string>
  cubeCards!: Table<CubeCard, [string, string]>
  catalogTaggings!: Table<CatalogTagging, [string, string]>
  oracleCards!: Table<LibraryCard, string>
  cobraNeighbors!: Table<CobraNeighborRow, string>
  cobraIndex!: Table<CobraIndexRow, string>
  cobraElo!: Table<CobraEloRow, string>
  generationPresets!: Table<GenerationPreset, string>
  meta!: Table<CatalogMeta, string>

  constructor() {
    super('cube-builder')
    this.version(1).stores({
      themes: 'id, name',
      cards: 'oracleId, name, cmc, typeLine',
      cardThemes: '[oracleId+themeId], oracleId, themeId, synergy',
      cubes: 'id, name, updatedAt',
      cubeCards: '[cubeId+oracleId], cubeId, oracleId',
    })
    this.version(2)
      .stores({
        themes: 'id, name, slug, enabled, hidden, source',
        cards: 'oracleId, name, cmc, typeLine',
        cardThemes: '[oracleId+themeId], oracleId, themeId, synergy',
        cubes: 'id, name, updatedAt',
        cubeCards: '[cubeId+oracleId], cubeId, oracleId',
        catalogTaggings: '[oracleId+tagId], oracleId, tagId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const rows = await tx.table('themes').toArray()
        for (const row of rows) {
          await tx.table('themes').put({
            ...row,
            source: row.source ?? 'custom',
            enabled: row.enabled ?? true,
            hidden: row.hidden ?? false,
            taggingCount: row.taggingCount ?? 0,
          })
        }
      })
    this.version(3).stores({
      themes: 'id, name, slug, enabled, hidden, source',
      cards: 'oracleId, name, cmc, typeLine',
      cardThemes: '[oracleId+themeId], oracleId, themeId, synergy',
      cubes: 'id, name, updatedAt',
      cubeCards: '[cubeId+oracleId], cubeId, oracleId',
      catalogTaggings: '[oracleId+tagId], oracleId, tagId',
      oracleCards: 'oracleId, name, cmc, typeLine',
      meta: 'key',
    })
    this.version(4).stores({
      themes: 'id, name, slug, enabled, hidden, source',
      cards: 'oracleId, name, cmc, typeLine',
      cardThemes: '[oracleId+themeId], oracleId, themeId, synergy',
      cubes: 'id, name, updatedAt',
      cubeCards: '[cubeId+oracleId], cubeId, oracleId',
      catalogTaggings: '[oracleId+tagId], oracleId, tagId',
      oracleCards: 'oracleId, name, cmc, typeLine',
      cobraNeighbors: 'oracleId',
      cobraIndex: 'key',
      meta: 'key',
    })
    this.version(5).stores({
      themes: 'id, name, slug, enabled, hidden, source',
      cards: 'oracleId, name, cmc, typeLine',
      cardThemes: '[oracleId+themeId], oracleId, themeId, synergy',
      cubes: 'id, name, updatedAt',
      cubeCards: '[cubeId+oracleId], cubeId, oracleId',
      catalogTaggings: '[oracleId+tagId], oracleId, tagId',
      oracleCards: 'oracleId, name, cmc, typeLine',
      cobraNeighbors: 'oracleId',
      cobraIndex: 'key',
      cobraElo: 'oracleId',
      generationPresets: 'id, name, builtin',
      meta: 'key',
    })
  }
}

export const db = new CubeBuilderDB()
