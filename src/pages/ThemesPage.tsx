import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadOracleCards, downloadOracleTags } from '../api/scryfall'
import {
  cardCatalogLabel,
  catalogUpdatedLabel,
  cobraCatalogLabel,
  cobraEloLabel,
  useLiveData,
} from '../hooks/useLiveData'
import { syncCobraCatalog, syncCobraEloCatalog } from '../lib/cobra'
import { createTheme, deleteTheme, setThemeHidden, updateTheme } from '../lib/repo'
import { backfillLibraryFromCatalog, parentLabel, replaceCatalog, replaceOracleCardCatalog } from '../lib/tagger'
import type { Theme } from '../types'

const ACCENTS = ['#c4a35a', '#4c7c9c', '#6b4c7c', '#9c4c4c', '#4c7c5a', '#8a6b4c']

export function ThemesPage() {
  const { catalog, tags, catalogMeta, cardCatalogMeta, cobraCatalogMeta, cobraEloMeta } = useLiveData()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'catalog' | 'hidden'>('catalog')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [accent, setAccent] = useState(ACCENTS[0]!)

  const tagger = catalog.filter((t) => t.source === 'tagger')
  const custom = catalog.filter((t) => t.source === 'custom')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tagger.filter((theme) => {
      if (view === 'hidden' && !theme.hidden) return false
      if (view === 'catalog' && theme.hidden) return false
      if (!q) return true
      const hay = `${theme.name} ${theme.slug ?? ''} ${theme.description} ${(theme.aliases ?? []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [query, tagger, view])

  async function runJob(job: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      await job()
      setProgress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Catalog sync failed')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  async function syncTagger() {
    setProgress('Downloading Tagger oracle tags (which cards have which tags)…')
    const { tags: oracleTags, updatedAt } = await downloadOracleTags()
    setProgress(`Writing ${oracleTags.length} tags into the local catalog…`)
    await replaceCatalog(oracleTags, updatedAt)
    setProgress('Writing tags into the local catalog…')
    await backfillLibraryFromCatalog()
  }

  async function syncOracle() {
    setProgress('Downloading Oracle card catalog (names, types, mana, image URLs)…')
    const { cards: oracleCards, updatedAt: cardsUpdated } = await downloadOracleCards()
    setProgress(`Writing ${oracleCards.length.toLocaleString()} unique cards locally…`)
    await replaceOracleCardCatalog(oracleCards, cardsUpdated)
  }

  async function syncCobra() {
    await syncCobraCatalog(setProgress)
  }

  async function syncElo() {
    await syncCobraEloCatalog(setProgress)
  }

  async function syncCatalog() {
    await syncTagger()
    await syncOracle()
    await syncCobra()
    await syncElo()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-amber-50">Themes</h2>
        <p className="text-stone-400">
          Three catalogs live on this machine: Tagger tags (theme membership), unique Oracle cards,
          Cube Cobra synergistic neighbors, and Cube Cobra draft Elo. Generate uses those local
          files — it does not call Scryfall per card.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">Local catalogs</h3>
            <p className="text-sm text-stone-400">
              Download each file into this browser. Library and Generate need Oracle cards. Generate
              also needs Cube Cobra neighbors, and Elo bands need the draft Elo file.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runJob(syncCatalog)}
            className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-50"
          >
            {busy ? 'Syncing…' : 'Download all'}
          </button>
        </div>

        <CatalogRow
          title="Tagger oracle tags"
          status={catalogUpdatedLabel(catalogMeta)}
          detail="Theme names and which cards have them."
          busy={busy}
          ready={Boolean(catalogMeta)}
          onDownload={() => void runJob(syncTagger)}
        />
        <CatalogRow
          title="Oracle cards"
          status={cardCatalogLabel(cardCatalogMeta)}
          detail="Names, types, mana, and images for Library search and seed crystals."
          busy={busy}
          ready={Boolean(cardCatalogMeta)}
          onDownload={() => void runJob(syncOracle)}
        />
        <CatalogRow
          title="Cube Cobra neighbors"
          status={cobraCatalogLabel(cobraCatalogMeta)}
          detail="Synergistic lists Seed Crystal uses to grow from your seeds (~12 MB parsed from a large dump)."
          busy={busy}
          ready={Boolean(cobraCatalogMeta)}
          onDownload={() => void runJob(syncCobra)}
        />
        <CatalogRow
          title="Cube Cobra Elo"
          status={cobraEloLabel(cobraEloMeta)}
          detail="Draft pick Elo for the Generate power band and histogram (~8 MB)."
          busy={busy}
          ready={Boolean(cobraEloMeta)}
          onDownload={() => void runJob(syncElo)}
        />

        {progress && <p className="text-sm text-amber-100">{progress}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
      </section>

      {tagger.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['catalog', 'Catalog'],
                ['hidden', 'Hidden'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  view === id ? 'bg-amber-200/20 text-amber-50' : 'bg-white/8'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tagger labels, slugs, aliases"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
          <p className="text-sm text-stone-400">{visible.length} tags</p>
          <div className="grid gap-3 md:grid-cols-2">
            {visible.slice(0, 200).map((theme) => (
              <CatalogCard
                key={theme.id}
                theme={theme}
                catalog={catalog}
              />
            ))}
          </div>
          {visible.length > 200 && (
            <p className="text-sm text-stone-500">Showing the first 200 matches. Narrow the search.</p>
          )}
        </section>
      )}

      <form
        className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void createTheme({ name: name.trim(), description, accent, source: 'custom', enabled: true })
          setName('')
          setDescription('')
        }}
      >
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">Custom theme</h3>
        <p className="text-sm text-stone-400">Optional extra lane that is not in Tagger.</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes"
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          rows={2}
        />
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setAccent(color)}
              className="h-8 w-8 rounded-full"
              style={{
                background: color,
                outline: accent === color ? '2px solid #fde68a' : undefined,
              }}
            />
          ))}
        </div>
        <button type="submit" className="rounded-xl bg-white/10 px-4 py-2">
          Add custom theme
        </button>
      </form>

      {custom.length > 0 && (
        <section className="grid gap-3 md:grid-cols-2">
          {custom.map((theme) => {
            const count = tags.filter((t) => t.themeId === theme.id).length
            return (
              <article key={theme.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg" style={{ color: theme.accent }}>
                      {theme.name}
                    </h3>
                    <p className="text-sm text-stone-400">{count} tagged cards</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete ${theme.name}?`)) void deleteTheme(theme.id)
                    }}
                    className="text-sm text-stone-500 hover:text-red-200"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  value={theme.description}
                  onChange={(e) => void updateTheme({ ...theme, description: e.target.value })}
                  className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                  rows={2}
                />
                <Link to={`/themes/${theme.id}`} className="inline-block rounded-xl bg-white/8 px-3 py-2 text-sm">
                  Explore cards
                </Link>
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}

