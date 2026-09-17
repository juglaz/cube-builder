import { libraryThemeCounts } from '../lib/cardMeta'
import type { CardTheme, LibraryCard, Theme } from '../types'
import { chipsForCard, useCardHover } from './CardHoverPreview'
import { PanSurface } from './PanSurface'

type Props = {
  cards: LibraryCard[]
  themes: Theme[]
  tags: CardTheme[]
  selectedId?: string | null
  className?: string
  pan?: boolean
  onSelect: (card: LibraryCard) => void
}

export function CardGrid({ cards, themes, tags, selectedId, className = '', pan, onSelect }: Props) {
  const { hoverProps, preview, clearHover } = useCardHover()
  const themeById = new Map(themes.map((t) => [t.id, t]))
  const counts = libraryThemeCounts(tags)

  const grid = (
    <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {cards.map((card) => {
        const chips = chipsForCard(card, themeById, tags, counts)
        return (
          <button
            key={card.oracleId}
            type="button"
            onClick={() => onSelect(card)}
            {...hoverProps(card, chips)}
            className={`self-start overflow-hidden rounded-xl border text-left ${
              pan ? 'cursor-grab active:cursor-grabbing' : ''
            } ${
              selectedId === card.oracleId
                ? 'border-amber-200 shadow-[0_0_0_1px_rgba(253,230,138,0.4)]'
                : 'border-white/10 hover:border-white/25'
            }`}
          >
            {card.imageNormal ? (
              <img
                src={card.imageNormal}
                alt={card.name}
                draggable={false}
                loading="lazy"
                className="pointer-events-none aspect-[488/680] w-full select-none bg-black object-cover"
              />
            ) : (
              <div className="flex aspect-[488/680] items-center justify-center bg-black/40 p-3 text-sm">
                {card.name}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )

  if (pan) {
    return (
      <PanSurface
        className={`h-full min-h-[16rem] cursor-grab overflow-auto overscroll-contain rounded-xl border border-white/10 bg-[#16181d] active:cursor-grabbing ${className}`}
        onPanStart={clearHover}
      >
        {grid}
        {preview}
      </PanSurface>
    )
  }

  return (
    <>
      {grid}
      {preview}
    </>
  )
}
