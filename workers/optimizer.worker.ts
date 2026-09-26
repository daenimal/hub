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
    // Skip fully transparent pixels: their RGB is typically garbage or black
    // and would pollute the palette with invisible colors.
    if (data[offset + 3] < 8) {
      continue;
    }
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

/**
 * Rounds an 8-bit channel to the nearest 5-bit level. The PSX renders every
 * color as 15-bit (BGR 5:5:5), so a palette with only 5-bit-representable
 * entries is exactly what the console can display.
 */
function snapTo15bit(value: number): number {
  return Math.round((Math.round((value * 31) / 255) * 255) / 31);
}

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
      snapTo15bit(Math.round((r[0] + r[1]) / 2)),
      snapTo15bit(Math.round((g[0] + g[1]) / 2)),
      snapTo15bit(Math.round((b[0] + b[1]) / 2)),
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
      // Leave fully transparent pixels untouched and prevent error diffusion
      // through them, which would bleed colors into the visible edges.
      if (src[i + 3] < 8) {
        continue;
      }
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
        if (src[j + 3] < 8) {
          return;
        }
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
      if (data[i + 3] < 8) {
        continue;
      }
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

/**
 * Reads pixel dimensions straight from the file header (PNG/GIF/WebP/JPEG),
 * without decoding the full image. Returns null for unknown formats.
 * JPEG frames also report the EXIF orientation so callers can account for
 * rotated/transposed frames BEFORE the decoder applies it.
 */
function toDims(width: number, height: number, orientation: number | null = null): { width: number; height: number; orientation: number | null } | null {
  return width > 0 && height > 0 && width < 2 ** 26 && height < 2 ** 26
    ? { width, height, orientation }
    : null;
}

/**
 * Reads the exact-orientation tag (1..8) from the EXIF APP1 segment of a
 * JPEG. Values 5..8 swap the frame's width/height once applied.
 */
function readJpegOrientation(headBytes: Uint8Array): number | null {
  let offset = 2;
  while (offset + 4 < headBytes.length) {
    if (headBytes[offset] !== 0xff) {
      return null;
    }
    const marker = headBytes[offset + 1];
    const segmentLength = (headBytes[offset + 2] << 8) | headBytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > headBytes.length) {
      return null;
    }
    if (marker === 0xe1) {
      const start = offset + 4;
      const isExif =
        headBytes[start] === 0x45 && headBytes[start + 1] === 0x78 &&
        headBytes[start + 2] === 0x69 && headBytes[start + 3] === 0x66 &&
        headBytes[start + 4] === 0x00 && headBytes[start + 5] === 0x00;
      if (isExif) {
        const orientation = parseExifOrientation(
          headBytes.subarray(start + 6, offset + 2 + segmentLength),
        );
        if (orientation) {
          return orientation;
        }
      }
    }
    offset += 2 + segmentLength;
  }
  return null;
}

