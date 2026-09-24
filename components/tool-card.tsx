import Link from "next/link";
import type { ReactNode } from "react";

type ToolCardProps = {
  title: string;
  description: string;
  badge: string;
  href?: string;
  icon: ReactNode;
};

export function ToolCard({
  title,
  description,
  badge,
  href,
  icon,
}: ToolCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="grid size-11 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {icon}
        </div>
        <span
          className={
            href
              ? "rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300"
              : "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
          }
        >
          {badge}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {description}
      </p>
    </>
  );

  const className =
    "group flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <div className={`${className} opacity-70 dark:opacity-60`} aria-disabled>
      {content}
    </div>
  );
}