function CatalogRow({
  title,
  status,
  detail,
  busy,
  ready,
  onDownload,
}: {
  title: string
  status: string
  detail: string
  busy: boolean
  ready: boolean
  onDownload: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <div>
        <h4 className="text-amber-50">{title}</h4>
        <p className="text-sm text-stone-400">{status}</p>
        <p className="text-xs text-stone-500">{detail}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onDownload}
        className="rounded-xl bg-amber-200/20 px-4 py-2 text-amber-50 disabled:opacity-50"
      >
        {busy ? 'Working…' : ready ? 'Refresh' : 'Download'}
      </button>
    </div>
  )
}

function CatalogCard({
  theme,
  catalog,
}: {
  theme: Theme
  catalog: Theme[]
}) {
  const parents = parentLabel(catalog, theme)
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg" style={{ color: theme.accent }}>
            {theme.name}
          </h3>
          <p className="text-xs text-stone-500">
            {theme.slug}
            {parents ? ` · under ${parents}` : ''}
          </p>
          <p className="text-sm text-stone-400">
            {theme.taggingCount.toLocaleString()} cards in Tagger
          </p>
        </div>
      </div>
      {theme.description && <p className="mb-3 text-sm text-stone-300">{theme.description}</p>}
      <div className="flex flex-wrap gap-2">
        <Link to={`/themes/${theme.id}`} className="rounded-xl bg-white/8 px-3 py-2 text-sm">
          Explore
        </Link>
        <button
          type="button"
          onClick={() => void setThemeHidden(theme.id, !theme.hidden)}
          className="rounded-xl bg-white/5 px-3 py-2 text-sm text-stone-400"
        >
          {theme.hidden ? 'Unhide' : 'Hide'}
        </button>
      </div>
    </article>
  )
}
