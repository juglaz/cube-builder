import { useRef, type PointerEvent, type ReactNode } from 'react'

type Props = {
  className?: string
  children: ReactNode
  onPanStart?: () => void
}

export function PanSurface({ className = '', children, onPanStart }: Props) {
  const drag = useRef<{
    pointerId: number
    x: number
    y: number
    left: number
    top: number
    moved: boolean
    target: EventTarget | null
  } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType !== 'mouse') return
    if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) return
    event.preventDefault()
    const node = event.currentTarget
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
      moved: false,
      target: event.target,
    }
    node.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    if (!state.moved && dx * dx + dy * dy < 36) return
    if (!state.moved) {
      state.moved = true
      onPanStart?.()
    }
    event.currentTarget.scrollLeft = state.left - dx
    event.currentTarget.scrollTop = state.top - dy
  }

  function endPan(event: PointerEvent<HTMLDivElement>, commitClick: boolean) {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const clicked = !state.moved
    const target = state.target
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!commitClick || !clicked || !(target instanceof Element)) return
    const hit = target.closest('button, a')
    if (hit instanceof HTMLElement && event.currentTarget.contains(hit)) {
      hit.click()
    }
  }

  return (
    <div
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPan(event, true)}
      onPointerCancel={(event) => endPan(event, false)}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
    </div>
  )
}
