import { useEffect, useState } from 'react'
import { useCardHover } from './CardHoverPreview'
import { searchOracleCards } from '../lib/generatePool'
import type { LibraryCard } from '../types'

type Props = {
  selected: LibraryCard[]
  onChange: (cards: LibraryCard[]) => void
  disabled?: boolean
  hideSelected?: boolean
}

export function SeedCardSelect({ selected, onChange, disabled, hideSelected }: Props) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<LibraryCard[]>([])
  const [searching, setSearching] = useState(false)
  const { hoverProps, preview, clearHover } = useCardHover()

  const canSearch = query.trim().length >= 2

  useEffect(() => {
    if (!canSearch) return
    let cancelled = false
    const handle = window.setTimeout(() => {
      void searchOracleCards(
        query.trim(),
        selected.map((c) => c.oracleId),
        20,
      ).then((rows) => {
        if (!cancelled) {
          setMatches(rows)
          setSearching(false)
        }
      })
    }, 160)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [canSearch, query, selected])

  function add(card: LibraryCard) {
    if (selected.some((c) => c.oracleId === card.oracleId)) return
    clearHover()
    onChange([...selected, card])
    setQuery('')
    setMatches([])
  }

  function remove(oracleId: string) {
    onChange(selected.filter((c) => c.oracleId !== oracleId))
  }

  return (
    <div className="space-y-3">
      {preview}
      {!hideSelected && selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((card) => (
            <button
              key={card.oracleId}
              type="button"
              onClick={() => remove(card.oracleId)}
              className="flex items-center gap-2 rounded-full bg-amber-200/20 py-1 pr-3 pl-1 text-sm text-amber-50"
              title="Click to remove"
              {...hoverProps(card)}
            >
              {card.imageNormal ? (
                <img src={card.imageNormal} alt="" className="h-8 w-6 rounded object-cover" />
              ) : null}
              {card.name} ×
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => {
          const next = e.target.value
          setQuery(next)
          setSearching(next.trim().length >= 2)
        }}
        disabled={disabled}
        placeholder="Search names, types, or rules text"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-amber-200/40 disabled:opacity-50"
      />
      {canSearch && searching && <p className="text-xs text-stone-500">Searching…</p>}
      {canSearch && matches.length > 0 && (
        <ul className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/40">
          {matches.map((card) => (
            <li key={card.oracleId}>
              <button
                type="button"
                onClick={() => add(card)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-white/8"
                {...hoverProps(card)}
              >
                {card.imageNormal ? (
                  <img src={card.imageNormal} alt="" className="h-12 w-9 rounded object-cover" />
                ) : (
                  <span className="h-12 w-9 rounded bg-white/10" />
                )}
                <span className="flex flex-col">
                  <span>{card.name}</span>
                  <span className="text-xs text-stone-500">
                    {card.manaCost || '—'} · {card.typeLine}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canSearch && !searching && matches.length === 0 && (
        <p className="text-sm text-stone-500">No matching cards in the local Oracle catalog.</p>
      )}
      <p className="text-xs text-stone-500">
        {selected.length} seed{selected.length === 1 ? '' : 's'}. Cards synergistic with several seeds
        are preferred as glue. Search matches names and oracle text.
      </p>
    </div>
  )
}
