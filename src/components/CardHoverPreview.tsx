import { useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { cardHoverImages, type CardImageSource } from '../lib/cardImages'
import type { CardTheme, Theme } from '../types'

export type CardHoverChip = {
  id: string
  name: string
  accent: string
  synergy?: number
  description?: string
}

export type CardHoverSource = string | string[] | CardImageSource

export function chipsForCard(
  card: { oracleId: string },
  themeById: Map<string, Theme>,
  tags: CardTheme[],
  counts: Map<string, number>,
): CardHoverChip[] {
  return tags
    .filter((t) => t.oracleId === card.oracleId)
    .sort((a, b) => {
      const themeA = themeById.get(a.themeId)
      const themeB = themeById.get(b.themeId)
      const countA = counts.get(a.themeId) ?? themeA?.taggingCount ?? 0
      const countB = counts.get(b.themeId) ?? themeB?.taggingCount ?? 0
      if (countB !== countA) return countB - countA
      return (themeA?.name ?? '').localeCompare(themeB?.name ?? '')
    })
    .map((tag) => {
      const theme = themeById.get(tag.themeId)
      return {
        id: tag.themeId,
        name: theme?.name ?? 'Theme',
        accent: theme?.accent ?? '#b0894d',
        synergy: tag.synergy,
        description: theme?.description,
      }
    })
}

type Hover = {
  srcs: string[]
  x: number
  y: number
  chips?: CardHoverChip[]
}

const CARD_WIDTH = 244
const LARGE_WIDTH = 288
const CARD_RATIO = 680 / 488
const FACE_GAP = 8

function previewBox(hover: Hover) {
  const count = Math.max(1, hover.srcs.length)
  let cardWidth = hover.chips ? LARGE_WIDTH : CARD_WIDTH
  const rawWidth = cardWidth * count + FACE_GAP * (count - 1)
  const maxWidth = typeof window === 'undefined' ? rawWidth : Math.max(160, window.innerWidth - 16)
  if (rawWidth > maxWidth) cardWidth = (maxWidth - FACE_GAP * (count - 1)) / count
  const width = cardWidth * count + FACE_GAP * (count - 1)
  const cardHeight = cardWidth * CARD_RATIO
  const chipRows = hover.chips ? Math.max(1, Math.ceil(hover.chips.length / 3)) : 0
  const chipsHeight = hover.chips?.length ? 12 + chipRows * 26 : 0
  return { width, cardWidth, height: cardHeight + chipsHeight }
}

function previewStyle(hover: Hover): { left: number; top: number } {
  const { width, height } = previewBox(hover)
  const pad = 16
  let left = hover.x + pad
  let top = hover.y + pad
  if (left + width > window.innerWidth - 8) left = hover.x - width - pad
  if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8)
  if (left < 8) left = 8
  return { left, top }
}

export function useCardHover() {
  const [hover, setHover] = useState<Hover | null>(null)
  const suppress = useRef(false)

  function clearHover() {
    suppress.current = true
    setHover(null)
  }

  function hoverProps(source?: CardHoverSource, chips?: CardHoverChip[]) {
    const srcs = cardHoverImages(source)
    if (srcs.length === 0) return {}
    const show = (event: MouseEvent) => {
      if (suppress.current) return
      setHover({ srcs, x: event.clientX, y: event.clientY, chips: chips?.length ? chips : undefined })
    }
    return {
      onMouseEnter: (event: MouseEvent) => {
        suppress.current = false
        show(event)
      },
      onMouseMove: show,
      onMouseLeave: () => {
        suppress.current = false
        setHover(null)
      },
      onPointerDown: () => {
        suppress.current = true
        setHover(null)
      },
    }
  }

  const box = hover ? previewBox(hover) : null
  const preview = hover && box ? (
    <div
      className="pointer-events-none fixed z-50"
      style={{ ...previewStyle(hover), width: box.width }}
    >
      <div className="flex" style={{ gap: hover.srcs.length > 1 ? FACE_GAP : 0 }}>
        {hover.srcs.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            className="rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.65)]"
            style={{ width: box.cardWidth }}
          />
        ))}
      </div>
      {hover.chips && hover.chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1 rounded-xl bg-[#16181d]/95 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          {hover.chips.map((chip) => (
            <span
              key={chip.id}
              className="rounded-full px-2 py-0.5 text-[11px] text-amber-50"
              style={{ background: `${chip.accent}55` }}
            >
              {chip.name}
              {chip.synergy != null ? ` ${chip.synergy}` : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  ) : null

  return { hoverProps, preview, clearHover }
}

export function CardHoverName({
  name,
  image,
  chips,
  className,
}: {
  name: string
  image?: CardHoverSource
  chips?: CardHoverChip[]
  className?: string
  children?: ReactNode
}) {
  const { hoverProps, preview } = useCardHover()
  return (
    <>
      <span className={className} {...hoverProps(image, chips)}>
        {name}
      </span>
      {preview}
    </>
  )
}
