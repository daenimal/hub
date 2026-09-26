import { ToolCard } from "@/components/tool-card";
import { toolBadge, tools } from "@/lib/tools/registry";

const HIGHLIGHTS = [
  {
    title: "Free forever",
    description: "Every tool is free to use, no accounts or strings attached.",
  },
  {
    title: "Private by design",
    description: "Your images stay on your device and are never uploaded.",
  },
  {
    title: "Made for creators",
    description:
      "Console-accurate textures for game art, 3D pipelines, and demoscene.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 lg:min-h-[calc(100vh-4rem)] lg:flex-row lg:items-start lg:gap-14 lg:py-12">
      <section className="lg:sticky lg:top-24 lg:w-[400px] lg:shrink-0">
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300">
          Micro tools
        </span>
        <h1 className="mt-4 max-w-md text-4xl font-bold tracking-tight sm:text-5xl">
          Micro utilities for creators & developers
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400">
          A personal collection of fast, free tools for developers, 3D artists,
          and creators.
        </p>
        <ul className="mt-8 grid max-w-md gap-5">
          {HIGHLIGHTS.map((highlight) => (
            <li key={highlight.title} className="flex gap-3">
              <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                <svg
                  className="size-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
              </span>
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {highlight.title}.
                </span>{" "}
                {highlight.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
        {tools.map((tool, index) => (
          <ToolCard
            key={tool.slug}
            title={tool.title}
            description={tool.description}
            badge={toolBadge(tool.status)}
            href={tool.href}
            icon={tool.icon}
            featured={index === 0}
            className={index === 0 ? "sm:col-span-2" : undefined}
          />
        ))}
      </section>
    </div>
  );
}