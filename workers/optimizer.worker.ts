export type DitheringAlgorithm = "none" | "floyd-steinberg" | "bayer" | "ordered";

export type OptimizeSettings = {
  maxWidth: number;
  maxHeight: number;
  quantizeColors: number;
  dithering: DitheringAlgorithm;
  /** 0..1 — how strongly the dithering pattern is applied. 0 = off. */
  ditherStrength: number;
};

export type OptimizeRequest = {
  type: "optimize";
  jobId: string;
  file: File;
  settings: OptimizeSettings;
};

export type PingRequest = {
  type: "ping";
  jobId: string;
};

export type CancelRequest = {
  type: "cancel";
  jobId: string;
};

export type OptimizerRequest = OptimizeRequest | PingRequest | CancelRequest;

export type ReadyResponse = {
  type: "ready";
  jobId: string;
};

export type ProgressResponse = {
  type: "progress";
  jobId: string;
  percent: number;
};

export type DoneResponse = {
  type: "done";
  jobId: string;
  output: ImageBitmap;
  outputWidth: number;
  outputHeight: number;
};

export type ErrorResponse = {
  type: "error";
  jobId: string;
  canceled?: boolean;
  message: string;
};

export type OptimizerResponse =
  | ReadyResponse
  | ProgressResponse
  | DoneResponse
  | ErrorResponse;

// Hard guardrails so a single huge image cannot exhaust worker memory.
const MAX_FILE_BYTES = 64 * 1024 * 1024; // 64 MB
const MAX_DECODE_PIXELS = 64 * 1024 * 1024; // ~8k x 8k before downscale
const MAX_PROCESS_PIXELS = 4_194_304; // 2048 x 2048 after downscale

const BAYER_8: number[][] = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

const ORDERED_4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const cancelledJobs = new Set<string>();

