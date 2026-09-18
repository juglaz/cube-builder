import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { CardPanel } from '../components/CardPanel'
import { CubeInfoCard } from '../components/CubeInfoCard'
import { CubeListView } from '../components/CubeListView'
import { FieldTip } from '../components/FieldTip'
import { FilterBar } from '../components/FilterBar'
import { FillSuggestPanel } from '../components/FillSuggestPanel'
import { PasteListPanel } from '../components/PasteListPanel'
import { GroupingSelects } from '../components/GroupingSelects'
import { ThemeMultiSelect } from '../components/ThemeMultiSelect'
import { useCardsByOracleIds, useCatalogQuery, useEloForOracles, useLiveData, useMergedTags, useOracleCard } from '../hooks/useLiveData'
import { analyzeCube } from '../lib/analysis'
import { CATALOG_DISPLAY_LIMIT } from '../lib/catalogCards'
import { emptyFilter, matchesFilter } from '../lib/cardMeta'
import {
  cubeInfoDescription,
  defaultCubeDescription,
  PRIMARY_THEME_LIMIT,
  primaryThemeIdsForCube,
  themeNamesForIds,
} from '../lib/cubeInfo'
import { densestThemeIds, themeCountsForCards, type GroupAxis } from '../lib/cubeList'
import { creatureTypesFromCard, typeThemeId, typeThemesFromIds } from '../lib/creatureTypes'
import { addCardsToCube, removeCardFromCube, removeCardTheme, setCardTheme, updateCube } from '../lib/repo'
import { applySettingsToGenerationDraft } from '../lib/generationDraft'
import { formatCubeCreated } from '../lib/format'
import { publishCubeDocs, publishedDocsUrl } from '../lib/docsPublish'
import type { Synergy } from '../types'

const EMPTY_THEME_IDS: string[] = []

