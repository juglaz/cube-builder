import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { publishCubeDocsToRoot } from './docs-publisher.ts'

const archive = `<!doctype html>
<div class="catalog-grid">
  <!-- cube-builder:generated:start --><!-- cube-builder:generated:end -->
</div>
`

function viewer(names: string[]) {
  const cards = names.map((name, index) => ({
    oracleId: `oracle-${name.toLowerCase().replaceAll(' ', '-')}`,
    name,
    cmc: index + 1,
    typeLine: 'Artifact Creature — Construct',
    colors: [],
    colorIdentity: [],
    manaCost: `{${index + 1}}`,
    oracleText: 'This creature enters with a +1/+1 counter on it.',
    keywords: [],
    imageNormal: `https://example.com/${index}.jpg`,
    imageLarge: `https://example.com/${index}-large.jpg`,
    layout: 'normal',
  }))
  const themes = [
    { id: 'counter', name: 'Counters', description: 'Counter cards', accent: '#abc123' },
  ]
  const tags = cards.map((card) => ({ oracleId: card.oracleId, themeId: 'counter', synergy: 4 }))
  return { cards, themes, tags }
}

test('preserves custom pages and creates stable generated pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cube-docs-'))
  try {
    const docs = join(root, 'docs')
    await mkdir(join(docs, 'custom'), { recursive: true })
    await writeFile(join(docs, 'index.html'), archive)
    await writeFile(join(docs, 'custom', 'index.html'), '<h1>Hand-authored</h1>\n')
    await writeFile(join(docs, 'custom', 'cardlist.txt'), 'Old Card\n')

    const custom = await publishCubeDocsToRoot(root, {
      cubeId: 'custom-id',
      slug: 'custom',
      name: 'Custom Cube',
      description: 'Do not overwrite this page.',
      ...viewer(['Zeta Card', 'Alpha Card']),
    })
    assert.equal(custom.mode, 'custom-cardlist')
    assert.equal(await readFile(join(docs, 'custom', 'index.html'), 'utf8'), '<h1>Hand-authored</h1>\n')
    assert.equal(await readFile(join(docs, 'custom', 'cardlist.txt'), 'utf8'), 'Alpha Card\nZeta Card\n')
    const customData = JSON.parse(await readFile(join(docs, 'custom', 'cube-data.json'), 'utf8'))
    assert.equal(customData.cards.length, 2)
    assert.equal(customData.themes[0].name, 'Counters')
    assert.equal(customData.tags[0].synergy, 4)

    const created = await publishCubeDocsToRoot(root, {
      cubeId: 'generated-id',
      name: 'The Test & Cube',
      description: 'Artifacts < counters.',
      ...viewer(['Second Card', 'First Card']),
    })
    assert.equal(created.slug, 'test-cube')
    assert.equal(created.mode, 'generated-created')
    const createdHtml = await readFile(join(docs, 'test-cube', 'index.html'), 'utf8')
    assert.match(createdHtml, /data-cube-builder-generated="true"/)
    assert.match(createdHtml, /The Test &amp; Cube/)
    assert.match(createdHtml, /Artifacts &lt; counters\./)

    const updated = await publishCubeDocsToRoot(root, {
      cubeId: 'generated-id',
      slug: created.slug,
      name: 'Renamed Test Cube',
      description: 'Updated description.',
      ...viewer(['Only Card']),
    })
    assert.equal(updated.slug, 'test-cube')
    assert.equal(updated.mode, 'generated-updated')
    const updatedHtml = await readFile(join(docs, 'test-cube', 'index.html'), 'utf8')
    assert.match(updatedHtml, /Renamed Test Cube/)
    assert.match(updatedHtml, /Updated description\./)

    const collision = await publishCubeDocsToRoot(root, {
      cubeId: 'different-id',
      name: 'Test Cube',
      description: 'A different cube.',
      ...viewer(['Other Card']),
    })
    assert.equal(collision.slug, 'test-cube-2')

    const archiveHtml = await readFile(join(docs, 'index.html'), 'utf8')
    assert.match(archiveHtml, /Renamed Test Cube/)
    assert.match(archiveHtml, /Test Cube/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
