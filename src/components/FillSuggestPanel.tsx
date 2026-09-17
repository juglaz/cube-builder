import { useMemo, useState } from 'react'
import { FieldTip } from './FieldTip'
import { useCardHover } from './CardHoverPreview'
import { addCardsToCube } from '../lib/repo'
import { suggestFillCards } from '../lib/runGeneration'
import type { GenerationSettings, LibraryCard, Theme } from '../types'

const BATCH = 5

type Props = {
  cubeId: string
  targetSize: number
  currentSize: number
  lockedIds: string[]
  settings: GenerationSettings
  themes: Theme[]
}

export function FillSuggestPanel({
  cubeId,
  targetSize,
  currentSize,
  lockedIds,
  settings,
  themes,
}: Props) {
  const open = Math.max(0, targetSize - currentSize)
  const { hoverProps, preview } = useCardHover()
  const [queue, setQueue] = useState<LibraryCard[]>([])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const batch = useMemo(() => queue.slice(0, BATCH), [queue])
  const batchIds = useMemo(() => new Set(batch.map((card) => card.oracleId)), [batch])

  async function loadQueue(extraSkip: string[]) {
    if (open <= 0) {
      setQueue([])
      return
    }
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const skip = [...new Set([...skipped, ...extraSkip])]
      const next = await suggestFillCards(settings, lockedIds, skip, themes, setProgress)
      const inCube = new Set(lockedIds)
      setQueue(next.filter((card) => !inCube.has(card.oracleId)))
      setPicked(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fill suggestions failed')
      setQueue([])
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function addSelected() {
    const ids = [...picked].filter((id) => batchIds.has(id)).slice(0, open)
    if (ids.length === 0) return
    await addCardsToCube(cubeId, ids)
    setSkipped((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
    setQueue((prev) => prev.filter((card) => !ids.includes(card.oracleId)))
    setPicked(new Set())
  }

  function nextFive() {
    const skipNow = batch.map((card) => card.oracleId)
    setSkipped((prev) => new Set([...prev, ...skipNow]))
    const rest = queue.filter((card) => !skipNow.includes(card.oracleId))
    if (rest.length > 0) {
      setQueue(rest)
      setPicked(new Set())
      return
    }
    void loadQueue(skipNow)
  }

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      {preview}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Fill suggestions"
            tip="Ranks leftover cards by Cube Cobra overlap with this list (and seed themes). Shows five at a time. Pick any, skip the batch for the next five, or add up to the remaining open slots."
          />
        </h3>
        <p className="text-sm text-stone-300">
          <span className="text-amber-50">{open}</span> open slot{open === 1 ? '' : 's'} · {currentSize} / {targetSize}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || open <= 0}
          onClick={() => void loadQueue([])}
          className="rounded-full bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-50"
        >
          {busy ? 'Solving…' : queue.length > 0 ? 'Refresh suggestions' : 'Suggest 5'}
        </button>
        <button
          type="button"
          disabled={busy || picked.size === 0 || open <= 0}
          onClick={() => void addSelected()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-stone-200 disabled:opacity-50"
        >
          Add selected ({picked.size})
        </button>
        <button
          type="button"
          disabled={busy || batch.length === 0 || open <= 0}
          onClick={() => nextFive()}
          className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-stone-200 disabled:opacity-50"
        >
          Next 5
        </button>
      </div>
      {progress && <p className="text-sm text-amber-100">{progress}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {open <= 0 && <p className="text-sm text-stone-400">This cube is at its target size.</p>}
      {batch.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {batch.map((card) => {
            const on = picked.has(card.oracleId)
            return (
              <button
                key={card.oracleId}
                type="button"
                onClick={() => toggle(card.oracleId)}
                {...hoverProps(card)}
                className={`overflow-hidden rounded-lg border text-left ${
                  on ? 'border-amber-200 ring-1 ring-amber-200/40' : 'border-white/10'
                }`}
              >
                {card.imageNormal ? (
                  <img
                    src={card.imageNormal}
                    alt=""
                    draggable={false}
                    className="pointer-events-none aspect-[488/680] w-full object-cover"
                  />
                ) : (
                  <span className="block p-2 text-xs">{card.name}</span>
                )}
                <span className="block truncate px-2 py-1 text-xs text-amber-50">{card.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