function post(message: OptimizerResponse, transfer?: Transferable[]): void {
  (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage(
    message,
    transfer ?? [],
  );
}

function buildColorHistogram(data: Uint8ClampedArray, step = 1): Map<number, number> {
  const histogram = new Map<number, number>();
  const pxCount = data.length / 4;
  for (let i = 0; i < pxCount; i += step) {
    const offset = i * 4;
    const key =
      ((data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]) >>> 0;
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  return histogram;
}

function channelRange(histogram: Map<number, number>, channel: 0 | 1 | 2): [number, number] {
  let min = 255;
  let max = 0;
  for (const key of histogram.keys()) {
    const value = (key >>> (16 - channel * 8)) & 0xff;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

type RGB = [number, number, number];

function splitByChannel(
  histogram: Map<number, number>,
  channel: 0 | 1 | 2,
  pivot: number,
): [Map<number, number>, Map<number, number>] {
  const left = new Map<number, number>();
  const right = new Map<number, number>();
  for (const [key, weight] of histogram) {
    const value = (key >>> (16 - channel * 8)) & 0xff;
    if (value < pivot) {
      left.set(key, weight);
    } else {
      right.set(key, weight);
    }
  }
  return [left, right];
}

function medianCut(histogram: Map<number, number>, targetColors: number): RGB[] {
  const boxes: Map<number, number>[] = [histogram];
  while (boxes.length < targetColors) {
    const box = boxes.shift();
    if (!box || box.size === 0) {
      break;
    }
    const ranges = [0, 1, 2].map((c) => {
      const [min, max] = channelRange(box, c as 0 | 1 | 2);
      return max - min;
    });
    const channel = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;

    // Median pivot on the histogram.
    const values: number[] = [];
    for (const key of box.keys()) {
      values.push((key >>> (16 - channel * 8)) & 0xff);
    }
    values.sort((a, b) => a - b);
    const pivot = values[Math.floor(values.length / 2)] ?? 128;

    const [left, right] = splitByChannel(box, channel, pivot);
    if (left.size === 0 || right.size === 0) {
      // Cannot split further; keep the box unsplit.
      boxes.unshift(box);
      break;
    }
    boxes.push(left, right);
    boxes.sort((a, b) => b.size - a.size);
  }

  return boxes.map((box) => {
    const r = channelRange(box, 0);
    const g = channelRange(box, 1);
    const b = channelRange(box, 2);
    return [
      Math.round((r[0] + r[1]) / 2),
      Math.round((g[0] + g[1]) / 2),
      Math.round((b[0] + b[1]) / 2),
    ] as RGB;
  });
}

function nearestColor(r: number, g: number, b: number, palette: RGB[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i][0] - r;
    const pg = palette[i][1] - g;
    const pb = palette[i][2] - b;
    const dist = pr * pr + pg * pg + pb * pb;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function applyFloydSteinberg(
  data: Uint8ClampedArray,
  width: number,
  palette: RGB[],
  strength: number,
  onRow?: (row: number) => void,
): void {
  const height = data.length / 4 / width;
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const idx = nearestColor(r, g, b, palette);
      const [pr, pg, pb] = palette[idx];
      const errR = (r - pr) * strength;
      const errG = (g - pg) * strength;
      const errB = (b - pb) * strength;

      data[i] = pr;
      data[i + 1] = pg;
      data[i + 2] = pb;

      const distribute = (xi: number, yi: number, factor: number) => {
        if (xi < 0 || yi < 0 || xi >= width || yi >= height) {
          return;
        }
        const j = (yi * width + xi) * 4;
        src[j] = clampByte(src[j] + errR * factor);
        src[j + 1] = clampByte(src[j + 1] + errG * factor);
        src[j + 2] = clampByte(src[j + 2] + errB * factor);
      };
      distribute(x + 1, y, 7 / 16);
      distribute(x - 1, y + 1, 3 / 16);
      distribute(x, y + 1, 5 / 16);
      distribute(x + 1, y + 1, 1 / 16);
    }
    onRow?.(y + 1);
  }
}

function applyPointDithering(
  data: Uint8ClampedArray,
  width: number,
  palette: RGB[],
  dithering: DitheringAlgorithm,
  strength: number,
): void {
  const height = data.length / 4 / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      let color: RGB;

      if (dithering === "bayer") {
        const threshold = BAYER_8[y % 8][x % 8] / 64;
        color = adjustColor(r, g, b, (threshold - 0.5) * 255 * 0.6 * strength);
      } else if (dithering === "ordered") {
        const matrix = ORDERED_4[y % 4][x % 4];
        color = adjustColor(r, g, b, ((matrix + 0.5) / 16 - 0.5) * 40 * strength);
      } else {
        color = [r, g, b];
      }

      const idx = nearestColor(color[0], color[1], color[2], palette);
      data[i] = palette[idx][0];
      data[i + 1] = palette[idx][1];
      data[i + 2] = palette[idx][2];
    }
  }
}

function adjustColor(r: number, g: number, b: number, delta: number): RGB {
  const luma = r * 0.299 + g * 0.587 + b * 0.114;
  const scale = luma === 0 ? 1 : (luma + delta) / luma;
  return [
    clampByte(Math.round(r * scale)),
    clampByte(Math.round(g * scale)),
    clampByte(Math.round(b * scale)),
  ];
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** Validates and clamps incoming settings; returns null when malformed. */
function normalizeSettings(settings: OptimizeSettings): OptimizeSettings | null {
  if (typeof settings !== "object" || settings === null) {
    return null;
  }
  const maxWidth = Math.round(Number(settings.maxWidth));
  const maxHeight = Math.round(Number(settings.maxHeight));
  const quantizeColors = Math.round(Number(settings.quantizeColors));
  const ditherStrength = Number(settings.ditherStrength);
  if (
    !Number.isFinite(maxWidth) ||
    !Number.isFinite(maxHeight) ||
    !Number.isFinite(quantizeColors) ||
    !Number.isFinite(ditherStrength)
  ) {
    return null;
  }
  const DITHERINGS: DitheringAlgorithm[] = [
    "none",
    "floyd-steinberg",
    "bayer",
    "ordered",
  ];
  if (!DITHERINGS.includes(settings.dithering)) {
    return null;
  }
  return {
    maxWidth: clampInt(maxWidth, 16, 2048),
    maxHeight: clampInt(maxHeight, 16, 2048),
    quantizeColors: clampInt(quantizeColors, 2, 256),
    dithering: settings.dithering,
    ditherStrength: clampNum(ditherStrength, 0, 1),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function runOptimize(request: OptimizeRequest): Promise<void> {
  const { jobId, file, settings } = request;

  if (file.size > MAX_FILE_BYTES) {
    post({
      type: "error",
      jobId,
      message: "Image file is too large (max 64 MB).",
    });
    return;
  }

  const normalized = normalizeSettings(settings);

  if (!normalized) {
    post({
      type: "error",
      jobId,
      message: "Invalid settings: the values are out of range.",
    });
    return;
  }

  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file);
  } catch {
    post({ type: "error", jobId, message: "Could not decode the image." });
    return;
  }

  if (cancelledJobs.has(jobId)) {
    source.close();
    return;
  }

  if (source.width * source.height > MAX_DECODE_PIXELS) {
    post({
      type: "error",
      jobId,
      message: "Image resolution is too high to process safely.",
    });
    source.close();
    return;
  }

  // Downscale to fit maxWidth/maxHeight, preserving aspect ratio.
  const scale = Math.min(
    1,
    normalized.maxWidth / source.width,
    normalized.maxHeight / source.height,
  );
  const outputWidth = Math.max(1, Math.round(source.width * scale));
  const outputHeight = Math.max(1, Math.round(source.height * scale));

  if (outputWidth * outputHeight > MAX_PROCESS_PIXELS) {
    post({
      type: "error",
      jobId,
      message: "Target resolution exceeds the processing limit (2048 x 2048).",
    });
    source.close();
    return;
  }

  if (cancelledJobs.has(jobId)) {
    source.close();
    return;
  }

  const canvas = new OffscreenCanvas(outputWidth, outputHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    post({ type: "error", jobId, message: "OffscreenCanvas 2D is unavailable." });
    source.close();
    return;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, outputWidth, outputHeight);
  source.close();

  const imageData = ctx.getImageData(0, 0, outputWidth, outputHeight);
  const data = imageData.data;

  // Sample every Nth pixel for the palette to keep median-cut fast.
  const sampleStep = Math.max(1, Math.floor((outputWidth * outputHeight) / 300_000));
  const histogram = buildColorHistogram(data, sampleStep);
  const palette = medianCut(histogram, normalized.quantizeColors);

  const reportProgress = (rowsDone: number) => {
    post({
      type: "progress",
      jobId,
      percent: Math.round((rowsDone / outputHeight) * 100),
    });
  };

  if (normalized.dithering === "floyd-steinberg") {
    if (cancelledJobs.has(jobId)) {
      return;
    }
    await applyFloydSteinberg(data, outputWidth, palette, normalized.ditherStrength, (row) => {
      if (cancelledJobs.has(jobId)) {
        throw new Error("Job cancelled.");
      }
      if (row % 8 === 0) {
        reportProgress(row);
      }
    });
    reportProgress(outputHeight);
  } else {
    // Process in horizontal bands so long jobs report progress and stay cancellable.
    const rowsPerBand = 64;
    for (let y = 0; y < outputHeight; y += rowsPerBand) {
      if (cancelledJobs.has(jobId)) {
        return;
      }
      const endY = Math.min(outputHeight, y + rowsPerBand);
      const band = new Uint8ClampedArray(data.subarray(y * outputWidth * 4, endY * outputWidth * 4));
      applyPointDithering(band, outputWidth, palette, normalized.dithering, normalized.ditherStrength);
      data.set(band, y * outputWidth * 4);
      reportProgress(endY);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const output = canvas.transferToImageBitmap();
  post(
    {
      type: "done",
      jobId,
      output,
      outputWidth,
      outputHeight,
    },
    [output],
  );
}

self.onmessage = (event: MessageEvent<OptimizerRequest>) => {
  const { jobId } = event.data;

  if (event.data.type === "ping") {
    post({ type: "ready", jobId } satisfies ReadyResponse);
    return;
  }

  if (event.data.type === "cancel") {
    cancelledJobs.add(jobId);
    post({ type: "error", jobId, canceled: true, message: "Job cancelled." } satisfies ErrorResponse);
    return;
  }

  if (event.data.type === "optimize") {
    runOptimize(event.data).catch((error: unknown) => {
      if (!cancelledJobs.has(jobId)) {
        const message =
          error instanceof Error ? error.message : "Optimization failed.";
        post({ type: "error", jobId, message } satisfies ErrorResponse);
      }
    });
  }
};

export {};