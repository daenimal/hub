"use client";

/* eslint-disable @next/next/no-img-element -- blob/objectURL previews are not optimizable by next/image */

import { useEffect, useRef, useState } from "react";

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

type LightboxState = {
  src: string;
  label: string;
  detail: string;
};

const DEFAULT_PRESET = FREE_PRESETS[0];

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

const CHECKERBOARD = {
  backgroundImage:
    "repeating-conic-gradient(rgba(255,255,255,0.07) 0% 25%, transparent 0% 50%)",
  backgroundSize: "20px 20px",
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type ZoomPreviewProps = {
  src: string;
  altImage: string;
  label: string;
  detail: string;
  onFullscreen: (src: string, label: string, detail: string) => void;
};

function ZoomPreview({
  src,
  altImage,
  label,
  detail,
  onFullscreen,
}: ZoomPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const zoomRef = useRef(1);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      // Point under the cursor, in image coordinates.
      const originX = event.clientX - rect.left + el.scrollLeft;
      const originY = event.clientY - rect.top + el.scrollTop;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const next = Math.min(16, Math.max(0.1, zoomRef.current * factor));
      const ratio = next / zoomRef.current;
      el.scrollLeft = originX * ratio - (event.clientX - rect.left);
      el.scrollTop = originY * ratio - (event.clientY - rect.top);
      zoomRef.current = next;
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => {
      const size = { width: probe.naturalWidth, height: probe.naturalHeight };
      setNatural(size);
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) {
          return;
        }
        const ratio = Math.min(
          (el.clientWidth - 24) / size.width,
          (el.clientHeight - 24) / size.height,
        );
        const next = Math.min(8, Math.max(0.1, ratio));
        zoomRef.current = next;
        setZoom(next);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
          el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
        });
      });
    };
    probe.src = src;
  }, [src]);

  function setZoomClamped(value: number) {
    const next = Math.min(16, Math.max(0.1, value));
    zoomRef.current = next;
    setZoom(next);
  }

  function fitToContainer(size: { width: number; height: number } | null = natural) {
    const el = containerRef.current;
    if (!el || !size) {
      return;
    }
    const ratio = Math.min(
      (el.clientWidth - 24) / size.width,
      (el.clientHeight - 24) / size.height,
    );
    const next = Math.min(8, Math.max(0.1, ratio));
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
    });
  }

  function onPointerDown(event: React.PointerEvent) {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    el.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      pinchRef.current = { dist: distance(points[0], points[1]), zoom: zoomRef.current };
      dragRef.current = null;
    } else {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const el = containerRef.current;
    if (!el || !pointersRef.current.has(event.pointerId)) {
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const points = [...pointersRef.current.values()];
      setZoomClamped(pinch.zoom * (distance(points[0], points[1]) / pinch.dist));
      return;
    }
    const drag = dragRef.current;
    if (drag && pointersRef.current.size === 1) {
      el.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
      el.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
    }
  }

  const zoomButton =
    "grid size-7 place-items-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:hover:border-orange-700";

  const zoomPill =
    "grid h-7 place-items-center rounded-md border border-zinc-200 px-2 text-xs font-medium text-zinc-600 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-orange-700";

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-zinc-500 dark:text-zinc-400">
          {label} · {detail}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoomClamped(zoom / 1.25)}
            className={zoomButton}
          >
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoomClamped(zoom * 1.25)}
            className={zoomButton}
          >
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </button>
          <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          <button
            type="button"
            aria-label="Fit to screen"
            onClick={() => fitToContainer()}
            className={zoomPill}
          >
            Fit
          </button>
          <button
            type="button"
            aria-label="Zoom to 100 percent"
            onClick={() => setZoomClamped(1)}
            className={zoomPill}
          >
            100%
          </button>
          <button
            type="button"
            aria-label="Open fullscreen preview"
            onClick={() => onFullscreen(src, label, detail)}
            className="grid size-7 place-items-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:border-orange-300 hover:text-orange-600 dark:border-zinc-700 dark:hover:border-orange-700"
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
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25-11.25h-4.5m4.5 0v4.5m0-4.5L15 9m4.5 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
              />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex-1 cursor-grab touch-none select-none overflow-auto overscroll-contain rounded-xl border border-zinc-200 active:cursor-grabbing dark:border-zinc-800"
      >
        <img
          src={src}
          alt={altImage}
          draggable={false}
          style={{
            ...CHECKERBOARD,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
          className="min-w-0"
        />
      </div>
    </div>
  );
}

