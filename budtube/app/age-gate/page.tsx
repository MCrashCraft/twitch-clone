import Image from "next/image";
import type { Metadata } from "next";
import { AgeGateForm } from "@/components/age-gate-form";

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
          in places where cannabis is legal. Verify your date of birth to
          enter.
        </p>
        <AgeGateForm next={next} />
        <a
          href="https://www.google.com"
          className="mt-4 block text-sm text-bud-muted hover:text-zinc-300"
        >
          I&apos;m under 21 — take me elsewhere
        </a>
      </div>
    </div>
  );
}
