import { createCanvas, loadImage, GlobalFonts, Path2D } from '@napi-rs/canvas'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const CARD_W = 2000
const CARD_H = 1400
const RADIUS = 56
const BORDER = 46
const GOLD_W = 7

const ink = '#171b19'
const paper = '#f4efe4'
const paperDeep = '#e4d8c2'
const gold = '#c9a04e'
const goldBright = '#e4c37a'
const border = '#0b100e'

const MANA = {
  W: { fill: '#fffbd5', stroke: '#c4b06a', letter: '#5a4a18' },
  U: { fill: '#c1e0f8', stroke: '#4d7ea8', letter: '#1a3d5c' },
  B: { fill: '#c4bdb8', stroke: '#4a4542', letter: '#1a1816' },
  R: { fill: '#f4b39a', stroke: '#a85a3a', letter: '#5a1e10' },
  G: { fill: '#a6d4b0', stroke: '#3d7a4a', letter: '#14381c' },
  C: { fill: '#d5d0cc', stroke: '#7a756f', letter: '#333' },
}

function parseArgs(argv) {
  const args = { only: null }
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') args.help = true
    else if (raw.startsWith('--only=')) args.only = raw.slice('--only='.length)
    else if (raw === '--only') args.onlyNext = true
    else if (args.onlyNext) {
      args.only = raw
      args.onlyNext = false
    }
  }
  return args
}

