import { ToolCard } from "@/components/tool-card";
import { toolBadge, tools } from "@/lib/tools/registry";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <section className="flex flex-col items-center pb-12 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Micro utilities for creators & developers
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          A personal collection of fast, powerful, client-side mini tools.
          No uploads to a server: everything runs in your browser.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard
            key={tool.slug}
            title={tool.title}
            description={tool.description}
            badge={toolBadge(tool.status)}
            href={tool.href}
            icon={tool.icon}
          />
        ))}
      </section>
    </div>
  );
}