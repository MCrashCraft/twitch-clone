import Image from "next/image";
import type { Metadata } from "next";
import { confirmAge } from "@/actions/age-gate";

export const metadata: Metadata = { title: "Are you 21+?" };

export default function AgeGatePage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/";

  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="card p-8">
        <Image
          src="/logo.svg"
          alt="BudTube"
          width={64}
          height={64}
          className="mx-auto mb-4"
        />
        <h1 className="text-2xl font-bold">
          Bud<span className="text-bud-primary">Tube</span>
        </h1>
        <p className="mt-2 text-bud-muted">
          Watch people play games. 420-friendly.
        </p>
        <p className="mt-6 text-sm text-zinc-300">
          This site features cannabis-themed content and is intended for adults{" "}
          <span className="font-semibold text-bud-primary">21 and older</span>{" "}
          in places where cannabis is legal.
        </p>
        <form action={confirmAge} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn-primary w-full">
            I&apos;m 21 or older — let me in
          </button>
        </form>
        <a
          href="https://www.google.com"
          className="mt-3 block text-sm text-bud-muted hover:text-zinc-300"
        >
          I&apos;m under 21 — take me elsewhere
        </a>
      </div>
    </div>
  );
}
