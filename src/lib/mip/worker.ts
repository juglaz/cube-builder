import loadHighs from 'highs'
import wasmUrl from 'highs/runtime?url'
import type { MipWorkerRequest, MipWorkerResponse } from './protocol'

const STATUS_NAMES: Record<number, string> = {
  0: 'Not Set',
  1: 'Load error',
  2: 'Model error',
  3: 'Presolve error',
  4: 'Solve error',
  5: 'Postsolve error',
  6: 'Empty',
  7: 'Optimal',
  8: 'Infeasible',
  9: 'Primal infeasible or unbounded',
  10: 'Unbounded',
  11: 'Bound on objective reached',
  12: 'Target for objective reached',
  13: 'Time limit reached',
  14: 'Iteration limit reached',
  15: 'Unknown',
  16: 'Solution limit reached',
  17: 'Interrupted',
}

type HighsRuntime = Awaited<ReturnType<typeof loadHighs>>

let highsPromise: Promise<HighsRuntime> | null = null

function getHighs(): Promise<HighsRuntime> {
  const proc = (globalThis as { process?: { type?: string; versions?: { node?: string } } }).process
  if (proc?.versions?.node) {
    // Vite may shim `process.versions.node` in workers. HiGHS then takes its Node
    // path and tries to import `node:module`, which fails in the browser.
    proc.type = 'renderer'
  }
  highsPromise ??= loadHighs({
    locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file),
  })
  return highsPromise
}

self.onmessage = (event: MessageEvent<MipWorkerRequest>) => {
  const { id, model } = event.data
  void (async () => {
    try {
      const highs = await getHighs()
      const vt = highs.constants.variableType
      const result = highs.withModel(
        {
          numCols: model.numCols,
          numRows: model.numRows,
          sense: highs.constants.objectiveSense.maximize,
          colCost: model.colCost,
          colLower: model.colLower.map((v) => (v <= -1e19 ? -highs.infinity : v)),
          colUpper: model.colUpper.map((v) => (v >= 1e19 ? highs.infinity : v)),
          rowLower: model.rowLower.map((v) => (v <= -1e19 ? -highs.infinity : v)),
          rowUpper: model.rowUpper.map((v) => (v >= 1e19 ? highs.infinity : v)),
          matrix: {
            format: 'csr',
            numRows: model.numRows,
            numCols: model.numCols,
            starts: model.starts,
            indices: model.indices,
            values: model.values,
          },
          integrality: model.integrality.map((v) => (v ? vt.integer : vt.continuous)),
          modelName: 'cube-mip',
        },
        (mip) => {
          mip.options.set({
            output_flag: false,
            time_limit: model.timeLimit,
            mip_rel_gap: model.mipRelGap,
            presolve: 'on',
          })
          mip.run()
          const status = mip.getModelStatus()
          let colValue: number[] = []
          let objective: number | null = null
          try {
            colValue = Array.from(mip.getSolution().colValue)
            objective = mip.getObjectiveValue()
          } catch {
            colValue = []
          }
          return {
            status,
            objective,
            colValue,
            runtimeMs: Math.round(mip.getRunTime() * 1000),
          }
        },
      )
      const response: MipWorkerResponse = {
        id,
        status: result.status,
        statusName: STATUS_NAMES[result.status] ?? `Status ${result.status}`,
        objective: result.objective,
        colValue: result.colValue,
        runtimeMs: result.runtimeMs,
      }
      self.postMessage(response)
    } catch (err) {
      const response: MipWorkerResponse = {
        id,
        status: 4,
        statusName: 'Solve error',
        objective: null,
        colValue: [],
        runtimeMs: 0,
        error: err instanceof Error ? err.message : String(err),
      }
      self.postMessage(response)
    }
  })()
}
