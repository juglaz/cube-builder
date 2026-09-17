import { useMemo, useState, type ReactNode } from 'react'
import { libraryThemeCounts, sortThemesByCardCount } from '../lib/cardMeta'
import { CMC_BUCKETS, COLOR_LETTERS, TYPE_FILTERS, type CardFilter, type CardTheme, type Theme } from '../types'

const THEME_STEP = 5

type Props = {
  filter: CardFilter
  themes: Theme[]
  tags?: CardTheme[]
  onChange: (next: CardFilter) => void
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterBar({ filter, themes, tags, onChange }: Props) {
  const [themeQuery, setThemeQuery] = useState('')
  const [themeVisible, setThemeVisible] = useState(THEME_STEP)
  const counts = useMemo(() => (tags ? libraryThemeCounts(tags) : undefined), [tags])

  const ranked = useMemo(() => {
    const q = themeQuery.trim().toLowerCase()
    const matched = q
      ? themes.filter(
          (theme) =>
            theme.name.toLowerCase().includes(q) || (theme.slug ?? '').toLowerCase().includes(q),
        )
      : themes
    return sortThemesByCardCount(matched, counts)
  }, [counts, themeQuery, themes])

  const windowed = ranked.slice(0, themeVisible)
  const shownIds = new Set(windowed.map((t) => t.id))
  const pinned = ranked.filter((theme) => filter.themeIds.includes(theme.id) && !shownIds.has(theme.id))
  const shownThemes = [...windowed, ...pinned]

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <input
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        placeholder="Search name, type, or rules text"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-stone-100 outline-none focus:border-amber-200/40"
      />
      <div className="flex flex-wrap gap-2">
        {COLOR_LETTERS.map((color) => (
          <Chip
            key={color}
            active={filter.colors.includes(color)}
            onClick={() => onChange({ ...filter, colors: toggle(filter.colors, color) })}
            onContextMenu={() => onChange({ ...filter, colors: [color] })}
          >
            {color}
          </Chip>
        ))}
        <Chip
          active={filter.colors.includes('C')}
          onClick={() => onChange({ ...filter, colors: toggle(filter.colors, 'C') })}
          onContextMenu={() => onChange({ ...filter, colors: ['C'] })}
        >
          C
        </Chip>
        <select
          value={filter.colorMode}
          onChange={(e) =>
            onChange({ ...filter, colorMode: e.target.value as CardFilter['colorMode'] })
          }
          className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-sm"
        >
          <option value="any">Any of selected</option>
          <option value="identity">Contains identity</option>
          <option value="exact">Exact identity</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((type) => (
          <Chip
            key={type}
            active={filter.types.includes(type)}
            onClick={() => onChange({ ...filter, types: toggle(filter.types, type) })}
            onContextMenu={() => onChange({ ...filter, types: [type] })}
          >
            {type}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {CMC_BUCKETS.map((bucket) => (
          <Chip
            key={bucket}
            active={filter.cmcBuckets.includes(bucket)}
            onClick={() => onChange({ ...filter, cmcBuckets: toggle(filter.cmcBuckets, bucket) })}
            onContextMenu={() => onChange({ ...filter, cmcBuckets: [bucket] })}
          >
            {bucket}
          </Chip>
        ))}
      </div>
      {themes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={themeQuery}
              onChange={(e) => {
                setThemeQuery(e.target.value)
                setThemeVisible(THEME_STEP)
              }}
              placeholder="Find theme / tag"
              className="rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-sm"
            />
            <label className="text-sm text-stone-400">
              Min synergy
              <select
                value={filter.minSynergy}
                onChange={(e) =>
                  onChange({ ...filter, minSynergy: Number(e.target.value) as CardFilter['minSynergy'] })
                }
                className="ml-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1"
              >
                <option value={0}>Any</option>
                <option value={1}>1+</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={4}>4</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shownThemes.map((theme) => (
              <Chip
                key={theme.id}
                active={filter.themeIds.includes(theme.id)}
                title={theme.description || 'Click to add/remove. Right-click to select only this.'}
                onClick={() => onChange({ ...filter, themeIds: toggle(filter.themeIds, theme.id) })}
                onContextMenu={() => onChange({ ...filter, themeIds: [theme.id] })}
              >
                {theme.name}
                {counts?.has(theme.id) ? ` ${counts.get(theme.id)}` : ''}
              </Chip>
            ))}
          </div>
          {ranked.length > THEME_STEP && (
            <div className="inline-flex items-center rounded-full bg-white/5">
              <ChevronButton
                label="Collapse to top 5"
                disabled={themeVisible <= THEME_STEP}
                onClick={() => setThemeVisible(THEME_STEP)}
              >
                <ChevronIcon kind="double-up" />
              </ChevronButton>
              <ChevronButton
                label="Show less"
                disabled={themeVisible <= THEME_STEP}
                onClick={() =>
                  setThemeVisible((n) => {
                    const next =
                      n >= ranked.length
                        ? Math.floor((ranked.length - 1) / THEME_STEP) * THEME_STEP
                        : n - THEME_STEP
                    return Math.max(THEME_STEP, next)
                  })
                }
              >
                <ChevronIcon kind="up" />
              </ChevronButton>
              <ChevronButton
                label="Show more"
                disabled={themeVisible >= ranked.length}
                onClick={() => setThemeVisible((n) => Math.min(ranked.length, n + THEME_STEP))}
              >
                <ChevronIcon kind="down" />
              </ChevronButton>
              <ChevronButton
                label="Show all"
                disabled={themeVisible >= ranked.length}
                onClick={() => setThemeVisible(ranked.length)}
              >
                <ChevronIcon kind="double-down" />
              </ChevronButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChevronButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-1.5 text-amber-100/80 hover:bg-white/10 disabled:cursor-default disabled:text-stone-500 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function ChevronIcon({ kind }: { kind: 'up' | 'down' | 'double-up' | 'double-down' }) {
  const up = kind === 'up' || kind === 'double-up'
  const single = up ? 'M6 15.5 12 9.5 18 15.5' : 'M6 8.5 12 14.5 18 8.5'
  const first = up ? 'M6 18 12 12 18 18' : 'M6 6 12 12 18 6'
  const second = up ? 'M6 13 12 7 18 13' : 'M6 11 12 17 18 11'
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {kind === 'up' || kind === 'down' ? (
        <path d={single} />
      ) : (
        <>
          <path d={first} />
          <path d={second} />
        </>
      )}
    </svg>
  )
}

function Chip({
  active,
  onClick,
  onContextMenu,
  title = 'Click to add/remove. Right-click to select only this.',
  children,
}: {
  active: boolean
  onClick: () => void
  onContextMenu: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu()
      }}
      className={`rounded-full px-3 py-1 text-sm ${
        active ? 'bg-amber-200/20 text-amber-100' : 'bg-white/5 text-stone-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}
