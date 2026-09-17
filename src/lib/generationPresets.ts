import { db } from '../db'
import { defaultEloBand, ELO_AXIS_MAX, ELO_AXIS_MIN } from './elo'
import type { GenerationKnobs, GenerationPreset, GenerationSettings } from '../types'

export const DEFAULT_KNOBS: GenerationKnobs = {
  targetSize: 360,
  overlapBonus: 6,
  landQuota: 0.17,
  colorTightness: 1,
  themeAsFanTarget: 1.2,
  eloExemptLands: true,
  ...defaultEloBand(),
}

export const BUILTIN_PRESETS: GenerationPreset[] = [
  {
    id: 'kitchen',
    name: 'Kitchen limited',
    builtin: true,
    knobs: {
      targetSize: 360,
      overlapBonus: 9,
      landQuota: 0.16,
      colorTightness: 1,
      themeAsFanTarget: 1.35,
      eloMin: 1160,
      eloMax: 1380,
      eloExemptLands: true,
    },
  },
  {
    id: 'synergy',
    name: 'Synergy cube',
    builtin: true,
    knobs: {
      targetSize: 360,
      overlapBonus: 10,
      landQuota: 0.16,
      colorTightness: 0.8,
      themeAsFanTarget: 1.4,
      eloMin: 1180,
      eloMax: 1480,
      eloExemptLands: true,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced cube',
    builtin: true,
    knobs: {
      ...DEFAULT_KNOBS,
    },
  },
  {
    id: 'unpowered',
    name: 'Unpowered',
    builtin: true,
    knobs: {
      targetSize: 360,
      overlapBonus: 5,
      landQuota: 0.18,
      colorTightness: 1,
      themeAsFanTarget: 1.15,
      eloMin: 1280,
      eloMax: 1580,
      eloExemptLands: true,
    },
  },
  {
    id: 'high-octane',
    name: 'High octane',
    builtin: true,
    knobs: {
      targetSize: 360,
      overlapBonus: 4,
      landQuota: 0.18,
      colorTightness: 1.1,
      themeAsFanTarget: 1.1,
      eloMin: 1320,
      eloMax: 1700,
      eloExemptLands: true,
    },
  },
  {
    id: 'powered',
    name: 'Powered',
    builtin: true,
    knobs: {
      targetSize: 360,
      overlapBonus: 3,
      landQuota: 0.19,
      colorTightness: 1,
      themeAsFanTarget: 1,
      eloMin: 1340,
      eloMax: 2200,
      eloExemptLands: true,
    },
  },
]

export function normalizeKnobs(partial: Partial<GenerationKnobs> | null | undefined): GenerationKnobs {
  const hasElo = Number.isFinite(partial?.eloMin) && Number.isFinite(partial?.eloMax)
  return {
    targetSize: Number.isFinite(partial?.targetSize) ? Number(partial?.targetSize) : DEFAULT_KNOBS.targetSize,
    overlapBonus: Number.isFinite(partial?.overlapBonus)
      ? Number(partial?.overlapBonus)
      : DEFAULT_KNOBS.overlapBonus,
    landQuota: Number.isFinite(partial?.landQuota) ? Number(partial?.landQuota) : DEFAULT_KNOBS.landQuota,
    colorTightness: Number.isFinite(partial?.colorTightness)
      ? Number(partial?.colorTightness)
      : DEFAULT_KNOBS.colorTightness,
    themeAsFanTarget: Number.isFinite(partial?.themeAsFanTarget)
      ? Number(partial?.themeAsFanTarget)
      : DEFAULT_KNOBS.themeAsFanTarget,
    eloMin: hasElo ? Number(partial?.eloMin) : ELO_AXIS_MIN,
    eloMax: hasElo ? Number(partial?.eloMax) : ELO_AXIS_MAX,
    eloExemptLands: partial?.eloExemptLands ?? true,
  }
}

export function knobsEqual(a: GenerationKnobs, b: GenerationKnobs): boolean {
  return (
    a.targetSize === b.targetSize &&
    a.overlapBonus === b.overlapBonus &&
    a.landQuota === b.landQuota &&
    a.colorTightness === b.colorTightness &&
    a.themeAsFanTarget === b.themeAsFanTarget &&
    a.eloMin === b.eloMin &&
    a.eloMax === b.eloMax &&
    a.eloExemptLands === b.eloExemptLands
  )
}

export function matchingPresetId(knobs: GenerationKnobs, presets: GenerationPreset[]): string | 'custom' {
  const custom = presets.find((preset) => !preset.builtin && knobsEqual(preset.knobs, knobs))
  if (custom) return custom.id
  const builtin = presets.find((preset) => preset.builtin && knobsEqual(preset.knobs, knobs))
  return builtin?.id ?? 'custom'
}

export async function ensureBuiltinPresets(): Promise<void> {
  await db.transaction('rw', db.generationPresets, async () => {
    for (const preset of BUILTIN_PRESETS) {
      const existing = await db.generationPresets.get(preset.id)
      if (existing?.builtin === false) continue
      await db.generationPresets.put(preset)
    }
  })
}

export async function saveCustomPreset(name: string, knobs: GenerationKnobs): Promise<GenerationPreset> {
  const preset: GenerationPreset = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Custom preset',
    builtin: false,
    knobs: { ...knobs },
  }
  await db.generationPresets.put(preset)
  return preset
}

export async function deleteCustomPreset(id: string): Promise<void> {
  const row = await db.generationPresets.get(id)
  if (!row || row.builtin) return
  await db.generationPresets.delete(id)
}

export function withNormalizedKnobs(settings: GenerationSettings): GenerationSettings {
  return { ...settings, ...normalizeKnobs(settings) }
}
