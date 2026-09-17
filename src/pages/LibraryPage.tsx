import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { CardPanel } from '../components/CardPanel'
import { FilterBar } from '../components/FilterBar'
import { useCatalogQuery, useLiveData, useMergedTags, useOracleCard } from '../hooks/useLiveData'
import { CATALOG_DISPLAY_LIMIT } from '../lib/catalogCards'
import { emptyFilter } from '../lib/cardMeta'
import { addCardsToCube, setCardTheme, removeCardTheme } from '../lib/repo'
import type { Synergy } from '../types'

export function LibraryPage() {
  const { catalog, themes, cubes, cardCatalogMeta } = useLiveData()
  const [filter, setFilter] = useState(emptyFilter)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { cards, total, catalogSize, searching } = useCatalogQuery(filter)
  const selected = useOracleCard(selectedId)
  const tagIds = useMemo(
    () => [...cards.map((card) => card.oracleId), ...(selectedId ? [selectedId] : [])],
    [cards, selectedId],
  )
  const tags = useMergedTags(tagIds)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl text-amber-50">Library</h2>
        <p className="text-stone-400">
          {catalogSize > 0
            ? `${catalogSize.toLocaleString()} unique cards from the Oracle catalog.`
            : 'Oracle catalog not downloaded yet. Generate and this page use the same local file.'}
        </p>
        {!cardCatalogMeta && (
          <p className="mt-3 rounded-xl border border-amber-200/20 bg-amber-200/8 px-3 py-2 text-sm">
            Start on{' '}
            <Link to="/themes" className="text-amber-100 underline">
              Themes
            </Link>{' '}
            in the top bar and download Oracle cards (and Tagger tags).
          </p>
        )}
      </div>

      <FilterBar filter={filter} themes={themes} onChange={setFilter} />
      <p className="text-sm text-stone-400">
        {searching
          ? 'Searching…'
          : total > cards.length
            ? `Showing ${cards.length} of ${total.toLocaleString()} matches (cap ${CATALOG_DISPLAY_LIMIT}).`
            : `${total.toLocaleString()} shown`}
      </p>

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
          onSetTheme={(themeId, synergy: Synergy) => {
            if (selected) void setCardTheme(selected.oracleId, themeId, synergy, 'overwrite')
          }}
          onRemoveTheme={(themeId) => {
            if (selected) void removeCardTheme(selected.oracleId, themeId)
          }}
          onAddToCube={(cubeId) => {
            if (selected) void addCardsToCube(cubeId, [selected.oracleId])
          }}
        />
      </div>
    </div>
  )
}
