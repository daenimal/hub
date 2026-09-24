import type { Metadata } from "next";

import { OptimizerUI } from "@/components/tools/texture-optimizer/optimizer-ui";

export const metadata: Metadata = {
  title: "Texture / Retro-Style Optimizer | MicroHub",
  description:
    "Cut texture weight and apply a retro style (limited palettes and dithering). Processing happens entirely in the browser, in a Web Worker.",
};

export default function TextureOptimizerPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <header className="pb-10">
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
          Tool 1
        </span>
        <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Texture / Retro-Style Optimizer
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Cut the weight of textures and images by applying color
          quantization and dithering for a retro look. No uploads to a server:
          pixels are processed locally via OffscreenCanvas in a Web Worker.
        </p>
      </header>

      <OptimizerUI />
    </div>
  );
}