import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isOwner } from "@/lib/roles";
import { isDiditConfigured, monthlyUsage, monthlyCap } from "@/lib/didit";
import { RoleToggleButton } from "@/components/role-toggle-button";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const current = await getCurrentUser();
  if (!isOwner(current?.role)) notFound();

  const [users, diditUsed] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { videos: true, subscribers: true } } },
    }),
    isDiditConfigured() ? monthlyUsage() : Promise.resolve(0),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">Site admin</h1>
      <p className="mb-6 text-sm text-bud-muted">
        Signed in as the owner, @{current!.username}
      </p>

      <div className="card mb-6 p-4 text-sm">
        <p className="font-semibold">ID verification (Didit)</p>
        {isDiditConfigured() ? (
          <p className="text-bud-muted">
            {diditUsed} / {monthlyCap()} checks used this month (API cap —
            free tier is 500). Past the cap, the age gate falls back to
            date-of-birth entry.
          </p>
        ) : (
          <p className="text-bud-muted">
            Not configured — set DIDIT_API_KEY and DIDIT_WORKFLOW_ID in
            .env to enable ID document verification on the age gate.
          </p>
        )}
      </div>

      <ul className="card divide-y divide-bud-border">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                <Link
                  href={`/channel/${user.username}`}
                  className="hover:text-bud-primary"
                >
                  @{user.username}
                </Link>{" "}
                {user.role !== "USER" && (
                  <span className="rounded-full bg-bud-primary/15 px-2 py-0.5 text-xs font-medium text-bud-primary">
                    {user.role === "OWNER" ? "Owner" : "Admin"}
                  </span>
                )}{" "}
                {user.idVerified && (
                  <span className="rounded-full bg-bud-accent/15 px-2 py-0.5 text-xs font-medium text-bud-accent">
                    ID verified
                  </span>
                )}
              </p>
              <p className="text-xs text-bud-muted">
                {user.email} · {user._count.videos} video
                {user._count.videos === 1 ? "" : "s"} ·{" "}
                {user._count.subscribers} subscriber
                {user._count.subscribers === 1 ? "" : "s"}
              </p>
            </div>
            {user.role !== "OWNER" && (
              <RoleToggleButton
                userId={user.id}
                isAdmin={user.role === "ADMIN"}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
