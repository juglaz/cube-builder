document.querySelectorAll("[data-src]").forEach(async (node) => {
  const url = node.getAttribute("data-src")
  if (!url) return
  try {
    const text = (await (await fetch(url)).text()).replace(/\r\n/g, "\n").trim()
    node.textContent = text
    const count = text.split("\n").filter(Boolean).length
    document.querySelectorAll("[data-card-count]").forEach((el) => {
      el.textContent = `${count} cards`
    })
  } catch {
    node.textContent = "Could not load the card list."
  }
})

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const previous = button.textContent
    try {
      const source = document.getElementById(button.getAttribute("data-copy") || "")
      const url = button.getAttribute("data-copy-url")
      let text = source?.textContent?.replace(/\r\n/g, "\n").trim() || ""
      if (url && (!text || text === "Loading list…" || text.startsWith("Could not"))) {
        text = (await (await fetch(url)).text()).replace(/\r\n/g, "\n").trim()
      }
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
