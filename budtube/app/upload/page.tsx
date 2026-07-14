"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

export default function UploadPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed. Try again.");
        setPending(false);
        return;
      }
      router.push(`/watch/${data.videoId}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-bold">Upload a video</h1>
      <p className="mb-6 text-sm text-bud-muted">
        MP4, WebM, or Ogg — up to 500 MB. Thumbnail optional (JPEG/PNG/WebP).
      </p>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            maxLength={120}
            placeholder="Blazed & Confused: Elden Ring blind run pt. 3"
            className="input"
            required
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="mb-1 block text-sm font-medium"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            maxLength={5000}
            placeholder="What's happening in this one?"
            className="input resize-y"
          />
        </div>

        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium">
            Category
          </label>
          <select id="category" name="category" className="input" required>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.name}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="video" className="mb-1 block text-sm font-medium">
            Video file
          </label>
          <input
            id="video"
            name="video"
            type="file"
            accept="video/mp4,video/webm,video/ogg"
            className="input file:mr-3 file:rounded file:border-0 file:bg-bud-primaryDark file:px-3 file:py-1 file:text-sm file:font-semibold file:text-bud-bg"
            required
          />
        </div>

        <div>
          <label htmlFor="thumbnail" className="mb-1 block text-sm font-medium">
            Thumbnail <span className="text-bud-muted">(optional)</span>
          </label>
          <input
            id="thumbnail"
            name="thumbnail"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="input file:mr-3 file:rounded file:border-0 file:bg-bud-raised file:px-3 file:py-1 file:text-sm file:font-semibold file:text-zinc-200"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Uploading… hang tight" : "Upload"}
        </button>
      </form>
    </div>
  );
}
