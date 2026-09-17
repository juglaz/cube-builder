import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoverageReport } from '../components/CoverageReport'
import { EloBandControl } from '../components/EloBandControl'
import { FieldTip } from '../components/FieldTip'
import { GenerationPresetBar } from '../components/GenerationPresetBar'
import { SeedCardSelect } from '../components/SeedCardSelect'
import { SeedThemePicker } from '../components/SeedThemePicker'
import { useLiveData } from '../hooks/useLiveData'
import { eloBandIsOpen } from '../lib/elo'
import { getGenerationDraft, patchGenerationDraft, useGenerationDraft } from '../lib/generationDraft'
import { generateCubeMip } from '../lib/generatorMip'
import { createCube, replaceCubeCards } from '../lib/repo'
import { prepareGenerationInputs } from '../lib/runGeneration'
import type { GenerateReport } from '../lib/generationShared'
import type { GenerationKnobs, GenerationSettings } from '../types'

export function GeneratePage() {
  const { themes, cubes, cardCatalogMeta, cobraCatalogMeta, cobraEloMeta, catalogMeta } = useLiveData()
  const navigate = useNavigate()
  const draft = useGenerationDraft()
  const { seeds, themeIds, knobs, newName, preview, previewIds } = draft
  const destination =
    draft.destination === 'new' || cubes.some((cube) => cube.id === draft.destination)
      ? draft.destination
      : 'new'
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setSeeds(next: typeof seeds) {
    patchGenerationDraft({ seeds: next })
  }

  function setThemeIds(next: string[]) {
    patchGenerationDraft({ themeIds: next })
  }

  function setKnobs(next: GenerationKnobs | ((prev: GenerationKnobs) => GenerationKnobs)) {
    const knobs = typeof next === 'function' ? next(getGenerationDraft().knobs) : next
    patchGenerationDraft({ knobs })
  }

  const seedOracleIds = useMemo(() => seeds.map((c) => c.oracleId), [seeds])
  const oracleReady = Boolean(cardCatalogMeta)
  const cobraReady = Boolean(cobraCatalogMeta)
  const eloReady = Boolean(cobraEloMeta)
  const eloRequired = !eloBandIsOpen(knobs.eloMin, knobs.eloMax)
  const catalogsReady = oracleReady && cobraReady && (!eloRequired || eloReady)

  const settings: GenerationSettings = useMemo(
    () => ({
      themeIds,
      seedOracleIds,
      seedCards: seeds.map((card) => ({
        oracleId: card.oracleId,
        name: card.name,
        imageNormal: card.imageNormal,
        typeLine: card.typeLine,
        faces: card.faces,
      })),
      ...knobs,
    }),
    [themeIds, seedOracleIds, seeds, knobs],
  )

  function patchKnobs(partial: Partial<GenerationKnobs>) {
    setKnobs((prev) => ({ ...prev, ...partial }))
  }

  async function saveResult(oracleIds: string[], report: GenerateReport) {
    if (oracleIds.length === 0) {
      setError('No cards were selected. Check the coverage report below.')
      return
    }
    let cubeId = destination
    if (destination === 'new') {
      const cube = await createCube(newName || 'Generated cube', knobs.targetSize)
      cubeId = cube.id
    }
    await replaceCubeCards(cubeId, oracleIds, { ...settings, engine: 'mip' })
    navigate(`/cubes/${cubeId}`)
  }

  async function run(save: boolean) {
    if (seeds.length === 0) {
      setError('Select at least one seed crystal card.')
      return
    }
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const { pool, cobraNeighbors, overlaps, tags, themeOverlap, themes: themeRows, eloMap } =
        await prepareGenerationInputs(settings, themes, setProgress)
      setProgress(`MIP builder: solving a ${knobs.targetSize}-card model from ${pool.length} candidates…`)
      const result = await generateCubeMip(
        pool,
        themeRows,
        tags,
        settings,
        cobraNeighbors,
        overlaps,
        themeOverlap,
        eloMap,
      )
      patchGenerationDraft({ preview: result.report, previewIds: result.oracleIds })
      if (save) {
        if (result.oracleIds.length === 0) {
          setError('No cards were selected. Check the coverage report below.')
          return
        }
        await saveResult(result.oracleIds, result.report)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-amber-50">Generate a cube</h2>
        <p className="text-stone-400">
          Pick seed crystals, then click creature types or Tagger tags on those cards to favor.
          Creature types (Dragon, Vampire, …) come from the type line. HiGHS builds the list,
          then a support pass fills enablers or drops stranded payoffs.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm tracking-wide text-amber-100/80 uppercase">
          <FieldTip
            label="Seed crystals"
            tip="Each seed is a build-around. Creature types on the type line are selectable lanes and start selected. Click Tagger tags too if you want those. Neighbors listed by several seeds are treated as glue."
          />
        </h3>
        {!oracleReady ? (
          <p className="text-stone-400">
            Download the Oracle card catalog on <Link to="/themes">Themes / Tagger</Link> first so
            seed names can be searched locally.
          </p>
        ) : (
          <>
            <SeedThemePicker
              seeds={seeds}
              selectedIds={themeIds}
              onChange={setThemeIds}
              onRemoveSeed={(oracleId) =>
                setSeeds((prev) => prev.filter((c) => c.oracleId !== oracleId))
              }
              disabled={busy}
              taggerReady={Boolean(catalogMeta)}
            />
            <SeedCardSelect
              selected={seeds}
              onChange={setSeeds}
              disabled={busy}
              hideSelected
            />
          </>
        )}
        {oracleReady && !cobraReady && (
          <p className="text-sm text-amber-100/90">
            Cube Cobra neighbors are not installed yet. Download that catalog on{' '}
            <Link to="/themes" className="underline">
              Themes / Tagger
            </Link>
            .
          </p>
        )}
        {oracleReady && cobraReady && eloRequired && !eloReady && (
          <p className="text-sm text-amber-100/90">
            Cube Cobra Elo is not installed yet. Download it on{' '}
            <Link to="/themes" className="underline">
              Themes / Tagger
            </Link>{' '}
            to use an Elo band.
          </p>
        )}
      </section>

      <GenerationPresetBar knobs={knobs} disabled={busy} onApply={setKnobs} />

      <section className="grid gap-4 md:grid-cols-2">
        <EloBandControl
          eloMin={knobs.eloMin}
          eloMax={knobs.eloMax}
          eloExemptLands={knobs.eloExemptLands}
          histogram={cobraEloMeta?.histogram ?? []}
          disabled={busy}
          onChange={(next) => patchKnobs(next)}
        />
        <NumberField
          label="Target size"
          tip="How many cards to put in the cube. 360 supports a typical 8-person 3x15 draft."
          value={knobs.targetSize}
          min={40}
          max={720}
          step={1}
          onChange={(targetSize) => patchKnobs({ targetSize })}
        />
        <NumberField
          label="Overlap bonus"
          tip="Extra score for glue: Cube Cobra neighbors of several seeds, and cards that carry the Tagger tags you favored on those seeds. Higher values pull toward shared lanes instead of each seed's private cards."
          value={knobs.overlapBonus}
          min={0}
          max={12}
          step={0.5}
          onChange={(overlapBonus) => patchKnobs({ overlapBonus })}
        />
        <NumberField
          label="Theme as-fan target"
          tip="Pack visibility for up to four favored tags (first four in your list). Extra tags still glue the cube together, but they do not each get a floor — that was flooding the list with too many dominant themes."
          value={knobs.themeAsFanTarget}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(themeAsFanTarget) => patchKnobs({ themeAsFanTarget })}
        />
        <NumberField
          label="Land quota"
          tip="Fraction of the cube reserved for lands. 0.17 (17%) is Lucky Paper's floor for reliable two-color decks."
          value={knobs.landQuota}
          min={0}
          max={0.4}
          step={0.01}
          onChange={(landQuota) => patchKnobs({ landQuota })}
        />
        <NumberField
          label="Color balance tightness"
          tip="How hard the generator works to keep White/Blue/Black/Red/Green counts close. Higher is stricter; lower allows more color skew."
          value={knobs.colorTightness}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(colorTightness) => patchKnobs({ colorTightness })}
        />
        <label className="text-sm">
          <FieldTip
            label="Destination"
            tip="Create a new cube, or replace an existing cube's list with this generation."
          />
          <select
            value={destination}
            onChange={(e) => patchGenerationDraft({ destination: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            <option value="new">New cube</option>
            {cubes.map((c) => (
              <option key={c.id} value={c.id}>
                Replace {c.name}
              </option>
            ))}
          </select>
        </label>
        {destination === 'new' && (
          <label className="text-sm md:col-span-2">
            <FieldTip label="New cube name" tip="The name saved in your local cube list." />
            <input
              value={newName}
              onChange={(e) => patchGenerationDraft({ newName: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
            />
          </label>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !catalogsReady}
          onClick={() => void run(false)}
          className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-50"
        >
          Preview report
        </button>
        <button
          type="button"
          disabled={busy || !catalogsReady}
          onClick={() => void run(true)}
          className="rounded-xl bg-amber-200/20 px-4 py-2 text-amber-50 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Generate and save'}
        </button>
      </div>
      {progress && <p className="text-sm text-amber-100">{progress}</p>}
      {error && <p className="text-red-300">{error}</p>}

      {preview && (
        <CoverageReport
          title="MIP coverage"
          report={preview}
          saveDisabled={busy || previewIds.length === 0}
          onSave={() => {
            void (async () => {
              setBusy(true)
              setError(null)
              try {
                await saveResult(previewIds, preview)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Save failed')
              } finally {
                setBusy(false)
              }
            })()
          }}
        />
      )}
    </div>
  )
}

function NumberField({
  label,
  tip,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  tip: string
  value: number
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  return (
    <label className="text-sm">
      <FieldTip label={label} tip={tip} />
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
      />
    </label>
  )
}
