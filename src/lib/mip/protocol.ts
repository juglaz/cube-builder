import type { PackedMipModel } from './model'

export type MipWorkerRequest = {
  id: number
  model: PackedMipModel
}

export type MipWorkerResponse = {
  id: number
  status: number
  statusName: string
  objective: number | null
  colValue: number[]
  runtimeMs: number
  error?: string
}
