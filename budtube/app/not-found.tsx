import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-5xl" aria-hidden>
        🌫️
      </p>
      <h1 className="mt-4 text-2xl font-bold">Whoa… this page is gone</h1>
      <p className="mt-2 text-bud-muted">
        Whatever was here has vanished into the haze.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Back to the couch
      </Link>
    </div>
  );
}
