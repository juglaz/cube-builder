const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const cache = new Map()
const activeHovers = new WeakSet()
let listText = ""
let gridLoaded = false

const loreCatalog = {
  avishkar: {
    label: "Avishkar",
    text: "The plane formerly called Kaladesh, renamed after the Consulate fell in the Indigo Revolution. Its capital, Ghirapur, now sits on an unusually large number of stable Omenpaths and hosts the Ghirapur Grand Prix.",
  },
  omenpaths: {
    label: "Omenpaths",
    text: "Transplanar passages that became widespread after New Phyrexia's invasion. Unlike planeswalking, they let ordinary people, cargo, and Vehicles travel between worlds. Ghirapur on Avishkar has an unusually large number of stable ones.",
  },
  ikoria: {
    label: "Ikoria",
    text: "A monster world of mutating beasts and crystal, where humans survive in a handful of walled sanctuaries. Ikoria's crystals power monster growth and evolution, and many flare when a beast is near.",
  },
  ozolith: {
    label: "The Ozolith",
    text: "A vast spiral of Ikorian crystal north of Drannith. A meddling planeswalker altered it, accelerating monster mutation; Lukka later overloaded the formation and shattered it. The self-gathering shards in this cube's story are original lore.",
  },
  circuit: {
    label: "The circuit",
    text: "Avishkar's canonical race is the Ghirapur Grand Prix, an interplanar event whose stages cross Omenpaths. The Ozolith Run is original cube lore: an offshoot circuit whose prize is living crystal rather than the official purse.",
  },
  vehicle: {
    label: "Vehicle",
    text: "A Magic artifact subtype that debuted on Kaladesh, now Avishkar. Vehicles are crewed by creatures before they can attack; Avishkari inventors treat them as racing machines, cargo haulers, and weapons.",
  },
  kamigawa: {
    label: "Kamigawa",
    text: "A plane where kami spirits and advanced technology coexist. In the Neon Dynasty era, the city of Towashi has an Undercity of neon streets and nezumi biker gangs.",
  },
  okiba: {
    label: "Okiba Reckoners",
    text: "Greasefang's nezumi-only biker gang from Towashi's Undercity on Kamigawa, part of the larger Reckoners crime network. Their role in this race is original cube lore.",
  },
  depala: {
    label: "Depala",
    text: "A dwarf pilot from Avishkar, once the second-ranked racer on Ghirapur's airship circuit and a Renegade during the Consulate years. The Expedition she leads here is original cube lore.",
  },
  magda: {
    label: "Magda",
    text: "A dwarf outlaw from Axgard on Kaldheim who left her clan, led a band of raiders, and later reached Thunder Junction through an Omenpath. The Salvage Cartel she runs here is original cube lore.",
  },
  greasefang: {
    label: "Greasefang",
    text: "Nezumi boss of the Okiba Reckoners, a biker gang in Towashi's Undercity. Any nezumi who joins is her family, and she answers slights against them in kind. Her arrival on Avishkar's circuit is original cube lore.",
  },
  shorikai: {
    label: "Shorikai",
    text: "Shorikai, Genesis Engine is a kami-inhabited Vehicle from Kamigawa's Neon Dynasty. In this cube's story it serves as the Expedition's rolling workshop and chartroom.",
  },
}

const loreMatchers = [
  { id: "omenpaths", pattern: /\bOmenpaths?\b/g },
  { id: "kamigawa", pattern: /\bKamigawa\b/g },
  { id: "avishkar", pattern: /\bAvishkar\b/g },
  { id: "greasefang", pattern: /\bGreasefang\b/g },
  { id: "shorikai", pattern: /\bShorikai\b/g },
  { id: "ikoria", pattern: /\bIkorian?\b/g },
  { id: "ozolith", pattern: /\bOzolith\b/g },
  { id: "vehicle", pattern: /\bVehicles?\b/g },
  { id: "okiba", pattern: /\bOkiba\b/g },
  { id: "depala", pattern: /\bDepala\b/g },
  { id: "magda", pattern: /\bMagda\b/g },
  { id: "circuit", pattern: /\bcircuits?\b/gi },
]

const loreSkipClosest = "a, button, footer, h1, .card, .roster, .lore-term, .lore-tooltip, .loop, .lore-nav, .chapter-label, .spoiler-box"

let activeLoreTerm = null

function loreTooltip() {
  let tooltip = document.getElementById("lore-tooltip")
  if (tooltip) return tooltip
  tooltip = document.createElement("div")
  tooltip.id = "lore-tooltip"
  tooltip.className = "lore-tooltip sans"
  tooltip.setAttribute("role", "tooltip")
  tooltip.hidden = true
  document.body.append(tooltip)
  return tooltip
}

