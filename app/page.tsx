import { ToolCard } from "@/components/tool-card";

const comingSoonTools = [
  {
    title: "Compressore PNG",
    description:
      "Ottimizza e comprime immagini PNG prescindendo da servizi esterni, tutto in locale nel browser.",
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
    title: "Estrattore Palette",
    description:
      "Ricava automaticamente le palette colore dominanti da qualsiasi immagine o texture.",
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
    title: "Generatore Normal Map",
    description:
      "Genera normal map e height map da immagini 2D per materiali PBR ed engine di gioco.",
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
    title: "Studio Dithering",
    description:
      "Applica algoritmi di dithering (Bayer, Floyd-Steinberg) alle immagini per look retrò.",
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
    title: "Convertitore ASCII",
    description:
      "Trasforma foto e texture in arte ASCII interattiva con livelli di dettaglio regolabili.",
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
    title: "Ottimizzatore WebP",
    description:
      "Riduci il peso di immagini e texture convertendole in WebP/AVIF con controllo qualità.",
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
          Strumenti in-browser, zero costi di server
        </span>
        <h1 className="mt-6 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Micro utility per creatori e sviluppatori
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Una raccolta personale di mini-strumenti veloci, potenti e lato-client.
          Nessun upload a server: tutto gira nel tuo browser.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard
          title="Ottimizzatore di Texture / Stile Retrò"
          description="Riduci il peso delle texture e applica stile retrò (palette limitate, dithering) elaborando i pixel in un Web Worker senza bloccare la UI."
          badge="In sviluppo"
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