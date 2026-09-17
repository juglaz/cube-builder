import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db'
import {
  creatureTypesFromCard,
  displayCreatureType,
  isRedundantTypalTag,
  typeThemeId,
} from '../lib/creatureTypes'
import { catalogTagsForOracleIds, themeMatchesCardIdentity } from '../lib/tagger'
import type { LibraryCard, Synergy, Theme } from '../types'
import { useCardHover } from './CardHoverPreview'

type SeedTag = {
  theme: Theme
  synergy: Synergy
}

type SeedGroup = {
  seed: LibraryCard
  tags: SeedTag[]
}

const VISIBLE_CAP = 12

type Props = {
  seeds: LibraryCard[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onRemoveSeed?: (oracleId: string) => void
  disabled?: boolean
  taggerReady: boolean
}

export function SeedThemePicker({
  seeds,
  selectedIds,
  onChange,
  onRemoveSeed,
  disabled,
  taggerReady,
}: Props) {
  const [groups, setGroups] = useState<SeedGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const { hoverProps, preview } = useCardHover()
  const selectedRef = useRef(selectedIds)
  const onChangeRef = useRef(onChange)
  const prevSeedIds = useRef(new Set<string>())
  const prevTaggerReady = useRef(taggerReady)

  useEffect(() => {
    selectedRef.current = selectedIds
    onChangeRef.current = onChange
  })

  useEffect(() => {
    let cancelled = false

    async function sync() {
      if (seeds.length === 0) {
        setGroups([])
        setLoading(false)
        prevSeedIds.current = new Set()
        if (selectedRef.current.length > 0) onChangeRef.current([])
        return
      }

      const seedIds = seeds.map((s) => s.oracleId)
      const typesBySeed = new Map(seeds.map((s) => [s.oracleId, creatureTypesFromCard(s)]))
      const typeIds = new Set(
        [...typesBySeed.values()].flat().map((typeName) => typeThemeId(typeName)),
      )

      let tagGroups: SeedGroup[] = seeds.map((seed) => ({ seed, tags: [] }))
      if (taggerReady) {
        setLoading(true)
        const rows = await catalogTagsForOracleIds(seedIds)
        if (cancelled) return
        const themeIds = [...new Set(rows.map((r) => r.themeId))]
        const themeRows = (await db.themes.bulkGet(themeIds)).filter((t): t is Theme => Boolean(t))
        if (cancelled) return
        const themeMap = new Map(themeRows.map((t) => [t.id, t]))
        tagGroups = seeds.map((seed) => {
          const tags: SeedTag[] = []
          const seen = new Set<string>()
          const types = typesBySeed.get(seed.oracleId) ?? []
          for (const row of rows) {
            if (row.oracleId !== seed.oracleId) continue
            const theme = themeMap.get(row.themeId)
            if (!theme || seen.has(theme.id) || isRedundantTypalTag(theme, types)) continue
            seen.add(theme.id)
            tags.push({ theme, synergy: row.synergy })
          }
          tags.sort((a, b) => b.synergy - a.synergy || a.theme.name.localeCompare(b.theme.name))
          return { seed, tags }
        })
        setGroups(tagGroups)
      } else {
        setGroups([])
      }

      const available = new Set([
        ...typeIds,
        ...tagGroups.flatMap((g) => g.tags.map((t) => t.theme.id)),
      ])
      const prev = prevSeedIds.current
      const added = seeds.filter((s) => !prev.has(s.oracleId))
      const taggerJustReady = taggerReady && !prevTaggerReady.current
      const restoring = prev.size === 0 && selectedRef.current.length > 0
      prevSeedIds.current = new Set(seedIds)
      prevTaggerReady.current = taggerReady

      const pruned = selectedRef.current.filter((id) => available.has(id))
      const auto: string[] = []
      if (!restoring) {
        for (const seed of added) {
          for (const typeName of typesBySeed.get(seed.oracleId) ?? []) auto.push(typeThemeId(typeName))
        }
        const identitySeeds = taggerJustReady ? seeds : added
        for (const seed of identitySeeds) {
          const group = tagGroups.find((g) => g.seed.oracleId === seed.oracleId)
          for (const tag of group?.tags ?? []) {
            if (themeMatchesCardIdentity(tag.theme, seed)) auto.push(tag.theme.id)
          }
        }
      }
      const next = [...new Set([...pruned, ...auto])]
      if (next.join('|') !== selectedRef.current.join('|')) onChangeRef.current(next)
      if (!cancelled) setLoading(false)
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [seeds, taggerReady])

  function toggle(id: string) {
    if (disabled) return
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id))
    else onChange([...selectedIds, id])
  }

  if (seeds.length === 0) return null

  const tagsBySeed = new Map(groups.map((g) => [g.seed.oracleId, g.tags]))

  return (
    <div className="space-y-3">
      {preview}
      {!taggerReady && (
        <p className="text-sm text-amber-100/90">
          Download Tagger on{' '}
          <Link to="/themes" className="underline">
            Themes / Tagger
          </Link>{' '}
          to also favor oracle tags from these cards. Creature types still work from the type line.
        </p>
      )}
      {taggerReady && loading && groups.length === 0 && (
        <p className="text-xs text-stone-500">Reading Tagger tags on these cards…</p>
      )}
      {seeds.map((seed) => {
        const types = creatureTypesFromCard(seed)
        const tags = tagsBySeed.get(seed.oracleId) ?? []
        const extra = tags.length - VISIBLE_CAP
        const open = expanded.has(seed.oracleId)
        const shown = open || extra <= 0 ? tags : tags.slice(0, VISIBLE_CAP)
        return (
          <div key={seed.oracleId} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center gap-3">
              {seed.imageNormal ? (
                <img
                  src={seed.imageNormal}
                  alt=""
                  className="h-12 w-9 rounded object-cover"
                  {...hoverProps(seed)}
                />
              ) : (
                <span className="h-12 w-9 rounded bg-white/10" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-amber-50">{seed.name}</p>
                <p className="truncate text-xs text-stone-500">{seed.typeLine}</p>
              </div>
              {onRemoveSeed && (
                <button
                  type="button"
                  disabled={disabled}
                  title="Remove this seed"
                  onClick={() => onRemoveSeed(seed.oracleId)}
                  className="rounded-full px-2 py-1 text-sm text-stone-400 hover:bg-white/10 hover:text-amber-50 disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </div>
            {types.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {types.map((typeName) => {
                  const id = typeThemeId(typeName)
                  const on = selectedIds.includes(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      title={
                        on
                          ? `Stop favoring ${displayCreatureType(typeName)}`
                          : `Favor ${displayCreatureType(typeName)} creature type in generation`
                      }
                      onClick={() => toggle(id)}
                      className={
                        on
                          ? 'rounded-full bg-amber-200/30 px-2.5 py-1 text-xs text-amber-50 ring-1 ring-amber-200/50 disabled:opacity-50'
                          : 'rounded-full bg-white/8 px-2.5 py-1 text-xs text-stone-300 ring-1 ring-white/10 hover:bg-white/12 disabled:opacity-50'
                      }
                    >
                      {on ? '✓ ' : ''}
                      {displayCreatureType(typeName)}
                      <span className="ml-1 text-[10px] text-stone-400">type</span>
                    </button>
                  )
                })}
              </div>
            )}
            {taggerReady && tags.length === 0 && !loading && types.length === 0 ? (
              <p className="text-xs text-stone-500">No Tagger tags or creature types on this card.</p>
            ) : tags.length === 0 ? null : (
              <div className="flex flex-wrap gap-1.5">
                {shown.map((tag) => {
                  const on = selectedIds.includes(tag.theme.id)
                  return (
                    <button
                      key={tag.theme.id}
                      type="button"
                      disabled={disabled}
                      title={
                        tag.theme.description ||
                        (on ? 'Click to stop favoring this tag' : 'Click to favor this tag in generation')
                      }
                      onClick={() => toggle(tag.theme.id)}
                      className={
                        on
                          ? 'rounded-full bg-amber-200/25 px-2.5 py-1 text-xs text-amber-50 ring-1 ring-amber-200/40 disabled:opacity-50'
                          : 'rounded-full bg-white/8 px-2.5 py-1 text-xs text-stone-300 hover:bg-white/12 disabled:opacity-50'
                      }
                    >
                      {on ? '✓ ' : ''}
                      {tag.theme.name}
                    </button>
                  )
                })}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        if (next.has(seed.oracleId)) next.delete(seed.oracleId)
                        else next.add(seed.oracleId)
                        return next
                      })
                    }}
                    className="rounded-full px-2.5 py-1 text-xs text-stone-400 hover:text-amber-100"
                  >
                    {open ? 'Show fewer' : `+${extra} more`}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-stone-500">
        {selectedIds.length} lane{selectedIds.length === 1 ? '' : 's'} favored. Creature types start
        selected; click a chip to include or drop it.
      </p>
    </div>
  )
}
