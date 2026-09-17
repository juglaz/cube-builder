import { useMemo, useState } from 'react'
import { FieldTip } from './FieldTip'
import { resolvePastedCardList } from '../lib/importList'
import { parseCardList } from '../lib/parseList'
import { addCardsToCube, replaceCubeCards } from '../lib/repo'

type Props = {
  cubeId: string
  existingIds: string[]
  onClose: () => void
}

export function PasteListPanel({ cubeId, existingIds, onClose }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [clearExisting, setClearExisting] = useState(false)
  const parsed = useMemo(() => parseCardList(text), [text])
  const inCube = useMemo(() => new Set(existingIds), [existingIds])

  async function addPasted() {
    setBusy(true)
    setError(null)
    setResult(null)
    setUnmatched([])
    try {
      const resolved = await resolvePastedCardList(text)
      setUnmatched(resolved.unmatched)
      if (resolved.cards.length === 0 && resolved.unmatched.length === 0) {
        setError('No card names found in that paste.')
        return
      }
      const ids = resolved.cards.map((card) => card.oracleId)
      if (clearExisting) {
        if (ids.length === 0) {
          setError('No names resolved; the cube was left unchanged.')
          return
        }
        await replaceCubeCards(cubeId, ids)
        const bits = [`Replaced list with ${ids.length}`]
        if (resolved.unmatched.length > 0) bits.push(`${resolved.unmatched.length} unmatched`)
        setResult(bits.join(' · '))
        return
      }
      const fresh = ids.filter((id) => !inCube.has(id))
      const already = ids.length - fresh.length
      if (fresh.length > 0) await addCardsToCube(cubeId, fresh)
      const bits = [`Added ${fresh.length}`]
      if (already > 0) bits.push(`${already} already in the cube`)
      if (resolved.unmatched.length > 0) bits.push(`${resolved.unmatched.length} unmatched`)
      setResult(bits.join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paste failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Paste list"
            tip="Arena, MTGO, Cube Cobra, or one name per line. Resolves against the local catalog first, then Scryfall. Cards already in this cube are skipped unless you clear the list first."
          />
        </h3>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-xs text-stone-300">
          Close
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'1 Lightning Bolt\n1 Young Pyromancer (M14)\nGuttersnipe'}
        className="min-h-36 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-sm"
      />
      <p className="text-sm text-stone-400">
        {parsed.entries.length} {parsed.entries.length === 1 ? 'name' : 'names'} parsed
        {parsed.skipped.length ? ` · ${parsed.skipped.length} skipped` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-stone-300">
          <input
            type="checkbox"
            checked={clearExisting}
            onChange={(e) => setClearExisting(e.target.checked)}
          />
          Clear existing cards
        </label>
        <button
          type="button"
          disabled={busy || parsed.entries.length === 0}
          onClick={() => void addPasted()}
          className="rounded-full bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-50"
        >
          {busy ? 'Resolving…' : clearExisting ? 'Replace cube' : 'Add to this cube'}
        </button>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {result && <p className="text-sm text-emerald-200">{result}</p>}
      {unmatched.length > 0 && (
        <div>
          <h4 className="text-sm text-amber-100">Unmatched names</h4>
          <ul className="text-sm text-rose-200">
            {unmatched.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
