import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const GENERATED_PAGE_MARKER = 'data-cube-builder-generated="true"'
const ARCHIVE_START = '<!-- cube-builder:generated:start -->'
const ARCHIVE_END = '<!-- cube-builder:generated:end -->'
const MAX_BODY_BYTES = 20 * 1024 * 1024

type ViewerFace = {
  name: string
  manaCost: string
  typeLine: string
  oracleText: string
  imageNormal?: string
  imageLarge?: string
}

type ViewerCard = {
  oracleId: string
  name: string
  cmc: number
  typeLine: string
  colors: string[]
  colorIdentity: string[]
  manaCost: string
  oracleText: string
  keywords: string[]
  imageNormal: string
  imageLarge: string
  layout: string
  faces?: ViewerFace[]
}

type ViewerTheme = {
  id: string
  name: string
  description: string
  accent: string
}

type ViewerTag = {
  oracleId: string
  themeId: string
  synergy: number
}

type PublishPayload = {
  cubeId: string
  name: string
  description: string
  cards: ViewerCard[]
  themes: ViewerTheme[]
  tags: ViewerTag[]
  slug?: string
}

type PublishedCube = {
  cubeId: string
  slug: string
  name: string
  description: string
}

type PublishMode = 'custom-cardlist' | 'generated-created' | 'generated-updated'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function slugifyCubeName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\b[\s_-]*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'cube'
}

function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function generatedPageHtml(cube: PublishedCube, cardCount: number): string {
  const name = escapeHtml(cube.name)
  const description = escapeHtml(cube.description)
  return `<!doctype html>
<html lang="en" class="lore-active lore-index">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1a1410">
  <title>${name}</title>
  <link rel="stylesheet" href="../shared/lore.css?v=17">
</head>
<body class="lore-root lore-index" ${GENERATED_PAGE_MARKER} data-cube-id="${escapeHtml(cube.cubeId)}">
  <header class="hero" id="top">
    <div class="hero-inner">
      <p class="eyebrow">Cube Lore</p>
      <h1>${name}</h1>
      <p class="hero-deck">${description}</p>
    </div>
  </header>

  <nav class="lore-nav" aria-label="Lore">
    <div class="inner">
      <a class="studio" href="../">Cube Lore</a>
      <a class="brand" href="#top">${name}</a>
      <div class="links"><a href="#cards">Cards</a></div>
    </div>
  </nav>

  <main>
    <section class="section spoilers" id="cards">
      <p class="eyebrow">Cube list</p>
      <h2>${name}</h2>
      <p class="lead">${description}</p>
      <details class="spoiler-box">
        <summary>Show the card list</summary>
        <div class="spoiler-toolbar sans">
          <button type="button" data-copy="cardlist" data-copy-url="./cardlist.txt">Copy card list</button>
          <span class="spoiler-count" data-card-count>${cardCount} cards</span>
        </div>
        <div id="card-grid" class="card-grid">Loading cards…</div>
      </details>
    </section>
  </main>

  <footer class="lore-footer">Generated from Cube Builder · Card names and Magic: The Gathering are property of Wizards of the Coast</footer>
  <div id="card-zoom" class="card-zoom" hidden></div>
  <script src="../shared/lore.js?v=17"></script>
</body>
</html>
`
}

function archiveCard(cube: PublishedCube): string {
  const slug = escapeHtml(cube.slug)
  return `      <a class="cube-card" href="./${slug}/" data-generated-cube="${escapeHtml(cube.cubeId)}">
        <div class="cube-card-art"></div>
        <div class="cube-card-copy">
          <p class="eyebrow">/${slug}</p>
          <h2>${escapeHtml(cube.name)}</h2>
          <p>${escapeHtml(cube.description)}</p>
        </div>
      </a>`
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function chooseSlug(docsDir: string, payload: PublishPayload): Promise<string> {
  if (payload.slug) {
    if (!validSlug(payload.slug)) throw new Error('The saved docs slug is invalid.')
    return payload.slug
  }

  const base = slugifyCubeName(payload.name)
  let slug = base
  let suffix = 2
  while (await pathExists(join(docsDir, slug, 'index.html'))) {
    const html = await readFile(join(docsDir, slug, 'index.html'), 'utf8')
    const sameGeneratedCube =
      html.includes(GENERATED_PAGE_MARKER) &&
      html.includes(`data-cube-id="${escapeHtml(payload.cubeId)}"`)
    const sameCustomCube =
      !html.includes(GENERATED_PAGE_MARKER) &&
      (html.includes(`<h1>${escapeHtml(payload.name)}</h1>`) ||
        html.includes(`<title>${escapeHtml(payload.name)}</title>`))
    if (sameGeneratedCube || sameCustomCube) return slug
    slug = `${base}-${suffix}`
    suffix += 1
  }
  return slug
}

async function generatedCubes(docsDir: string): Promise<PublishedCube[]> {
  const entries = await readdir(docsDir, { withFileTypes: true })
  const cubes: PublishedCube[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const raw = await readFile(join(docsDir, entry.name, 'cube.json'), 'utf8')
      const cube = JSON.parse(raw) as Partial<PublishedCube>
      if (
        typeof cube.cubeId === 'string' &&
        typeof cube.slug === 'string' &&
        typeof cube.name === 'string' &&
        typeof cube.description === 'string'
      ) {
        cubes.push(cube as PublishedCube)
      }
    } catch {
      // Hand-authored docs pages intentionally have no cube.json.
    }
  }
  return cubes.sort((a, b) => a.name.localeCompare(b.name))
}

