import { useMemo, useState, type MouseEvent } from 'react'
import { libraryThemeCounts } from '../lib/cardMeta'
import { groupCube, nameColorClass, type GroupAxis } from '../lib/cubeList'
import type { CardTheme, LibraryCard, Theme } from '../types'
import { CardContextMenu } from './CardContextMenu'
import { chipsForCard, useCardHover } from './CardHoverPreview'
import { PanSurface } from './PanSurface'

type Props = {
  cards: LibraryCard[]
  themes: Theme[]
  tags: CardTheme[]
  primary: GroupAxis
  secondary: GroupAxis
  columnThemeIds?: string[]
  selectedId?: string | null
  className?: string
  mode?: 'list' | 'images'
  onSelect: (card: LibraryCard) => void
  onRemove?: (card: LibraryCard) => void
}

export function CubeListView({
  cards,
  themes,
  tags,
  primary,
  secondary,
  columnThemeIds = [],
  selectedId,
  className = '',
  mode = 'list',
  onSelect,
  onRemove,
}: Props) {
  const { hoverProps, preview, clearHover } = useCardHover()
  const [menu, setMenu] = useState<{ x: number; y: number; card: LibraryCard } | null>(null)
  const themeById = useMemo(() => new Map(themes.map((theme) => [theme.id, theme])), [themes])
  const counts = useMemo(() => libraryThemeCounts(tags), [tags])
  const columns = useMemo(
    () =>
      groupCube(cards, {
        primary,
        secondary,
        themes,
        tags,
        themeIds: columnThemeIds,
      }),
    [cards, columnThemeIds, primary, secondary, tags, themes],
  )
  const images = mode === 'images'

  function openMenu(event: MouseEvent, card: LibraryCard) {
    if (!onRemove) return
    event.preventDefault()
    event.stopPropagation()
    clearHover()
    onSelect(card)
    setMenu({ x: event.clientX, y: event.clientY, card })
  }

  return (
    <PanSurface
      className={`h-full min-h-[16rem] cursor-grab overflow-auto overscroll-contain rounded-xl border border-white/10 bg-[#16181d] active:cursor-grabbing ${className}`}
      onPanStart={clearHover}
    >
      <div className="flex min-w-max select-none">
        {columns.map((column) => (
          <section
            key={column.id}
            className={`border-r border-black/40 last:border-r-0 ${
              images ? 'w-[13.5rem] shrink-0' : 'min-w-[148px] flex-1'
            }`}
          >
            <header
              className="sticky top-0 z-10 border-b border-black/30 px-2 py-1.5 text-center text-sm font-medium"
              style={{ color: column.accent, background: '#1c1f26' }}
            >
              {column.label}{' '}
              <span className="text-xs opacity-80">({column.cards.length})</span>
            </header>
            <div className={images ? 'px-1 pb-2' : 'px-1.5 pb-2'}>
              {column.sections.map((section, index) => (
                <div
                  key={section.id}
                  className={index === 0 ? 'pt-1' : 'mt-3 border-t border-white/20 pt-2'}
                >
                  {section.label ? (
                    <p
                      className="mb-1 rounded-sm px-1.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase"
                      style={{
                        color: section.accent ?? column.accent,
                        background: 'rgba(0, 0, 0, 0.35)',
                      }}
                    >
                      {section.label}{' '}
                      <span className="tracking-normal opacity-80">({section.cards.length})</span>
                    </p>
                  ) : null}
                  {images ? (
                    <div className="grid grid-cols-2 gap-1">
                      {section.cards.map((card) => (
                        <button
                          key={`${column.id}-${section.id}-${card.oracleId}`}
                          type="button"
                          onClick={() => onSelect(card)}
                          {...hoverProps(card, chipsForCard(card, themeById, tags, counts))}
                          onContextMenu={(event) => openMenu(event, card)}
                          className={`self-start overflow-hidden rounded-md border ${
                            selectedId === card.oracleId
                              ? 'border-amber-200 shadow-[0_0_0_1px_rgba(253,230,138,0.4)]'
                              : 'border-white/10'
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
                            <span className="block p-2 text-left text-xs">{card.name}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ul>
                      {section.cards.map((card) => (
                        <li key={`${column.id}-${section.id}-${card.oracleId}`}>
                          <button
                            type="button"
                            onClick={() => onSelect(card)}
                            {...hoverProps(card)}
                            onContextMenu={(event) => openMenu(event, card)}
                            className={`block w-full cursor-pointer truncate rounded px-1 py-px text-left text-[13px] leading-snug hover:bg-white/8 ${
                              selectedId === card.oracleId ? 'bg-white/12 ring-1 ring-amber-200/40' : ''
                            } ${nameColorClass(card)}`}
                          >
                            {card.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      {preview}
      {menu && onRemove && (
        <CardContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Remove from cube',
              danger: true,
              onSelect: () => onRemove(menu.card),
            },
          ]}
        />
      )}
    </PanSurface>
  )
}
