import { db } from '../db'
import { applyTaggerToOracleIds } from './tagger'
import type { Cube, GenerationSettings, LibraryCard, Synergy, Theme } from '../types'

export async function upsertCards(
  cards: LibraryCard[],
  options?: { skipTagger?: boolean },
): Promise<void> {
  if (cards.length === 0) return
  await db.oracleCards.bulkPut(cards)
  if (options?.skipTagger) return
  await applyTaggerToOracleIds(cards.map((c) => c.oracleId))
}

export async function createTheme(
  input: Pick<Theme, 'name' | 'description' | 'accent'> & Partial<Theme>,
): Promise<Theme> {
  const theme: Theme = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    description: input.description,
    accent: input.accent,
    source: input.source ?? 'custom',
    slug: input.slug,
    parentIds: input.parentIds ?? [],
    childIds: input.childIds ?? [],
    aliases: input.aliases ?? [],
    enabled: input.enabled ?? true,
    hidden: input.hidden ?? false,
    taggingCount: input.taggingCount ?? 0,
  }
  await db.themes.add(theme)
  return theme
}

export async function setThemeHidden(id: string, hidden: boolean): Promise<void> {
  const theme = await db.themes.get(id)
  if (!theme) return
  await db.themes.put({ ...theme, hidden })
}

export async function updateTheme(theme: Theme): Promise<void> {
  await db.themes.put(theme)
}

export async function deleteTheme(id: string): Promise<void> {
  await db.transaction('rw', db.themes, db.cardThemes, async () => {
    await db.themes.delete(id)
    await db.cardThemes.where('themeId').equals(id).delete()
  })
}

export async function setCardTheme(
  oracleId: string,
  themeId: string,
  synergy: Synergy,
  mode: 'max' | 'overwrite' = 'max',
): Promise<void> {
  const existing = await db.cardThemes.get([oracleId, themeId])
  const next = existing && mode === 'max' ? (Math.max(existing.synergy, synergy) as Synergy) : synergy
  await db.cardThemes.put({ oracleId, themeId, synergy: next, userOverride: true })
}

export async function removeCardTheme(oracleId: string, themeId: string): Promise<void> {
  await db.cardThemes.delete([oracleId, themeId])
}

export async function applyThemeToCards(
  oracleIds: string[],
  themeId: string,
  synergy: Synergy,
  mode: 'max' | 'overwrite',
): Promise<void> {
  await db.transaction('rw', db.cardThemes, async () => {
    for (const oracleId of oracleIds) {
      await setCardTheme(oracleId, themeId, synergy, mode)
    }
  })
}

export function uniqueCubeName(requested: string, existing: string[]): string {
  const taken = new Set(existing)
  const trimmed = requested.trim() || 'Generated cube'
  if (!taken.has(trimmed)) return trimmed
  const base = trimmed.replace(/\s+\(\d+\)$/, '')
  let n = 1
  while (taken.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

export async function createCube(name: string, targetSize = 360): Promise<Cube> {
  const existing = (await db.cubes.toArray()).map((cube) => cube.name)
  const now = Date.now()
  const cube: Cube = {
    id: crypto.randomUUID(),
    name: uniqueCubeName(name, existing),
    targetSize,
    notes: '',
    createdAt: now,
    updatedAt: now,
    generationSettings: null,
  }
  await db.cubes.add(cube)
  return cube
}

export async function updateCube(cube: Cube): Promise<void> {
  await db.cubes.put({ ...cube, updatedAt: Date.now() })
}

export async function deleteCube(id: string): Promise<void> {
  await db.transaction('rw', db.cubes, db.cubeCards, async () => {
    await db.cubes.delete(id)
    await db.cubeCards.where('cubeId').equals(id).delete()
  })
}

export async function addCardsToCube(cubeId: string, oracleIds: string[]): Promise<void> {
  const rows = oracleIds.map((oracleId) => ({ cubeId, oracleId }))
  await db.cubeCards.bulkPut(rows)
  const cube = await db.cubes.get(cubeId)
  if (cube) await updateCube(cube)
}

export async function removeCardFromCube(cubeId: string, oracleId: string): Promise<void> {
  await db.transaction('rw', db.cubes, db.cubeCards, async () => {
    await db.cubeCards.delete([cubeId, oracleId])
    const leftover = await db.cubeCards.where('cubeId').equals(cubeId).toArray()
    await Promise.all(
      leftover
        .filter((row) => row.oracleId === oracleId)
        .map((row) => db.cubeCards.delete([row.cubeId, row.oracleId])),
    )
    const cube = await db.cubes.get(cubeId)
    if (cube) await db.cubes.put({ ...cube, updatedAt: Date.now() })
  })
}

export async function replaceCubeCards(
  cubeId: string,
  oracleIds: string[],
  settings?: GenerationSettings | null,
): Promise<void> {
  await db.transaction('rw', db.cubes, db.cubeCards, async () => {
    await db.cubeCards.where('cubeId').equals(cubeId).delete()
    await db.cubeCards.bulkPut(oracleIds.map((oracleId) => ({ cubeId, oracleId })))
    const cube = await db.cubes.get(cubeId)
    if (cube) {
      await db.cubes.put({
        ...cube,
        generationSettings: settings ?? cube.generationSettings,
        updatedAt: Date.now(),
      })
    }
  })
}
