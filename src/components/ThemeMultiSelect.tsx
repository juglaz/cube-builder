import { useMemo, useState } from 'react'
import { sortThemesByCardCount } from '../lib/cardMeta'
import type { Theme } from '../types'

type Props = {
  themes: Theme[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  preserveOrder?: boolean
  cardCounts?: Map<string, number>
}

export function ThemeMultiSelect({
  themes,
  selectedIds,
  onChange,
  placeholder = 'Search tags and add them',
  preserveOrder = false,
  cardCounts,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = preserveOrder
    ? selectedIds.map((id) => themes.find((t) => t.id === id)).filter((t): t is Theme => Boolean(t))
    : sortThemesByCardCount(
        selectedIds.map((id) => themes.find((t) => t.id === id)).filter((t): t is Theme => Boolean(t)),
        cardCounts,
      )

  const matches = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    return sortThemesByCardCount(
      themes.filter((theme) => {
        if (selectedIds.includes(theme.id)) return false
        if (cardCounts && (cardCounts.get(theme.id) ?? 0) === 0) return false
        const hay = `${theme.name} ${theme.slug ?? ''} ${(theme.aliases ?? []).join(' ')}`.toLowerCase()
        return q.length === 0 || hay.includes(q)
      }),
      cardCounts,
    ).slice(0, 30)
  }, [cardCounts, open, query, selectedIds, themes])

  function add(id: string) {
    if (selectedIds.includes(id)) return
    onChange([...selectedIds, id])
    setQuery('')
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  return (
    <div
      className="space-y-3"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => remove(theme.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onChange([theme.id])
              }}
              className="rounded-full bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50"
              title={theme.description || 'Click to remove. Right-click to keep only this.'}
            >
              {theme.name} ×
            </button>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none focus:border-amber-200/40"
      />
      {matches.length > 0 && (
        <ul className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40">
          {matches.map((theme) => (
            <li key={theme.id}>
              <button
                type="button"
                onClick={() => add(theme.id)}
                title={theme.description || undefined}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-white/8"
              >
                <span>{theme.name}</span>
                <span className="text-xs text-stone-500">
                  {theme.slug}
                  {cardCounts
                    ? ` · ${(cardCounts.get(theme.id) ?? 0).toLocaleString()} cards`
                    : theme.taggingCount
                      ? ` · ${theme.taggingCount.toLocaleString()} cards`
                      : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <p className="text-sm text-stone-500">No matching tags.</p>
      )}
      <p className="text-xs text-stone-500">
        {selected.length} selected. Search and click to add more; click a chip to remove it.
      </p>
    </div>
  )
}