export function CubePage() {
  const { cubeId } = useParams()
  const navigate = useNavigate()
  const { catalog, themes, cubes, cubeCards } = useLiveData()
  const cube = cubes.find((c) => c.id === cubeId)
  const [tab, setTab] = useState<'cards' | 'analysis' | 'add'>('cards')
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [primary, setPrimary] = useState<GroupAxis>('color')
  const [secondary, setSecondary] = useState<GroupAxis>('type')
  const [filter, setFilter] = useState(emptyFilter)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [overrideThemeIds, setOverrideThemeIds] = useState<string[] | null>(null)
  const [focusCubeId, setFocusCubeId] = useState(cubeId)
  const [fillPage, setFillPage] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoDraft, setInfoDraft] = useState('')
  const [infoImageState, setInfoImageState] = useState<'idle' | 'saving' | 'error'>('idle')
  const infoCardExportRef = useRef<HTMLDivElement>(null)
  const [copiedList, setCopiedList] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [docsPublishState, setDocsPublishState] = useState<{
    status: 'idle' | 'publishing' | 'success' | 'error'
    message?: string
  }>({ status: 'idle' })

  if (cubeId !== focusCubeId) {
    setFocusCubeId(cubeId)
    setOverrideThemeIds(null)
    setFillPage(false)
    setInfoOpen(false)
    setPasteOpen(false)
    setDocsPublishState({ status: 'idle' })
  }

  useEffect(() => {
    if (tab === 'analysis') setFillPage(false)
  }, [tab])

  useEffect(() => {
    if (!fillPage && !infoOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (infoOpen) setInfoOpen(false)
      else setFillPage(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [fillPage, infoOpen])

  const seedThemeIds = cube?.generationSettings?.themeIds ?? EMPTY_THEME_IDS
  const generationSettings = cube?.generationSettings
  const canRegenerate = Boolean(generationSettings?.seedOracleIds?.length)
  const focusThemeIds = overrideThemeIds ?? seedThemeIds

  const cubeOracleIds = useMemo(
    () => (cubeId ? cubeCards.filter((row) => row.cubeId === cubeId).map((row) => row.oracleId) : []),
    [cubeCards, cubeId],
  )
  const cubeList = useCardsByOracleIds(cubeOracleIds)
  const { map: eloMap } = useEloForOracles(cubeOracleIds)
  const tags = useMergedTags(cubeOracleIds)
  const visible = useMemo(
    () =>
      cubeList.filter((card) =>
        matchesFilter(
          card,
          filter,
          tags.filter((t) => t.oracleId === card.oracleId),
        ),
      ),
    [cubeList, filter, tags],
  )
  const addQuery = useCatalogQuery(filter, { exclude: cubeOracleIds, enabled: tab === 'add' })
  const analysis = useMemo(
    () =>
      analyzeCube(cubeList, themes, tags, {
        focusThemeIds: focusThemeIds.length > 0 ? focusThemeIds : undefined,
        scoreThemeIds: seedThemeIds,
        eloByOracle: eloMap.size > 0 ? eloMap : undefined,
      }),
    [cubeList, themes, tags, focusThemeIds, seedThemeIds, eloMap],
  )
  const seedCards = useMemo(() => {
    const snap = cube?.generationSettings?.seedCards
    if (snap && snap.length > 0) return snap
    const ids = cube?.generationSettings?.seedOracleIds ?? []
    return ids
      .map((id) => cubeList.find((c) => c.oracleId === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map((c) => ({
        oracleId: c.oracleId,
        name: c.name,
        imageNormal: c.imageNormal,
        typeLine: c.typeLine,
        faces: c.faces,
      }))
  }, [cube?.generationSettings, cubeList])
  const pickerThemes = useMemo(() => {
    const typeIds = new Set<string>()
    for (const card of cubeList) {
      for (const typeName of creatureTypesFromCard(card)) typeIds.add(typeThemeId(typeName))
    }
    for (const id of [...seedThemeIds, ...focusThemeIds, ...(cube?.primaryThemeIds ?? [])]) {
      if (id.startsWith('type:')) typeIds.add(id)
    }
    return [...themes, ...typeThemesFromIds([...typeIds])]
  }, [cubeList, themes, seedThemeIds, focusThemeIds, cube?.primaryThemeIds])
  const selected = useOracleCard(selectedId)
  const cubeIds = useMemo(() => new Set(cubeOracleIds), [cubeOracleIds])
  const cubeTags = useMemo(
    () => tags.filter((tag) => cubeIds.has(tag.oracleId)),
    [tags, cubeIds],
  )
  const cubeThemeCounts = useMemo(
    () => themeCountsForCards(cubeList, cubeTags),
    [cubeList, cubeTags],
  )
  const columnThemeIds = useMemo(
    () =>
      focusThemeIds.length > 0
        ? focusThemeIds
        : densestThemeIds(cubeList, pickerThemes, cubeTags),
    [focusThemeIds, cubeList, pickerThemes, cubeTags],
  )
  const usingSeeds = seedThemeIds.length > 0
  const isDefaultFocus = !usingSeeds || focusThemeIds.join('|') === seedThemeIds.join('|')
  const infoThemeIds = useMemo(
    () => {
      if (!cube) return []
      const ids = primaryThemeIdsForCube(cube, cubeList, pickerThemes, cubeTags)
      const names = new Map(pickerThemes.map((theme) => [theme.id, theme.name]))
      return [...ids].sort((a, b) => {
        const countDiff = (cubeThemeCounts.get(b) ?? 0) - (cubeThemeCounts.get(a) ?? 0)
        if (countDiff !== 0) return countDiff
        return (names.get(a) ?? a).localeCompare(names.get(b) ?? b)
      })
    },
    [cube, cubeList, pickerThemes, cubeTags, cubeThemeCounts],
  )
  const infoThemeNames = useMemo(
    () => themeNamesForIds(infoThemeIds, [...catalog, ...pickerThemes]),
    [catalog, infoThemeIds, pickerThemes],
  )
  const generatedDescription = useMemo(
    () =>
      defaultCubeDescription({
        size: cubeList.length,
        targetSize: cube?.targetSize ?? 0,
        themeNames: infoThemeNames,
        seedNames: seedCards.map((card) => card.name),
      }),
    [cube?.targetSize, cubeList.length, infoThemeNames, seedCards],
  )
  const infoDescription = cube ? cubeInfoDescription(cube, generatedDescription) : generatedDescription
  const infoArt = useMemo(() => {
    if (cube?.infoArt) return [{ src: cube.infoArt, name: cube.name, cover: true }]
    return seedCards
      .filter((card) => card.imageNormal)
      .map((card) => ({ src: card.imageNormal, name: card.name }))
  }, [cube?.infoArt, cube?.name, seedCards])
  const addVisible = addQuery.cards
  const addTags = useMergedTags(tab === 'add' ? addVisible.map((card) => card.oracleId) : [])
  const scopeTags = tab === 'add' ? addTags : tags
  const scopeThemes = useMemo(() => {
    if (tab === 'add') return themes
    const present = new Set(scopeTags.map((t) => t.themeId))
    return themes.filter((theme) => present.has(theme.id))
  }, [tab, themes, scopeTags])

  if (!cube || !cubeId) {
    return (
      <p>
        Cube not found. <Link to="/cubes">Back</Link>
      </p>
    )
  }

  const usesThemeAxis = primary === 'theme' || secondary === 'theme'
  const infoCardEl = (
    <CubeInfoCard
      name={cube.name}
      description={infoDescription}
      themes={infoThemeNames}
      size={cubeList.length || cube.targetSize}
      art={infoArt}
    />
  )

  function saveInfoDescription(value: string) {
    if (!cube) return
    setInfoDraft(value)
    const trimmed = value.trim()
    const notes = !trimmed || trimmed === generatedDescription.trim() ? '' : value
    if (notes === cube.notes) return
    void updateCube({ ...cube, notes })
  }

  function saveInfoArt(dataUrl: string | null) {
    if (!cube) return
    if ((cube.infoArt ?? null) === dataUrl) return
    void updateCube({ ...cube, infoArt: dataUrl })
  }

  function saveInfoPrimaryThemes(ids: string[]) {
    if (!cube) return
    const next = [...new Set(ids.filter(Boolean))].slice(0, PRIMARY_THEME_LIMIT)
    const current = cube.primaryThemeIds
    if (Array.isArray(current) && current.join('|') === next.join('|')) return
    void updateCube({ ...cube, primaryThemeIds: next })
  }

  function resetInfoPrimaryThemes() {
    if (!cube || !Array.isArray(cube.primaryThemeIds)) return
    void updateCube({ ...cube, primaryThemeIds: null })
  }

  function printInfoCard() {
    const body = document.body
    body.classList.add('printing-cube-info')
    const done = () => {
      body.classList.remove('printing-cube-info')
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
  }

  async function saveInfoCardImage() {
    const node = infoCardExportRef.current?.querySelector<HTMLElement>('.cube-info-card')
    if (!node || infoImageState === 'saving') return
    const cubeName = cube?.name ?? 'cube'
    setInfoImageState('saving')
    try {
      await document.fonts.ready
      await Promise.all(
        [...node.querySelectorAll('img')].map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) {
                resolve()
                return
              }
              image.addEventListener('load', () => resolve(), { once: true })
              image.addEventListener('error', () => resolve(), { once: true })
            }),
        ),
      )
      const dataUrl = await toPng(node, {
        backgroundColor: '#0b0b0c',
        cacheBust: true,
        pixelRatio: 2,
      })
      const filename =
        cubeName
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'cube'
      const link = document.createElement('a')
      link.download = `${filename}-info-card.png`
      link.href = dataUrl
      link.click()
      setInfoImageState('idle')
    } catch {
      setInfoImageState('error')
    }
  }

  async function openInGenerate() {
    if (!cube || !generationSettings?.seedOracleIds?.length) return
    await applySettingsToGenerationDraft(generationSettings, {
      destination: 'new',
      newName: cube.name,
    })
    navigate('/generate')
  }

  async function copyCardList() {
    const text = cubeList
      .map((card) => card.name)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => a.localeCompare(b))
      .join('\n')
    setCopiedList(true)
    window.setTimeout(() => setCopiedList(false), 1600)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {
      /* fall through */
    }
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    document.body.removeChild(area)
  }

  async function publishDocsPage() {
    if (!cube) return
    setDocsPublishState({ status: 'publishing' })
    try {
      const syntheticTypeTags = cubeList.flatMap((card) =>
        creatureTypesFromCard(card).map((typeName) => ({
          oracleId: card.oracleId,
          themeId: typeThemeId(typeName),
          synergy: 4 as Synergy,
        })),
      )
      const tagMap = new Map(
        [...cubeTags, ...syntheticTypeTags].map((tag) => [
          `${tag.oracleId}:${tag.themeId}`,
          { oracleId: tag.oracleId, themeId: tag.themeId, synergy: tag.synergy },
        ]),
      )
      const docsTags = [...tagMap.values()]
      const docsThemeIds = new Set(docsTags.map((tag) => tag.themeId))
      const result = await publishCubeDocs({
        cubeId: cube.id,
        name: cube.name,
        description: infoDescription,
        cards: cubeList.map((card) => ({
          oracleId: card.oracleId,
          name: card.name,
          cmc: card.cmc,
          typeLine: card.typeLine,
          colors: card.colors,
          colorIdentity: card.colorIdentity,
          manaCost: card.manaCost,
          oracleText: card.oracleText,
          keywords: card.keywords,
          imageNormal: card.imageNormal,
          imageLarge: card.imageLarge,
          layout: card.layout,
          faces: card.faces,
        })),
        themes: pickerThemes
          .filter((theme) => docsThemeIds.has(theme.id))
          .map((theme) => ({
            id: theme.id,
            name: theme.name,
            description: theme.description,
            accent: theme.accent,
          })),
        tags: docsTags,
        slug: cube.docsSlug || undefined,
      })
      if (result.slug !== cube.docsSlug) {
        await updateCube({ ...cube, docsSlug: result.slug })
      }
      const message =
        result.mode === 'generated-created'
          ? `Created docs/${result.slug}/`
          : result.mode === 'custom-cardlist'
            ? `Updated docs/${result.slug}/cardlist.txt`
            : `Updated docs/${result.slug}/`
      setDocsPublishState({ status: 'success', message })
    } catch (error) {
      setDocsPublishState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Docs publish failed.',
      })
    }
  }

  const renderCanvas = () => (
    <CubeListView
      cards={tab === 'add' ? addVisible : visible}
      themes={pickerThemes}
      tags={scopeTags}
      primary={primary}
      secondary={secondary}
      columnThemeIds={columnThemeIds}
      selectedId={selectedId}
      mode={layout === 'grid' ? 'images' : 'list'}
      className={fillPage ? 'rounded-none border-0' : ''}
      onSelect={(card) => setSelectedId(card.oracleId)}
      onRemove={
        tab === 'add'
          ? undefined
          : (card) => {
              if (selectedId === card.oracleId) setSelectedId(null)
              void removeCardFromCube(cubeId, card.oracleId)
            }
      }
    />
  )

  const renderSidePanel = () => (
    <CardPanel
      card={selected}
      themes={themes}
      catalog={catalog}
      tags={scopeTags}
      cubes={cubes}
      inCurrentCube={selected ? cubeIds.has(selected.oracleId) : false}
      onSetTheme={(themeId, synergy: Synergy) => {
        if (selected) void setCardTheme(selected.oracleId, themeId, synergy, 'overwrite')
      }}
      onRemoveTheme={(themeId) => {
        if (selected) void removeCardTheme(selected.oracleId, themeId)
      }}
      onAddToCube={(id) => {
        if (selected) void addCardsToCube(id, [selected.oracleId])
      }}
      onRemoveFromCube={() => {
        if (selected) void removeCardFromCube(cubeId, selected.oracleId)
      }}
    />
  )

  return (
    <div
      className={
        tab === 'analysis'
          ? 'space-y-5'
          : 'flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-3 overflow-hidden'
      }
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => {
              setInfoDraft(infoDescription)
              setInfoOpen(true)
            }}
            className="w-[4.35rem] shrink-0 overflow-hidden rounded-md shadow-[0_6px_18px_rgba(0,0,0,0.45)] ring-1 ring-white/15 transition hover:ring-amber-200/70 focus-visible:ring-2 focus-visible:ring-amber-200"
            aria-label="View cube info card"
            title="View cube info card"
          >
            <span className="pointer-events-none block">{infoCardEl}</span>
          </button>
          <div className="min-w-0">
            <Link to="/cubes" className="text-sm text-stone-400">
              Cubes
            </Link>
            <input
              value={cube.name}
              onChange={(e) => void updateCube({ ...cube, name: e.target.value })}
              className="block w-full bg-transparent text-2xl text-amber-50 outline-none"
            />
            <p className="text-stone-400">
              {formatCubeCreated(cube.createdAt)}
              {cube.createdAt ? ' · ' : ''}
              {cubeList.length} / {cube.targetSize} cards
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {canRegenerate && (
                  <button
                    type="button"
                    title="Open Generate with this cube’s seeds, favored tags, and knobs. This list is unchanged."
                    onClick={() => void openInGenerate()}
                    className="rounded-full bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50"
                  >
                    Regenerate
                  </button>
                )}
                {cubeList.length > 0 && (
                  <>
                    <button
                      type="button"
                      title="Copy card names, one per line, for Cube Cobra or a text file."
                      onClick={() => void copyCardList()}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-stone-200"
                    >
                      {copiedList ? 'Copied' : 'Copy list'}
                    </button>
                    <button
                      type="button"
                      title="Publish this cube's name, description, and cards to its docs page."
                      disabled={docsPublishState.status === 'publishing'}
                      onClick={() => void publishDocsPage()}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-stone-200 disabled:cursor-wait disabled:opacity-60"
                    >
                      {docsPublishState.status === 'publishing'
                        ? 'Publishing…'
                        : cube.docsSlug
                          ? 'Update docs page'
                          : 'Create docs page'}
                    </button>
                    {cube.docsSlug && (
                      <a
                        href={publishedDocsUrl(cube.docsSlug)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open this cube's published docs page."
                        className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-stone-200"
                      >
                        View docs page
                      </a>
                    )}
                    {docsPublishState.message && (
                      <span
                        className={`self-center text-xs ${
                          docsPublishState.status === 'error' ? 'text-red-300' : 'text-emerald-300'
                        }`}
                        role={docsPublishState.status === 'error' ? 'alert' : 'status'}
                      >
                        {docsPublishState.message}
                      </span>
                    )}
                  </>
                )}
                <button
                  type="button"
                  title="Paste an Arena, MTGO, or Cube Cobra list into this cube."
                  onClick={() => setPasteOpen((open) => !open)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    pasteOpen ? 'bg-amber-200/20 text-amber-50' : 'bg-white/10 text-stone-200'
                  }`}
                >
                  Paste list
                </button>
              </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab !== 'analysis' && (
            <>
              <div className="flex rounded-full bg-white/5 p-0.5">
                {(
                  [
                    ['list', 'List'],
                    ['grid', 'Images'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLayout(id)}
                    className={`rounded-full px-3 py-1.5 text-sm ${
                      layout === id ? 'bg-amber-200/20 text-amber-50' : 'text-stone-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <GroupingSelects
                primary={primary}
                secondary={secondary}
                onChange={(nextPrimary, nextSecondary) => {
                  setPrimary(nextPrimary)
                  setSecondary(nextSecondary)
                }}
              />
              <button
                type="button"
                onClick={() => setFillPage(true)}
                className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-stone-300 hover:bg-white/10 hover:text-white"
              >
                Fill page
              </button>
            </>
          )}
          {(['cards', 'analysis', 'add'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tab === id ? 'bg-amber-200/20 text-amber-50' : 'bg-white/5'
              }`}
            >
              {id === 'add' ? 'Add from library' : id[0]!.toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {pasteOpen && (
        <div className="shrink-0">
          <PasteListPanel
            cubeId={cubeId}
            existingIds={cubeOracleIds}
            onClose={() => setPasteOpen(false)}
          />
        </div>
      )}

      {tab === 'analysis' ? (
        <AnalysisPanel
          analysis={analysis}
          cards={cubeList}
          themes={themes}
          tags={tags}
          pickerThemes={pickerThemes}
          seedCards={seedCards}
          seedThemeIds={seedThemeIds}
          focusThemeIds={focusThemeIds}
          onFocusThemeIdsChange={(ids) => setOverrideThemeIds(ids)}
          eloMin={cube?.generationSettings?.eloMin}
          eloMax={cube?.generationSettings?.eloMax}
        />
      ) : (
        <>
          <div className="shrink-0 space-y-3">
            <FilterBar filter={filter} themes={scopeThemes} tags={scopeTags} onChange={setFilter} />
            {canRegenerate && generationSettings && (
              <FillSuggestPanel
                cubeId={cubeId}
                targetSize={cube.targetSize}
                currentSize={cubeOracleIds.length}
                lockedIds={cubeOracleIds}
                settings={generationSettings}
                themes={themes}
              />
            )}
            {tab === 'add' && (
              <p className="text-sm text-stone-400">
                {addQuery.searching
                  ? 'Searching the Oracle catalog…'
                  : addQuery.total > addVisible.length
                    ? `Showing ${addVisible.length} of ${addQuery.total.toLocaleString()} catalog matches (cap ${CATALOG_DISPLAY_LIMIT}).`
                    : `${addQuery.total.toLocaleString()} catalog cards not already in this cube`}
              </p>
            )}
            {usesThemeAxis && (
              <section className="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
                    <FieldTip
                      label="Theme columns"
                      tip="Used when Columns or Then is Theme. Generated cubes default to the themes favored on the seeds. This is not the filter above — cards can still appear in several groups."
                    />
                  </h3>
                  {usingSeeds && !isDefaultFocus && (
                    <button
                      type="button"
                      onClick={() => setOverrideThemeIds(seedThemeIds)}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs text-amber-100"
                    >
                      Reset to seed themes
                    </button>
                  )}
                </div>
                <ThemeMultiSelect
                  themes={pickerThemes}
                  selectedIds={focusThemeIds}
                  onChange={(ids) => setOverrideThemeIds(ids)}
                  preserveOrder
                  placeholder="Search tags or creature types for columns"
                />
              </section>
            )}
          </div>
          <div className={`grid min-h-0 flex-1 gap-5 ${layout === 'grid' ? 'lg:grid-cols-[1fr_320px]' : 'lg:grid-cols-[1fr_280px]'}`}>
            {fillPage ? <div className="min-h-0" /> : renderCanvas()}
            {fillPage ? null : renderSidePanel()}
          </div>
        </>
      )}
      {createPortal(
        <>
          <div className="cube-info-print-root" aria-hidden>
            {infoCardEl}
          </div>
          <div ref={infoCardExportRef} className="cube-info-export-root" aria-hidden>
            {infoCardEl}
          </div>
        </>,
        document.body,
      )}
      {infoOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Cube info card"
            onClick={() => setInfoOpen(false)}
          >
            <div
              className="flex max-h-full flex-col items-center gap-3 overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="max-h-[min(85dvh,36rem)] w-[min(22rem,calc(100vw-2rem),calc(85dvh*2.5/3.5))] drop-shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
              >
                <CubeInfoCard
                  name={cube.name}
                  description={infoDraft}
                  themes={infoThemeNames}
                  size={cubeList.length || cube.targetSize}
                  art={infoArt}
                  onNameChange={(value) => void updateCube({ ...cube, name: value })}
                  onDescriptionChange={saveInfoDescription}
                  onArtChange={saveInfoArt}
                />
              </div>
              <p className="text-xs text-stone-400">Click the art, name, description, or themes to edit.</p>
              <div className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/40 p-3">
                <p className="mb-2 text-xs tracking-wide text-amber-100/80 uppercase">Primary themes</p>
                <ThemeMultiSelect
                  themes={pickerThemes}
                  selectedIds={infoThemeIds}
                  onChange={saveInfoPrimaryThemes}
                  preserveOrder
                  placeholder={`Search tags (${infoThemeIds.length}/${PRIMARY_THEME_LIMIT})`}
                  cardCounts={cubeThemeCounts}
                />
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {cube.notes.trim() ? (
                  <button
                    type="button"
                    onClick={() => saveInfoDescription(generatedDescription)}
                    className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-stone-200"
                  >
                    Reset text
                  </button>
                ) : null}
                {cube.infoArt ? (
                  <button
                    type="button"
                    onClick={() => saveInfoArt(null)}
                    className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-stone-200"
                  >
                    Reset art
                  </button>
                ) : null}
                {Array.isArray(cube.primaryThemeIds) ? (
                  <button
                    type="button"
                    onClick={resetInfoPrimaryThemes}
                    className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-stone-200"
                  >
                    Reset themes
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={printInfoCard}
                  className="rounded-full bg-amber-200/20 px-4 py-1.5 text-sm text-amber-50"
                >
                  Print
                </button>
                <button
                  type="button"
                  disabled={infoImageState === 'saving'}
                  onClick={() => void saveInfoCardImage()}
                  className="rounded-full bg-amber-200/20 px-4 py-1.5 text-sm text-amber-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {infoImageState === 'saving' ? 'Saving…' : 'Save PNG'}
                </button>
                <button
                  type="button"
                  onClick={() => setInfoOpen(false)}
                  className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-stone-200"
                >
                  Close
                </button>
              </div>
              {infoImageState === 'error' ? (
                <p className="text-xs text-red-300" role="alert">
                  Could not save the image. Try again after the card art finishes loading.
                </p>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
      {fillPage && (
        <div className="fixed inset-0 z-40 flex bg-[#111318]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <p className="min-w-0 truncate text-sm text-amber-50">
                {cube.name}
                {cube.createdAt ? (
                  <span className="text-stone-400"> · {formatCubeCreated(cube.createdAt)}</span>
                ) : null}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full bg-white/5 p-0.5">
                  {(
                    [
                      ['list', 'List'],
                      ['grid', 'Images'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLayout(id)}
                      className={`rounded-full px-3 py-1.5 text-sm ${
                        layout === id ? 'bg-amber-200/20 text-amber-50' : 'text-stone-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <GroupingSelects
                  primary={primary}
                  secondary={secondary}
                  onChange={(nextPrimary, nextSecondary) => {
                    setPrimary(nextPrimary)
                    setSecondary(nextSecondary)
                  }}
                />
                <button
                  type="button"
                  onClick={() => setFillPage(false)}
                  className="rounded-full bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50"
                >
                  Exit
                </button>
              </div>
            </div>
            <div className="h-full min-h-0 flex-1">{renderCanvas()}</div>
          </div>
          {selected ? (
            <div className="hidden w-[280px] shrink-0 border-l border-white/10 sm:block">{renderSidePanel()}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
