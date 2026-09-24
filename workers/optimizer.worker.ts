export type DitheringAlgorithm = "none" | "floyd-steinberg" | "bayer" | "ordered";

export type OptimizeSettings = {
  maxWidth: number;
  maxHeight: number;
  quantizeColors: number;
  dithering: DitheringAlgorithm;
};

export type OptimizeRequest = {
  type: "optimize";
  jobId: string;
  imageBitmap: ImageBitmap;
  settings: OptimizeSettings;
};

export type PingRequest = {
  type: "ping";
  jobId: string;
};

export type OptimizerRequest = OptimizeRequest | PingRequest;

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
};

export type ErrorResponse = {
  type: "error";
  jobId: string;
  message: string;
};

export type OptimizerResponse =
  | ReadyResponse
  | ProgressResponse
  | DoneResponse
  | ErrorResponse;

self.onmessage = (event: MessageEvent<OptimizerRequest>) => {
  const { jobId } = event.data;

  if (event.data.type === "ping") {
    postMessage({ type: "ready", jobId } satisfies ReadyResponse);
    return;
  }

  if (event.data.type === "optimize") {
    // TODO(feat/texture-optimizer): receive the ImageBitmap transferable and run:
    //  1. downscaling via OffscreenCanvas to maxWidth/maxHeight
    //  2. color quantization to `quantizeColors`
    //  3. dithering pass using `dithering`
    //  4. post the resulting OffscreenCanvas.transferToImageBitmap() back as DoneResponse
    postMessage({
      type: "error",
      jobId,
      message: "Il pipeline di ottimizzazione non è ancora implementato.",
    } satisfies ErrorResponse);
  }
};

export {};