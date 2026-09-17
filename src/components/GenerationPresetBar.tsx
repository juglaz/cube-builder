import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FieldTip } from './FieldTip'
import { db } from '../db'
import {
  BUILTIN_PRESETS,
  deleteCustomPreset,
  ensureBuiltinPresets,
  matchingPresetId,
  saveCustomPreset,
} from '../lib/generationPresets'
import type { GenerationKnobs } from '../types'

export function GenerationPresetBar({
  knobs,
  disabled,
  onApply,
}: {
  knobs: GenerationKnobs
  disabled?: boolean
  onApply: (knobs: GenerationKnobs) => void
}) {
  const livePresets = useLiveQuery(() => db.generationPresets.toArray(), [])
  const presets = livePresets && livePresets.length > 0 ? livePresets : BUILTIN_PRESETS
  const [saveName, setSaveName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void ensureBuiltinPresets()
  }, [])

  const ordered = useMemo(() => {
    const builtins = presets.filter((p) => p.builtin)
    const custom = presets
      .filter((p) => !p.builtin)
      .sort((a, b) => a.name.localeCompare(b.name))
    const builtinOrder = [
      'kitchen',
      'synergy',
      'balanced',
      'unpowered',
      'high-octane',
      'powered',
    ]
    builtins.sort((a, b) => builtinOrder.indexOf(a.id) - builtinOrder.indexOf(b.id))
    return [...builtins, ...custom]
  }, [presets])

  const selectedId = matchingPresetId(knobs, ordered)
  const selected = ordered.find((p) => p.id === selectedId)

  async function onSelect(id: string) {
    if (id === 'custom') return
    const preset = ordered.find((p) => p.id === id)
    if (preset) onApply({ ...preset.knobs })
  }

  async function onSave() {
    setError(null)
    const name = saveName.trim()
    if (!name) {
      setError('Name the preset before saving.')
      return
    }
    try {
      const preset = await saveCustomPreset(name, knobs)
      setSaveName('')
      onApply({ ...preset.knobs })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that preset.')
    }
  }

  async function onDelete() {
    if (!selected || selected.builtin) return
    await deleteCustomPreset(selected.id)
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-sm">
          <FieldTip
            label="Generation preset"
            tip="Applies Elo band, size, overlap, as-fan, land quota, and color tightness together. Built-ins stay in place; save your own mix when a cube style clicks."
          />
          <select
            value={selectedId}
            disabled={disabled}
            onChange={(e) => void onSelect(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            {selectedId === 'custom' && <option value="custom">Custom</option>}
            {ordered.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.builtin ? preset.name : `${preset.name} (saved)`}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[12rem] flex-1 text-sm">
          Save current mix
          <input
            value={saveName}
            disabled={disabled}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Preset name"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void onSave()}
          className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-50"
        >
          Save preset
        </button>
        {selected && !selected.builtin && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void onDelete()}
            className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-50"
          >
            Delete saved
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <PresetSummary knobs={selectedId === 'custom' ? knobs : selected?.knobs ?? knobs} />
    </section>
  )
}

function PresetSummary({ knobs }: { knobs: GenerationKnobs }) {
  return (
    <p className="text-sm text-stone-400">
      {knobs.targetSize} cards · Elo {knobs.eloMin}–{knobs.eloMax}
      {knobs.eloExemptLands ? ' (lands exempt)' : ''} · overlap {knobs.overlapBonus} · as-fan{' '}
      {knobs.themeAsFanTarget} · lands {Math.round(knobs.landQuota * 100)}% · color {knobs.colorTightness}
    </p>
  )
}
