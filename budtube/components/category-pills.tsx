import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

export function CategoryPills({ active }: { active?: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <Link
        href="/"
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
          !active
            ? "bg-bud-primary text-bud-bg"
            : "border border-bud-border bg-bud-surface text-zinc-300 hover:bg-bud-raised"
        }`}
      >
        All
      </Link>
      {CATEGORIES.map((category) => (
        <Link
          key={category.slug}
          href={`/?category=${category.slug}`}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
            active === category.slug
              ? "bg-bud-primary text-bud-bg"
              : "border border-bud-border bg-bud-surface text-zinc-300 hover:bg-bud-raised"
          }`}
        >
          {category.emoji} {category.name}
        </Link>
      ))}
    </div>
  );
}
