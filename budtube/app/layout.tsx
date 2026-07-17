import type { Metadata } from "next";
import { Navbar } from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BudTube — 420-Friendly Gaming Videos",
    template: "%s | BudTube",
  },
  description:
    "Watch people play games. A 420-friendly gaming video community for adults 21+.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-bud-border bg-bud-surface px-4 py-6 text-center text-xs text-bud-muted">
          <p>
            BudTube is for adults 21+ in places where cannabis is legal. Nothing
            here is medical or legal advice. Game (and everything else)
            responsibly.
          </p>
          <p className="mt-2">
            <a href="/support" className="text-bud-primary hover:underline">
              Contact support
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
