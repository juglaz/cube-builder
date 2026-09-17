import { useMemo } from 'react'
import { CardHoverName, chipsForCard, useCardHover, type CardHoverChip } from './CardHoverPreview'
import { FieldTip } from './FieldTip'
import { ThemeMultiSelect } from './ThemeMultiSelect'
import { Link } from 'react-router-dom'
import { asFan, gannonExposure, TOP_THEME_COUNT, type CubeAnalysis, type Warning } from '../lib/analysis'
import { formatMetricBand, formatMetricValue } from '../lib/balance'
import { libraryThemeCounts } from '../lib/cardMeta'
import { eloBandIsOpen } from '../lib/elo'
import { colorLabel } from '../lib/format'
import { COLOR_LIST_COLUMNS } from '../lib/cubeList'
import { formatElo, gaussianKde, profileCubePower, silvermanBandwidth, typicalSpellCount, type ColorPowerRow } from '../lib/powerAnalysis'
import { useEloForOracles, useLiveData } from '../hooks/useLiveData'
import type { CardTheme, LibraryCard, Theme } from '../types'

type SeedSnapshot = {
  oracleId: string
  name: string
  imageNormal: string
  typeLine: string
  faces?: LibraryCard['faces']
}

type Props = {
  analysis: CubeAnalysis
  cards: LibraryCard[]
  themes: Theme[]
  tags: CardTheme[]
  pickerThemes: Theme[]
  seedCards?: SeedSnapshot[]
  seedThemeIds?: string[]
  focusThemeIds: string[]
  onFocusThemeIdsChange: (ids: string[]) => void
  eloMin?: number
  eloMax?: number
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function WarningMessage({
  warning,
  cards,
  hoverProps,
  chipsOf,
}: {
  warning: Warning
  cards: LibraryCard[]
  hoverProps: ReturnType<typeof useCardHover>['hoverProps']
  chipsOf: (oracleId: string) => CardHoverChip[]
}) {
  const byName = new Map<string, LibraryCard | NonNullable<Warning['cards']>[number]>()
  const pool = warning.cards?.length ? warning.cards : cards
  for (const card of pool) byName.set(card.name, card)
  const names = [...byName.keys()].filter((name) => name.length >= 3).sort((a, b) => b.length - a.length)
  if (names.length === 0) return warning.message
  const re = new RegExp(`(${names.map(escapeRegExp).join('|')})`, 'g')
  return warning.message.split(re).map((part, i) => {
    const card = byName.get(part)
    if (!card) return part
    return (
      <span
        key={`${card.oracleId}-${i}`}
        className="cursor-default underline decoration-amber-200/50 underline-offset-2"
        {...hoverProps(card, chipsOf(card.oracleId))}
      >
        {part}
      </span>
    )
  })
}

export function AnalysisPanel({
  analysis,
  cards,
  themes,
  tags,
  pickerThemes,
  seedCards = [],
  seedThemeIds = [],
  focusThemeIds,
  onFocusThemeIdsChange,
  eloMin,
  eloMax,
}: Props) {
  const themeName = (id: string) =>
    analysis.focusedDensity.find((row) => row.themeId === id)?.name ??
    analysis.themeDensity.find((row) => row.themeId === id)?.name ??
    themes.find((t) => t.id === id)?.name ??
    pickerThemes.find((t) => t.id === id)?.name ??
    id
  const colors = ['W', 'U', 'B', 'R', 'G', 'C', 'M']
  const curveKeys = ['0-1', '2', '3', '4', '5', '6+']
  const focused = analysis.focusedDensity
  const usingSeeds = seedThemeIds.length > 0
  const seedKey = seedThemeIds.join('|')
  const focusKey = focusThemeIds.join('|')
  const isDefaultFocus = !usingSeeds || focusKey === seedKey
  const { hoverProps, preview } = useCardHover()

  const { cobraEloMeta } = useLiveData()
  const oracleIds = useMemo(() => cards.map((card) => card.oracleId), [cards])
  const { map: eloMap, loading: eloLoading } = useEloForOracles(oracleIds)
  const power = useMemo(() => {
    if (eloLoading) return null
    return profileCubePower(cards, eloMap, Boolean(cobraEloMeta) || eloMap.size > 0, {
      eloMin,
      eloMax,
    })
  }, [cards, eloMap, cobraEloMeta, eloLoading, eloMin, eloMax])
  const banded =
    Number.isFinite(eloMin) &&
    Number.isFinite(eloMax) &&
    !eloBandIsOpen(Number(eloMin), Number(eloMax))

  const pickerList = useMemo(() => {
    const byId = new Map<string, Theme>()
    for (const theme of pickerThemes) byId.set(theme.id, theme)
    for (const theme of themes) if (!byId.has(theme.id)) byId.set(theme.id, theme)
    return [...byId.values()]
  }, [pickerThemes, themes])
  const themeById = useMemo(() => new Map(pickerList.map((theme) => [theme.id, theme])), [pickerList])
  const tagCounts = useMemo(() => libraryThemeCounts(tags), [tags])
  const chipsOf = (oracleId: string) => chipsForCard({ oracleId }, themeById, tags, tagCounts)

  return (
    <div className="space-y-6">
      {preview}
      {analysis.warnings.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">Warnings</h3>
          {analysis.warnings.map((w) => (
            <p key={w.id} className="rounded-xl border border-amber-200/20 bg-amber-200/8 px-3 py-2 text-sm">
              <WarningMessage warning={w} cards={cards} hoverProps={hoverProps} chipsOf={chipsOf} />
            </p>
          ))}
        </section>
      )}

      <PowerSection
        power={power}
        loading={eloLoading}
        banded={banded}
        eloMin={eloMin}
        eloMax={eloMax}
        chipsOf={chipsOf}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
            <FieldTip
              label={`Design score ${analysis.evaluation.overall}/100`}
              tip="Weighted score against the observed min–max of eight Cube Cobra lists (Pauper, Peasant, wtwlf123, Bun Magic, Regular, Neoclassical, MTGO Vintage, Traditional Powered). 100 means every scored metric sits inside that range. Color power uses mean Elo and the top/bottom 10% (P90 / P10) spread across WUBRG. Favored-tag as-fan is a pack-visibility floor and is not part of the overall."
            />
          </h3>
          <p className="text-xs text-stone-400">vs popular cubes · Sep 2026</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-400">
              <tr>
                <th className="py-2">Metric</th>
                <th>This cube</th>
                <th>Observed min–max</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {analysis.evaluation.metrics.map((row) => (
                <tr key={row.id} className="border-t border-white/8">
                  <td className="py-2">
                    <span className="text-amber-50">{row.label}</span>
                    <span className="mt-0.5 block text-xs text-stone-500">{row.note}</span>
                  </td>
                  <td>{formatMetricValue(row)}</td>
                  <td>{formatMetricBand(row)}</td>
                  <td
                    className={
                      row.score >= 80 ? 'text-emerald-200' : row.score >= 60 ? 'text-amber-100' : 'text-red-200'
                    }
                  >
                    {row.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {seedCards.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
            <FieldTip
              label="Seed crystals"
              tip="The cards this cube was generated from. Density and bridges below are relative to the themes favored on those seeds, unless you change the set."
            />
          </h3>
          <div className="flex flex-wrap gap-2">
            {seedCards.map((card) => (
              <div
                key={card.oracleId}
                className="flex items-center gap-2 rounded-full bg-amber-200/15 py-1 pr-3 pl-1 text-sm text-amber-50"
                {...hoverProps(card, chipsOf(card.oracleId))}
              >
                {card.imageNormal ? (
                  <img src={card.imageNormal} alt="" className="h-8 w-6 rounded object-cover" />
                ) : null}
                <span>{card.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
            <FieldTip
              label="Analyze themes"
              tip="Density, overlap, and bridge cards are computed only for this set. Generated cubes default to the themes favored on the seeds."
            />
          </h3>
          {usingSeeds && !isDefaultFocus && (
            <button
              type="button"
              onClick={() => onFocusThemeIdsChange(seedThemeIds)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-amber-100"
            >
              Reset to seed themes
            </button>
          )}
        </div>
        <ThemeMultiSelect
          themes={pickerList}
          selectedIds={focusThemeIds}
          onChange={onFocusThemeIdsChange}
          preserveOrder
          placeholder="Search tags or creature types to analyze"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Cards" value={String(analysis.size)} />
        <Stat
          label="Lands"
          value={`${analysis.landCount} (${(analysis.landShare * 100).toFixed(1)}%)`}
        />
        <Stat
          label="Creatures"
          value={`${analysis.creatureCount} (${(analysis.creatureShare * 100).toFixed(0)}%)`}
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Color coverage"
            tip="What generation balances: identity hits (a gold card counts in each of its colors) and pips (gold splits 1.0 across those colors). Target is an even five-color split of the cube."
          />
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-400">
              <tr>
                <th className="py-2">Color</th>
                <th>Identity</th>
                <th>Pips</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {analysis.colorCoverage.map((row) => (
                <tr key={row.color} className="border-t border-white/8">
                  <td className="py-2">{colorLabel(row.color)}</td>
                  <td>{row.identity}</td>
                  <td className={row.pips + 0.01 < row.target - 8 ? 'text-red-200' : undefined}>
                    {row.pips.toFixed(1)}
                  </td>
                  <td>{row.target.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Type coverage"
            tip="Generation floors for noncreature Instant/Sorcery and for Enchantment/Artifact (including creature artifacts and auras). Adventure creatures do not count as instants or sorceries."
          />
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-400">
              <tr>
                <th className="py-2">Type</th>
                <th>Count</th>
                <th>Min</th>
              </tr>
            </thead>
            <tbody>
              {analysis.typeCoverage.map((row) => (
                <tr key={row.type} className="border-t border-white/8">
                  <td className="py-2">{row.type}</td>
                  <td className={row.count < row.min ? 'text-red-200' : undefined}>{row.count}</td>
                  <td>{row.min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Identity buckets"
            tip="Exclusive buckets for the list: each card is Colorless, Gold, or its single color. White/Blue/Black/Red/Green here also count gold cards, so those bars are not exclusive."
          />
        </h3>
        <BarList
          items={colors.map((c) => ({
            key: c,
            label: `${colorLabel(c)} · as-fan ${asFan(analysis.colorCounts[c] ?? 0, analysis.size).toFixed(2)}`,
            value: analysis.colorCounts[c] ?? 0,
          }))}
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Mana curve"
            tip="Nonlands only. Lands are omitted so they do not sit in the 0–1 bucket."
          />
        </h3>
        <BarList
          items={curveKeys.map((k) => ({
            key: k,
            label: `${k} MV · as-fan ${asFan(analysis.curve[k] ?? 0, analysis.spellCount || analysis.size).toFixed(2)}`,
            value: analysis.curve[k] ?? 0,
          }))}
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Primary types</h3>
        <BarList
          items={Object.entries(analysis.typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ key: k, label: k, value: v }))}
        />
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Theme density</h3>
        <p className="mb-2 text-xs text-stone-400">
          {usingSeeds && isDefaultFocus
            ? 'Coverage of the themes favored on the seed crystals.'
            : focusThemeIds.length > 0
              ? `Coverage of the ${focused.length} selected theme${focused.length === 1 ? '' : 's'}.`
              : `Densest ${focused.length} theme${focused.length === 1 ? '' : 's'}${
                  analysis.themeDensity.length > TOP_THEME_COUNT
                    ? ` of ${analysis.themeDensity.length}`
                    : ''
                }.`}{' '}
          Bridges are cards that also sit in another of these themes.
        </p>
        {focused.length === 0 ? (
          <p className="text-sm text-stone-500">Select at least one theme to analyze.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-stone-400">
                <tr>
                  <th className="py-2">Theme</th>
                  <th>Count</th>
                  <th>Weighted</th>
                  <th>As-fan</th>
                  <th>Exposure</th>
                  <th>Bridges</th>
                </tr>
              </thead>
              <tbody>
                {focused.map((row) => (
                  <tr key={row.themeId} className="border-t border-white/8">
                    <td className="py-2">{row.name}</td>
                    <td>{row.count}</td>
                    <td>{row.weighted}</td>
                    <td>{row.asFan.toFixed(2)}</td>
                    <td>{row.exposure.toFixed(2)}</td>
                    <td>{row.overlapCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-stone-400">
          Exposure is Gannon-style expected copies one player sees in an 8×3×15 draft.
          Cube as-fan uses pack size 15. Creature types from type lines are included.
        </p>
      </section>

      {analysis.typalSupport.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">
            <FieldTip
              label="Payoff support"
              tip="Tribal typal-* payoffs need type-line members. Synergy payoffs are classified: package lanes (vehicles, tokens, modified, keywords, …) count real enablers; land types use post-draft basics; colors and ubiquitous types are ambient; Un-set and flavor tags are ignored. Cube floors are max(8, size/30) and only apply when a package is short."
            />
          </h3>
          <p className="mb-2 text-xs text-stone-400">
            Members are type-line creatures for a tribe, or the actual thing a synergy payoff cares about (artifacts for synergy-artifact, flying for synergy-flying). Land-type payoffs like Chained to the Rocks do not need Mountains in the cube.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-stone-400">
                <tr>
                  <th className="py-2">Lane</th>
                  <th>Members</th>
                  <th>Need</th>
                  <th>Payoffs</th>
                </tr>
              </thead>
              <tbody>
                {analysis.typalSupport.map((row) => (
                  <tr key={row.typeId} className="border-t border-white/8">
                    <td className="py-2">{row.label}</td>
                    <td className={row.members < row.want ? 'text-red-200' : ''}>{row.members}</td>
                    <td>{row.want}</td>
                    <td>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1">
                        {row.payoffs.map((card) => (
                          <li key={card.oracleId}>
                            <CardHoverName
                              name={card.name}
                              image={card}
                              chips={chipsOf(card.oracleId)}
                              className="cursor-default"
                            />
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {analysis.overlapMatrix.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Overlap matrix</h3>
          <p className="mb-2 text-xs text-stone-400">
            Shared cards among the analyzed themes, strongest pairs first.
          </p>
          <div className="space-y-1 text-sm">
            {analysis.overlapMatrix.slice(0, 40).map((row) => (
              <p key={`${row.a}-${row.b}`}>
                {themeName(row.a)} ∩ {themeName(row.b)}: {row.count} · as-fan{' '}
                {asFan(row.count, analysis.size).toFixed(2)} · exposure{' '}
                {gannonExposure(row.count, analysis.size).toFixed(2)}
              </p>
            ))}
          </div>
        </section>
      )}

      {analysis.bridgeGroups.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Bridge cards</h3>
          <p className="mb-3 text-xs text-stone-400">
            Cards that sit in two or more of the analyzed themes, grouped by the pair they connect.
            A card with three of those themes appears under each pair.
          </p>
          <div className="space-y-4">
            {analysis.bridgeGroups.map((group) => (
              <div key={`${group.themeIds[0]}-${group.themeIds[1]}`}>
                <h4 className="mb-1 text-sm text-amber-50">
                  {themeName(group.themeIds[0])} ∩ {themeName(group.themeIds[1])}{' '}
                  <span className="text-stone-400">({group.count})</span>
                </h4>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {group.cards.map((card) => (
                    <li key={card.oracleId}>
                      <CardHoverName
                        name={card.name}
                        image={card}
                        chips={chipsOf(card.oracleId)}
                        className="cursor-default"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PowerSection({
  power,
  loading,
  banded,
  eloMin,
  eloMax,
  chipsOf,
}: {
  power: ReturnType<typeof profileCubePower>
  loading: boolean
  banded: boolean
  eloMin?: number
  eloMax?: number
  chipsOf: (oracleId: string) => CardHoverChip[]
}) {
  if (loading) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">Power (Cube Cobra Elo)</h3>
        <p className="text-sm text-stone-400">Reading draft Elo for this list…</p>
      </section>
    )
  }
  if (!power) return null
  if (!power.catalogReady) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Cube Cobra Elo"
            tip="Draft-pick Elo from Cube Cobra. Higher means the card is taken earlier in cube drafts. Missing ratings count as 1200."
          />
        </h3>
        <p className="text-sm text-stone-400">
          Download Cube Cobra Elo on{' '}
          <Link to="/themes" className="underline">
            Themes / Tagger
          </Link>{' '}
          to score this list’s power and spread.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Power (Cube Cobra Elo)"
            tip="Draft-pick Elo: how early the card is taken in cube drafts, starting at 1200. Spells are the fairer power picture; lands often sit outside generation Elo caps. Missing ratings count as 1200."
          />
        </h3>
        <p className="text-xs text-stone-400">
          {banded
            ? `Generated band ${eloMin}–${eloMax}`
            : `${power.missing} unrated · counted as 1200`}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Spell median" value={formatElo(power.spells.median)} />
        <Stat label="Spell mean" value={formatElo(power.spells.mean)} />
        <Stat label="Spell SD" value={formatElo(power.spells.sd)} />
        <Stat
          label="Spell range"
          value={`${formatElo(power.spells.min)}–${formatElo(power.spells.max)}`}
        />
      </div>
      <p className="text-sm text-stone-400">
        {power.spells.atLeast1500 === 0
          ? 'No nonlands at 1500+'
          : `${power.spells.atLeast1500} nonland${power.spells.atLeast1500 === 1 ? '' : 's'} at 1500+`}
        {power.spells.atLeast1700 > 0 ? ` · ${power.spells.atLeast1700} at 1700+` : ''}
        {power.spells.below1200 > 0 ? ` · ${power.spells.below1200} below 1200` : ''}. Whole-list
        median {formatElo(power.all.median)}, SD {formatElo(power.all.sd)}
        {power.lands
          ? ` · ${power.lands.n} lands median ${formatElo(power.lands.median)}`
          : ''}
        {power.missing > 0 && banded ? ` · ${power.missing} unrated (1200)` : ''}
        {power.missing > 0 && !banded ? ` · ${power.missing} unrated counted as 1200` : ''}.
      </p>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
          <span>Nonland Elo density (100-point bands)</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-full bg-amber-200/80" />
              This cube
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-full bg-white/25" />
              Typical popular cube
            </span>
          </span>
        </div>
        <DensityChart bars={power.spellHistogram} spellCount={power.spells.n} />
        <p className="mt-2 text-xs text-stone-400">
          Ghost bar is the median nonland mix of the eight popular Cube Cobra lists (Pauper,
          Peasant, wtwlf123, Bun Magic, Regular, Neoclassical, MTGO Vintage, Traditional
          Powered), scaled to this cube’s {power.spells.n} nonlands. Powered lists pull the
          1500+ tail up; Pauper and Peasant pull the 1100s.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-stone-400">
            <tr>
              <th className="py-2">Slice</th>
              <th>n</th>
              <th>P10</th>
              <th>P25</th>
              <th>Median</th>
              <th>P75</th>
              <th>P90</th>
              <th>IQR</th>
            </tr>
          </thead>
          <tbody>
            <SliceRow label="Nonlands" slice={power.spells} />
            <SliceRow label="Whole cube" slice={power.all} />
            {power.lands ? <SliceRow label="Lands" slice={power.lands} /> : null}
          </tbody>
        </table>
      </div>
      <ColorPowerBlock power={power} eloMin={eloMin} eloMax={eloMax} banded={banded} chipsOf={chipsOf} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs tracking-wide text-stone-400 uppercase">Highest Elo</h4>
          <ol className="space-y-1 text-sm">
            {power.top.map((card, i) => (
              <li key={card.oracleId} className="flex justify-between gap-3">
                <span>
                  {i + 1}.{' '}
                  <CardHoverName name={card.name} image={card} chips={chipsOf(card.oracleId)} className="cursor-default" />
                  {card.isLand ? <span className="text-stone-500"> · land</span> : null}
                  {!card.rated ? <span className="text-stone-500"> · unrated</span> : null}
                </span>
                <span className="text-stone-400">{formatElo(card.elo)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h4 className="mb-2 text-xs tracking-wide text-stone-400 uppercase">Lowest nonland Elo</h4>
          <ol className="space-y-1 text-sm">
            {power.bottomSpells.map((card, i) => (
              <li key={card.oracleId} className="flex justify-between gap-3">
                <span>
                  {i + 1}.{' '}
                  <CardHoverName name={card.name} image={card} chips={chipsOf(card.oracleId)} className="cursor-default" />
                  {!card.rated ? <span className="text-stone-500"> · unrated</span> : null}
                </span>
                <span className="text-stone-400">{formatElo(card.elo)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function ColorPowerBlock({
  power,
  eloMin,
  eloMax,
  banded,
  chipsOf,
}: {
  power: NonNullable<ReturnType<typeof profileCubePower>>
  eloMin?: number
  eloMax?: number
  banded: boolean
  chipsOf: (oracleId: string) => CardHoverChip[]
}) {
  const rows = power.byColor
  const active = rows.filter((row) => row.n > 0)
  if (active.length === 0) return null
  const axis = colorEloAxis(power, banded, eloMin, eloMax)
  const shortHigh = active.filter((row) => row.high < row.highWant)
  const soft = active.filter((row) => row.meanDelta < -25)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h4 className="text-xs tracking-wide text-stone-400 uppercase">
          <FieldTip
            label="Color power"
            tip="Nonland Cube Cobra Elo by color identity. A gold card counts in each of its colors, same as generation. Magnets are cards at or above the high-Elo cut used when building. Each violin is a kernel density of that color’s spell Elo; width uses a log scale so the high-Elo tail stays visible. The white dot is the mean."
          />
        </h4>
        <p className="text-xs text-stone-400">
          Mean spread {formatElo(power.colorMeanSpread)} · magnets Elo ≥{' '}
          {formatElo(power.highThreshold)}
        </p>
      </div>
      <p className="text-sm text-stone-400">
        {shortHigh.length === 0 && soft.length === 0
          ? `Each color has at least ${power.highPerColor} identity hits at ${formatElo(power.highThreshold)}+.`
          : [
              shortHigh.length > 0
                ? `Thin magnets: ${shortHigh.map((row) => colorLabel(row.color)).join(', ')}`
                : null,
              soft.length > 0
                ? `Softer mean: ${soft.map((row) => colorLabel(row.color)).join(', ')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
      </p>
      <div className="space-y-1">
        {rows.map((row) => (
          <ColorViolin
            key={row.color}
            row={row}
            axis={axis}
            cubeMean={power.spells.mean}
            magnetElo={power.highThreshold}
          />
        ))}
        <div className="flex justify-between text-[11px] text-stone-500">
          <span>{formatElo(axis.min)}</span>
          <span>log density · cube mean {formatElo(power.spells.mean)}</span>
          <span>{formatElo(axis.max)}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-stone-400">
            <tr>
              <th className="py-2">Color</th>
              <th>n</th>
              <th>Mean</th>
              <th>Δ</th>
              <th>Median</th>
              <th>P90</th>
              <th>Magnets</th>
              <th>Top card</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.color} className="border-t border-white/8">
                <td className="py-2">{colorLabel(row.color)}</td>
                <td>{row.n}</td>
                <td>{row.n ? formatElo(row.slice.mean) : '—'}</td>
                <td className={row.meanDelta < -25 ? 'text-red-200' : row.meanDelta > 25 ? 'text-emerald-200' : undefined}>
                  {row.n ? `${row.meanDelta >= 0 ? '+' : ''}${Math.round(row.meanDelta)}` : '—'}
                </td>
                <td>{row.n ? formatElo(row.slice.median) : '—'}</td>
                <td>{row.n ? formatElo(row.slice.p90) : '—'}</td>
                <td className={row.high < row.highWant ? 'text-red-200' : undefined}>
                  {row.n ? `${row.high} / ${row.highWant}` : '—'}
                </td>
                <td>
                  {row.top ? (
                    <span className="flex justify-between gap-3">
                      <CardHoverName name={row.top.name} image={row.top} chips={chipsOf(row.top.oracleId)} className="cursor-default" />
                      <span className="text-stone-400">{formatElo(row.top.elo)}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function colorEloAxis(
  power: NonNullable<ReturnType<typeof profileCubePower>>,
  banded: boolean,
  eloMin?: number,
  eloMax?: number,
): { min: number; max: number } {
  if (banded && Number.isFinite(eloMin) && Number.isFinite(eloMax) && Number(eloMax) > Number(eloMin)) {
    return { min: Number(eloMin), max: Number(eloMax) }
  }
  const vals = [
    power.spells.p10,
    power.spells.p90,
    ...power.byColor.filter((row) => row.n > 0).flatMap((row) => [row.slice.p10, row.slice.p90]),
  ]
  const min = Math.floor(Math.min(...vals) / 20) * 20
  const max = Math.ceil(Math.max(...vals) / 20) * 20
  return { min, max: Math.max(min + 80, max) }
}

function ColorViolin({
  row,
  axis,
  cubeMean,
  magnetElo,
}: {
  row: ColorPowerRow
  axis: { min: number; max: number }
  cubeMean: number
  magnetElo: number
}) {
  const accent = COLOR_LIST_COLUMNS.find((col) => col.id === row.color)?.accent ?? '#e0c25c'
  const width = 640
  const height = 26
  const mid = height / 2
  const span = Math.max(1, axis.max - axis.min)
  const xOf = (elo: number) => ((elo - axis.min) / span) * width
  const steps = 72
  const xs = Array.from({ length: steps }, (_, i) => axis.min + (span * i) / (steps - 1))
  const bandwidth = silvermanBandwidth(row.elos)
  const density = gaussianKde(row.elos, xs, bandwidth)
  const peak = Math.max(1e-9, ...density)
  const logged = density.map((d) => Math.log1p((d / peak) * 24))
  const logPeak = Math.max(1e-9, ...logged)
  const ys = logged.map((d) => (d / logPeak) * (mid - 1))
  const top = xs.map((elo, i) => `${xOf(elo).toFixed(2)},${(mid - ys[i]!).toFixed(2)}`)
  const bottom = xs
    .map((elo, i) => `${xOf(elo).toFixed(2)},${(mid + ys[i]!).toFixed(2)}`)
    .reverse()
  const path = row.n > 0 ? `M ${top.join(' L ')} L ${bottom.join(' L ')} Z` : ''
  const cubeX = xOf(cubeMean)
  const meanX = row.n ? xOf(row.slice.mean) : 0
  const medianX = row.n ? xOf(row.slice.median) : 0
  const magnetX =
    Number.isFinite(magnetElo) && magnetElo >= axis.min && magnetElo <= axis.max ? xOf(magnetElo) : null

  return (
    <div>
      <div className="mb-0.5 flex justify-between text-sm">
        <span>{colorLabel(row.color)}</span>
        <span className="text-stone-400">
          {row.n ? `${formatElo(row.slice.mean)} mean · ${row.high} magnets` : 'no spells'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-6 w-full"
        role="img"
        aria-label={`${colorLabel(row.color)} Elo violin`}
      >
        <rect x="0" y="0" width={width} height={height} rx="6" fill="rgba(255,255,255,0.06)" />
        <line x1={cubeX} y1="2" x2={cubeX} y2={height - 2} stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
        {magnetX != null ? (
          <line
            x1={magnetX}
            y1="2"
            x2={magnetX}
            y2={height - 2}
            stroke="rgba(251,191,36,0.45)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        ) : null}
        {path ? (
          <path d={path} fill={accent} fillOpacity="0.88" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
        ) : null}
        {row.n ? (
          <>
            <line
              x1={medianX}
              y1={mid - 4}
              x2={medianX}
              y2={mid + 4}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1.5"
            />
            <circle cx={meanX} cy={mid} r="3" fill="white" stroke={accent} strokeWidth="1.5" />
          </>
        ) : null}
      </svg>
    </div>
  )
}

function SliceRow({
  label,
  slice,
}: {
  label: string
  slice: NonNullable<ReturnType<typeof profileCubePower>>['spells']
}) {
  return (
    <tr className="border-t border-white/8">
      <td className="py-2">{label}</td>
      <td>{slice.n}</td>
      <td>{formatElo(slice.p10)}</td>
      <td>{formatElo(slice.p25)}</td>
      <td>{formatElo(slice.median)}</td>
      <td>{formatElo(slice.p75)}</td>
      <td>{formatElo(slice.p90)}</td>
      <td>{formatElo(slice.iqr)}</td>
    </tr>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs tracking-wide text-stone-400 uppercase">{label}</p>
      <p className="text-xl text-amber-50">{value}</p>
    </div>
  )
}

function DensityChart({
  bars,
  spellCount,
}: {
  bars: Array<{ label: string; start: number; count: number }>
  spellCount: number
}) {
  const rows = bars
    .map((bar, i) => ({
      ...bar,
      typical: typicalSpellCount(i, spellCount),
    }))
    .filter((row) => row.count > 0 || row.typical > 0)
  const max = Math.max(1, ...rows.map((row) => Math.max(row.count, row.typical)))
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.start}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{row.label}</span>
            <span className="text-stone-400">
              {row.count}
              <span className="text-stone-500"> · typical {row.typical}</span>
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/25"
              style={{ width: `${(100 * row.typical) / max}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-200/80"
              style={{ width: `${(100 * row.count) / max}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function BarList({ items }: { items: Array<{ key: string; label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{item.label}</span>
            <span className="text-stone-400">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full bg-amber-200/70"
              style={{ width: `${(100 * item.value) / max}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
