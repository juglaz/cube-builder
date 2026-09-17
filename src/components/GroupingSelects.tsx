import {
  PRIMARY_AXES,
  SECONDARY_AXES,
  defaultSecondary,
  type GroupAxis,
} from '../lib/cubeList'

type Props = {
  primary: GroupAxis
  secondary: GroupAxis
  onChange: (primary: GroupAxis, secondary: GroupAxis) => void
}

const selectClass =
  'rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-amber-50 outline-none'

export function GroupingSelects({ primary, secondary, onChange }: Props) {
  const thenOptions = SECONDARY_AXES.filter((axis) => axis.id === 'none' || axis.id !== primary)
  const thenValue = thenOptions.some((axis) => axis.id === secondary) ? secondary : 'none'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-stone-400">
        Columns
        <select
          value={primary === 'none' ? 'color' : primary}
          onChange={(event) => {
            const next = event.target.value as GroupAxis
            onChange(next, next === secondary ? defaultSecondary(next) : secondary)
          }}
          className={selectClass}
        >
          {PRIMARY_AXES.map((axis) => (
            <option key={axis.id} value={axis.id}>
              {axis.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-stone-400">
        Then
        <select
          value={thenValue}
          onChange={(event) => onChange(primary, event.target.value as GroupAxis)}
          className={selectClass}
        >
          {thenOptions.map((axis) => (
            <option key={axis.id} value={axis.id}>
              {axis.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
