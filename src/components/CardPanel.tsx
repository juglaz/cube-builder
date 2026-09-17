import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { cardPreviewImages } from '../lib/cardImages'
import { libraryThemeCounts, sortThemesByCardCount } from '../lib/cardMeta'
import type { CardTheme, Cube, LibraryCard, Synergy, Theme } from '../types'

type Props = {
  card: LibraryCard | null
  themes: Theme[]
  catalog?: Theme[]
  tags: CardTheme[]
  cubes: Cube[]
  onSetTheme: (themeId: string, synergy: Synergy) => void
  onRemoveTheme: (themeId: string) => void
  onAddToCube: (cubeId: string) => void
  onRemoveFromCube?: () => void
  inCurrentCube?: boolean
}

export function CardPanel({
  card,
  themes,
  catalog,
  tags,
  cubes,
  onSetTheme,
  onRemoveTheme,
  onAddToCube,
  onRemoveFromCube,
  inCurrentCube,
}: Props) {
  const catalogHits =
    useLiveQuery(
      () => (card ? db.catalogTaggings.where('oracleId').equals(card.oracleId).toArray() : []),
      [card?.oracleId],
    ) ?? []

  if (!card) {
    return (
      <aside className="h-full min-h-0 overflow-y-auto rounded-2xl border border-dashed border-white/10 p-5 text-stone-400">
        Select a card to edit themes and cube membership.
      </aside>
    )
  }

  const names = catalog ?? themes
  const cardTags = tags.filter((t) => t.oracleId === card.oracleId)
  const themeIds = new Set([...cardTags.map((t) => t.themeId), ...catalogHits.map((h) => h.tagId)])
  const onCardThemes = sortThemesByCardCount(
    [...themeIds].map((id) => names.find((t) => t.id === id)).filter((t): t is Theme => Boolean(t)),
    libraryThemeCounts(tags),
  )

  const images = cardPreviewImages(card)

  return (
    <aside className="h-full min-h-0 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-4">
      {images.length > 0 ? (
        <div className="space-y-2">
          {images.map((src, index) => (
            <img
              key={src}
              src={src}
              alt={index === 0 ? card.name : `${card.name} (back)`}
              className="w-full rounded-xl"
            />
          ))}
        </div>
      ) : null}
      <div>
        <h2 className="text-lg text-amber-50">{card.name}</h2>
        <p className="text-sm text-stone-400">
          {card.manaCost} · {card.typeLine}
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200">{card.oracleText}</p>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Themes on this card</h3>
        <div className="space-y-2">
          {onCardThemes.map((theme) => {
            const tag = cardTags.find((t) => t.themeId === theme.id)
            const catalogHit = catalogHits.find((h) => h.tagId === theme.id)
            const synergy = tag?.synergy ?? catalogHit?.synergy
            return (
              <div key={theme.id} className="flex items-center justify-between gap-3">
                <span className="text-sm" title={theme.description || undefined}>
                  {theme.name}
                </span>
                <div className="flex items-center gap-1">
                  {([1, 2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onSetTheme(theme.id, n)}
                      className={`h-8 w-8 rounded-lg text-sm ${
                        synergy === n
                          ? 'bg-amber-200 text-stone-900'
                          : 'bg-white/10 text-stone-200 hover:bg-white/20'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  {tag && (
                    <button
                      type="button"
                      onClick={() => onRemoveTheme(theme.id)}
                      className="ml-1 text-xs text-stone-400 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {onCardThemes.length === 0 && (
            <p className="text-sm text-stone-400">No Tagger tags on this card yet.</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm tracking-wide text-amber-100/80 uppercase">Cubes</h3>
        {inCurrentCube && onRemoveFromCube && (
          <button
            type="button"
            onClick={onRemoveFromCube}
            className="mb-2 w-full rounded-xl bg-red-400/20 px-3 py-2 text-sm text-red-100"
          >
            Remove from this cube
          </button>
        )}
        <div className="flex flex-col gap-2">
          {cubes.map((cube) => (
            <button
              key={cube.id}
              type="button"
              onClick={() => onAddToCube(cube.id)}
              className="rounded-xl bg-white/8 px-3 py-2 text-left text-sm hover:bg-white/12"
            >
              Add to {cube.name}
            </button>
          ))}
          {cubes.length === 0 && <p className="text-sm text-stone-400">No cubes yet.</p>}
        </div>
      </section>
    </aside>
  )
}
