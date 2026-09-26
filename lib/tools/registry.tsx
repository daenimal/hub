import type { ReactNode } from "react";

export type ToolStatus = "available" | "in-development" | "coming-soon";

export type Tool = {
  slug: string;
  title: string;
  description: string;
  status: ToolStatus;
  href?: string;
  icon: ReactNode;
};

const paletteIcon = (className = "size-5") => (
  <svg
    className={className}
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
);

const codeIcon = () => (
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
);

const waveIcon = () => (
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
);

const ditherIcon = () => (
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
);

const asciiIcon = () => (
  <svg
    className="size-5"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.8}
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12M6 12h12M6 18h8" />
  </svg>
);

const webpIcon = () => (
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
);

export const tools: Tool[] = [
  {
    slug: "texture-optimizer",
    title: "Texture",
    description:
      "Convert textures into original PlayStation formats: 256×256, 16 or 256 colors, 15-bit output.",
    status: "available",
    href: "/tools/texture-optimizer",
    icon: paletteIcon(),
  },
  {
    slug: "png-compressor",
    title: "PNG Compressor",
    description:
      "Reduce PNG file sizes in a few clicks.",
    status: "coming-soon",
    icon: codeIcon(),
  },
  {
    slug: "palette-extractor",
    title: "Palette Extractor",
    description:
      "Pull the dominant colors out of any image.",
    status: "coming-soon",
    icon: paletteIcon(),
  },
  {
    slug: "normal-map-generator",
    title: "Normal Map Generator",
    description:
      "Turn flat images into normal and height maps for 3D looks.",
    status: "coming-soon",
    icon: waveIcon(),
  },
  {
    slug: "dithering-studio",
    title: "Dithering Studio",
    description:
      "Give textures authentic PSX-style dithering and banding.",
    status: "coming-soon",
    icon: ditherIcon(),
  },
  {
    slug: "ascii-converter",
    title: "ASCII Converter",
    description:
      "Turn photos and textures into ASCII art.",
    status: "coming-soon",
    icon: asciiIcon(),
  },
  {
    slug: "webp-optimizer",
    title: "WebP Optimizer",
    description:
      "Convert images to WebP for smaller file sizes.",
    status: "coming-soon",
    icon: webpIcon(),
  },
];

export function getTool(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug);
}

export function toolBadge(status: ToolStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "in-development":
      return "In development";
    case "coming-soon":
      return "Coming Soon";
  }
}