import type { Metadata } from "next";

import { OptimizerUI } from "@/components/tools/texture-optimizer/optimizer-ui";

export const metadata: Metadata = {
  title: "Texture",
  description:
    "Optimize game textures in your browser: downscale, quantize colors, and apply dithering without uploading your files.",
};

export default function TextureOptimizerPage() {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-4 py-4 sm:px-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:overflow-hidden lg:py-5">
      <h1 className="sr-only">Texture optimizer</h1>
      <OptimizerUI />
    </div>
  );
}