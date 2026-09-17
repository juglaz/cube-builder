import { densestThemeIds } from './cubeList'
import { displayCreatureType, parseTypeThemeId } from './creatureTypes'
import type { CardTheme, Cube, LibraryCard, Theme } from '../types'

export const MAGIC_CARD_WIDTH_IN = 2.5
export const MAGIC_CARD_HEIGHT_IN = 3.5
/** M15 illustration window on a 2.5″ × 3.5″ card. */
export const MAGIC_ART_WIDTH_IN = 2.02
export const MAGIC_ART_HEIGHT_IN = 1.45
export const PRIMARY_THEME_LIMIT = 8

export function joinAnd(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function primaryThemeIdsForCube(
  cube: Cube,
  cards: LibraryCard[],
  themes: Theme[],
  tags: CardTheme[],
): string[] {
  if (Array.isArray(cube.primaryThemeIds)) {
    return [...new Set(cube.primaryThemeIds.filter(Boolean))].slice(0, PRIMARY_THEME_LIMIT)
  }
  const favored = cube.generationSettings?.themeIds?.filter(Boolean) ?? []
  if (favored.length > 0) return [...new Set(favored)].slice(0, PRIMARY_THEME_LIMIT)
  return densestThemeIds(cards, themes, tags, PRIMARY_THEME_LIMIT)
}

export function displayThemeName(name: string): string {
  const typeName = parseTypeThemeId(name)
  if (typeName) return displayCreatureType(typeName)
  const spaced = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word
      if (word.length <= 2) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function themeNamesForIds(ids: string[], themes: Theme[]): string[] {
  const byId = new Map(themes.map((theme) => [theme.id, theme]))
  const bySlug = new Map(
    themes.filter((theme) => theme.slug).map((theme) => [theme.slug!.toLowerCase(), theme]),
  )
  const seen = new Set<string>()
  const names: string[] = []
  for (const id of ids) {
    const theme = byId.get(id) ?? bySlug.get(id.toLowerCase())
    const raw = theme?.name ?? id
    const name = displayThemeName(raw)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

export function defaultCubeDescription(input: {
  size: number
  targetSize: number
  themeNames: string[]
  seedNames: string[]
}): string {
  const n = input.size || input.targetSize
  const sizePhrase = `A ${n}-card cube`
  const { themeNames, seedNames } = input
  if (seedNames.length > 0) {
    return `${sizePhrase} grown from ${joinAnd(seedNames)}.`
  }
  if (themeNames.length > 0) {
    return `${sizePhrase} built around ${joinAnd(themeNames)}.`
  }
  return `${sizePhrase} with a mix of colors and archetypes.`
}

export function cubeInfoDescription(
  cube: Cube,
  generated: string,
): string {
  const notes = cube.notes.trim()
  return notes || generated
}

export async function imageFileToInfoArt(file: File, maxEdge = 1400, quality = 0.88): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Could not read that image.')
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
