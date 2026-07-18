import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { ProfileForm, PasswordForm } from "@/components/settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/settings");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-bud-muted">
          @{user.username}
          {user.idVerified && (
            <span className="ml-2 rounded-full bg-bud-accent/15 px-2 py-0.5 text-xs font-medium text-bud-accent">
              ID verified
            </span>
          )}
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Profile</h2>
        <ProfileForm
          initialEmail={user.email}
          initialBio={user.bio ?? ""}
        />
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
