import { useId } from 'react'
import { FieldTip } from './FieldTip'
import { ELO_AXIS_MAX, ELO_AXIS_MIN, eloBinIndex } from '../lib/elo'

function areaPath(counts: number[], width: number, height: number): string {
  if (counts.length === 0 || width <= 0 || height <= 0) return ''
  const peak = Math.max(...counts, 1)
  const last = counts.length - 1
  const xAt = (i: number) => (last <= 0 ? 0 : (i / last) * width)
  const yAt = (c: number) => height - (c / peak) * height
  let d = `M 0 ${height}`
  counts.forEach((count, i) => {
    d += ` L ${xAt(i).toFixed(2)} ${yAt(count).toFixed(2)}`
  })
  d += ` L ${width} ${height} Z`
  return d
}

export function EloBandControl({
  eloMin,
  eloMax,
  eloExemptLands,
  histogram,
  disabled,
  onChange,
}: {
  eloMin: number
  eloMax: number
  eloExemptLands: boolean
  histogram: number[]
  disabled?: boolean
  onChange: (next: { eloMin: number; eloMax: number; eloExemptLands: boolean }) => void
}) {
  const clipId = useId().replace(/:/g, '')
  const bins = histogram.length > 0 ? histogram : Array.from({ length: 60 }, () => 0)
  const width = 600
  const height = 56
  const span = ELO_AXIS_MAX - ELO_AXIS_MIN
  const left = ((eloMin - ELO_AXIS_MIN) / span) * 100
  const right = ((eloMax - ELO_AXIS_MIN) / span) * 100
  const clipStart = eloBinIndex(eloMin) / bins.length
  const clipEnd = (eloBinIndex(eloMax) + 1) / bins.length
  const fullPath = areaPath(bins, width, height)
  const rated = bins.reduce((sum, n) => sum + n, 0)

  function setMin(value: number) {
    const next = Math.min(value, eloMax)
    onChange({ eloMin: next, eloMax, eloExemptLands })
  }

  function setMax(value: number) {
    const next = Math.max(value, eloMin)
    onChange({ eloMin, eloMax: next, eloExemptLands })
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <FieldTip
        label="Cube Cobra Elo band"
        tip="Draft pick Elo from Cube Cobra. Cards outside this range leave the candidate pool. Missing ratings count as 1200. Seed crystals always stay. Lands can be exempt so fetch lands still fill the mana base."
      />
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full overflow-visible" aria-hidden>
          <path d={fullPath} fill="rgba(255,255,255,0.08)" />
          <defs>
            <clipPath id={clipId}>
              <rect x={clipStart * width} y={0} width={Math.max(1, (clipEnd - clipStart) * width)} height={height} />
            </clipPath>
          </defs>
          <path d={fullPath} fill="rgba(253, 230, 138, 0.45)" clipPath={`url(#${clipId})`} />
        </svg>
        {rated === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-stone-500">
            Download Cube Cobra Elo on Themes to see density
          </p>
        )}
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amber-200/55"
          style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
        />
        <input
          type="range"
          min={ELO_AXIS_MIN}
          max={ELO_AXIS_MAX}
          step={10}
          value={eloMin}
          disabled={disabled}
          onChange={(e) => setMin(Number(e.target.value))}
          className="elo-range"
          style={{ zIndex: 2 }}
          aria-label="Minimum Elo"
        />
        <input
          type="range"
          min={ELO_AXIS_MIN}
          max={ELO_AXIS_MAX}
          step={10}
          value={eloMax}
          disabled={disabled}
          onChange={(e) => setMax(Number(e.target.value))}
          className="elo-range"
          style={{ zIndex: 3 }}
          aria-label="Maximum Elo"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-400">
        <label className="flex items-center gap-2">
          Min
          <input
            type="number"
            min={ELO_AXIS_MIN}
            max={eloMax}
            step={10}
            value={eloMin}
            disabled={disabled}
            onChange={(e) => setMin(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1"
          />
        </label>
        <span>
          {rated > 0 ? `${rated.toLocaleString()} rated cards` : 'Elo catalog not downloaded'}
        </span>
        <label className="flex items-center gap-2">
          Max
          <input
            type="number"
            min={eloMin}
            max={ELO_AXIS_MAX}
            step={10}
            value={eloMax}
            disabled={disabled}
            onChange={(e) => setMax(Number(e.target.value))}
            className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={eloExemptLands}
            disabled={disabled}
            onChange={(e) => onChange({ eloMin, eloMax, eloExemptLands: e.target.checked })}
          />
          Exempt lands
        </label>
      </div>
    </div>
  )
}
