import { CardHoverName } from './CardHoverPreview'
import { formatMetricValue } from '../lib/balance'
import type { GenerateReport } from '../lib/generator'

export function CoverageReport({
  title,
  report,
  saveDisabled,
  onSave,
}: {
  title: string
  report: GenerateReport
  saveDisabled: boolean
  onSave: () => void
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-amber-50">{title}</h3>
        <button
          type="button"
          disabled={saveDisabled}
          onClick={onSave}
          className="rounded-xl bg-amber-200/20 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-50"
        >
          Save this cube
        </button>
      </div>
      {report.solver && (
        <p className="text-sm text-stone-300">
          HiGHS {report.solver.status.toLowerCase()} in {report.solver.runtimeMs} ms
          {report.solver.objective != null ? `; objective ${report.solver.objective.toFixed(1)}` : ''}
          {`; pool ${report.solver.poolSize.toLocaleString()} cards`}.
        </p>
      )}
      {report.seedNames.length > 0 && (
        <p className="text-sm text-stone-300">Seeds: {report.seedNames.join(', ')}</p>
      )}
      <ul className="text-sm text-stone-300">
        {report.phases.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {report.evaluation && (
        <p className="text-sm text-amber-50">
          Design score {report.evaluation.overall}/100 vs popular cubes
          {report.evaluation.metrics
            .filter((row) => row.score < 70)
            .map((row) => ` · ${row.label} ${formatMetricValue(row)}`)
            .join('')}
        </p>
      )}
      {report.colorCoverage.length > 0 && (
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
            {report.colorCoverage.map((row) => (
              <tr key={row.color} className="border-t border-white/8">
                <td className="py-2">{row.color}</td>
                <td>{row.identity}</td>
                <td>{row.pips.toFixed(1)}</td>
                <td>{row.target.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.typeCoverage.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-stone-400">
            <tr>
              <th className="py-2">Card type</th>
              <th>Count</th>
              <th>Min</th>
            </tr>
          </thead>
          <tbody>
            {report.typeCoverage.map((row) => (
              <tr key={row.type} className="border-t border-white/8">
                <td className="py-2">{row.type}</td>
                <td>{row.count}</td>
                <td>{row.min}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.themeCoverage.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-stone-400">
            <tr>
              <th className="py-2">Favored tag</th>
              <th>Count</th>
              <th>Min</th>
              <th>As-fan</th>
            </tr>
          </thead>
          <tbody>
            {report.themeCoverage.map((row) => (
              <tr key={row.themeId} className="border-t border-white/8">
                <td className="py-2">{row.name}</td>
                <td>{row.count}</td>
                <td>{row.min > 0 ? row.min : 'glue'}</td>
                <td>{row.asFan.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.overlapBands.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-stone-400">
            <tr>
              <th className="py-2">Synergistic with</th>
              <th>Cards</th>
            </tr>
          </thead>
          <tbody>
            {report.overlapBands.map((row) => (
              <tr key={row.hits} className="border-t border-white/8">
                <td className="py-2">
                  {row.hits >= 2
                    ? `${row.hits} seeds`
                    : row.hits === 1
                      ? '1 seed'
                      : 'No direct seed overlap'}
                </td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {report.libraryGaps.map((g) => (
        <p key={g} className="text-sm text-amber-100">
          {g}
        </p>
      ))}
      {report.unmet.map((g) => (
        <p key={g} className="text-sm text-red-200">
          {g}
        </p>
      ))}
      {report.bridges.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-stone-400">
            {report.bridges.length} glue cards (Cobra-synergistic with two seeds, or sharing tags
            across seeds)
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-300">
            {report.bridges.slice(0, 40).map((b) => (
              <li key={b.oracleId}>
                <CardHoverName name={b.name} image={b} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
