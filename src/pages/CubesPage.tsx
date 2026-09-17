import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveData } from '../hooks/useLiveData'
import { formatCubeCreated } from '../lib/format'
import { createCube, deleteCube } from '../lib/repo'

export function CubesPage() {
  const { cubes, cubeCards } = useLiveData()
  const [name, setName] = useState('')
  const [size, setSize] = useState(360)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl text-amber-50">Cubes</h2>
        <p className="text-stone-400">Cubes are subsets of the library. Generate one from themes or build by hand.</p>
      </div>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          void createCube(name.trim(), size)
          setName('')
        }}
      >
        <label className="flex-1 text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Target size
          <input
            type="number"
            min={40}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="mt-1 w-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
        </label>
        <button type="submit" className="rounded-xl bg-amber-200/20 px-4 py-2 text-amber-50">
          Create empty cube
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {cubes.map((cube) => {
          const count = cubeCards.filter((c) => c.cubeId === cube.id).length
          return (
            <article key={cube.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg text-amber-50">{cube.name}</h3>
                  <p className="text-sm text-stone-400">
                    {formatCubeCreated(cube.createdAt)}
                    {cube.createdAt ? ' · ' : ''}
                    {count} / {cube.targetSize} cards
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete ${cube.name}?`)) void deleteCube(cube.id)
                  }}
                  className="text-sm text-stone-500 hover:text-red-200"
                >
                  Delete
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <Link to={`/cubes/${cube.id}`} className="rounded-xl bg-white/8 px-3 py-2 text-sm">
                  Open
                </Link>
                <Link to="/generate" className="rounded-xl bg-white/8 px-3 py-2 text-sm">
                  Generate
                </Link>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
