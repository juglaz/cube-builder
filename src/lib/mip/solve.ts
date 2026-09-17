import type { PackedMipModel } from './model'
import type { MipWorkerRequest, MipWorkerResponse } from './protocol'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { resolve: (value: MipWorkerResponse) => void; reject: (err: Error) => void }
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<MipWorkerResponse>) => {
      const job = pending.get(event.data.id)
      if (!job) return
      pending.delete(event.data.id)
      job.resolve(event.data)
    }
    worker.onerror = (event) => {
      const err = new Error(event.message || 'MIP worker failed')
      for (const job of pending.values()) job.reject(err)
      pending.clear()
    }
  }
  return worker
}

export function solvePackedMip(model: PackedMipModel): Promise<MipWorkerResponse> {
  return new Promise((resolve, reject) => {
    const id = nextId
    nextId += 1
    pending.set(id, { resolve, reject })
    const request: MipWorkerRequest = { id, model }
    getWorker().postMessage(request)
  })
}
