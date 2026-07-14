export const CATEGORIES = [
  { name: "Stoner Shooters", slug: "stoner-shooters", emoji: "🎯" },
  { name: "Puff & Puzzle", slug: "puff-and-puzzle", emoji: "🧩" },
  { name: "High-Score RPGs", slug: "high-score-rpgs", emoji: "🗡️" },
  { name: "Couch Co-op & Chill", slug: "couch-co-op", emoji: "🛋️" },
  { name: "Speedruns & Sesh", slug: "speedruns", emoji: "⏱️" },
  { name: "Retro Rips", slug: "retro-rips", emoji: "🕹️" },
  { name: "Indie & Edibles", slug: "indie-and-edibles", emoji: "🍪" },
  { name: "Just Chatting 420", slug: "just-chatting-420", emoji: "💬" },
] as const;

export type Category = (typeof CATEGORIES)[number]["name"];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name) as string[];

export function isCategory(value: string): value is Category {
  return CATEGORY_NAMES.includes(value);
}

export function categoryBySlug(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}
