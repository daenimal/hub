import Link from "next/link";
import type { ReactNode } from "react";

type ToolCardProps = {
  title: string;
  description: string;
  badge: string;
  href?: string;
  icon: ReactNode;
  featured?: boolean;
  className?: string;
};

export function ToolCard({
  title,
  description,
  badge,
  href,
  icon,
  featured = false,
  className = "",
}: ToolCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div
          className={`grid place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 ${
            featured ? "size-14" : "size-11"
          }`}
        >
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
      <div className="flex flex-1 flex-col justify-start">
        <h3
          className={`mt-4 font-semibold tracking-tight ${
            featured ? "text-xl" : "text-base"
          }`}
        >
          {title}
        </h3>
        <p
          className={`mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400 ${
            featured ? "max-w-xl" : ""
          }`}
        >
          {description}
        </p>
      </div>
      {featured && href ? (
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400">
          Open tool
          <svg
            className="size-4 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
            />
          </svg>
        </span>
      ) : null}
    </>
  );

  const baseClassName =
    "group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition-all dark:border-zinc-800 dark:bg-zinc-900";
  const interactiveClassName = href
    ? " hover:-translate-y-0.5 hover:shadow-md"
    : " opacity-70 dark:opacity-60";
  const cardClassName = `${baseClassName}${interactiveClassName} ${
    featured
      ? "border-orange-200 sm:flex-row sm:items-start sm:gap-7 dark:border-orange-900/60"
      : ""
  } ${className}`;

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClassName} aria-disabled>
      {content}
    </div>
  );
}