function placeLoreTooltip(node) {
  const tooltip = loreTooltip()
  if (tooltip.hidden) return
  const rect = node.getBoundingClientRect()
  const margin = 12
  const gap = 9
  const left = Math.min(
    window.innerWidth - tooltip.offsetWidth - margin,
    Math.max(margin, rect.left + rect.width / 2 - tooltip.offsetWidth / 2),
  )
  const above = rect.top - tooltip.offsetHeight - gap
  const top = above >= margin ? above : Math.min(window.innerHeight - tooltip.offsetHeight - margin, rect.bottom + gap)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${Math.max(margin, top)}px`
}

function loreEntry(id) {
  return loreCatalog[id] || null
}

function showLoreTooltip(node) {
  const entry = loreEntry(node.dataset.loreTerm)
  if (!entry) return
  activeLoreTerm = node
  const tooltip = loreTooltip()
  const label = document.createElement("strong")
  label.className = "lore-tooltip-label"
  label.textContent = entry.label
  const body = document.createElement("span")
  body.textContent = entry.text
  tooltip.replaceChildren(label, body)
  tooltip.hidden = false
  placeLoreTooltip(node)
}

function hideLoreTooltip(node) {
  if (node && activeLoreTerm !== node) return
  activeLoreTerm = null
  loreTooltip().hidden = true
}

function collectLoreMatches(text) {
  const matches = []
  for (const matcher of loreMatchers) {
    const pattern = new RegExp(matcher.pattern.source, matcher.pattern.flags.includes("g") ? matcher.pattern.flags : `${matcher.pattern.flags}g`)
    let match
    while ((match = pattern.exec(text))) {
      matches.push({
        id: matcher.id,
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }
  matches.sort((left, right) => left.start - right.start || right.end - left.end)
  const kept = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue
    kept.push(match)
    cursor = match.end
  }
  return kept
}

function wrapLoreTextNode(node) {
  const text = node.nodeValue
  if (!text) return
  const matches = collectLoreMatches(text)
  if (matches.length === 0) return
  const fragment = document.createDocumentFragment()
  let cursor = 0
  for (const match of matches) {
    if (match.start > cursor) fragment.append(text.slice(cursor, match.start))
    const term = document.createElement("span")
    term.className = "lore-term"
    term.dataset.loreTerm = match.id
    term.textContent = text.slice(match.start, match.end)
    fragment.append(term)
    cursor = match.end
  }
  if (cursor < text.length) fragment.append(text.slice(cursor))
  node.replaceWith(fragment)
}

function linkLoreTerms(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT
      const el = node.parentElement
      if (!el || /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/.test(el.tagName)) return NodeFilter.FILTER_REJECT
      if (el.closest(loreSkipClosest)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes = []
  let current = walker.nextNode()
  while (current) {
    nodes.push(current)
    current = walker.nextNode()
  }
  for (const node of nodes) wrapLoreTextNode(node)
}

function bindLoreTerms() {
  linkLoreTerms()
  const nodes = document.querySelectorAll("[data-lore-term]")
  if (nodes.length === 0) return
  const tooltip = loreTooltip()
  for (const node of nodes) {
    if (!loreEntry(node.dataset.loreTerm)) continue
    node.tabIndex = 0
    node.setAttribute("aria-describedby", tooltip.id)
    node.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "touch" || recentlyTapped()) return
      showLoreTooltip(node)
    })
    node.addEventListener("pointerleave", () => {
      if (recentlyTapped()) return
      if (document.activeElement !== node) hideLoreTooltip(node)
    })
    node.addEventListener("focus", () => showLoreTooltip(node))
    node.addEventListener("blur", () => hideLoreTooltip(node))
    bindPressTap(node, () => showLoreTooltip(node), { alsoClick: true })
  }
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" && recentlyTapped()) return
    if (!event.target.closest?.("[data-lore-term]")) hideLoreTooltip()
  })
  window.addEventListener("resize", () => {
    if (activeLoreTerm) placeLoreTooltip(activeLoreTerm)
  })
  window.addEventListener("scroll", () => {
    if (activeLoreTerm) placeLoreTooltip(activeLoreTerm)
  }, true)
}

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

let stickyZoomNode = null
let zoomDocBound = false
let lastTapAt = 0

function recentlyTapped() {
  return Date.now() - lastTapAt < 800
}

function bindPressTap(node, onTap, options = {}) {
  let start = null
  let tapped = false
  node.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0]
    start = { x: touch.clientX, y: touch.clientY }
    tapped = false
  }, { passive: true })
  node.addEventListener("touchend", (event) => {
    if (!start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    start = null
    if (dx * dx + dy * dy > 64) return
    tapped = true
    lastTapAt = Date.now()
    event.preventDefault()
    onTap({ clientX: touch.clientX, clientY: touch.clientY })
  })
  node.addEventListener("click", (event) => {
    if (tapped) {
      tapped = false
      event.preventDefault()
      return
    }
    if (!options.alsoClick && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    lastTapAt = Date.now()
    event.preventDefault()
    onTap(event)
  })
  node.addEventListener("contextmenu", (event) => event.preventDefault())
}

function hideZoom() {
  stickyZoomNode = null
  const el = zoomEl()
  if (!el) return
  el.hidden = true
  el.classList.remove("plane-zoom")
  el.replaceChildren()
}

function placeZoom(event) {
  const el = zoomEl()
  if (!el || el.hidden) return
  const width = el.offsetWidth
  const height = el.offsetHeight
  const coarse = window.matchMedia("(pointer: coarse)").matches
  if (coarse) {
    const left = Math.max(8, Math.min((window.innerWidth - width) / 2, window.innerWidth - width - 8))
    let top = event.clientY - height - 18
    if (top < 8) top = event.clientY + 18
    el.style.left = `${left}px`
    el.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`
    return
  }
  let left = event.clientX + 20
  let top = event.clientY + 16
  if (left + width > window.innerWidth - 10) left = event.clientX - width - 20
  if (top + height > window.innerHeight - 10) top = Math.max(8, window.innerHeight - height - 8)
  if (left < 8) left = 8
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