/** Parses the TIFF directory inside EXIF for tag 0x0112 (orientation). */
function parseExifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 12) {
    return null;
  }
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!littleEndian && !bigEndian) {
    return null;
  }
  const u16 = (o: number) =>
    littleEndian ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1];
  const u32 = (o: number) =>
    littleEndian
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : (((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0);
  if (u16(2) !== 42) {
    return null;
  }
  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) {
    return null;
  }
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) {
      return null;
    }
    if (u16(entry) === 0x0112) {
      // Orientation is a SHORT (type 3) holding one value.
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

async function readHeaderDimensions(file: Blob): Promise<{ width: number; height: number; orientation: number | null } | null> {
  const headBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const ascii = (i: number, len: number) =>
    String.fromCharCode(...Array.from(headBytes.subarray(i, i + len)));

  try {
    // PNG: 8-byte signature, then IHDR width/height (big-endian at 16/20).
    if (
      headBytes.length >= 24 &&
      headBytes[0] === 0x89 && headBytes[1] === 0x50 &&
      headBytes[2] === 0x4e && headBytes[3] === 0x47
    ) {
      return toDims(readUint32BE(headBytes, 16), readUint32BE(headBytes, 20));
    }

    // GIF: "GIF87a"/"GIF89a", width/height little-endian at 6/8.
    if (headBytes.length >= 10 && ascii(0, 3) === "GIF") {
      return toDims(
        headBytes[6] | (headBytes[7] << 8),
        headBytes[8] | (headBytes[9] << 8),
      );
    }

    // WebP: "RIFF....WEBP" container. Only the lossless (VP8L) and lossy
    // (VP8) formats have dimensions within the first bytes.
    if (
      headBytes.length >= 30 &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 4) === "WEBP"
    ) {
      const tag = ascii(12, 4);
      if (tag === "VP8L" && headBytes.length >= 25) {
        // 1-byte signature then 4 bytes: 14-bit width-1, 14-bit height-1.
        const bits = readUint32LE(headBytes, 21);
        return toDims((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      if (tag === "VP8 " && headBytes.length >= 30) {
        // Payload: 3-byte frame tag, 3-byte start code (0x9d 0x01 0x2a),
        // then width/height as 14-bit little-endian.
        return toDims(
          (headBytes[26] | ((headBytes[27] & 0x3f) << 8)) & 0x3fff,
          (headBytes[28] | ((headBytes[29] & 0x3f) << 8)) & 0x3fff,
        );
      }
    }

    // JPEG: scan the marker segments for SOF0..SOF15 height/width.
    if (headBytes.length >= 4 && headBytes[0] === 0xff && headBytes[1] === 0xd8) {
      const softTable: Record<number, boolean> = {
        0xc0: true, 0xc1: true, 0xc2: true, 0xc3: true,
        0xc5: true, 0xc6: true, 0xc7: true,
        0xc9: true, 0xca: true, 0xcb: true,
        0xcd: true, 0xce: true, 0xcf: true,
      };
      let offset = 2;
      while (offset + 9 < headBytes.length) {
        if (headBytes[offset] !== 0xff) {
          break;
        }
        const marker = headBytes[offset + 1];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) {
          break;
        }
        const segmentLength = (headBytes[offset + 2] << 8) | headBytes[offset + 3];
        if (softTable[marker]) {
          // Precision(1) then height(2) then width(2), big-endian.
          const width = (headBytes[offset + 7] << 8) | headBytes[offset + 8];
          const height = (headBytes[offset + 5] << 8) | headBytes[offset + 6];
          return toDims(width, height, readJpegOrientation(headBytes));
        }
        offset += 2 + segmentLength;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
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
    // When the header already tells us the pixel count is unsafe, bail out
    // before decoding, avoiding a full-buffer allocation (~4 bytes/px).
    const dims = await readHeaderDimensions(file);
    if (dims && dims.width * dims.height > MAX_DECODE_PIXELS) {
      post({
        type: "error",
        jobId,
        message: "Image resolution is too high to process safely.",
      });
      return;
    }
    // When a downscale is needed, ask the decoder to resize natively (aspect
    // preserved) so the full original bitmap is never allocated in memory.
    // EXIF frames rotated by 90/270° (5..8) swap the stored width/height, and
    // `from-image` lets the decoder rotate before the resize, so compute the
    // resize from the rotated dimensions to avoid distortion.
    let options: ImageBitmapOptions | undefined;
    if (dims) {
      const rotated = dims.orientation !== null && dims.orientation >= 5;
      const dimsWidth = rotated ? dims.height : dims.width;
      const dimsHeight = rotated ? dims.width : dims.height;
      options = { imageOrientation: "from-image" };
      const scale = Math.min(
        1,
        normalized.maxWidth / dimsWidth,
        normalized.maxHeight / dimsHeight,
      );
      if (scale < 1) {
        options.resizeWidth = Math.max(1, Math.round(dimsWidth * scale));
        options.resizeHeight = Math.max(1, Math.round(dimsHeight * scale));
      }
    }
    source = await createImageBitmap(file, options);
  } catch {
    post({ type: "error", jobId, message: "Could not decode the image." });
    return;
  }

  if (cancelledJobs.has(jobId)) {
    source.close();
    return;
  }

  // Safety net for formats whose dimensions could not be read from the header
  // (e.g. JPEG): the guard cannot run before decode, so keep it here too.
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
    runOptimize(event.data)
      .catch((error: unknown) => {
        if (!cancelledJobs.has(jobId)) {
          const message =
            error instanceof Error ? error.message : "Optimization failed.";
          post({ type: "error", jobId, message } satisfies ErrorResponse);
        }
      })
      // Clean up the cancel marker once the job finally settles, so the set
      // does not grow without bound across many runs.
      .finally(() => {
        cancelledJobs.delete(jobId);
      });
  }
};

export {};