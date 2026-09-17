import { useSyncExternalStore } from 'react'
import type { GenerateReport } from './generationShared'
import { loadCardsByOracleIds } from './catalogCards'
import { DEFAULT_KNOBS, normalizeKnobs } from './generationPresets'
import type { CardFace, GenerationKnobs, GenerationSettings, LibraryCard } from '../types'

const STORAGE_KEY = 'cube-builder.generate.draft'

export type GenerationDraft = {
  seeds: LibraryCard[]
  themeIds: string[]
  knobs: GenerationKnobs
  destination: string
  newName: string
  preview: GenerateReport | null
  previewIds: string[]
}

type PersistedDraft = {
  seeds: LibraryCard[]
  themeIds: string[]
  knobs: GenerationKnobs
  destination: string
  newName: string
}

const EMPTY: GenerationDraft = {
  seeds: [],
  themeIds: [],
  knobs: { ...DEFAULT_KNOBS },
  destination: 'new',
  newName: 'Generated cube',
  preview: null,
  previewIds: [],
}

function readPersisted(): Partial<PersistedDraft> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedDraft>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writePersisted(draft: GenerationDraft): void {
  const payload: PersistedDraft = {
    seeds: draft.seeds,
    themeIds: draft.themeIds,
    knobs: draft.knobs,
    destination: draft.destination,
    newName: draft.newName,
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota or private mode — in-memory draft still works for this session.
  }
}

function hydrate(): GenerationDraft {
  const saved = readPersisted()
  if (!saved) return { ...EMPTY, knobs: { ...DEFAULT_KNOBS } }
  return {
    seeds: Array.isArray(saved.seeds) ? saved.seeds : [],
    themeIds: Array.isArray(saved.themeIds) ? saved.themeIds.filter((id) => typeof id === 'string') : [],
    knobs: normalizeKnobs(saved.knobs),
    destination: typeof saved.destination === 'string' && saved.destination ? saved.destination : 'new',
    newName: typeof saved.newName === 'string' && saved.newName.trim() ? saved.newName : EMPTY.newName,
    preview: null,
    previewIds: [],
  }
}

let draft: GenerationDraft = hydrate()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getGenerationDraft(): GenerationDraft {
  return draft
}

export function subscribeGenerationDraft(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function patchGenerationDraft(partial: Partial<GenerationDraft>): void {
  draft = { ...draft, ...partial }
  writePersisted(draft)
  emit()
}

export function useGenerationDraft(): GenerationDraft {
  return useSyncExternalStore(subscribeGenerationDraft, getGenerationDraft)
}

function snapshotCard(partial: {
  oracleId: string
  name: string
  imageNormal: string
  typeLine: string
  faces?: CardFace[]
}): LibraryCard {
  return {
    oracleId: partial.oracleId,
    scryfallId: '',
    name: partial.name,
    cmc: 0,
    typeLine: partial.typeLine,
    colors: [],
    colorIdentity: [],
    manaCost: '',
    oracleText: '',
    power: null,
    toughness: null,
    keywords: [],
    imageNormal: partial.imageNormal,
    imageLarge: partial.imageNormal,
    layout: 'normal',
    faces: partial.faces,
  }
}

/** Load a saved cube’s generator settings into the Generate page draft. */
export async function applySettingsToGenerationDraft(
  settings: GenerationSettings,
  options?: { destination?: string; newName?: string },
): Promise<void> {
  const ids = settings.seedOracleIds ?? []
  const fromCatalog = await loadCardsByOracleIds(ids)
  const byId = new Map(fromCatalog.map((card) => [card.oracleId, card]))
  for (const snap of settings.seedCards ?? []) {
    if (!byId.has(snap.oracleId)) byId.set(snap.oracleId, snapshotCard(snap))
  }
  const seeds = ids.map((id) => byId.get(id)).filter((card): card is LibraryCard => Boolean(card))
  patchGenerationDraft({
    seeds,
    themeIds: [...(settings.themeIds ?? [])],
    knobs: normalizeKnobs(settings),
    destination: options?.destination ?? 'new',
    newName: options?.newName?.trim() || 'Generated cube',
    preview: null,
    previewIds: [],
  })
}
