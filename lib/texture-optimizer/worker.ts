export type OptimizerWorker = Worker;

/**
 * Instantiates the optimizer Web Worker using the Vite/Webpack-compatible
 * `new URL(..., import.meta.url)` syntax so Next.js/Turbopack bundles the
 * worker as a separate chunk. See `/workers/optimizer.worker.ts`.
 */
export function createOptimizerWorker(): OptimizerWorker {
  return new Worker(new URL("@/workers/optimizer.worker.ts", import.meta.url), {
    type: "module",
  });
}