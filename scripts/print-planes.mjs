import { createCanvas, loadImage } from '@napi-rs/canvas'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const DPI = 300
const PAGE_W_IN = 11
const PAGE_H_IN = 8.5
const TRIM_W_IN = 5
const TRIM_H_IN = 3.5
const BLEED_IN = 0.08
const EDGE_GAP_IN = 0.04

const PAGE_W = Math.round(PAGE_W_IN * DPI)
const PAGE_H = Math.round(PAGE_H_IN * DPI)
const TRIM_W = Math.round(TRIM_W_IN * DPI)
const TRIM_H = Math.round(TRIM_H_IN * DPI)
const BLEED = Math.round(BLEED_IN * DPI)
const EDGE_GAP = Math.round(EDGE_GAP_IN * DPI)
const COLS = 2
const ROWS = 2
const PER_SHEET = COLS * ROWS

const BORDER = '#0b100e'
const MARK = '#111111'
const PAPER = '#ffffff'

function gridOrigin() {
  const gridW = COLS * TRIM_W
  const gridH = ROWS * TRIM_H
  return {
    x: Math.round((PAGE_W - gridW) / 2),
    y: Math.round((PAGE_H - gridH) / 2),
    gridW,
    gridH,
  }
}

function trimBox(col, row, origin) {
  return {
    x: origin.x + col * TRIM_W,
    y: origin.y + row * TRIM_H,
    w: TRIM_W,
    h: TRIM_H,
  }
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5)
  ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5)
  ctx.stroke()
}

function drawMarks(ctx, origin) {
  ctx.strokeStyle = MARK
  ctx.lineWidth = 2
  ctx.lineCap = 'butt'
  const x0 = origin.x
  const x1 = origin.x + TRIM_W
  const x2 = origin.x + origin.gridW
  const y0 = origin.y
  const y1 = origin.y + TRIM_H
  const y2 = origin.y + origin.gridH
  const vTick = (x, y, dir) =>
    line(ctx, x, y + dir * BLEED, x, dir < 0 ? EDGE_GAP : PAGE_H - EDGE_GAP)
  const hTick = (x, y, dir) =>
    line(ctx, x + dir * BLEED, y, dir < 0 ? EDGE_GAP : PAGE_W - EDGE_GAP, y)

  hTick(x0, y0, -1)
  vTick(x0, y0, -1)
  hTick(x2, y0, 1)
  vTick(x2, y0, -1)
  hTick(x0, y2, -1)
  vTick(x0, y2, 1)
  hTick(x2, y2, 1)
  vTick(x2, y2, 1)

  vTick(x1, y0, -1)
  vTick(x1, y2, 1)
  hTick(x0, y1, -1)
  hTick(x2, y1, 1)
}

function labelSheet(ctx, sheet, total, setName) {
  ctx.fillStyle = '#666666'
  ctx.font = '18px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const origin = gridOrigin()
  ctx.fillText(
    `${setName}  ·  Sheet ${sheet} of ${total}`,
    origin.x + origin.gridW / 4,
    origin.y + origin.gridH + (PAGE_H - origin.y - origin.gridH) / 2,
  )
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function renderSheet(cards, sheet, total, setName) {
  const canvas = createCanvas(PAGE_W, PAGE_H)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  const origin = gridOrigin()
  for (let i = 0; i < cards.length; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const box = trimBox(col, row, origin)
    ctx.fillStyle = BORDER
    const left = col === 0 ? BLEED : 0
    const right = col === COLS - 1 ? BLEED : 0
    const top = row === 0 ? BLEED : 0
    const bottom = row === ROWS - 1 ? BLEED : 0
    ctx.fillRect(box.x - left, box.y - top, box.w + left + right, box.h + top + bottom)
    ctx.drawImage(cards[i].image, box.x, box.y, box.w, box.h)
  }
  drawMarks(ctx, origin)
  labelSheet(ctx, sheet, total, setName)
  return canvas.toBuffer('image/png')
}

async function main() {
  const dataPath = path.join(root, 'docs/ozolith-run/planes.json')
  const cardDir = path.join(root, 'docs/ozolith-run/images/planes')
  const outDir = path.join(root, 'docs/ozolith-run/print')
  const data = JSON.parse(await readFile(dataPath, 'utf8'))
  await mkdir(outDir, { recursive: true })

  const cards = []
  for (const plane of data.planes) {
    const file = path.join(cardDir, `${plane.id}.png`)
    if (!existsSync(file)) {
      console.warn(`skip ${plane.id}: missing rendered card`)
      continue
    }
    cards.push({ id: plane.id, name: plane.name, image: await loadImage(file) })
  }
  if (!cards.length) throw new Error('No rendered plane cards found. Run npm run render-planes first.')

  const sheets = chunk(cards, PER_SHEET)
  const pdf = await PDFDocument.create()
  const setName = data.set || 'The Ozolith Run'

  for (let i = 0; i < sheets.length; i++) {
    const png = await renderSheet(sheets[i], i + 1, sheets.length, setName)
    const sheetName = `sheet-${String(i + 1).padStart(2, '0')}.png`
    await writeFile(path.join(outDir, sheetName), png)

    const page = pdf.addPage([PAGE_W_IN * 72, PAGE_H_IN * 72])
    const image = await pdf.embedPng(png)
    page.drawImage(image, { x: 0, y: 0, width: PAGE_W_IN * 72, height: PAGE_H_IN * 72 })
    console.log(`wrote ${path.relative(root, path.join(outDir, sheetName))} (${sheets[i].map((card) => card.name).join(', ')})`)
  }

  const pdfPath = path.join(outDir, 'ozolith-run-planes.pdf')
  await writeFile(pdfPath, await pdf.save())
  console.log(`wrote ${path.relative(root, pdfPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
