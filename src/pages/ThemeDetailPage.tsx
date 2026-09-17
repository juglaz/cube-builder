import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { CardPanel } from '../components/CardPanel'
import { FilterBar } from '../components/FilterBar'
import { useCatalogQuery, useLiveData, useMergedTags, useOracleCard } from '../hooks/useLiveData'
import { CATALOG_DISPLAY_LIMIT } from '../lib/catalogCards'
import { emptyFilter } from '../lib/cardMeta'
import { addCardsToCube, removeCardTheme, setCardTheme } from '../lib/repo'
import type { Synergy } from '../types'

export function ThemeDetailPage() {
  const { themeId } = useParams()
  const { catalog, themes, cubes } = useLiveData()
  const theme = catalog.find((t) => t.id === themeId)
  const [filter, setFilter] = useState(() => ({
    ...emptyFilter(),
    themeIds: themeId ? [themeId] : [],
  }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const lockedFilter = { ...filter, themeIds: themeId ? [themeId] : filter.themeIds }
  const { cards, total, searching } = useCatalogQuery(lockedFilter)
  const selected = useOracleCard(selectedId)
  const tagIds = useMemo(
    () => [...cards.map((card) => card.oracleId), ...(selectedId ? [selectedId] : [])],
    [cards, selectedId],
  )
  const tags = useMergedTags(tagIds)

  if (!theme) {
    return (
      <p>
        Theme not found. <Link to="/themes">Back</Link>
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/themes" className="text-sm text-stone-400">
          Themes
        </Link>
        <h2 className="text-2xl" style={{ color: theme.accent }}>
          {theme.name}
        </h2>
        <p className="text-stone-400">{theme.description}</p>
        <p className="text-sm text-stone-500">
          {theme.taggingCount.toLocaleString()} cards in Tagger
          {searching
            ? ' · searching…'
            : total > cards.length
              ? ` · showing ${cards.length} of ${total.toLocaleString()} (cap ${CATALOG_DISPLAY_LIMIT})`
              : ` · ${total.toLocaleString()} shown`}
        </p>
      </div>
      <FilterBar
        filter={filter}
        themes={themes}
        onChange={(next) => setFilter({ ...next, themeIds: [theme.id] })}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <CardGrid
          cards={cards}
          themes={themes}
          tags={tags}
          selectedId={selectedId}
          onSelect={(card) => setSelectedId(card.oracleId)}
        />
        <CardPanel
          card={selected}
          themes={themes}
          catalog={catalog}
          tags={tags}
          cubes={cubes}
          onSetTheme={(id, synergy: Synergy) => {
            if (selected) void setCardTheme(selected.oracleId, id, synergy, 'overwrite')
          }}
          onRemoveTheme={(id) => {
            if (selected) void removeCardTheme(selected.oracleId, id)
          }}
          onAddToCube={(cubeId) => {
            if (selected) void addCardsToCube(cubeId, [selected.oracleId])
          }}
        />
      </div>
    </div>
  )
}
