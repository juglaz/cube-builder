const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const cache = new Map()
const activeHovers = new WeakSet()
let listText = ""
let gridLoaded = false

function frontName(name) {
  return name.split(" // ")[0].trim()
}

function cacheKey(name) {
  return frontName(name).toLowerCase()
}

function namedImage(name, version) {
  return `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(frontName(name))}&format=image&version=${version}`
}

function facesFromCard(card) {
  const small =
    card.image_uris?.small || card.card_faces?.find((face) => face.image_uris?.small)?.image_uris.small
  const large = []
  if (card.image_uris?.normal) large.push(card.image_uris.normal)
  else if (card.card_faces) {
    for (const face of card.card_faces) {
      if (face.image_uris?.normal) large.push(face.image_uris.normal)
    }
  }
  if (!small) {
    return {
      small: namedImage(card.name, "small"),
      large: [namedImage(card.name, "normal")],
    }
  }
  return { small, large: large.length ? large : [small.replace("/small/", "/normal/")] }
}

function remember(name, images) {
  cache.set(cacheKey(name), images)
  cache.set(cacheKey(frontName(name)), images)
}

async function lookupBatch(names) {
  const identifiers = names.map((name) => ({ name: frontName(name) }))
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers }),
  })
  if (!response.ok) throw new Error("collection failed")
  const payload = await response.json()
  const byKey = new Map()
  for (const card of payload.data || []) {
    const images = facesFromCard(card)
    byKey.set(cacheKey(card.name), images)
    for (const face of card.card_faces || []) {
      if (face.name) byKey.set(cacheKey(face.name), images)
    }
  }
  for (const name of names) {
    const images = byKey.get(cacheKey(name)) || {
      small: namedImage(name, "small"),
      large: [namedImage(name, "normal")],
    }
    remember(name, images)
  }
}

async function ensureImages(name) {
  const key = cacheKey(name)
  if (cache.has(key)) return cache.get(key)
  try {
    await lookupBatch([name])
  } catch {
    remember(name, {
      small: namedImage(name, "small"),
      large: [namedImage(name, "normal")],
    })
  }
  return cache.get(key)
}

function zoomEl() {
  return document.getElementById("card-zoom")
}

function placeZoom(event) {
  const el = zoomEl()
  if (!el || el.hidden) return
  const width = el.offsetWidth
  const height = el.offsetHeight
  let left = event.clientX + 20
  let top = event.clientY + 16
  if (left + width > window.innerWidth - 10) left = event.clientX - width - 20
  if (top + height > window.innerHeight - 10) top = Math.max(8, window.innerHeight - height - 8)
  if (left < 8) left = 8
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

function hideZoom() {
  const el = zoomEl()
  if (!el) return
  el.hidden = true
  el.replaceChildren()
}

function showZoom(images, event) {
  const el = zoomEl()
  if (!el || !images?.large?.length) return
  el.replaceChildren()
  for (const src of images.large) {
    const img = document.createElement("img")
    img.src = src
    img.alt = ""
    el.append(img)
  }
  el.hidden = false
  placeZoom(event)
}

function bindZoom(node, name) {
  node.addEventListener("pointerenter", async (event) => {
    activeHovers.add(node)
    const images = await ensureImages(name)
    if (activeHovers.has(node)) showZoom(images, event)
  })
  node.addEventListener("pointermove", placeZoom)
  node.addEventListener("pointerleave", () => {
    activeHovers.delete(node)
    hideZoom()
  })
}

function renderTile(name) {
  const images = cache.get(cacheKey(name))
  const button = document.createElement("button")
  button.type = "button"
  button.className = "thumb-card"
  button.setAttribute("aria-label", name)
  const img = document.createElement("img")
  img.alt = name
  img.loading = "lazy"
  img.src = images?.small || namedImage(name, "small")
  const label = document.createElement("span")
  label.className = "thumb-name"
  label.textContent = name
  button.append(img, label)
  bindZoom(button, name)
  return button
}

async function fillGrid(names) {
  const grid = document.getElementById("card-grid")
  if (!grid || gridLoaded) return
  gridLoaded = true
  grid.replaceChildren()
  const fragment = document.createDocumentFragment()
  for (let i = 0; i < names.length; i += 75) {
    const chunk = names.slice(i, i + 75)
    try {
      await lookupBatch(chunk)
    } catch {
      for (const name of chunk) {
        remember(name, {
          small: namedImage(name, "small"),
          large: [namedImage(name, "normal")],
        })
      }
    }
    for (const name of chunk) fragment.append(renderTile(name))
    if (i + 75 < names.length) await sleep(90)
  }
  grid.append(fragment)
}

async function loadList() {
  const details = document.querySelector(".spoiler-box")
  const grid = document.getElementById("card-grid")
  const copyUrl = document.querySelector("[data-copy-url]")?.getAttribute("data-copy-url")
  if (!copyUrl) return
  const text = (await (await fetch(copyUrl)).text()).replace(/\r\n/g, "\n").trim()
  listText = text
  const names = text.split("\n").map((line) => line.trim()).filter(Boolean)
  document.querySelectorAll("[data-card-count]").forEach((el) => {
    el.textContent = `${names.length} cards`
  })
  const start = () => {
    if (grid && !gridLoaded) {
      grid.textContent = "Loading cards…"
      void fillGrid(names)
    }
  }
  if (details?.open) start()
  details?.addEventListener("toggle", () => {
    if (details.open) start()
  })
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const previous = button.textContent
    try {
      const url = button.getAttribute("data-copy-url")
      const text = listText || (url ? (await (await fetch(url)).text()).replace(/\r\n/g, "\n").trim() : "")
      if (!text) throw new Error("empty")
      await navigator.clipboard.writeText(text)
      button.textContent = "Copied"
    } catch {
      button.textContent = "Copy failed"
    }
    window.setTimeout(() => {
      button.textContent = previous
    }, 1600)
  })
})

document.querySelectorAll(".card, .roster span").forEach((node) => {
  const name = node.textContent.trim()
  if (name) bindZoom(node, name)
})

window.CubeLore = { bindZoom, facesFromCard, remember }

if (document.getElementById("card-grid")) {
  const script = document.createElement("script")
  const current = document.currentScript?.src || location.href
  const viewerUrl = new URL("cube-viewer.js", current)
  const version = new URL(current).searchParams.get("v")
  if (version) viewerUrl.searchParams.set("v", version)
  script.src = viewerUrl.href
  document.head.append(script)
} else {
  void loadList()
}