async function updateArchive(docsDir: string): Promise<void> {
  const path = join(docsDir, 'index.html')
  const html = await readFile(path, 'utf8')
  const start = html.indexOf(ARCHIVE_START)
  const end = html.indexOf(ARCHIVE_END)
  if (start < 0 || end < start) throw new Error('Generated archive markers are missing.')
  const cubes = await generatedCubes(docsDir)
  const content = cubes.length ? `\n${cubes.map(archiveCard).join('\n')}\n      ` : ''
  await writeFile(
    path,
    `${html.slice(0, start + ARCHIVE_START.length)}${content}${html.slice(end)}`,
    'utf8',
  )
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} must be a string${allowEmpty ? '' : ' with content'}.`)
  }
  return value.trim()
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings.`)
  }
  return value.map((item) => item.trim()).filter(Boolean)
}

function viewerFace(value: unknown, label: string): ViewerFace {
  const face = objectValue(value, label)
  return {
    name: stringValue(face.name, `${label}.name`),
    manaCost: stringValue(face.manaCost, `${label}.manaCost`, true),
    typeLine: stringValue(face.typeLine, `${label}.typeLine`, true),
    oracleText: stringValue(face.oracleText, `${label}.oracleText`, true),
    ...(typeof face.imageNormal === 'string' ? { imageNormal: face.imageNormal } : {}),
    ...(typeof face.imageLarge === 'string' ? { imageLarge: face.imageLarge } : {}),
  }
}

function viewerCard(value: unknown, index: number): ViewerCard {
  const label = `cards[${index}]`
  const card = objectValue(value, label)
  if (typeof card.cmc !== 'number' || !Number.isFinite(card.cmc) || card.cmc < 0) {
    throw new Error(`${label}.cmc must be a non-negative number.`)
  }
  if (card.faces !== undefined && !Array.isArray(card.faces)) {
    throw new Error(`${label}.faces must be an array.`)
  }
  return {
    oracleId: stringValue(card.oracleId, `${label}.oracleId`),
    name: stringValue(card.name, `${label}.name`),
    cmc: card.cmc,
    typeLine: stringValue(card.typeLine, `${label}.typeLine`, true),
    colors: stringArray(card.colors, `${label}.colors`),
    colorIdentity: stringArray(card.colorIdentity, `${label}.colorIdentity`),
    manaCost: stringValue(card.manaCost, `${label}.manaCost`, true),
    oracleText: stringValue(card.oracleText, `${label}.oracleText`, true),
    keywords: stringArray(card.keywords, `${label}.keywords`),
    imageNormal: stringValue(card.imageNormal, `${label}.imageNormal`, true),
    imageLarge: stringValue(card.imageLarge, `${label}.imageLarge`, true),
    layout: stringValue(card.layout, `${label}.layout`, true),
    ...(Array.isArray(card.faces)
      ? { faces: card.faces.map((face, faceIndex) => viewerFace(face, `${label}.faces[${faceIndex}]`)) }
      : {}),
  }
}

function viewerTheme(value: unknown, index: number): ViewerTheme {
  const label = `themes[${index}]`
  const theme = objectValue(value, label)
  return {
    id: stringValue(theme.id, `${label}.id`),
    name: stringValue(theme.name, `${label}.name`),
    description: stringValue(theme.description, `${label}.description`, true),
    accent: stringValue(theme.accent, `${label}.accent`, true),
  }
}

