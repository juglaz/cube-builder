import { useEffect, useMemo, useState } from 'react'
import { useLiveData } from '../hooks/useLiveData'
import { loadOracleCatalog } from '../lib/catalogCards'
import { resolvePastedCardList } from '../lib/importList'
import { parseCardList } from '../lib/parseList'
import { ThemeMultiSelect } from '../components/ThemeMultiSelect'
import { addCardsToCube, applyThemeToCards } from '../lib/repo'
import type { Synergy } from '../types'

export function ImportPage() {
  const { themes, cubes, cardCatalogMeta } = useLiveData()
  const [text, setText] = useState('')
  const [themeIds, setThemeIds] = useState<string[]>([])
  const [synergy, setSynergy] = useState<Synergy>(2)
  const [mode, setMode] = useState<'max' | 'overwrite'>('max')
  const [cubeId, setCubeId] = useState('')
  const [addToCube, setAddToCube] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [catalogNames, setCatalogNames] = useState<Set<string>>(new Set())

  const parsed = useMemo(() => parseCardList(text), [text])

  useEffect(() => {
    let cancelled = false
    void loadOracleCatalog().then((rows) => {
      if (!cancelled) setCatalogNames(new Set(rows.map((card) => card.name.toLowerCase())))
    })
    return () => {
      cancelled = true
    }
  }, [cardCatalogMeta?.syncedAt])

  async function importList() {
    setBusy(true)
    setError(null)
    setResult(null)
    setUnmatched([])
    try {
      const resolved = await resolvePastedCardList(text)
      const cards = resolved.cards
      for (const extraId of themeIds) {
        await applyThemeToCards(
          cards.map((c) => c.oracleId),
          extraId,
          synergy,
          mode,
        )
      }
      if (addToCube && cubeId) {
        await addCardsToCube(
          cubeId,
          cards.map((c) => c.oracleId),
        )
      }
      setUnmatched(resolved.unmatched)
      setResult(
        addToCube && cubeId
          ? `Resolved ${cards.length} cards from the catalog and added them to the cube.`
          : `Resolved ${cards.length} cards from the catalog${themeIds.length ? ' and applied extra themes' : ''}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-amber-50">Bulk paste</h2>
        <p className="text-stone-400">
          Paste an Arena, MTGO, or plain list. Names resolve against the local Oracle catalog first,
          then Scryfall for anything missing. Optionally attach extra themes and add the list to a
          cube.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'1 Lightning Bolt\n1 Young Pyromancer (M14)\nGuttersnipe'}
        className="min-h-56 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm"
      />
      <p className="text-sm text-stone-400">
        {parsed.entries.length} unique-ish lines parsed
        {parsed.skipped.length ? ` · ${parsed.skipped.length} skipped` : ''}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="text-sm md:col-span-2">
          Extra themes
          <div className="mt-1">
            <ThemeMultiSelect
              themes={themes}
              selectedIds={themeIds}
              onChange={setThemeIds}
              placeholder="Optional — search and add extra themes on top of Tagger tags"
            />
          </div>
        </div>
        <label className="block text-sm">
          Default synergy
          <select
            value={synergy}
            onChange={(e) => setSynergy(Number(e.target.value) as Synergy)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            <option value={1}>1 — weak</option>
            <option value={2}>2 — median</option>
            <option value={3}>3 — strong</option>
            <option value={4}>4 — very strong</option>
          </select>
        </label>
        <label className="block text-sm">
          If theme already exists
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'max' | 'overwrite')}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            <option value="max">Keep the higher synergy</option>
            <option value="overwrite">Overwrite with this value</option>
          </select>
        </label>
        <label className="block text-sm">
          Also add to cube
          <div className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={addToCube}
              onChange={(e) => setAddToCube(e.target.checked)}
            />
            <select
              value={cubeId}
              onChange={(e) => setCubeId(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
            >
              <option value="">Choose cube</option>
              {cubes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {parsed.entries.length > 0 && (
        <details className="rounded-2xl border border-white/10 bg-black/15 p-4 text-sm">
          <summary className="cursor-pointer text-amber-100">Preview</summary>
          <ul className="mt-3 columns-1 sm:columns-2">
            {parsed.entries.map((entry) => (
              <li key={entry.raw}>
                {entry.name}
                {entry.set ? ` (${entry.set})` : ''}
                {catalogNames.has(entry.name.toLowerCase()) ? ' · in catalog' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void importList()}
        className="rounded-xl bg-amber-200/20 px-4 py-2 text-amber-50 disabled:opacity-50"
      >
        {busy ? 'Resolving…' : 'Import list'}
      </button>
      {error && <p className="text-red-300">{error}</p>}
      {result && <p className="text-emerald-200">{result}</p>}
      {unmatched.length > 0 && (
        <div>
          <h3 className="text-sm text-amber-100">Unmatched names</h3>
          <ul className="text-sm text-red-200">
            {unmatched.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