function showZoom(images, event, node) {
  const el = zoomEl()
  if (!el || !images?.large?.length) return
  el.classList.toggle("plane-zoom", node?.dataset.zoomKind === "plane")
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

function bindZoomDocument() {
  if (zoomDocBound) return
  zoomDocBound = true
  document.addEventListener("pointerdown", (event) => {
    if (!stickyZoomNode) return
    if (event.pointerType !== "touch" && recentlyTapped()) return
    if (event.target.closest?.(".card, .roster span, .thumb-card, .viewer-image-card, .viewer-list-card")) return
    hideZoom()
  }, true)
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest?.(".card, .roster span, .lore-term, .thumb-card, .viewer-image-card, .viewer-list-card, .viewer-chip")) {
      event.preventDefault()
    }
  })
}

function bindZoom(node, name) {
  bindZoomDocument()
  if (node.tabIndex < 0) node.tabIndex = 0
  const showAt = async (event) => {
    activeHovers.add(node)
    const images = await ensureImages(name)
    if (stickyZoomNode === node || activeHovers.has(node)) showZoom(images, event, node)
  }
  node.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "touch" || recentlyTapped()) return
    if (stickyZoomNode && stickyZoomNode !== node) return
    void showAt(event)
  })
  bindPressTap(node, (event) => {
    if (stickyZoomNode === node) {
      hideZoom()
      return
    }
    stickyZoomNode = node
    void showAt(event)
  })
  node.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || recentlyTapped()) return
    placeZoom(event)
  })
  node.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch" || recentlyTapped() || stickyZoomNode === node) return
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
  img.draggable = false
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

async function loadPlanes() {
  const details = document.getElementById("plane-spoiler-box")
  const grid = document.getElementById("plane-grid")
  if (!details || !grid) return
  let loaded = false
  const start = async () => {
    if (loaded) return
    loaded = true
    grid.textContent = "Loading planes…"
    try {
      const payload = await (await fetch("./planes.json")).json()
      const planes = Array.isArray(payload.planes) ? payload.planes : []
      document.querySelectorAll("[data-plane-count]").forEach((el) => {
        el.textContent = `${planes.length} planes`
      })
      const fragment = document.createDocumentFragment()
      for (const plane of planes) {
        if (!plane?.id || !plane?.name) continue
        const src = `./images/planes/${plane.id}.png`
        remember(plane.name, { small: src, large: [src] })
        const button = document.createElement("button")
        button.type = "button"
        button.className = "thumb-card plane-card"
        button.dataset.zoomKind = "plane"
        button.setAttribute("aria-label", plane.name)
        const img = document.createElement("img")
        img.alt = plane.name
        img.loading = "lazy"
        img.draggable = false
        img.src = src
        const label = document.createElement("span")
        label.className = "thumb-name"
        label.textContent = plane.name
        button.append(img, label)
        bindZoom(button, plane.name)
        fragment.append(button)
      }
      grid.replaceChildren(fragment)
    } catch {
      loaded = false
      grid.textContent = "Could not load plane cards."
    }
  }
  if (details.open) void start()
  details.addEventListener("toggle", () => {
    if (details.open) void start()
  })
}

function bindSpoilerBoxes() {
  const boxes = [...document.querySelectorAll(".spoiler-box")]
  const closedLabels = new Map()
  const sync = (details) => {
    const anyOpen = boxes.some((box) => box.open)
    document.body.classList.toggle("viewer-fullscreen-open", anyOpen)
    const summary = details.querySelector("summary")
    const closed = closedLabels.get(details)
    if (summary && closed) {
      summary.textContent = details.open ? closed.replace(/^Show\b/i, "Close") : closed
    }
    hideZoom()
  }
  for (const details of boxes) {
    const summary = details.querySelector("summary")
    if (summary) closedLabels.set(details, summary.textContent)
    details.addEventListener("toggle", () => sync(details))
    if (details.open) sync(details)
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return
    if (!zoomEl()?.hidden) {
      hideZoom()
      return
    }
    if (activeLoreTerm) {
      hideLoreTooltip()
      return
    }
    for (const details of boxes) {
      if (details.open) details.open = false
    }
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

bindLoreTerms()
bindSpoilerBoxes()
void loadPlanes()

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