function registerFonts() {
  const fonts = path.join(__dirname, 'fonts')
  const files = [
    ['Cinzel-Bold.ttf', 'CardName'],
    ['EBGaramond-Regular.ttf', 'CardText'],
    ['EBGaramond-Italic.ttf', 'CardTextItalic'],
    ['EBGaramond-Bold.ttf', 'CardTextBold'],
    ['EBGaramond-BoldItalic.ttf', 'CardTextBoldItalic'],
  ]
  for (const [file, family] of files) {
    GlobalFonts.registerFromPath(path.join(fonts, file), family)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function containDest(img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  return {
    dx: x + (w - dw) / 2,
    dy: y + (h - dh) / 2,
    dw,
    dh,
  }
}

function tokenize(str) {
  const out = []
  const re = /(\{[^}]+\}|\*[^*]+\*)/g
  let last = 0
  let match
  while ((match = re.exec(str))) {
    if (match.index > last) out.push({ kind: 'text', value: str.slice(last, match.index) })
    if (match[0].startsWith('{')) out.push({ kind: 'sym', value: match[0].slice(1, -1).toUpperCase() })
    else out.push({ kind: 'italic', value: match[0].slice(1, -1) })
    last = match.index + match[0].length
  }
  if (last < str.length) out.push({ kind: 'text', value: str.slice(last) })
  return out
}

function atomsFrom(tokens) {
  const atoms = []
  for (const token of tokens) {
    if (token.kind === 'sym') {
      atoms.push(token)
      continue
    }
    const parts = token.value.split(/(\s+)/)
    for (const part of parts) {
      if (!part) continue
      atoms.push({ kind: token.kind, value: part })
    }
  }
  return atoms
}

function symbolSize(fontSize) {
  return fontSize * 1.15
}

function measureAtom(ctx, atom, fontSize) {
  if (atom.kind === 'sym') return symbolSize(fontSize) + 4
  ctx.font = atom.kind === 'italic' ? `${fontSize}px "CardTextItalic"` : `${fontSize}px "CardText"`
  return ctx.measureText(atom.value).width
}

function wrapAtoms(ctx, atoms, maxWidth, fontSize) {
  const lines = []
  let current = []
  let width = 0
  const push = () => {
    while (current.length && /^\s+$/.test(current[0].value || '')) current.shift()
    while (current.length && /^\s+$/.test(current.at(-1).value || '')) current.pop()
    if (current.length) lines.push(current)
    current = []
    width = 0
  }
  for (const atom of atoms) {
    const w = measureAtom(ctx, atom, fontSize)
    if (current.length && width + w > maxWidth && !/^\s+$/.test(atom.value || '')) push()
    if (!current.length && /^\s+$/.test(atom.value || '')) continue
    current.push(atom)
    width += w
  }
  push()
  return lines
}

function layoutBlocks(ctx, text, maxWidth, fontSize) {
  const paragraphs = String(text || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const blocks = []
  for (const paragraph of paragraphs) {
    const lines = []
    for (const row of paragraph.split('\n')) {
      const atoms = atomsFrom(tokenize(row.trim()))
      lines.push(...wrapAtoms(ctx, atoms, maxWidth, fontSize))
    }
    if (lines.length) blocks.push(lines)
  }
  return blocks
}

const CHAOS_PATH =
  'M20.298 2.688c-9.79 0.447 1.132 8.785-4.389 13.179 0 0.001-0.001 0.001-0.001 0.001-0-0.001-0.001-0.002-0.002-0.003-0.027 0.011-0.051 0.023-0.078 0.034-3.867 1.565-8.173-4.717-8.298 1.884 2.042-3.063 2.973-0.073 6.33-0.26-1.63 2.154-0.831 5.768-3.549 6.356-4.966 1.074-8.599-4.963-8.296-8.751 0.672-8.414 7.266-12.239 13.813-11.845-8.666-1.735-16.013 5.407-15.798 12.817 0.247 8.496 4.754 12.654 11.673 13.213 9.79-0.447-1.132-8.785 4.389-13.179 0-0.001 0.001-0.001 0.001-0.001 0.001 0.001 0.001 0.002 0.002 0.003 0.027-0.011 0.051-0.023 0.078-0.034 3.867-1.565 8.173 4.717 8.298-1.884-2.042 3.064-2.973 0.073-6.33 0.26 1.63-2.154 0.831-5.768 3.549-6.356 4.966-1.074 8.599 4.962 8.296 8.751-0.672 8.415-7.266 12.239-13.813 11.845 8.666 1.735 16.013-5.407 15.798-12.817-0.247-8.495-4.755-12.653-11.673-13.212z'

function drawChaosSymbol(ctx, x, y, size) {
  ctx.save()
  ctx.translate(x, y)
  const scale = size / 32
  ctx.scale(scale, scale)
  ctx.fillStyle = ink
  ctx.fill(new Path2D(CHAOS_PATH))
  ctx.restore()
}

function drawMana(ctx, x, y, size, code) {
  const spec = MANA[code] || MANA.C
  const r = size / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.fillStyle = spec.fill
  ctx.fill()
  ctx.lineWidth = Math.max(1, size * 0.06)
  ctx.strokeStyle = spec.stroke
  ctx.stroke()
  ctx.fillStyle = spec.letter
  const label = code === 'T' ? 'T' : code
  const fontScale = label.length > 1 ? 0.48 : 0.62
  ctx.font = `700 ${Math.round(size * fontScale)}px "CardTextBold"`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + r, y + r + size * 0.04)
  ctx.restore()
}

function drawAtom(ctx, atom, x, y, fontSize, color) {
  if (atom.kind === 'sym') {
    const size = symbolSize(fontSize)
    const dy = y - fontSize * 0.78
    if (atom.value === 'CHAOS' || atom.value === 'CHAOS:') drawChaosSymbol(ctx, x, dy, size)
    else if (atom.value === 'T') drawMana(ctx, x, dy, size, 'T')
    else drawMana(ctx, x, dy, size, atom.value)
    return size + 4
  }
  ctx.fillStyle = color
  ctx.font = atom.kind === 'italic' ? `${fontSize}px "CardTextItalic"` : `${fontSize}px "CardText"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(atom.value, x, y)
  return ctx.measureText(atom.value).width
}

function drawLines(ctx, lines, x, y, fontSize, lineHeight, color) {
  let cursorY = y
  for (const line of lines) {
    let cursorX = x
    for (const atom of line) cursorX += drawAtom(ctx, atom, cursorX, cursorY, fontSize, color)
    cursorY += lineHeight
  }
  return cursorY
}

function chaosLine(chaos) {
  const raw = String(chaos || '').trim()
  if (!raw) return ''
  if (/^whenever chaos ensues/i.test(raw)) return `{CHAOS} ${raw}`
  const rest = raw.charAt(0).toLowerCase() + raw.slice(1)
  return `{CHAOS} Whenever chaos ensues, ${rest}`
}

function plaque(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r)
  const fill = ctx.createLinearGradient(x, y, x, y + h)
  fill.addColorStop(0, paper)
  fill.addColorStop(1, paperDeep)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = gold
  ctx.lineWidth = 3
  ctx.stroke()
}

function fitSize(ctx, text, font, maxWidth, maxSize, minSize) {
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = `${size}px "${font}"`
    if (ctx.measureText(text).width <= maxWidth) return size
  }
  return minSize
}

function countLines(blocks) {
  return blocks.reduce((n, block) => n + block.length, 0)
}

function asItalic(text) {
  return String(text || '')
    .split(/\n/)
    .map((line) => {
      const trimmed = line.replace(/\*/g, '').trim()
      return trimmed ? `*${trimmed}*` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function fitRules(ctx, body, chaos, flavor, textWidth, minBarH, maxBarH, textPadY) {
  let best = null
  for (let fontSize = 54; fontSize >= 38; fontSize -= 1) {
    const lineHeight = Math.round(fontSize * 1.28)
    const paraGap = Math.round(fontSize * 0.4)
    const flavorSize = Math.round(fontSize * 0.92)
    const flavorLH = Math.round(flavorSize * 1.28)
    const bodyBlocks = layoutBlocks(ctx, body, textWidth, fontSize)
    const chaosBlocks = layoutBlocks(ctx, chaos, textWidth, fontSize)
    const flavorBlocks = layoutBlocks(ctx, asItalic(flavor), textWidth, flavorSize)
    const bodyLines = countLines(bodyBlocks)
    const chaosLines = countLines(chaosBlocks)
    const flavorLines = countLines(flavorBlocks)
    const gapBlocks = Math.max(0, bodyBlocks.length - 1) * paraGap
    const chaosParaGap = Math.max(0, chaosBlocks.length - 1) * paraGap
    const chaosGap = chaosLines && bodyLines ? Math.round(fontSize * 0.7) : 0
    const flavorGap = flavorLines && (bodyLines || chaosLines) ? Math.round(fontSize * 0.55) : 0
    const contentH =
      bodyLines * lineHeight +
      gapBlocks +
      chaosLines * lineHeight +
      chaosParaGap +
      flavorLines * flavorLH
    const needed = textPadY * 2 + contentH + chaosGap + flavorGap
    best = {
      fontSize,
      lineHeight,
      paraGap,
      flavorSize,
      flavorLH,
      bodyBlocks,
      chaosBlocks,
      flavorBlocks,
      bodyLines,
      chaosLines,
      flavorLines,
      chaosGap,
      flavorGap,
      textBarH: Math.min(maxBarH, Math.max(minBarH, needed)),
    }
    if (needed <= maxBarH) return best
  }
  if (best) best.textBarH = maxBarH
  return best
}

async function renderPlane(plane, art, meta) {
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.fillStyle = border
  ctx.fill()

  const innerX = BORDER
  const innerY = BORDER
  const innerW = CARD_W - BORDER * 2
  const innerH = CARD_H - BORDER * 2

  roundRect(ctx, innerX - 3, innerY - 3, innerW + 6, innerH + 6, 28)
  ctx.strokeStyle = gold
  ctx.lineWidth = GOLD_W
  ctx.stroke()
  ctx.strokeStyle = goldBright
  ctx.lineWidth = 1.5
  roundRect(ctx, innerX + 3, innerY + 3, innerW - 6, innerH - 6, 22)
  ctx.stroke()

  const nameBarH = 84
  const namePad = 28
  const isPhenomenon = /^phenomenon$/i.test(plane.type || '') || plane.kind === 'phenomenon'
  const body = String(plane.text || '').trim()
  const chaos = isPhenomenon ? '' : chaosLine(plane.chaos)
  const flavor = String(plane.flavor || '').trim()
  const textPadX = 36
  const textPadY = 34
  const plateX = innerX + 16
  const plateW = innerW - 32
  const textWidth = plateW - textPadX * 2
  const rules = fitRules(ctx, body, chaos, flavor, textWidth, innerH * 0.3, innerH * 0.44, textPadY)
  const {
    fontSize,
    lineHeight,
    paraGap,
    flavorSize,
    flavorLH,
    bodyBlocks,
    chaosBlocks,
    flavorBlocks,
    bodyLines,
    chaosLines,
    flavorLines,
    chaosGap,
    flavorGap,
  } = rules
  const hasText = bodyLines + chaosLines + flavorLines > 0
  const textBarH = hasText ? rules.textBarH : 0
  const nameY = innerY + 16
  const plateY = hasText ? innerY + innerH - 16 - textBarH : innerY + innerH - 16
  const artX = innerX + 16
  const artY = nameY + nameBarH + 12
  const artW = innerW - 32
  const artH = Math.max(80, plateY - 12 - artY)
  const dest = containDest(art, artX, artY, artW, artH)
  ctx.save()
  roundRect(ctx, dest.dx, dest.dy, dest.dw, dest.dh, 10)
  ctx.clip()
  ctx.drawImage(art, dest.dx, dest.dy, dest.dw, dest.dh)
  ctx.restore()
  roundRect(ctx, dest.dx, dest.dy, dest.dw, dest.dh, 10)
  ctx.strokeStyle = gold
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 3
  plaque(ctx, plateX, nameY, plateW, nameBarH, 12)
  ctx.restore()

  const typeText = plane.type || (isPhenomenon ? 'Phenomenon' : 'Plane')
  ctx.font = 'italic 28px "CardTextItalic"'
  const typeW = ctx.measureText(typeText).width
  const nameMax = plateW - namePad * 2 - typeW - 28
  const nameSize = fitSize(ctx, plane.name, 'CardName', nameMax, 46, 26)
  const baseline = nameY + nameBarH / 2 + nameSize * 0.35

  ctx.fillStyle = ink
  ctx.font = `${nameSize}px "CardName"`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(plane.name, plateX + namePad, baseline)

  ctx.font = 'italic 28px "CardTextItalic"'
  ctx.textAlign = 'right'
  ctx.fillStyle = accentColor()
  ctx.fillText(typeText, plateX + plateW - namePad, baseline)

  if (hasText) {
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 4
    plaque(ctx, plateX, plateY, plateW, textBarH, 12)
    ctx.restore()
    let y = plateY + textPadY + fontSize * 0.78
    const x = plateX + textPadX
    for (let i = 0; i < bodyBlocks.length; i++) {
      y = drawLines(ctx, bodyBlocks[i], x, y, fontSize, lineHeight, ink)
      if (i < bodyBlocks.length - 1) y += paraGap
    }
    if (chaosLines) {
      if (bodyLines) {
        const lastBodyBaseline = y - lineHeight
        const ruleY = lastBodyBaseline + Math.round(fontSize * 0.4)
        ctx.strokeStyle = 'rgba(90, 72, 36, 0.35)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, ruleY)
        ctx.lineTo(x + textWidth, ruleY)
        ctx.stroke()
        y = ruleY + Math.round(fontSize * 1.05)
      }
      for (let i = 0; i < chaosBlocks.length; i++) {
        y = drawLines(ctx, chaosBlocks[i], x, y, fontSize, lineHeight, ink)
        if (i < chaosBlocks.length - 1) y += paraGap
      }
    }
    if (flavorLines) {
      const lastBaseline = plateY + textBarH - textPadY
      const pinned = lastBaseline - (flavorLines - 1) * flavorLH
      y = Math.max(y + flavorGap, pinned)
      for (let i = 0; i < flavorBlocks.length; i++) {
        y = drawLines(ctx, flavorBlocks[i], x, y, flavorSize, flavorLH, ink)
        if (i < flavorBlocks.length - 1) y += Math.round(flavorSize * 0.4)
      }
    }
  }

  ctx.fillStyle = goldBright
  ctx.font = '20px "CardText"'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const footer = [meta.setCode, meta.set, plane.artist].filter(Boolean).join('  ·  ')
  ctx.fillText(footer, CARD_W / 2, CARD_H - BORDER / 2)

  return canvas.toBuffer('image/png')
}

function accentColor() {
  return '#1e4a36'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`Usage: node scripts/render-planes.mjs [--only id-or-name]

Reads docs/ozolith-run/planes.json and writes PNGs to
docs/ozolith-run/images/planes/
`)
    return
  }

  registerFonts()
  const dataPath = path.join(root, 'docs/ozolith-run/planes.json')
  const artDir = path.join(root, 'docs/ozolith-run/images/planes-art')
  const outDir = path.join(root, 'docs/ozolith-run/images/planes')
  const data = JSON.parse(await readFile(dataPath, 'utf8'))
  await mkdir(outDir, { recursive: true })

  const only = args.only?.toLowerCase()
  const planes = data.planes.filter((plane) => {
    if (!only) return true
    return plane.id.toLowerCase() === only || plane.name.toLowerCase() === only
  })
  if (!planes.length) {
    throw new Error(`No planes matched ${args.only}`)
  }

  const meta = { set: data.set || 'The Ozolith Run', setCode: data.setCode || 'ORC' }
  for (const plane of planes) {
    const artPath = path.join(artDir, plane.art)
    if (!existsSync(artPath)) {
      console.warn(`skip ${plane.id}: missing art ${plane.art}`)
      continue
    }
    const art = await loadImage(artPath)
    const png = await renderPlane(plane, art, { ...meta, artist: plane.artist })
    const outPath = path.join(outDir, `${plane.id}.png`)
    await writeFile(outPath, png)
    console.log(`wrote ${path.relative(root, outPath)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
