"use client";

/* eslint-disable @next/next/no-img-element -- blob/objectURL previews are not optimizable by next/image */

import { useEffect, useRef, useState } from "react";

import { createOptimizerWorker } from "@/lib/texture-optimizer/worker";
import {
  deletePreset,
  loadPresets,
  savePreset,
} from "@/lib/texture-optimizer/presets";
import type {
  DitheringAlgorithm,
  OptimizeSettings,
  OptimizerResponse,
} from "@/workers/optimizer.worker";

type SelectedFile = {
  file: File;
  name: string;
  size: number;
  objectUrl: string;
};

type Phase = "idle" | "processing" | "done" | "error" | "canceled";

type Result = {
  objectUrl: string;
  width: number;
  height: number;
  bytes: number;
};

const DEFAULT_SETTINGS: OptimizeSettings = {
  maxWidth: 512,
  maxHeight: 512,
  quantizeColors: 32,
  dithering: "floyd-steinberg",
};

const DITHER_LABELS: Record<DitheringAlgorithm, string> = {
  none: "None",
  "floyd-steinberg": "Floyd-Steinberg",
  bayer: "Bayer 8x8",
  ordered: "Ordered 4x4",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function OptimizerUI() {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [settings, setSettings] = useState<OptimizeSettings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [presets, setPresets] = useState<Awaited<ReturnType<typeof loadPresets>>>([]);
  const [presetName, setPresetName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let disposed = false;
    if (!workerRef.current) {
      const worker = createOptimizerWorker();
      worker.onmessage = (event: MessageEvent<OptimizerResponse>) => {
        if (disposed) {
          return;
        }
        const message = event.data;
        if (message.jobId !== jobIdRef.current) {
          return;
        }

        if (message.type === "progress") {
          setProgress(message.percent);
        } else if (message.type === "done") {
          if (jobIdRef.current === null) {
            return;
          }
          const canvas = new OffscreenCanvas(message.outputWidth, message.outputHeight);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(message.output, 0, 0);
          }
          message.output.close();
          canvas.convertToBlob({ type: "image/png" }).then((blob) => {
            if (disposed || jobIdRef.current === null) {
              return;
            }
            setResult({
              objectUrl: URL.createObjectURL(blob),
              width: message.outputWidth,
              height: message.outputHeight,
              bytes: blob.size,
            });
            setPhase("done");
            jobIdRef.current = null;
          });
        } else if (message.type === "error") {
          setPhase(message.canceled ? "canceled" : "error");
          setError(message.message);
          jobIdRef.current = null;
        }
      };
      worker.postMessage({ type: "ping", jobId: crypto.randomUUID() });
      workerRef.current = worker;
    }

    return () => {
      disposed = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    return () => {
      if (file) {
        URL.revokeObjectURL(file.objectUrl);
      }
      if (result) {
        URL.revokeObjectURL(result.objectUrl);
      }
    };
  }, [file, result]);

  function handleFiles(files: FileList | null) {
    const selected = files?.[0];
    if (!selected || !selected.type.startsWith("image/")) {
      setFile(null);
      setResult(null);
      setPhase("idle");
      return;
    }
    setFile({
      file: selected,
      name: selected.name,
      size: selected.size,
      objectUrl: URL.createObjectURL(selected),
    });
    setResult(null);
    setError(null);
    setPhase("idle");
    setProgress(0);
  }

  function runOptimize() {
    const selected = file;
    const worker = workerRef.current;
    if (!selected || !worker) {
      return;
    }

    if (result) {
      URL.revokeObjectURL(result.objectUrl);
    }
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase("processing");

    const jobId = crypto.randomUUID();
    jobIdRef.current = jobId;
    worker.postMessage({
      type: "optimize",
      jobId,
      file: selected.file,
      settings,
    });
  }

  function cancelOptimize() {
    const worker = workerRef.current;
    if (!worker || !jobIdRef.current) {
      return;
    }
    worker.postMessage({ type: "cancel", jobId: jobIdRef.current });
  }

  async function handleSavePreset() {
    try {
      const next = await savePreset(presetName, settings);
      setPresets(next);
      setPresetName("");
    } catch (presetError) {
      setError(
        presetError instanceof Error ? presetError.message : "Could not save the preset.",
      );
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      setPresets(await deletePreset(id));
    } catch {
      setError("Could not delete the preset.");
    }
  }

  const isBusy = phase === "processing";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold tracking-tight">Input</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a texture or an image. All pixel manipulation runs in a Web
          Worker, without blocking the page.
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
            Drag and drop an image here, or click to select one
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
          <div className="mt-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {file.name}
              </span>{" "}
              - {formatBytes(file.size)}
            </p>
            <img
              src={file.objectUrl}
              alt="Original image preview"
              className="mt-3 max-h-64 rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
            No file selected.
          </p>
        )}

        {result ? (
          <div className="mt-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Optimized
              </span>{" "}
              - {result.width} x {result.height} - {formatBytes(result.bytes)}
            </p>
            <img
              src={result.objectUrl}
              alt="Optimized image preview"
              className="mt-3 max-h-64 rounded-lg border border-zinc-200 object-contain dark:border-zinc-800"
            />
          </div>
        ) : null}

        {phase === "processing" ? (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Processing in Web Worker...
              </span>
              <span className="text-zinc-500">{progress}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        {phase === "error" || phase === "canceled" ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {phase === "canceled" ? "Optimization canceled." : error}
          </p>
        ) : null}
      </section>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Max width (px)
              </span>
              <input
                type="number"
                min={32}
                max={2048}
                value={settings.maxWidth}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    maxWidth: Number(event.target.value) || settings.maxWidth,
                  })
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Max height (px)
              </span>
              <input
                type="number"
                min={32}
                max={2048}
                value={settings.maxHeight}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    maxHeight: Number(event.target.value) || settings.maxHeight,
                  })
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Colors (quantization)
              </span>
              <input
                type="range"
                min={2}
                max={256}
                value={settings.quantizeColors}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    quantizeColors: Number(event.target.value),
                  })
                }
                className="mt-2 w-full accent-orange-500"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                {settings.quantizeColors} colors
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Dithering
              </span>
              <select
                value={settings.dithering}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    dithering: event.target.value as DitheringAlgorithm,
                  })
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {(Object.keys(DITHER_LABELS) as DitheringAlgorithm[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {DITHER_LABELS[key]}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Worker</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {isBusy
              ? "A job is running in the Web Worker."
              : "The Web Worker will process pixels off the main thread."}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!file || isBusy}
              onClick={runOptimize}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isBusy ? "Optimizing..." : result ? "Optimize again" : "Optimize"}
            </button>
            {isBusy ? (
              <button
                type="button"
                onClick={cancelOptimize}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
            ) : null}
            {result ? (
              <a
                href={result.objectUrl}
                download={`${file?.name.replace(/\.[^.]+$/, "") ?? "texture"}-optimized.png`}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Download PNG
              </a>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Presets</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Save the current settings and reuse them later.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder="Preset name"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="button"
              onClick={handleSavePreset}
              className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          </div>
          {presets.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => setSettings(preset.settings)}
                    className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(preset.id)}
                    aria-label={`Delete preset ${preset.name}`}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                  >
                    <svg
                      className="size-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.8}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No presets saved yet.</p>
          )}
        </section>
      </aside>
    </div>
  );
}