export type CardImageFace = {
  imageNormal?: string
  imageLarge?: string
}

export type CardImageSource = {
  imageNormal?: string
  imageLarge?: string
  faces?: CardImageFace[]
}

function scryfallSize(url: string, size: 'normal' | 'large'): string {
  if (size === 'large') return url.replace('/normal/', '/large/')
  return url.replace('/large/', '/normal/')
}

function pickFaceImage(face: CardImageFace, size: 'normal' | 'large'): string | undefined {
  const preferred = size === 'large' ? face.imageLarge || face.imageNormal : face.imageNormal || face.imageLarge
  return preferred ? scryfallSize(preferred, size) : undefined
}

/** Unique printable faces. Split/adventure cards share one image; transform DFCs return both. */
export function cardPreviewImages(card?: CardImageSource | null, size: 'normal' | 'large' = 'large'): string[] {
  if (!card) return []
  const seen = new Set<string>()
  const out: string[] = []
  const add = (src?: string) => {
    if (!src || seen.has(src)) return
    seen.add(src)
    out.push(src)
  }
  for (const face of card.faces ?? []) add(pickFaceImage(face, size))
  if (out.length === 0) add(pickFaceImage(card, size))
  return out
}

export function cardHoverImages(source?: string | string[] | CardImageSource): string[] {
  if (!source) return []
  if (typeof source === 'string') return [source]
  if (Array.isArray(source)) return source.filter(Boolean)
  return cardPreviewImages(source)
}
