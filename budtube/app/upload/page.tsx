"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

export default function UploadPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    setProgress(0);

    // XMLHttpRequest instead of fetch for upload progress events —
    // phone videos over slow links can take a while.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.videoId) {
        router.push(`/watch/${xhr.response.videoId}`);
      } else {
        setError(xhr.response?.error ?? "Upload failed. Try again.");
        setPending(false);
        setProgress(null);
      }
    };

    xhr.onerror = () => {
      setError("Upload failed. Check your connection and try again.");
      setPending(false);
      setProgress(null);
    };

    xhr.send(new FormData(event.currentTarget));
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-bold">Upload a video</h1>
      <p className="mb-6 text-sm text-bud-muted">
        MP4, WebM, Ogg, MOV, M4V, or 3GP — up to 500 MB. Thumbnail optional
        (JPEG/PNG/WebP).
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
            accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-m4v,video/3gpp,.mp4,.webm,.ogv,.mov,.m4v,.3gp"
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

        {pending && progress !== null && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-bud-raised">
              <div
                className="h-full rounded-full bg-bud-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-bud-muted">
              {progress < 100
                ? `Uploading… ${progress}%`
                : "Processing… almost there"}
            </p>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Uploading… hang tight" : "Upload"}
        </button>
      </form>
    </div>
  );
}
