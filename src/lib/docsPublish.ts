import type { CardFace, CardTheme, LibraryCard, Theme } from '../types'

export type DocsPublishMode = 'custom-cardlist' | 'generated-created' | 'generated-updated'

export type DocsPublishResult = {
  slug: string
  path: string
  url: string
  count: number
  mode: DocsPublishMode
}

export type DocsViewerCard = Pick<
  LibraryCard,
  | 'oracleId'
  | 'name'
  | 'cmc'
  | 'typeLine'
  | 'colors'
  | 'colorIdentity'
  | 'manaCost'
  | 'oracleText'
  | 'keywords'
  | 'imageNormal'
  | 'imageLarge'
  | 'layout'
> & {
  faces?: CardFace[]
}

export type DocsViewerTheme = Pick<Theme, 'id' | 'name' | 'description' | 'accent'>
export type DocsViewerTag = Pick<CardTheme, 'oracleId' | 'themeId' | 'synergy'>

type DocsPublishInput = {
  cubeId: string
  name: string
  description: string
  cards: DocsViewerCard[]
  themes: DocsViewerTheme[]
  tags: DocsViewerTag[]
  slug?: string
}

export function publishedDocsUrl(slug: string): string {
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (localHosts.has(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:4177/${encodeURIComponent(slug)}/`
  }
  return `https://juglaz.github.io/cube-builder/${encodeURIComponent(slug)}/`
}

export async function publishCubeDocs(input: DocsPublishInput): Promise<DocsPublishResult> {
  const response = await fetch('/__cube-docs/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => null)) as
    | (Partial<DocsPublishResult> & { error?: string })
    | null
  if (!response.ok) {
    throw new Error(payload?.error || 'Docs publishing is only available from the local dev server.')
  }
  if (
    !payload ||
    typeof payload.slug !== 'string' ||
    typeof payload.path !== 'string' ||
    typeof payload.url !== 'string' ||
    typeof payload.count !== 'number' ||
    !['custom-cardlist', 'generated-created', 'generated-updated'].includes(payload.mode ?? '')
  ) {
    throw new Error('The docs publisher returned an invalid response.')
  }
  return payload as DocsPublishResult
}
