;(function () {
  const COLORS = ["W", "U", "B", "R", "G", "C"]
  const TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"]
  const CMC_BUCKETS = ["0-1", "2", "3", "4", "5", "6+"]
  const AXES = [
    ["color", "Color"],
    ["theme", "Theme"],
    ["type", "Card type"],
    ["cmc", "Mana value"],
    ["kind", "Role"],
  ]
  const COLOR_SPECS = [
    ["W", "White", "#8a6f2c"],
    ["U", "Blue", "#287caf"],
    ["B", "Black", "#69645d"],
    ["R", "Red", "#b34d3f"],
    ["G", "Green", "#397d43"],
    ["C", "Colorless", "#8b782b"],
    ["M", "Multicolored", "#9b7622"],
    ["Hybrid", "Hybrid", "#8c7235"],
    ["Lands", "Lands", "#517898"],
  ]
  const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Enchantment", "Artifact", "Land", "Other"]
  const KIND_SPECS = [
    ["creature", "Creatures", "#9b7622"],
    ["spell", "Instants & sorceries", "#517898"],
    ["permanent", "Other permanents", "#8c7235"],
    ["land", "Lands", "#397d43"],
  ]
  const state = {
    query: "",
    colors: new Set(),
    colorMode: "any",
    types: new Set(),
    cmc: new Set(),
    themes: new Set(),
    minSynergy: 0,
    primary: "color",
    secondary: "type",
    display: "images",
    themeQuery: "",
    themeVisible: 5,
  }

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
  const frontName = (name) => name.split(" // ")[0].trim()
  const hasType = (card, type) => {
    const lines = [card.typeLine, ...(card.faces || []).map((face) => face.typeLine)].join(" ")
    return new RegExp(`\\b${type}\\b`, "i").test(lines)
  }
  const isLand = (card) => hasType(card, "Land")
  const cmcBucket = (cmc) => (cmc <= 1 ? "0-1" : cmc <= 5 ? String(Math.floor(cmc)) : "6+")
  const searchText = (card) =>
    [
      card.name,
      card.typeLine,
      card.oracleText,
      ...(card.keywords || []),
      ...(card.faces || []).flatMap((face) => [face.name, face.typeLine, face.oracleText]),
    ]
      .join(" ")
      .toLowerCase()

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function normalizeScryfall(card) {
    const faces = (card.card_faces || []).map((face) => ({
      name: face.name || card.name,
      manaCost: face.mana_cost || "",
      typeLine: face.type_line || "",
      oracleText: face.oracle_text || "",
      imageNormal: face.image_uris?.normal,
      imageLarge: face.image_uris?.large,
    }))
    return {
      oracleId: card.oracle_id || card.id,
      name: card.name,
      cmc: card.cmc || 0,
      typeLine: card.type_line || faces.map((face) => face.typeLine).join(" // "),
      colors: card.colors || [],
      colorIdentity: card.color_identity || [],
      manaCost: card.mana_cost || faces.map((face) => face.manaCost).filter(Boolean).join(" // "),
      oracleText: card.oracle_text || faces.map((face) => face.oracleText).join(" // "),
      keywords: card.keywords || [],
      imageNormal: card.image_uris?.normal || faces.find((face) => face.imageNormal)?.imageNormal || "",
      imageLarge: card.image_uris?.large || faces.find((face) => face.imageLarge)?.imageLarge || "",
      layout: card.layout || "normal",
      faces,
    }
  }

  async function fallbackData(copyUrl) {
    const text = (await (await fetch(copyUrl)).text()).replace(/\r\n/g, "\n").trim()
    const names = text.split("\n").map((line) => line.trim()).filter(Boolean)
    const cards = []
    for (let i = 0; i < names.length; i += 75) {
      if (i > 0) await sleep(90)
      const response = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: names.slice(i, i + 75).map((name) => ({ name: frontName(name) })) }),
      })
      if (!response.ok) throw new Error("Could not load card details.")
      const payload = await response.json()
      cards.push(...(payload.data || []).map(normalizeScryfall))
    }
    return { version: 0, cube: {}, cards, themes: [], tags: [] }
  }

  async function loadData(copyUrl) {
    try {
      const response = await fetch("./cube-data.json")
      if (!response.ok) throw new Error("No published viewer data.")
      const data = await response.json()
      if (!Array.isArray(data.cards) || !Array.isArray(data.themes) || !Array.isArray(data.tags)) {
        throw new Error("Invalid viewer data.")
      }
      return data
    } catch {
      return fallbackData(copyUrl)
    }
  }

  function rememberImages(card) {
    const large = (card.faces || []).map((face) => face.imageLarge || face.imageNormal).filter(Boolean)
    window.CubeLore?.remember(card.name, {
      small: card.imageNormal || card.imageLarge,
      large: large.length ? large : [card.imageLarge || card.imageNormal].filter(Boolean),
    })
  }

  function matches(card, tagsByCard) {
    const query = state.query.trim().toLowerCase()
    if (query && !searchText(card).includes(query)) return false
    if (state.types.size && ![...state.types].some((type) => hasType(card, type))) return false
    if (state.cmc.size && (isLand(card) || !state.cmc.has(cmcBucket(card.cmc)))) return false

    if (state.colors.size) {
      const identity = card.colorIdentity || []
      const selected = [...state.colors]
      if (state.colorMode === "exact") {
        if (identity.length !== selected.length || selected.some((color) => !identity.includes(color))) return false
      } else if (state.colorMode === "identity") {
        if (selected.some((color) => !identity.includes(color))) return false
      } else if (state.colors.has("C")) {
        if (identity.length) return false
      } else if (!selected.some((color) => identity.includes(color))) {
        return false
      }
    }

    const tags = tagsByCard.get(card.oracleId) || []
    if (state.themes.size) {
      const matched = tags.filter((tag) => state.themes.has(tag.themeId))
      if (!matched.length) return false
      if (state.minSynergy && !matched.some((tag) => tag.synergy >= state.minSynergy)) return false
    } else if (state.minSynergy && !tags.some((tag) => tag.synergy >= state.minSynergy)) {
      return false
    }
    return true
  }

  function colorBucket(card) {
    if (isLand(card) && !hasType(card, "Creature")) return "Lands"
    const identity = card.colorIdentity || []
    if (!identity.length) return "C"
    if (identity.length === 1) return identity[0]
    if (/\{[WUBRGC2]\/[WUBRGC]\}/.test(card.manaCost || "")) return "Hybrid"
    return "M"
  }

  function typeBucket(card) {
    return TYPE_ORDER.find((type) => type !== "Other" && hasType(card, type)) || "Other"
  }

  function kindBucket(card) {
    if (isLand(card) && !hasType(card, "Creature")) return "land"
    if (hasType(card, "Creature")) return "creature"
    if (hasType(card, "Instant") || hasType(card, "Sorcery")) return "spell"
    return "permanent"
  }

  function themeCounts(cards, tagsByCard) {
    const counts = new Map()
    for (const card of cards) {
      for (const tag of tagsByCard.get(card.oracleId) || []) {
        counts.set(tag.themeId, (counts.get(tag.themeId) || 0) + 1)
      }
    }
    return counts
  }

  function rankedThemes(themes, counts) {
    return [...themes].sort(
      (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name),
    )
  }

  function axisSpecs(axis, themes, themeIds) {
    if (axis === "none") return [["all", "", "#8c7235"]]
    if (axis === "color") return COLOR_SPECS
    if (axis === "type") return TYPE_ORDER.map((id) => [id, id, "#8c7235"])
    if (axis === "cmc") return [...CMC_BUCKETS.map((id) => [id, id === "0-1" ? "0–1" : id, "#8c7235"]), ["land", "Lands", "#517898"]]
    if (axis === "kind") return KIND_SPECS
    const byId = new Map(themes.map((theme) => [theme.id, theme]))
    return [...themeIds.map((id) => [id, byId.get(id)?.name || id, byId.get(id)?.accent || "#8c7235"]), ["other", "Other", "#69645d"]]
  }

  function bucketIds(card, axis, tagsByCard, themeIds) {
    if (axis === "none") return ["all"]
    if (axis === "color") return [colorBucket(card)]
    if (axis === "type") return [typeBucket(card)]
    if (axis === "cmc") return [isLand(card) ? "land" : cmcBucket(card.cmc)]
    if (axis === "kind") return [kindBucket(card)]
    const selected = new Set(themeIds)
    const hits = (tagsByCard.get(card.oracleId) || [])
      .map((tag) => tag.themeId)
      .filter((id) => selected.has(id))
    return hits.length ? [...new Set(hits)] : ["other"]
  }

  function groupCards(cards, themes, tagsByCard) {
    const counts = themeCounts(cards, tagsByCard)
    const selectedThemes = state.themes.size
      ? [...state.themes]
      : rankedThemes(themes, counts).filter((theme) => counts.get(theme.id)).slice(0, 20).map((theme) => theme.id)
    const primarySpecs = axisSpecs(state.primary, themes, selectedThemes)
    const secondary = state.secondary === state.primary ? "none" : state.secondary
    const secondarySpecs = axisSpecs(secondary, themes, selectedThemes)
    const columns = []

    for (const [id, label, accent] of primarySpecs) {
      const columnCards = cards.filter((card) => bucketIds(card, state.primary, tagsByCard, selectedThemes).includes(id))
      const keepEmpty = state.primary === "color" || state.primary === "none" || state.primary === "theme"
      if (!columnCards.length && !keepEmpty) continue
      const sections = []
      for (const [sectionId, sectionLabel, sectionAccent] of secondarySpecs) {
        const sectionCards = columnCards
          .filter((card) => bucketIds(card, secondary, tagsByCard, selectedThemes).includes(sectionId))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (sectionCards.length) sections.push({ id: sectionId, label: sectionLabel, accent: sectionAccent, cards: sectionCards })
      }
      columns.push({ id, label, accent, cards: columnCards, sections })
    }
    return columns
  }

  function chip(label, active, onClick, onOnly) {
    const button = element("button", "viewer-chip", label)
    button.type = "button"
    button.dataset.active = active ? "true" : "false"
    button.addEventListener("click", onClick)
    if (onOnly) {
      button.title = "Click to add/remove. Right-click to select only this."
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault()
        onOnly()
      })
    }
    return button
  }

  function selectControl(options, value, onChange, label) {
    const select = element("select", "viewer-select")
    select.setAttribute("aria-label", label)
    for (const [id, text] of options) {
      const option = element("option", "", text)
      option.value = id
      option.selected = id === value
      select.append(option)
    }
    select.addEventListener("change", () => onChange(select.value))
    return select
  }

  function renderControls(root, data, tagsByCard, render) {
    root.replaceChildren()
    const search = element("input", "viewer-search")
    search.type = "search"
    search.placeholder = "Search name, type, or rules text"
    search.value = state.query
    search.addEventListener("input", () => {
      state.query = search.value
      render()
    })
    root.append(search)

    const colorRow = element("div", "viewer-control-row")
    colorRow.append(element("span", "viewer-control-label", "Color"))
    for (const color of COLORS) {
      colorRow.append(chip(color, state.colors.has(color), () => {
        if (state.colors.has(color)) state.colors.delete(color)
        else state.colors.add(color)
        renderControls(root, data, tagsByCard, render)
        render()
      }, () => {
        state.colors = new Set([color])
        renderControls(root, data, tagsByCard, render)
        render()
      }))
    }
    colorRow.append(selectControl(
      [["any", "Any selected"], ["identity", "Contains identity"], ["exact", "Exact identity"]],
      state.colorMode,
      (value) => { state.colorMode = value; render() },
      "Color filter mode",
    ))
    root.append(colorRow)

    const typeRow = element("div", "viewer-control-row")
    typeRow.append(element("span", "viewer-control-label", "Type"))
    for (const type of TYPES) {
      typeRow.append(chip(type, state.types.has(type), () => {
        if (state.types.has(type)) state.types.delete(type)
        else state.types.add(type)
        renderControls(root, data, tagsByCard, render)
        render()
      }, () => {
        state.types = new Set([type])
        renderControls(root, data, tagsByCard, render)
        render()
      }))
    }
    root.append(typeRow)

    const cmcRow = element("div", "viewer-control-row")
    cmcRow.append(element("span", "viewer-control-label", "Mana value"))
    for (const bucket of CMC_BUCKETS) {
      cmcRow.append(chip(bucket, state.cmc.has(bucket), () => {
        if (state.cmc.has(bucket)) state.cmc.delete(bucket)
        else state.cmc.add(bucket)
        renderControls(root, data, tagsByCard, render)
        render()
      }, () => {
        state.cmc = new Set([bucket])
        renderControls(root, data, tagsByCard, render)
        render()
      }))
    }
    root.append(cmcRow)

    if (data.themes.length) {
      const counts = themeCounts(data.cards, tagsByCard)
      const query = state.themeQuery.trim().toLowerCase()
      const ranked = rankedThemes(data.themes, counts).filter((theme) =>
        !query || theme.name.toLowerCase().includes(query),
      )
      const themeWrap = element("div", "viewer-theme-controls")
      const themeHead = element("div", "viewer-control-row")
      themeHead.append(element("span", "viewer-control-label", "Theme"))
      const themeSearch = element("input", "viewer-theme-search")
      themeSearch.placeholder = "Find theme / tag"
      themeSearch.value = state.themeQuery
      themeSearch.addEventListener("input", () => {
        state.themeQuery = themeSearch.value
        state.themeVisible = 5
        renderControls(root, data, tagsByCard, render)
        const next = root.querySelector(".viewer-theme-search")
        next?.focus()
        next?.setSelectionRange(state.themeQuery.length, state.themeQuery.length)
      })
      themeHead.append(themeSearch)
      themeHead.append(selectControl(
        [["0", "Any synergy"], ["1", "Synergy 1+"], ["2", "Synergy 2+"], ["3", "Synergy 3+"], ["4", "Synergy 4"]],
        String(state.minSynergy),
        (value) => { state.minSynergy = Number(value); render() },
        "Minimum theme synergy",
      ))
      themeWrap.append(themeHead)
      const themeChips = element("div", "viewer-control-row")
      for (const theme of ranked.slice(0, state.themeVisible)) {
        themeChips.append(chip(`${theme.name} ${counts.get(theme.id) || 0}`, state.themes.has(theme.id), () => {
          if (state.themes.has(theme.id)) state.themes.delete(theme.id)
          else state.themes.add(theme.id)
          renderControls(root, data, tagsByCard, render)
          render()
        }, () => {
          state.themes = new Set([theme.id])
          renderControls(root, data, tagsByCard, render)
          render()
        }))
      }
      if (ranked.length > 5) {
        const more = chip(state.themeVisible >= ranked.length ? "Show less" : "Show more", false, () => {
          state.themeVisible = state.themeVisible >= ranked.length ? 5 : Math.min(ranked.length, state.themeVisible + 5)
          renderControls(root, data, tagsByCard, render)
        })
        more.classList.add("viewer-more")
        themeChips.append(more)
      }
      themeWrap.append(themeChips)
      root.append(themeWrap)
    }

    const displayRow = element("div", "viewer-display-row")
    const viewGroup = element("div", "viewer-button-group")
    for (const [id, label] of [["list", "List"], ["images", "Images"]]) {
      viewGroup.append(chip(label, state.display === id, () => {
        state.display = id
        renderControls(root, data, tagsByCard, render)
        render()
      }))
    }
    displayRow.append(viewGroup)
    const grouping = element("div", "viewer-grouping")
    grouping.append(element("span", "viewer-control-label", "Columns"))
    grouping.append(selectControl(AXES, state.primary, (value) => {
      state.primary = value
      if (state.secondary === value) state.secondary = value === "color" ? "type" : "color"
      renderControls(root, data, tagsByCard, render)
      render()
    }, "Primary grouping"))
    grouping.append(element("span", "viewer-control-label", "Then"))
    grouping.append(selectControl([["none", "None"], ...AXES], state.secondary, (value) => {
      state.secondary = value
      render()
    }, "Secondary grouping"))
    displayRow.append(grouping)
    root.append(displayRow)
  }

  function enablePan(surface) {
    let drag = null
    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return
      event.preventDefault()
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: surface.scrollLeft,
        top: surface.scrollTop,
        moved: false,
        target: event.target,
      }
      surface.setPointerCapture(event.pointerId)
    })
    surface.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && dx * dx + dy * dy < 36) return
      drag.moved = true
      surface.classList.add("is-panning")
      surface.scrollLeft = drag.left - dx
      surface.scrollTop = drag.top - dy
    })
    const endPan = (event, commitClick) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const { moved, target } = drag
      drag = null
      surface.classList.remove("is-panning")
      if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId)
      if (!commitClick || moved || !(target instanceof Element)) return
      const hit = target.closest("button, a")
      if (hit instanceof HTMLElement && surface.contains(hit)) hit.click()
    }
    surface.addEventListener("pointerup", (event) => endPan(event, true))
    surface.addEventListener("pointercancel", (event) => endPan(event, false))
    surface.addEventListener("dragstart", (event) => event.preventDefault())
  }

  function cardNode(card) {
    rememberImages(card)
    const button = element("button", state.display === "images" ? "viewer-image-card" : "viewer-list-card")
    button.type = "button"
    button.setAttribute("aria-label", card.name)
    button.dataset.color = colorBucket(card)
    if (state.display === "images") {
      const image = element("img")
      image.src = card.imageNormal || card.imageLarge
      image.alt = card.name
      image.loading = "lazy"
      button.append(image)
    } else {
      button.textContent = card.name
    }
    window.CubeLore?.bindZoom(button, card.name)
    return button
  }

  function renderColumns(root, columns, visibleCount, totalCount) {
    root.replaceChildren()
    root.className = `docs-cube-viewer viewer-${state.display}`
    const summary = element("p", "viewer-result-count", `${visibleCount} of ${totalCount} cards`)
    root.append(summary)
    const surface = element("div", "viewer-surface")
    enablePan(surface)
    const columnsNode = element("div", "viewer-columns")
    for (const column of columns) {
      const columnNode = element("section", "viewer-column")
      if (state.display === "images") columnNode.classList.add("viewer-column-images")
      const header = element("header", "viewer-column-header")
      header.style.color = column.accent
      header.textContent = `${column.label} (${column.cards.length})`
      columnNode.append(header)
      const body = element("div", "viewer-column-body")
      for (const section of column.sections) {
        const sectionNode = element("div", "viewer-section")
        if (section.label) {
          const label = element("p", "viewer-section-label", `${section.label} (${section.cards.length})`)
          label.style.color = section.accent
          sectionNode.append(label)
        }
        const cards = element(state.display === "images" ? "div" : "ul", state.display === "images" ? "viewer-image-grid" : "viewer-name-list")
        for (const card of section.cards) {
          if (state.display === "images") cards.append(cardNode(card))
          else {
            const item = element("li")
            item.append(cardNode(card))
            cards.append(item)
          }
        }
        sectionNode.append(cards)
        body.append(sectionNode)
      }
      columnNode.append(body)
      columnsNode.append(columnNode)
    }
    surface.append(columnsNode)
    root.append(surface)
  }

  async function start() {
    const details = document.querySelector(".spoiler-box")
    const grid = document.getElementById("card-grid")
    const copyUrl = document.querySelector("[data-copy-url]")?.getAttribute("data-copy-url")
    if (!details || !grid || !copyUrl) return
    grid.textContent = "Loading cube data…"
    try {
      const data = await loadData(copyUrl)
      data.cards.sort((a, b) => a.name.localeCompare(b.name))
      const tagsByCard = new Map()
      for (const tag of data.tags) {
        const list = tagsByCard.get(tag.oracleId) || []
        list.push(tag)
        tagsByCard.set(tag.oracleId, list)
      }
      document.querySelectorAll("[data-card-count]").forEach((node) => {
        node.textContent = `${data.cards.length} cards`
      })
      const controls = element("div", "docs-viewer-controls")
      grid.before(controls)
      const render = () => {
        const visible = data.cards.filter((card) => matches(card, tagsByCard))
        renderColumns(grid, groupCards(visible, data.themes, tagsByCard), visible.length, data.cards.length)
      }
      renderControls(controls, data, tagsByCard, render)
      render()
    } catch (error) {
      grid.textContent = error instanceof Error ? error.message : "Could not load the cube."
    }
  }

  const details = document.querySelector(".spoiler-box")
  const summary = details?.querySelector("summary")
  const closedLabel = summary?.textContent || "Show the card list"
  const syncFullscreen = () => {
    document.body.classList.toggle("viewer-fullscreen-open", Boolean(details?.open))
    if (summary) summary.textContent = details?.open ? "Close the card list" : closedLabel
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && details?.open) details.open = false
  })
  details?.addEventListener("toggle", syncFullscreen)
  syncFullscreen()
  if (details?.open) {
    details.dataset.viewerLoaded = "true"
    void start()
  }
  else details?.addEventListener("toggle", () => {
    if (details.open && !details.dataset.viewerLoaded) {
      details.dataset.viewerLoaded = "true"
      void start()
    }
  })
})()
