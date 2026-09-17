import type { ReactNode } from 'react'

export function FieldTip({ label, tip, children }: { label: string; tip: string; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-white/25 text-[10px] leading-none text-stone-300"
        title={tip}
      >
        ?
      </span>
      {children}
    </span>
  )
}