function viewerTag(value: unknown, index: number): ViewerTag {
  const label = `tags[${index}]`
  const tag = objectValue(value, label)
  if (
    typeof tag.synergy !== 'number' ||
    !Number.isInteger(tag.synergy) ||
    tag.synergy < 1 ||
    tag.synergy > 4
  ) {
    throw new Error(`${label}.synergy must be an integer from 1 to 4.`)
  }
  return {
    oracleId: stringValue(tag.oracleId, `${label}.oracleId`),
    themeId: stringValue(tag.themeId, `${label}.themeId`),
    synergy: tag.synergy,
  }
}

function validatePayload(value: unknown): PublishPayload {
  const raw = objectValue(value, 'payload')
  const cubeId = stringValue(raw.cubeId, 'cubeId')
  const name = stringValue(raw.name, 'name')
  const description = stringValue(raw.description, 'description', true)
  if (!Array.isArray(raw.cards) || raw.cards.length === 0) {
    throw new Error('cards must be a non-empty array.')
  }
  if (!Array.isArray(raw.themes)) throw new Error('themes must be an array.')
  if (!Array.isArray(raw.tags)) throw new Error('tags must be an array.')
  if (raw.slug !== undefined && (typeof raw.slug !== 'string' || !validSlug(raw.slug))) {
    throw new Error('slug is invalid.')
  }
  const cards = raw.cards.map(viewerCard)
  const themes = raw.themes.map(viewerTheme)
  const tags = raw.tags.map(viewerTag)
  const cardIds = new Set(cards.map((card) => card.oracleId))
  const themeIds = new Set(themes.map((theme) => theme.id))
  if (tags.some((tag) => !cardIds.has(tag.oracleId) || !themeIds.has(tag.themeId))) {
    throw new Error('Every tag must reference a published card and theme.')
  }
  return { cubeId, name, description, cards, themes, tags, slug: raw.slug }
}

async function requestJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('Publish payload is too large.')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function publishCubeDocsToRoot(rootDir: string, rawPayload: unknown): Promise<{
  slug: string
  path: string
  url: string
  count: number
  mode: PublishMode
}> {
  const payload = validatePayload(rawPayload)
  const docsDir = resolve(rootDir, 'docs')
  const slug = await chooseSlug(docsDir, payload)
  const pageDir = join(docsDir, slug)
  const indexPath = join(pageDir, 'index.html')
  const existed = await pathExists(indexPath)
  const existingHtml = existed ? await readFile(indexPath, 'utf8') : ''
  const custom = existed && !existingHtml.includes(GENERATED_PAGE_MARKER)
  const cards = [
    ...new Map(payload.cards.map((card) => [card.oracleId, card])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const themes = [
    ...new Map(payload.themes.map((theme) => [theme.id, theme])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name))
  const cardIds = new Set(cards.map((card) => card.oracleId))
  const themeIds = new Set(themes.map((theme) => theme.id))
  const tags = payload.tags
    .filter((tag) => cardIds.has(tag.oracleId) && themeIds.has(tag.themeId))
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId) || a.themeId.localeCompare(b.themeId))

  await mkdir(pageDir, { recursive: true })
  await writeFile(join(pageDir, 'cardlist.txt'), `${cards.map((card) => card.name).join('\n')}\n`, 'utf8')
  await writeFile(
    join(pageDir, 'cube-data.json'),
    `${JSON.stringify(
      {
        version: 1,
        cube: {
          id: payload.cubeId,
          slug,
          name: payload.name,
          description: payload.description,
        },
        cards,
        themes,
        tags,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  let mode: PublishMode = 'custom-cardlist'
  if (!custom) {
    const cube: PublishedCube = {
      cubeId: payload.cubeId,
      slug,
      name: payload.name,
      description: payload.description,
    }
    await writeFile(indexPath, generatedPageHtml(cube, cards.length), 'utf8')
    await writeFile(join(pageDir, 'cube.json'), `${JSON.stringify(cube, null, 2)}\n`, 'utf8')
    await updateArchive(docsDir)
    mode = existed ? 'generated-updated' : 'generated-created'
  }

  return {
    slug,
    path: `docs/${slug}/index.html`,
    url: `/${slug}/`,
    count: cards.length,
    mode,
  }
}

export function cubeDocsPublisherPlugin(): Plugin {
  return {
    name: 'cube-docs-publisher',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/__cube-docs/publish') {
          next()
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 'Method not allowed.' })
          return
        }
        try {
          sendJson(res, 200, await publishCubeDocsToRoot(process.cwd(), await requestJson(req)))
        } catch (error) {
          sendJson(res, 400, {
            error: error instanceof Error ? error.message : 'Docs publish failed.',
          })
        }
      })
    },
  }
}
