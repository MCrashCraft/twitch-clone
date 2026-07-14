import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signIn } from "@/actions/auth";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  if (await getSession()) redirect("/");
  const next = searchParams.next ?? "/";

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-bold">Welcome back</h1>
        <p className="mb-6 text-sm text-bud-muted">
          Sign in to upload, like, and join the sesh.
        </p>
        <AuthForm
          action={signIn}
          submitLabel="Sign in"
          next={next}
          fields={[
            {
              name: "identifier",
              label: "Username or email",
              type: "text",
              autoComplete: "username",
            },
            {
              name: "password",
              label: "Password",
              type: "password",
              autoComplete: "current-password",
            },
          ]}
        />
        <p className="mt-4 text-center text-sm text-bud-muted">
          New here?{" "}
          <Link href="/sign-up" className="text-bud-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
