"use client";

import { useEffect, useRef, useState } from "react";

import { createOptimizerWorker } from "@/lib/texture-optimizer/worker";
import type { OptimizerResponse } from "@/workers/optimizer.worker";

type SelectedFile = {
  name: string;
  size: number;
};

type WorkerStatus = "checking" | "ready" | "error";

export function OptimizerUI() {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>("checking");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const worker = createOptimizerWorker();

    worker.onmessage = (event: MessageEvent<OptimizerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        setWorkerStatus("ready");
      }
      if (message.type === "error") {
        setWorkerStatus("error");
      }
    };

    worker.postMessage({ type: "ping", jobId: crypto.randomUUID() });

    return () => worker.terminate();
  }, []);

  function handleFiles(files: FileList | null) {
    const selected = files?.[0];
    if (!selected || !selected.type.startsWith("image/")) {
      setFile(null);
      return;
    }
    setFile({ name: selected.name, size: selected.size });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">Input</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Carica una texture o un&apos;immagine. Tutta la manipolazione dei
          pixel avviene in un Web Worker, senza bloccare la pagina.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          className={`mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
            isDragging
              ? "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/30"
              : "border-zinc-300 bg-zinc-50 hover:border-orange-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-orange-800"
          }`}
        >
          <svg
            className="size-8 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Trascina qui l&apos;immagine oppure clicca per selezionarla
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-500">
            PNG, JPG, WebP, GIF
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </button>

        {file ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {file.name}
            </span>{" "}
            - {(file.size / 1024).toFixed(1)} KB
          </p>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
            Nessun file selezionato.
          </p>
        )}
      </section>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Impostazioni</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            I controlli verranno attivati con il pipeline di ottimizzazione.
          </p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Colori (quantizzazione)
              </span>
              <input
                type="range"
                min={2}
                max={256}
                value={32}
                disabled
                className="mt-2 w-full accent-orange-500 disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Dithering
              </span>
              <select
                disabled
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option>Floyd-Steinberg</option>
                <option>Bayer</option>
                <option>Nessuno</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Worker</h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span
              className={`size-2 rounded-full ${
                workerStatus === "ready"
                  ? "bg-emerald-500"
                  : workerStatus === "error"
                    ? "bg-red-500"
                    : workerStatus === "checking"
                      ? "bg-amber-400"
                      : "bg-zinc-300"
              }`}
            />
            {workerStatus === "ready"
              ? "Web Worker attivo e pronto"
              : workerStatus === "checking"
                ? "Verifica del Web Worker..."
                : "Errore di inizializzazione del Web Worker"}
          </p>
          <button
            type="button"
            disabled
            className="mt-4 w-full cursor-not-allowed rounded-lg bg-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          >
            Ottimizza (presto disponibile)
          </button>
        </section>
      </aside>
    </div>
  );
}