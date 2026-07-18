import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { signUp } from "@/actions/auth";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  if (await getSession()) redirect("/");
  const next = searchParams.next ?? "/";

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-xl font-bold">Join BudTube</h1>
        <p className="mb-6 text-sm text-bud-muted">
          Free account. Upload gameplay, follow channels, hang out.
        </p>
        <AuthForm
          action={signUp}
          submitLabel="Create account"
          next={next}
          fields={[
            {
              name: "username",
              label: "Username",
              type: "text",
              placeholder: "blazeitplays",
              autoComplete: "username",
            },
            {
              name: "email",
              label: "Email",
              type: "email",
              placeholder: "you@example.com",
              autoComplete: "email",
            },
            {
              name: "dob",
              label: "Date of birth (must be 21+)",
              type: "date",
              autoComplete: "bday",
            },
            {
              name: "password",
              label: "Password (8+ characters)",
              type: "password",
              autoComplete: "new-password",
            },
          ]}
        />
        <p className="mt-4 text-center text-sm text-bud-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-bud-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
