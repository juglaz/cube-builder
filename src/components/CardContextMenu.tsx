import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export type CardContextMenuItem = {
  label: string
  danger?: boolean
  onSelect: () => void
}

type Props = {
  x: number
  y: number
  items: CardContextMenuItem[]
  onClose: () => void
}

export function CardContextMenu({ x, y, items, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()
    const pad = 8
    node.style.left = `${Math.min(Math.max(pad, x), window.innerWidth - width - pad)}px`
    node.style.top = `${Math.min(Math.max(pad, y), window.innerHeight - height - pad)}px`
  }, [x, y])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onPointer = (event: PointerEvent) => {
      if (event.button === 2) return
      const node = root.current
      if (node && event.target instanceof Node && node.contains(event.target)) return
      onClose()
    }
    const onScroll = () => onClose()
    const listen = window.setTimeout(() => {
      window.addEventListener('keydown', onKey)
      window.addEventListener('pointerdown', onPointer, true)
      window.addEventListener('scroll', onScroll, true)
    }, 0)
    return () => {
      window.clearTimeout(listen)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={root}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-[80] min-w-[11rem] rounded-lg border border-white/15 bg-[#1c1f26] py-1 text-sm text-amber-50"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`block w-full px-3 py-1.5 text-left hover:bg-white/10 ${
            item.danger ? 'text-rose-200' : ''
          }`}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
