"use client";

/* eslint-disable @next/next/no-img-element -- blob/objectURL previews are not optimizable by next/image */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/lib/supabase/use-auth";
import { createOptimizerWorker } from "@/lib/texture-optimizer/worker";
import {
  FREE_PRESETS,
  deleteCustomPreset,
  loadCustomPresets,
  saveCustomPreset,
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
  format: "image/png" | "image/webp";
};

const DEFAULT_SETTINGS: OptimizeSettings = {
  maxWidth: 512,
  maxHeight: 512,
  quantizeColors: 32,
  dithering: "floyd-steinberg",
  ditherStrength: 1,
};

const DITHER_LABELS: Record<DitheringAlgorithm, string> = {
  none: "None",
  "floyd-steinberg": "Floyd-Steinberg",
  bayer: "Bayer 8x8",
  ordered: "Ordered 4x4",
};

const DOWNLOAD_FORMATS: { value: Result["format"]; label: string }[] = [
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function OptimizerUI() {
  const { user } = useAuth();
  const isUnlocked = Boolean(user);

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [settings, setSettings] = useState<OptimizeSettings>(DEFAULT_SETTINGS);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<Result["format"]>("image/png");
  const [customPresets, setCustomPresets] = useState<
    Awaited<ReturnType<typeof loadCustomPresets>>
  >([]);
  const [presetName, setPresetName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  // Local text copies of the dimension inputs so users can clear the field
  // while typing; the parsed value is committed on blur.
  const [maxWidthText, setMaxWidthText] = useState(String(DEFAULT_SETTINGS.maxWidth));
  const [maxHeightText, setMaxHeightText] = useState(String(DEFAULT_SETTINGS.maxHeight));

  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputBitmapRef = useRef<ImageBitmap | null>(null);
  // Latest selected format, readable from the worker onmessage closure.
  const downloadFormatRef = useRef<Result["format"]>("image/png");
  // Format the kept bitmap was last encoded to, to skip redundant re-encodes.
  const encodedFormatRef = useRef<Result["format"] | null>(null);

  const isBusy = phase === "processing";

  // Keep the output bitmap alive so we can re-encode it for PNG/WebP.
  useEffect(() => {
    return () => {
      outputBitmapRef.current?.close();
      outputBitmapRef.current = null;
    };
  }, []);

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
          // Stale response (abandoned/cancelled job): release any transferred
          // bitmap so the worker's output does not leak.
          if ("output" in message && message.output instanceof ImageBitmap) {
            message.output.close();
          }
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
          outputBitmapRef.current?.close();
          outputBitmapRef.current = message.output;
          canvas.convertToBlob({ type: downloadFormatRef.current }).then((blob) => {
            if (disposed || jobIdRef.current === null) {
              return;
            }
            setResult({
              objectUrl: URL.createObjectURL(blob),
              width: message.outputWidth,
              height: message.outputHeight,
              bytes: blob.size,
              format: downloadFormatRef.current,
            });
            // Remember which format the kept bitmap was encoded to, so the
            // re-encode effect skips the identical format on mount/phase change.
            encodedFormatRef.current = downloadFormatRef.current;
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

  // Keep the latest format selectable in the worker onmessage closure.
  useEffect(() => {
    downloadFormatRef.current = downloadFormat;
  }, [downloadFormat]);

  // Re-encode the kept bitmap when the user picks a different download format,
  // skipping it when the bitmap is already in the selected format.
  useEffect(() => {
    const bitmap = outputBitmapRef.current;
    if (!bitmap || phase !== "done") {
      return;
    }
    if (encodedFormatRef.current === downloadFormat) {
      return;
    }
    let cancelled = false;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      canvas.convertToBlob({ type: downloadFormat }).then((blob) => {
        if (cancelled) {
          return;
        }
        setResult((current) => {
          if (!current) {
            return current;
          }
          URL.revokeObjectURL(current.objectUrl);
          encodedFormatRef.current = downloadFormat;
          return {
            ...current,
            objectUrl: URL.createObjectURL(blob),
            bytes: blob.size,
            format: downloadFormat,
          };
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [downloadFormat, phase]);

  useEffect(() => {
    if (!isUnlocked) {
      return;
    }
    loadCustomPresets().then(setCustomPresets).catch(() => setCustomPresets([]));
  }, [isUnlocked]);

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
    // Cancel any in-flight job so an old result cannot override the UI.
    abandonJob();
    if (!selected || !selected.type.startsWith("image/")) {
      setFile(null);
      setResult(null);
      setPhase("idle");
      return;
    }
    outputBitmapRef.current?.close();
    outputBitmapRef.current = null;
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

  function applyPreset(presetId: string) {
    const preset = FREE_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      return;
    }
    setSettings({ ...preset.settings });
    setMaxWidthText(String(preset.settings.maxWidth));
    setMaxHeightText(String(preset.settings.maxHeight));
    setActivePresetId(presetId);
  }

  function updateSetting<K extends keyof OptimizeSettings>(
    key: K,
    value: OptimizeSettings[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setActivePresetId(null);
  }

  function commitDimension(
    key: "maxWidth" | "maxHeight",
    text: string,
    fallback: number,
  ) {
    const parsed = Math.round(Number(text));
    if (key === "maxWidth") {
      const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(2048, Math.max(16, parsed)) : fallback;
      setMaxWidthText(String(value));
      updateSetting(key, value);
    } else {
      const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(2048, Math.max(16, parsed)) : fallback;
      setMaxHeightText(String(value));
      updateSetting(key, value);
    }
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
    outputBitmapRef.current?.close();
    outputBitmapRef.current = null;
    encodedFormatRef.current = null;
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

  function abandonJob() {
    const worker = workerRef.current;
    if (!worker || !jobIdRef.current) {
      return;
    }
    // Tell the worker to stop, and drop the job id so any late `canceled` or
    // `done` response for the old job is ignored by the message handler.
    worker.postMessage({ type: "cancel", jobId: jobIdRef.current });
    jobIdRef.current = null;
  }

  async function handleSavePreset() {
    const trimmed = presetName.trim();
    if (
      customPresets.some(
        (preset) => preset.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError("A preset with this name already exists.");
      return;
    }
    try {
      const next = await saveCustomPreset(trimmed, settings);
      setCustomPresets(next);
      setPresetName("");
    } catch (presetError) {
      setError(
        presetError instanceof Error ? presetError.message : "Could not save the preset.",
      );
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      setCustomPresets(await deleteCustomPreset(id));
    } catch {
      setError("Could not delete the preset.");
    }
  }

  const fileNameBase = file?.name.replace(/\.[^.]+$/, "") ?? "texture";
  const downloadExtension = downloadFormat === "image/png" ? "png" : "webp";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Presets</h2>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
              Free
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            One-click retro looks with fixed settings, available to everyone.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {FREE_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/30"
                      : "border-zinc-200 hover:border-orange-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-orange-800 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  <span className="block text-sm font-medium">
                    {preset.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {preset.settings.quantizeColors} colors ·{" "}
                    {preset.settings.maxWidth}x{preset.settings.maxHeight} ·{" "}
                    {DITHER_LABELS[preset.settings.dithering]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          aria-label="Advanced settings"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Advanced settings
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <svg
                className="size-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                />
              </svg>
              PRO
            </span>
          </div>

          {!isUnlocked ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-50/80 p-6 text-center backdrop-blur-[2px] dark:bg-zinc-950/80">
              <span className="grid size-12 place-items-center rounded-full border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                <svg
                  className="size-5 text-zinc-500 dark:text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              </span>
              <p className="max-w-[220px] text-sm font-semibold">
                Unlock fine control
              </p>
              <p className="max-w-[230px] text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Set exact color counts, dither strength and resolution — and save
                your own presets.
              </p>
              <Link
                href="/login?next=/tools/texture-optimizer"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Sign in to unlock
              </Link>
            </div>
          ) : null}

          <fieldset disabled={!isUnlocked} className="mt-5 space-y-4">
            <legend className="sr-only">Advanced optimization settings</legend>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Max width (px)
              </span>
              <input
                type="number"
                min={16}
                max={2048}
                inputMode="numeric"
                value={maxWidthText}
                onChange={(event) => {
                  setMaxWidthText(event.target.value);
                }}
                onBlur={() =>
                  commitDimension("maxWidth", maxWidthText, settings.maxWidth)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Max height (px)
              </span>
              <input
                type="number"
                min={16}
                max={2048}
                inputMode="numeric"
                value={maxHeightText}
                onChange={(event) => {
                  setMaxHeightText(event.target.value);
                }}
                onBlur={() =>
                  commitDimension("maxHeight", maxHeightText, settings.maxHeight)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
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
                  updateSetting("quantizeColors", Number(event.target.value))
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
                  updateSetting(
                    "dithering",
                    event.target.value as DitheringAlgorithm,
                  )
                }
                className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
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
            <label className="block">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Dither strength
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.ditherStrength}
                disabled={
                  !isUnlocked || settings.dithering === "none"
                }
                onChange={(event) =>
                  updateSetting("ditherStrength", Number(event.target.value))
                }
                className="mt-2 w-full accent-orange-500 disabled:opacity-50"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                {settings.dithering === "none"
                  ? "Not used with \"None\" dithering."
                  : `${Math.round(settings.ditherStrength * 100)}%`}
              </span>
            </label>
          </fieldset>
        </section>

        {isUnlocked ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold tracking-tight">My presets</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Save the current advanced settings and reuse them later.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Preset name"
                maxLength={60}
                aria-label="Preset name"
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
            {customPresets.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {customPresets.map((preset) => (
                  <li
                    key={preset.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSettings({ ...preset.settings });
                        setMaxWidthText(String(preset.settings.maxWidth));
                        setMaxHeightText(String(preset.settings.maxHeight));
                      }}
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
              <p className="mt-4 text-sm text-zinc-500">No custom presets yet.</p>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold tracking-tight">Export</h2>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Format:
              </span>
              <div
                role="radiogroup"
                aria-label="Download format"
                className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
              >
                {DOWNLOAD_FORMATS.map((format) => {
                  const selected = downloadFormat === format.value;
                  return (
                    <button
                      key={format.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!result}
                      onClick={() => setDownloadFormat(format.value)}
                      className={`rounded-md px-3 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        selected
                          ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {format.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
                download={`${fileNameBase}-optimized.${downloadExtension}`}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Download {downloadFormat === "image/png" ? "PNG" : "WebP"}
              </a>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-500">
            Everything is processed locally in your browser — no uploads, no
            wait queues.
          </p>
        </section>
      </aside>
    </div>
  );
}