export function OptimizerUI() {
  const { isPremium } = useAuth();

  const [file, setFile] = useState<SelectedFile | null>(null);
  const [settings, setSettings] = useState<OptimizeSettings>({
    ...DEFAULT_PRESET.settings,
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(
    DEFAULT_PRESET.id,
  );
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
  const [maxWidthText, setMaxWidthText] = useState(
    String(DEFAULT_PRESET.settings.maxWidth),
  );
  const [maxHeightText, setMaxHeightText] = useState(
    String(DEFAULT_PRESET.settings.maxHeight),
  );

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
  if (!isPremium) {
    return;
  }
  loadCustomPresets().then(setCustomPresets).catch(() => setCustomPresets([]));
}, [isPremium]);

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

  function removeSelectedFile() {
    // Cancel any in-flight job and release the output bitmap so nothing
    // can surface afterwards.
    abandonJob();
    outputBitmapRef.current?.close();
    outputBitmapRef.current = null;
    encodedFormatRef.current = null;
    setFile(null);
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
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.min(2048, Math.max(16, parsed)) : fallback;
    if (key === "maxWidth") {
      setMaxWidthText(String(value));
    } else {
      setMaxHeightText(String(value));
    }
    updateSetting(key, value);
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

  // Lightbox: enlarged, zoomable preview.
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  function openLightbox(src: string, label: string, detail = "") {
    const probe = new Image();
    probe.onload = () => {
      const dims = { width: probe.naturalWidth, height: probe.naturalHeight };
      setNaturalSize(dims);
      // Fit the image once the lightbox has laid out.
      window.setTimeout(() => fitLightbox(dims), 60);
    };
    probe.src = src;
    setNaturalSize(null);
    setZoom(1);
    setLightbox({ src, label, detail });
  }

  function closeLightbox() {
    setLightbox(null);
    dragRef.current = null;
  }

  function fitLightbox(size = naturalSize) {
    const scroller = lightboxRef.current;
    if (!scroller || !size) {
      return;
    }
    const ratio = Math.min(
      (scroller.clientWidth - 48) / size.width,
      (scroller.clientHeight - 48) / size.height,
    );
    setZoom(Math.min(8, Math.max(0.1, ratio)));
  }

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    const scroller = lightboxRef.current;
    if (!scroller) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) =>
        Math.min(16, Math.max(0.1, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))),
      );
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [lightbox]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* Left: upload strip + large zoomable preview */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 lg:min-h-0">
        {/* Upload strip */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
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
              className={`flex w-full min-w-0 cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors xl:w-72 xl:shrink-0 ${
                isDragging
                  ? "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/30"
                  : "border-zinc-300 bg-zinc-50 hover:border-orange-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-orange-800"
              }`}
            >
              <svg
                className="size-6 shrink-0 text-zinc-400"
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
              <span className="min-w-0">
                <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Drag & drop, or click to select
                </span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                  PNG, JPG, WebP, GIF
                </span>
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
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 xl:w-64 xl:shrink-0 dark:border-zinc-800 dark:bg-zinc-950">
                <img
                  src={file.objectUrl}
                  alt="Selected image thumbnail"
                  className="size-10 shrink-0 rounded-lg object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {file.name}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {formatBytes(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Remove selected image"
                  onClick={removeSelectedFile}
                  className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                >
                  <svg
                    className="size-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <p className="hidden text-xs leading-5 text-zinc-500 xl:block dark:text-zinc-500">
                Upload an image, pick a preset, and see the result here.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
              <div
                role="radiogroup"
                aria-label="Download format"
                className="flex items-center rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
              >
                <span className="px-2 text-xs text-zinc-500">Format:</span>
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
                          ? "bg-orange-600 text-white"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {format.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={!file || isBusy}
                onClick={runOptimize}
                className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? "Applying..." : result ? "Apply preset again" : "Apply preset"}
              </button>
              {isBusy ? (
                <button
                  type="button"
                  onClick={cancelOptimize}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>
              ) : null}
              {result ? (
                <a
                  href={result.objectUrl}
                  download={`${fileNameBase}-converted.${downloadExtension}`}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Download {downloadFormat === "image/png" ? "PNG" : "WebP"}
                </a>
              ) : null}
            </div>
          </div>

          {isBusy ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-sm">
                <span
                  role="status"
                  className="font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Applying preset...
                </span>
                <span className="text-zinc-500">{progress}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Conversion progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
              >
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          {phase === "canceled" || (error != null && phase !== "processing") ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {phase === "canceled" ? "Conversion canceled." : error}
            </p>
          ) : null}
        </section>

        {/* Preview + right panels share the leftover height */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        {/* Large zoomable preview */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Scroll or pinch to zoom, drag to pan.
              </p>
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1">
            {result ? (
              <ZoomPreview
                src={result.objectUrl}
                altImage="Converted image preview"
                label="Converted image"
                detail={`${result.width} x ${result.height} · ${formatBytes(result.bytes)}`}
                onFullscreen={(src, label, detail) =>
                  openLightbox(src, label, detail)
                }
              />
            ) : file ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 text-center dark:border-zinc-700">
                <span className="grid size-12 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
                  <svg
                    className="size-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </svg>
                </span>
                <p className="max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Click Apply preset to see the result here.
                </p>
              </div>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 text-center dark:border-zinc-700">
                <span className="grid size-12 place-items-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950">
                  <svg
                    className="size-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </svg>
                </span>
                <p className="max-w-xs text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                  Upload an image to preview it here.
                </p>
              </div>
            )}
          </div>
        </section>

          {/* Right: presets + premium, same height as the preview */}
          <aside className="flex w-full flex-col gap-4 lg:w-[36rem] lg:min-h-0 lg:shrink-0 lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Presets</h2>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
              Free
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            One-click PSX conversions.
          </p>
          <div className="mt-4 grid min-h-0 flex-1 auto-rows-max content-start gap-2 overflow-y-auto">
            {FREE_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
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
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          aria-label="Premium settings"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Premium</h2>
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

          <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
            <fieldset disabled={!isPremium} className="space-y-4">
              <legend className="sr-only">Premium settings</legend>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
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
                    !isPremium || settings.dithering === "none"
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

              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                My presets
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Save the current settings under a name and reuse them anytime.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Preset name"
                  maxLength={60}
                  aria-label="Preset name"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-orange-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="shrink-0 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-orange-600"
                >
                  Save
                </button>
              </div>
              {customPresets.length > 0 && isPremium ? (
                <ul className="mt-3 space-y-2">
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
                          setActivePresetId(null);
                        }}
                        className="text-sm font-medium text-zinc-700 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:text-zinc-50 dark:disabled:hover:text-zinc-300"
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        aria-label={`Delete preset ${preset.name}`}
className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-zinc-800"
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
                <p className="mt-3 text-sm text-zinc-500">No custom presets yet.</p>
              )}
              </div>
            </fieldset>
          </div>
        </section>
        </aside>
        </div>
      </div>

      {/* Zoomable lightbox */}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.label}
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur"
        >
          <div className="flex items-center gap-4 border-b border-white/10 bg-zinc-950/95 px-4 py-3">
            <span className="min-w-0 truncate text-sm font-medium text-zinc-100">
              {lightbox.label}
            </span>
            {lightbox.detail ? (
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">
                {lightbox.detail}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() =>
                  setZoom((current) => Math.max(0.1, current / 1.25))
                }
                className="grid size-8 place-items-center rounded-lg bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </button>
              <span className="w-14 text-center text-xs tabular-nums text-zinc-300">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() =>
                  setZoom((current) => Math.min(16, current * 1.25))
                }
                className="grid size-8 place-items-center rounded-lg bg-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </button>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <button
                type="button"
                aria-label="Fit to screen"
                onClick={() => fitLightbox()}
                className="grid h-8 place-items-center rounded-lg bg-zinc-800 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                Fit
              </button>
              <button
                type="button"
                aria-label="Zoom to 100 percent"
                onClick={() => setZoom(1)}
                className="grid h-8 place-items-center rounded-lg bg-zinc-800 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
              >
                100%
              </button>
              <button
                type="button"
                aria-label="Close preview"
                onClick={closeLightbox}
                className="ml-1 grid size-8 place-items-center rounded-lg bg-white/10 text-zinc-200 transition-colors hover:bg-white/20"
              >
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div
            ref={lightboxRef}
            className="flex-1 cursor-grab touch-none overflow-auto p-6 active:cursor-grabbing"
            onPointerDown={(event) => {
              const scroller = lightboxRef.current;
              if (!scroller) {
                return;
              }
              scroller.setPointerCapture(event.pointerId);
              dragRef.current = {
                startX: event.clientX,
                startY: event.clientY,
                scrollLeft: scroller.scrollLeft,
                scrollTop: scroller.scrollTop,
              };
            }}
            onPointerMove={(event) => {
              const scroller = lightboxRef.current;
              const drag = dragRef.current;
              if (!scroller || !drag) {
                return;
              }
              scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
              scroller.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          >
            <img
              src={lightbox.src}
              alt={lightbox.label}
              draggable={false}
              className="min-w-0"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            />
          </div>

          <p className="border-t border-white/10 bg-zinc-950/95 px-4 py-2 text-center text-xs text-zinc-500">
            Scroll to zoom · drag to pan · Esc to close
          </p>
        </div>
      ) : null}
    </div>
  );
}