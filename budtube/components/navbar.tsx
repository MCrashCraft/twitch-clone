import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/actions/auth";

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-bud-border bg-bud-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/logo.svg" alt="BudTube" width={28} height={28} />
          <span className="text-lg font-bold tracking-tight">
            Bud<span className="text-bud-primary">Tube</span>
          </span>
        </Link>

        <form action="/search" className="mx-auto w-full max-w-md">
          <input
            type="search"
            name="q"
            placeholder="Search videos…"
            className="input"
            aria-label="Search videos"
          />
        </form>

        <nav className="flex shrink-0 items-center gap-2">
          {user ? (
            <>
              <Link href="/upload" className="btn-primary">
                Upload
              </Link>
              <Link
                href={`/channel/${user.username}`}
                className="hidden text-sm font-medium text-zinc-300 hover:text-bud-primary sm:block"
              >
                @{user.username}
              </Link>
              <Link
                href="/dashboard"
                className="hidden text-sm text-bud-muted hover:text-zinc-200 sm:block"
              >
                Dashboard
              </Link>
              <Link
                href="/settings"
                className="hidden text-sm text-bud-muted hover:text-zinc-200 sm:block"
              >
                Settings
              </Link>
              {user.role === "OWNER" && (
                <Link
                  href="/admin"
                  className="hidden text-sm font-medium text-bud-accent hover:text-purple-300 sm:block"
                >
                  Admin
                </Link>
              )}
              <form action={signOut}>
                <button type="submit" className="btn-secondary">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn-secondary">
                Sign in
              </Link>
              <Link href="/sign-up" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
