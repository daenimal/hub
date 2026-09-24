import { ToolCard } from "@/components/tool-card";

const comingSoonTools = [
  {
    title: "PNG Compressor",
    description:
      "Optimize and compress PNG images locally in the browser, no external services.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
        />
      </svg>
    ),
  },
  {
    title: "Palette Extractor",
    description:
      "Auto-extract dominant color palettes from any image or texture.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3c.3.4.5.8.5 1.2 0 .6-.4 1-1 1Z"
        />
        <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
        <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
        <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Normal Map Generator",
    description:
      "Generate normal maps and height maps from 2D images for PBR materials and game engines.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 20.25 20.25 3.75M3.75 3.75h6m-6 6v.75m12 .75 2.25-2.25m-6-6 2.25 2.25"
        />
      </svg>
    ),
  },
  {
    title: "Dithering Studio",
    description:
      "Apply dithering algorithms (Bayer, Floyd-Steinberg) to images for a retro look.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 8.25h16.5M3.75 15.75h16.5M12 3.75v16.5M8.25 16.5A4.5 4.5 0 0 1 12 12a4.5 4.5 0 0 1 3.75 4.5"
        />
      </svg>
    ),
  },
  {
    title: "ASCII Converter",
    description:
      "Turn photos and textures into interactive ASCII art with adjustable detail levels.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 6h12M6 12h12M6 18h8"
        />
      </svg>
    ),
  },
  {
    title: "WebP Optimizer",
    description:
      "Cut the weight of images and textures by converting to WebP/AVIF with quality control.",
    badge: "Coming Soon",
    icon: (
      <svg
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 12h15m-6.75-6.75 6.75 6.75-6.75 6.75"
        />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <section className="flex flex-col items-center pb-12 text-center">
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
          In-browser tools, zero server costs
        </span>
        <h1 className="mt-6 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Micro utilities for creators & developers
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          A personal collection of fast, powerful, client-side mini tools.
          No uploads to a server: everything runs in your browser.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard
          title="Texture / Retro-Style Optimizer"
          description="Cut texture weight and apply a retro style (limited palettes, dithering), processing pixels in a Web Worker without blocking the UI."
          badge="In development"
          href="/tools/texture-optimizer"
          icon={
            <svg
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3c.3.4.5.8.5 1.2 0 .6-.4 1-1 1Z"
              />
              <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
              <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
              <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
            </svg>
          }
        />
        {comingSoonTools.map((tool) => (
          <ToolCard key={tool.title} {...tool} />
        ))}
      </section>
    </div>
  );
}